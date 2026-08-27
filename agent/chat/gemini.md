#agent/chat/gemini responds using [Gemini API](https://ai.google.dev/gemini-api/docs/text-generation).

```js_input_removed
run_on_dependents()
```

```js:js_removed
// convert messages (in place) to gemini 'contents'
// converts roles _?agent -> model and (legacy) function -> user,
// hoists system messages into config.system
// deletes 'name' and 'item' from all messages, moves 'content' into 'parts'
// preserves existing 'parts' (e.g. functionCall/functionResponse parts
// parsed from message blocks), fails on messages w/o content or parts
// see https://ai.google.dev/gemini-api/docs/text-generation
function convert_messages(messages, config) {
  const contents = messages // reuse message objects
  config.system = [ config.system /* predefined system prompt */ ]
  each(contents, msg => {
    if (msg.role.match(/_?agent/)) msg.role = 'model'
    // normalize legacy role 'function' (rejected by api as of gemini-3.x models)
    // for functionResponse messages, e.g. parsed from older stored chats
    if (msg.role == 'function') msg.role = 'user'
    if (msg.role == 'system') config.system.push(msg.content)
    delete msg.name
    delete msg.item
    // model role + functionCall part & function role + functionResponse part
    // will not have 'content' and should already have 'parts' instead
    if (msg.content) {
      msg.parts = [{ text: msg.content }]
      delete msg.content
    } else if (!msg.parts) fatal('invalid message missing parts', msg)
  })
  config.system = compact(flat(config.system)).join('\n')
  remove(contents, c => c.role == 'system') // drop system messages
  if (empty(contents)) fatal('gemini requires at least one user message')
  return contents
}

// create request for converted contents
// config is passed through into request body, omitting reserved keys
// (model and api_key go into the request url instead, see run_chat_agent)
const create_request = (contents, config) => ({
  method:'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    // https://ai.google.dev/gemini-api/docs/system-instructions
    system_instruction: { parts:{ text: config.system } },
    ...omit(config, 'model', 'system', 'name', 'api_key'),
    contents,
    // example 'eval' tool, see https://ai.google.dev/gemini-api/docs/function-calling
    tools: [{
      functionDeclarations: [{
        name: 'eval',
        description: 'evaluate js code in browser on user device',
        parameters: {
          type: 'object',
          properties: { js: { type: 'string', description: 'js code to evaluate' } },
          required: ['js']
        }
      }]
    }]
  })
})

// parse agent message { role:'model', parts } from api response
// fails on api error or unexpected/invalid message
function parse_response(response) {
  if (response.error) fatal(response.error.message)
  const msg = response.candidates?.[0]?.content
  if (!msg) fatal(`missing agent message`)
  if (msg.role != 'model') fatal(`unexpected agent role ${msg.role}`)
  if (!msg.parts) fatal(`invalid agent message`, msg)
  return msg
}

// render agent message as message text
// function-call messages render as internal _agent messages w/ message block
const render_message = (msg, name) =>
  msg.parts.some(p => p.functionCall) ?
    `\<<_agent('${name}')>>\n` + block('message', JSON.stringify(msg)) :
    `\<<agent('${name}')>>\n` + msg.parts.map(p => p.text ?? '').join('')

// execute 'eval' function call and return functionResponse message
// evaluates js in global scope on user device, awaiting any promise
function eval_tool(part) {
  const func = part.functionCall
  if (func.name != 'eval') fatal(`invalid function ${func.name}`)
  if (!func.args?.js) fatal(`missing arg (js) for eval`)
  debug('eval:', func.args.js)
  return Promise.resolve(eval(func.args.js)).then(out => {
    const content = out ?? ''
    debug('eval result:', content)
    // note functionResponse parts are sent w/ role 'user'; the api rejects
    // the (legacy) role 'function' as of gemini-3.x models
    return { role: 'user', parts: [{ functionResponse: {
      name: func.name, response: { name: func.name, content } } }] }
  })
}

async function run_chat_agent(messages, config = {}) {
  config.model ||= 'gemini-3.7-flash' // https://ai.google.dev/gemini-api/docs/models
  config.name ||= config.model // use model as default agent name

  // get api key from config, global store, or user (via _modal)
  config.api_key ||= await get_api_key()
  if (!config.api_key) fatal(`missing api key`)

  const contents = convert_messages(messages, config)

  // run agent until it no longer returns tool calls
  // note we allow resuming from a tool call
  let msg = last(contents)?.parts.some(p => p.functionCall) ? last(contents) : null
  let msg_text = [] // agent message text
  while (!msg || msg.parts.some(p => p.functionCall)) {
    for (const part of msg?.parts.filter(p => p.functionCall) ?? []) {
      const tool_msg = await eval_tool(part)
      contents.push(tool_msg) // include tool output in request below
      msg_text.push(`\<<tool('${part.functionCall.name}')>>\n` +
        block('message', JSON.stringify(tool_msg)))
    }
    const request = create_request(contents, config)
    console.debug('gemini request', request)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`
    const response = await fetch_json(url, request)
    console.debug('gemini response', response)
    msg = parse_response(response)
    contents.push(msg) // for any additional requests
    msg_text.push(render_message(msg, config.name))
  }
  return msg_text.join('\n')
}

const get_api_key = async () => _item('$id').global_store.api_key ??= await _modal({
  content:`${_item('$id').name} needs your [Gemini API key](https://aistudio.google.com/app/apikey)`,
  confirm: 'Use API Key',
  cancel:  'Cancel',
  input:   ''
})

function _test_convert_messages() {
  const config = { system: 'sys0' }
  const fn_response = [{ functionResponse: { name: 'eval', response: { name: 'eval', content: 2 } } }]
  const contents = convert_messages([
    { role: 'system', content: 'sys1', name: 'n', item: '#x' },
    { role: 'user', content: 'hello', name: 'n', item: '#x' },
    { role: 'agent', content: 'hi', item: '#x' },
    { role: 'function', parts: fn_response, item: '#x' },
  ], config)
  check(
    () => equal(contents, [
      { role: 'user', parts: [{ text: 'hello' }] },
      { role: 'model', parts: [{ text: 'hi' }] },
      { role: 'user', parts: fn_response }, // parts preserved, legacy role normalized
    ]),
    () => config.system == 'sys0\nsys1',
    () => throws(() => convert_messages([{ role: 'user' }], {})), // missing content/parts
    () => throws(() => convert_messages([{ role: 'system', content: 'sys' }], {})), // no messages left
  )
}
const _test_convert_messages_functions = ['convert_messages']

function _test_create_request() {
  const request = create_request(
    [{ role: 'user', parts: [{ text: 'hi' }] }],
    { model: 'gemini-3.7-flash', api_key: 'KEY', name: 'x', system: 'sys', temperature: 0 })
  const body = JSON.parse(request.body)
  check(
    () => request.method == 'POST',
    () => body.system_instruction.parts.text == 'sys',
    () => body.temperature === 0,
    // model and api_key go into url, name and system are reserved
    () => body.model === undefined && body.api_key === undefined,
    () => body.name === undefined && body.system === undefined,
    () => equal(body.contents, [{ role: 'user', parts: [{ text: 'hi' }] }]),
    () => body.tools[0].functionDeclarations[0].name == 'eval',
  )
}
const _test_create_request_functions = ['create_request']

function _test_parse_response() {
  const text = { role: 'model', parts: [{ text: 'hello!' }] }
  const tool = { role: 'model', parts: [{ functionCall: { name: 'eval', args: { js: '1+1' } } }] }
  check(
    () => equal(parse_response({ candidates: [{ content: text }], usageMetadata: {} }), text),
    () => equal(parse_response({ candidates: [{ content: tool }] }), tool),
    () => throws(() => parse_response({ error: { message: 'bad key' } })),
    () => throws(() => parse_response({ candidates: [] })),
    () => throws(() => parse_response({ candidates: [{ content: { role: 'user', parts: [] } }] })),
    () => throws(() => parse_response({ candidates: [{ content: { role: 'model' } }] })),
  )
}
const _test_parse_response_functions = ['parse_response']

function _test_render_message() {
  const text = { role: 'model', parts: [{ text: 'hello!' }] }
  const tool = { role: 'model', parts: [{ functionCall: { name: 'eval', args: { js: '1' } } }] }
  check(
    () => render_message(text, 'gemini') == `\<<agent('gemini')>>\nhello!`,
    () => render_message(tool, 'gemini').startsWith(`\<<_agent('gemini')>>\n`),
    () => render_message(tool, 'gemini').includes('functionCall'),
  )
}
const _test_render_message_functions = ['render_message']

async function _test_eval_tool() {
  const msg = await eval_tool({ functionCall: { name: 'eval', args: { js: '1+1' } } })
  check(
    () => equal(msg, { role: 'user', parts: [{ functionResponse: {
      name: 'eval', response: { name: 'eval', content: 2 } } }] }),
    () => throws(() => eval_tool({ functionCall: { name: 'other' } })),
    () => throws(() => eval_tool({ functionCall: { name: 'eval', args: {} } })),
  )
}
const _test_eval_tool_functions = ['eval_tool']

// live smoke test against the api w/ default model, excluded from default runs
// run via /test #agent/chat/gemini live; requires api key (see get_api_key)
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
// verifies the full tool loop: functionCall response -> eval_tool -> functionResponse -> reply
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