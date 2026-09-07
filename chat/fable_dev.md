#chat/fable_dev #_agent/vault/fable_dev
<<command_table()>>
```js:js_removed
// => /fable_dev [msg]
// send `msg` to the DEV `fable_dev` persona of the [vault agent](#agent/vault) on the
// vault host (Claude Fable 5.1 at max effort, registry cost limit $30): writable in
// the chat's worktree like /fable_wt, with the vault's web tools and the app
// submodules populated; as _chat_command, but created items also tag #_agent/vault/fable_dev
// explicitly, since the vault bridge parses item text only; see #agent/vault
const _on_command_fable_dev = msg => {
  let suffix = 0
  while (_exists(_name + '/' + suffix)) suffix++
  const name = _name + '/' + suffix
  return {
    text: [name + ' #_agent/vault/fable_dev', `\<<user>> ` + msg].join('\n'),
    edit: window['_mindbox_event']?.shiftKey, // edit if shift held
    init: item => MindBox.set(item.name, { scroll: true }),
  }
}
```
#_listen