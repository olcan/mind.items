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
  // model: 'openai/gpt-oss-120b', // https://console.groq.com/docs/models
  model: 'qwen/qwen3.8-27b',
  temperature: 1,
  reasoning_effort: 'high', // max supported ('none'|'default'|'low'|'medium'|'high')
  // tool_choice: 'auto', // uncomment to enable 'eval' tool
  // converter: js_eval_converter // from #template/tool_use
}
```