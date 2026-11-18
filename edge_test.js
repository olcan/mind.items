// #edge_test: a test for the blurry edge at the top of the app on an iPhone (the vault's todo
// of 2026-11-17: the owner's phone, iOS 27.2.1, the app run from the Home Screen, shows it
// with every scroller at its top). The app draws nothing there (no mask, blur or shadow in
// its styles), so the system does, and only the phone can show which of the things a page
// can change takes it away. This item puts a small panel on the page with one switch for
// each such thing: a tap puts it on, another takes it off, and the top edge is looked at in
// between. Nothing is kept: every switch is off after a reload, and the item's deletion (or
// its update) takes the panel away and undoes whatever a switch changed.
// What WebKit's source says (main, read 2026-11-17; UIKit and the Home Screen's container are
// closed): the web view's own scroll view has a top "scroll pocket", the system's soft edge
// effect on an iPhone. WebKit hides it only while it shows a color fill of its own for a
// fixed element at the top edge (WKWebView.mm: _updateHiddenScrollPocketEdges and
// _updateFixedColorExtensionViews; the fill needs an obscured inset at the top, which is the
// container's to declare), and otherwise the pocket "should match the scroll view background
// color" (_updateTopScrollPocketCaptureColor), which is the page's own background. The app's
// page is black behind a header of another color, and has no fixed element at its top

// ---- what to adjust ------------------------------------------------------------------------

const EDGE_TEST_COLOR = '#171717' // the app's header while the box has no focus (.header-container)
// WebKit takes no fixed element 10 px or less high for an edge's color, and none under nine
// tenths of the window's width (LocalFrameView::fixedContainerEdges)
const EDGE_TEST_STRIP_PX = 12

// the switches, in the panel's order, the likelier first. `says` is the few words on the page.
// A switch is put on by a stylesheet of its own (`css`), an element under the body (`element`,
// its class), a meta tag's content (`meta`: the tag's name, and the content to give it from
// the one it has) and a move of the page to its header (`moves`), and taken off by undoing them
const EDGE_TEST_SWITCHES = [
  // the pocket takes the scroll view's background, which is the page's: black, over a header that is not
  { name: 'page', says: "the page's background in the header's color (it is black)", css: `html, body { background: ${EDGE_TEST_COLOR} !important }` },
  // a fixed element at the top edge: WebKit fills the edge with its color and hides the pocket (it takes taps on those pixels meanwhile)
  { name: 'strip', says: `a ${EDGE_TEST_STRIP_PX} px strip in the header's color fixed along the top edge`, element: 'edge-test-strip', css: `.edge-test-strip { position: fixed; top: 0; left: 0; width: 100%; height: ${EDGE_TEST_STRIP_PX}px; z-index: 50; background: ${EDGE_TEST_COLOR} }` },
  // what the Home Screen's container may paint the status bar with
  { name: 'theme', says: "theme-color in the header's color (it is #111)", meta: ['theme-color', () => EDGE_TEST_COLOR] },
  // the system's materials have a light and a dark look, and the page declares neither (no mechanism found in WebKit: cheap to rule out)
  { name: 'scheme', says: 'the page declares a dark color scheme', css: ':root { color-scheme: dark }' },
  // the usual way of a Home Screen app: the page itself under the status bar, in its own color
  { name: 'cover', says: "the page reaches under the status bar, padded by the safe area, in the header's color", meta: ['viewport', old => [old, 'viewport-fit=cover'].filter(Boolean).join(', ')], css: `html { box-sizing: border-box; padding-top: env(safe-area-inset-top); background: ${EDGE_TEST_COLOR} }` },
  // the app scrolls its body inside a document that never moves: here the document moves, as on other pages
  { name: 'document', says: "the page scrolls as a document, not inside its body: the app's own scrolling is off meanwhile", css: 'html, body { height: auto !important; overflow: visible !important }', moves: true },
]

const EDGE_TEST_CSS = `
.edge-test { position: fixed; left: 8px; bottom: 48px; z-index: 87; box-sizing: border-box; max-width: calc(100vw - 16px); margin: 0; padding: 4px; border: 1px solid #444; border-radius: 6px; background: #1b1b1b; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5); color: #ddd; font: 13px/1.25 sans-serif; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none }
.edge-test > button { display: block; width: 100%; margin: 0; padding: 6px 8px; border: 0; border-radius: 4px; background: none; color: #ddd; font: inherit; text-align: left; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent }
.edge-test > button:focus { outline: none }
.edge-test > button.on { color: #9f9 }
.edge-test > button.title { color: #999 }
.edge-test > div { padding: 2px 8px; color: #999; font-size: 12px; overflow-wrap: anywhere }
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
    doc.body.appendChild(element)
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

// the panel's lines of facts, for whoever reads them to the agent: the window and the part
// of it in view (the visual viewport: its height and how far down the window it starts), the
// least such part seen since the panel was drawn (with the keyboard up) and the window's
// height then, the safe area's top, whether this is the Home Screen app, and what the
// keyboard reported for the last space typed (the key alone: no text is kept)
const edge_test_facts = (win, least, space, safe) => {
  const view = win.visualViewport
  const part = (height, top) => `${Math.round(height)} at ${Math.round(top ?? 0)}`
  const standalone = win.navigator?.standalone === true || !!win.matchMedia?.('(display-mode: standalone)').matches
  return [
    `window ${win.innerWidth}×${win.innerHeight} · view ${view ? part(view.height, view.offsetTop) : 'not told'}` + (least ? ` · least view ${part(least.height, least.top)} (window ${least.window})` : ''),
    `safe top ${safe} · ${standalone ? 'the Home Screen app' : 'a browser tab'}`,
    space ? `last space: shift ${space.shift ? 'on' : 'off'} · caps lock ${space.caps === null ? 'not told' : space.caps ? 'on' : 'off'} · code ${space.code || 'none'}` : 'last space: none typed yet',
  ]
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
  const self = { code: edge_test_code, item: _this.id, disposed: false, on: {}, least: null, space: null, folded: false }
  const style = document.createElement('style')
  style.dataset.edgeTest = 'style'
  style.textContent = EDGE_TEST_CSS
  document.head.appendChild(style)
  const panel = (self.panel = document.createElement('div'))
  panel.dataset.edgeTest = 'panel'
  // a button of the panel: its tap is the panel's alone, takes no focus and is nothing to the app
  const button = act => {
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
    return panel.appendChild(node)
  }
  const title = button(() => {
    self.folded = !self.folded
    self.draw()
  })
  const switches = EDGE_TEST_SWITCHES.map(spec => {
    const node = button(() => self.flip(spec.name))
    node.dataset.switch = spec.name
    return node
  })
  const lines = [0, 1, 2].map(() => panel.appendChild(document.createElement('div')))
  document.body.appendChild(panel)

  self.draw = () => {
    panel.className = self.folded ? 'edge-test folded' : 'edge-test'
    title.className = 'title'
    title.textContent = self.folded ? 'edge test ▸' : 'edge test: put one on, look at the top edge ▾'
    EDGE_TEST_SWITCHES.forEach((spec, at) => {
      const on = !!self.on[spec.name]
      switches[at].className = on ? 'on' : ''
      switches[at].textContent = `${on ? '●' : '○'} ${spec.name}: ${spec.says}`
      switches[at].setAttribute('aria-pressed', String(on))
    })
    edge_test_facts(window, self.least, self.space, edge_test_safe_top(document)).forEach((text, at) => (lines[at].textContent = text))
  }
  self.flip = name => {
    if (self.on[name]) {
      self.on[name]()
      delete self.on[name]
    } else self.on[name] = edge_test_apply(EDGE_TEST_SWITCHES.find(spec => spec.name == name), document)
    self.draw()
  }
  // the part of the window in view, whenever it changes: the least seen is kept for the facts
  const viewport = window.visualViewport
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
  viewport?.addEventListener('resize', seen)
  viewport?.addEventListener('scroll', seen)
  window.addEventListener('keydown', typed, true)
  if (viewport) self.least = { height: viewport.height, top: viewport.offsetTop, window: window.innerHeight }

  self.dispose = () => {
    if (self.disposed) return
    self.disposed = true
    for (const name of Object.keys(self.on).reverse()) self.on[name]()
    self.on = {}
    viewport?.removeEventListener('resize', seen)
    viewport?.removeEventListener('scroll', seen)
    window.removeEventListener('keydown', typed, true)
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
