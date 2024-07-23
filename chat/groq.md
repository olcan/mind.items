#chat/groq #_agent/chat/groq
<<command_table()>>
```js:js_removed
// => /groq [msg]
// send `msg` to [groq agent](#agent/chat/groq)
const _on_command_groq = msg => _chat_command(msg)
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // https://console.groq.com/docs/api-reference#chat-create
  // model: 'llama3-70b-8192', // https://console.groq.com/docs/models
  model: 'llama-3.1-70b-versatile',
  temperature: 1,
  // tool_choice: 'none', // uncomment if using groq tools
  // converter: js_eval_converter // from #template/tool_use
}
```