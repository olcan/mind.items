#agent/chat/gemini responds using [Gemini Chat API](https://ai.google.dev/gemini-api/docs/get-started/tutorial?lang=rest#multi-turn_conversations_chat).

```js_input_removed
run_on_dependents()
```

```js:js_removed
async function run_chat_agent(messages, config) {
  config.model ||= 'gemini-1.5-flash' // https://ai.google.dev/gemini-api/docs/models/gemini
  config.name ||= config.model // use model as default agent name

  // get api key from config, global store, or user (via _modal)
  config.api_key ||= await get_api_key()
  if (!config.api_key) fatal(`missing api key`)

  // convert messages to gemini 'contents'
  // see https://ai.google.dev/gemini-api/docs/system-instructions?lang=rest
  // convert 'role' _?agent -> model, move system -> config.system
  // delete 'name' and 'item' from all messages
  // move 'content' into 'parts'
  const contents = messages // reuse message objects
  config.system = [ config.system /* predefined system prompt */ ]
  each(contents, msg => {
    if (msg.role.match(/_?agent/)) msg.role = 'model'
    if (msg.role == 'system') config.system.push(msg.content)
    delete msg.name
    delete msg.item
    // model role + functionCall part & function role + functionResponse part
    // will not have 'content' and should already have 'parts' instead
    if (msg.content) {
      msg.parts = [{ text:msg.content }]
      delete msg.content
    } else if (!msg.parts) fatal('invalid message missing parts', msg)
  })
  config.system = compact(flat(config.system)).join('\n')
  remove(contents, c => c.role == 'system') // drop system messages
  if (empty(contents)) fatal('gemini requires at least one user message')

  // run agent until it no longer returns tool calls
  // note we allow resuming from a tool call
  let msg = last(contents)?.parts.some(p=>p.functionCall) ? last(contents) : null
  let msg_text = [] // agent message text
  while (!msg || msg.parts.some(p=>p.functionCall)) {
    for (const tool of msg?.parts.filter(p=>p.functionCall) ?? []) {
      const func = tool.functionCall
      const args = func.args
      if (func.name == 'eval') {
        if (!args?.js) fatal(`${name}: missing arg (js) for eval`)
        debug('eval:', args.js)
        const content = eval(args.js) ?? ''
        debug('eval result:', content)
        const msg = { role: 'function', parts: [{ functionResponse: {
          name: func.name, response: { name: func.name, content } } }] }
        contents.push(msg) // include tool output in request below
        msg_text.push(`\<<tool('${func.name}')>>\n` +
          block('message', JSON.stringify(msg)))
      } else fatal(`${name}: invalid function ${func.name}`)
    }
    const request = create_request(contents, config)
    console.debug('gemini request', request)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.api_key}`
    const response = await fetch_json(url, request)
    console.debug('gemini response', response)
    if (response.error) fatal(response.error.message)
    msg = response.candidates?.[0]?.content
    if (!msg) fatal(`missing agent message`)
    if (msg.role != 'model') fatal(`unexpected agent role ${msg.role}`)
    if (!msg.parts) fatal(`invalid agent message`, msg)
    contents.push(msg) // for any additional requests
    msg_text.push(msg.parts.some(p=>p.functionCall) ?
      `\<<_agent('${config.name}')>>\n` + block('message', JSON.stringify(msg)) : 
      `\<<agent('${config.name}')>>\n` + msg.parts.map(p=>p.text ?? '').join(''))
  }
  return msg_text.join('\n')
}

const get_api_key = async () => _item('$id').global_store.api_key ??= await _modal({
  content:`${_item('$id').name} needs your [Gemini API key](https://aistudio.google.com/app/apikey)`,
  confirm: 'Use API Key',
  cancel:  'Cancel',
  input:   ''
})

const create_request = (contents, config) => ({
  method:'POST',
  headers: { 'Content-Type': 'application/json' },  
  body: JSON.stringify({
    // https://ai.google.dev/gemini-api/docs/system-instructions?lang=rest
    system_instruction: { parts:{ text: config.system } },
    ...omit(config, 'model', 'system', 'name', 'api_key'),
    contents,
    // https://ai.google.dev/gemini-api/docs/function-calling#expandable-7
    // example 'eval' tool
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
```