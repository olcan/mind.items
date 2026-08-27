#agent/chat/claude responds using [Claude Messages API](https://platform.claude.com/docs/en/api/messages).

```js_input_removed
run_on_dependents()
```

```js:js_removed
// convert messages (in place) to anthropic format
// converts role _?agent -> assistant, hoists system messages into config.system
// deletes 'name' and 'item' from all messages, preserves non-string content
// (e.g. tool_use/tool_result content blocks parsed from message blocks)
// see https://platform.claude.com/docs/en/api/messages
function convert_messages(messages, config) {
  config.system = [ config.system /* predefined system prompt */ ]
  each(messages, msg => {
    if (msg.role.match(/_?agent/)) msg.role = 'assistant'
    if (!msg.content) fatal('invalid message missing content', msg)
    if (msg.role == 'system') config.system.push(msg.content)
    delete msg.name
    delete msg.item
  })
  config.system = compact(flat(config.system)).join('\n')
  remove(messages, m => m.role == 'system') // drop system messages
  if (empty(messages)) fatal('claude requires at least one user message')
  return messages
}

// create request for converted messages
// config is passed through into request body, omitting reserved keys
const create_request = (messages, config) => ({
  method:'POST',
  headers: {
    'x-api-key': config.api_key,
    'anthropic-version': '2023-06-01',
    // opt-in for direct browser access (api key lives on user device by design)
    // see https://platform.claude.com/docs/en/api/cors
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    max_tokens: 8192, // required by api; can be raised via config for current models
    ...omit(config, 'name', 'api_key'),
    // model: https://platform.claude.com/docs/en/about-claude/models/overview
    // system: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/system-prompts
    messages,
    // example 'eval' tool, see https://platform.claude.com/docs/en/build-with-claude/tool-use
    tools: [{
      name: 'eval',
      description: 'evaluate js code in browser on user device',
      input_schema: {
        type: 'object',
        properties: { js: { type: 'string', description: 'js code to evaluate' } },
        required: ['js']
      }
    }]
  })
})

// parse agent message { role:'assistant', content } from api response
// fails on api error or unexpected/invalid message
function parse_response(response) {
  if (response.error) fatal(response.error.message)
  const msg = pick(response, ['role', 'content'])
  if (msg.role != 'assistant') fatal(`unexpected agent role ${msg.role}`)
  if (!msg.content) fatal(`invalid agent message`, msg)
  return msg
}

// render agent message as message text
// tool-use messages render as internal _agent messages w/ message block
const render_message = (msg, name) =>
  msg.content.some?.(c => c.type == 'tool_use') ?
    `\<<_agent('${name}')>>\n` + block('message', JSON.stringify(msg)) :
    `\<<agent('${name}')>>\n` + msg.content.map(c => c.text ?? '').join('')

// execute 'eval' tool call and return tool_result message
// evaluates js in global scope on user device, awaiting any promise
function eval_tool(tool) {
  if (tool.name != 'eval') fatal(`invalid tool ${tool.name}`)
  if (!tool.input?.js) fatal(`missing arg (js) for eval`)
  debug('eval:', tool.input.js)
  return Promise.resolve(eval(tool.input.js)).then(out => {
    const content = out ?? ''
    debug('eval result:', content)
    return {
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: tool.id,
        // must be string (or array of content blocks)
        content: is_string(content) ? content : JSON.stringify(content)
      }]
    }
  })
}

async function run_chat_agent(messages, config = {}) {
  config.model ||= 'claude-sonnet-5' // https://platform.claude.com/docs/en/about-claude/models/overview
  config.name ||= config.model // use model as default agent name

  // get api key from config, global store, or user (via _modal)
  config.api_key ||= await get_api_key()
  if (!config.api_key) fatal(`missing api key`)

  convert_messages(messages, config)

  // run agent until it no longer returns tool calls
  // note we allow resuming from a tool call
  let msg = last(messages)?.content.some?.(c => c.type == 'tool_use') ?
    last(messages) : null
  let msg_text = [] // agent message text
  while (!msg || msg.content.some?.(c => c.type == 'tool_use')) {
    for (const tool of msg?.content.filter(c => c.type == 'tool_use') ?? []) {
      const tool_msg = await eval_tool(tool)
      messages.push(tool_msg) // include tool output in request below
      msg_text.push(`\<<tool('${tool.name}')>>\n` +
        block('message', JSON.stringify(tool_msg)))
    }
    const request = create_request(messages, config)
    console.debug('claude request', request)
    // direct browser access via anthropic-dangerous-direct-browser-access
    // header (see create_request), no cors proxy needed anymore
    const url = 'https://api.anthropic.com/v1/messages'
    const response = await fetch_json(url, request)
    console.debug('claude response', response)
    msg = parse_response(response)
    messages.push(msg) // for any additional requests
    msg_text.push(render_message(msg, config.name))
  }
  return msg_text.join('\n')
}

const get_api_key = async () => _item('$id').global_store.api_key ??= await _modal({
  content:`${_item('$id').name} needs your [Anthropic API key](https://console.anthropic.com/settings/keys)`,
  confirm: 'Use API Key',
  cancel:  'Cancel',
  input:   ''
})

function _test_convert_messages() {
  const config = { system: 'sys0' }
  const tool_result = [{ type: 'tool_result', tool_use_id: 't1', content: '2' }]
  const messages = convert_messages([
    { role: 'system', content: 'sys1', name: 'n', item: '#x' },
    { role: 'user', content: 'hello', name: 'n', item: '#x' },
    { role: 'agent', content: 'hi', item: '#x' },
    { role: '_agent', content: 'tools', item: '#x' },
    { role: 'user', content: tool_result, item: '#x' },
  ], config)
  check(
    () => equal(messages, [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'assistant', content: 'tools' },
      { role: 'user', content: tool_result },
    ]),
    () => config.system == 'sys0\nsys1',
    () => throws(() => convert_messages([{ role: 'user' }], {})), // missing content
    () => throws(() => convert_messages([{ role: 'system', content: 'sys' }], {})), // no messages left
  )
}
const _test_convert_messages_functions = ['convert_messages']

function _test_create_request() {
  const request = create_request(
    [{ role: 'user', content: 'hi' }],
    { model: 'claude-sonnet-5', api_key: 'KEY', name: 'x', system: 'sys', temperature: 0 })
  const body = JSON.parse(request.body)
  check(
    () => request.method == 'POST',
    () => request.headers['x-api-key'] == 'KEY',
    () => request.headers['anthropic-version'] == '2023-06-01',
    () => request.headers['anthropic-dangerous-direct-browser-access'] == 'true',
    () => body.model == 'claude-sonnet-5',
    () => body.system == 'sys',
    () => body.temperature === 0,
    () => body.max_tokens > 0, // default applied
    () => body.api_key === undefined && body.name === undefined, // reserved keys omitted
    () => equal(body.messages, [{ role: 'user', content: 'hi' }]),
    () => body.tools.length == 1 && body.tools[0].name == 'eval',
  )
}
const _test_create_request_functions = ['create_request']

function _test_parse_response() {
  const text = { role: 'assistant', content: [{ type: 'text', text: 'hello!' }] }
  const tool = { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'eval', input: { js: '1+1' } }] }
  check(
    () => equal(parse_response({ ...text, id: 'msg_1', model: 'm', usage: {} }), text),
    () => equal(parse_response({ ...tool, stop_reason: 'tool_use' }), tool),
    () => throws(() => parse_response({ error: { message: 'bad key' } })),
    () => throws(() => parse_response({ role: 'user', content: [] })),
    () => throws(() => parse_response({ role: 'assistant' })),
  )
}
const _test_parse_response_functions = ['parse_response']

function _test_render_message() {
  const text = { role: 'assistant', content: [{ type: 'text', text: 'hello!' }] }
  const tool = { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'eval', input: { js: '1+1' } }] }
  check(
    () => render_message(text, 'sonnet') == `\<<agent('sonnet')>>\nhello!`,
    () => render_message(tool, 'sonnet').startsWith(`\<<_agent('sonnet')>>\n`),
    () => render_message(tool, 'sonnet').includes('tool_use'),
  )
}
const _test_render_message_functions = ['render_message']

async function _test_eval_tool() {
  const msg = await eval_tool({ id: 't1', name: 'eval', input: { js: '1+1' } })
  check(
    () => equal(msg, { role: 'user', content: [{
      type: 'tool_result', tool_use_id: 't1', content: '2' }] }),
    () => throws(() => eval_tool({ name: 'other' })),
    () => throws(() => eval_tool({ name: 'eval', input: {} })),
  )
}
const _test_eval_tool_functions = ['eval_tool']

// live smoke test against the api w/ default model, excluded from default runs
// run via /test #agent/chat/claude live; requires api key (see get_api_key)
async function _test_live_smoke() {
  const text = await run_chat_agent(
    [{ role: 'user', content: 'reply with one short word' }], { max_tokens: 256 })
  check(
    () => text.startsWith(`\<<agent('`),
    () => text.replace(/^.*?>>/s, '').trim().length > 0, // non-empty reply
  )
}
const _test_live_smoke_functions = ['run_chat_agent']

// live tool-use test against the api w/ default model, excluded from default runs
// verifies the full tool loop: tool_use response -> eval_tool -> tool_result -> reply
async function _test_live_tool_use() {
  const text = await run_chat_agent([{ role: 'user',
    content: 'use the eval tool to compute 1234*5678, then reply with the result' }],
    { max_tokens: 1024 })
  check(
    () => text.includes(`\<<tool('eval')>>`), // tool call made & result rendered
    () => text.includes('7006652'), // correct result round-tripped
    () => text.includes(`\<<agent('`), // final (non-tool) agent reply
  )
}
```

#_///chat #_util/core