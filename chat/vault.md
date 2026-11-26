#chat/vault #_agent/vault
<<command_table()>>
```js:js_removed
// where a creation opens the new item's editor (shift held), its caret stands at the END of the
// text, where the message goes on (after a plain /vault, one space after the user macro), as a
// child created under a chat has it: the app puts the caret of an item that a command generated
// at its start. The app focuses the editor's own field and sets that caret in ONE step of the
// page's update, so this waits for that field's focus and moves the caret right after that step,
// before the page can take a key (a job queued at the focus runs when the step that focused
// ends): a first character typed at once goes where the caret is seen, and a selection made
// later is never moved. Only the editor's own field, by its id: a field in the item's drawn
// text is left alone. Asked for only where the creation opened the editor (the item is being
// edited when the app hands it over); the wait for the focus ends with the page's update
// (_update_dom: the app's step, then two frames)
const _caret_to_end = item => {
  const id = 'textarea-' + item.id
  const done = () => document.removeEventListener('focusin', focused, true)
  const focused = e => {
    const field = e.target
    if (field?.id != id) return
    done()
    queueMicrotask(() => void (field.selectionStart = field.selectionEnd = field.value.length))
  }
  document.addEventListener('focusin', focused, true)
  _update_dom().then(done)
}

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
    mindbox_text: name, // apply the new chat's query in the same step as creation (avoids MindBox.set debounce)
    init: item => {
      if (!item) return // (a creation that was refused: the app has said so, and there is no item to name)
      if (item.editing) _caret_to_end(item) // (only the edit this creation opened: a later edit of the item keeps its own caret)
      if (MindBox.get().trim().toLowerCase() == item.name.toLowerCase() || window['__item']?.(item.id)?.target) {
        MindBox.elem.blur() // leave the box unfocused as MindBox.set did (avoids debouncing later changes)
        MindBox.scroll_to_target() // creation runs with layout scrolling disabled, so scroll explicitly once rendered
      } else {
        MindBox.set(item.name, { scroll: true }) // command ran without the box (e.g. a clicked link): navigate as before
      }
    },
  }
}
```
#_listen