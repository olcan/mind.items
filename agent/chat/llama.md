#agent/chat/llama responds using OpenAI-style [chat completions](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) served by local [llama-server](https://github.com/ggml-org/llama.cpp) instances (tailnet-only, no auth; servers are manual-start via vault `bin/serve_model.sh`, see `docs/local_models.md` in the vault).

```js_input_removed
run_on_dependents()
```

```js:js_removed
// convert messages (in place) to llama-server (openai) format
// converts role _?agent -> assistant, keeps system messages inline
// deletes 'name' from non-tool messages and 'item' from all messages
// preserves messages w/o content (e.g. tool_calls parsed from message blocks)
function convert_messages(messages, config) {
  each(messages, msg => {
    if (msg.role.match(/_?agent/)) msg.role = 'assistant'
    if (msg.role != 'tool') delete msg.name
    delete msg.item
  })
  if (empty(messages)) fatal('llama requires at least one user or system message')
  return messages
}

// create request for converted messages
// config is passed through into request body, omitting reserved keys
// (url selects the server in run_chat_agent; each server hosts ONE model, so
// 'model' is optional and ignored server-side; llama.cpp sampling extras like
// top_k/min_p/repeat_penalty pass through top-level)
// NO auth header: the tailnet is the auth boundary (deliberate; see header)
// 'eval' tool is included only if config.tool_choice is defined (can be 'auto')
const create_request = (messages, config) => ({
  method:'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...omit(config, 'name', 'converter', 'url'),
    messages,
    // example 'eval' tool, openai function schema
    ...(defined(config.tool_choice) ? {
      tools: [{
        type: 'function',
        function: {
          name: 'eval',
          description: 'evaluate js code in browser on user device',
          parameters: {
            type: 'object',
            properties: { js: { type: 'string', description: 'js code to evaluate' } },
            required: ['js']
          }
        }
      }]
    } : {})
  })
})

// parse agent message from api response
// fails on api error or unexpected/invalid message
// llama-server returns thinking either as a separate reasoning_content field or
// inline as a single leading <think> block in content, depending on server
// template/flags; normalize BOTH into reasoning_content (the same-run wire field
// llama-server accepts on tool continuations) and strip the one leading complete
// block from visible content either way (a nonempty field wins over the inline
// form); non-leading, repeated, or unclosed tags are left alone (no general parser)
function parse_response(response) {
  if (response.error) fatal(response.error.message)
  const msg = response.choices?.[0]?.message
  if (!msg) fatal(`missing agent message`)
  if (msg.role != 'assistant') fatal(`unexpected agent role ${msg.role}`)
  const think = is_string(msg.content) ?
    msg.content.match(/^\s*<think>(.*?)<\/think>\s*/s) : null
  if (think) msg.content = msg.content.slice(think[0].length)
  if (think && !msg.reasoning_content) msg.reasoning_content = think[1].trim()
  // drop empty tool_calls array (returned on some text replies), which is truthy
  // and would keep the agent loop alive forever (same guard as #agent/chat/together)
  if (empty(msg.tool_calls)) delete msg.tool_calls
  if (!msg.content && !msg.tool_calls) fatal(`invalid agent message`, msg)
  return msg
}

// render agent message as message text
// tool-call messages render as internal _agent messages w/ message block, with
// reasoning_content preserved in the JSON for the same-run tool continuation;
// the visible 'thinking' block renders only on the final non-tool reply, as with
// #agent/chat/gpt reasoning summaries
const render_message = (msg, name) =>
  msg.tool_calls ?
    `\<<_agent('${name}')>>\n` + block('message', JSON.stringify(msg)) :
    `\<<agent('${name}')>>\n` +
      (msg.reasoning_content ? block('thinking', msg.reasoning_content) + '\n' : '') +
      msg.content

// execute 'eval' tool call and return tool message
// evaluates js in global scope on user device, awaiting any promise
function eval_tool(tool) {
  const func = tool.function
  if (func.name != 'eval') fatal(`invalid function ${func.name}`)
  const args = JSON.parse(func.arguments)
  if (!args?.js) fatal(`missing arg (js) for eval`)
  debug('eval:', args.js)
  return Promise.resolve(eval(args.js)).then(out => {
    const content = out ?? ''
    debug('eval result:', content)
    return {
      role: 'tool',
      tool_call_id: tool.id,
      name: func.name,
      content: JSON.stringify(content)
    }
  })
}

async function run_chat_agent(messages, config = {}) {
  // url selects the server (and thereby the model); default is dsv4 on m3ultra
  // (deepseek-v4-flash, 1M ctx); see #chat/next for the tinybox flash-next url
  const url = config.url || 'https://m3ultra.tail10a0fe.ts.net:8443/v1/chat/completions'
  config.name ||= config.model || 'llama' // display name only (model is optional)

  convert_messages(messages, config)

  // run agent until it no longer returns tool calls
  // note we allow resuming from a tool call
  let msg = last(messages)?.tool_calls ? last(messages) : null
  let msg_text = [] // agent message text
  while (!msg || msg.tool_calls) {
    for (const tool of msg?.tool_calls ?? []) {
      let tool_msg = await eval_tool(tool)
      if (config.converter) tool_msg = config.converter(tool_msg)
      messages.push(tool_msg) // include tool output in request below
      msg_text.push(`\<<tool('${tool.function.name}')>>\n` +
        block('message', JSON.stringify(tool_msg)))
    }
    const request = create_request(messages, config)
    debug('llama request', request)
    const response = await fetch_json(url, request)
    debug('llama response', response)
    msg = parse_response(response)
    if (config.converter) msg = config.converter(msg)
    messages.push(msg) // for any additional requests
    msg_text.push(render_message(msg, config.name))
  }
  return msg_text.join('\n')
}

function _test_convert_messages() {
  const messages = convert_messages([
    { role: 'system', content: 'sys', name: 'n', item: '#x' },
    { role: 'user', content: 'hello', name: 'n', item: '#x' },
    { role: 'agent', content: 'hi', item: '#x' },
    { role: '_agent', content: '', tool_calls: [{ id: 't1' }], item: '#x' },
    { role: 'tool', content: '2', name: 'eval', item: '#x' },
  ], {})
  check(
    () => equal(messages, [
      { role: 'system', content: 'sys' }, // system kept inline
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'assistant', content: '', tool_calls: [{ id: 't1' }] }, // preserved
      { role: 'tool', content: '2', name: 'eval' }, // tool keeps name
    ]),
    () => throws(() => convert_messages([], {})), // no messages
  )
}
const _test_convert_messages_functions = ['convert_messages']

function _test_create_request() {
  const request = create_request(
    [{ role: 'user', content: 'hi' }],
    { name: 'x', url: 'u', converter: m => m, temperature: 1, top_k: 40 })
  const body = JSON.parse(request.body)
  check(
    () => request.method == 'POST',
    // NO auth header at all: the tailnet is the auth boundary
    () => equal(request.headers, { 'Content-Type': 'application/json' }),
    // reserved keys omitted from body; absent model STAYS absent (single-model servers)
    () => body.url === undefined && body.name === undefined && body.converter === undefined,
    () => body.model === undefined,
    // llama.cpp sampling extras pass through top-level
    () => body.temperature == 1 && body.top_k == 40,
    () => equal(body.messages, [{ role: 'user', content: 'hi' }]),
    // 'eval' tool schema included only when tool_choice is opted in
    () => body.tools === undefined,
  )
  const tooled = JSON.parse(create_request([], { tool_choice: 'auto' }).body)
  check(
    () => tooled.tool_choice == 'auto',
    () => tooled.tools.length == 1 && tooled.tools[0].function.name == 'eval',
    () => equal(tooled.tools[0].function.parameters.required, ['js']),
  )
}
const _test_create_request_functions = ['create_request']

function _test_parse_response() {
  const wrap = message => ({ choices: [{ message }] })
  const text = { role: 'assistant', content: 'hello!' }
  // separate reasoning_content field (the form both fleet servers emit as of 2026-08)
  const reasoned = { role: 'assistant', content: 'hi', reasoning_content: 'hmm' }
  const tool = { role: 'assistant', content: '', reasoning_content: 'plan',
    tool_calls: [{ id: 't1', function: { name: 'eval', arguments: '{"js":"1"}' } }] }
  check(
    () => equal(parse_response(wrap(text)), text),
    () => equal(parse_response(wrap({ ...reasoned })), reasoned),
    // inline leading <think> block normalizes into reasoning_content and is stripped
    () => equal(
      parse_response(wrap({ role: 'assistant', content: '<think> hmm </think>\nhi' })),
      { role: 'assistant', content: 'hi', reasoning_content: 'hmm' }),
    // a nonempty field WINS over the inline form, which is still stripped from content
    () => equal(
      parse_response(wrap({ role: 'assistant', content: '<think>inline</think>hi',
        reasoning_content: 'field' })),
      { role: 'assistant', content: 'hi', reasoning_content: 'field' }),
    // non-leading and unclosed tags are left alone (no general parser)
    () => parse_response(wrap({ role: 'assistant', content: 'a <think>b</think>' }))
      .content == 'a <think>b</think>',
    () => parse_response(wrap({ role: 'assistant', content: '<think>open' }))
      .content == '<think>open',
    // reasoning-bearing tool call keeps reasoning_content AND tool_calls
    () => equal(parse_response(wrap({ ...tool })), tool),
    // empty tool_calls array is dropped (would keep the agent loop alive forever)
    () => parse_response(wrap({ role: 'assistant', content: 'hi', tool_calls: [] }))
      .tool_calls === undefined,
    () => throws(() => parse_response({ error: { message: 'err' } })),
    () => throws(() => parse_response({ choices: [] })), // missing agent message
    () => throws(() => parse_response(wrap({ role: 'user', content: 'hi' }))),
    // no content and no tool calls is invalid independent of reasoning
    () => throws(() => parse_response(wrap({ role: 'assistant', content: '' }))),
    // reasoning alone is not a valid message (empty content, no tool calls)
    () => throws(() => parse_response(wrap({ role: 'assistant', content: '',
      reasoning_content: 'only' }))),
  )
}
const _test_parse_response_functions = ['parse_response']

function _test_render_message() {
  const wrap = message => ({ choices: [{ message }] })
  // composed parse->render: thinking block above the final reply
  const rendered = render_message(parse_response(
    wrap({ role: 'assistant', content: '<think>hmm</think>hi' })), 'llama')
  const tool = { role: 'assistant', content: '', reasoning_content: 'plan',
    tool_calls: [{ id: 't1', function: { name: 'eval', arguments: '{"js":"1"}' } }] }
  check(
    () => rendered == `\<<agent('llama')>>\n` + block('thinking', 'hmm') + '\nhi',
    // no thinking block without reasoning
    () => render_message({ role: 'assistant', content: 'hi' }, 'llama') ==
      `\<<agent('llama')>>\nhi`,
    // tool-call turns render as internal _agent message blocks with
    // reasoning_content preserved in the JSON (no visible thinking block)
    () => render_message(tool, 'llama') ==
      `\<<_agent('llama')>>\n` + block('message', JSON.stringify(tool)),
  )
}
const _test_render_message_functions = ['render_message']

async function _test_eval_tool() {
  // await BEFORE check: check() is synchronous and a pending promise is merely truthy
  const msg = await eval_tool({ id: 't1',
    function: { name: 'eval', arguments: '{"js":"1+1"}' } })
  check(
    () => equal(msg, { role: 'tool', tool_call_id: 't1', name: 'eval', content: '2' }),
    () => throws(() => eval_tool({ function: { name: 'exec', arguments: '{}' } })),
    () => throws(() => eval_tool({ function: { name: 'eval', arguments: '{}' } })),
  )
}
const _test_eval_tool_functions = ['eval_tool']

// live smoke against the DEFAULT url (dsv4 on m3ultra): requires this device on
// the tailnet and the server started via vault bin/serve_model.sh dsv4
async function _test_live_smoke() {
  const text = await run_chat_agent(
    [{ role: 'user', content: 'reply with one short word' }], { max_tokens: 1024 })
  check(
    () => text.startsWith(`\<<agent('llama')>>`),
    () => text.includes('```thinking'), // rendered thinking block
    () => text.replace(/^.*```/s, '').trim().length > 0, // non-empty final reply
  )
}
const _test_live_smoke_functions = ['run_chat_agent']

// live tool-use test against the flash-next url (tinybox; serve_model.sh next),
// proving the full loop: tool_calls -> eval_tool -> tool result -> final reply
async function _test_live_tool_use() {
  const text = await run_chat_agent([{ role: 'user',
    content: 'use the eval tool to compute 1234*5678, then reply with the result' }], {
    url: 'https://tinybox.tail10a0fe.ts.net:8443/v1/chat/completions',
    name: 'flash-next',
    tool_choice: 'auto',
    max_tokens: 1024,
  })
  // the tool-result message itself contains the number, so the FINAL agent segment must be
  // examined separately to prove the reply (with visible thinking) carries the answer
  const final = text.slice(text.lastIndexOf(`\<<agent('flash-next')>>`))
  check(
    () => text.includes(`\<<tool('eval')>>`), // tool call made & result rendered
    () => final.startsWith(`\<<agent('flash-next')>>`), // final (non-tool) agent reply
    () => final.includes('```thinking'), // rendered thinking block on the final reply
    () => final.includes('7006652'), // correct result IN the assistant reply
  )
}
```

#_util/core
