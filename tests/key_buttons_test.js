#!/usr/bin/env node
// plain-node table for the #key_buttons item (key_buttons.js): the buttons and the look in one
// place, the keyboard events one press sends and where, when the row shows (the sparkle's own
// keyboard test, held to the same answers as vault.md's), and the controller over a fake page.
// What the app does with a sent key is the browser lane's (mind.page tests/e2e/key_buttons.spec.ts).
// run: node external/mind.items/tests/key_buttons_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const code = fs.readFileSync(path.join(__dirname, '..', 'key_buttons.js'), 'utf8')
const item = fs.readFileSync(path.join(__dirname, '..', 'key_buttons.md'), 'utf8')
const vault = fs.readFileSync(path.join(__dirname, '..', 'vault.md'), 'utf8')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// ---- a fake page: nodes with listeners, the window's viewport and pointer, the app's task seam
const log = []
class FakeNode {
  constructor(tag) { Object.assign(this, { tag, children: [], parent: null, listeners: {}, dataset: {}, attrs: {}, hidden: false, got: [] }) }
  appendChild(child) { child.parent = this; this.children.push(child); if (child.dataset.keyButtons) log.push('+' + child.dataset.keyButtons + (child.hidden ? ' hidden' : '')); return child }
  remove() { if (!this.parent) return; this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; log.push('-' + this.dataset.keyButtons) }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn) }
  setAttribute(name, value) { this.attrs[name] = value }
  closest(selector) { for (let n = this; n; n = n.parent) if (n.className && selector == '.' + n.className) return n; return null }
  dispatchEvent(event) { this.got.push(event) } // a key sent here
  fire(type) {
    const event = { type, target: this, prevented: 0, stopped: 0, preventDefault() { this.prevented++ }, stopPropagation() { this.stopped++ } }
    for (const fn of [...(this.listeners[type] ?? [])]) fn(event)
    return event
  }
}
const page = Object.assign(new FakeNode('document'), { head: new FakeNode('head'), body: new FakeNode('body'), activeElement: null, createElement: tag => new FakeNode(tag) })
page.documentElement = new FakeNode('html')
const all = () => { const out = []; const walk = n => { out.push(n); n.children.forEach(walk) }; walk(page.head); walk(page.body); return out }
const parts = kind => all().filter(n => n.dataset.keyButtons == kind)
const viewport = Object.assign(new FakeNode('viewport'), { height: 800, scale: 1 })
const pointer = Object.assign(new FakeNode('media'), { matches: false })
const win = { innerHeight: 800, visualViewport: viewport, matchMedia: query => (query == '(pointer: coarse)' ? pointer : { matches: false }) }
class FakeKey { constructor(type, init) { Object.assign(this, { type, ...init }) } }
const items = { '#key_buttons': { id: 'keys-id' } } // the label index: what #key_buttons names
const tasks = {}
// one evaluation of the item's code, as a hook's: `_this` with the deephash of the text then
// (the app evaluates the item's code afresh at every hook and keeps the tasks per item)
const evaluation = (deephash, id = 'keys-id', own = tasks) => {
  const _this = {
    id, deephash,
    dispatch_task(name, fn, delay, repeat) {
      own[name]?._on_cancel?.() // the app: a same-named dispatch cancels the earlier task
      log.push(`task ${name}`)
      return (own[name] = { fn, delay, repeat })
    },
  }
  const context = vm.createContext({ _this, _item: label => items[label] ?? null, document: page, window: win, KeyboardEvent: FakeKey })
  vm.runInContext(code, context)
  return (src, args) => { context.__args = args; return vm.runInContext(src, context) }
}
const v1 = evaluation(1)

// ---- the buttons and the look ----------------------------------------------------------------
const buttons = v1('KEY_BUTTONS')
const look = v1('KEY_BUTTONS_LOOK')
check('buttons: seven, in the row\'s order: the two scrolls, the create, the four arrows', buttons.map(b => b.name), ['top', 'back', 'create', 'left', 'up', 'down', 'right'])
check('buttons: each sends its key: the arrows bare, Shift+Enter, Ctrl+Alt+Up and Ctrl+Alt+Down',
  buttons.map(b => [b.ctrl && 'Ctrl', b.alt && 'Alt', b.shift && 'Shift', b.key].filter(Boolean).join('+')),
  ['Ctrl+Alt+ArrowUp', 'Ctrl+Alt+ArrowDown', 'Shift+Enter', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'])
check('buttons: each has an icon and says what its key does, naming the key', buttons.every(b => /^M[\d\s.,MmLlHhVvAa-]+$/.test(b.icon) && /^\S.* \((Ctrl\+Alt\+)?(Shift\+)?\w+\)$/.test(b.title)), true)
// the sparkle's place and look, read from vault.md: the row is laid out against them
const sparkle = vault.match(/\n\.vault-sparkle \{[^}]*right: (\d+)px; bottom: (\d+)px; z-index: (\d+);[^}]*width: (\d+)px; height: (\d+)px;[^}]*background: (#\w+); box-shadow: ([^;]+); color: (#\w+)/)
const layer = vault.match(/\n\.vault-sparkle-backdrop \{[^}]*z-index: (\d+)/)
const [right, bottom, , width, height] = sparkle.slice(1, 6).map(Number)
const row = buttons.length * look.size + (buttons.length - 1) * look.gap
check('look: the row ends left of the sparkle, is centred on it, and fits a 320 px window',
  [look.right >= right + width, look.bottom + look.size / 2 == bottom + height / 2, look.right + row <= 320], [true, true, true])
check('look: the sparkle\'s circle and shadow, white where the sparkle is yellow, under the sparkle\'s menu layer',
  [look.background, v1('key_buttons_css(KEY_BUTTONS_LOOK)').includes(`box-shadow: ${sparkle[7]};`), look.color, sparkle[8], look.layer < Number(layer[1])],
  [sparkle[6], true, '#fff', '#f5e389', true])
const css = v1('key_buttons_css({ ...KEY_BUTTONS_LOOK, size: 40, gap: 9, right: 50, bottom: 3, icon: 20, color: "#eee" })')
check('look: the stylesheet is the table\'s numbers: a changed size, gap, place, icon or colour is the rule\'s',
  ['right: 50px; bottom: 3px;', 'gap: 9px;', 'width: 40px; height: 40px;', 'color: #eee;', 'width: 20px; height: 20px;'].map(rule => css.includes(rule)), [true, true, true, true, true])

// ---- one press's events ------------------------------------------------------------------------
const spec = name => buttons.find(b => b.name == name)
const events = name => v1('key_buttons_events(__args)', spec(name))
const held = init => ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'].filter(flag => init[flag]).map(flag => flag.slice(0, -3)).join('+')
const told = sent => sent.map(({ type, init }) => `${type} ${init.code}${held(init) ? ' [' + held(init) + ']' : ''}`)
check('press: an arrow is its keydown and its keyup, no modifier held', told(events('down')), ['keydown ArrowDown', 'keyup ArrowDown'])
check('press: Shift+Enter is a keyboard\'s sequence: Shift down, Enter down and up under it, Shift up naming no modifier',
  told(events('create')), ['keydown ShiftLeft [shift]', 'keydown Enter [shift]', 'keyup Enter [shift]', 'keyup ShiftLeft'])
check('press: Ctrl+Alt+Up holds both through the arrow and releases them in reverse',
  told(events('top')), ['keydown ControlLeft [ctrl]', 'keydown AltLeft [ctrl+alt]', 'keydown ArrowUp [ctrl+alt]', 'keyup ArrowUp [ctrl+alt]', 'keyup AltLeft [ctrl]', 'keyup ControlLeft'])
check('press: a key\'s name is its code (the app reads the code, and a name as key keeps it from reading a typed character), a modifier\'s is its own',
  events('top').map(({ init }) => init.key), ['Control', 'Alt', 'ArrowUp', 'ArrowUp', 'Alt', 'Control'])
check('press: every event bubbles to the window and can be prevented', buttons.flatMap(b => v1('key_buttons_events(__args)', b)).every(({ init }) => init.bubbles && init.cancelable), true)

// ---- where a press goes ------------------------------------------------------------------------
const editor = new FakeNode('textarea')
const target = active => { page.activeElement = active; const to = v1('key_buttons_target(document)'); page.activeElement = null; return to === page.body ? 'body' : to.tag }
const own = Object.assign(new FakeNode('button'), { parent: Object.assign(new FakeNode('div'), { className: 'key-buttons' }) })
check('press: it goes where a key would: to the element that has the focus, else to the body (nothing focused, the body, the root, a button of the row)',
  [target(editor), target(null), target(page.body), target(page.documentElement), target(own)], ['textarea', 'body', 'body', 'body', 'body'])
page.activeElement = editor
const sent = v1('key_buttons_press(__args, document)', spec('create'))
page.activeElement = null
check('press: the events are real keyboard events, dispatched in order on the one target the press began on',
  [editor.got.every(e => e instanceof FakeKey), told(editor.got.map(e => ({ type: e.type, init: e }))), page.body.got.length], [true, told(sent), 0])
editor.got.length = 0

// ---- when the row shows ------------------------------------------------------------------------
// the sparkle's own test, extracted from vault.md, over the same viewports: one answer
const theirs = vm.createContext({})
vm.runInContext(vault.match(/\nconst VAULT_KEYBOARD_PX = [^\n]*\n/)[0] + vault.match(/\nconst vault_keyboard_open = win => \{[\s\S]*?\n\}\n/)[0], theirs)
const views = [null, { height: 800, scale: 1 }, { height: 650, scale: 1 }, { height: 649, scale: 1 }, { height: 400, scale: 1 }, { height: 400, scale: 2 }, { height: 400, scale: 1.01 }]
const answers = (context, name) => views.map(view => { context.__win = { innerHeight: 800, visualViewport: view }; return vm.runInContext(`${name}(__win)`, context) })
const ours = vm.createContext({ _this: { deephash: 0 } })
vm.runInContext(code, ours)
const keyboard = [false, false, false, true, true, false, true]
check('shown: a keyboard is the sparkle\'s own test: a visual viewport over 150 px shorter than the window, a pinch zoom is not',
  [answers(ours, 'key_buttons_keyboard_open'), answers(theirs, 'vault_keyboard_open')], [keyboard, keyboard])
const shown = (coarse, height) => v1('key_buttons_shown(__args)', { innerHeight: 800, visualViewport: { height, scale: 1 }, matchMedia: () => ({ matches: coarse }) })
check('shown: where the primary pointer is a finger and no keyboard is up; never on a desktop, and not without the media query',
  [shown(true, 800), shown(true, 400), shown(false, 800), shown(false, 400), v1('key_buttons_shown(__args)', { innerHeight: 800 })], [true, false, false, false, false])

// ---- the controller ----------------------------------------------------------------------------
v1('_on_welcome()')
const bar = parts('bar')[0]
check('controller: the page\'s welcome draws one style and one row of seven buttons under the body, put there hidden and left hidden on a desktop, and one task',
  [log, parts('style').length, parts('bar').length, bar.parent === page.body, bar.children.map(b => b.dataset.key), bar.hidden, tasks.key_buttons.delay, tasks.key_buttons.repeat],
  [['+style', '+bar hidden', 'task key_buttons'], 1, 1, true, buttons.map(b => b.name), true, 15000, 15000])
check('controller: a button is a finger\'s: named for a screen reader by what its key does, outside the Tab order, its icon a line drawing',
  [bar.children[2].attrs['aria-label'], bar.children[2].title, bar.children[2].tabIndex, bar.children[2].innerHTML],
  [spec('create').title, spec('create').title, -1, `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${spec('create').icon}"/></svg>`])
pointer.matches = true
pointer.fire('change')
check('controller: a finger as the primary pointer shows the row, at the change itself', bar.hidden, false)
viewport.height = 400
viewport.fire('resize')
const up = bar.hidden
viewport.height = 800
viewport.fire('resize')
check('controller: the on-screen keyboard hides the row and its going shows it again', [up, bar.hidden], [true, false])
const button = name => bar.children.find(b => b.dataset.key == name)
const click = button('down').fire('click')
check('controller: a tap sends the button\'s key to the body, and is nothing else to the page', [told(page.body.got.map(e => ({ type: e.type, init: e }))), click.prevented, click.stopped], [told(events('down')), 1, 1])
page.body.got.length = 0
page.activeElement = editor
button('create').fire('click')
page.activeElement = null
check('controller: with an editor focused the key is the editor\'s first, as from a keyboard', [editor.got.length, page.body.got.length], [4, 0])
const [mouse, touch, menu] = ['mousedown', 'touchstart', 'contextmenu'].map(type => button('up').fire(type))
check('controller: a press is not the app\'s and takes no focus: a mouse press is prevented and stopped, a touch only stopped (its tap is the click), a long press opens no menu',
  [[mouse.prevented, mouse.stopped], [touch.prevented, touch.stopped], [menu.prevented, menu.stopped], page.body.got.length], [[1, 1], [0, 1], [1, 1], 0])
log.length = 0
pointer.matches = false // unannounced: only a look would notice
v1('_on_item_change("another-id")')
const untouched = bar.hidden
v1('_on_item_change("keys-id")')
const looked = bar.hidden
pointer.matches = true
v1('key_buttons_reconcile()')
check('controller: another item\'s change is no look at all, and a later hook of the same code looks again and keeps the row it has',
  [log, parts('bar')[0] === bar, untouched, looked, bar.hidden], [[], true, false, true, false])
const v2 = evaluation(2)
v2('_on_item_change("keys-id")')
const bar2 = parts('bar')[0]
check('controller: an update of the item replaces the row: the earlier one goes before the new one is drawn, shown at once, and the earlier task is cancelled',
  [log, parts('bar').length, bar2 !== bar, bar2.hidden, parts('style').length], [['-bar', '-style', '+style', '+bar hidden', 'task key_buttons'], 1, true, false, 1])
bar.hidden = false // as if it were still shown: only its disposal keeps a replaced row quiet
button('down').fire('click')
check('controller: the replaced row sends nothing and listens to nothing: one listener each for the keyboard and the pointer, the new row\'s',
  [page.body.got.length, viewport.listeners.resize.length, pointer.listeners.change.length], [0, 1, 1])
viewport.height = 400
viewport.fire('resize')
bar2.children[5].fire('click')
const quiet = [bar2.hidden, page.body.got.length]
viewport.height = 800
viewport.fire('resize')
bar2.children[5].fire('click')
check('controller: a row the keyboard hid sends nothing, and sends again once it shows', [quiet, bar2.hidden, told(page.body.got.map(e => ({ type: e.type, init: e })))], [[true, 0], false, told(events('down'))])
page.body.got.length = 0
// a renamed copy keeps the code and its hooks: it is not the page's #key_buttons
log.length = 0
const copy = evaluation(2, 'copy-id', {})
copy('_on_welcome()')
check('controller: an item that only carries the code draws nothing and leaves the page\'s row alone', [log, parts('bar')[0] === bar2], [[], true])
items['#key_buttons'] = { id: 'other-id' }
v2('_on_item_change("keys-id")')
check('controller: the item renamed, its code kept, takes its row away', [log, parts('bar').length, parts('style').length, 'visualViewport' in win && viewport.listeners.resize.length, v2('typeof window._key_buttons')], [['-bar', '-style'], 0, 0, 0, 'undefined'])
items['#key_buttons'] = { id: 'keys-id' }
v2('_on_item_change("keys-id")')
check('controller: named #key_buttons again it draws again', parts('bar').length, 1)
log.length = 0
tasks.key_buttons._on_cancel() // the app, at the task's next run after the item's deletion
check('controller: the item\'s deletion removes the row, its style and its listeners at the task\'s cancel, and its task then ends',
  [log, parts('bar').length, viewport.listeners.resize.length, pointer.listeners.change.length, tasks.key_buttons.fn()], [['-bar', '-style'], 0, 0, 0, null])

// ---- the item ----------------------------------------------------------------------------------
const prose = item.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
check('item: its label, its code as an embed of key_buttons.js, and its two hooks\' tags; no other tag, so an install pulls in no other item',
  [prose.match(/(?:^|\s)#[\w/]+/g).map(tag => tag.trim()), /\n```js_removed:key_buttons\.js\n\/\/ key_buttons\.js\n```\n/.test(item), /<</.test(item)],
  [['#key_buttons', '#_welcome', '#_listen'], true, false])

if (failures) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('all ok')
