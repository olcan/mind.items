// #edge_test: a test for the blurry edge at the top of the app on an iPhone (the vault's todo
// of 2026-11-17: the owner's phone, iOS 27.2.1, the app run from the Home Screen, shows it
// with every scroller at its top). The app draws nothing there (no mask, blur or shadow in
// its styles), so the system does, and only the phone can show which of the things a page
// can change takes it away. This item puts a small panel on the page with one switch for
// each such thing: a tap puts it on, another takes it off, and the top edge is looked at in
// between. Nothing is kept: every switch is off after a reload, and the item's deletion (or
// its update) takes the panel away and undoes whatever a switch changed.
// The first try on the phone (2026-11-17): of six switches only the strip took the blur
// away, a 12 px element in the header's color fixed along the top edge, and it covered the
// tops of the header's buttons and picture. So the switches are now that strip's variants,
// for the least that still works, above the five that did not work (kept as the record).
// What WebKit's source says of such an element (main, read 2026-11-17: LocalFrameView.cpp,
// fixedContainerEdges; RenderLayer.cpp, hitTestLayer; PageColorSampler): the web view hides
// its top "scroll pocket" (the blur) while it shows a color fill of its own for a fixed or
// sticky element at the top edge. Whether there is one is decided by ONE hit test, at the
// middle of the window's width, 4 px below its top edge, over fixed and sticky elements, what
// they hold and what holds them. So the app's header and its buttons, positioned boxes of
// their own, do not hide a strip that lies under them; but the page's plain flow is held by
// what holds the strip, and does hide a strip under it (one at a negative z-index). The
// element found, or an ancestor of what was found, counts when it is
// fixed or sticky, at least nine tenths of the window's width, not taller than the window,
// not hidden and at least a tenth opaque, with a background or content; `pointer-events` is
// not asked. Its own background is taken for the fill when it is over 10 px high, else the
// page's pixels 4 to 6 px below the top edge are sampled

// ---- what to adjust ------------------------------------------------------------------------

const EDGE_TEST_COLOR = '#171717' // the app's header while the box has no focus (.header-container)
const EDGE_TEST_STRIP_PX = 12 // the strip that worked on the phone
// a strip along the top edge: a fixed element in the header's color, `px` high, at layer `z`
// (50 is over the app's page and under this panel; `auto` is the page's own layer, where an
// element that comes first in the page lies under every positioned box that comes later)
const edge_test_strip = (name, px, z = 50, more = '') =>
  `.edge-test-${name} { position: fixed; top: 0; left: 0; width: 100%; height: ${px}px; z-index: ${z}; background: ${EDGE_TEST_COLOR}${more} }`

// the switches, in the panel's order. `says` is the few words on the page. A switch is put on
// by a stylesheet of its own (`css`), an element under the body (`element`, its class: the
// body's last child, or with `first` its first), a
// meta tag's content (`meta`: the tag's name, and the content to give it from the one it
// has) and a move of the page to its header (`moves`), and taken off by undoing them.
// First the strip's variants: the one that worked, then from the least in the way to the
// most. By the source above, the first five should work and so should the 6 px one, and the
// 3 px and 1 px ones should not (the one hit test is 4 px down): the phone decides
const EDGE_TEST_SWITCHES = [
  { name: 'strip12', says: `the ${EDGE_TEST_STRIP_PX} px strip on top, as it worked (it covers the buttons' tops): the control`, element: 'edge-test-strip12', css: edge_test_strip('strip12', EDGE_TEST_STRIP_PX) },
  // no element at all: a sticky box counts as a fixed one does, and the header is at the top edge
  { name: 'sticky', says: 'no strip: the header itself declared sticky (it never sticks, and nothing is covered)', css: '.header { position: sticky !important }' },
  // under the header and every positioned box of the page: first in the page, at the page's own
  // layer. The one hit test does not see those boxes, and the strip is over the page's plain flow
  { name: 'behind', says: `the ${EDGE_TEST_STRIP_PX} px strip behind the header: nothing is covered`, element: 'edge-test-behind', first: true, css: edge_test_strip('behind', EDGE_TEST_STRIP_PX, 'auto') },
  // over the header's background and under its buttons and picture, which are raised over it
  { name: 'under', says: `the ${EDGE_TEST_STRIP_PX} px strip under the header's buttons and picture`, element: 'edge-test-under', css: edge_test_strip('under', EDGE_TEST_STRIP_PX) + ' .header .buttons { z-index: 51 } .header img.user { position: relative; z-index: 51 }' },
  { name: 'through', says: `the ${EDGE_TEST_STRIP_PX} px strip on top, letting taps through`, element: 'edge-test-through', css: edge_test_strip('through', EDGE_TEST_STRIP_PX, 50, '; pointer-events: none') },
  { name: 'strip6', says: 'a 6 px strip on top', element: 'edge-test-strip6', css: edge_test_strip('strip6', 6) },
  { name: 'strip3', says: 'a 3 px strip on top', element: 'edge-test-strip3', css: edge_test_strip('strip3', 3) },
  { name: 'strip1', says: 'a 1 px strip on top', element: 'edge-test-strip1', css: edge_test_strip('strip1', 1) },
  // the five that did not take the blur away on the phone (2026-11-17), as they were: the record
  { name: 'page', old: true, says: "the page's background in the header's color (it is black)", css: `html, body { background: ${EDGE_TEST_COLOR} !important }` },
  { name: 'theme', old: true, says: "theme-color in the header's color (it is #111)", meta: ['theme-color', () => EDGE_TEST_COLOR] },
  { name: 'scheme', old: true, says: 'the page declares a dark color scheme', css: ':root { color-scheme: dark }' },
  { name: 'cover', old: true, says: "the page reaches under the status bar, padded by the safe area, in the header's color", meta: ['viewport', old => [old, 'viewport-fit=cover'].filter(Boolean).join(', ')], css: `html { box-sizing: border-box; padding-top: env(safe-area-inset-top); background: ${EDGE_TEST_COLOR} }` },
  { name: 'document', old: true, says: "the page scrolls as a document, not inside its body: the app's own scrolling is off meanwhile", css: 'html, body { height: auto !important; overflow: visible !important }', moves: true },
]
const EDGE_TEST_OLD = 'these did not take the blur away (2026-11-17):'

// the panel's place: from the left edge, and over the bottom of what is in view (the visual
// viewport: with the keyboard up, the part above the keyboard), leaving `under` free below
// it for the key buttons' rows and `over` free above it for the edge that is looked at
const EDGE_TEST_LOOK = { left: 8, under: 48, over: 140 }
const EDGE_TEST_CSS = `
.edge-test { position: fixed; left: ${EDGE_TEST_LOOK.left}px; bottom: ${EDGE_TEST_LOOK.under}px; z-index: 87; display: flex; flex-direction: column; box-sizing: border-box; max-width: calc(100vw - ${2 * EDGE_TEST_LOOK.left}px); margin: 0; padding: 4px; border: 1px solid #444; border-radius: 6px; background: #1b1b1b; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5); color: #ddd; font: 13px/1.25 sans-serif; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none }
.edge-test button { display: block; flex: none; width: 100%; margin: 0; padding: 6px 8px; border: 0; border-radius: 4px; background: none; color: #ddd; font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent }
.edge-test button:focus { outline: none }
.edge-test button.on { color: #9f9 }
.edge-test button.title { color: #999 }
.edge-test button.copy { color: #9cf }
.edge-test > .facts { flex: none; padding: 2px 8px; color: #999; font-size: 12px; overflow-wrap: anywhere; cursor: text; user-select: text; -webkit-user-select: text; -webkit-touch-callout: default }
.edge-test > .switches { flex: 0 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch }
.edge-test > .switches > div { padding: 6px 8px 2px; color: #999; font-size: 12px }
.edge-test.folded > :not(.title) { display: none }
`
const EDGE_TEST_TICK_MS = 15000 // the task's look: the item's deletion is noticed at its next run

// ---- the code -----------------------------------------------------------------------------

const edge_test_code = _this.deephash
// whether this item is the page's one #edge_test (a renamed copy that keeps this code is not)
const edge_test_is_current = () => _item('#edge_test', { silent: true })?.id == _this.id

// put a switch on: returns what takes it off again, leaving the page as it was
function edge_test_apply(spec, doc) {
  const undo = []
  const header = () => doc.querySelector('.header')?.offsetTop ?? 0
  if (spec.css) {
    const style = doc.createElement('style')
    style.dataset.edgeTest = spec.name
    style.textContent = spec.css
    doc.head.appendChild(style)
    undo.push(() => style.remove())
  }
  if (spec.element) {
    const element = doc.createElement('div')
    element.className = spec.element
    element.dataset.edgeTest = spec.name
    if (spec.first) doc.body.insertBefore(element, doc.body.firstChild)
    else doc.body.appendChild(element)
    undo.push(() => element.remove())
  }
  if (spec.meta) {
    const [name, content] = spec.meta
    const meta = doc.querySelector(`meta[name="${name}"]`)
    if (meta) {
      const old = meta.getAttribute('content')
      meta.setAttribute('content', content(old ?? ''))
      undo.push(() => (old === null ? meta.removeAttribute('content') : meta.setAttribute('content', old)))
    } else {
      const made = doc.createElement('meta')
      made.setAttribute('name', name)
      made.setAttribute('content', content(''))
      doc.head.appendChild(made)
      undo.push(() => made.remove())
    }
  }
  if (spec.moves) {
    // the header at the window's top, as the app leaves it: in the document while that
    // scrolls, and in the body again afterwards
    doc.scrollingElement?.scrollTo(0, header())
    undo.push(() => doc.body.scrollTo(0, header()))
  }
  return () => undo.reverse().forEach(back => back())
}

// the safe area's top as the page has it, in px: more than nothing where the page lies under
// the status bar
const edge_test_safe_top = doc => {
  const probe = doc.createElement('div')
  probe.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: env(safe-area-inset-top, 0px); visibility: hidden'
  doc.body.appendChild(probe)
  const px = probe.offsetHeight ?? 0
  probe.remove()
  return px
}

// the panel's lines of facts, for whoever copies them to the agent: the window and the part
// of it in view (the visual viewport: its height, how far down the window it starts and its
// zoom), the least such part seen since the panel was drawn and the window's height then;
// the safe area's top and whether this is the Home Screen app; what the keyboard reported
// for the last space typed (the key alone: no text is kept); the switches that are on; and
// what the #key_buttons item reads of the keyboard (`keys`, its own lines), where it is here
const edge_test_facts = (win, least, space, safe, on = [], keys = null) => {
  const view = win.visualViewport
  const part = (height, top) => `${Math.round(height)} at ${Math.round(top ?? 0)}`
  const standalone = win.navigator?.standalone === true || !!win.matchMedia?.('(display-mode: standalone)').matches
  return [
    `window ${win.innerWidth}×${win.innerHeight} · view ${view ? `${part(view.height, view.offsetTop)} · scale ${Math.round((view.scale ?? 1) * 100) / 100}` : 'not told'}` + (least ? ` · least view ${part(least.height, least.top)} (window ${least.window})` : ''),
    `safe top ${safe} · ${standalone ? 'the Home Screen app' : 'a browser tab'}`,
    space ? `last space: shift ${space.shift ? 'on' : 'off'} · caps lock ${space.caps === null ? 'not told' : space.caps ? 'on' : 'off'} · code ${space.code || 'none'}` : 'last space: none typed yet',
    `switches on: ${on.join(', ') || 'none'}`,
    ...(keys ?? ['keys: the #key_buttons item is not on this page']),
  ]
}

// where the panel goes, as a fixed element's top and greatest height, from the part of the
// window in view (`view`) and the panel's own height: its bottom `under` above the view's
// bottom, wherever the view is in the window, and never so tall that less than `over` stays
// free above it (what does not fit scrolls inside the panel)
const edge_test_place = (view, height, look) => {
  const max = Math.max(0, Math.floor(view.height - look.under - look.over))
  return { max, top: Math.round((view.offsetTop ?? 0) + view.height - look.under - Math.min(height, max)) }
}

// put `text` on the clipboard: by the clipboard's own call, and where that is missing or
// refuses, by the older command over `lines`, the element that shows the text, selected for
// it. Where that fails too the lines stay selected, to be copied by hand. Says what happened
async function edge_test_copy(text, lines, win, doc) {
  try {
    await win.navigator.clipboard.writeText(text)
    return 'copied'
  } catch (e) {
    let done = false
    try {
      win.getSelection().selectAllChildren(lines)
      done = doc.execCommand('copy') === true
    } catch (e) {}
    if (done) win.getSelection().removeAllRanges()
    return done ? 'copied (the older way)' : 'not copied: the lines are selected, copy them by hand'
  }
}

// draw or keep the page's one panel (the pattern of the #vault item's sparkle): a controller
// on window owns the panel, its style, its listeners, its task and every switch that is on,
// and its dispose() undoes all of it. Code that changed, another item under the label and
// the item's deletion all dispose it; only the page's one #edge_test draws
function edge_test_reconcile() {
  if (typeof document == 'undefined') return // no page
  let held = window._edge_test
  if (!edge_test_is_current()) {
    if (held?.item === _this.id) held.dispose()
    return
  }
  if (held && (held.code !== edge_test_code || held.item !== _this.id)) {
    held.dispose()
    held = null
  }
  ;(held ?? edge_test_create()).draw()
}

function edge_test_create() {
  const self = { code: edge_test_code, item: _this.id, disposed: false, on: {}, least: null, space: null, folded: false, copied: '' }
  const style = document.createElement('style')
  style.dataset.edgeTest = 'style'
  style.textContent = EDGE_TEST_CSS
  document.head.appendChild(style)
  const panel = (self.panel = document.createElement('div'))
  panel.dataset.edgeTest = 'panel'
  // a button of the panel: its tap is the panel's alone, takes no focus and is nothing to the app
  const button = (parent, act) => {
    const node = document.createElement('button')
    node.type = 'button'
    node.tabIndex = -1
    node.addEventListener('click', e => {
      e.preventDefault()
      e.stopPropagation()
      if (!self.disposed) act()
    })
    node.addEventListener('mousedown', e => {
      e.preventDefault()
      e.stopPropagation()
    })
    node.addEventListener('touchstart', e => e.stopPropagation(), { passive: true })
    return parent.appendChild(node)
  }
  const title = button(panel, () => {
    self.folded = !self.folded
    self.draw()
  })
  // the facts: text that can be selected, and a button that copies it
  const facts = panel.appendChild(document.createElement('div'))
  facts.className = 'facts'
  const copy = button(panel, async () => {
    self.draw()
    self.copied = await edge_test_copy(self.lines().join('\n'), facts, window, document)
    if (!self.disposed) self.draw()
  })
  copy.dataset.edgeTest = 'copy'
  const list = panel.appendChild(document.createElement('div'))
  list.className = 'switches'
  const switches = EDGE_TEST_SWITCHES.map((spec, at) => {
    if (spec.old && !EDGE_TEST_SWITCHES[at - 1]?.old) list.appendChild(document.createElement('div')).textContent = EDGE_TEST_OLD
    const node = button(list, () => self.flip(spec.name))
    node.dataset.switch = spec.name
    return node
  })
  document.body.appendChild(panel)
  const viewport = window.visualViewport

  // the lines of facts as they are now
  self.lines = () => {
    let keys = null
    try {
      keys = window._key_buttons?.says?.() ?? null
    } catch (e) {}
    return edge_test_facts(window, self.least, self.space, edge_test_safe_top(document), EDGE_TEST_SWITCHES.map(spec => spec.name).filter(name => self.on[name]), keys)
  }
  self.draw = () => {
    panel.className = self.folded ? 'edge-test folded' : 'edge-test'
    title.className = 'title'
    title.textContent = self.folded ? 'edge test ▸' : 'edge test: put one on, look at the top edge ▾'
    const lines = self.lines()
    while (facts.children.length < lines.length) facts.appendChild(document.createElement('div'))
    while (facts.children.length > lines.length) facts.children[facts.children.length - 1].remove()
    lines.forEach((text, at) => (facts.children[at].textContent = text))
    copy.className = 'copy'
    copy.textContent = self.copied ? `copy these lines · ${self.copied}` : 'copy these lines'
    EDGE_TEST_SWITCHES.forEach((spec, at) => {
      const on = !!self.on[spec.name]
      switches[at].className = on ? 'on' : ''
      switches[at].textContent = `${on ? '●' : '○'} ${spec.name}: ${spec.says}`
      switches[at].setAttribute('aria-pressed', String(on))
    })
    self.place()
  }
  // the panel over the bottom of what is in view: above the keyboard while that is up
  self.place = () => {
    if (!viewport) return
    panel.style.maxHeight = edge_test_place(viewport, 0, EDGE_TEST_LOOK).max + 'px'
    Object.assign(panel.style, { top: edge_test_place(viewport, panel.offsetHeight ?? 0, EDGE_TEST_LOOK).top + 'px', bottom: 'auto' })
  }
  self.flip = name => {
    if (self.on[name]) {
      self.on[name]()
      delete self.on[name]
    } else self.on[name] = edge_test_apply(EDGE_TEST_SWITCHES.find(spec => spec.name == name), document)
    self.draw()
  }
  // the part of the window in view, whenever it changes: the least seen is kept for the facts
  const seen = () => {
    if (viewport && !(viewport.height >= self.least?.height)) self.least = { height: viewport.height, top: viewport.offsetTop, window: window.innerHeight }
    self.draw()
  }
  // a space typed anywhere: what the keyboard said of Shift and of caps lock for it
  const typed = e => {
    if (e.code != 'Space' && e.key != ' ') return
    self.space = { shift: !!e.shiftKey, caps: e.getModifierState ? !!e.getModifierState('CapsLock') : null, code: e.code ?? '' }
    self.draw()
  }
  // a focus that moves changes what the key buttons read: the lines follow
  const moved = () => self.draw()
  viewport?.addEventListener('resize', seen)
  viewport?.addEventListener('scroll', seen)
  window.addEventListener('keydown', typed, true)
  document.addEventListener('focusin', moved, true)
  document.addEventListener('focusout', moved, true)
  if (viewport) self.least = { height: viewport.height, top: viewport.offsetTop, window: window.innerHeight }

  self.dispose = () => {
    if (self.disposed) return
    self.disposed = true
    for (const name of Object.keys(self.on).reverse()) self.on[name]()
    self.on = {}
    viewport?.removeEventListener('resize', seen)
    viewport?.removeEventListener('scroll', seen)
    window.removeEventListener('keydown', typed, true)
    document.removeEventListener('focusin', moved, true)
    document.removeEventListener('focusout', moved, true)
    panel.remove()
    style.remove()
    if (window._edge_test === self) delete window._edge_test
  }
  window._edge_test = self
  const task = _this.dispatch_task('edge_test', () => (self.disposed ? null : void edge_test_reconcile()), EDGE_TEST_TICK_MS, EDGE_TEST_TICK_MS)
  task._on_cancel = self.dispose
  return self
}

// drawn from the item's hooks, so the panel shows with the item off screen: at the page's
// welcome, and when this item itself is installed, updated or edited
function _on_welcome() {
  edge_test_reconcile()
}

function _on_item_change(id) {
  if (id == _this.id) edge_test_reconcile()
}
