#key_buttons shows the keys that navigate items as buttons, on a device without a keyboard: a row at the page's lower right, beside the `#vault` item's sparkle. A press sends the key, and the app does with it what it does from a keyboard.
- **←** **↑** **↓** **→** move from the item the box names: to its previous sibling, its parent, its first child, its next sibling.
- the arrow lights are hints from the named item's tree (green where the tree has a move, dimmed where not; still clickable), not an exact replay of the keys — the app can still step through a grandparent's tags or to the first visible item from an empty box when an arrow is dimmed, and Down can stay lit while the named item is open for editing. With no single item named, all four are dimmed; other buttons never change.
- **+** is Shift+Enter: a new item, under the named item when the box names one (a chat's reply).
- the **arrow up to a bar** is Ctrl+Alt+Up: the page scrolls to its top. The **arrow down to a ring** is Ctrl+Alt+Down: back to the position that left, else to the named item.
- the row shows where the primary pointer is a finger (a phone, a tablet), and hides while the on-screen keyboard is up.
- while the keyboard is up, a short row just above it: the **arrows to a bar** are Shift+Tab and Tab, the editor's outdent and indent of the caret's line, and the **tick** is Shift+Enter: an item's editor saves, the box creates. The row is for the app's editors (an item's, and the box): the keyboard of any other field gets none.
- on such a device, **Shift+Space** in an editor is a Tab.
- on every device, a round **reload** button at the page's lower left, across from the `#vault` item's sparkle: one press reloads the page, and asks first when an edit is not saved or a save is not finished (on an app that cannot say, it asks every time).
- on a device with a keyboard (where the main row is hidden), all four arrows stay in place around the reload button — **↑** and **↓** stacked above it (up on top), **←** and **→** in a row to its right (left first) — carrying the same tree hints; while any item is open for editing, clicking a desktop arrow sends nothing so an open edit is never closed or discarded.
- a dark frosted-glass background sits behind the buttons, rejecting presses that start on bare glass outside the buttons' boxes while letting scrolling over it work as before: a full-width bottom strip while the main row shows on a phone; on a device with a keyboard, a rounded piece behind the lower-left controls and a matching piece behind the `#vault` sparkle when shown, merging into a full-width strip in a narrow window.

```js_removed:key_buttons.js
// key_buttons.js
```

#_welcome #_listen
