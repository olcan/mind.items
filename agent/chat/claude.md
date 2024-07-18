#agent/chat/claude responds using [Claude Chat API](https://docs.anthropic.com/en/api/messages).

```js_input_removed
run_on_dependents()
```

```js:js_removed
async function run_chat_agent(messages, config) {
  config.model ||= 'claude-3-5-sonnet-20240620' // https://docs.anthropic.com/en/docs/about-claude/models
  config.name ||= config.model // use model as default agent name

  // get api key from config, global store, or user (via _modal)
  config.api_key ||= await get_api_key()
  if (!config.api_key) fatal(`missing api key`)

  // convert messages to anthropic/claude format
  // see https://docs.anthropic.com/en/api/messages
  // convert 'role' _?agent -> assistant, move system -> config.system
  // delete 'name' and 'item' from all messages
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

  // run agent until it no longer returns tool calls
  // note we allow resuming from a tool call
  let msg = last(messages)?.content.some?.(c=>c.type=='tool_use') ?
    last(messages) : null
  let msg_text = [] // agent message text
  while (!msg || msg.content.some?.(c=>c.type=='tool_use')) {
    for (const tool of msg?.content.filter(c=>c.type=='tool_use') ?? []) {
      const args = tool.input
      if (tool.name == 'eval') {
        if (!args?.js) fatal(`${name}: missing arg (js) for eval`)
        debug('eval:', args.js)
        const content = eval(args.js) ?? ''
        debug('eval result:', content)
        const msg = {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: tool.id,
            // must be string (or array of content blocks), so we stringify any non-string eval output; see https://docs.anthropic.com/en/docs/build-with-claude/tool-use#example-of-successful-tool-result
            content: is_string(content) ? content : JSON.stringify(content)
          }]
        }
        messages.push(msg) // include tool output in request below
        msg_text.push(`\<<tool('${tool.name}')>>\n` +
          block('message', JSON.stringify(msg)))
      } else fatal(`${name}: invalid tool ${tool.name}`)
    }
    const request = create_request(messages, config)
    console.debug('claude request', request)
    // anthropic (unlike others) disallows CORS, so we are forced to use proxy
    // see https://github.com/anthropics/anthropic-sdk-typescript/issues/219
    // note we avoid '://' in proxy url that can cause a body-dropping redirect
    // TODO: unfortunately this redirect _still_ fails on non-localhost
    // For debugging, here is an offending fetch that you can run in console
    // fetch('/proxy/https:/api.anthropic.com/v1/messages', {
    // 	method: 'POST',
    // 	redirect: 'error',
    // 	headers: {
    // 	    'x-api-key': 'API_KEY_HERE',
    // 	    'anthropic-version': '2023-06-01',
    // 	    'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15',
    // 	    'content-type': 'application/json'
    // 	},
    //   	body: JSON.stringify({"max_tokens":4096,"model":"claude-3-5-sonnet-20240620","temperature":1,"system":" ","messages":[{"role":"user","content":" hello"}],"tools":[{"name":"eval","description":"evaluate js code in browser on user device","input_schema":{"type":"object","properties":{"js":{"type":"string","description":"js code to evaluate"}},"required":["js"]}}]})
    // }).then(response => {
    // 	console.log(response)
    // }).then(text=>console.log(text))

    const url = '/proxy/https:/api.anthropic.com/v1/messages'
    const response = await fetch_json(url, request)
    console.debug('claude response', response)
    if (response.error) fatal(response.error.message)
    msg = pick(response, ['role','content']) // response is the message
    if (!msg) fatal(`missing agent message`)
    if (msg.role != 'assistant') fatal(`unexpected agent role ${msg.role}`)
    if (!msg.content) fatal(`invalid agent message`, msg)
    messages.push(msg) // for any additional requests
    msg_text.push(msg.content.some?.(c=>c.type=='tool_use') ?
      `\<<_agent('${config.name}')>>\n` + block('message', JSON.stringify(msg)) : 
      `\<<agent('${config.name}')>>\n` + msg.content.map(c=>c.text ?? '').join(''))
  }
  return msg_text.join('\n')
}

const get_api_key = async () => _item('$id').global_store.api_key ??= await _modal({
  content:`${_item('$id').name} needs your [Anthropic API key](https://console.anthropic.com/settings/keys)`,
  confirm: 'Use API Key',
  cancel:  'Cancel',
  input:   ''
})

const create_request = (messages, config) => ({
  method:'POST',
  headers: {
    'x-api-key': config.api_key,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    max_tokens: 4096, // required, and 4096 is max for all models (see models page)
                      //   actually 3.5-sonnet now allows 8192 if needed
                      //   see https://x.com/alexalbert__/status/1812921642143900036
    ...omit(config, 'name', 'api_key'),
    // model: https://docs.anthropic.com/en/docs/about-claude/models
    // system: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts
    messages,
    // https://docs.anthropic.com/en/api/messages
    // example 'eval' tool
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
```