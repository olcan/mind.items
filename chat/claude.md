#chat/claude #_agent/chat/claude
<<command_table()>>
```js:js_removed
// => /claude [msg]
// send `msg` to [claude agent](#agent/chat/claude)
function _on_command_claude(msg) {
  let suffix = 0
  while (_exists('#chat/claude/' + suffix)) suffix++
  const name = '#chat/claude/' + suffix
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
```js:agent
{ // https://docs.anthropic.com/en/api/messages
  model: 'claude-3-5-sonnet-20240620',
  temperature: 1
}
```