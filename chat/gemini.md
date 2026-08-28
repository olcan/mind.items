#chat/gemini #_agent/chat/gemini
<<command_table()>>
```js:js_removed
// => /gemini [msg]
// send `msg` to [gemini agent](#agent/chat/gemini)
const _on_command_gemini = msg => _chat_command(msg)
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // https://ai.google.dev/api/rest/v1beta/models/generateContent
  model: 'gemini-3.7-flash', // https://ai.google.dev/gemini-api/docs/models
  generationConfig: { // https://ai.google.dev/api/rest/v1beta/GenerationConfig
    temperature: 1
  }
}
```