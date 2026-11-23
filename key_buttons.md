#key_buttons shows the keys that navigate items as buttons, on a device without a keyboard: a row at the page's lower right, beside the `#vault` item's sparkle. A press sends the key, and the app does with it what it does from a keyboard.
- **←** **↑** **↓** **→** move from the item the box names: to its previous sibling, its parent, its first child, its next sibling.
- an arrow that would move in the named item's tree lights up green (the search highlight's green) and updates live as the box or the items change; with no single item named, none is lit.
- **+** is Shift+Enter: a new item, under the named item when the box names one (a chat's reply).
- the **arrow up to a bar** is Ctrl+Alt+Up: the page scrolls to its top. The **arrow down to a ring** is Ctrl+Alt+Down: back to the position that left, else to the named item.
- the row shows where the primary pointer is a finger (a phone, a tablet), and hides while the on-screen keyboard is up.
- while the keyboard is up, a short row just above it: the **arrows to a bar** are Shift+Tab and Tab, the editor's outdent and indent of the caret's line, and the **tick** is Shift+Enter: an item's editor saves, the box creates. The row is for the app's editors (an item's, and the box): the keyboard of any other field gets none.
- on such a device, **Shift+Space** in an editor is a Tab.
- on every device, a round **reload** button at the page's lower left, across from the `#vault` item's sparkle: one press reloads the page, and asks first when an edit is not saved or a save is not finished (on an app that cannot say, it asks every time).
- on a device with a keyboard (where the main row is hidden), the lit arrows — and only those — show at the page's lower left around the reload button: **↑** and **↓** stacked above it (up on top), **←** and **→** in a row to its right (left first); when none would move, the reload button shows alone.

```js_removed:key_buttons.js
// key_buttons.js
```

#_welcome #_listen
