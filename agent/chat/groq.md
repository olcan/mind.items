#agent/chat/groq responds using [Groq Chat API](https://console.groq.com/docs/api-reference#chat). #todo add/test new groq tool use model support

```js_input_removed
run_on_dependents()
```

```js:js_removed
async function run_chat_agent(messages, config) {
  config.model ||= 'gemma2-9b-it' // https://console.groq.com/docs/models
  config.name ||= config.model // use model as default agent name

  // get api key from config, global store, or user (via _modal)
  config.api_key ||= await get_api_key()
  if (!config.api_key) fatal(`missing api key`)

  // convert messages to groq (openai) format
  // convert 'role' _?agent -> assistant
  // delete 'name' from non-tool messages
  // delete 'item' from all messages
  each(messages, msg => {
    if (msg.role.match(/_?agent/)) msg.role = 'assistant'
    if (msg.role != 'tool') delete msg.name
    delete msg.item
  })
  if (empty(messages)) fatal('groq requires at least one user or system message')

  // run agent until it no longer returns tool calls
  // note we allow resuming from a tool call
  let msg = last(messages)?.tool_calls ? last(messages) : null
  let msg_text = [] // agent message text
  while (!msg || msg.tool_calls) {
    for (const tool of msg?.tool_calls ?? []) {
      const id = tool.id
      const func = tool.function
      const args = JSON.parse(func.arguments)
      if (func.name == 'eval') {
        if (!args?.js) fatal(`${name}: missing arg (js) for eval`)
        debug('eval:', args.js)
        const content = await eval(args.js) ?? '' // resolve promise, replace nullish
        debug('eval result:', content)
        let msg = {
          role: 'tool',
          tool_call_id: id,
          name: func.name,
          content: JSON.stringify(content)
        }
        if (config.converter) msg = config.converter(msg)
        msg_text.push(`\<<tool('${func.name}')>>\n` +
          block('message', JSON.stringify(msg)))
        messages.push(msg) // include tool output in request below
      } else fatal(`${name}: invalid function ${func.name}`)
    }
    const request = create_request(messages, config)
    debug('groq request', request)
    const url = 'https://api.groq.com/openai/v1/chat/completions'
    const response = await fetch_json(url, request)
    debug('groq response', response)
    if (response.error) fatal(response.error.message)
    msg = response.choices?.[0]?.message
    if (!msg) fatal(`missing agent message`)
    if (msg.role != 'assistant') fatal(`unexpected agent role ${msg.role}`)
    if (!msg.content && !msg.tool_calls) fatal(`invalid agent message`, msg)
    if (config.converter) msg = config.converter(msg)
    messages.push(msg) // for any additional requests
    msg_text.push(msg.tool_calls ?
      `\<<_agent('${config.name}')>>\n` + block('message', JSON.stringify(msg)) : 
      `\<<agent('${config.name}')>>\n` + msg.content)
  }
  return msg_text.join('\n')
}

const get_api_key = async () => _item('$id').global_store.api_key ??= await _modal({
  content:`${_item('$id').name} needs your [Groq API key](https://console.groq.com/keys)`,
  confirm: 'Use API Key',
  cancel:  'Cancel',
  input:   ''
})

const create_request = (messages, config) => ({
  method:'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + config.api_key
  },
  body: JSON.stringify({
    ...omit(config, 'name', 'api_key', 'converter'),
    // model: https://platform.openai.com/docs/models
    messages,
    // https://console.groq.com/docs/tool-use
    // as of 7/10/24, groq's tool use on gemma2 was problematic: used eval tool on every request and simply to console.log or print the response, ignoring system instructions against that behavior; so we do custom tool use as in ollama for now, but we allow switching based on config.tool_choice being defined (can be 'auto' or 'none')
    // example 'eval' tool
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
```