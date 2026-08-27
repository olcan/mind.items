#agent/chat/ollama responds using [Ollama Chat API](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion). Requires [ollama](https://ollama.com) running locally, with `ollama pull <model>` to fetch model, and `launchctl setenv OLLAMA_ORIGINS "https://local.dev"` to enable requests from `local.dev`. To set this persistently, create an app (e.g. `Ollama_local_dev`) using Automator that runs `setenv` before launching `Ollama` app, and use that to replace `Ollama` in login items.

```js_input_removed
run_on_dependents()
```

```js:js_removed
// convert messages (in place) to ollama (openai) format
// converts role _?agent -> assistant and tool -> user, keeps system inline
// deletes 'name' and 'item' from all messages
// see https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
function convert_messages(messages, config) {
  each(messages, msg => {
    if (msg.role.match(/_?agent/)) msg.role = 'assistant'
    if (msg.role == 'tool') msg.role = 'user'
    delete msg.name
    delete msg.item
  })
  return messages
}

// create request for converted messages
// config is passed through into request body, omitting reserved keys
// (server location keys host/port/url are used in run_chat_agent instead)
const create_request = (messages, config) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    ...omit(config, 'name', 'converter', 'host', 'port', 'url'),
    stream: false, // disable streaming
    // model: https://ollama.com/library
    messages,
  })
})

// parse agent message from api response
// fails on api error or unexpected/invalid message
function parse_response(response) {
  if (response.error) fatal(response.error.message)
  const msg = response.message
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
  // native api returns arguments as an object; openai-compat endpoints use json strings
  const args = is_string(func.arguments) ? JSON.parse(func.arguments) : func.arguments
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
  let host = config.host || 'localhost'
  let port = config.port || 11434
  let url = config.url || `http://${host}:${port}/api/chat`
  ;({ host, port } = new URL(url))
  if (_is_local(host) && !_is_local(location.host))
    fatal('ollama server is local but client is not')
  if (url.startsWith('http://')) url = '/proxy/' + url // proxy http
  // if proxying, avoid '://' that can cause a body-dropping redirect
  if (url.startsWith('/proxy/')) url = url.replace('://', ':/')

  // note default model requires 'ollama pull <name>'
  config.model ||= 'gemma3:4b' // https://ollama.com/library (gemma3:latest == 4b)
  config.name ||= config.model // use model as default agent name

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
    debug('ollama request', request)
    // proxy requires launchctl setenv OLLAMA_ORIGINS "https://local.dev"
    // see https://github.com/ollama/ollama/blob/main/docs/faq.md
    const response = await fetch_json(url, request)
    debug('ollama response', response)
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
    { role: '_agent', content: 'tools', item: '#x' },
    { role: 'tool', content: '2', name: 'eval', item: '#x' },
  ], {})
  check(
    () => equal(messages, [
      { role: 'system', content: 'sys' }, // system kept inline
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'assistant', content: 'tools' },
      { role: 'user', content: '2' }, // tool converted to user
    ]),
  )
}
const _test_convert_messages_functions = ['convert_messages']

function _test_create_request() {
  const request = create_request(
    [{ role: 'user', content: 'hi' }],
    { model: 'gemma3', name: 'x', host: 'localhost', port: 11434, url: 'u', converter: m => m })
  const body = JSON.parse(request.body)
  check(
    () => request.method == 'POST',
    () => body.model == 'gemma3',
    () => body.stream === false,
    // reserved and server location keys omitted
    () => body.name === undefined && body.converter === undefined,
    () => body.host === undefined && body.port === undefined && body.url === undefined,
    () => equal(body.messages, [{ role: 'user', content: 'hi' }]),
  )
}
const _test_create_request_functions = ['create_request']

function _test_parse_response() {
  const text = { role: 'assistant', content: 'hello!' }
  const tool = { role: 'assistant', content: '',
    tool_calls: [{ function: { name: 'eval', arguments: '{}' } }] }
  check(
    () => equal(parse_response({ message: text, done: true }), text),
    () => equal(parse_response({ message: tool }), tool),
    () => throws(() => parse_response({ error: { message: 'no model' } })),
    () => throws(() => parse_response({})),
    () => throws(() => parse_response({ message: { role: 'user', content: 'x' } })),
    () => throws(() => parse_response({ message: { role: 'assistant' } })),
  )
}
const _test_parse_response_functions = ['parse_response']

function _test_render_message() {
  const text = { role: 'assistant', content: 'hello!' }
  const tool = { role: 'assistant', content: '',
    tool_calls: [{ function: { name: 'eval', arguments: '{}' } }] }
  check(
    () => render_message(text, 'gemma') == `\<<agent('gemma')>>\nhello!`,
    () => render_message(tool, 'gemma').startsWith(`\<<_agent('gemma')>>\n`),
    () => render_message(tool, 'gemma').includes('tool_calls'),
  )
}
const _test_render_message_functions = ['render_message']

async function _test_eval_tool() {
  // native api returns arguments as an object; openai-compat endpoints use json strings
  const from_obj = await eval_tool({ id: 't1', function: { name: 'eval', arguments: { js: '1+1' } } })
  const from_str = await eval_tool({ id: 't1', function: { name: 'eval', arguments: '{"js":"1+1"}' } })
  const expected = { role: 'tool', tool_call_id: 't1', name: 'eval', content: '2' }
  check(
    () => equal(from_obj, expected),
    () => equal(from_str, expected),
    () => throws(() => eval_tool({ function: { name: 'other' } })),
    () => throws(() => eval_tool({ function: { name: 'eval', arguments: '{}' } })),
  )
}
const _test_eval_tool_functions = ['eval_tool']

// live smoke test against local ollama server w/ default model
// excluded from default runs; run via /test #agent/chat/ollama live
// requires ollama running locally w/ default model pulled
async function _test_live_smoke() {
  const text = await run_chat_agent(
    [{ role: 'user', content: 'reply with one short word' }], {})
  check(
    () => text.startsWith(`\<<agent('`),
    () => text.replace(/^.*?>>/s, '').trim().length > 0, // non-empty reply
  )
}
const _test_live_smoke_functions = ['run_chat_agent']

// live tool-use test verifying the full tool loop: tool_calls response ->
// eval_tool -> tool message -> reply; the default model (gemma3) does not
// support tools, so this uses qwen3:4b w/ an explicit tool schema, which
// passes through config into the request body (see create_request)
async function _test_live_tool_use() {
  const text = await run_chat_agent([{ role: 'user',
    content: 'use the eval tool to compute 1234*5678, then reply with the result' }], {
    model: 'qwen3:4b', // tool-capable local model (gemma3 rejects tools)
    tools: [{ type: 'function', function: {
      name: 'eval',
      description: 'evaluate js code in browser on user device',
      parameters: {
        type: 'object',
        properties: { js: { type: 'string', description: 'js code to evaluate' } },
        required: ['js'],
      } } }],
  })
  check(
    () => text.includes(`\<<tool('eval')>>`), // tool call made & result rendered
    () => text.includes('7006652'), // correct result round-tripped
    () => text.includes(`\<<agent('`), // final (non-tool) agent reply
  )
}
```

#_///chat #_util/core