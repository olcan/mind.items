// shortcuts.js
// A menu of keyboard shortcuts that items add, opened with the question mark key (the owner,
// 2026-11-25: "a shortcuts menu available on `?` (`Shift+/`) key (also with any modifier for
// text editing contexts) that my personal pinned item and other items can add their shortcuts
// to, organized under sections (typically named after the items adding the shortcuts), that can
// be context-sensitive (e.g. context selector that defaults to current context)").
//
// HOW AN ITEM ADDS ITS SHORTCUTS: it writes a list under a section's name on the window, whenever
// its own code runs (no call of this item's code, so the order in which items load does not
// matter, and writing the same section again replaces it):
//   (window._shortcuts ??= {})['my section'] = [{ keys: 'g', does: 'what the key does', when: 'when it applies', active: () => true, context: 'window' }]
// `keys` and `does` are shown as text. `context`, `active` and `when` are optional. A context is
// one of _SHORTCUTS_CONTEXTS, `all`, or a list of them; an entry without one belongs to the
// window (where the app hands items the keys nothing else took). `active` is the item's own test
// of whether the key would do something at this moment: the menu opens on what the keys do NOW
// and asks it then (the owner, 2026-11-25: "just list keys that actually do something in the
// current context"); an entry without one counts as active wherever its context is. `when` says
// the same condition in words, for the lists by context, which show every entry.

// this evaluation's code version (a controller drawn by other code is replaced; captured here,
// since a closure reads the item's hash as it is later)
const _shortcuts_code = _this.deephash

// the contexts, in the menu's order: the window (no text field has the focus), the box (the
// app's own field at the top of the page), an item's editor (any other text field counts as one)
const _SHORTCUTS_CONTEXTS = ['window', 'box', 'editor']

const _SHORTCUTS_TICK_MS = 15000 // the task's look: a controller whose code is no longer the item's retires at its next run

const _SHORTCUTS_CSS = `
.shortcuts-menu { text-align: left; max-height: 70vh; overflow-y: auto; min-width: min(420px, 80vw) }
.shortcuts-menu .tabs { display: flex; gap: 6px; margin: 0 0 10px 0 }
.shortcuts-menu .tabs > button { font: inherit; font-size: 80%; color: inherit; background: rgba(128, 128, 128, 0.2); border: 0; border-radius: 4px; padding: 2px 8px; cursor: pointer }
.shortcuts-menu .tabs > button.on { background: rgba(128, 128, 128, 0.55) }
.shortcuts-menu .section { margin: 0 0 10px 0 }
.shortcuts-menu .section > .name { font-weight: 600; margin: 0 0 2px 0 }
.shortcuts-menu table { border-collapse: collapse; width: 100% }
.shortcuts-menu td { padding: 1px 0; vertical-align: top; border: 0 }
.shortcuts-menu td.keys { white-space: nowrap; padding-right: 14px; font-family: ui-monospace, Menlo, monospace; font-size: 90% }
.shortcuts-menu .when { opacity: 0.6 }
.shortcuts-menu .where { opacity: 0.6; font-size: 80%; margin: 0 0 8px 0 }
.shortcuts-menu .none { opacity: 0.6 }
`

// whether this item is the page's one item of its name: a renamed copy that keeps this code is
// not, and neither is any of two items under the label
const _shortcuts_is_current = () => _item('#shortcuts', { silent: true })?.id == _this.id

// the context of the page now, by what has the focus
function _shortcuts_context() {
  const active = document.activeElement
  if (active?.id == 'textarea-mindbox') return 'box'
  if (active && (active.isContentEditable || ['TEXTAREA', 'INPUT', 'SELECT'].includes(active.tagName))) return 'editor'
  return 'window'
}

// whether a key event is the menu's key: the question mark, by its character or by the slash
// key with Shift (with Alt down a keyboard may send another character for it)
function _shortcuts_key(e) {
  return e.key == '?' || (e.code == 'Slash' && !!e.shiftKey)
}

// whether an entry belongs to a context (`all` asks for every entry)
function _shortcuts_in(entry, context) {
  if (context == 'all') return true
  const own = entry.context ?? 'window'
  return (Array.isArray(own) ? own : [own]).some(c => c == context || c == 'all')
}

// whether an entry's key would do something at this moment, by the test of the item that added
// it: none is a yes, and one that throws is a no (another item's code, perhaps of an item that
// is gone)
function _shortcuts_active(entry) {
  if (typeof entry.active != 'function') return true
  try {
    return !!entry.active()
  } catch (e) {
    return false
  }
}

// the sections that have an entry in a context, in the order the items added them:
// [[name, entries], ...]; whatever is not a list of objects is passed over. With `now`, only
// the entries that are active at this moment
function _shortcuts_sections(context, now = false, added = window._shortcuts) {
  return Object.entries(added && typeof added == 'object' ? added : {})
    .map(([name, list]) => [name, (Array.isArray(list) ? list : []).filter(entry => entry && typeof entry == 'object' && _shortcuts_in(entry, context) && (!now || _shortcuts_active(entry)))])
    .filter(([, list]) => list.length)
}

// the words for a context, after "in"
const _SHORTCUTS_WHERE = { window: 'the window', box: 'the box', editor: "an item's editor" }

// the menu's content for a view: `now` (what the keys do at this moment, in the context the
// menu was opened from: `context`), one of the contexts, or `all` (the lists of reference: every
// entry, with its condition in words). First the views' buttons, the shown one marked, then a
// table for each section. One line of markup, every text escaped and kept on one line: the app's dialog takes its
// content as Markdown, which leaves a block of markup alone up to its first empty line. A
// button's click goes no further than the button: showing another view replaces the content,
// the pressed button with it, and the dialog takes a click whose target is no longer in it for
// a click beside it, which closes it (seen in a browser: the menu closed at every switch)
function _shortcuts_html(view, context, added = window._shortcuts) {
  // (a text is shown as its characters, on one line: a line break in it would end the block of
  // markup at an empty line, and what follows would be read as Markdown)
  const text = s => _.escape(String(s ?? '').replace(/\s+/g, ' '))
  const now = view == 'now'
  const tabs = ['now', ..._SHORTCUTS_CONTEXTS, 'all']
    .map(v => `<button type="button" data-view="${v}"${v == view ? ' class="on"' : ''} onclick="event.stopPropagation();window._shortcuts_menu?.show(this.dataset.view)">${v}</button>`)
    .join('')
  const sections = _shortcuts_sections(now ? context : view, now, added)
    .map(([name, list]) => {
      const rows = list.map(e => `<tr><td class="keys">${text(e.keys)}</td><td>${text(e.does)}${!now && e.when ? `<span class="when"> (${text(e.when)})</span>` : ''}</td></tr>`).join('')
      return `<div class="section"><div class="name">${text(name)}</div><table>${rows}</table></div>`
    })
    .join('')
  const where = now ? `<div class="where">what the keys do right now, in ${_SHORTCUTS_WHERE[context] ?? 'the window'}</div>` : ''
  const none = now ? 'no shortcut of an item does anything here right now' : 'no item has added a shortcut for this context'
  return `<div class="shortcuts-menu" data-view="${view}" data-context="${context}"><div class="tabs">${tabs}</div>${where}${sections || `<div class="none">${none}</div>`}</div>`
}

// draw or keep the page's one menu controller (the pattern of the key buttons' strip,
// key_buttons_reconcile in key_buttons.js): it lives on the window, since the item's code is
// evaluated afresh at every hook, and OWNS its style, its key listener and its task. A controller
// drawn by other code or for another item is disposed before the new one is made. Only the
// page's one item of this name makes one
function _shortcuts_reconcile() {
  if (typeof document == 'undefined') return // no page
  let held = window._shortcuts_menu
  if (!_shortcuts_is_current()) {
    if (held?.item === _this.id) held.dispose()
    return
  }
  if (held && (held.code !== _shortcuts_code || held.item !== _this.id)) {
    held.dispose()
    held = null
  }
  if (!held) _shortcuts_create()
}

function _shortcuts_create() {
  const self = { code: _shortcuts_code, item: _this.id, disposed: false, dialog: null, context: 'window' }
  const style = document.createElement('style')
  style.dataset.shortcuts = 'style'
  style.textContent = _SHORTCUTS_CSS
  document.head.appendChild(style)
  self.open = () => !!self.dialog && !!window._modal_visible?.(self.dialog)
  // shows a view of the menu in the app's dialog: a new one, or this one's content replaced.
  // `context` is given by the key that opens the menu: the dialog takes the focus, so the page's
  // context is read before it opens and kept for the view of now
  self.show = (view, context = self.context) => {
    if (self.disposed || typeof window._modal != 'function') return
    self.context = context
    const content = _shortcuts_html(view, context)
    if (self.open()) return void window._modal_update(self.dialog, content)
    self.dialog = window._modal(content)
  }
  self.close = () => {
    if (self.open()) window._modal_close(self.dialog)
    self.dialog = null
  }
  // the menu's key, taken before the app and its editors see it (a capturing listener): it
  // opens the menu on what the keys do now, in the context it was pressed in, and closes an
  // open one. The items' tests of what is active run here, at the press. In a text field
  // the plain key is a character to type, so there it counts only with Ctrl, Alt or Cmd. Another
  // dialog that is up keeps its keys. A key held down counts once
  const key = e => {
    if (self.disposed || !_shortcuts_key(e)) return
    if (self.open()) {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (!e.repeat) self.close()
      return
    }
    if (window._modal_visible?.()) return
    const context = _shortcuts_context()
    if (context != 'window' && !(e.ctrlKey || e.altKey || e.metaKey)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    if (!e.repeat) self.show('now', context)
  }
  window.addEventListener('keydown', key, true)
  self.dispose = () => {
    if (self.disposed) return
    self.disposed = true
    window.removeEventListener('keydown', key, true)
    self.close()
    style.remove()
    if (window._shortcuts_menu === self) delete window._shortcuts_menu
  }
  window._shortcuts_menu = self
  // the task retires a controller whose code is no longer the item's (a text saved without this
  // code runs no hook of it), and the app cancels it for a deleted item at its next run
  const tick = () => {
    if (self.disposed) return null
    let live
    try {
      live = _this.deephash
    } catch (e) {}
    if (live !== _shortcuts_code) {
      self.dispose()
      return null
    }
    return void _shortcuts_reconcile()
  }
  const task = _this.dispatch_task('shortcuts', tick, _SHORTCUTS_TICK_MS, _SHORTCUTS_TICK_MS)
  task._on_cancel = self.dispose
  return self
}

// the controller is made from the item's hooks, never from its render, so the key works with the
// item off screen: at the page's welcome, and when this item itself changes (its install and
// its update included)
function _on_welcome() {
  _shortcuts_reconcile()
}

function _on_item_change(id) {
  if (id == _this.id) _shortcuts_reconcile()
}
