#!/usr/bin/env node
// plain-node table for the #key_buttons item (key_buttons.js): the buttons, the look and the
// parts' switches in one place, the keyboard events one press sends and where, which row shows
// (the sparkle's own keyboard test, held to the same answers as vault.md's), the place of the
// keyboard's row from a visual viewport, the Shift+Space that is a Tab and the devices that get
// it, the scroll that clears the caret's line, and the controller over a fake page.
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
  constructor(tag) { Object.assign(this, { tag, children: [], parent: null, listeners: {}, dataset: {}, attrs: {}, style: {}, hidden: false, got: [] }) }
  get tagName() { return this.tag.toUpperCase() }
  appendChild(child) { child.parent = this; this.children.push(child); if (child.dataset.keyButtons) log.push('+' + child.dataset.keyButtons + (child.hidden ? ' hidden' : '')); return child }
  remove() { if (!this.parent) return; this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; log.push('-' + this.dataset.keyButtons) }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn) }
  setAttribute(name, value) { this.attrs[name] = value }
  closest(selector) { for (let n = this; n; n = n.parent) if ((n.className ?? '').split(' ').includes(selector.slice(1))) return n; return null }
  dispatchEvent(event) { this.got.push(event) } // a key sent here
  fire(type, more = {}) {
    const event = { type, target: this, prevented: 0, stopped: 0, preventDefault() { this.prevented++ }, stopPropagation() { this.stopped++ }, ...more }
    for (const fn of [...(this.listeners[type] ?? [])]) fn(event)
    return event
  }
}
const scrolled = []
const page = Object.assign(new FakeNode('document'), { head: new FakeNode('head'), body: new FakeNode('body'), activeElement: null, createElement: tag => new FakeNode(tag) })
page.documentElement = new FakeNode('html')
page.body.scrollBy = (x, y) => scrolled.push([x, y])
const all = () => { const out = []; const walk = n => { out.push(n); n.children.forEach(walk) }; walk(page.head); walk(page.body); return out }
const parts = kind => all().filter(n => n.dataset.keyButtons == kind)
const viewport = Object.assign(new FakeNode('viewport'), { width: 390, height: 800, scale: 1, offsetLeft: 0, offsetTop: 0 })
const pointer = Object.assign(new FakeNode('media'), { matches: false })
const win = Object.assign(new FakeNode('window'), { innerHeight: 800, visualViewport: viewport, matchMedia: query => (query == '(pointer: coarse)' ? pointer : { matches: false }) })
const listening = () => [viewport.listeners.resize, viewport.listeners.scroll, pointer.listeners.change, win.listeners.keydown].map(list => (list ?? []).length)
class FakeKey { constructor(type, init) { Object.assign(this, { type, ...init }) } }
// an editor of the app: a textarea in its .editor box; and a textarea that is no editor
const editor = Object.assign(new FakeNode('textarea'), { parent: Object.assign(new FakeNode('div'), { className: 'editor' }) })
const other = new FakeNode('textarea')
const items = { '#key_buttons': { id: 'keys-id' } } // the label index: what #key_buttons names
const tasks = {}
const caret = { line: { top: 100, bottom: 120 } } // the caret's line, as the page would measure it
// one evaluation of the item's code, as a hook's: `_this` with the deephash of the text then
// (the app evaluates the item's code afresh at every hook and keeps the tasks per item);
// `source` is the item's code, or the code with a part switched off in its table
const evaluation = (deephash, id = 'keys-id', own = tasks, source = code) => {
  const _this = {
    id, deephash,
    dispatch_task(name, fn, delay, repeat) {
      own[name]?._on_cancel?.() // the app: a same-named dispatch cancels the earlier task
      log.push(`task ${name}`)
      return (own[name] = { fn, delay, repeat })
    },
  }
  const context = vm.createContext({ _this, _item: label => items[label] ?? null, document: page, window: win, KeyboardEvent: FakeKey })
  vm.runInContext(source, context)
  context.key_buttons_caret_line = () => caret.line // the measuring is the browser lane's
  return (src, args) => { context.__args = args; return vm.runInContext(src, context) }
}
const v1 = evaluation(1)

// ---- the tables --------------------------------------------------------------------------------
const buttons = v1('KEY_BUTTONS')
const above = v1('KEY_BUTTONS_KEYBOARD_ROW')
const look = v1('KEY_BUTTONS_LOOK')
const keys_of = table => table.map(b => [b.ctrl && 'Ctrl', b.alt && 'Alt', b.shift && 'Shift', b.key].filter(Boolean).join('+'))
check('buttons: seven, in the row\'s order: the two scrolls, the create, the four arrows', buttons.map(b => b.name), ['top', 'back', 'create', 'left', 'up', 'down', 'right'])
check('buttons: each sends its key: the arrows bare, Shift+Enter, Ctrl+Alt+Up and Ctrl+Alt+Down',
  keys_of(buttons), ['Ctrl+Alt+ArrowUp', 'Ctrl+Alt+ArrowDown', 'Shift+Enter', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'])
check('buttons: the row above the keyboard is three: the outdent, the indent and the done, as Shift+Tab, Tab and Shift+Enter',
  [above.map(b => b.name), keys_of(above)], [['outdent', 'indent', 'done'], ['Shift+Tab', 'Tab', 'Shift+Enter']])
check('buttons: each of both rows has an icon and says what its key does, naming the key', [...buttons, ...above].every(b => /^M[\d\s.,MmLlHhVvAa-]+$/.test(b.icon) && /^\S.* \((Ctrl\+Alt\+)?(Shift\+)?\w+\)$/.test(b.title)), true)
check('parts: the three later parts each have a switch of their own, on', v1('KEY_BUTTONS_PARTS'), { keyboard_row: true, shift_space_tab: true, caret_clear: true })
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
check('look: the stylesheet is the table\'s numbers: a changed size, gap, place, icon or colour is the rule\'s; the keyboard\'s row takes its place from the code',
  ['right: 50px; bottom: 3px;', 'gap: 9px;', 'width: 40px; height: 40px;', 'color: #eee;', 'width: 20px; height: 20px;', '.key-buttons.keyboard { right: auto; bottom: auto }'].map(rule => css.includes(rule)), [true, true, true, true, true, true])

// ---- the keyboard's row: its place from a visual viewport -------------------------------------
const place = view => v1('key_buttons_place(__args, 3, KEY_BUTTONS_LOOK)', view)
check('place: above the bottom of what the keyboard leaves in view and in from its right edge: three buttons are 108 px wide',
  [place({ offsetLeft: 0, offsetTop: 0, width: 390, height: 508 }), 3 * look.size + 2 * look.gap, look.edge, look.above], [{ left: 272, top: 470 }, 108, 10, 6])
check('place: a view panned down or across the window takes the row with it, and a view that names no offset is at the window\'s corner',
  [place({ offsetLeft: 20, offsetTop: 336, width: 390, height: 508 }), place({ width: 390, height: 508 }), place({ offsetLeft: 0.4, offsetTop: 0.4, width: 390.3, height: 508.2 })],
  [{ left: 292, top: 806 }, { left: 272, top: 470 }, { left: 273, top: 471 }])

// ---- one press's events ------------------------------------------------------------------------
const spec = name => [...buttons, ...above].find(b => b.name == name)
const events = name => v1('key_buttons_events(__args)', spec(name))
const held = init => ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'].filter(flag => init[flag]).map(flag => flag.slice(0, -3)).join('+')
const told = sent => sent.map(({ type, init }) => `${type} ${init.code}${held(init) ? ' [' + held(init) + ']' : ''}`)
const got = node => told(node.got.map(e => ({ type: e.type, init: e })))
check('press: an arrow is its keydown and its keyup, no modifier held, and so is a Tab', [told(events('down')), told(events('indent'))], [['keydown ArrowDown', 'keyup ArrowDown'], ['keydown Tab', 'keyup Tab']])
check('press: Shift+Enter is a keyboard\'s sequence: Shift down, Enter down and up under it, Shift up naming no modifier; Shift+Tab likewise',
  [told(events('create')), told(events('done')), told(events('outdent'))],
  [['keydown ShiftLeft [shift]', 'keydown Enter [shift]', 'keyup Enter [shift]', 'keyup ShiftLeft'], ['keydown ShiftLeft [shift]', 'keydown Enter [shift]', 'keyup Enter [shift]', 'keyup ShiftLeft'], ['keydown ShiftLeft [shift]', 'keydown Tab [shift]', 'keyup Tab [shift]', 'keyup ShiftLeft']])
check('press: Ctrl+Alt+Up holds both through the arrow and releases them in reverse',
  told(events('top')), ['keydown ControlLeft [ctrl]', 'keydown AltLeft [ctrl+alt]', 'keydown ArrowUp [ctrl+alt]', 'keyup ArrowUp [ctrl+alt]', 'keyup AltLeft [ctrl]', 'keyup ControlLeft'])
check('press: a key\'s name is its code (the app reads the code, and a name as key keeps it from reading a typed character), a modifier\'s is its own',
  events('top').map(({ init }) => init.key), ['Control', 'Alt', 'ArrowUp', 'ArrowUp', 'Alt', 'Control'])
check('press: every event bubbles to the window and can be prevented', [...buttons, ...above].flatMap(b => v1('key_buttons_events(__args)', b)).every(({ init }) => init.bubbles && init.cancelable), true)

// ---- where a press goes ------------------------------------------------------------------------
const target = active => { page.activeElement = active; const to = v1('key_buttons_target(document)'); page.activeElement = null; return to === page.body ? 'body' : to.tag }
const own = Object.assign(new FakeNode('button'), { parent: Object.assign(new FakeNode('div'), { className: 'key-buttons keyboard' }) })
check('press: it goes where a key would: to the element that has the focus, else to the body (nothing focused, the body, the root, a button of a row)',
  [target(editor), target(null), target(page.body), target(page.documentElement), target(own)], ['textarea', 'body', 'body', 'body', 'body'])
page.activeElement = editor
const sent = v1('key_buttons_press(__args, document)', spec('create'))
page.activeElement = null
check('press: the events are real keyboard events, dispatched in order on the one target the press began on',
  [editor.got.every(e => e instanceof FakeKey), got(editor), page.body.got.length], [true, told(sent), 0])
editor.got.length = 0

// ---- which row shows ---------------------------------------------------------------------------
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
const device = (coarse, height) => ({ innerHeight: 800, visualViewport: { height, scale: 1 }, matchMedia: () => ({ matches: coarse }) })
const shown = (coarse, height, switches) => v1('key_buttons_row(__args.win, __args.parts ?? KEY_BUTTONS_PARTS)', { win: device(coarse, height), parts: switches })
check('shown: where the primary pointer is a finger, the main row with no keyboard up and the keyboard\'s row with one; neither on a desktop, nor without the media query',
  [shown(true, 800), shown(true, 400), shown(false, 800), shown(false, 400), v1('key_buttons_row(__args)', { innerHeight: 800 })], ['main', 'keyboard', null, null, null])
check('shown: with the keyboard\'s row switched off nothing shows while the keyboard is up, and the main row as before', [shown(true, 400, { keyboard_row: false }), shown(true, 800, { keyboard_row: false })], [null, 'main'])

// ---- Shift+Space -------------------------------------------------------------------------------
const key = (more = {}) => ({ code: 'Space', key: ' ', shiftKey: true, target: editor, ...more })
const taken = (e, coarse = true) => v1('key_buttons_shift_space(__args.e, __args.win)', { e, win: device(coarse, 800) })
check('shift+space: it is a Tab on a touch device, in an editor of the app, by the code or, from a keyboard that gives none, by the key',
  [taken(key()), taken(key({ code: 'Unidentified' })), taken(key({ code: '' })), taken(key({ getModifierState: () => false }))], [true, true, true, true])
check('shift+space: not a plain space, another key, a space with one more modifier, one inside a composition or under a caps lock the event names, nor one outside an editor',
  [{ shiftKey: false }, { code: 'KeyA', key: 'A' }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { getModifierState: name => name == 'CapsLock' }, { target: other }, { target: page.body }, { target: null }].map(more => taken(key(more))),
  [false, false, false, false, false, false, false, false, false, false])
check('shift+space: never on a desktop, whatever the key', [taken(key(), false), v1('KEY_BUTTONS_SHIFT_SPACE')], [false, { key: 'Tab' }])

// ---- the caret's line and the keyboard ---------------------------------------------------------
const clear = (line, view, reserve = 44, margin = 8) => v1('key_buttons_clear(__args.line, __args.view, __args.reserve, __args.margin)', { line, view, reserve, margin })
const kept = { offsetTop: 0, height: 508 } // what a keyboard leaves of an 844 px window
check('clear: a line under the keyboard or its row scrolls up by what brings its bottom clear of them, a line in view moves nothing, a line above the view scrolls down into it',
  [clear({ top: 700, bottom: 720 }, kept), clear({ top: 440, bottom: 460.2 }, kept), clear({ top: 436, bottom: 456 }, kept), clear({ top: 8, bottom: 28 }, kept), clear({ top: -40.5, bottom: -20.5 }, kept)],
  [264, 5, 0, 0, -49])
check('clear: the view counts where it is in the window (a view panned down the page), and with no row the keyboard alone',
  [clear({ top: 700, bottom: 720 }, { offsetTop: 336, height: 508 }), clear({ top: 300, bottom: 320 }, { offsetTop: 336, height: 508 }), clear({ top: 700, bottom: 720 }, kept, 0), clear({ top: 700, bottom: 720 }, { height: 508 }, 0, 0)],
  [0, -44, 220, 212])

// ---- the controller ----------------------------------------------------------------------------
v1('_on_welcome()')
const [bar, keys] = [parts('bar')[0], parts('keyboard')[0]]
check('controller: the page\'s welcome draws one style and the two rows under the body, each put there hidden and left hidden on a desktop, and one task',
  [log, parts('style').length, bar.parent === page.body, keys.parent === page.body, bar.children.map(b => b.dataset.key), keys.children.map(b => b.dataset.key), bar.hidden, keys.hidden, tasks.key_buttons.delay, tasks.key_buttons.repeat],
  [['+style', '+bar hidden', '+keyboard hidden', 'task key_buttons'], 1, true, true, buttons.map(b => b.name), above.map(b => b.name), true, true, 15000, 15000])
check('controller: a button is a finger\'s: named for a screen reader by what its key does, outside the Tab order, its icon a line drawing',
  [bar.children[2].attrs['aria-label'], bar.children[2].title, bar.children[2].tabIndex, bar.children[2].innerHTML, keys.children[1].title, keys.className],
  [spec('create').title, spec('create').title, -1, `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${spec('create').icon}"/></svg>`, spec('indent').title, 'key-buttons keyboard'])
pointer.matches = true
pointer.fire('change')
check('controller: a finger as the primary pointer shows the main row, at the change itself', [bar.hidden, keys.hidden], [false, true])
viewport.height = 464
viewport.fire('resize')
const up = [bar.hidden, keys.hidden, keys.style.left, keys.style.top]
viewport.offsetTop = 336
viewport.fire('scroll')
const panned = keys.style.top
Object.assign(viewport, { offsetTop: 0, height: 800 })
viewport.fire('resize')
check('controller: the on-screen keyboard hides the main row and shows its own, placed from what is left in view; a view that is panned takes the row along; the keyboard\'s going puts the main row back',
  [up, panned, bar.hidden, keys.hidden], [[true, false, '272px', '426px'], '762px', false, true])
const button = name => [...bar.children, ...keys.children].find(b => b.dataset.key == name)
const click = button('down').fire('click')
check('controller: a tap sends the button\'s key to the body, and is nothing else to the page', [got(page.body), click.prevented, click.stopped], [told(events('down')), 1, 1])
page.body.got.length = 0
page.activeElement = editor
button('create').fire('click')
check('controller: with an editor focused the key is the editor\'s first, as from a keyboard', [editor.got.length, page.body.got.length], [4, 0])
editor.got.length = 0
viewport.height = 464
viewport.fire('resize')
button('indent').fire('click')
const indented = got(editor)
editor.got.length = 0
button('outdent').fire('click')
button('down').fire('click') // the main row is hidden under the keyboard: nothing
check('controller: above the keyboard a tap sends its key to the editor that has the focus, and the hidden main row sends nothing',
  [indented, got(editor), page.body.got.length, page.activeElement === editor], [told(events('indent')), told(events('outdent')), 0, true])
editor.got.length = 0
const pressed = name => ['mousedown', 'touchstart', 'contextmenu'].map(type => button(name).fire(type)).map(e => [e.prevented, e.stopped])
check('controller: a press is not the app\'s and takes no focus, in either row: a mouse press is prevented and stopped, a touch only stopped (its tap is the click), a long press opens no menu',
  [pressed('up'), pressed('indent'), editor.got.length], [[[1, 1], [0, 1], [1, 1]], [[1, 1], [0, 1], [1, 1]], 0])

// Shift+Space at the window, before the editor
const space = (more = {}) => win.fire('keydown', key(more))
const tab = space()
const tabbed = got(editor)
editor.got.length = 0
const left = [space({ shiftKey: false }), space({ target: other })]
pointer.matches = false
left.push(space())
pointer.matches = true
check('controller: Shift+Space in an editor types no space and never reaches the editor, which gets a Tab instead',
  [tab.prevented, tab.stopped, tabbed], [1, 1, ['keydown Tab', 'keyup Tab']])
check('controller: a plain space, a space outside an editor and a desktop\'s Shift+Space are left as typed', [left.map(e => [e.prevented, e.stopped]), editor.got.length], [[[0, 0], [0, 0], [0, 0]], 0])

// the caret's line when the keyboard comes up
Object.assign(viewport, { height: 800 })
viewport.fire('resize')
caret.line = { top: 700, bottom: 720 }
viewport.height = 464
viewport.fire('resize')
check('controller: a keyboard that comes up over the caret\'s line scrolls the body by what clears the line of the keyboard and of the row above it', scrolled, [[0, 308]])
scrolled.length = 0
viewport.height = 470
viewport.fire('resize') // a view that grows
caret.line = { top: 300, bottom: 320 }
viewport.height = 430
viewport.fire('resize') // a line that is clear
caret.line = { top: 700, bottom: 720 }
page.activeElement = other
viewport.height = 420
viewport.fire('resize') // no editor of the app has the focus
page.activeElement = editor
pointer.matches = false
viewport.height = 400
viewport.fire('resize') // a desktop
pointer.matches = true
caret.line = null
viewport.height = 380
viewport.fire('resize') // nothing to measure in
check('controller: nothing moves when the view grows, the line is clear, no editor has the focus, on a desktop, or with nothing to measure', scrolled, [])
caret.line = { top: 100, bottom: 120 }
page.activeElement = null
viewport.height = 800
viewport.fire('resize')

log.length = 0
pointer.matches = false // unannounced: only a look would notice
v1('_on_item_change("another-id")')
const untouched = bar.hidden
v1('_on_item_change("keys-id")')
const looked = bar.hidden
pointer.matches = true
v1('key_buttons_reconcile()')
check('controller: another item\'s change is no look at all, and a later hook of the same code looks again and keeps the rows it has',
  [log, parts('bar')[0] === bar, untouched, looked, bar.hidden], [[], true, false, true, false])
const v2 = evaluation(2)
v2('_on_item_change("keys-id")')
const [bar2, keys2] = [parts('bar')[0], parts('keyboard')[0]]
check('controller: an update of the item replaces the rows: the earlier ones go before the new ones are drawn, shown at once, and the earlier task is cancelled',
  [log, parts('bar').length, parts('keyboard').length, bar2 !== bar, bar2.hidden, parts('style').length], [['-bar', '-keyboard', '-style', '+style', '+bar hidden', '+keyboard hidden', 'task key_buttons'], 1, 1, true, false, 1])
bar.hidden = false // as if it were still shown: only its disposal keeps a replaced row quiet
button('down').fire('click')
check('controller: the replaced rows send nothing and listen to nothing: one listener each for the view\'s size and place, the pointer and the keys, the new controller\'s',
  [page.body.got.length, listening()], [0, [1, 1, 1, 1]])
viewport.height = 400
viewport.fire('resize')
bar2.children[5].fire('click')
const quiet = [bar2.hidden, keys2.hidden, page.body.got.length]
viewport.height = 800
viewport.fire('resize')
bar2.children[5].fire('click')
check('controller: a row the keyboard hid sends nothing, and sends again once it shows', [quiet, bar2.hidden, got(page.body)], [[true, false, 0], false, told(events('down'))])
page.body.got.length = 0
// a renamed copy keeps the code and its hooks: it is not the page's #key_buttons
log.length = 0
const copy = evaluation(2, 'copy-id', {})
copy('_on_welcome()')
check('controller: an item that only carries the code draws nothing and leaves the page\'s rows alone', [log, parts('bar')[0] === bar2], [[], true])
items['#key_buttons'] = { id: 'other-id' }
v2('_on_item_change("keys-id")')
check('controller: the item renamed, its code kept, takes its rows away', [log, parts('bar').length, parts('keyboard').length, parts('style').length, listening(), v2('typeof window._key_buttons')], [['-bar', '-keyboard', '-style'], 0, 0, 0, [0, 0, 0, 0], 'undefined'])
items['#key_buttons'] = { id: 'keys-id' }
v2('_on_item_change("keys-id")')
check('controller: named #key_buttons again it draws again', [parts('bar').length, parts('keyboard').length], [1, 1])
log.length = 0
tasks.key_buttons._on_cancel() // the app, at the task's next run after the item's deletion
check('controller: the item\'s deletion removes the rows, their style and the listeners at the task\'s cancel, and its task then ends',
  [log, parts('bar').length, listening(), tasks.key_buttons.fn()], [['-bar', '-keyboard', '-style'], 0, [0, 0, 0, 0], null])

// ---- a part switched off in the table: the code with that one switch off, over the same page ----
const without = part => {
  if (!code.includes(`  ${part}: true,`)) throw new Error(`no switch ${part}`)
  const run = evaluation(9, 'keys-id', {}, code.replace(`  ${part}: true,`, `  ${part}: false,`))
  run('_on_welcome()')
  return run
}
const scene = () => { // a touch device, an editor focused with its caret low, and the keyboard coming up
  Object.assign(viewport, { height: 800 })
  viewport.fire('resize')
  Object.assign(page, { activeElement: editor })
  caret.line = { top: 700, bottom: 720 }
  scrolled.length = editor.got.length = 0
  viewport.height = 464
  viewport.fire('resize')
  const typed = win.fire('keydown', key())
  return { rows: [parts('bar')[0].hidden, parts('keyboard')[0].hidden, parts('keyboard')[0].children.length], typed: [typed.prevented, got(editor)], scrolled: [...scrolled], listening: listening() }
}
const whole = (() => { const run = evaluation(9, 'keys-id', {}); run('_on_welcome()'); const seen = scene(); run('window._key_buttons.dispose()'); return seen })()
check('parts: with every part on, the keyboard brings its row, Shift+Space is a Tab and the caret\'s line is cleared',
  whole, { rows: [true, false, 3], typed: [1, ['keydown Tab', 'keyup Tab']], scrolled: [[0, 308]], listening: [1, 1, 1, 1] })
const off = part => { const run = without(part); const seen = scene(); run('window._key_buttons.dispose()'); return seen }
check('parts: without the keyboard\'s row nothing shows above the keyboard (the main row hides as before), and the caret\'s line is cleared of the keyboard alone',
  off('keyboard_row'), { ...whole, rows: [true, true, 0], scrolled: [[0, 264]] })
check('parts: without Shift+Space the key is a space as typed, and nothing listens for it', off('shift_space_tab'), { ...whole, typed: [0, []], listening: [1, 1, 1, 0] })
check('parts: without the caret\'s clearing a keyboard that comes up moves nothing', off('caret_clear'), { ...whole, scrolled: [] })
Object.assign(page, { activeElement: null })

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
