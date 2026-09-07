#chat/supervisor #_agent/vault/supervisor
<<command_table()>>
```js:js_removed
// => /supervisor [msg]
// send `msg` to the `supervisor` persona of the [vault agent](#agent/vault) on the vault host
// (claude-opus-5, registry cost limit $5): read-only at the vault root with the supervisor
// tools (list and stop runs, post status, retire proposals); as _chat_command, but created
// items also tag #_agent/vault/supervisor explicitly, since the vault bridge parses item text
// only; see #agent/vault for the protocol
const _on_command_supervisor = msg => {
  let suffix = 0
  while (_exists(_name + '/' + suffix)) suffix++
  const name = _name + '/' + suffix
  return {
    text: [name + ' #_agent/vault/supervisor', `\<<user>> ` + msg].join('\n'),
    edit: window['_mindbox_event']?.shiftKey, // edit if shift held
    init: item => MindBox.set(item.name, { scroll: true }),
  }
}
```
#_listen