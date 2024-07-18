#agent/chat/ollama responds using [Ollama Chat API](https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion). Requires [ollama](https://ollama.com) running locally, with `ollama pull <model>` to fetch model, and `launchctl setenv OLLAMA_ORIGINS "https://local.dev"` to enable requests from `local.dev`. To set this persistently, create an app (e.g. `Ollama_local_dev`) using Automator that runs `setenv` before launching `Ollama` app, and use that to replace `Ollama` in login items.

```js_input_removed
run_on_dependents()
```

```js:js_removed
async function run_chat_agent(messages, config) {
  let host = config.host || 'localhost'
  let port = config.port || 11434
  let url = config.url || `http://${host}:${port}/api/chat`
  ;({ host, port } = new URL(url))
  if (_is_local(host) && !_is_local(location.host))
    fatal('ollama server is local but client is not')
  if (url.startsWith('http://')) url = '/proxy/' + url // proxy http
  // if proxying, avoid '://' that can cause a body-dropping redirect
  if (url.startsWith('/proxy/')) url = url.replace('://',':/')

  // note default model requires 'ollama pull <name>'
  config.model ||= 'gemma2' // https://ollama.com/library
  config.name ||= config.model // use model as default agent name

  // convert messages to openai format
  // convert 'role' _?agent -> assistant, tool -> user
  // delete 'name' from non-tool messages
  // delete 'item' from all messages
  each(messages, msg => {
    if (msg.role.match(/_?agent/)) msg.role = 'assistant'
    if (msg.role == 'tool') msg.role = 'user'
    if (msg.role != 'tool') delete msg.name
    delete msg.item
  })

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
    debug('ollama request', request)
    // proxy requires launchctl setenv OLLAMA_ORIGINS "https://local.dev"
    // see https://github.com/ollama/ollama/blob/main/docs/faq.md#how-can-i-allow-additional-web-origins-to-access-ollama
    const response = await fetch_json(url, request)
    debug('ollama response', response)
    if (response.error) fatal(response.error.message)
    msg = response.message
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

const create_request = (messages, config) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  // https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
  body: JSON.stringify({
    ...omit(config, 'name', 'converter'), // model: https://ollama.com/library
    stream: false, // disable streaming
    messages,
  })
})
```