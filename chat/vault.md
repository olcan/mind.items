#chat/vault #_agent/vault
<<command_table()>>
```js:js_removed
// => /vault [msg]
// send `msg` to [vault agent](#agent/vault) on the vault host
// as _chat_command, but created items also tag #_agent/vault explicitly,
// since the vault bridge parses item text only (no web-side dependency
// resolution); see #agent/vault for the protocol
const _on_command_vault = msg => {
  let suffix = 0
  while (_exists(_name + '/' + suffix)) suffix++
  const name = _name + '/' + suffix
  return {
    text: [name + ' #_agent/vault', `\<<user>> ` + msg].join('\n'),
    edit: window['_mindbox_event']?.shiftKey, // edit if shift held
    init: item => MindBox.set(item.name, { scroll: true }),
  }
}
```
#_listen