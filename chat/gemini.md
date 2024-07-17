#chat/gemini #_agent/chat/gemini
<<command_table()>>
```js:js_removed
// => /gemini [msg]
// send `msg` to [gemini agent](#agent/chat/gemini)
function _on_command_gemini(msg) {
  let suffix = 0
  while (_exists('#chat/gemini/' + suffix)) suffix++
  const name = '#chat/gemini/' + suffix
  return {
    text: [name, '\<<user>> ' + msg].join('\n'),
    mindbox_text: name, // select new item
    save: false // can interfere with agent saving response
  }
}
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```agent
{ // https://ai.google.dev/api/rest/v1beta/models/generateContent
  model: 'gemini-1.5-flash', // https://ai.google.dev/gemini-api/docs/models/gemini
  generationConfig: { // https://ai.google.dev/api/rest/v1beta/GenerationConfig
    temperature: 1
  }
}
```