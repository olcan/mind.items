#chat/gpt #_agent/chat/gpt
<<command_table()>>
```js:js_removed
// => /gpt [msg]
// send `msg` to [gpt agent](#agent/chat/gpt)
function _on_command_gpt(msg) {
  let suffix = 0
  while (_exists('#chat/gpt/' + suffix)) suffix++
  const name = '#chat/gpt/' + suffix
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
{ // https://platform.openai.com/docs/api-reference/chat/create
  model: 'gpt-4o', // https://platform.openai.com/docs/models
  temperature: 1
}
```