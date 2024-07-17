#chat/groq_tools #_agent/chat/groq
<<command_table()>>
```js:js_removed
// => /groq_tools [msg]
// send `msg` to [groq agent](#agent/chat/groq)
const _on_command_groq_tools = msg => _chat_command(msg)
```
#_listen
<<system>>
---
```js:agent
{ // https://console.groq.com/docs/api-reference#chat-create
  // model: 'llama3-groq-70b-8192-tool-use-preview', // https://console.groq.com/docs/models
  model: 'llama3-groq-8b-8192-tool-use-preview',
  temperature: 1,
  tool_choice: 'auto', // enable groq tools
}
```