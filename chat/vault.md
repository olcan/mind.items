#chat/vault #_agent/vault
<<command_table()>>
```js:js_removed
// => /vault [msg]
// send `msg` to the [vault agent](#agent/vault) on the vault host: the Fable supervisor that
// gets the work done through a worker in the chat's own worktree (the one vault command since
// 2026-09-10); as _chat_command, but created items also tag #_agent/vault explicitly (a
// chained `…/N` item created under it later inherits the route through the chat lineage, on
// the vault side and in #vault alike, so it needs no tag); the bridge parses item text (no web-side dependency
// resolution); see #agent/vault for the protocol
const _on_command_vault = msg => {
  let suffix = 0
  while (_exists(_name + '/' + suffix)) suffix++
  const name = _name + '/' + suffix
  return {
    text: [name + ' #_agent/vault', `\<<user>> ` + msg].join('\n'),
    edit: window['_mindbox_event']?.shiftKey, // edit if shift held
    init: item => {
      MindBox.set(item.name, { scroll: true })
      // where the creation opened the item's editor (shift held), its caret goes to the END of
      // the text, where the message goes on (after a plain /vault, one space after the user
      // macro), as a child created under a chat has it: the app puts the caret of an item that a
      // command generated at its start. The app places it at the next svelte tick; _update_dom
      // waits for that tick and two frames, so this comes after it. No editor, nothing done
      _update_dom().then(() => {
        const textarea = item.elem?.querySelector('textarea')
        if (textarea) textarea.selectionStart = textarea.selectionEnd = textarea.value.length
      })
    },
  }
}
```
#_listen