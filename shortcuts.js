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
//   (window._shortcuts ??= {})['my section'] = [{ keys: 'g', does: 'what the key does', when: 'when it applies', context: 'window' }]
// `keys` and `does` are shown as text; `when` (a condition, shown after what the key does) and
// `context` are optional. A context is one of _SHORTCUTS_CONTEXTS, `all`, or a list of them; an
// entry without one belongs to the window (where the app hands items the keys nothing else took).

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

// the sections that have an entry in a context, in the order the items added them:
// [[name, entries], ...]; whatever is not a list of objects is passed over
function _shortcuts_sections(context, added = window._shortcuts) {
  return Object.entries(added && typeof added == 'object' ? added : {})
    .map(([name, list]) => [name, (Array.isArray(list) ? list : []).filter(entry => entry && typeof entry == 'object' && _shortcuts_in(entry, context))])
    .filter(([, list]) => list.length)
}

// the menu's content for a context: its buttons (the contexts, then `all`, the shown one marked),
// then a table for each section. One line of markup, every text escaped: the app's dialog takes
// its content as Markdown, which leaves a block of markup alone up to its first empty line. A
// button's click goes no further than the button: showing another context replaces the content,
// the pressed button with it, and the dialog takes a click whose target is no longer in it for
// a click beside it, which closes it (seen in a browser: the menu closed at every switch)
function _shortcuts_html(context, added = window._shortcuts) {
  const text = s => _.escape(String(s ?? ''))
  const tabs = [..._SHORTCUTS_CONTEXTS, 'all']
    .map(c => `<button type="button" data-context="${c}"${c == context ? ' class="on"' : ''} onclick="event.stopPropagation();window._shortcuts_menu?.show(this.dataset.context)">${c}</button>`)
    .join('')
  const sections = _shortcuts_sections(context, added)
    .map(([name, list]) => {
      const rows = list.map(e => `<tr><td class="keys">${text(e.keys)}</td><td>${text(e.does)}${e.when ? `<span class="when"> (${text(e.when)})</span>` : ''}</td></tr>`).join('')
      return `<div class="section"><div class="name">${text(name)}</div><table>${rows}</table></div>`
    })
    .join('')
  return `<div class="shortcuts-menu" data-context="${context}"><div class="tabs">${tabs}</div>${sections || '<div class="none">no item has added a shortcut for this context</div>'}</div>`
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
  const self = { code: _shortcuts_code, item: _this.id, disposed: false, dialog: null }
  const style = document.createElement('style')
  style.dataset.shortcuts = 'style'
  style.textContent = _SHORTCUTS_CSS
  document.head.appendChild(style)
  self.open = () => !!self.dialog && !!window._modal_visible?.(self.dialog)
  // shows the menu for a context, in the app's dialog: a new one, or this one's content replaced
  self.show = context => {
    if (self.disposed || typeof window._modal != 'function') return
    const content = _shortcuts_html(context)
    if (self.open()) return void window._modal_update(self.dialog, content)
    self.dialog = window._modal(content)
  }
  self.close = () => {
    if (self.open()) window._modal_close(self.dialog)
    self.dialog = null
  }
  // the menu's key, taken before the app and its editors see it (a capturing listener): it
  // opens the menu for the context it was pressed in, and closes an open one. In a text field
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
    if (!e.repeat) self.show(context)
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
