// #key_buttons: the app's navigation keys as buttons on the page, for a device without a
// keyboard (the vault's todo of 2026-11-17: "arrow key buttons for navigating items ... overlays
// next to the sparkle overlay with similar style (but white not yellow)"). A press SENDS THE KEY:
// the keyboard events of a real press, dispatched on the element a real key would go to, so
// the app decides what the key does and on which item, exactly as for a keyboard (its window
// handler, `onKeyDown` in index.svelte, or the focused editor's first). Nothing of the app's
// navigation is copied here, and nothing changes in the app.
// Since the owner's first try on a phone (2026-11-17) the item has three more parts, each with
// a switch of its own (KEY_BUTTONS_PARTS): a short row just above the on-screen keyboard (Tab,
// Shift+Tab, Shift+Enter), Shift+Space as a Tab in an editor on a touch device, and a scroll
// that keeps the caret's line clear of a keyboard that comes up. They are built here so that
// they can be tried on the phone at once; each says below what the app's own version would be

// ---- what to adjust: the parts, the buttons, their icons, their size and their place -----------

// the three later parts, each on or off by itself: a part that is off draws nothing, listens to
// nothing and sends nothing. The main row (KEY_BUTTONS) has no switch: deleting the item is its
const KEY_BUTTONS_PARTS = {
  keyboard_row: true, // the short row just above the on-screen keyboard (KEY_BUTTONS_KEYBOARD_ROW)
  shift_space_tab: true, // Shift+Space in an editor of the app is a Tab, on a touch device
  caret_clear: true, // a keyboard that comes up over the caret's line: the page scrolls the line clear
}

// the buttons, in the row's order from left to right. `key` with `ctrl`, `alt` and `shift` is
// the key a press sends; `title` says what the app does at that key (the button's name for a
// screen reader, and its tooltip); `icon` is one path in a 16 by 16 box, drawn as a line
const KEY_BUTTONS = [
  // a bar and an arrow up to it: the page scrolls to its top (Back returns to the position)
  { name: 'top', key: 'ArrowUp', ctrl: true, alt: true, title: 'Scroll to the top (Ctrl+Alt+Up)', icon: 'M3 2.5h10M8 14V6.5M4.5 10L8 6.5l3.5 3.5' },
  // an arrow down to a ring, the item: the undo of the scroll to the top, else the named item
  { name: 'back', key: 'ArrowDown', ctrl: true, alt: true, title: 'Back down: to the position left, else to the named item (Ctrl+Alt+Down)', icon: 'M8 1.5V8M4.5 4.5L8 8l3.5-3.5M8 11.2a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3' },
  // a plus: a new item, the named item's child when the box names one (a chat's reply)
  { name: 'create', key: 'Enter', shift: true, title: 'New item, under the named item: a reply (Shift+Enter)', icon: 'M8 3v10M3 8h10' },
  { name: 'left', key: 'ArrowLeft', title: 'Previous sibling (Left)', icon: 'M13 8H3.5M7.5 4l-4 4 4 4' },
  { name: 'up', key: 'ArrowUp', title: 'Up: to the parent (Up)', icon: 'M8 13V3.5M4 7.5l4-4 4 4' },
  { name: 'down', key: 'ArrowDown', title: 'Down: to the first child (Down)', icon: 'M8 3v9.5M4 8.5l4 4 4-4' },
  { name: 'right', key: 'ArrowRight', title: 'Next sibling (Right)', icon: 'M3 8h9.5M8.5 4l4 4-4 4' },
]

// the row just above the on-screen keyboard, shown while the keyboard is up (the main row is
// hidden then), left to right: the keys one wants while typing. Tab and Shift+Tab are the
// editor's indent and outdent of the caret's line (two spaces); Shift+Enter is the editor's
// own: an item's editor saves and closes, the box creates. The tick says "done" for both
const KEY_BUTTONS_KEYBOARD_ROW = [
  // an arrow left to a bar, and an arrow right to a bar: the Tab key's own sign, both ways
  { name: 'outdent', key: 'Tab', shift: true, title: 'Outdent the line (Shift+Tab)', icon: 'M2.5 3v10M13.5 8H5.5M8.5 5l-3 3 3 3' },
  { name: 'indent', key: 'Tab', title: 'Indent the line (Tab)', icon: 'M13.5 3v10M2.5 8h8M7.5 5l3 3-3 3' },
  { name: 'done', key: 'Enter', shift: true, title: 'Done: save the item, or create from the box (Shift+Enter)', icon: 'M3 8.5l3.5 3.5L13 4.5' },
]

// the look, in CSS pixels: a row along the window's bottom edge that ends left of the #vault
// item's sparkle (a 24 px circle at right 14 and bottom 10, vault.md) and is centred on it. The
// sparkle's circle and shadow, white where the sparkle is yellow, and a size a thumb can hit
const KEY_BUTTONS_LOOK = {
  size: 32, // a button's width and height (the sparkle's is 24)
  gap: 6, // between two buttons: seven buttons take 7 * 32 + 6 * 6 = 260
  right: 46, // the row's right edge from the window's: past the sparkle (14 + 24) and a gap of 8
  bottom: 6, // the row's bottom edge from the window's: 10 + (24 - 32) / 2, the sparkle's centre line
  icon: 16, // an icon's width and height
  line: 1.6, // an icon's line width, in the icon's own 16 units
  color: '#fff', // the icons (the sparkle's are #f5e389)
  background: '#222', // the sparkle's
  pressed: '#555', // a button's background while a finger is on it
  layer: 88, // under the sparkle's menu and that menu's layer (90 and 89), over the app's own layers (10 at most)
  above: 6, // the keyboard row's bottom edge above the keyboard: above the bottom of what the keyboard leaves in view
  edge: 10, // the keyboard row's right edge from the right edge of what is in view (the sparkle is not shown then)
}
// the caret's line and a keyboard that comes up: the space kept free above and below the line
const KEY_BUTTONS_CARET = { margin: 8 }
// what Shift+Space sends to the editor
const KEY_BUTTONS_SHIFT_SPACE = { key: 'Tab' }

// which devices show the buttons: one whose primary pointer is a finger (a phone, a tablet).
// A desktop or a laptop, whose primary pointer is a mouse or a trackpad, never shows them,
// however narrow its window: it has the keys
const KEY_BUTTONS_DEVICE = '(pointer: coarse)'
// a visual viewport this much shorter than the window is a keyboard on the screen, probably:
// the sparkle's own number and test (VAULT_KEYBOARD_PX and vault_keyboard_open in vault.md;
// tests/key_buttons_test.js holds the two tests to the same answers)
const KEY_BUTTONS_KEYBOARD_PX = 150
const KEY_BUTTONS_TICK_MS = 15000 // the task's look: the item's deletion is noticed at its next run

// ---- the code -----------------------------------------------------------------------------

// this evaluation's code version: the item's text and its dependencies' (a controller drawn by
// other code is replaced; captured here, since a closure reads the item's hash as it is later)
const key_buttons_code = _this.deephash

// whether this item is the page's one #key_buttons: a renamed copy that keeps this code is
// not, and neither is any of two items under the label
const key_buttons_is_current = () => _item('#key_buttons', { silent: true })?.id == _this.id

const key_buttons_keyboard_open = win => {
  const view = win.visualViewport
  return !!view && view.scale <= 1.01 && win.innerHeight - view.height > KEY_BUTTONS_KEYBOARD_PX
}
const key_buttons_device = win => !!win.matchMedia?.(KEY_BUTTONS_DEVICE).matches
// which row shows on a device without a keyboard of its own: the main row while no keyboard
// is on the screen, the keyboard's row while one is (none with that part switched off), and
// nothing on a desktop
const key_buttons_row = (win, parts = KEY_BUTTONS_PARTS) =>
  !key_buttons_device(win) ? null : !key_buttons_keyboard_open(win) ? 'main' : parts.keyboard_row ? 'keyboard' : null

// where the keyboard's row goes, as the left and top of a fixed element: from the VISUAL
// viewport, the part of the page the keyboard leaves in view. On iOS the keyboard does not
// resize the window: a fixed element's `bottom` stays at the window's bottom edge, behind the
// keyboard, and the view can also be panned down the page (`offsetTop`), so the row is placed
// `above` the view's bottom edge and `edge` from its right, wherever the view is
const key_buttons_place = (view, count, look) => ({
  left: Math.round((view.offsetLeft ?? 0) + view.width - look.edge - (count * look.size + (count - 1) * look.gap)),
  top: Math.round((view.offsetTop ?? 0) + view.height - look.above - look.size),
})

// an editor of the app: the textarea of the box or of an item (Editor.svelte)
const key_buttons_editor = element => element?.tagName == 'TEXTAREA' && !!element.closest?.('.editor')

// whether a keydown is the Shift+Space that stands for a Tab: on a touch device alone (on a
// desktop, a Shift still held while typing capitals makes Shift+Space an accident), in an
// editor of the app, with no other modifier, outside a composition, and not under a caps
// lock the event names. A soft keyboard names the space by `key` when it gives no `code`.
// What an iOS keyboard reports is not known here (see the item's notes): the app's editors
// turn automatic capitals off, so no automatic Shift is on at a sentence's start, but should
// the keyboard report its caps lock as a held Shift, every space typed under it is a Tab.
// KEY_BUTTONS_PARTS.shift_space_tab turns the key off
const key_buttons_shift_space = (e, win) =>
  key_buttons_device(win) &&
  (e.code == 'Space' || e.key == ' ') &&
  e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing &&
  !e.getModifierState?.('CapsLock') &&
  key_buttons_editor(e.target)

// how far the page has to scroll (px, down the page; negative: up) for a line of text to be
// clear of the keyboard: the line's top and bottom and the view are in the window's own
// coordinates (what getBoundingClientRect gives, and the visual viewport's offset), `reserve`
// is what covers the view's bottom (the keyboard's row), `margin` the space kept around the
// line. Nothing for a line already clear
const key_buttons_clear = (line, view, reserve, margin) => {
  const top = (view.offsetTop ?? 0) + margin
  const bottom = (view.offsetTop ?? 0) + view.height - reserve - margin
  return line.bottom > bottom ? Math.ceil(line.bottom - bottom) : line.top < top ? Math.floor(line.top - top) : 0
}

// the caret's line in an editor of the app, top and bottom in the window's coordinates, found
// as the app itself finds it (restoreItemEditor in index.svelte): the editor draws its text in
// a backdrop under the textarea, wrapped as the textarea wraps it, so a hidden copy of the
// backdrop holding the text up to the caret, then the rest in a span, has that span begin on
// the caret's line. Null where there is no backdrop to measure in
function key_buttons_caret_line(textarea, doc) {
  const backdrop = textarea.closest('.editor')?.querySelector('.backdrop')
  if (!backdrop?.firstElementChild) return null
  const copy = backdrop.cloneNode(true)
  copy.style.visibility = 'hidden'
  backdrop.parentElement.insertBefore(copy, backdrop)
  const text = copy.firstElementChild
  text.textContent = textarea.value.slice(0, textarea.selectionStart)
  const rest = text.appendChild(doc.createElement('span'))
  rest.textContent = textarea.value.slice(textarea.selectionStart) || ' '
  const rect = rest.getClientRects()[0] ?? rest.getBoundingClientRect()
  copy.remove()
  return { top: rect.top, bottom: rect.bottom }
}

const key_buttons_css = look => `
.key-buttons { position: fixed; right: ${look.right}px; bottom: ${look.bottom}px; z-index: ${look.layer}; display: flex; gap: ${look.gap}px; margin: 0; padding: 0; pointer-events: none }
.key-buttons.keyboard { right: auto; bottom: auto }
.key-buttons[hidden] { display: none }
.key-buttons > button { pointer-events: auto; flex: none; display: flex; align-items: center; justify-content: center; width: ${look.size}px; height: ${look.size}px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: ${look.background}; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); color: ${look.color}; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; -webkit-tap-highlight-color: transparent }
.key-buttons > button:focus { outline: none }
.key-buttons > button:active { background: ${look.pressed} }
.key-buttons > button > svg { display: block; width: ${look.icon}px; height: ${look.icon}px; fill: none; stroke: currentColor; stroke-width: ${look.line}; stroke-linecap: round; stroke-linejoin: round; pointer-events: none }
`
const key_buttons_svg = icon => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${icon}"/></svg>`

// the keyboard events of one press of a button's key, in a keyboard's order: each modifier
// goes down, the key goes down and up, and the modifiers come up in reverse. Every event says
// which modifiers are held at it, as a keyboard's do (a modifier's own keyup no longer names
// it). The modifiers' release is part of the press: a focused editor of the app runs a
// create or a save only once they are released
const KEY_BUTTONS_MODIFIERS = [['ctrl', 'ctrlKey', 'Control'], ['alt', 'altKey', 'Alt'], ['shift', 'shiftKey', 'Shift']]
function key_buttons_events(spec) {
  const held = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }
  const event = (type, key, code) => ({ type, init: { key, code, ...held, bubbles: true, cancelable: true, composed: true } })
  const modifiers = KEY_BUTTONS_MODIFIERS.filter(([name]) => spec[name])
  const events = []
  for (const [, flag, key] of modifiers) {
    held[flag] = true
    events.push(event('keydown', key, key + 'Left'))
  }
  events.push(event('keydown', spec.key, spec.key), event('keyup', spec.key, spec.key))
  for (const [, flag, key] of modifiers.slice().reverse()) {
    held[flag] = false
    events.push(event('keyup', key, key + 'Left'))
  }
  return events
}

// where a real key would go: the element that has the focus (an editor of the app takes its
// own keys first, as from a keyboard), else the body. From either the events bubble to the
// window, where the app's handler navigates, creates and scrolls
const key_buttons_target = doc => {
  const active = doc.activeElement
  return active && active !== doc.documentElement && !active.closest?.('.key-buttons') ? active : doc.body
}

// one press: the key's events, on the element that has the focus when the press begins (a
// handler of the app may move the focus, and a real key's release would follow it there; the
// app's editors act on the keydown and on the modifiers' release alone, so this press stays
// where it began). Returns the events sent, for the tests
function key_buttons_press(spec, doc, make = (type, init) => new KeyboardEvent(type, init)) {
  const target = key_buttons_target(doc)
  const sent = key_buttons_events(spec)
  for (const { type, init } of sent) target.dispatchEvent(make(type, init))
  return sent
}

// draw or keep the page's one row of buttons (the pattern of the #vault item's sparkle,
// vault_sparkle_reconcile in vault.md). Its controller lives on window, since the item's code
// is evaluated afresh at every hook and nothing else outlives one: it OWNS the two rows, their
// style, its listeners and its task, and its dispose() releases all of them and nothing of a newer
// controller's. A controller drawn by other code (an update of this item, in this tab or
// another) or for another item is disposed BEFORE the new one draws. Only the page's one
// #key_buttons draws: any other item that carries this code draws nothing, and releases a
// controller of its own
function key_buttons_reconcile() {
  if (typeof document == 'undefined') return // no page
  let held = window._key_buttons
  if (!key_buttons_is_current()) {
    if (held?.item === _this.id) held.dispose()
    return
  }
  if (held && (held.code !== key_buttons_code || held.item !== _this.id)) {
    held.dispose()
    held = null
  }
  ;(held ?? key_buttons_create()).show()
}

function key_buttons_create() {
  const self = { code: key_buttons_code, item: _this.id, disposed: false }
  const style = (self.style = document.createElement('style'))
  style.dataset.keyButtons = 'style'
  style.textContent = key_buttons_css(KEY_BUTTONS_LOOK)
  document.head.appendChild(style)
  // a row of buttons, hidden until the first look: `kind` names it in the page (`bar`, the
  // main row; `keyboard`, the row above the keyboard)
  const row = (kind, specs, label) => {
    const bar = document.createElement('div')
    bar.className = kind == 'bar' ? 'key-buttons' : 'key-buttons ' + kind
    bar.dataset.keyButtons = kind
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-label', label)
    bar.hidden = true
    for (const spec of specs) {
      const button = document.createElement('button')
      button.type = 'button'
      button.tabIndex = -1 // a finger's buttons: the Tab key skips them
      button.dataset.key = spec.name
      button.title = spec.title
      button.setAttribute('aria-label', spec.title)
      button.innerHTML = key_buttons_svg(spec.icon)
      // a tap is a click: the press, and nothing else of it reaches the page under the button
      button.addEventListener('click', e => {
        e.preventDefault()
        e.stopPropagation()
        if (!self.disposed && !bar.hidden) key_buttons_press(spec, document)
      })
      // a press on a button is not the app's and takes no focus (the sparkle's rule, and the
      // way the app's own create button keeps the box's focus on a phone): the key goes to
      // whatever had the focus before the finger came down, and an editor that had it keeps
      // it, with its keyboard. A touch is only kept from the app (its tap is the click), and
      // a long press opens no menu of the browser's
      button.addEventListener('mousedown', e => {
        e.preventDefault()
        e.stopPropagation()
      })
      button.addEventListener('touchstart', e => e.stopPropagation(), { passive: true })
      button.addEventListener('contextmenu', e => {
        e.preventDefault()
        e.stopPropagation()
      })
      bar.appendChild(button)
    }
    return document.body.appendChild(bar)
  }
  const bar = (self.bar = row('bar', KEY_BUTTONS, 'Keys'))
  const keys = (self.keys = row('keyboard', KEY_BUTTONS_PARTS.keyboard_row ? KEY_BUTTONS_KEYBOARD_ROW : [], 'Keys above the keyboard'))
  const viewport = window.visualViewport

  // the look at the device and at the keyboard: which row shows, and where the keyboard's is
  self.show = () => {
    const shown = key_buttons_row(window)
    bar.hidden = shown != 'main'
    keys.hidden = shown != 'keyboard'
    if (keys.hidden) return
    const { left, top } = key_buttons_place(viewport, keys.children.length, KEY_BUTTONS_LOOK)
    Object.assign(keys.style, { left: left + 'px', top: top + 'px' })
  }

  // the caret's line scrolled clear of the keyboard, and of the row above it while that shows:
  // the page moves only when the line is not clear, and by no more than it takes (the app
  // scrolls the body, so the body is what moves). Returns how far it moved.
  // The app's own version: its caret check (restoreItemEditor in index.svelte) runs when an
  // editor takes the focus, before the keyboard has taken its room, and counts the window's
  // full height; run again from the app's viewport listener (onResize) when the visual
  // viewport's height shrinks under a focused editor, it would see the height that is left
  self.clear = () => {
    const editor = document.activeElement
    if (self.disposed || !key_buttons_editor(editor)) return 0
    const line = key_buttons_caret_line(editor, document)
    if (!line) return 0
    const reserve = keys.hidden ? 0 : KEY_BUTTONS_LOOK.size + 2 * KEY_BUTTONS_LOOK.above
    const by = key_buttons_clear(line, viewport, reserve, KEY_BUTTONS_CARET.margin)
    if (by) document.body.scrollBy(0, by)
    return by
  }

  // a keyboard that comes or goes (the visual viewport's resize) and a view that is panned
  // (its scroll) are looked at when they happen, not at the task's next run, and so is a
  // pointer that changes (a mouse attached to a tablet, a desktop browser's device emulation).
  // A view that got shorter under a focused editor is a keyboard coming up over the page: the
  // caret's line is looked at then, on a touch device, and at no other time (a later scroll
  // is the reader's own)
  let height = viewport?.height ?? 0
  const resized = () => {
    const shorter = viewport.height < height - 1
    height = viewport.height
    self.show()
    if (shorter && KEY_BUTTONS_PARTS.caret_clear && key_buttons_device(window)) self.clear()
  }
  const look = () => self.show()
  const device = window.matchMedia?.(KEY_BUTTONS_DEVICE)
  viewport?.addEventListener('resize', resized)
  viewport?.addEventListener('scroll', look)
  device?.addEventListener?.('change', look)

  // Shift+Space as a Tab: the key is caught at the window before the editor sees it (a
  // capturing listener; the editor's is on its textarea), no space is typed, and the editor
  // gets the Tab it understands. Other listeners at the window still see the key.
  // The app's own version: one more test beside the Tab's in the Editor's key handler
  const typed = e => {
    if (self.disposed || !key_buttons_shift_space(e, window)) return
    e.preventDefault()
    e.stopPropagation()
    key_buttons_press(KEY_BUTTONS_SHIFT_SPACE, document)
  }
  if (KEY_BUTTONS_PARTS.shift_space_tab) window.addEventListener('keydown', typed, true)

  self.dispose = () => {
    if (self.disposed) return
    self.disposed = true
    viewport?.removeEventListener('resize', resized)
    viewport?.removeEventListener('scroll', look)
    device?.removeEventListener?.('change', look)
    window.removeEventListener('keydown', typed, true)
    bar.remove()
    keys.remove()
    style.remove()
    if (window._key_buttons === self) delete window._key_buttons
  }
  window._key_buttons = self
  // this item's deletion: the app cancels the task of a deleted item at its next run (and of
  // a replaced controller when the next one dispatches)
  const task = _this.dispatch_task('key_buttons', () => (self.disposed ? null : void key_buttons_reconcile()), KEY_BUTTONS_TICK_MS, KEY_BUTTONS_TICK_MS)
  task._on_cancel = self.dispose
  return self
}

// the rows are drawn from the item's hooks, never from the item's render, so they show with the item
// off screen: at the page's welcome, and when this item itself is installed, updated or
// edited, in this tab or another (the app calls _on_item_change with the item's own id)
function _on_welcome() {
  key_buttons_reconcile()
}

function _on_item_change(id) {
  if (id == _this.id) key_buttons_reconcile()
}
