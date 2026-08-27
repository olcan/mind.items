#agent/chat/openrouter responds using [OpenRouter Chat API](https://openrouter.ai/docs/api-reference/chat-completion), which routes to [hundreds of models](https://openrouter.ai/models) across providers through a single (openai-compatible) api and key.

```js_input_removed
run_on_dependents()
```

```js:js_removed
// convert messages (in place) to openrouter (openai) format
// converts role _?agent -> assistant, keeps system messages inline
// deletes 'name' from non-tool messages and 'item' from all messages
// preserves messages w/o content (e.g. tool_calls parsed from message blocks)
// see https://openrouter.ai/docs/api-reference/chat-completion
function convert_messages(messages, config) {
  each(messages, msg => {
    if (msg.role.match(/_?agent/)) msg.role = 'assistant'
    if (msg.role != 'tool') delete msg.name
    delete msg.item
  })
  if (empty(messages)) fatal('openrouter requires at least one user or system message')
  return messages
}

// create request for converted messages
// config is passed through into request body, omitting reserved keys
// 'eval' tool is included only if config.tool_choice is defined (can be 'auto')
const create_request = (messages, config) => ({
  method:'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + config.api_key
  },
  body: JSON.stringify({
    ...omit(config, 'name', 'api_key', 'converter'),
    // model: https://openrouter.ai/models
    messages,
    // example 'eval' tool, see https://openrouter.ai/docs/features/tool-calling
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
function parse_response(response) {
  if (response.error) fatal(response.error.message)
  const msg = response.choices?.[0]?.message
  if (!msg) fatal(`missing agent message`)
  if (msg.role != 'assistant') fatal(`unexpected agent role ${msg.role}`)
  if (!msg.content && !msg.tool_calls) fatal(`invalid agent message`, msg)
  return msg
}

// render agent message as message text
// tool-call messages render as internal _agent messages w/ message block
const render_message = (msg, name) =>
  msg.tool_calls ?
    `\<<_agent('${name}')>>\n` + block('message', JSON.stringify(msg)) :
    `\<<agent('${name}')>>\n` + msg.content

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
  config.model ||= 'google/gemini-3.7-flash' // https://openrouter.ai/models
  config.name ||= config.model // use model as default agent name

  // get api key from config, global store, or user (via _modal)
  config.api_key ||= await get_api_key()
  if (!config.api_key) fatal(`missing api key`)

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
    debug('openrouter request', request)
    const url = 'https://openrouter.ai/api/v1/chat/completions'
    const response = await fetch_json(url, request)
    debug('openrouter response', response)
    msg = parse_response(response)
    if (config.converter) msg = config.converter(msg)
    messages.push(msg) // for any additional requests
    msg_text.push(render_message(msg, config.name))
  }
  return msg_text.join('\n')
}

const get_api_key = async () => _item('$id').global_store.api_key ??= await _modal({
  content:`${_item('$id').name} needs your [OpenRouter API key](https://openrouter.ai/settings/keys)`,
  confirm: 'Use API Key',
  cancel:  'Cancel',
  input:   ''
})

function _test_convert_messages() {
  const tool_calls = [{ id: 't1', type: 'function', function: { name: 'eval', arguments: '{"js":"1+1"}' } }]
  const messages = convert_messages([
    { role: 'system', content: 'sys', name: 'n', item: '#x' },
    { role: 'user', content: 'hello', name: 'n', item: '#x' },
    { role: 'agent', content: 'hi', item: '#x' },
    { role: '_agent', content: null, tool_calls, item: '#x' },
    { role: 'tool', tool_call_id: 't1', name: 'eval', content: '2', item: '#x' },
  ], {})
  check(
    () => equal(messages, [
      { role: 'system', content: 'sys' }, // system kept inline
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'assistant', content: null, tool_calls },
      { role: 'tool', tool_call_id: 't1', name: 'eval', content: '2' }, // name kept on tool
    ]),
    () => throws(() => convert_messages([], {})), // no messages
  )
}
const _test_convert_messages_functions = ['convert_messages']

function _test_create_request() {
  const config = { model: 'm', api_key: 'KEY', name: 'x', converter: m => m }
  const request = create_request([{ role: 'user', content: 'hi' }], config)
  const body = JSON.parse(request.body)
  const with_tools = JSON.parse(
    create_request([{ role: 'user', content: 'hi' }], { ...config, tool_choice: 'auto' }).body)
  check(
    () => request.method == 'POST',
    () => request.headers['Authorization'] == 'Bearer KEY',
    () => body.model == 'm',
    // reserved keys omitted
    () => body.api_key === undefined && body.name === undefined && body.converter === undefined,
    () => equal(body.messages, [{ role: 'user', content: 'hi' }]),
    () => body.tools === undefined, // tools only if tool_choice defined
    () => with_tools.tools.length == 1 && with_tools.tools[0].function.name == 'eval',
    () => with_tools.tool_choice == 'auto',
  )
}
const _test_create_request_functions = ['create_request']

function _test_parse_response() {
  const text = { role: 'assistant', content: 'hello!' }
  const tool = { role: 'assistant', content: null,
    tool_calls: [{ id: 't1', type: 'function', function: { name: 'eval', arguments: '{}' } }] }
  check(
    () => equal(parse_response({ choices: [{ message: text }], usage: {} }), text),
    () => equal(parse_response({ choices: [{ message: tool }] }), tool),
    () => throws(() => parse_response({ error: { message: 'bad key' } })),
    () => throws(() => parse_response({ choices: [] })),
    () => throws(() => parse_response({ choices: [{ message: { role: 'user', content: 'x' } }] })),
    () => throws(() => parse_response({ choices: [{ message: { role: 'assistant' } }] })),
  )
}
const _test_parse_response_functions = ['parse_response']

function _test_render_message() {
  const text = { role: 'assistant', content: 'hello!' }
  const tool = { role: 'assistant', content: null,
    tool_calls: [{ id: 't1', type: 'function', function: { name: 'eval', arguments: '{}' } }] }
  check(
    () => render_message(text, 'gemini') == `\<<agent('gemini')>>\nhello!`,
    () => render_message(tool, 'gemini').startsWith(`\<<_agent('gemini')>>\n`),
    () => render_message(tool, 'gemini').includes('tool_calls'),
  )
}
const _test_render_message_functions = ['render_message']

async function _test_eval_tool() {
  const msg = await eval_tool({ id: 't1', function: { name: 'eval', arguments: '{"js":"1+1"}' } })
  check(
    () => equal(msg, { role: 'tool', tool_call_id: 't1', name: 'eval', content: '2' }),
    () => throws(() => eval_tool({ function: { name: 'other' } })),
    () => throws(() => eval_tool({ function: { name: 'eval', arguments: '{}' } })),
  )
}
const _test_eval_tool_functions = ['eval_tool']

// live smoke test against the api w/ default model, excluded from default runs
// run via /test #agent/chat/openrouter live; requires api key (see get_api_key)
async function _test_live_smoke() {
  const text = await run_chat_agent(
    [{ role: 'user', content: 'reply with one short word' }], {})
  check(
    () => text.startsWith(`\<<agent('`),
    () => text.replace(/^.*?>>/s, '').trim().length > 0, // non-empty reply
  )
}
const _test_live_smoke_functions = ['run_chat_agent']

// live tool-use test against the api w/ default model, excluded from default runs
// verifies the full tool loop: tool_calls response -> eval_tool -> tool message -> reply
// note tool_choice is required for the eval tool to be included (see create_request)
async function _test_live_tool_use() {
  const text = await run_chat_agent([{ role: 'user',
    content: 'use the eval tool to compute 1234*5678, then reply with the result' }],
    { tool_choice: 'auto' })
  check(
    () => text.includes(`\<<tool('eval')>>`), // tool call made & result rendered
    () => text.includes('7006652'), // correct result round-tripped
    () => text.includes(`\<<agent('`), // final (non-tool) agent reply
  )
}
```

#_///chat #_util/core
