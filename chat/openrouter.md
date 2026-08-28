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
  // note model availability depends on account provider/privacy settings,
  // see https://openrouter.ai/settings/privacy
  // model: 'moonshotai/kimi-k3',
  // model: 'google/gemini-3.7-flash',
  model: 'z-ai/glm-5.3',
  temperature: 1,
  reasoning: { effort: 'max' }, // openrouter unified reasoning param
  // tool_choice: 'auto', // uncomment to enable 'eval' tool
}
```