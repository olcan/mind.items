#chat/fable_wt #_agent/vault/fable_wt
<<command_table()>>
```js:js_removed
// => /fable_wt [msg]
// send `msg` to the WRITABLE `fable_wt` persona of the [vault agent](#agent/vault) on the
// vault host (Claude Fable 5.1 at max effort, registry cost limit $10); as
// _chat_command, but created items also tag #_agent/vault/fable_wt explicitly,
// since the vault bridge parses item text only (no web-side dependency
// resolution); see #agent/vault for the protocol
const _on_command_fable_wt = msg => {
  let suffix = 0
  while (_exists(_name + '/' + suffix)) suffix++
  const name = _name + '/' + suffix
  return {
    text: [name + ' #_agent/vault/fable_wt', `\<<user>> ` + msg].join('\n'),
    edit: window['_mindbox_event']?.shiftKey, // edit if shift held
    init: item => MindBox.set(item.name, { scroll: true }),
  }
}
```
#_listen