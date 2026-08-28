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
{ // https://platform.openai.com/docs/api-reference/responses
  // note reasoning (gpt-5+) models reject the temperature argument
  model: 'gpt-5.6-sol', // https://platform.openai.com/docs/models
  reasoning_effort: 'max', // max supported (responses api only)
  // reasoning_summary: 'auto', // uncomment to render thinking blocks
}
```