#chat/native #_agent/native
<<command_table()>>
```js:js_removed
// => /native [msg]
// send `msg` to [native agent](#agent/native) on the vault host
// as _chat_command, but created items also tag #_agent/native explicitly,
// since the native bridge parses item text only (no web-side dependency
// resolution); see #agent/native for the protocol
const _on_command_native = msg => {
  let suffix = 0
  while (_exists(_name + '/' + suffix)) suffix++
  const name = _name + '/' + suffix
  return {
    text: [name + ' #_agent/native', `\<<user>> ` + msg].join('\n'),
    edit: window['_mindbox_event']?.shiftKey, // edit if shift held
    init: item => MindBox.set(item.name, { scroll: true }),
  }
}
```
#_listen
