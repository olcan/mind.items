#!/usr/bin/env node
// plain-node table for the #edge_test item (edge_test.js): the switches in one place, what each
// changes on a page and that taking it off (or the item's going) leaves the page as it was, the
// panel's taps and the lines of facts, over a fake page. What a switch does to the top edge of
// the app on a phone is the phone's to show: this item exists for that.
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
  remove() { if (!this.parent) return; this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn) }
  getAttribute(name) { return this.attrs[name] ?? null }
  setAttribute(name, value) { this.attrs[name] = value }
  removeAttribute(name) { delete this.attrs[name] }
  scrollTo(x, y) { moved.push([this.tag, y]) }
  fire(type, more = {}) {
    const event = { type, target: this, prevented: 0, stopped: 0, preventDefault() { this.prevented++ }, stopPropagation() { this.stopped++ }, ...more }
    for (const fn of [...(this.listeners[type] ?? [])]) fn(event)
    return event
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
const viewport = Object.assign(new FakeNode('viewport'), { height: 844, offsetTop: 0 })
const win = Object.assign(new FakeNode('window'), { innerWidth: 390, innerHeight: 844, visualViewport: viewport, navigator: {}, matchMedia: () => ({ matches: false }) })
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
check('switches: six, the likelier first, each with a name of its own and a few words on what it changes',
  [names, new Set(names).size, switches.every(spec => spec.says.length >= 20 && spec.says.length <= 100)], [['page', 'strip', 'theme', 'scheme', 'cover', 'document'], 6, true])
const plain = picture()
const during = {}
const back = names.map(name => {
  const undo = v1('edge_test_apply(EDGE_TEST_SWITCHES.find(spec => spec.name == __args), document)', name)
  during[name] = { changed: picture() != plain, styles: all().filter(n => n.tag == 'style' && n.dataset.edgeTest == name).map(n => n.textContent), theme: theme.attrs.content, viewport: viewport_tag.attrs.content, strip: all().filter(n => n.className == 'edge-test-strip').length }
  undo()
  return picture() == plain
})
check('switches: each one changes the page, and taking it off leaves the page as it was', [names.map(name => during[name].changed), back], [names.map(() => true), names.map(() => true)])
check('switches: the page\'s background, the dark scheme and the document that scrolls are one stylesheet each, over the app\'s own rules where those are important',
  [during.page.styles, during.scheme.styles, during.document.styles],
  [['html, body { background: #171717 !important }'], [':root { color-scheme: dark }'], ['html, body { height: auto !important; overflow: visible !important }']])
check('switches: the strip is an element under the body, fixed along the top edge at the window\'s width, over 10 px high (WebKit takes no thinner one) and in the header\'s color',
  [during.strip.strip, during.strip.styles], [1, ['.edge-test-strip { position: fixed; top: 0; left: 0; width: 100%; height: 12px; z-index: 50; background: #171717 }']])
check('switches: the theme color and the viewport are the page\'s own tags, changed while the switch is on and no other time',
  [during.theme.theme, during.page.theme, theme.attrs.content, during.cover.viewport, during.page.viewport, during.cover.styles],
  ['#171717', '#111', '#111', 'width=device-width,initial-scale=1, viewport-fit=cover', 'width=device-width,initial-scale=1', ['html { box-sizing: border-box; padding-top: env(safe-area-inset-top); background: #171717 }']])
theme.remove()
const made = v1('edge_test_apply(EDGE_TEST_SWITCHES.find(spec => spec.name == "theme"), document)')
const added = page.querySelector('meta[name="theme-color"]')?.attrs
made()
check('switches: a page without the tag gets one while the switch is on, and loses it again', [added, page.querySelector('meta[name="theme-color"]')], [{ name: 'theme-color', content: '#171717' }, null])
page.head.children.unshift(Object.assign(theme, { parent: page.head }))
check('switches: the document that scrolls is put at the page\'s header, and the body again afterwards', moved, [['html', 717], ['body', 717]])
moved.length = 0

// ---- the facts ---------------------------------------------------------------------------------
const facts = (more, least, space, safe = 0) => v1('edge_test_facts(__args.win, __args.least, __args.space, __args.safe)', { win: { innerWidth: 390, innerHeight: 844, visualViewport: { height: 844, offsetTop: 0 }, ...more }, least, space, safe })
check('facts: the window, the part of it in view and the least seen; the safe area\'s top and where the app runs; the last space\'s Shift and caps lock',
  facts({ navigator: { standalone: true } }, { height: 507.6, top: 336.4, window: 844 }, { shift: true, caps: false, code: 'Space' }, 59),
  ['window 390×844 · view 844 at 0 · least view 508 at 336 (window 844)', 'safe top 59 · the Home Screen app', 'last space: shift on · caps lock off · code Space'])
check('facts: a browser tab, a display mode that says standalone, no space typed yet, a keyboard that tells no caps lock or no code, and no visual viewport',
  [facts({})[1], facts({ matchMedia: query => ({ matches: query == '(display-mode: standalone)' }) })[1], facts({})[2], facts({}, null, { shift: false, caps: null, code: '' })[2], facts({ visualViewport: undefined })[0]],
  ['safe top 0 · a browser tab', 'safe top 0 · the Home Screen app', 'last space: none typed yet', 'last space: shift off · caps lock not told · code none', 'window 390×844 · view not told'])

// ---- the controller ----------------------------------------------------------------------------
const panels = () => all().filter(n => n.dataset.edgeTest == 'panel')
const listening = () => [viewport.listeners.resize, viewport.listeners.scroll, win.listeners.keydown].map(list => (list ?? []).length)
v1('_on_welcome()')
const panel = panels()[0]
const [title, ...rest] = panel.children
const [buttons, lines] = [rest.slice(0, 6), rest.slice(6)]
check('panel: the welcome draws one panel under the body: its title, a switch for each cause, all off, and three lines of facts',
  [panels().length, panel.parent === page.body, panel.className, title.textContent, buttons.map(b => b.dataset.switch), buttons.map(b => b.textContent[0] + b.attrs['aria-pressed']), buttons[1].textContent, lines.map(l => l.textContent)],
  [1, true, 'edge-test', 'edge test: put one on, look at the top edge ▾', names, names.map(() => '○false'), `○ strip: ${switches[1].says}`, ['window 390×844 · view 844 at 0 · least view 844 at 0 (window 844)', 'safe top 0 · a browser tab', 'last space: none typed yet']])
const tap = buttons[0].fire('click')
const on = [all().filter(n => n.dataset.edgeTest == 'page').map(n => n.tag), all().filter(n => n.dataset.edgeTest == 'page').length, buttons[0].className, buttons[0].textContent[0], buttons[0].attrs['aria-pressed'], buttons[1].className]
buttons[1].fire('click')
buttons[0].fire('click')
check('panel: a tap puts a switch on and says so, another takes it off; the switches are each on or off by themselves, and a tap is the panel\'s alone',
  [on, all().filter(n => n.dataset.edgeTest == 'page').length, all().filter(n => n.dataset.edgeTest == 'strip').length, buttons.map(b => b.className), tap.prevented, tap.stopped],
  [[['style'], 1, 'on', '●', 'true', ''], 0, 2, ['', 'on', '', '', '', ''], 1, 1])
const press = ['mousedown', 'touchstart'].map(type => buttons[2].fire(type)).map(e => [e.prevented, e.stopped])
title.fire('click')
const folded = [panel.className, title.textContent]
title.fire('click')
check('panel: a press takes no focus and is not the app\'s, and the title folds the panel and opens it again', [press, folded, panel.className], [[[1, 1], [0, 1]], ['edge-test folded', 'edge test ▸'], 'edge-test'])
Object.assign(viewport, { height: 508, offsetTop: 336 })
viewport.fire('resize')
Object.assign(viewport, { height: 844, offsetTop: 0 })
viewport.fire('scroll')
const typed = win.fire('keydown', { key: ' ', code: 'Space', shiftKey: true, getModifierState: () => false })
const shifted = lines[2].textContent
win.fire('keydown', { key: ' ', code: '', shiftKey: false, getModifierState: name => name == 'CapsLock' })
win.fire('keydown', { key: 'a', code: 'KeyA', shiftKey: true })
check('panel: the facts follow the view and the keys: the least view seen stays, and a space says its Shift and its caps lock, each by itself, while any other key says nothing and none is prevented',
  [shifted, lines.map(l => l.textContent), typed.prevented], ['last space: shift on · caps lock off · code Space', ['window 390×844 · view 844 at 0 · least view 508 at 336 (window 844)', 'safe top 0 · a browser tab', 'last space: shift off · caps lock on · code none'], 0])
const v2 = evaluation(2)
v2('_on_item_change("another-id")')
const kept = panels()[0] === panel
v2('_on_item_change("edge-id")')
check('panel: another item\'s change is nothing to it; an update of the item replaces the panel, and what its switch changed is undone: the page is as it was but for the new panel',
  [kept, panels().length, panels()[0] !== panel, all().filter(n => n.dataset.edgeTest == 'strip').length, listening(), panels()[0].children.slice(1, 7).map(b => b.className)], [true, 1, true, 0, [1, 1, 1], ['', '', '', '', '', '']])
panels()[0].children[6].fire('click') // the document that scrolls, on
items['#edge_test'] = { id: 'other-id' }
const copy = evaluation(2, 'copy-id', {})
copy('_on_welcome()')
const alone = panels().length
v2('_on_item_change("edge-id")')
check('panel: an item that only carries the code draws nothing, and the item renamed takes its panel away with everything it changed', [alone, panels().length, picture() == plain, listening(), moved, v2('typeof window._edge_test')], [1, 0, true, [0, 0, 0], [['html', 717], ['body', 717]], 'undefined'])
items['#edge_test'] = { id: 'edge-id' }
v2('_on_item_change("edge-id")')
panels()[0].children[1].fire('click')
panels()[0].children[5].fire('click')
tasks.edge_test._on_cancel() // the app, at the task's next run after the item's deletion
check('panel: the item\'s deletion removes the panel, undoes every switch that was on and ends its task', [panels().length, picture() == plain, theme.attrs.content, viewport_tag.attrs.content, listening(), tasks.edge_test.fn(), tasks.edge_test.repeat],
  [0, true, '#111', 'width=device-width,initial-scale=1', [0, 0, 0], null, 15000])

// ---- the item ----------------------------------------------------------------------------------
const prose = item.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
check('item: its label, its code as an embed of edge_test.js, and its two hooks\' tags; no other tag, so an install pulls in no other item',
  [prose.match(/(?:^|\s)#[\w/]+/g).map(tag => tag.trim()), /\n```js_removed:edge_test\.js\n\/\/ edge_test\.js\n```\n/.test(item), /<</.test(item)], [['#edge_test', '#_welcome', '#_listen'], true, false])

if (failures) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('all ok')
