#chat/groq #_agent/chat/groq
<<command_table()>>
```js:js_removed
// => /groq [msg]
// send `msg` to [groq agent](#agent/chat/groq)
const _on_command_groq = msg => _chat_command(msg)
```
#_listen #_template/tool_use
<<system>> <<toggle(template('/tool_use'), '⋮ #template/tool_use')>>
<!-- groq gemma2 is very inconsistent about if/when to use tools, so we try ... -->
- Make sure to use tools (e.g. eval tool) when helpful to the user.
---
```js:agent
{ // https://console.groq.com/docs/api-reference#chat-create
  model: 'gemma2-9b-it', // https://console.groq.com/docs/models
  temperature: 1,
  // tool_choice: 'none', // uncomment if using groq tools
  converter: js_eval_converter // from #template/tool_use
}
```