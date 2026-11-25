#shortcuts shows the keyboard shortcuts that items have added, in one menu.
- **?** opens the menu while no field has the focus and no other dialog is open. In a field (the box, an item's editor, any other input) the same key opens it with Ctrl, Alt or Cmd held. The same key, Escape or Enter closes it, and so does a click beside it.
- in the menu, the left and right arrows (or Tab) switch its lists, and the up and down arrows, the page keys, Space, Home and End move a long one.
- the menu opens on **now**: the shortcuts that would do something at this moment, where the key was pressed (in the window, when no text field has the focus; in the box; in an item's editor). The buttons at its top are **now** and the lists of reference: every shortcut of the window, of the box, of an editor, or all of them, each with its condition where the item gave one.
- the shortcuts stand in sections, usually one for each item that adds some.
- an item adds its shortcuts by writing a list under a section's name, whenever its own code runs: `(window._shortcuts ??= {})['my section'] = [{ keys: 'g', does: 'what the key does', when: 'when it applies', active: () => true, context: 'window' }]`. `context`, `active` and `when` can be left out. A context is `window` (the default), `box`, `editor` or `all`, or a list of them. `active` is a test of whether the key would do something at this moment. It is asked once, at the key that opens the menu, while the page's focus and selection are still as they were, and its answer stands while the menu is up: without one, the shortcut counts as active wherever its context is, and a test that fails counts as a no. `when` says the condition in words, for the lists of reference. A section's name and an entry's texts are shown as plain text. Writing a section again replaces it, and an item that takes its shortcuts back writes an empty list: a section stays until then, or until the page is reloaded.

```js_removed:shortcuts.js
// shortcuts.js
```

#_welcome
