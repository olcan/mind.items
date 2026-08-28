#agent/chat/gpt responds using [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses), which supports function tools together with full reasoning (unlike the chat completions api).

```js_input_removed
run_on_dependents()
```

```js:js_removed
// convert messages (in place) to openai responses format
// converts role _?agent -> assistant, keeps system messages inline
// deletes 'name' and 'item' from all messages
// preserves messages w/ item-array content (e.g. parsed from message blocks):
// output items (reasoning/message/function_call) and function_call_output items
// see https://platform.openai.com/docs/api-reference/responses
function convert_messages(messages, config) {
  each(messages, msg => {
    if (msg.role.match(/_?agent/)) msg.role = 'assistant'
    delete msg.name
    delete msg.item
  })
  if (empty(messages)) fatal('gpt requires at least one user or system message')
  return messages
}

// build request input items from messages: plain-content messages pass as-is,
// item-array contents flatten into top-level api items (prior output items
// incl. reasoning/function_call, and function_call_output tool results)
const input_items = messages =>
  messages.flatMap(msg => (is_array(msg.content) ? msg.content : [msg]))

// create request for converted messages
// config is passed through into request body, omitting reserved keys
const create_request = (messages, config) => ({
  method:'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + config.api_key
  },
  body: JSON.stringify({
    ...omit(config, 'name', 'api_key', 'reasoning_effort', 'reasoning_summary'),
    // model: https://platform.openai.com/docs/models
    input: input_items(messages),
    // stateless mode: items are the only state, so encrypted reasoning must be
    // included for round-tripping reasoning items in function-call loops
    store: false,
    // reasoning (gpt-5+/o*) models only: config.reasoning_effort ('minimal'
    // up to 'max') and config.reasoning_summary ('auto'|'concise'|'detailed',
    // rendered in a 'thinking' block, see render_message) map into the
    // 'reasoning' parameter, which non-reasoning (e.g. gpt-4 family) models
    // reject along with the encrypted reasoning include
    ...(config.model.match(/^(gpt-5|o\d)/) ? {
      include: ['reasoning.encrypted_content'],
      ...(defined(config.reasoning_effort) || defined(config.reasoning_summary) ? {
        reasoning: {
          ...(defined(config.reasoning_effort) ? { effort: config.reasoning_effort } : {}),
          ...(defined(config.reasoning_summary) ? { summary: config.reasoning_summary } : {})
        }
      } : {})
    } : {}),
    // example 'eval' tool (flat function schema on the responses api)
    // see https://platform.openai.com/docs/guides/function-calling
    tools: [{
      type: 'function',
      name: 'eval',
      description: 'evaluate js code in browser on user device',
      parameters: {
        type: 'object',
        properties: { js: { type: 'string', description: 'js code to evaluate' } },
        required: ['js']
      }
    }]
  })
})

// parse agent message { role:'assistant', content } from api response
// content is the response 'output' item array (reasoning/message/function_call)
// fails on api error or missing/invalid output
function parse_response(response) {
  if (response.error) fatal(response.error.message)
  const output = response.output
  if (!is_array(output) || empty(output)) fatal(`missing agent output`)
  if (!output.some(item => item.type == 'message' || item.type == 'function_call'))
    fatal(`invalid agent output`, output)
  return { role: 'assistant', content: output }
}

// extract reply text from agent message (message items' output_text parts)
const message_text = msg => (is_array(msg.content) ? msg.content : [])
  .filter(item => item.type == 'message')
  .flatMap(item => item.content.filter(c => c.type == 'output_text').map(c => c.text))
  .join('')

// extract function calls from agent message
const function_calls = msg => (is_array(msg?.content) ? msg.content : [])
  .filter(item => item.type == 'function_call')

// extract reasoning summary text (present only if requested via config)
const reasoning_summary = msg => (is_array(msg.content) ? msg.content : [])
  .filter(item => item.type == 'reasoning')
  .flatMap(item => item.summary?.map(s => s.text) ?? [])
  .join('\n\n')

// render agent message as message text
// function-call messages render as internal _agent messages w/ message block
// reasoning summaries (if requested) render in a 'thinking' block above reply
function render_message(msg, name) {
  if (function_calls(msg).length)
    return `\<<_agent('${name}')>>\n` + block('message', JSON.stringify(msg))
  const summary = reasoning_summary(msg)
  return `\<<agent('${name}')>>\n` +
    (summary ? block('thinking', summary) + '\n' : '') + message_text(msg)
}

// execute 'eval' function call and return tool message
// evaluates js in global scope on user device, awaiting any promise
function eval_tool(tool) {
  if (tool.name != 'eval') fatal(`invalid function ${tool.name}`)
  const args = JSON.parse(tool.arguments)
  if (!args?.js) fatal(`missing arg (js) for eval`)
  debug('eval:', args.js)
  return Promise.resolve(eval(args.js)).then(out => {
    const content = out ?? ''
    debug('eval result:', content)
    return {
      role: 'tool',
      content: [{
        type: 'function_call_output',
        call_id: tool.call_id,
        output: JSON.stringify(content)
      }]
    }
  })
}

async function run_chat_agent(messages, config = {}) {
  config.model ||= 'gpt-5.6-terra' // https://platform.openai.com/docs/models
  config.name ||= config.model // use model as default agent name

  // get api key from config, global store, or user (via _modal)
  config.api_key ||= await get_api_key()
  if (!config.api_key) fatal(`missing api key`)

  convert_messages(messages, config)

  // run agent until it no longer returns function calls
  // note we allow resuming from a function call
  let msg = function_calls(last(messages)).length ? last(messages) : null
  let msg_text = [] // agent message text
  while (!msg || function_calls(msg).length) {
    for (const tool of msg ? function_calls(msg) : []) {
      const tool_msg = await eval_tool(tool)
      messages.push(tool_msg) // include tool output in request below
      msg_text.push(`\<<tool('${tool.name}')>>\n` +
        block('message', JSON.stringify(tool_msg)))
    }
    const request = create_request(messages, config)
    debug('openai request', request)
    const url = 'https://api.openai.com/v1/responses'
    const response = await fetch_json(url, request)
    debug('openai response', response)
    msg = parse_response(response)
    messages.push(msg) // for any additional requests
    msg_text.push(render_message(msg, config.name))
  }
  return msg_text.join('\n')
}

const get_api_key = async () => _item('$id').global_store.api_key ??= await _modal({
  content:`${_item('$id').name} needs your [OpenAI API key](https://platform.openai.com/api-keys)`,
  confirm: 'Use API Key',
  cancel:  'Cancel',
  input:   ''
})

function _test_convert_messages() {
  const calls = [{ type: 'function_call', call_id: 't1', name: 'eval', arguments: '{"js":"1+1"}' }]
  const outputs = [{ type: 'function_call_output', call_id: 't1', output: '2' }]
  const messages = convert_messages([
    { role: 'system', content: 'sys', name: 'n', item: '#x' },
    { role: 'user', content: 'hello', name: 'n', item: '#x' },
    { role: 'agent', content: 'hi', item: '#x' },
    { role: '_agent', content: calls, item: '#x' },
    { role: 'tool', content: outputs, item: '#x' },
  ], {})
  check(
    () => equal(messages, [
      { role: 'system', content: 'sys' }, // system kept inline
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'assistant', content: calls },
      { role: 'tool', content: outputs },
    ]),
    // item-array contents flatten into top-level api input items
    () => equal(input_items(messages), [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      ...calls,
      ...outputs,
    ]),
    () => throws(() => convert_messages([], {})), // no messages
  )
}
const _test_convert_messages_functions = ['convert_messages', 'input_items']

function _test_create_request() {
  const request = create_request(
    [{ role: 'user', content: 'hi' }],
    { model: 'gpt-5.6-terra', api_key: 'KEY', name: 'x',
      reasoning_effort: 'max', reasoning_summary: 'auto' })
  const body = JSON.parse(request.body)
  // reasoning params and encrypted include are gated by model family, since
  // non-reasoning models (e.g. gpt-4 family) reject them entirely
  const gpt4o = JSON.parse(create_request([{ role: 'user', content: 'hi' }],
    { model: 'gpt-4o', api_key: 'KEY', reasoning_effort: 'max' }).body)
  check(
    () => request.method == 'POST',
    () => request.headers['Authorization'] == 'Bearer KEY',
    () => body.model == 'gpt-5.6-terra',
    () => equal(body.input, [{ role: 'user', content: 'hi' }]),
    () => body.store === false, // stateless: items are the only state
    () => equal(body.include, ['reasoning.encrypted_content']),
    () => equal(body.reasoning, { effort: 'max', summary: 'auto' }),
    () => body.tools.length == 1 && body.tools[0].name == 'eval', // always on
    // reserved keys omitted (reasoning_* map into 'reasoning' above)
    () => body.api_key === undefined && body.name === undefined,
    () => body.reasoning_effort === undefined && body.reasoning_summary === undefined,
    () => gpt4o.reasoning === undefined && gpt4o.include === undefined,
    () => gpt4o.tools.length == 1,
  )
}
const _test_create_request_functions = ['create_request']

// example output items shared by parsing/rendering tests below
const _test_message = { type: 'message', role: 'assistant',
  content: [{ type: 'output_text', text: 'hello!' }] }
const _test_call = { type: 'function_call', call_id: 't1', name: 'eval', arguments: '{"js":"1+1"}' }
const _test_reasoning = { type: 'reasoning', encrypted_content: 'XYZ',
  summary: [{ type: 'summary_text', text: 'thinking about it' }] }

function _test_parse_response() {
  check(
    () => equal(parse_response({ output: [_test_reasoning, _test_message], usage: {} }),
      { role: 'assistant', content: [_test_reasoning, _test_message] }),
    () => equal(parse_response({ output: [_test_reasoning, _test_call] }),
      { role: 'assistant', content: [_test_reasoning, _test_call] }),
    () => throws(() => parse_response({ error: { message: 'bad key' } })),
    () => throws(() => parse_response({})), // missing output
    () => throws(() => parse_response({ output: [] })),
    () => throws(() => parse_response({ output: [_test_reasoning] })), // no message or call
  )
}
const _test_parse_response_functions = ['parse_response']

function _test_render_message() {
  const text = { role: 'assistant', content: [_test_message] }
  const summarized = { role: 'assistant', content: [_test_reasoning, _test_message] }
  const tool = { role: 'assistant', content: [_test_reasoning, _test_call] }
  check(
    () => render_message(text, 'gpt') == `\<<agent('gpt')>>\nhello!`,
    // reasoning summaries (present only if requested) render in thinking block
    () => render_message(summarized, 'gpt').includes(block('thinking', 'thinking about it')),
    () => render_message(summarized, 'gpt').endsWith('hello!'),
    () => render_message(tool, 'gpt').startsWith(`\<<_agent('gpt')>>\n`),
    () => render_message(tool, 'gpt').includes('function_call'),
  )
}
const _test_render_message_functions = ['render_message']

async function _test_eval_tool() {
  const msg = await eval_tool(_test_call)
  check(
    () => equal(msg, { role: 'tool', content: [
      { type: 'function_call_output', call_id: 't1', output: '2' }] }),
    () => throws(() => eval_tool({ name: 'other' })),
    () => throws(() => eval_tool({ name: 'eval', arguments: '{}' })),
  )
}
const _test_eval_tool_functions = ['eval_tool']

// live smoke test against the api w/ default model, excluded from default runs
// run via /test #agent/chat/gpt live; requires api key (see get_api_key)
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
// verifies the full loop: function_call output -> eval_tool -> output item -> reply
async function _test_live_tool_use() {
  const text = await run_chat_agent([{ role: 'user',
    content: 'use the eval tool to compute 1234*5678, then reply with the result' }], {})
  check(
    () => text.includes(`\<<tool('eval')>>`), // tool call made & result rendered
    () => text.includes('7006652'), // correct result round-tripped
    () => text.includes(`\<<agent('`), // final (non-tool) agent reply
  )
}
```

#_///chat #_util/core