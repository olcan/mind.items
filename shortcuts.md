#shortcuts shows the keyboard shortcuts that items have added, in one menu.
- **?** (Shift with the slash key) opens the menu while no text field has the focus. In a text field (the box, an item's editor) the same key opens it with Ctrl, Alt or Cmd held. The same key or Escape closes it, and so does a click beside it.
- the menu shows the shortcuts of the context the key was pressed in: the window (no text field has the focus), the box, or an item's editor. The buttons at its top switch to another context, or to all of them.
- the shortcuts stand in sections, usually one for each item that adds some.
- an item adds its shortcuts by writing a list under a section's name, whenever its own code runs: `(window._shortcuts ??= {})['my section'] = [{ keys: 'g', does: 'what the key does', when: 'when it applies', context: 'window' }]`. `when` and `context` can be left out. A context is `window` (the default), `box`, `editor` or `all`, or a list of them. Writing a section again replaces it.

```js_removed:shortcuts.js
// shortcuts.js
```

#_welcome
