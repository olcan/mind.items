#shortcuts shows the keyboard shortcuts that items have added, in one menu.
- **?** (Shift with the slash key) opens the menu while no text field has the focus. In a text field (the box, an item's editor) the same key opens it with Ctrl, Alt or Cmd held. The same key or Escape closes it, and so does a click beside it.
- the menu opens on **now**: the shortcuts that would do something at this moment, where the key was pressed (in the window, when no text field has the focus; in the box; in an item's editor). The buttons at its top switch to the lists of reference: every shortcut of the window, of the box, of an editor, or all of them, each with the condition it needs.
- the shortcuts stand in sections, usually one for each item that adds some.
- an item adds its shortcuts by writing a list under a section's name, whenever its own code runs: `(window._shortcuts ??= {})['my section'] = [{ keys: 'g', does: 'what the key does', when: 'when it applies', active: () => true, context: 'window' }]`. `context`, `active` and `when` can be left out. A context is `window` (the default), `box`, `editor` or `all`, or a list of them. `active` is a test of whether the key would do something at this moment, asked when the menu opens: without one, the shortcut counts as active wherever its context is. `when` says the condition in words, for the lists of reference. Writing a section again replaces it.

```js_removed:shortcuts.js
// shortcuts.js
```

#_welcome
