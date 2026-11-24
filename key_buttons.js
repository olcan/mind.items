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
// they can be tried on the phone at once; each says below what the app's own version would be.
// After the owner's second try (the same day): the keyboard is read by two signals and decided
// from both, since the window's test alone chose the wrong row once (key_buttons_keyboard), and
// the caret's scroll is switched off and, should it be switched on again, acts once for each
// opening of the keyboard.
// After the third try: a reload button at the page's lower left, the mirror of the #vault
// item's sparkle at the lower right, on every device.
// After the branch's first review: the reload asks before it would discard an edit, the row
// above the keyboard is offered to the app's own editors alone, and the task retires a
// controller whose code is no longer the item's.
// After its second review: on an app that has no reload of its own the item asks before EVERY
// reload (it cannot know there what would be lost), and the app's editors are told by the
// names the app gives their textareas, not by what surrounds a textarea

// ---- what to adjust: the parts, the buttons, their icons, their size and their place -----------

// the three later parts, each on or off by itself: a part that is off draws nothing, listens to
// nothing and sends nothing. The main row (KEY_BUTTONS) has no switch: deleting the item is its
const KEY_BUTTONS_PARTS = {
  keyboard_row: true, // the short row just above the on-screen keyboard (KEY_BUTTONS_KEYBOARD_ROW)
  shift_space_tab: true, // Shift+Space in an editor of the app is a Tab, on a touch device
  // a keyboard that comes up over the caret's line: the page scrolls the line clear, once for
  // each opening of the keyboard. OFF since the owner's second try: what it was built for could
  // not be reproduced on the phone, and a repeated scroll was seen once
  caret_clear: false,
  // a round button at the page's lower left that reloads the page: the mirror of the #vault
  // item's sparkle at the lower right, and like it on every device (KEY_BUTTONS_RELOAD)
  reload_button: true,
}

// the buttons, in the row's order from left to right. `key` with `ctrl`, `alt` and `shift` is
// the key a press sends; `title` says what the app does at that key (the button's name for a
// screen reader, and its tooltip); `icon` is one path in a 16 by 16 box, drawn as a line
const KEY_BUTTONS = [
  // a bar and an arrow up to it: the page scrolls to its top (Back returns to the position)
  { name: 'top', key: 'ArrowUp', ctrl: true, alt: true, title: 'Scroll to the top (Ctrl+Alt+Up)', icon: 'M3 2.5h10M8 14V6.5M4.5 10L8 6.5l3.5 3.5' },
  // an arrow down to a ring, the item: the undo of the scroll to the top, else the named item
  { name: 'back', key: 'ArrowDown', ctrl: true, alt: true, title: 'Scroll back down (Ctrl+Alt+Down)', icon: 'M8 1.5V8M4.5 4.5L8 8l3.5-3.5M8 11.2a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3' },
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

// the four navigation arrows of the main row: lit green when they would move in the named item's
// tree and dimmed when not
const KEY_BUTTONS_ARROWS = KEY_BUTTONS.filter(b => !b.ctrl && !b.alt && !b.shift && b.key.startsWith('Arrow'))
const KEY_BUTTONS_ARROW_NAMES = new Set(KEY_BUTTONS_ARROWS.map(b => b.name))
// the strip of a device with a keyboard: the main row's buttons in one row at the page's lower
// right, in groups with a wider gap between them, left to right: the two jumps, the four arrows,
// the new item; then the reload button, then the #vault item's sparkle (the owner, 2026-11-23:
// "reload is next to sparkle, plus is next to reload, then the arrow keys, then the jump-up/down
// buttons"). `lead` marks a group's first
const KEY_BUTTONS_STRIP = [['top', 'back'], ['left', 'up', 'down', 'right'], ['create']]
const KEY_BUTTONS_STRIP_SPECS = KEY_BUTTONS_STRIP.flatMap(names => names.map((name, i) => ({ ...KEY_BUTTONS.find(b => b.name == name), lead: i == 0 })))
const KEY_BUTTONS_NONE = { left: false, up: false, down: false, right: false }

// the reload button: one press reloads the page, after a question wherever something could be
// lost: the app's own (window._reload), or on an app without one this item's, before every
// reload (see self.reload). An arrow that goes round, drawn as the other icons are
const KEY_BUTTONS_RELOAD = { name: 'reload', title: 'Reload the page', icon: 'M14.6 3.2v3.6H11M13.1 9.8a5.4 5.4 0 1 1-1.3-5.6l2.8 2.6' }
// what the item asks before a reload on an app that has no reload of its own. It asks every
// time there, so the question names no edit: whether there is one is what it cannot tell
const KEY_BUTTONS_RELOAD_QUESTION = 'Reload and discard any unsaved changes?'

// the look, in CSS pixels: a row along the window's bottom edge that ends left of the #vault
// item's sparkle (a 24 px circle at right 14 and bottom 10, vault.md) and is centred on it. The
// sparkle's circle and shadow, white where the sparkle is yellow, and a size a thumb can hit
const KEY_BUTTONS_LOOK = {
  size: 32, // a button's width and height (the sparkle's is 24)
  gap: 6, // between two buttons: seven buttons take 7 * 32 + 6 * 6 = 260
  group: 18, // between the groups of the strip on a device with a keyboard, and beside its reload button
  right: 46, // the row's right edge from the window's: past the sparkle (14 + 24) and a gap of 8
  bottom: 6, // the row's bottom edge from the window's: 10 + (24 - 32) / 2, the sparkle's centre line
  icon: 16, // an icon's width and height
  line: 1.6, // an icon's line width, in the icon's own 16 units
  color: '#fff', // the icons (the sparkle's are #f5e389)
  valid: '#9f9', // a navigation arrow that would move (the app's search-match green: .index.matching, mark.selected)
  dim: 0.25, // icon opacity for a navigation arrow that would not move (below reload's 0.45 idle)
  background: '#222', // the sparkle's
  pressed: '#555', // a button's background while a finger is on it
  layer: 88, // under the sparkle's menu and that menu's layer (90 and 89), over the app's own layers (10 at most)
  above: 6, // the keyboard row's bottom edge above the keyboard: above the bottom of what the keyboard leaves in view
  edge: 10, // the keyboard row's right edge from the right edge of what is in view (the sparkle is not shown then)
  // the reload button, the sparkle's mirror (.vault-sparkle in vault.md: 24 px round at right 14 and
  // bottom 10, its drawing 16 px, dim at 0.45 while idle and 0.9 under a mouse): the same at the left,
  // in the icons' white, and at this item's layer (under the sparkle's menu layer, as the rows are)
  reload: { size: 24, left: 14, bottom: 10, icon: 16, idle: 'rgba(255, 255, 255, 0.45)', hover: 'rgba(255, 255, 255, 0.9)' },
  // dark frosted-glass background behind the buttons: full-width bottom strip on a phone; on a
  // keyboard device, split into a left piece (reload + arrows) and a right piece (sparkle, when
  // shown), merging into the full-width strip below `merge` px; raised with a 1 px light border
  // along free edges only and a soft outer shadow outside the glass only
  backdrop: { fill: 'rgba(17, 17, 17, 0.65)', blur: '4px', border: 'rgba(255, 255, 255, 0.09)', shadow: 'rgba(0, 0, 0, 1)', shadow_blur: 12, merge: 480 },
}
// the caret's line and a keyboard that comes up: the space kept free above and below the line,
// and how long the view has to stay as it is before the one look (the keyboard has taken its room)
const KEY_BUTTONS_CARET = { margin: 8, settle: 150 }
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
const KEY_BUTTONS_FOCUS_MS = 150 // a focus that left is looked at this much later: a focus that moves from one editor to another flips no row
const KEY_BUTTONS_NAV_MS = 150 // each item change restarts this wait, so a burst is looked at once it goes quiet
const KEY_BUTTONS_CHANGES = 5 // how many of the row's last changes are kept, for the lines that say what the signals read

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
// an element that takes typed text: a keyboard on the screen belongs to one (a frame may hold
// one, so a focused frame counts)
const key_buttons_editable = element =>
  !!element &&
  (element.tagName == 'TEXTAREA' ||
    (element.tagName == 'INPUT' && !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/i.test(element.type ?? '')) ||
    element.tagName == 'IFRAME' ||
    element.isContentEditable === true)

// the keyboard on the screen, read two ways and decided from both (the owner's phone showed
// the wrong row once, 2026-11-17, with the window's test alone).
// The WINDOW's signal is the sparkle's test above: the view much shorter than the window. It
// reads nothing where the window's own height follows the keyboard, and it refuses a pinch zoom.
// The VIEW's signal needs no window: the view much shorter than the TALLEST view seen at this
// width (`tallest`, the controller's memory, noted here; a width is an orientation, and a
// keyboard leaves it alone), with any zoom taken out of both. It reads nothing until a taller
// view has been seen at this width (a page drawn, or turned, while the keyboard was up).
// A keyboard belongs to an element that takes text: with none focused there is no keyboard,
// whatever the heights say (a view that has not caught up with a keyboard that left); with
// one focused, either signal is enough
function key_buttons_keyboard(win, doc, tallest = {}) {
  const view = win.visualViewport
  const focus = key_buttons_editable(doc.activeElement)
  const by_window = key_buttons_keyboard_open(win)
  const editor = key_buttons_editor(doc.activeElement) // the app's own editor: the one field the keyboard's row is for
  if (!view) return { up: false, focus, editor, by_window, by_view: false, window: win.innerHeight, view: null, width: null, tallest: null, scale: null }
  const scale = view.scale || 1
  const [width, height] = [Math.round(view.width * scale), Math.round(view.height * scale)]
  tallest[width] = Math.max(tallest[width] ?? 0, height)
  const by_view = tallest[width] - height > KEY_BUTTONS_KEYBOARD_PX
  return { up: focus && (by_window || by_view), focus, editor, by_window, by_view, window: win.innerHeight, view: height, width, tallest: tallest[width], scale }
}

// which row shows on a device without a keyboard of its own: the main row while no keyboard
// is on the screen; while one is, the keyboard's row, but only for an editor of the app (its
// Tab and Shift+Enter are that editor's keys: sent to any other field they would reach the
// app's window, which takes Shift+Enter as "create from the box" and Tab as "go to the box");
// none with that part switched off, and nothing on a desktop. A keyboard up for any field
// hides the main row. `keyboard` is what key_buttons_keyboard read
const key_buttons_row = (win, keyboard, parts = KEY_BUTTONS_PARTS) =>
  !key_buttons_device(win) ? null : !keyboard.up ? 'main' : parts.keyboard_row && keyboard.editor ? 'keyboard' : null

// what the two signals read, in words, for whoever reads them out (window._key_buttons.says()
// from a console attached to the page: nothing on the page shows the lines since the #edge_test
// item that did was removed): the row shown, the decision now, each signal with its numbers,
// and the row's last changes with what the signals said at each
function key_buttons_says(keyboard, shown, changes, now) {
  const yes = flag => (flag ? 'yes' : 'no')
  const less = from => (keyboard.view === null ? 'no view' : `${from} − view ${keyboard.view} = ${from - keyboard.view}`)
  return [
    `keys: row ${shown ?? 'none'} · keyboard ${keyboard.up ? 'up' : 'down'} · by window ${yes(keyboard.by_window)} (window ${less(keyboard.window)}) · by view ${yes(keyboard.by_view)} (tallest ${less(keyboard.tallest)} at width ${keyboard.width}) · focus ${yes(keyboard.focus)} · editor ${yes(keyboard.editor)} · scale ${Math.round((keyboard.scale ?? 1) * 100) / 100}`,
    'keys before: ' + (changes.map(was => `${Math.round((now - was.at) / 1000)} s ago ${was.shown ?? 'none'} (window ${yes(was.window)}, view ${yes(was.view)}, focus ${yes(was.focus)})`).join(' · ') || 'nothing yet'),
  ]
}

// where the keyboard's row goes, as the left and top of a fixed element: from the VISUAL
// viewport, the part of the page the keyboard leaves in view. On iOS the keyboard does not
// resize the window: a fixed element's `bottom` stays at the window's bottom edge, behind the
// keyboard, and the view can also be panned down the page (`offsetTop`), so the row is placed
// `above` the view's bottom edge and `edge` from its right, wherever the view is
const key_buttons_place = (view, count, look) => ({
  left: Math.round((view.offsetLeft ?? 0) + view.width - look.edge - (count * look.size + (count - 1) * look.gap)),
  top: Math.round((view.offsetTop ?? 0) + view.height - look.above - look.size),
})

// an editor of the app: the MindBox's textarea, or the textarea of an item that is being
// edited. The app names them (Editor.svelte: `textarea-mindbox`, and `textarea-<item id>` for
// an item's, Item.svelte), so the name is what is asked, and of an item's that the item with
// that very id is being edited. A textarea of an item's own markup is no editor of the app,
// whatever its classes and whatever is around it (a box of class `editor` included): the
// keyboard's row and Shift+Space are not for it
const key_buttons_editor = element => {
  if (element?.tagName != 'TEXTAREA' || typeof element.id != 'string' || !element.id.startsWith('textarea-')) return false
  const id = element.id.slice('textarea-'.length)
  if (id == 'mindbox') return true
  try {
    const item = _item(id, { silent: true }) // (by id; a label or an `id:` prefix finds an item of another id)
    return !!item && item.id === id && item.editing === true
  } catch (e) {
    return false
  }
}

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

// geometry of the desktop frosted-glass backdrop, in CSS pixels: one piece at the page's lower
// right, behind the #vault sparkle, the reload button and the strip (its top-left corner rounded),
// or the full merged strip below look.backdrop.merge px: glass clip paths (origin at the pane's
// top-left), shadow-caster / outside-mask paths (origin pad px above and pad px left of the
// glass, extended past the viewport's edges so the outer shadow stays uniform to the screen
// edge), and 1 px free-edge border paths (inset 0.5 px so the stroke sits inside the glass edge
// and never draws on page edges). `w_col` is the sparkle's slot (its circle in its margins);
// `h_col` stays for the readers of the earlier shape, which had a column above the row
function key_buttons_backdrop_geom(look) {
  const w_col = look.reload.size + 2 * look.reload.left
  const h_col = 0
  const h_row = look.reload.size + 2 * look.reload.bottom
  const h_tot = h_row
  const [count, groups] = [KEY_BUTTONS_STRIP.flat().length, KEY_BUTTONS_STRIP.length]
  // from the right: the sparkle, the reload button and each group, a group's gap between them
  // and a button's gap inside a group, in the sparkle's margin at both ends
  const w_piece = 2 * look.reload.left + (2 + count) * look.reload.size + (count - groups) * look.gap + (groups + 1) * look.group
  const r = look.reload.size / 2
  const pad = Math.max(24, look.backdrop.shadow_blur * 3)
  const narrow = look.backdrop.merge
  const clip_split = `M ${r} 0 H ${w_piece} V ${h_tot} H 0 V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
  const clip_strip = `M 0 0 H ${narrow} V ${h_tot} H 0 Z`
  const [y0, y2] = [pad, pad + h_tot]
  const shape_split = `M ${pad + r} ${y0} H ${w_piece + 2 * pad} V ${y2 + pad} H ${pad} V ${y0 + r} A ${r} ${r} 0 0 1 ${pad + r} ${y0} Z`
  const shape_strip = `M ${-pad} ${y0} H ${narrow + pad} V ${y2 + pad} H ${-pad} Z`
  const [o, ri] = [0.5, r - 0.5]
  const border_split = `M ${pad + o} ${y2} V ${y0 + r} A ${ri} ${ri} 0 0 1 ${pad + r} ${y0 + o} H ${w_piece + pad}`
  const border_strip = `M 0 ${y0 + o} H ${narrow}`
  return { w_col, h_col, h_row, h_tot, w_piece, r, pad, narrow, clip_split, clip_strip, shape_split, shape_strip, border_split, border_strip }
}

// whether a viewport point (x, y) lies on visible frosted glass, from the same geometry as the
// stylesheet (key_buttons_backdrop_geom and key_buttons_backdrop). Excludes the outer shadow and
// the clipped-away 12 px outer corner triangles so hits match the painted glass shape exactly;
// returns false whenever no glass shows (mode == null)
function key_buttons_in_glass(x, y, vw, vh, mode, right_shown = false, look = KEY_BUTTONS_LOOK) {
  if (!mode || x < 0 || y < 0 || x > vw || y > vh) return false
  const dy = vh - y // distance up from the viewport's bottom edge
  if (mode == 'mobile') return dy <= look.size + 2 * look.bottom
  const g = key_buttons_backdrop_geom(look)
  const in_arc = (px, py, cx, cy) => (px - cx) ** 2 + (py - cy) ** 2 <= g.r ** 2
  // desktop row (full width in desktop-strip; in split the one piece at the right, 0..w_piece in
  // from the viewport's right edge, its top-left corner rounded by r). `right_shown` is no longer
  // read: the sparkle stands on that piece whether it shows or not
  if (dy <= g.h_row) {
    if (mode == 'desktop-strip') return true
    const rx = vw - x // distance in from the viewport's right edge
    if (rx <= g.w_piece) {
      if (rx > g.w_piece - g.r && dy > g.h_row - g.r) return in_arc(rx, dy, g.w_piece - g.r, g.h_row - g.r)
      return true
    }
  }
  return false
}

// events caught in document capture over visible frosted glass (choice 2: the glass stays fixed
// with pointer-events: none so native wheel, trackpad and finger-drag scrolling of document.body
// stays untouched, while accidental presses/clicks between buttons never reach the page):
// - BLOCK: preventDefault + stopPropagation (focus changes, selections, links, menus, app clicks)
// - STOP: stopPropagation only (no preventDefault, so touch gestures stay native)
// - PASSIVE: capture + passive, stopPropagation only (never preventDefault touchstart/touchend)
// Never listen on wheel or touchmove
const KEY_BUTTONS_GLASS_BLOCK = ['mousedown', 'click', 'dblclick', 'auxclick', 'contextmenu']
const KEY_BUTTONS_GLASS_STOP = ['pointerdown']
const KEY_BUTTONS_GLASS_PASSIVE = ['touchstart', 'touchend']
const KEY_BUTTONS_GLASS_RESET = ['pointerup', 'pointercancel', 'touchcancel']
const KEY_BUTTONS_OWN_OVERLAY = ['.vault-sparkle-backdrop', '.vault-sparkle-menu']

// outer shadow (Gaussian blur of the glass's own shape, masked strictly outside the glass) and 1 px
// free-edge border for the desktop split and narrow merged shapes, drawn in sibling SVGs so no
// filter or mask ever sits on an ancestor of the backdrop-filter pane
function key_buttons_backdrop_frame(look) {
  const g = key_buttons_backdrop_geom(look)
  const sigma = look.backdrop.shadow_blur / 2
  const svg = (cls, w, shape, border) =>
    `<svg class="key-buttons-bg-svg ${cls}" aria-hidden="true">` +
    `<defs>` +
    `<filter id="key-buttons-bg-shadow-${cls}" filterUnits="userSpaceOnUse" x="${-g.pad * 2}" y="0" width="${w + g.pad * 4}" height="${g.h_tot + g.pad * 2}" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur stdDeviation="${sigma}"/>` +
    `</filter>` +
    `<mask id="key-buttons-bg-out-${cls}" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${g.h_tot + g.pad}">` +
    `<rect x="0" y="0" width="${w}" height="${g.h_tot + g.pad}" fill="#fff"/>` +
    `<path d="${shape}" fill="#000"/>` +
    `</mask>` +
    `</defs>` +
    `<path d="${shape}" fill="${look.backdrop.shadow}" filter="url(#key-buttons-bg-shadow-${cls})" mask="url(#key-buttons-bg-out-${cls})"/>` +
    `<path d="${border}" fill="none" stroke="${look.backdrop.border}" stroke-width="1" stroke-linejoin="miter"/>` +
    `</svg>`
  return svg('split', g.w_piece + g.pad, g.shape_split, g.border_split) + svg('strip', g.narrow, g.shape_strip, g.border_strip)
}

function key_buttons_css(look) {
  const g = key_buttons_backdrop_geom(look)
  return `
.key-buttons { position: fixed; right: ${look.right}px; bottom: ${look.bottom}px; z-index: ${look.layer}; display: flex; gap: ${look.gap}px; margin: 0; padding: 0; pointer-events: none }
.key-buttons.keyboard { right: auto; bottom: auto }
.key-buttons[hidden] { display: none }
.key-buttons > button { pointer-events: auto; flex: none; display: flex; align-items: center; justify-content: center; width: ${look.size}px; height: ${look.size}px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: ${look.background}; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); color: ${look.color}; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; -webkit-tap-highlight-color: transparent }
.key-buttons > button:focus { outline: none }
.key-buttons > button:active { background: ${look.pressed} }
.key-buttons > button.valid { color: ${look.valid} }
.key-buttons > button > svg { display: block; width: ${look.icon}px; height: ${look.icon}px; fill: none; stroke: currentColor; stroke-width: ${look.line}; stroke-linecap: round; stroke-linejoin: round; pointer-events: none }
.key-buttons > button.dim > svg { opacity: ${look.dim} }
.key-buttons-reload { position: fixed; left: ${look.reload.left}px; bottom: ${look.reload.bottom}px; z-index: ${look.layer}; display: flex; align-items: center; justify-content: center; width: ${look.reload.size}px; height: ${look.reload.size}px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: ${look.background}; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); color: ${look.reload.idle}; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; -webkit-tap-highlight-color: transparent }
.key-buttons-reload.desktop { left: auto; right: ${look.reload.left + look.reload.size + look.group}px }
.key-buttons-reload[hidden] { display: none }
.key-buttons-reload:focus { outline: none }
.key-buttons-reload:focus-visible { outline: 1px solid ${look.color} }
@media (hover: hover) { .key-buttons-reload:hover { color: ${look.reload.hover} } }
.key-buttons-reload:active { color: ${look.color} }
.key-buttons-reload > svg { display: block; width: ${look.reload.icon}px; height: ${look.reload.icon}px; fill: none; stroke: currentColor; stroke-width: ${look.line}; stroke-linecap: round; stroke-linejoin: round; pointer-events: none }
.key-buttons-nav { position: fixed; right: ${look.reload.left + 2 * look.reload.size + 2 * look.group}px; bottom: ${look.reload.bottom}px; z-index: ${look.layer}; display: flex; gap: ${look.gap}px; margin: 0; padding: 0; pointer-events: none }
.key-buttons-nav > button[data-lead]:not(:first-child) { margin-left: ${look.group - look.gap}px }
.key-buttons-nav[hidden] { display: none }
.key-buttons-nav > button { pointer-events: auto; flex: none; display: flex; align-items: center; justify-content: center; width: ${look.reload.size}px; height: ${look.reload.size}px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: ${look.background}; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); color: ${look.color}; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; -webkit-tap-highlight-color: transparent }
.key-buttons-nav > button.valid { color: ${look.valid} }
.key-buttons-nav > button:focus { outline: none }
.key-buttons-nav > button:focus-visible { outline: 1px solid currentColor }
@media (hover: hover) { .key-buttons-nav > button:hover { background: #333 } }
.key-buttons-nav > button:active { background: ${look.pressed} }
.key-buttons-nav > button > svg { display: block; width: ${look.reload.icon}px; height: ${look.reload.icon}px; fill: none; stroke: currentColor; stroke-width: ${look.line}; stroke-linecap: round; stroke-linejoin: round; pointer-events: none }
.key-buttons-nav > button.dim > svg { opacity: ${look.dim} }
.key-buttons-bg { position: fixed; left: 0; right: 0; bottom: 0; height: 0; z-index: ${look.layer - 1}; pointer-events: none }
.key-buttons-bg[hidden] { display: none }
.key-buttons-bg > .key-buttons-bg-pane { position: absolute; left: 0; right: 0; bottom: 0; height: ${look.size + 2 * look.bottom}px; box-sizing: border-box; background: ${look.backdrop.fill}; -webkit-backdrop-filter: blur(${look.backdrop.blur}); backdrop-filter: blur(${look.backdrop.blur}); border-top: 1px solid ${look.backdrop.border}; box-shadow: 0 0 ${look.backdrop.shadow_blur}px ${look.backdrop.shadow}; pointer-events: none }
.key-buttons-bg.desktop > .key-buttons-bg-pane { height: ${g.h_tot}px; border-top: 0; box-shadow: none; -webkit-clip-path: path('${g.clip_strip}'); clip-path: path('${g.clip_strip}') }
.key-buttons-bg.desktop.split > .key-buttons-bg-pane { left: auto; right: 0; width: ${g.w_piece}px; -webkit-clip-path: path('${g.clip_split}'); clip-path: path('${g.clip_split}') }
.key-buttons-bg > .key-buttons-bg-frame { display: none; pointer-events: none }
.key-buttons-bg.desktop > .key-buttons-bg-frame { display: block }
.key-buttons-bg-svg { display: none; position: absolute; left: 0; bottom: 0; height: ${g.h_tot + g.pad}px; pointer-events: none }
.key-buttons-bg.desktop:not(.split) .key-buttons-bg-svg.strip { display: block; right: 0; width: 100% }
.key-buttons-bg.desktop.split .key-buttons-bg-svg.split { display: block; left: auto; right: 0; width: ${g.w_piece + g.pad}px }
.key-buttons-bg > .key-buttons-bg-right { display: none; position: absolute; right: 0; bottom: 0; width: ${g.w_col}px; height: ${g.h_row}px; box-sizing: border-box; border-top-left-radius: ${g.r}px; border-top: 1px solid ${look.backdrop.border}; border-left: 1px solid ${look.backdrop.border}; background: ${look.backdrop.fill}; -webkit-backdrop-filter: blur(${look.backdrop.blur}); backdrop-filter: blur(${look.backdrop.blur}); box-shadow: 0 0 ${look.backdrop.shadow_blur}px ${look.backdrop.shadow}; pointer-events: none }
`
}

// the single #label the box names (trimmed, lowercased), else null: empty, multi-term search,
// command, plain text, id: query and #log (never a unique target in the app) name none
const key_buttons_box_label = box => {
  const text = typeof box == 'string' ? box.trim().toLowerCase() : ''
  return text && text != '#log' && /^#[^#\s]+$/.test(text) ? text : null
}

// textual ancestor labels above a label, nearest first (#map/a/0 -> ['#map/a', '#map']):
// fallback when an item has no `ancestors`, and for a visible tag that names no unique item
const key_buttons_prefixes = label => {
  const levels = []
  for (let at = label.lastIndexOf('/'); at >= 0; at = label.lastIndexOf('/', at - 1)) levels.push(label.slice(0, at))
  return levels
}

// which of the four arrows would move from the item the box names, from arguments alone:
// `box` is the MindBox text and `items` is an iterable of items ({ label, ancestors?, tags_visible? }).
// - no single unique item named by the box: none
// - up: any ancestor of the named item in the tree is a unique item (immediate parent, or higher
//   ancestor via the app's contextLabel fallback when intermediate levels have no item)
// - down: any unique item descends from the named item in the tree (covers integer-named children,
//   nested descendants and tag children in one check), or the item visibly tags a descendant
// - left and right: the named item's immediate tree parent is a unique item, and that parent has
//   at least one other child in the app's enumeration (another direct tree child label, unique or
//   duplicated, or another descendant visibly tagged by the parent)
function key_buttons_nav(box, items) {
  const target_label = key_buttons_box_label(box)
  if (!target_label || !items) return { ...KEY_BUTTONS_NONE }
  const counts = new Map()
  const entries = []
  for (const it of items) {
    const label = typeof it?.label == 'string' ? it.label.toLowerCase() : ''
    if (!label) continue
    counts.set(label, (counts.get(label) ?? 0) + 1)
    entries.push({ label, item: it })
  }
  if (counts.get(target_label) !== 1) return { ...KEY_BUTTONS_NONE }
  const unique = new Map()
  for (const entry of entries) if (counts.get(entry.label) === 1 && entry.label != '#log') unique.set(entry.label, entry)
  const ancestors_of = entry => {
    if (entry.levels) return entry.levels
    const raw = entry.item.ancestors
    if (!Array.isArray(raw)) return (entry.levels = key_buttons_prefixes(entry.label))
    let clean = true
    for (let i = 0; i < raw.length; i++) {
      if (typeof raw[i] != 'string' || raw[i] !== raw[i].toLowerCase()) {
        clean = false
        break
      }
    }
    return (entry.levels = clean ? raw : raw.map(a => String(a).toLowerCase()))
  }
  const descends = (label, ancestor) => {
    const seen = new Set()
    let cur = label
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const found = unique.get(cur)
      if (found) return ancestors_of(found).includes(ancestor)
      const slash = cur.lastIndexOf('/')
      if (slash < 0) return false
      cur = cur.slice(0, slash)
      if (cur == ancestor) return true
    }
    return false
  }

  const dangling_of = entry => {
    const raw = entry.item.dangling_tags ?? entry.item.danglingTags
    if (!Array.isArray(raw) || !raw.length) return null
    const set = new Set()
    for (const t of raw) if (typeof t == 'string' && t) set.add(t.toLowerCase())
    return set.size ? set : null
  }

  const target = unique.get(target_label)
  const target_levels = ancestors_of(target)
  const up = target_levels.some(level => level != target_label && unique.has(level))

  let down = false
  for (const entry of unique.values()) {
    if (entry !== target && ancestors_of(entry).includes(target_label)) {
      down = true
      break
    }
  }
  if (!down) {
    const dangling = dangling_of(target)
    for (const raw of target.item.tags_visible ?? []) {
      const tag = typeof raw == 'string' ? raw.toLowerCase() : ''
      if (tag && tag != target_label && !dangling?.has(tag) && descends(tag, target_label)) {
        down = true
        break
      }
    }
  }

  const parent_label = target_levels[0]
  const parent = parent_label && parent_label != target_label ? unique.get(parent_label) : null
  let sibling = false
  if (parent) {
    for (const entry of entries) {
      if (entry.label != target_label && ancestors_of(entry)[0] == parent_label) {
        sibling = true
        break
      }
    }
    if (!sibling) {
      const dangling = dangling_of(parent)
      for (const raw of parent.item.tags_visible ?? []) {
        const tag = typeof raw == 'string' ? raw.toLowerCase() : ''
        if (tag && tag != parent_label && tag != target_label && !dangling?.has(tag) && descends(tag, parent_label)) {
          sibling = true
          break
        }
      }
    }
  }

  return { left: sibling, up, down, right: sibling }
}

// whether any item is open for editing: reads the app's own live item array (`window.__items`, the
// exact source of `editingItems` in index.svelte), falling back to `_items()` when absent. Exact
// from the moment an editor opens (before the DOM flushes and even while hidden behind a toggle)
// through any in-flight save until the editor closes
const key_buttons_any_editing = (win = window) =>
  Array.isArray(win?.__items)
    ? win.__items.some(it => it?.editing === true)
    : typeof win?._items == 'function'
      ? win._items().some(it => it?.editing === true)
      : false

// items in the named label's root tree (#map and #map/...): in the app, lineage overrides never
// cross roots (lineage.ts), so no item under another root can be an ancestor, child or sibling.
// Walking `_labels` avoids wrapping and sorting every item in the account; where `_labels` is
// absent (tests), falls back to `_items()`. Carries the app's `danglingTags` from `window.__item`
// so solely-relative references to absent targets do not light arrows
function key_buttons_read_nav(box) {
  const target_label = key_buttons_box_label(box)
  if (!target_label) return { ...KEY_BUTTONS_NONE }
  const with_dangling = it => {
    if (!it) return null
    let dangling = null
    if (typeof window.__item == 'function' && it.id != null) {
      try {
        dangling = window.__item(it.id)?.danglingTags
      } catch (e) {}
    }
    return Array.isArray(dangling) && dangling.length
      ? { label: it.label, ancestors: it.ancestors, tags_visible: it.tags_visible, dangling_tags: dangling }
      : it
  }
  if (typeof window._labels == 'function' && typeof _item == 'function') {
    if (!_item(target_label, { silent: true })) return { ...KEY_BUTTONS_NONE }
    const slash = target_label.indexOf('/')
    const root = slash < 0 ? target_label : target_label.slice(0, slash)
    const prefix = root + '/'
    const found = []
    window._labels((label, ids) => {
      if (label != root && !label.startsWith(prefix)) return false
      for (const id of ids) {
        const it = with_dangling(_item(id, { silent: true }))
        if (it) found.push(it)
      }
      return false
    })
    return key_buttons_nav(box, found)
  }
  return key_buttons_nav(box, (window._items?.() ?? []).map(with_dangling).filter(Boolean))
}

// whether the desktop navigation arrow groups show: always on a device with a keyboard while no
// soft keyboard is up (all four arrows stay in place and dim when they would not move); never on
// a touch device (the main row holds them there)
const key_buttons_desktop_shown = (win, keyboard) => !key_buttons_device(win) && !keyboard.up

// which frosted-glass background shows behind the buttons: the full-width bottom strip while the
// phone's main row shows ('mobile'); on a keyboard device with no soft keyboard up, split left
// and right pieces ('desktop-split') or one merged bottom strip below `merge` px
// ('desktop-strip'); or none while a keyboard is on screen
const key_buttons_backdrop = (win, keyboard, shown, look = KEY_BUTTONS_LOOK) =>
  keyboard.up
    ? null
    : shown == 'main'
      ? 'mobile'
      : !key_buttons_device(win)
        ? (win.innerWidth ?? Infinity) < look.backdrop.merge
          ? 'desktop-strip'
          : 'desktop-split'
        : null
// whether the reload button shows: on every device, as the sparkle does; not while a keyboard
// is on the screen (the rows' own reading), and not where the main row, while it shows, would
// reach it (a window so narrow that the row's left end comes within a gap of the button)
const key_buttons_reload_shown = (win, keyboard, shown, look, parts = KEY_BUTTONS_PARTS) =>
  !!parts.reload_button &&
  !keyboard.up &&
  !(shown == 'main' && win.innerWidth - look.right - (KEY_BUTTONS.length * look.size + (KEY_BUTTONS.length - 1) * look.gap) < look.reload.left + look.reload.size + look.gap)

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
  return active && active !== doc.documentElement && !active.closest?.('[data-key-buttons]') ? active : doc.body
}

// one press: the key's events, on the element that has the focus when the press begins (a
// handler of the app may move the focus, and a real key's release would follow it there; the
// app's editors act on the keydown and on the modifiers' release alone, so this press stays
// where it began). Returns the events sent, for the tests
function key_buttons_press(spec, doc, make = (type, init) => new KeyboardEvent(type, init), to = key_buttons_target(doc)) {
  const sent = key_buttons_events(spec)
  for (const { type, init } of sent) to.dispatchEvent(make(type, init))
  return sent
}

// draw or keep the page's one row of buttons (the pattern of the #vault item's sparkle,
// vault_sparkle_reconcile in vault.md). Its controller lives on window, since the item's code
// is evaluated afresh at every hook and nothing else outlives one: it OWNS the two rows, the
// reload button, their style, its listeners and its task, and its dispose() releases all of them and nothing of a newer
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
  const controller = held ?? key_buttons_create()
  controller.show()
  controller.refresh()
}

function key_buttons_create() {
  const self = { code: key_buttons_code, item: _this.id, disposed: false }
  const style = (self.style = document.createElement('style'))
  style.dataset.keyButtons = 'style'
  style.textContent = key_buttons_css(KEY_BUTTONS_LOOK)
  document.head.appendChild(style)
  // dark frosted-glass background behind the buttons: one non-backdrop-root container whose
  // siblings (.key-buttons-bg-pane for the desktop's frosted piece or the phone's strip,
  // .key-buttons-bg-frame for the desktop piece's outer shadow + free-edge border SVGs, and
  // .key-buttons-bg-right behind the #vault sparkle in wide desktop split) blur the page directly
  // with no filter or mask on any ancestor, taking no pointer events
  const backdrop = (self.backdrop = document.createElement('div'))
  backdrop.className = 'key-buttons-bg'
  backdrop.dataset.keyButtons = 'backdrop'
  backdrop.setAttribute('aria-hidden', 'true')
  backdrop.hidden = true
  const backdrop_pane = document.createElement('div')
  backdrop_pane.className = 'key-buttons-bg-pane'
  const backdrop_frame = document.createElement('div')
  backdrop_frame.className = 'key-buttons-bg-frame'
  backdrop_frame.innerHTML = key_buttons_backdrop_frame(KEY_BUTTONS_LOOK)
  const backdrop_right = document.createElement('div')
  backdrop_right.className = 'key-buttons-bg-right'
  backdrop.appendChild(backdrop_pane)
  backdrop.appendChild(backdrop_frame)
  backdrop.appendChild(backdrop_right)
  document.body.appendChild(backdrop)
  // active press state for frosted-glass rejection (decided once where each press starts; declared
  // here so the button click handlers below can check that a click belongs to a press started in
  // that button's rectangle and targeted at it)
  let glass_press = null
  // an event made by code (`isTrusted` false) is never the user's press: the app's own keyboard
  // shortcuts toggle and navigate through clicks and mousedowns that it dispatches, so such an
  // event passes and neither reads nor changes the record of the physical press
  const made_by_code = e => e.isTrusted === false
  const own_click_ok = (button, e) =>
    !glass_press || made_by_code(e) || (e.detail === 0 && !e.pointerType) || (!glass_press.rejected && glass_press.button === button)
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
      // The keyboard's row sends its keys to an editor of the app and to nothing else: who has
      // the focus is asked again at the tap itself (the row can still show for a moment after
      // the focus has left its editor)
      button.addEventListener('click', e => {
        e.preventDefault()
        e.stopPropagation()
        if (!self.disposed && !bar.hidden && own_click_ok(button, e) && (kind == 'bar' || key_buttons_editor(document.activeElement)))
          key_buttons_press(spec, document)
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
  // the reload button: a press reloads the page, through self.reload. It can take the focus, as
  // the sparkle can, so Enter and Space are its own while it has it (the app's window handlers
  // take them otherwise, and its keyup handler cancels a button's own activation): the press
  // itself acts, a held key and a key with a modifier do not, and a dialog of the app gets its keys.
  // Nothing is lost without a word: the question comes BEFORE the reload, and from the page, since
  // the browser's own (the app's beforeunload) is not asked on a reload by every browser (iOS
  // Safari is documented to leave it out). The app's own reload (window._reload) decides by its
  // own test of every item, an edit that is not saved and a save that is not finished alike:
  // it asks in its dialog when there is one, reloads at once when there is none, and is not
  // asked about again by the browser. An app that has none yet (the released one, until its side
  // lands: the item can be updated before the app is): this item asks before EVERY reload, in
  // the app's dialog. It cannot know there what would be lost, and does not guess: a draft its
  // owner has just kept (the item's close button, then Cancel in the app's question) sits in
  // the item's text and in its editor alike, with nothing being saved, and a save that failed
  // leaves nothing an item's handles show. The browser may then ask once more. Resolves to
  // whether the page is being reloaded
  self.reload = async () => {
    if (typeof window._reload == 'function') return window._reload()
    if (self.asking) return false
    self.asking = true
    let sure = false
    try {
      sure = (await window._modal(KEY_BUTTONS_RELOAD_QUESTION, { confirm: 'Reload', cancel: 'Cancel' })) === true
    } finally {
      self.asking = false
    }
    if (!sure || self.disposed) return false
    window.location.reload()
    return true
  }
  const reloader = (self.reloader = document.createElement('button'))
  reloader.type = 'button'
  reloader.className = 'key-buttons-reload'
  reloader.dataset.keyButtons = 'reload'
  reloader.title = KEY_BUTTONS_RELOAD.title
  reloader.setAttribute('aria-label', KEY_BUTTONS_RELOAD.title)
  reloader.innerHTML = key_buttons_svg(KEY_BUTTONS_RELOAD.icon)
  reloader.hidden = true
  const taken = e => {
    e.preventDefault()
    e.stopPropagation()
  }
  const own_key = e => (e.key == 'Enter' || e.key == ' ') && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !window._modal_visible?.()
  reloader.addEventListener('click', e => {
    taken(e)
    if (!self.disposed && !reloader.hidden && own_click_ok(reloader, e)) self.reload()
  })
  reloader.addEventListener('keydown', e => {
    if (!own_key(e)) return
    taken(e)
    if (!e.repeat && !self.disposed && !reloader.hidden) self.reload()
  })
  reloader.addEventListener('keyup', e => {
    if (own_key(e)) taken(e)
  })
  reloader.addEventListener('mousedown', taken)
  reloader.addEventListener('touchstart', e => e.stopPropagation(), { passive: true })
  reloader.addEventListener('contextmenu', taken)
  if (KEY_BUTTONS_PARTS.reload_button) document.body.appendChild(reloader)
  // the strip of a device with a keyboard, in a row at the lower right that ends beside the reload
  // button: the main row's buttons in the reload button's circle look, the arrows dimmed when they would not move
  // and still clickable. A click dispatches on document.body so it always reaches the window's
  // handler even while the MindBox holds focus (Editor.svelte stops propagation on arrows inside
  // a focused textarea), and sends nothing while any item is open for editing
  const nav_group = (kind, className, specs, label) => {
    const group = document.createElement('div')
    group.className = className
    group.dataset.keyButtons = kind
    group.setAttribute('role', 'toolbar')
    group.setAttribute('aria-label', label)
    group.hidden = true
    for (const spec of specs) {
      const button = document.createElement('button')
      button.type = 'button'
      button.tabIndex = -1
      button.dataset.key = spec.name
      if (spec.lead) button.dataset.lead = '1'
      button.title = spec.title
      button.setAttribute('aria-label', spec.title)
      button.innerHTML = key_buttons_svg(spec.icon)
      button.addEventListener('click', e => {
        taken(e)
        if (!self.disposed && !group.hidden && own_click_ok(button, e) && !key_buttons_any_editing(window))
          key_buttons_press(spec, document, undefined, document.body)
      })
      button.addEventListener('mousedown', taken)
      button.addEventListener('touchstart', e => e.stopPropagation(), { passive: true })
      button.addEventListener('contextmenu', taken)
      group.appendChild(button)
    }
    return document.body.appendChild(group)
  }
  const nav_strip = (self.nav_strip = nav_group('nav-strip', 'key-buttons-nav', KEY_BUTTONS_STRIP_SPECS, 'Navigation keys'))
  const viewport = window.visualViewport
  Object.assign(self, { tallest: {}, shown: undefined, changes: [], cleared: false, nav: { ...KEY_BUTTONS_NONE }, query: undefined, keyboard_up: false, nav_pending: false, bg_mode: null })
  // a task of the item a moment from now (a later one of the same name replaces it); nothing
  // once the item is gone (its own task's cancel disposes this controller)
  const later = (name, run, ms) => {
    try {
      _this.dispatch_task(name, () => void (self.disposed || run()), ms)
    } catch (e) {}
  }

  // the look at the device, the keyboard and the focus: which row shows, and where the
  // keyboard's is. A row that changes is noted with what the two signals read (self.says)
  self.show = () => {
    const keyboard = key_buttons_keyboard(window, document, self.tallest)
    const shown = key_buttons_row(window, keyboard)
    if (shown !== self.shown) {
      self.changes.unshift({ at: Date.now(), shown, window: keyboard.by_window, view: keyboard.by_view, focus: keyboard.focus })
      self.changes.length = Math.min(self.changes.length, KEY_BUTTONS_CHANGES)
      self.shown = shown
    }
    bar.hidden = shown != 'main'
    keys.hidden = shown != 'keyboard'
    reloader.hidden = !key_buttons_reload_shown(window, keyboard, shown, KEY_BUTTONS_LOOK)
    const bg_mode = (self.bg_mode = key_buttons_backdrop(window, keyboard, shown, KEY_BUTTONS_LOOK))
    backdrop.hidden = !bg_mode
    backdrop.className = bg_mode == 'desktop-split' ? 'key-buttons-bg desktop split' : bg_mode == 'desktop-strip' ? 'key-buttons-bg desktop' : 'key-buttons-bg'
    self.keyboard_up = keyboard.up
    self.apply_nav()
    if (!keys.hidden) {
      const { left, top } = key_buttons_place(viewport, keys.children.length, KEY_BUTTONS_LOOK)
      Object.assign(keys.style, { left: left + 'px', top: top + 'px' })
    }
    // the caret's line: ONE look for each opening of the keyboard, once the view has stayed as
    // it is for a moment (every look before that puts the one look off). Whatever that look
    // does, nothing more is done until the keyboard has closed and opened again
    if (!keyboard.up) self.cleared = false
    else if (!self.cleared && KEY_BUTTONS_PARTS.caret_clear && key_buttons_device(window)) later('key_buttons_caret', self.settled, KEY_BUTTONS_CARET.settle)
  }
  self.settled = () => {
    if (self.cleared || !key_buttons_keyboard(window, document, self.tallest).up) return
    self.cleared = true
    self.clear()
  }
  // apply the last computed arrow state to the mobile row's arrows and the two desktop groups:
  // arrows that would move are green (`valid`), arrows that would not are dimmed (`dim`);
  // non-arrows never change; desktop always shows all four
  self.apply_nav = () => {
    const nav = self.nav
    for (const button of bar.children) {
      if (KEY_BUTTONS_ARROW_NAMES.has(button.dataset.key)) button.className = nav[button.dataset.key] ? 'valid' : 'dim'
    }
    const desktop = key_buttons_desktop_shown(window, { up: self.keyboard_up })
    nav_strip.hidden = !desktop
    // the reload button stands beside the sparkle there, and at the lower left on a phone
    reloader.className = desktop ? 'key-buttons-reload desktop' : 'key-buttons-reload'
    for (const button of nav_strip.children) {
      if (KEY_BUTTONS_ARROW_NAMES.has(button.dataset.key)) button.className = nav[button.dataset.key] ? 'valid' : 'dim'
    }
  }
  self.box = () =>
    self.query !== undefined
      ? self.query
      : (document.getElementById?.('textarea-mindbox')?.value ?? '').replace(/\u200B/g, '')
  self.refresh = () => {
    if (self.disposed) return self.nav
    self.nav = key_buttons_read_nav(self.box())
    self.apply_nav()
    return self.nav
  }
  self.box_changed = text => {
    if (self.disposed) return
    self.query = text
    self.nav_pending = false
    self.refresh()
  }
  // each item change (create, edit, delete, rename) restarts the 150 ms wait so a burst is
  // looked at once it goes quiet; skipped while the box names no label (nothing can light up)
  self.items_changed = () => {
    if (self.disposed || !key_buttons_box_label(self.box())) return
    self.nav_pending = true
    later(
      'key_buttons_nav',
      () => {
        if (!self.nav_pending) return
        self.nav_pending = false
        self.refresh()
      },
      KEY_BUTTONS_NAV_MS
    )
  }
  // what the signals read now, and the row's last changes, as lines of text
  self.says = (now = Date.now()) => key_buttons_says(key_buttons_keyboard(window, document, self.tallest), self.shown, self.changes, now)

  // the caret's line scrolled clear of the keyboard, and of the row above it while that shows:
  // the page moves only when the line is not clear, and by no more than it takes (the app
  // scrolls the body, so the body is what moves). Returns how far it moved.
  // The app's own version: its caret check (restoreItemEditor in index.svelte) runs when an
  // editor takes the focus, before the keyboard has taken its room, and counts the window's
  // full height; run once more from the app's viewport listener (onResize) when the keyboard
  // has come up under a focused editor, it would see the height that is left
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

  // a keyboard that comes or goes (the visual viewport's resize), a view that is panned (its
  // scroll), a focus that comes to an element, and a pointer that changes (a mouse attached to
  // a tablet, a desktop browser's device emulation) are looked at when they happen, not at the
  // task's next run. A focus that leaves is looked at a moment later: a focus that moves from
  // one editor to the next, the keyboard staying up, flips no row in between
  const look = () => self.show()
  const left = () => later('key_buttons_focus', look, KEY_BUTTONS_FOCUS_MS)
  const device = window.matchMedia?.(KEY_BUTTONS_DEVICE)
  viewport?.addEventListener('resize', look)
  viewport?.addEventListener('scroll', look)
  device?.addEventListener?.('change', look)
  document.addEventListener('focusin', look, true)
  document.addEventListener('focusout', left, true)

  // reject presses/clicks on visible frosted glass by where each press STARTS (the first of
  // pointerdown, touchstart or mousedown of a gesture), while letting the item's own buttons and
  // the #vault sparkle (each by its bounding rectangle AND as the event's target: a touch that the
  // browser adjusts onto one from the gap beside it is a press on the glass, and a button behind
  // an open menu does not claim the menu's press), the sparkle's backdrop and menu (by target),
  // modals and all native scrolling work as before
  const glass_point = e => {
    const t = e.touches?.[0] ?? e.changedTouches?.[0] ?? e
    return typeof t?.clientX == 'number' && typeof t?.clientY == 'number' ? [t.clientX, t.clientY] : null
  }
  const inside = (b, x, y) => {
    const r = b.getBoundingClientRect?.()
    return !!r && r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }
  const own_button_at = (x, y) => {
    const buttons = []
    if (!reloader.hidden) buttons.push(reloader)
    for (const g of [bar, keys, nav_strip]) if (!g.hidden) buttons.push(...g.children)
    for (const b of buttons) if (inside(b, x, y)) return b
    return null
  }
  const glass_start = (e, source, touch) => {
    if (self.disposed || window._modal_visible?.()) return { source, touch, rejected: false, button: null, mouse_seen: source == 'mouse', up: false }
    const pt = glass_point(e)
    const hit = pt ? own_button_at(pt[0], pt[1]) : null
    const button = hit && (e.target === hit || hit.contains?.(e.target)) ? hit : null
    let rejected = false
    if (pt && !button && !backdrop.hidden && self.bg_mode) {
      const el = e.target?.closest ? e.target : e.target?.parentElement
      const sparkle = el?.closest?.('.vault-sparkle')
      if (!KEY_BUTTONS_OWN_OVERLAY.some(sel => el?.closest?.(sel)) && !(sparkle && inside(sparkle, pt[0], pt[1]))) {
        const right_shown = self.bg_mode == 'desktop-split' && !!document.querySelector?.('body > .vault-sparkle:not([hidden])')
        rejected = key_buttons_in_glass(pt[0], pt[1], window.innerWidth, window.innerHeight, self.bg_mode, right_shown, KEY_BUTTONS_LOOK)
      }
    }
    return { source, touch, rejected, button, mouse_seen: source == 'mouse', up: false }
  }
  const glass_pointerdown = e => {
    if (self.disposed || made_by_code(e)) return
    if (e.isPrimary === false) {
      if (glass_press?.rejected) e.stopPropagation()
      return
    }
    glass_press = glass_start(e, 'pointer', e.pointerType == 'touch')
    if (glass_press.rejected) e.stopPropagation()
  }
  const glass_touch = e => {
    if (self.disposed || made_by_code(e)) return
    if (e.type == 'touchstart') {
      const same_pointer = glass_press && glass_press.source == 'pointer' && glass_press.touch && !glass_press.up
      const extra_finger = e.touches && e.touches.length > 1 && glass_press && !glass_press.up
      if (!same_pointer && !extra_finger) glass_press = glass_start(e, 'touch', true)
      if (glass_press?.rejected) e.stopPropagation()
    } else {
      if (glass_press?.rejected) e.stopPropagation()
      if (glass_press && (!e.touches || e.touches.length == 0)) glass_press.up = true
    }
  }
  const glass_block = e => {
    if (self.disposed || made_by_code(e)) return
    if (e.type == 'mousedown') {
      const same_gesture =
        glass_press &&
        !glass_press.mouse_seen &&
        (glass_press.touch || (glass_press.source == 'pointer' && !glass_press.up))
      if (same_gesture) glass_press.mouse_seen = true
      else glass_press = glass_start(e, 'mouse', false)
    } else if (e.type == 'click' && e.detail === 0 && !e.pointerType) {
      return
    }
    if (!glass_press?.rejected) return
    e.preventDefault()
    e.stopPropagation()
  }
  const glass_reset = e => {
    if (self.disposed || made_by_code(e)) return
    if (e.type == 'pointerup') {
      if (e.isPrimary !== false && glass_press?.source == 'pointer') glass_press.up = true
    } else if (e.type == 'touchcancel' || e.isPrimary !== false) {
      glass_press = null
    }
  }
  for (const type of KEY_BUTTONS_GLASS_BLOCK) document.addEventListener(type, glass_block, true)
  for (const type of KEY_BUTTONS_GLASS_STOP) document.addEventListener(type, glass_pointerdown, true)
  for (const type of KEY_BUTTONS_GLASS_PASSIVE) document.addEventListener(type, glass_touch, { capture: true, passive: true })
  for (const type of KEY_BUTTONS_GLASS_RESET) document.addEventListener(type, glass_reset, { capture: true, passive: true })

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
    viewport?.removeEventListener('resize', look)
    viewport?.removeEventListener('scroll', look)
    device?.removeEventListener?.('change', look)
    document.removeEventListener('focusin', look, true)
    document.removeEventListener('focusout', left, true)
    glass_press = null
    for (const type of KEY_BUTTONS_GLASS_BLOCK) document.removeEventListener(type, glass_block, true)
    for (const type of KEY_BUTTONS_GLASS_STOP) document.removeEventListener(type, glass_pointerdown, true)
    for (const type of KEY_BUTTONS_GLASS_PASSIVE) document.removeEventListener(type, glass_touch, { capture: true, passive: true })
    for (const type of KEY_BUTTONS_GLASS_RESET) document.removeEventListener(type, glass_reset, { capture: true, passive: true })
    window.removeEventListener('keydown', typed, true)
    backdrop.remove()
    bar.remove()
    keys.remove()
    reloader.remove()
    nav_strip.remove()
    style.remove()
    if (window._key_buttons === self) delete window._key_buttons
  }
  window._key_buttons = self
  // this item's deletion: the app cancels the task of a deleted item at its next run (and of
  // a replaced controller when the next one dispatches)
  // The task also retires a controller whose code is no longer the item's: a text saved without
  // this code (its block removed, or the app's #_debug tag put on the item) runs no hook of it,
  // so nothing else would. The item's hash is read as it is NOW, through _this at each run, and
  // compared with the one this evaluation captured
  const tick = () => {
    if (self.disposed) return null
    let live
    try {
      live = _this.deephash
    } catch (e) {}
    if (live !== key_buttons_code) {
      self.dispose()
      return null
    }
    return void key_buttons_reconcile()
  }
  const task = _this.dispatch_task('key_buttons', tick, KEY_BUTTONS_TICK_MS, KEY_BUTTONS_TICK_MS)
  task._on_cancel = self.dispose
  return self
}

// the rows are drawn from the item's hooks, never from the item's render, so they show with the item
// off screen: at the page's welcome, when this item itself changes, when the box's search changes
// (_on_search), and when any item changes (_on_item_change, restarting a 150 ms wait so a burst
// is looked at once it goes quiet; carries
// #_listen so the app delivers both hooks)
function _on_welcome() {
  key_buttons_reconcile()
}

function _on_search(text) {
  const held = window._key_buttons
  if (held?.item === _this.id) held.box_changed?.(text)
}

function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (id == _this.id) {
    key_buttons_reconcile()
    return
  }
  if (dependency) return
  const held = window._key_buttons
  if (held?.item === _this.id) held.items_changed?.()
}
