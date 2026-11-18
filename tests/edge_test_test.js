#!/usr/bin/env node
// plain-node table for the #edge_test item (edge_test.js): the switches in one place (the strip's
// variants with their styles, then the five kept as the record), what each changes on a page and
// that taking it off (or the item's going) leaves the page as it was, the lines of facts and
// their copy, the panel's place from a visual viewport, and the panel's taps, over a fake page.
// What a switch does to the top edge of the app on a phone is the phone's to show.
// run: node external/mind.items/tests/edge_test_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const code = fs.readFileSync(path.join(__dirname, '..', 'edge_test.js'), 'utf8')
const item = fs.readFileSync(path.join(__dirname, '..', 'edge_test.md'), 'utf8')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// ---- a fake page -------------------------------------------------------------------------------
const moved = []
class FakeNode {
  constructor(tag) { Object.assign(this, { tag, children: [], parent: null, listeners: {}, dataset: {}, attrs: {}, style: {}, className: '', textContent: '' }) }
  appendChild(child) { child.parent = this; this.children.push(child); return child }
  insertBefore(child, before) { child.parent = this; this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child); return child }
  get firstChild() { return this.children[0] ?? null }
  remove() { if (!this.parent) return; this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn) }
  getAttribute(name) { return this.attrs[name] ?? null }
  setAttribute(name, value) { this.attrs[name] = value }
  removeAttribute(name) { delete this.attrs[name] }
  scrollTo(x, y) { moved.push([this.tag, y]) }
  fire(type, more = {}) {
    const event = { type, target: this, prevented: 0, stopped: 0, preventDefault() { this.prevented++ }, stopPropagation() { this.stopped++ }, ...more }
    return [event, ...[...(this.listeners[type] ?? [])].map(fn => fn(event))]
  }
}
const all = () => { const out = []; const walk = n => { out.push(n); n.children.forEach(walk) }; walk(page.head); walk(page.body); return out }
const page = Object.assign(new FakeNode('document'), { head: new FakeNode('head'), body: new FakeNode('body'), scrollingElement: new FakeNode('html'), createElement: tag => new FakeNode(tag) })
page.querySelector = selector => {
  const meta = selector.match(/^meta\[name="([\w-]+)"\]$/)
  if (meta) return all().find(n => n.tag == 'meta' && n.attrs.name == meta[1]) ?? null
  if (selector == '.header') return { offsetTop: 717 }
  throw new Error(selector)
}
const tag = (name, content) => { const meta = page.head.appendChild(new FakeNode('meta')); meta.attrs = { name, content }; return meta }
const [theme, viewport_tag] = [tag('theme-color', '#111'), tag('viewport', 'width=device-width,initial-scale=1')]
// the page as a switch could change it: the head's and the body's children with all they say
const picture = () => JSON.stringify([page.head, page.body].map(root => root.children.map(n => [n.tag, n.className, n.dataset, n.attrs, n.textContent, n.style])))
const viewport = Object.assign(new FakeNode('viewport'), { height: 844, offsetTop: 0, scale: 1 })
// the clipboard and the selection, as a page has them: what was written, what is selected, and whether each call works
const board = { text: null, refuses: false, selected: null, command: true, commands: [] }
const clipboard = { writeText: async text => { if (board.refuses) throw new Error('NotAllowedError'); board.text = text } }
const win = Object.assign(new FakeNode('window'), {
  innerWidth: 390, innerHeight: 844, visualViewport: viewport, navigator: { clipboard }, matchMedia: () => ({ matches: false }),
  getSelection: () => ({ selectAllChildren: node => (board.selected = node), removeAllRanges: () => (board.selected = null) }),
})
page.execCommand = command => { board.commands.push(command); if (board.command && board.selected) board.text = board.selected.children.map(line => line.textContent).join('\n'); return board.command }
const items = { '#edge_test': { id: 'edge-id' } }
const tasks = {}
const evaluation = (deephash, id = 'edge-id', own = tasks) => {
  const _this = { id, deephash, dispatch_task(name, fn, delay, repeat) { own[name]?._on_cancel?.(); return (own[name] = { fn, delay, repeat }) } }
  const context = vm.createContext({ _this, _item: label => items[label] ?? null, document: page, window: win })
  vm.runInContext(code, context)
  return (src, args) => { context.__args = args; return vm.runInContext(src, context) }
}
const v1 = evaluation(1)

// ---- the switches ------------------------------------------------------------------------------
const switches = v1('EDGE_TEST_SWITCHES')
const names = switches.map(spec => spec.name)
const strips = ['strip12', 'sticky', 'behind', 'under', 'through', 'strip6', 'strip3', 'strip1']
const record = ['page', 'theme', 'scheme', 'cover', 'document']
check('switches: the strip\'s variants first (the one that worked, then from the least in the way), then the five that did not work, marked as the record; each with a name of its own and a few words',
  [names, new Set(names).size, switches.filter(spec => spec.old).map(spec => spec.name), switches.every(spec => spec.says.length >= 15 && spec.says.length <= 100)], [[...strips, ...record], 13, record, true])
const plain = picture()
const during = {}
const back = names.map(name => {
  const undo = v1('edge_test_apply(EDGE_TEST_SWITCHES.find(spec => spec.name == __args), document)', name)
  during[name] = { changed: picture() != plain, styles: all().filter(n => n.tag == 'style' && n.dataset.edgeTest == name).map(n => n.textContent), theme: theme.attrs.content, viewport: viewport_tag.attrs.content, elements: all().filter(n => n.tag == 'div' && n.dataset.edgeTest == name).map(n => n.className) }
  undo()
  return picture() == plain
})
check('switches: each one changes the page, and taking it off leaves the page as it was', [names.map(name => during[name].changed), back], [names.map(() => true), names.map(() => true)])
const strip = (name, px, z = 50, more = '') => `.edge-test-${name} { position: fixed; top: 0; left: 0; width: 100%; height: ${px}px; z-index: ${z}; background: #171717${more} }`
check('strips: the control is the strip that worked, as it was: 12 px in the header\'s color, fixed along the top edge at the window\'s width, over the page',
  [during.strip12.styles, during.strip12.elements], [['.edge-test-strip12 { position: fixed; top: 0; left: 0; width: 100%; height: 12px; z-index: 50; background: #171717 }'], ['edge-test-strip12']])
page.body.appendChild(new FakeNode('main')) // the page's own content
const body_at = name => { const undo = v1('edge_test_apply(EDGE_TEST_SWITCHES.find(spec => spec.name == __args), document)', name); const at = page.body.children.map(n => n.dataset.edgeTest ?? n.tag).indexOf(name); undo(); return at }
check('strips: the same strip behind the header (at the page\'s own layer, and first in the page: under every positioned box that follows), under the header\'s buttons and picture (they are raised over it), and letting taps through; each is one element of its own, the others last in the page',
  [during.behind.styles, during.under.styles, during.through.styles, ['behind', 'under', 'through'].map(name => during[name].elements), ['behind', 'under', 'strip12'].map(body_at)],
  [[strip('behind', 12, 'auto')], [strip('under', 12) + ' .header .buttons { z-index: 51 } .header img.user { position: relative; z-index: 51 }'], [strip('through', 12, 50, '; pointer-events: none')], [['edge-test-behind'], ['edge-test-under'], ['edge-test-through']], [0, 1, 1]])
page.body.children.pop()
check('strips: the thinner ones differ from the control in their height alone: 6, 3 and 1 px',
  [during.strip6.styles, during.strip3.styles, during.strip1.styles], [[strip('strip6', 6)], [strip('strip3', 3)], [strip('strip1', 1)]])
check('strips: the sticky one adds no element: the app\'s header is declared sticky, over the app\'s own rule', [during.sticky.styles, during.sticky.elements], [['.header { position: sticky !important }'], []])
check('record: the five that did not work are as they were: the page\'s background, the theme color, the dark scheme, the page under the status bar, the document that scrolls',
  [during.page.styles, during.theme.theme, during.scheme.styles, during.cover.viewport, during.cover.styles, during.document.styles, during.page.theme, during.page.viewport],
  [['html, body { background: #171717 !important }'], '#171717', [':root { color-scheme: dark }'], 'width=device-width,initial-scale=1, viewport-fit=cover', ['html { box-sizing: border-box; padding-top: env(safe-area-inset-top); background: #171717 }'], ['html, body { height: auto !important; overflow: visible !important }'], '#111', 'width=device-width,initial-scale=1'])
theme.remove()
const made = v1('edge_test_apply(EDGE_TEST_SWITCHES.find(spec => spec.name == "theme"), document)')
const added = page.querySelector('meta[name="theme-color"]')?.attrs
made()
check('record: a page without the tag gets one while the switch is on, and loses it again', [added, page.querySelector('meta[name="theme-color"]')], [{ name: 'theme-color', content: '#171717' }, null])
page.head.children.unshift(Object.assign(theme, { parent: page.head }))
check('record: the document that scrolls is put at the page\'s header, and the body again afterwards', moved, [['html', 717], ['body', 717]])
moved.length = 0

// ---- the facts and the panel's place -----------------------------------------------------------
const facts = (more, least, space, safe = 0, on, keys) => v1('edge_test_facts(__args.win, __args.least, __args.space, __args.safe, __args.on, __args.keys)', { win: { innerWidth: 390, innerHeight: 844, visualViewport: { height: 844, offsetTop: 0, scale: 1 }, ...more }, least, space, safe, on, keys })
check('facts: the window, the part of it in view with its zoom and the least seen; the safe area\'s top and where the app runs; the last space\'s Shift and caps lock; the switches that are on; the key buttons\' own lines',
  facts({ navigator: { standalone: true }, visualViewport: { height: 507.6, offsetTop: 336.4, scale: 1.004 } }, { height: 507.6, top: 336.4, window: 844 }, { shift: true, caps: false, code: 'Space' }, 59, ['sticky', 'behind'], ['keys: a', 'keys before: b']),
  ['window 390×844 · view 508 at 336 · scale 1 · least view 508 at 336 (window 844)', 'safe top 59 · the Home Screen app', 'last space: shift on · caps lock off · code Space', 'switches on: sticky, behind', 'keys: a', 'keys before: b'])
check('facts: a browser tab, a display mode that says standalone, no space typed yet, a keyboard that tells no caps lock or no code, a zoom, no visual viewport, no switch on, no key buttons',
  [facts({})[1], facts({ matchMedia: query => ({ matches: query == '(display-mode: standalone)' }) })[1], facts({})[2], facts({}, null, { shift: false, caps: null, code: '' })[2], facts({ visualViewport: { height: 422, offsetTop: 0, scale: 2 } })[0], facts({ visualViewport: undefined })[0], ...facts({}).slice(3)],
  ['safe top 0 · a browser tab', 'safe top 0 · the Home Screen app', 'last space: none typed yet', 'last space: shift off · caps lock not told · code none', 'window 390×844 · view 422 at 0 · scale 2', 'window 390×844 · view not told', 'switches on: none', 'keys: the #key_buttons item is not on this page'])
const place = (view, height) => v1('edge_test_place(__args.view, __args.height, EDGE_TEST_LOOK)', { view, height })
check('place: the panel\'s bottom 48 px over the bottom of what is in view, never so tall that under 140 px stay free above it',
  [v1('EDGE_TEST_LOOK'), place({ offsetTop: 0, height: 844 }, 600), place({ height: 844 }, 700)], [{ left: 8, under: 48, over: 140 }, { max: 656, top: 196 }, { max: 656, top: 140 }])
check('place: with the keyboard up the view is shorter and may be down the window: the panel is over the keyboard, and a view too short leaves it no height',
  [place({ offsetTop: 336, height: 508 }, 200), place({ offsetTop: 336, height: 508 }, 400), place({ offsetTop: 0.4, height: 150.6 }, 90)], [{ max: 320, top: 596 }, { max: 320, top: 476 }, { max: 0, top: 103 }])
const sheet = v1('EDGE_TEST_CSS')
check('look: the panel is fixed 8 px in and 48 px up where no view is told, its taps select nothing, and its lines of facts can be selected; a folded panel is its title alone, and the switches scroll inside a panel that is not given its height',
  ['.edge-test { position: fixed; left: 8px; bottom: 48px;', 'user-select: none; -webkit-user-select: none; -webkit-touch-callout: none }\n.edge-test button', '.edge-test > .facts { flex: none;', 'cursor: text; user-select: text; -webkit-user-select: text; -webkit-touch-callout: default }', '.edge-test.folded > :not(.title) { display: none }', '.edge-test > .switches { flex: 0 1 auto; min-height: 0; overflow-y: auto;'].map(rule => sheet.includes(rule)),
  [true, true, true, true, true, true])

;(async () => {
  // ---- the copy ----------------------------------------------------------------------------------
  const lines_node = Object.assign(new FakeNode('div'), { children: ['one', 'two'].map(text => Object.assign(new FakeNode('div'), { textContent: text })) })
  const copy = () => v1('edge_test_copy("one\\ntwo", __args, window, document)', lines_node)
  const by_call = [await copy(), board.text, board.commands.length]
  Object.assign(board, { text: null, refuses: true })
  const by_command = [await copy(), board.text, [...board.commands], board.selected]
  Object.assign(board, { text: null, command: false })
  const by_hand = [await copy(), board.text, board.selected === lines_node]
  Object.assign(board, { text: null, command: true, selected: null })
  win.navigator = {}
  const without = [await copy(), board.text]
  win.navigator = { clipboard }
  page.execCommand_was = page.execCommand
  page.execCommand = () => { throw new Error('no such command') }
  const thrown = await copy()
  page.execCommand = page.execCommand_was
  Object.assign(board, { text: null, refuses: false, selected: null, commands: [] })
  check('copy: by the clipboard\'s own call; where that refuses or is missing, by the older command over the lines selected for it; where that fails or throws too, the lines stay selected to be copied by hand',
    [by_call, by_command, by_hand, without, thrown],
    [['copied', 'one\ntwo', 0], ['copied (the older way)', 'one\ntwo', ['copy'], null], ['not copied: the lines are selected, copy them by hand', null, true], ['copied (the older way)', 'one\ntwo'], 'not copied: the lines are selected, copy them by hand'])

  // ---- the controller ----------------------------------------------------------------------------
  const panels = () => all().filter(n => n.dataset.edgeTest == 'panel')
  const listening = () => [viewport.listeners.resize, viewport.listeners.scroll, win.listeners.keydown, page.listeners.focusin, page.listeners.focusout].map(list => (list ?? []).length)
  const lines_of = panel => panel.children[1].children.map(line => line.textContent)
  v1('_on_welcome()')
  const panel = panels()[0]
  const [title, facts_node, copy_button, list] = panel.children
  const buttons = list.children.filter(n => n.tag == 'button')
  check('panel: the welcome draws one panel under the body: its title, the lines of facts with their copy, and under them a switch for each cause, all off, the record under a line of its own',
    [panels().length, panel.parent === page.body, panel.className, title.textContent, facts_node.className, lines_of(panel), [copy_button.className, copy_button.textContent, copy_button.dataset.edgeTest], list.className, buttons.map(b => b.dataset.switch), buttons.map(b => b.textContent[0] + b.attrs['aria-pressed']), buttons[3].textContent, list.children.map(n => n.tag).indexOf('div'), list.children[8].textContent],
    [1, true, 'edge-test', 'edge test: put one on, look at the top edge ▾', 'facts', ['window 390×844 · view 844 at 0 · scale 1 · least view 844 at 0 (window 844)', 'safe top 0 · a browser tab', 'last space: none typed yet', 'switches on: none', 'keys: the #key_buttons item is not on this page'], ['copy', 'copy these lines', 'copy'], 'switches', names, names.map(() => '○false'), `○ under: ${switches[3].says}`, 8, 'these did not take the blur away (2026-11-17):'])
  const [tap] = buttons[3].fire('click')
  const on = [all().filter(n => n.dataset.edgeTest == 'under').map(n => n.tag), buttons[3].className, buttons[3].textContent[0], buttons[3].attrs['aria-pressed'], buttons[2].className, lines_of(panel)[3]]
  buttons[1].fire('click')
  buttons[3].fire('click')
  check('panel: a tap puts a switch on and says so, in its own words and in the facts; another takes it off; the switches are each on or off by themselves, and a tap is the panel\'s alone',
    [on, all().filter(n => n.dataset.edgeTest == 'under').length, all().filter(n => n.dataset.edgeTest == 'sticky').length, buttons.map(b => b.className).filter(Boolean), lines_of(panel)[3], tap.prevented, tap.stopped],
    [[['style', 'div'], 'on', '●', 'true', '', 'switches on: under'], 0, 1, ['on'], 'switches on: sticky', 1, 1])
  const press = ['mousedown', 'touchstart'].map(type => buttons[2].fire(type)[0]).map(e => [e.prevented, e.stopped])
  title.fire('click')
  const folded = [panel.className, title.textContent]
  title.fire('click')
  check('panel: a press takes no focus and is not the app\'s, and the title folds the panel and opens it again', [press, folded, panel.className], [[[1, 1], [0, 1]], ['edge-test folded', 'edge test ▸'], 'edge-test'])
  panel.offsetHeight = 300
  viewport.fire('scroll')
  const down = [panel.style.maxHeight, panel.style.top, panel.style.bottom]
  Object.assign(viewport, { height: 508, offsetTop: 336 })
  viewport.fire('resize')
  const over_keyboard = [panel.style.maxHeight, panel.style.top]
  panel.offsetHeight = 320 // as the browser would lay it out under that greatest height
  viewport.fire('scroll')
  const fitted = panel.style.top
  Object.assign(viewport, { height: 844, offsetTop: 0 })
  viewport.fire('resize')
  check('panel: it is placed from the part of the window in view, at every change of it: over the window\'s bottom, and with the keyboard up over the keyboard, no taller than what is left',
    [down, over_keyboard, fitted, panel.style.top], [['656px', '496px', 'auto'], ['320px', '496px'], '476px', '476px'])
  win._key_buttons = { says: () => ['keys: row keyboard', 'keys before: nothing yet'] }
  const [typed] = win.fire('keydown', { key: ' ', code: 'Space', shiftKey: true, getModifierState: () => false })
  const shifted = lines_of(panel)
  win.fire('keydown', { key: ' ', code: '', shiftKey: false, getModifierState: name => name == 'CapsLock' })
  win.fire('keydown', { key: 'a', code: 'KeyA', shiftKey: true })
  win._key_buttons = { says: () => { throw new Error('gone') } }
  page.fire('focusin')
  const threw = lines_of(panel).slice(4)
  win._key_buttons = { says: () => ['keys: row main'] }
  page.fire('focusout')
  check('panel: the facts follow the view, the keys and the focus: the least view seen stays, a space says its Shift and its caps lock, each by itself, while any other key says nothing and none is prevented; the key buttons\' lines are theirs, or say that they are not here',
    [shifted, lines_of(panel).slice(0, 3), typed.prevented, threw, lines_of(panel).slice(3)],
    [['window 390×844 · view 844 at 0 · scale 1 · least view 508 at 336 (window 844)', 'safe top 0 · a browser tab', 'last space: shift on · caps lock off · code Space', 'switches on: sticky', 'keys: row keyboard', 'keys before: nothing yet'],
      ['window 390×844 · view 844 at 0 · scale 1 · least view 508 at 336 (window 844)', 'safe top 0 · a browser tab', 'last space: shift off · caps lock on · code none'], 0, ['keys: the #key_buttons item is not on this page'], ['switches on: sticky', 'keys: row main']])
  const settled = () => new Promise(resolve => setImmediate(resolve)) // the copy is the page's own promise
  const [copied] = copy_button.fire('click')
  await settled()
  const said = copy_button.textContent
  board.refuses = true
  board.command = false
  copy_button.fire('click')
  await settled()
  Object.assign(board, { refuses: false, command: true, selected: null })
  check('panel: the copy button puts the lines as they are on the clipboard and says so; where nothing copies, it says that the lines are selected; its tap is the panel\'s alone',
    [board.text, said, copy_button.textContent, copied.prevented, copied.stopped],
    [lines_of(panel).join('\n'), 'copy these lines · copied', 'copy these lines · not copied: the lines are selected, copy them by hand', 1, 1])
  delete win._key_buttons
  const v2 = evaluation(2)
  v2('_on_item_change("another-id")')
  const kept = panels()[0] === panel
  v2('_on_item_change("edge-id")')
  const switches_of = node => node.children[3].children.filter(n => n.tag == 'button')
  check('panel: another item\'s change is nothing to it; an update of the item replaces the panel, and what its switch changed is undone: the page is as it was but for the new panel',
    [kept, panels().length, panels()[0] !== panel, all().filter(n => n.dataset.edgeTest == 'sticky').length, listening(), switches_of(panels()[0]).map(b => b.className).filter(Boolean)], [true, 1, true, 0, [1, 1, 1, 1, 1], []])
  switches_of(panels()[0])[12].fire('click') // the document that scrolls, on
  items['#edge_test'] = { id: 'other-id' }
  const copy_item = evaluation(2, 'copy-id', {})
  copy_item('_on_welcome()')
  const alone = panels().length
  v2('_on_item_change("edge-id")')
  check('panel: an item that only carries the code draws nothing, and the item renamed takes its panel away with everything it changed', [alone, panels().length, picture() == plain, listening(), moved, v2('typeof window._edge_test')], [1, 0, true, [0, 0, 0, 0, 0], [['html', 717], ['body', 717]], 'undefined'])
  items['#edge_test'] = { id: 'edge-id' }
  v2('_on_item_change("edge-id")')
  for (const at of [0, 3, 9, 11]) switches_of(panels()[0])[at].fire('click')
  const before = [all().filter(n => n.tag == 'div' && /^edge-test-/.test(n.className)).length, theme.attrs.content, viewport_tag.attrs.content]
  tasks.edge_test._on_cancel() // the app, at the task's next run after the item's deletion
  check('panel: the item\'s deletion removes the panel, undoes every switch that was on and ends its task', [before, panels().length, picture() == plain, theme.attrs.content, viewport_tag.attrs.content, listening(), tasks.edge_test.fn(), tasks.edge_test.repeat],
    [[2, '#171717', 'width=device-width,initial-scale=1, viewport-fit=cover'], 0, true, '#111', 'width=device-width,initial-scale=1', [0, 0, 0, 0, 0], null, 15000])

  // ---- the item ----------------------------------------------------------------------------------
  const prose = item.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  check('item: its label, its code as an embed of edge_test.js, and its two hooks\' tags; no other tag, so an install pulls in no other item',
    [prose.match(/(?:^|\s)#[\w/]+/g).map(tag => tag.trim()), /\n```js_removed:edge_test\.js\n\/\/ edge_test\.js\n```\n/.test(item), /<</.test(item)], [['#edge_test', '#_welcome', '#_listen'], true, false])

  if (failures) {
    console.log(`${failures} FAILED`)
    process.exit(1)
  }
  console.log('all ok')
})()
