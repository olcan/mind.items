#!/usr/bin/env node
// plain-node table for the #key_buttons item (key_buttons.js): the buttons, the look and the
// parts' switches in one place, the keyboard events one press sends and where, the keyboard read
// by two signals and decided from both (the window's is the sparkle's own test, held to the same
// answers as vault.md's), which row shows, the place of the keyboard's row from a visual viewport,
// the Shift+Space that is a Tab and the devices that get it, the scroll that clears the caret's
// line and its once for each opening of the keyboard, and the controller over a fake page.
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
// the listeners held: the view's size and place, the pointer, the keys, the focus that comes and the focus that leaves
const listening = () => [viewport.listeners.resize, viewport.listeners.scroll, pointer.listeners.change, win.listeners.keydown, page.listeners.focusin, page.listeners.focusout].map(list => (list ?? []).length)
class FakeKey { constructor(type, init) { Object.assign(this, { type, ...init }) } }
// two editors of the app (a textarea in its .editor box), and a textarea that is no editor
const an_editor = () => Object.assign(new FakeNode('textarea'), { parent: Object.assign(new FakeNode('div'), { className: 'editor' }) })
const [editor, box] = [an_editor(), an_editor()]
const other = new FakeNode('textarea')
const items = { '#key_buttons': { id: 'keys-id' } } // the label index: what #key_buttons names
const tasks = {}
const caret = { line: { top: 100, bottom: 120 } } // the caret's line, as the page would measure it
const low = { top: 700, bottom: 720 }
const clock = { now: 1000000 }
// one evaluation of the item's code, as a hook's: `_this` with the deephash of the text then
// (the app evaluates the item's code afresh at every hook and keeps the tasks per item);
// `source` is the item's code, or the code with a part's switch turned in its table
const evaluation = (deephash, id = 'keys-id', own = tasks, source = code) => {
  const _this = {
    id, deephash,
    dispatch_task(name, fn, delay, repeat) {
      own[name]?._on_cancel?.() // the app: a same-named dispatch cancels the earlier task
      log.push(`task ${name}`)
      return (own[name] = { fn, delay, repeat })
    },
  }
  const context = vm.createContext({ _this, _item: label => items[label] ?? null, document: page, window: win, KeyboardEvent: FakeKey, Date: { now: () => clock.now } })
  vm.runInContext(source, context)
  context.key_buttons_caret_line = () => caret.line // the measuring is the browser lane's
  return (src, args) => { context.__args = args; return vm.runInContext(src, context) }
}
const turned = (part, on) => {
  if (!code.includes(`  ${part}: ${!on},`)) throw new Error(`no switch ${part} to turn`)
  return code.replace(`  ${part}: ${!on},`, `  ${part}: ${on},`)
}
// the focus as the page moves it: to an element at once, away from one with the item's look a moment later
const focus = element => { page.activeElement = element; page.fire('focusin') }
const blur = (own = tasks) => { page.activeElement = null; page.fire('focusout'); own.key_buttons_focus.fn() }
const calm = () => { Object.assign(win, { innerHeight: 800 }); Object.assign(viewport, { height: 800, offsetTop: 0 }); page.activeElement = null; caret.line = { top: 100, bottom: 120 }; scrolled.length = editor.got.length = page.body.got.length = 0 }
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
check('parts: the three later parts each have a switch of their own: the row above the keyboard and Shift+Space on, the caret\'s scroll off',
  [v1('KEY_BUTTONS_PARTS'), v1('KEY_BUTTONS_CARET')], [{ keyboard_row: true, shift_space_tab: true, caret_clear: false }, { margin: 8, settle: 150 }])
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
const own_button = Object.assign(new FakeNode('button'), { parent: Object.assign(new FakeNode('div'), { className: 'key-buttons keyboard' }) })
check('press: it goes where a key would: to the element that has the focus, else to the body (nothing focused, the body, the root, a button of a row)',
  [target(editor), target(null), target(page.body), target(page.documentElement), target(own_button)], ['textarea', 'body', 'body', 'body', 'body'])
page.activeElement = editor
const sent = v1('key_buttons_press(__args, document)', spec('create'))
page.activeElement = null
check('press: the events are real keyboard events, dispatched in order on the one target the press began on',
  [editor.got.every(e => e instanceof FakeKey), got(editor), page.body.got.length], [true, told(sent), 0])
editor.got.length = 0

// ---- the keyboard: two signals and the decision ------------------------------------------------
// the window's signal is the sparkle's own test, extracted from vault.md, over the same viewports: one answer
const theirs = vm.createContext({})
vm.runInContext(vault.match(/\nconst VAULT_KEYBOARD_PX = [^\n]*\n/)[0] + vault.match(/\nconst vault_keyboard_open = win => \{[\s\S]*?\n\}\n/)[0], theirs)
const views = [null, { height: 800, scale: 1 }, { height: 650, scale: 1 }, { height: 649, scale: 1 }, { height: 400, scale: 1 }, { height: 400, scale: 2 }, { height: 400, scale: 1.01 }]
const answers = (context, name) => views.map(view => { context.__win = { innerHeight: 800, visualViewport: view }; return vm.runInContext(`${name}(__win)`, context) })
const ours = vm.createContext({ _this: { deephash: 0 } })
vm.runInContext(code, ours)
check('keyboard: the window\'s signal is the sparkle\'s own test: a visual viewport over 150 px shorter than the window, a pinch zoom is not',
  [answers(ours, 'key_buttons_keyboard_open'), answers(theirs, 'vault_keyboard_open')], [[false, false, false, true, true, false, true], [false, false, false, true, true, false, true]])
const a_window = (inner, height, more = {}) => ({ innerHeight: inner, visualViewport: { width: 390, height, scale: 1, ...more } })
const reads = (w, active, tallest = {}) => v1('key_buttons_keyboard(__args.w, __args.doc, __args.tallest)', { w, doc: { activeElement: active }, tallest })
const flags = read => [read.up, read.by_window, read.by_view, read.focus]
const seen = {} // the tallest view seen at each width, as a controller keeps it
check('keyboard: with an editor focused and the view at its tallest, none; the view 336 px shorter than the window and than the tallest seen, up by both signals',
  [flags(reads(a_window(844, 844), editor, seen)), flags(reads(a_window(844, 508), editor, seen)), seen], [[false, false, false, true], [true, true, true, true], { 390: 844 }])
check('keyboard: where the window\'s own height follows the keyboard the window reads nothing, and the view against the tallest seen decides: up',
  reads(a_window(508, 508), editor, seen), { up: true, focus: true, by_window: false, by_view: true, window: 508, view: 508, width: 390, tallest: 844, scale: 1 })
check('keyboard: where no taller view has been seen at this width (a page drawn with the keyboard up) the view reads nothing, and the window decides: up',
  flags(reads(a_window(844, 508), editor, {})), [true, true, false, true])
check('keyboard: with no element focused that takes text there is no keyboard, whatever the heights say: nothing focused, the body, a button, a checkbox',
  [null, page.body, new FakeNode('button'), Object.assign(new FakeNode('input'), { type: 'checkbox' })].map(active => flags(reads(a_window(844, 508), active, seen))),
  [[false, true, true, false], [false, true, true, false], [false, true, true, false], [false, true, true, false]])
check('keyboard: an element takes text when it is a textarea, a text input of any kind, an editable element or a frame',
  [editor, other, Object.assign(new FakeNode('input'), { type: 'text' }), new FakeNode('input'), Object.assign(new FakeNode('input'), { type: 'search' }), Object.assign(new FakeNode('div'), { isContentEditable: true }), new FakeNode('iframe'), new FakeNode('div'), Object.assign(new FakeNode('input'), { type: 'RANGE' })].map(element => v1('key_buttons_editable(__args)', element)),
  [true, true, true, true, true, true, true, false, false])
check('keyboard: a pinch zoom is taken out of the view: zoomed with no keyboard none, zoomed with one up by the view alone (the window\'s test refuses a zoom)',
  [flags(reads({ innerHeight: 422, visualViewport: { width: 195, height: 422, scale: 2 } }, editor, seen)), flags(reads({ innerHeight: 422, visualViewport: { width: 195, height: 254, scale: 2 } }, editor, seen))],
  [[false, false, false, true], [true, false, true, true]])
const turn = more => ({ innerHeight: 390, visualViewport: { width: 844, height: 390, scale: 1, ...more } })
check('keyboard: a turned phone is another width with a tallest view of its own: none at first sight, up with the view much shorter, and the upright record is kept',
  [flags(reads(turn(), editor, seen)), flags(reads(turn({ height: 190 }), editor, seen)), seen], [[false, false, false, true], [true, true, true, true], { 390: 844, 844: 390 }])
check('keyboard: a bar of under 150 px (a hardware keyboard\'s) is no keyboard, and neither is a window without a visual viewport',
  [flags(reads(a_window(844, 784), editor, seen)), reads({ innerHeight: 844 }, editor, seen)], [[false, false, false, true], { up: false, focus: true, by_window: false, by_view: false, window: 844, view: null, width: null, tallest: null, scale: null }])
const fingers = coarse => ({ matchMedia: () => ({ matches: coarse }) })
const shown = (coarse, up, switches) => v1('key_buttons_row(__args.win, __args.keyboard, __args.parts ?? KEY_BUTTONS_PARTS)', { win: fingers(coarse), keyboard: { up }, parts: switches })
check('shown: where the primary pointer is a finger, the main row with no keyboard up and the keyboard\'s row with one; neither on a desktop, nor without the media query',
  [shown(true, false), shown(true, true), shown(false, false), shown(false, true), v1('key_buttons_row({}, { up: true })')], ['main', 'keyboard', null, null, null])
check('shown: with the keyboard\'s row switched off nothing shows while the keyboard is up, and the main row as before', [shown(true, true, { keyboard_row: false }), shown(true, false, { keyboard_row: false })], [null, 'main'])
check('says: the row, the decision, each signal with its numbers, the focus and the zoom; then the row\'s last changes with what the signals read at each',
  v1('key_buttons_says(__args.read, "keyboard", __args.changes, 60000)', { read: { up: true, focus: true, by_window: false, by_view: true, window: 508, view: 508, width: 390, tallest: 844, scale: 1.004 }, changes: [{ at: 57400, shown: 'keyboard', window: false, view: true, focus: true }, { at: 12000, shown: null, window: true, view: false, focus: false }] }),
  ['keys: row keyboard · keyboard up · by window no (window 508 − view 508 = 0) · by view yes (tallest 844 − view 508 = 336 at width 390) · focus yes · scale 1',
    'keys before: 3 s ago keyboard (window no, view yes, focus yes) · 48 s ago none (window yes, view no, focus no)'])
check('says: with no change yet it says so', v1('key_buttons_says(__args, null, [], 0)', { up: false, focus: false, by_window: false, by_view: false, window: 844, view: 844, width: 390, tallest: 844, scale: 1 })[1], 'keys before: nothing yet')

// ---- Shift+Space -------------------------------------------------------------------------------
const key = (more = {}) => ({ code: 'Space', key: ' ', shiftKey: true, target: editor, ...more })
const taken = (e, coarse = true) => v1('key_buttons_shift_space(__args.e, __args.win)', { e, win: fingers(coarse) })
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
  [clear(low, kept), clear({ top: 440, bottom: 460.2 }, kept), clear({ top: 436, bottom: 456 }, kept), clear({ top: 8, bottom: 28 }, kept), clear({ top: -40.5, bottom: -20.5 }, kept)],
  [264, 5, 0, 0, -49])
check('clear: the view counts where it is in the window (a view panned down the page), and with no row the keyboard alone',
  [clear(low, { offsetTop: 336, height: 508 }), clear({ top: 300, bottom: 320 }, { offsetTop: 336, height: 508 }), clear(low, kept, 0), clear(low, { height: 508 }, 0, 0)],
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
clock.now += 2000
pointer.fire('change')
check('controller: a finger as the primary pointer shows the main row, at the change itself', [bar.hidden, keys.hidden], [false, true])
focus(editor)
const focused = [bar.hidden, keys.hidden]
clock.now += 3000
viewport.height = 464
viewport.fire('resize')
const up = [bar.hidden, keys.hidden, keys.style.left, keys.style.top]
viewport.offsetTop = 336
viewport.fire('scroll')
check('controller: an editor that takes the focus changes nothing by itself; the keyboard under it hides the main row and shows its own, placed from what is left in view; a view that is panned takes the row along',
  [focused, up, keys.style.top], [[false, true], [true, false, '272px', '426px'], '762px'])
clock.now += 4000
check('controller: it says what it reads: the row, the two signals, and the row\'s changes since it was drawn',
  v1('window._key_buttons.says()'),
  ['keys: row keyboard · keyboard up · by window yes (window 800 − view 464 = 336) · by view yes (tallest 800 − view 464 = 336 at width 390) · focus yes · scale 1',
    'keys before: 4 s ago keyboard (window yes, view yes, focus yes) · 7 s ago main (window no, view no, focus no) · 9 s ago none (window no, view no, focus no)'])
page.activeElement = null
page.fire('focusout')
const at_once = [bar.hidden, keys.hidden, tasks.key_buttons_focus.delay, tasks.key_buttons_focus.repeat]
tasks.key_buttons_focus.fn()
check('controller: a focus that leaves is looked at a moment later, not at once: then no keyboard is read, though the view is still short, and the main row is back',
  [at_once, bar.hidden, keys.hidden], [[true, false, 150, undefined], false, true])
focus(editor)
page.activeElement = null
page.fire('focusout')
const between = [bar.hidden, keys.hidden]
focus(box)
tasks.key_buttons_focus.fn()
check('controller: a focus that moves from one editor to another, the keyboard staying up, flips no row', [between, bar.hidden, keys.hidden], [[true, false], true, false])
Object.assign(viewport, { offsetTop: 0, height: 800 })
viewport.fire('resize')
const gone = [bar.hidden, keys.hidden, page.activeElement === box]
Object.assign(win, { innerHeight: 464 })
viewport.height = 464
viewport.fire('resize')
const followed = [bar.hidden, keys.hidden, v1('window._key_buttons.says()')[0]]
Object.assign(win, { innerHeight: 800 })
viewport.height = 800
viewport.fire('resize')
check('controller: a keyboard that goes while the editor keeps the focus puts the main row back; and where the window\'s own height follows the keyboard, the view alone still brings the keyboard\'s row',
  [gone, followed, bar.hidden], [[false, true, true], [true, false, 'keys: row keyboard · keyboard up · by window no (window 464 − view 464 = 0) · by view yes (tallest 800 − view 464 = 336 at width 390) · focus yes · scale 1'], false])
blur()
const button = name => [...bar.children, ...keys.children].find(b => b.dataset.key == name)
const click = button('down').fire('click')
check('controller: a tap sends the button\'s key to the body, and is nothing else to the page', [got(page.body), click.prevented, click.stopped], [told(events('down')), 1, 1])
page.body.got.length = 0
focus(editor)
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

// the caret's line: the part is off
caret.line = low
viewport.height = 800
viewport.fire('resize')
viewport.height = 464
viewport.fire('resize')
check('controller: with the caret\'s part off, a keyboard that comes up over the caret\'s line moves nothing and asks for no look', [scrolled, 'key_buttons_caret' in tasks], [[], false])
check('controller: of the row\'s changes the last five are kept, the latest first', [v1('window._key_buttons.changes.length'), v1('window._key_buttons.changes[0].shown')], [5, 'keyboard'])
viewport.height = 800
viewport.fire('resize')
blur()
caret.line = { top: 100, bottom: 120 }

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
check('controller: the replaced rows send nothing and listen to nothing: one listener each for the view\'s size and place, the pointer, the keys and the focus, the new controller\'s',
  [page.body.got.length, listening()], [0, [1, 1, 1, 1, 1, 1]])
focus(editor)
viewport.height = 400
viewport.fire('resize')
bar2.children[5].fire('click')
const quiet = [bar2.hidden, keys2.hidden, editor.got.length, page.body.got.length]
viewport.height = 800
viewport.fire('resize')
bar2.children[5].fire('click')
check('controller: a row the keyboard hid sends nothing, and sends again once it shows', [quiet, bar2.hidden, got(editor)], [[true, false, 0, 0], false, told(events('down'))])
editor.got.length = 0
blur()
// a renamed copy keeps the code and its hooks: it is not the page's #key_buttons
log.length = 0
const copy = evaluation(2, 'copy-id', {})
copy('_on_welcome()')
check('controller: an item that only carries the code draws nothing and leaves the page\'s rows alone', [log, parts('bar')[0] === bar2], [[], true])
items['#key_buttons'] = { id: 'other-id' }
v2('_on_item_change("keys-id")')
check('controller: the item renamed, its code kept, takes its rows away', [log, parts('bar').length, parts('keyboard').length, parts('style').length, listening(), v2('typeof window._key_buttons')], [['-bar', '-keyboard', '-style'], 0, 0, 0, [0, 0, 0, 0, 0, 0], 'undefined'])
items['#key_buttons'] = { id: 'keys-id' }
v2('_on_item_change("keys-id")')
check('controller: named #key_buttons again it draws again', [parts('bar').length, parts('keyboard').length], [1, 1])
log.length = 0
tasks.key_buttons._on_cancel() // the app, at the task's next run after the item's deletion
check('controller: the item\'s deletion removes the rows, their style and the listeners at the task\'s cancel, and its task then ends',
  [log, parts('bar').length, listening(), tasks.key_buttons.fn()], [['-bar', '-keyboard', '-style'], 0, [0, 0, 0, 0, 0, 0], null])

// ---- the caret's scroll, switched on in the table: once for each opening of the keyboard ---------
{
  calm()
  log.length = 0
  const own = {}
  const run = evaluation(9, 'keys-id', own, turned('caret_clear', true))
  run('_on_welcome()')
  const looks = () => log.filter(entry => entry == 'task key_buttons_caret').length
  const resize = height => { viewport.height = height; viewport.fire('resize') }
  focus(editor)
  caret.line = low
  resize(464)
  const asked = [looks(), own.key_buttons_caret.delay, own.key_buttons_caret.repeat, [...scrolled]]
  resize(460)
  resize(464)
  const put_off = [looks(), [...scrolled]]
  own.key_buttons_caret.fn()
  const first = [...scrolled]
  resize(450)
  resize(464)
  viewport.fire('scroll')
  page.fire('focusin')
  own.key_buttons_caret.fn() // even the same look run again
  check('once: a keyboard that opens under a focused editor asks for ONE look, put off while the view still changes; the look scrolls the covered line clear, and no later event of that opening looks or scrolls again, the line still covered or not',
    [asked, put_off, first, looks(), scrolled], [[1, 150, undefined, []], [3, []], [[0, 308]], 3, [[0, 308]]])
  resize(800)
  resize(464)
  own.key_buttons_caret.fn()
  const again = [looks(), [...scrolled]]
  resize(800)
  caret.line = { top: 100, bottom: 120 }
  resize(464)
  own.key_buttons_caret.fn() // the line is clear: nothing to do, and the opening is used all the same
  caret.line = low
  resize(450)
  resize(464)
  const used = [looks(), scrolled.length]
  resize(800)
  resize(464)
  resize(800)
  own.key_buttons_caret.fn() // the keyboard closed before its look: nothing, and nothing used
  const closed = [looks(), scrolled.length]
  resize(464)
  own.key_buttons_caret.fn()
  check('once: the keyboard closed and opened again gets one more look; an opening whose look found the line clear is used all the same; a look that comes after the keyboard closed does nothing',
    [again, used, closed, looks(), scrolled], [[4, [[0, 308], [0, 308]]], [5, 2], [6, 2], 7, [[0, 308], [0, 308], [0, 308]]])
  blur(own)
  pointer.matches = false
  resize(800)
  focus(editor)
  resize(464)
  pointer.matches = true
  check('once: never on a desktop', [looks(), scrolled.length], [7, 3])
  resize(800)
  focus(other) // a field that takes text, and is no editor of the app
  resize(464)
  own.key_buttons_caret.fn()
  resize(800)
  focus(editor)
  caret.line = null // no backdrop to measure in
  resize(464)
  own.key_buttons_caret.fn()
  check('once: a look moves nothing where the focus is in no editor of the app, or where nothing can be measured', [looks(), scrolled.length], [9, 3])
  run('window._key_buttons.dispose()')
}

// ---- a part's switch turned in the table: the code with that one switch turned, over the same page
const scene = source => { // a touch device, an editor focused with its caret low, and the keyboard coming up
  calm()
  const own = {}
  const run = evaluation(9, 'keys-id', own, source)
  run('_on_welcome()')
  focus(editor)
  caret.line = low
  viewport.height = 464
  viewport.fire('resize')
  own.key_buttons_caret?.fn() // the one look, where the part asked for it
  const typed = win.fire('keydown', key())
  const seen = { rows: [parts('bar')[0].hidden, parts('keyboard')[0].hidden, parts('keyboard')[0].children.length], typed: [typed.prevented, got(editor)], scrolled: [...scrolled], look: 'key_buttons_caret' in own, listening: listening() }
  run('window._key_buttons.dispose()')
  return seen
}
const whole = scene(code)
check('parts: as the table has them, the keyboard brings its row and Shift+Space is a Tab, and the caret\'s line is left where it is',
  whole, { rows: [true, false, 3], typed: [1, ['keydown Tab', 'keyup Tab']], scrolled: [], look: false, listening: [1, 1, 1, 1, 1, 1] })
check('parts: without the keyboard\'s row nothing shows above the keyboard (the main row hides as before)', scene(turned('keyboard_row', false)), { ...whole, rows: [true, true, 0] })
check('parts: without Shift+Space the key is a space as typed, and nothing listens for it', scene(turned('shift_space_tab', false)), { ...whole, typed: [0, []], listening: [1, 1, 1, 0, 1, 1] })
check('parts: with the caret\'s scroll switched on, the keyboard\'s opening gets its one look and the covered line is scrolled clear', scene(turned('caret_clear', true)), { ...whole, scrolled: [[0, 308]], look: true })
check('parts: with the caret\'s scroll on and no row above the keyboard, the line is cleared of the keyboard alone',
  scene(turned('caret_clear', true).replace('  keyboard_row: true,', '  keyboard_row: false,')), { ...whole, rows: [true, true, 0], scrolled: [[0, 264]], look: true })
calm()

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
