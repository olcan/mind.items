#chat/openrouter #_agent/chat/openrouter
<<command_table()>>
```js:js_removed
// => /openrouter [msg]
// send `msg` to [openrouter agent](#agent/chat/openrouter)
const _on_command_openrouter = msg => _chat_command(msg)
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // https://openrouter.ai/models
  // model: 'anthropic/claude-sonnet-5',
  // model: 'openai/gpt-5.6-terra',
  model: 'google/gemini-3.7-flash',
  temperature: 1,
  // tool_choice: 'auto', // uncomment to enable 'eval' tool
}
```
