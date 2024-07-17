#chat/gpt #_agent/chat/gpt
<<command_table()>>
```js:js_removed
// => /gpt [msg]
// send `msg` to [gpt agent](#agent/chat/gpt)
const _on_command_gpt = msg => _chat_command(msg)
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // https://platform.openai.com/docs/api-reference/chat/create
  model: 'gpt-4o', // https://platform.openai.com/docs/models
  temperature: 1
}
```