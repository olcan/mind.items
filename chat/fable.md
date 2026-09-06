#chat/fable #_agent/vault
<<command_table()>>
```js:js_removed
// => /fable [msg]
// send `msg` to the `fable` persona of the [vault agent](#agent/vault) on the
// vault host (Claude Fable 5.1 at max effort, registry cost limit $10); as
// _chat_command, but created items tag #_agent/vault/fable explicitly (this
// item depends on #agent/vault itself: a persona tag names no installable item),
// since the vault bridge parses item text only (no web-side dependency
// resolution); see #agent/vault for the protocol
const _on_command_fable = msg => {
  let suffix = 0
  while (_exists(_name + '/' + suffix)) suffix++
  const name = _name + '/' + suffix
  return {
    text: [name + ' #_agent/vault/fable', `\<<user>> ` + msg].join('\n'),
    edit: window['_mindbox_event']?.shiftKey, // edit if shift held
    init: item => MindBox.set(item.name, { scroll: true }),
  }
}
```
#_listen