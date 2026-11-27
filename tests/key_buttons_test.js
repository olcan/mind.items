#!/usr/bin/env node
// plain-node table for the #key_buttons item (key_buttons.js): the buttons, the look and the
// parts' switches in one place, the keyboard events one press sends and where, the keyboard read
// by two signals and decided from both (the window's is the sparkle's own test, held to the same
// answers as vault.md's), which row shows, the place of the keyboard's row from a visual viewport,
// the Shift+Space that is a Tab and the devices that get it, the scroll that clears the caret's
// line and its once for each opening of the keyboard, the reload button as the sparkle's mirror,
// and the controller over a fake page.
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
  get childElementCount() { return this.children.length }
  replaceChildren(...nodes) { for (const child of this.children) child.parent = null; this.children = []; for (const node of nodes) this.appendChild(node) }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn) }
  setAttribute(name, value) { this.attrs[name] = value }
  contains(node) { for (let n = node; n; n = n.parent) if (n === this) return true; return false }
  get classList() {
    const list = () => (this.className ?? '').split(/\s+/).filter(Boolean)
    return {
      contains: c => list().includes(c),
      add: (...cs) => { const set = new Set(list()); cs.forEach(c => set.add(c)); this.className = [...set].join(' ') },
      remove: (...cs) => { this.className = list().filter(c => !cs.includes(c)).join(' ') },
    }
  }
  closest(selector) { for (let n = this; n; n = n.parent) if (selector == '[data-key-buttons]' ? n.dataset.keyButtons : (n.className ?? '').split(' ').includes(selector.slice(1))) return n; return null }
  dispatchEvent(event) { this.got.push(event) } // a key sent here
  fire(type, more = {}) {
    const event = { type, target: this, prevented: 0, stopped: 0, preventDefault() { this.prevented++ }, stopPropagation() { this.stopped++ }, ...more }
    for (const fn of [...(this.listeners[type] ?? [])]) fn(event)
    return event
  }
}
const scrolled = []
const page = Object.assign(new FakeNode('document'), { head: new FakeNode('head'), body: new FakeNode('body'), activeElement: null, createElement: tag => new FakeNode(tag), createElementNS: (space, tag) => new FakeNode(tag) })
page.documentElement = new FakeNode('html')
page.body.scrollBy = (x, y) => scrolled.push([x, y])
const all = () => { const out = []; const walk = n => { out.push(n); n.children.forEach(walk) }; walk(page.head); walk(page.body); return out }
const parts = kind => all().filter(n => n.dataset.keyButtons == kind)
const viewport = Object.assign(new FakeNode('viewport'), { width: 390, height: 800, scale: 1, offsetLeft: 0, offsetTop: 0 })
const pointer = Object.assign(new FakeNode('media'), { matches: false })
const reloads = [] // what was asked to reload
// the app as an item's handles show it: its items (`open.items`) and the editors on the page (`open.fields`, by
// element id), which the item does NOT read for a reload (they are here for what it used to read: a fallback
// that guesses from them again reloads without a question in the last block); its dialog (`asked`: what it was
// asked; `dialog.answer`: what it resolves to, or a function that returns the promise); and its own reload
// (`_reload`, the revised app's: what a press asks for. The released app, which has none, is the last block's)
const open = { items: [], fields: {} }
const asked = []
const dialog = { answer: true }
page.getElementById = id => open.fields[id] ?? null
const win = Object.assign(new FakeNode('window'), {
  innerWidth: 390, innerHeight: 800, visualViewport: viewport, location: { origin: 'https://olcan.com', reload: () => reloads.push('page') }, matchMedia: query => (query == '(pointer: coarse)' ? pointer : { matches: false }),
  _items: () => open.items,
  _reload: () => { reloads.push('page'); return Promise.resolve(true) },
  _modal: text => { asked.push(text); return typeof dialog.answer == 'function' ? dialog.answer() : Promise.resolve(dialog.answer) },
})
// the listeners held: the view's size and place, the pointer, the keys, the focus that comes and the focus that leaves
const listening = () => [viewport.listeners.resize, viewport.listeners.scroll, pointer.listeners.change, win.listeners.keydown, page.listeners.focusin, page.listeners.focusout].map(list => (list ?? []).length)
class FakeKey { constructor(type, init) { Object.assign(this, { type, ...init }) } }
// two editors of the app, by the names the app gives their textareas (Editor.svelte), each in its .editor box:
// an item's while it is being edited (`textarea-<item id>`) and the MindBox's (`textarea-mindbox`); a textarea
// that is no editor; and a textarea of an item's own markup, in a box of class editor as the app's own are
const boxed = (tag, id) => Object.assign(new FakeNode(tag), { id, parent: Object.assign(new FakeNode('div'), { className: 'editor' }) })
const [editor, box, widget] = [boxed('textarea', 'textarea-item-1'), boxed('textarea', 'textarea-mindbox'), boxed('textarea', 'widget-notes')]
const other = new FakeNode('textarea')
// what the app's _item answers: #key_buttons by its label; an item being edited by its id, and by a label of
// its own; an item that is not being edited
const edited = { id: 'item-1', editing: true }
const items = { '#key_buttons': { id: 'keys-id' }, 'item-1': edited, '#edited': edited, 'item-2': { id: 'item-2', editing: false } }
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
  const context = vm.createContext({ _this, _item: label => items[label] ?? null, document: page, window: win, KeyboardEvent: FakeKey, URL, Date: { now: () => clock.now } })
  vm.runInContext(source, context)
  context.key_buttons_caret_line = () => caret.line // the measuring is the browser lane's
  return Object.assign((src, args) => { context.__args = args; return vm.runInContext(src, context) }, { item: _this })
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
const strip = v1('KEY_BUTTONS_STRIP')
const strip_specs = v1('KEY_BUTTONS_STRIP_SPECS')
check('buttons: desktop strip has seven buttons in three groups (top and back, the four arrows, create), group leads on each group\'s first, and back tooltip Scroll back down (Ctrl+Alt+Down)',
  [strip, strip_specs.map(b => [b.name, b.lead]), keys_of(strip_specs), buttons.find(b => b.name == 'back').title],
  [[['top', 'back'], ['left', 'up', 'down', 'right'], ['create']],
    [['top', true], ['back', false], ['left', true], ['up', false], ['down', false], ['right', false], ['create', true]],
    ['Ctrl+Alt+ArrowUp', 'Ctrl+Alt+ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight', 'Shift+Enter'],
    'Scroll back down (Ctrl+Alt+Down)'])
check('parts: the four later parts each have a switch of their own: the row above the keyboard, Shift+Space and the reload button on, the caret\'s scroll off',
  [v1('KEY_BUTTONS_PARTS'), v1('KEY_BUTTONS_CARET')], [{ keyboard_row: true, shift_space_tab: true, caret_clear: false, reload_button: true }, { margin: 8, settle: 150 }])
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

// ---- the reload button: the sparkle's mirror, by the sparkle's own rules in vault.md --------------
const reload = v1('KEY_BUTTONS_RELOAD')
const [idle, hover, ring, drawing] = [/\n\.vault-sparkle\.idle \{ color: rgba\(\d+, \d+, \d+, ([\d.]+)\) \}/, /\.vault-sparkle\.idle:hover \{ color: rgba\(\d+, \d+, \d+, ([\d.]+)\) \}/, /\n\.vault-sparkle:focus-visible \{ outline: (\d+px solid) /, /\n\.vault-sparkle > svg \{ display: block; width: (\d+)px; height: (\d+)px \}/].map(rule => vault.match(rule))
const sheet = v1('key_buttons_css(KEY_BUTTONS_LOOK)')
check('reload: one button, its icon drawn as the others are, that says what it does', [reload.name, reload.title, /^M[\d\s.,MmLlHhVvAa-]+$/.test(reload.icon)], ['reload', 'Reload the page', true])
check('reload: the sparkle\'s mirror: as far from the left as the sparkle is from the right, at its height over the bottom, of its size, its drawing of the sparkle\'s size',
  [look.reload.left, look.reload.bottom, look.reload.size, look.reload.size, look.reload.icon, look.reload.icon], [right, bottom, width, height, Number(drawing[1]), Number(drawing[2])])
check('reload: its circle and shadow, its dim idle look, its brighter look under a mouse and its focus ring are the sparkle\'s, in the icons\' white; its layer is the rows\', under the sparkle\'s menu layer',
  [`.key-buttons-reload { position: fixed; left: ${right}px; bottom: ${bottom}px; z-index: ${look.layer};`,
    `width: ${width}px; height: ${height}px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: ${sparkle[6]}; box-shadow: ${sparkle[7]}; color: rgba(255, 255, 255, ${idle[1]});`,
    `@media (hover: hover) { .key-buttons-reload:hover { color: rgba(255, 255, 255, ${hover[1]}) } }`,
    `.key-buttons-reload:focus { outline: none }\n.key-buttons-reload:focus-visible { outline: ${ring[1]} #fff }`,
    `.key-buttons-reload > svg { display: block; width: ${drawing[1]}px; height: ${drawing[2]}px;`,
    '.key-buttons-reload[hidden] { display: none }'].map(rule => sheet.includes(rule)).concat(look.layer < Number(layer[1])),
  [true, true, true, true, true, true, true])
const reload_shown = (wide, up, shown_row, switches) => v1('key_buttons_reload_shown(__args.win, __args.keyboard, __args.row, KEY_BUTTONS_LOOK, __args.parts ?? KEY_BUTTONS_PARTS)', { win: { innerWidth: wide }, keyboard: { up }, row: shown_row, parts: switches })
check('reload: it shows on every device, a desktop too; not while a keyboard is on the screen; not where the main row, while it shows, comes within a gap of it (a window under 354 px, the button being as large as a button of the row on a phone); and never with its part off',
  [reload_shown(1280, false, null), reload_shown(390, false, 'main'), reload_shown(390, true, 'keyboard'), reload_shown(390, true, null), reload_shown(354, false, 'main'), reload_shown(353, false, 'main'), reload_shown(320, false, 'main'), reload_shown(320, false, null), reload_shown(390, false, 'main', { reload_button: false })],
  [true, true, false, false, true, false, false, true, false])
// touch size of both corner buttons: the row's 32 px, centred on the desktop 24 px button's point,
// matched against vault.md's @media (pointer: coarse) rule for .vault-sparkle and its menu
const touch_reload = v1('key_buttons_reload_touch(KEY_BUTTONS_LOOK)')
const touch_sparkle = vault.match(/@media \(pointer: coarse\) \{ \.vault-sparkle \{ right: (\d+)px; bottom: (\d+)px; width: (\d+)px; height: (\d+)px \} \.vault-sparkle-menu \{ bottom: (\d+)px \} \}/)
const custom_touch = v1('key_buttons_reload_touch({ size: 40, reload: { size: 24, left: 14, bottom: 10 } })')
check('reload touch size: 32 px centred on the desktop point (26, 22), mirrored by vault.md coarse-pointer sparkle (32 px at 10/6, menu bottom 46), and scales with look',
  [
    touch_reload,
    [touch_reload.left + touch_reload.size / 2, touch_reload.bottom + touch_reload.size / 2],
    [look.reload.left + look.reload.size / 2, look.reload.bottom + look.reload.size / 2],
    touch_sparkle?.slice(1, 6).map(Number) ?? null,
    custom_touch,
  ],
  [{ size: 32, left: 10, bottom: 6 }, [26, 22], [26, 22], [10, 6, 32, 32, 46], { size: 40, left: 6, bottom: 2 }])
const geom = v1('key_buttons_backdrop_geom(KEY_BUTTONS_LOOK)')
const frame = v1('key_buttons_backdrop_frame(KEY_BUTTONS_LOOK)')
check("nav look: in a window narrower than the piece the group gaps shrink to the button gap, so the strip's first button stays inside at 320 and 300 px (it began left of the window with the wide gaps)",
  [sheet.includes(`@media (max-width: ${geom.w_piece - 1}px) { .key-buttons-reload.desktop { right: ${right + width + look.gap}px } .key-buttons-nav { right: ${right + 2 * width + 2 * look.gap}px } .key-buttons-nav > button[data-lead]:not(:first-child) { margin-left: 0 } }`),
    geom.w_piece,
    [320, 300].map(vw => vw - (right + 2 * width + 2 * look.group) - (7 * width + 4 * look.gap + 2 * look.group)),
    [320, 300].map(vw => vw - (right + 2 * width + 2 * look.gap) - (7 * width + 6 * look.gap))],
  [true, 340, [-6, -26], [42, 22]])
check('nav look: valid arrows are green (#9f9) and invalid arrows dim to look.dim; desktop strip and reload sit at the lower right with group gaps; raised frosted-glass backdrop (4 px blur, 1 px free-edge border, soft outer shadow) draws one right piece on wide desktop (bg-right never shown) and merges to a strip on narrow desktop and mobile',
  [look.group,
    look.valid,
    look.dim,
    look.backdrop,
    sheet.includes('.key-buttons > button.valid { color: #9f9 }'),
    sheet.includes(`.key-buttons > button.dim > svg { opacity: ${look.dim} }`),
    sheet.includes(`.key-buttons-reload.desktop { left: auto; right: ${right + width + look.group}px }`),
    sheet.includes(`.key-buttons-reload:not(.desktop) { left: ${right - (look.size - width) / 2}px; bottom: ${look.reload.bottom - (look.size - width) / 2}px; width: ${look.size}px; height: ${look.size}px }`),
    sheet.includes(`.key-buttons-guests > button:active, .key-buttons-guests > button.busy { background: ${look.pressed} }`),
    sheet.includes(`.key-buttons-nav { position: fixed; right: ${right + 2 * width + 2 * look.group}px; bottom: ${bottom}px; z-index: ${look.layer}; display: flex; gap: ${look.gap}px;`),
    sheet.includes(`.key-buttons-nav > button[data-lead]:not(:first-child) { margin-left: ${look.group - look.gap}px }`),
    !sheet.includes('.key-buttons-nav.vertical'),
    sheet.includes(`.key-buttons-nav > button { pointer-events: auto; flex: none; display: flex; align-items: center; justify-content: center; width: ${width}px; height: ${height}px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: ${sparkle[6]}; box-shadow: ${sparkle[7]}; color: #fff;`),
    sheet.includes('.key-buttons-nav > button.valid { color: #9f9 }'),
    sheet.includes(`.key-buttons-nav > button.dim > svg { opacity: ${look.dim} }`),
    sheet.includes(`.key-buttons-nav > button > svg { display: block; width: ${drawing[1]}px; height: ${drawing[2]}px;`),
    sheet.includes(`.key-buttons-bg { position: fixed; left: 0; right: 0; bottom: 0; height: 0; z-index: ${look.layer - 1}; pointer-events: none }`),
    sheet.includes(`.key-buttons-bg > .key-buttons-bg-pane { position: absolute; left: 0; right: 0; bottom: 0; height: ${look.size + 2 * look.bottom}px; box-sizing: border-box; background: ${look.backdrop.fill}; -webkit-backdrop-filter: blur(${look.backdrop.blur}); backdrop-filter: blur(${look.backdrop.blur}); border-top: 1px solid ${look.backdrop.border}; box-shadow: 0 0 ${look.backdrop.shadow_blur}px ${look.backdrop.shadow}; pointer-events: none }`),
    sheet.includes(`.key-buttons-bg.desktop > .key-buttons-bg-pane { height: ${geom.h_tot}px; border-top: 0; box-shadow: none; -webkit-clip-path: path('${geom.clip_strip}'); clip-path: path('${geom.clip_strip}') }`),
    sheet.includes(`.key-buttons-bg.desktop.split > .key-buttons-bg-pane { left: auto; right: 0; width: ${geom.w_piece}px; -webkit-clip-path: path('${geom.clip_split}'); clip-path: path('${geom.clip_split}') }`),
    sheet.includes(`.key-buttons-bg-svg { display: none; position: absolute; left: 0; bottom: 0; height: ${geom.h_tot + geom.pad}px; pointer-events: none }`),
    sheet.includes(`.key-buttons-bg.desktop.split .key-buttons-bg-svg.split { display: block; left: auto; right: 0; width: ${geom.w_piece + geom.pad}px }`),
    sheet.includes(`.key-buttons-bg > .key-buttons-bg-right { display: none;`),
    !sheet.includes('body:has(> .vault-sparkle:not([hidden])) .key-buttons-bg.desktop.split > .key-buttons-bg-right'),
    frame.includes(`<feGaussianBlur stdDeviation="${look.backdrop.shadow_blur / 2}"/>`),
    frame.includes(`stroke="${look.backdrop.border}" stroke-width="1"`),
    frame.includes('class="key-buttons-bg-svg split"') && frame.includes('class="key-buttons-bg-svg strip"'),
    look.layer - 1 < look.layer && look.layer < Number(layer[1])],
  [18, '#9f9', 0.25, { fill: 'rgba(17, 17, 17, 0.65)', blur: '4px', border: 'rgba(255, 255, 255, 0.09)', shadow: 'rgba(0, 0, 0, 1)', shadow_blur: 12, merge: 480 }, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true])
check('backdrop geom & frame: one right piece (w_piece 340, h_col 0, h_tot 44, top-left radius 12) and its split and strip clip, shadow-caster and border SVG paths',
  [geom.w_col, geom.h_col, geom.h_row, geom.h_tot, geom.w_piece, geom.r, geom.pad, geom.narrow,
    geom.clip_split, geom.clip_strip, geom.shape_split, geom.border_split, geom.shape_strip, geom.border_strip,
    frame.includes(`<path d="${geom.shape_split}" fill="#000"/>`),
    frame.includes(`<path d="${geom.shape_split}" fill="${look.backdrop.shadow}"`),
    frame.includes(`<path d="${geom.border_split}" fill="none" stroke="${look.backdrop.border}" stroke-width="1"`),
    frame.includes(`<path d="${geom.shape_strip}" fill="${look.backdrop.shadow}"`),
    frame.includes(`<path d="${geom.border_strip}" fill="none" stroke="${look.backdrop.border}" stroke-width="1"`)],
  [52, 0, 44, 44, 340, 12, 36, 480,
    'M 12 0 H 340 V 44 H 0 V 12 A 12 12 0 0 1 12 0 Z',
    'M 0 0 H 480 V 44 H 0 Z',
    'M 48 36 H 412 V 116 H 36 V 48 A 12 12 0 0 1 48 36 Z',
    'M 36.5 80 V 48 A 11.5 11.5 0 0 1 48 36.5 H 376',
    'M -36 36 H 516 V 116 H -36 Z',
    'M 0 36.5 H 480',
    true, true, true, true, true])

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
const own_button = Object.assign(new FakeNode('button'), { parent: Object.assign(new FakeNode('div'), { className: 'key-buttons keyboard', dataset: { keyButtons: 'keyboard' } }) })
const own_reload = Object.assign(new FakeNode('button'), { className: 'key-buttons-reload', dataset: { keyButtons: 'reload' } })
check('press: it goes where a key would: to the element that has the focus, else to the body (nothing focused, the body, the root, a button of a row, the reload button)',
  [target(editor), target(null), target(page.body), target(page.documentElement), target(own_button), target(own_reload)], ['textarea', 'body', 'body', 'body', 'body', 'body'])
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
  reads(a_window(508, 508), editor, seen), { up: true, focus: true, editor: true, by_window: false, by_view: true, window: 508, view: 508, width: 390, tallest: 844, scale: 1 })
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
  [flags(reads(a_window(844, 784), editor, seen)), reads({ innerHeight: 844 }, editor, seen)], [[false, false, false, true], { up: false, focus: true, editor: true, by_window: false, by_view: false, window: 844, view: null, width: null, tallest: null, scale: null }])
check('keyboard: it also says whether the focused element is an editor of the app: an edited item\'s textarea and the MindBox\'s are; a textarea of an item\'s own markup in a box of class editor, another textarea, an input and a frame are fields that take text and no editor',
  [editor, box, widget, other, Object.assign(new FakeNode('input'), { type: 'text' }), new FakeNode('iframe'), null].map(active => (read => [read.focus, read.editor])(reads(a_window(844, 508), active, seen))),
  [[true, true], [true, true], [true, false], [true, false], [true, false], [true, false], [false, false]])
check('editor: the app\'s editors are told by the names the app gives their textareas: the MindBox\'s, and the textarea of an item that is being edited; not a textarea of an item\'s own markup in a box of class editor, nor one named for an item that is not being edited, for no item, by an edited item\'s label, by an id: prefix or by nothing, nor another element under the MindBox\'s name, a textarea with no name, or nothing at all',
  [box, editor, widget, boxed('textarea', 'textarea-item-2'), boxed('textarea', 'textarea-item-9'), boxed('textarea', 'textarea-#edited'), boxed('textarea', 'textarea-id:item-1'), boxed('textarea', 'textarea-'), boxed('input', 'textarea-mindbox'), other, null].map(element => v1('key_buttons_editor(__args)', element)),
  [true, true, false, false, false, false, false, false, false, false, false])
const fingers = coarse => ({ matchMedia: () => ({ matches: coarse }) })
const shown = (coarse, up, switches, editor = true) => v1('key_buttons_row(__args.win, __args.keyboard, __args.parts ?? KEY_BUTTONS_PARTS)', { win: fingers(coarse), keyboard: { up, editor }, parts: switches })
check('shown: where the primary pointer is a finger, the main row with no keyboard up and the keyboard\'s row with one; neither on a desktop, nor without the media query',
  [shown(true, false), shown(true, true), shown(false, false), shown(false, true), v1('key_buttons_row({}, { up: true })')], ['main', 'keyboard', null, null, null])
check('shown: with the keyboard\'s row switched off nothing shows while the keyboard is up, and the main row as before', [shown(true, true, { keyboard_row: false }), shown(true, false, { keyboard_row: false })], [null, 'main'])
check('shown: the keyboard\'s row is for an editor of the app alone: with the keyboard up for another field no row shows, the main row hidden all the same; with no keyboard the main row, whatever has the focus',
  [shown(true, true, undefined, false), shown(true, false, undefined, false)], [null, 'main'])
check('says: the row, the decision, each signal with its numbers, the focus and the zoom; then the row\'s last changes with what the signals read at each',
  v1('key_buttons_says(__args.read, "keyboard", __args.changes, 60000)', { read: { up: true, focus: true, editor: true, by_window: false, by_view: true, window: 508, view: 508, width: 390, tallest: 844, scale: 1.004 }, changes: [{ at: 57400, shown: 'keyboard', window: false, view: true, focus: true }, { at: 12000, shown: null, window: true, view: false, focus: false }] }),
  ['keys: row keyboard · keyboard up · by window no (window 508 − view 508 = 0) · by view yes (tallest 844 − view 508 = 336 at width 390) · focus yes · editor yes · scale 1',
    'keys before: 3 s ago keyboard (window no, view yes, focus yes) · 48 s ago none (window yes, view no, focus no)'])
check('says: with no change yet it says so', v1('key_buttons_says(__args, null, [], 0)', { up: false, focus: false, by_window: false, by_view: false, window: 844, view: 844, width: 390, tallest: 844, scale: 1 })[1], 'keys before: nothing yet')

// ---- Shift+Space -------------------------------------------------------------------------------
const key = (more = {}) => ({ code: 'Space', key: ' ', shiftKey: true, target: editor, ...more })
const taken = (e, coarse = true) => v1('key_buttons_shift_space(__args.e, __args.win)', { e, win: fingers(coarse) })
check('shift+space: it is a Tab on a touch device, in an editor of the app, by the code or, from a keyboard that gives none, by the key',
  [taken(key()), taken(key({ code: 'Unidentified' })), taken(key({ code: '' })), taken(key({ getModifierState: () => false }))], [true, true, true, true])
check('shift+space: not a plain space, another key, a space with one more modifier, one inside a composition or under a caps lock the event names, nor one outside an editor of the app (a textarea of an item\'s own markup in a box of class editor, another textarea, the page, nothing)',
  [{ shiftKey: false }, { code: 'KeyA', key: 'A' }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { getModifierState: name => name == 'CapsLock' }, { target: widget }, { target: other }, { target: page.body }, { target: null }].map(more => taken(key(more))),
  [false, false, false, false, false, false, false, false, false, false, false])
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

// ---- valid navigation arrows & desktop subset --------------------------------------------------
const nav = (text, list) => v1('key_buttons_nav(__args.box, __args.items)', { box: text, items: list })
const no_nav = { left: false, up: false, down: false, right: false }
const map_tree = [
  { label: '#map', ancestors: [] },
  { label: '#Map/A', ancestors: ['#map'] },
  { label: '#map/a/0', ancestors: ['#map/a', '#map'] },
  { label: '#map/b', ancestors: ['#map'] },
]
check('nav: tree (#map, #map/a, #map/a/0, #map/b): root goes down only; #map/a goes all four ways (case-insensitive, trailing space); #map/a/0 is a lone child (up only); #map/b has sibling and parent but no child',
  [nav('#map', map_tree), nav(' #map/a ', map_tree), nav('#map/a/0', map_tree), nav('#map/b', map_tree)],
  [{ left: false, up: false, down: true, right: false },
    { left: true, up: true, down: true, right: true },
    { left: false, up: true, down: false, right: false },
    { left: true, up: true, down: false, right: true }])
const int_tree = [{ label: '#chat' }, { label: '#chat/0' }, { label: '#chat/1' }, { label: '#solo' }, { label: '#solo/0' }]
check('nav: integer children (and fallback prefixes when ancestors omitted): parent goes down, pair of integer children has siblings, single child has none',
  [nav('#chat', int_tree), nav('#chat/0', int_tree), nav('#solo/0', int_tree)],
  [{ left: false, up: false, down: true, right: false },
    { left: true, up: true, down: false, right: true },
    { left: false, up: true, down: false, right: false }])
const dup_tree = [
  { label: '#map', ancestors: [] },
  { label: '#map/a', ancestors: ['#map'] },
  { label: '#map/dup', ancestors: ['#map'] },
  { label: '#map/dup', ancestors: ['#map'] },
  { label: '#solo_dup', ancestors: [] },
  { label: '#solo_dup/x', ancestors: ['#solo_dup'] },
  { label: '#solo_dup/x', ancestors: ['#solo_dup'] },
  { label: '#dup_parent', ancestors: [] },
  { label: '#dup_parent', ancestors: [] },
  { label: '#dup_parent/a', ancestors: ['#dup_parent'] },
  { label: '#log', ancestors: [] },
]
check('nav: no single unique item named (empty, whitespace, plain search, multi-term, command, id:, #log, missing, duplicate label): nothing lit',
  ['', '   ', 'notes', '#map notes', '/_help', 'id:item-1', '#log', '#missing', '#map/dup'].map(q => nav(q, dup_tree)),
  Array(9).fill(no_nav))
check('nav: duplicate child counts as sibling for Left/Right on #map/a, but untagged duplicate child alone does not light Down; duplicate parent does not light Up or Left/Right',
  [nav('#map/a', dup_tree), nav('#solo_dup', dup_tree), nav('#dup_parent/a', dup_tree)],
  [{ left: true, up: true, down: false, right: true }, no_nav, no_nav])
const tag_and_rename = [
  { label: '#root', ancestors: [], tags_visible: ['#root', '#root/draft'] },
  { label: '#root/a', ancestors: ['#root'] },
  { label: '#sparse', ancestors: [] },
  { label: '#sparse/mid/0', ancestors: ['#sparse/mid', '#sparse'] },
  { label: '#chat', ancestors: [] },
  { label: '#chat/a', ancestors: ['#chat'] },
  { label: '#chat/note', ancestors: ['#chat/a', '#chat'] },
]
check('nav: visible descendant tags (down and sibling), missing intermediate level (down from ancestor, up via ancestor, no sibling), and renamed tag child via ancestors',
  [nav('#root', tag_and_rename.slice(0, 1)), nav('#root/a', tag_and_rename), nav('#sparse', tag_and_rename), nav('#sparse/mid/0', tag_and_rename), nav('#chat/a', tag_and_rename), nav('#chat/note', tag_and_rename), nav('#chat/note', tag_and_rename.concat({ label: '#chat/a/0', ancestors: ['#chat/a', '#chat'] }))],
  [{ left: false, up: false, down: true, right: false },
    { left: true, up: true, down: false, right: true },
    { left: false, up: false, down: true, right: false },
    { left: false, up: true, down: false, right: false },
    { left: false, up: true, down: true, right: false },
    { left: false, up: true, down: false, right: false },
    { left: true, up: true, down: false, right: true }])
// dangling relative references vs existing child vs absolute tags written in full
const dangling_only = [{ label: '#p', ancestors: [], tags_visible: ['#p', '#p/later'], dangling_tags: ['#p/later'] }]
const dangling_live_child = [
  { label: '#p', ancestors: [], tags_visible: ['#p', '#p/later'], dangling_tags: [] },
  { label: '#p/later', ancestors: ['#p'] },
]
const dangling_live_other = [{ label: '#p', ancestors: [], tags_visible: ['#p', '#p/later'], dangling_tags: [] }] // absolute tag written in full, or carried by another item
const dangling_mixed = [{ label: '#p', ancestors: [], tags_visible: ['#p', '#p/later', '#p/full'], dangling_tags: ['#p/later'] }]
const dangling_parent_sib = [
  { label: '#p', ancestors: [], tags_visible: ['#p', '#p/later'], dangling_tags: ['#p/later'] },
  { label: '#p/a', ancestors: ['#p'] },
]
const abs_parent_sib = [
  { label: '#p', ancestors: [], tags_visible: ['#p', '#p/later'], dangling_tags: [] },
  { label: '#p/a', ancestors: ['#p'] },
]
check('nav: dangling relative reference dims Down (and parent sibling Left/Right); once child exists or for a tag written in full, Down (and sibling Left/Right) lights green',
  [nav('#p', dangling_only), nav('#p', dangling_live_child), nav('#p', dangling_live_other), nav('#p', dangling_mixed), nav('#p/a', dangling_parent_sib), nav('#p/a', abs_parent_sib)],
  [{ left: false, up: false, down: false, right: false },
    { left: false, up: false, down: true, right: false },
    { left: false, up: false, down: true, right: false },
    { left: false, up: false, down: true, right: false },
    { left: false, up: true, down: false, right: false },
    { left: true, up: true, down: false, right: true }])
const desktop_shown = (coarse, up) => v1('key_buttons_desktop_shown(__args.win, __args.keyboard)', { win: fingers(coarse), keyboard: { up } })
const bg_shown = (coarse, up, shown_row, wide = 1280) => v1('key_buttons_backdrop(__args.win, __args.keyboard, __args.shown, KEY_BUTTONS_LOOK)', { win: { ...fingers(coarse), innerWidth: wide }, keyboard: { up }, shown: shown_row })
check('desktop nav & backdrop: desktop shows right piece at >= 480 px and merges into a full strip below 480 px (strip always shown); phone shows mobile strip only with the main row (not while keyboard is up)',
  [[desktop_shown(false, false), desktop_shown(false, true), desktop_shown(true, false), desktop_shown(true, true)],
    [bg_shown(true, false, 'main', 390), bg_shown(true, false, 'main', 1280), bg_shown(true, true, 'keyboard', 390), bg_shown(true, true, null, 390), bg_shown(false, false, null, 1280), bg_shown(false, false, null, 480), bg_shown(false, false, null, 479), bg_shown(false, false, null, 390), bg_shown(false, true, null, 1280)]],
  [[true, false, false, false], ['mobile', 'mobile', null, null, 'desktop-split', 'desktop-split', 'desktop-strip', 'desktop-strip', null]])
const in_glass = (x, dy, mode, right_shown = false, vw = 1000, vh = 600) =>
  v1('key_buttons_in_glass(__args.x, __args.y, __args.vw, __args.vh, __args.mode, __args.right, KEY_BUTTONS_LOOK)', { x, y: vh - dy, vw, vh, mode, right: right_shown })
// on vw=1000, vh=600 the split piece sits at the lower right: x 660..1000 (w_piece=340), dy 0..44 (h_row=44),
// top-left corner rounded by r=12 (arc centre at x=672, dy=32)
check('glass hit test: piece at the right (inside, under the sparkle regardless of right_shown, gaps between groups, left of it, lower left has no glass, above the row); merged strip below 480 px; phone strip; none when keyboard up',
  [
    in_glass(800, 22, 'desktop-split'), // inside right piece, under the arrows
    in_glass(974, 22, 'desktop-split', false), // under the sparkle's place (right_shown false: ignored)
    in_glass(974, 22, 'desktop-split', true), // under the sparkle's place (right_shown true)
    in_glass(737, 22, 'desktop-split'), // 18 px gap between back and left (groups 1 and 2)
    in_glass(869, 22, 'desktop-split'), // 18 px gap between right and create (groups 2 and 3)
    in_glass(911, 22, 'desktop-split'), // 18 px gap between create and reload
    in_glass(655, 22, 'desktop-split'), // left of the right piece (on its outer shadow)
    in_glass(20, 22, 'desktop-split'), // old lower-left reload place: no glass there now
    in_glass(71, 22, 'desktop-split'), // old lower-left arrow gap: no glass there now
    in_glass(800, 48, 'desktop-split'), // above the row (on its outer shadow)
    in_glass(20, 22, 'desktop-strip', false, 420), // left end of merged strip below 480 px
    in_glass(220, 22, 'desktop-strip', false, 420), // middle of merged strip
    in_glass(5, 43, 'desktop-strip', false, 420), // top-left corner of merged strip (unrounded)
    in_glass(415, 43, 'desktop-strip', false, 420), // top-right corner of merged strip (unrounded)
    in_glass(20, 80, 'desktop-strip', false, 420), // above merged strip (no column now)
    in_glass(220, 48, 'desktop-strip', false, 420), // shadow above merged strip
    in_glass(200, 22, 'mobile', false, 390), // inside phone strip
    in_glass(200, 44, 'mobile', false, 390), // top edge of phone strip
    in_glass(200, 48, 'mobile', false, 390), // shadow above phone strip
    in_glass(800, 22, null), // no glass (keyboard up)
  ],
  [true, true, true, true, true, true, false, false, false, false, true, true, true, true, false, false, true, true, false, false])
check('glass hit test: top-left rounded corner of the right piece excludes its cut-away tip outside the 12 px arc',
  [
    in_glass(664, 38, 'desktop-split'), // inside 12 px top-left arc: (336-328)^2 + (38-32)^2 = 100 <= 144
    in_glass(661, 43, 'desktop-split'), // cut-away tip outside 12 px arc: (339-328)^2 + (43-32)^2 = 242 > 144
    in_glass(660, 44, 'desktop-split'), // outer square corner: outside arc
    in_glass(672, 44, 'desktop-split'), // top tangent of arc: inside
    in_glass(660, 32, 'desktop-split'), // left tangent of arc: inside
  ],
  [true, false, false, true, true])

// ---- measurement over 1,600 items (16 roots x 100 items, and one 1,600-item tree) --------------
{
  const corpus = []
  for (let r = 0; r < 16; r++) {
    const root = `#tree${r}`
    corpus.push({ label: root, ancestors: [] })
    for (let i = 0; i < 99; i++) {
      const mid = `${root}/g${Math.floor(i / 10)}`
      if (i % 10 === 0) corpus.push({ label: mid, ancestors: [root] })
      else corpus.push({ label: `${mid}/${i % 10}`, ancestors: [mid, root] })
    }
  }
  const single_root = [{ label: '#big', ancestors: [] }]
  for (let i = 0; i < 1599; i++) {
    const mid = `#big/g${Math.floor(i / 10)}`
    if (i % 10 === 0) single_root.push({ label: mid, ancestors: ['#big'] })
    else single_root.push({ label: `${mid}/${i % 10}`, ancestors: [mid, '#big'] })
  }
  // warm up JIT then time 50 looks each
  for (let i = 0; i < 10; i++) { nav('#tree0/g0', corpus); nav('#big/g0', single_root) }
  const t0 = performance.now()
  let res_multi
  for (let i = 0; i < 50; i++) res_multi = nav('#tree0/g0', corpus)
  const multi_ms = (performance.now() - t0) / 50
  const t1 = performance.now()
  let res_single
  for (let i = 0; i < 50; i++) res_single = nav('#big/g0', single_root)
  const single_ms = (performance.now() - t1) / 50
  const t2 = performance.now()
  let res_leaf
  for (let i = 0; i < 50; i++) res_leaf = nav('#big/g99/8', single_root) // worst-case leaf: scans all 1,600 to confirm down=false
  const leaf_ms = (performance.now() - t2) / 50
  console.log(`perf: 1,600 items — multi-root ${multi_ms.toFixed(3)} ms, single-root branch ${single_ms.toFixed(3)} ms, single-root leaf (full scan) ${leaf_ms.toFixed(3)} ms`)
  check('perf: 1,600-item looks return the exact arrows (branch: all four; leaf with siblings: left/up/right)',
    [corpus.length, single_root.length, res_multi, res_single, res_leaf],
    [1600, 1600, { left: true, up: true, down: true, right: true }, { left: true, up: true, down: true, right: true }, { left: true, up: true, down: false, right: true }])
}

// ---- the controller ----------------------------------------------------------------------------
v1('_on_welcome()')
const [bg, bar, keys, nav_strip] = [parts('backdrop')[0], parts('bar')[0], parts('keyboard')[0], parts('nav-strip')[0]]
check('controller: the page\'s welcome draws one style, the backdrop (with its pane, SVG frame and unused right piece children), the two rows, the reload button and the one desktop nav strip under the body, each put there hidden; on a narrow (390 px) desktop with empty box the strip and merged desktop backdrop show (arrows dimmed, non-arrows untouched)',
  [log, parts('style').length, parts('nav-vertical').length, parts('nav-horizontal').length, bg.parent === page.body, bg.children.map(c => c.className), bg.children[1].innerHTML === frame, bar.parent === page.body, keys.parent === page.body, nav_strip.parent === page.body, bar.children.map(b => b.dataset.key), keys.children.map(b => b.dataset.key), nav_strip.children.map(b => [b.dataset.key, b.dataset.lead ?? null]), nav_strip.className, bg.className, bg.attrs['aria-hidden'], bg.hidden, bar.hidden, keys.hidden, nav_strip.hidden, nav_strip.children.map(b => [b.dataset.key, b.className ?? '']), tasks.key_buttons.delay, tasks.key_buttons.repeat],
  [['+style', '+backdrop hidden', '+bar hidden', '+keyboard hidden', '+reload hidden', '+nav-strip hidden', '+guests hidden', 'task key_buttons'], 1, 0, 0, true, ['key-buttons-bg-pane', 'key-buttons-bg-frame', 'key-buttons-bg-right', 'key-buttons-bg-floor'], true, true, true, true, buttons.map(b => b.name), above.map(b => b.name), [['top', '1'], ['back', null], ['left', '1'], ['up', null], ['down', null], ['right', null], ['create', '1']], 'key-buttons-nav', 'key-buttons-bg desktop', 'true', false, true, true, false, [['top', ''], ['back', ''], ['left', 'dim'], ['up', 'dim'], ['down', 'dim'], ['right', 'dim'], ['create', '']], 15000, 15000])
const again = parts('reload')[0]
check('reload: drawn under the body with the rows and shown on a desktop with class desktop; named for a screen reader, its icon a line drawing, and within the Tab order as the sparkle is',
  [parts('reload').length, again.parent === page.body, again.hidden, again.className, again.title, again.attrs['aria-label'], again.innerHTML, 'tabIndex' in again],
  [1, true, false, 'key-buttons-reload desktop', 'Reload the page', 'Reload the page', `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${reload.icon}"/></svg>`, false])
const reloaded = again.fire('click')
check('reload: a press reloads the page, once, and is nothing else to the page', [reloads, reloaded.prevented, reloaded.stopped], [['page'], 1, 1])
reloads.length = 0
const keyed = (more = {}) => again.fire('keydown', { key: 'Enter', ...more })
const own_keys = [keyed(), keyed({ key: ' ' }), keyed({ repeat: true }), keyed({ shiftKey: true }), keyed({ ctrlKey: true }), keyed({ key: 'a' })]
win._modal_visible = () => true
own_keys.push(keyed())
delete win._modal_visible
const released = [again.fire('keyup', { key: 'Enter' }), again.fire('keyup', { key: 'a' })]
check('reload: with the focus, Enter and Space are its own: the press reloads, a held key does not; a key with a modifier, any other key and every key under a dialog are the app\'s; its own keyup is kept from the app',
  [reloads, own_keys.map(e => [e.prevented, e.stopped]), released.map(e => [e.prevented, e.stopped])], [['page', 'page'], [[1, 1], [1, 1], [1, 1], [0, 0], [0, 0], [0, 0], [0, 0]], [[1, 1], [0, 0]]])
check('reload: a press takes no focus and is not the app\'s: a mouse press is prevented and stopped, a touch only stopped, a long press opens no menu',
  ['mousedown', 'touchstart', 'contextmenu'].map(type => again.fire(type)).map(e => [e.prevented, e.stopped]), [[1, 1], [0, 1], [1, 1]])
reloads.length = 0
const page_reload = win._key_buttons.reload
win._key_buttons.reload = () => reloads.push('stood in')
again.fire('click')
win._key_buttons.reload = page_reload
check('reload: the press goes through the controller\'s own reload, which a test can stand in for', reloads, ['stood in'])
reloads.length = 0
check('controller: a button is a finger\'s: named for a screen reader by what its key does, outside the Tab order, its icon a line drawing',
  [bar.children[2].attrs['aria-label'], bar.children[2].title, bar.children[2].tabIndex, bar.children[2].innerHTML, keys.children[1].title, keys.className],
  [spec('create').title, spec('create').title, -1, `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${spec('create').icon}"/></svg>`, spec('indent').title, 'key-buttons keyboard'])
const reload_on_desktop = again.className
pointer.matches = true
clock.now += 2000
pointer.fire('change')
check('controller: a finger as the primary pointer shows the main row, at the change itself, the reload button beside it', [bar.hidden, keys.hidden, again.hidden], [false, true, false])
check('reload: desktop class is set on a keyboard device and cleared on a phone', [reload_on_desktop, again.className], ['key-buttons-reload desktop', 'key-buttons-reload'])
win.innerWidth = 320
pointer.fire('change')
const narrow = [bar.hidden, again.hidden, again.fire('click').prevented, [...reloads]]
win.innerWidth = 390
pointer.fire('change')
check('reload: where the window is too narrow for the main row and the button, the button gives way, and hidden it reloads nothing; wide again it is back', [narrow, bar.hidden, again.hidden], [[false, true, 1, []], false, false])
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
check('reload: hidden while the keyboard is up', again.hidden, true)
clock.now += 4000
check('controller: it says what it reads: the row, the two signals, and the row\'s changes since it was drawn',
  v1('window._key_buttons.says()'),
  ['keys: row keyboard · keyboard up · by window yes (window 800 − view 464 = 336) · by view yes (tallest 800 − view 464 = 336 at width 390) · focus yes · editor yes · scale 1',
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
  [gone, followed, bar.hidden], [[false, true, true], [true, false, 'keys: row keyboard · keyboard up · by window no (window 464 − view 464 = 0) · by view yes (tallest 800 − view 464 = 336 at width 390) · focus yes · editor yes · scale 1'], false])
check('reload: back once the keyboard is down', again.hidden, false)
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
page.activeElement = null // the focus has left its editor, and the item has not looked yet: the row still shows
const lingers = keys.hidden
button('done').fire('click')
page.activeElement = widget // a field that is no editor of the app: a textarea of an item's own markup, in a box of class editor
button('done').fire('click')
button('indent').fire('click')
const unsent = [lingers, got(editor), got(widget), page.body.got.length]
focus(widget) // the look at the focus that came: no row for this field, and its keyboard hides the main row all the same
const for_a_field = [bar.hidden, keys.hidden, again.hidden]
focus(editor)
button('indent').fire('click')
check('controller: the keyboard\'s row sends to an editor of the app alone, asked again at the tap: after the focus left, the row still showing, and with the focus in another field a tap sends nothing; for another field\'s keyboard no row shows, the main row and the reload button hidden as for any keyboard; back in an editor it shows and sends',
  [unsent, for_a_field, keys.hidden, got(editor)], [[false, [], [], 0], [true, true, true], false, told(events('indent'))])
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
  [log, parts('bar').length, parts('keyboard').length, parts('nav-strip').length, parts('nav-vertical').length, parts('nav-horizontal').length, parts('backdrop').length, bar2 !== bar, bar2.hidden, parts('style').length, parts('reload').length, parts('reload')[0] !== again],
  [['-backdrop', '-bar', '-keyboard', '-reload', '-nav-strip', '-guests', '-style', '+style', '+backdrop hidden', '+bar hidden', '+keyboard hidden', '+reload hidden', '+nav-strip hidden', '+guests hidden', 'task key_buttons'], 1, 1, 1, 0, 0, 1, true, false, 1, 1, true])
bar.hidden = false // as if it were still shown: only its disposal keeps a replaced row quiet
button('down').fire('click')
again.hidden = false
again.fire('click')
check('controller: the replaced rows and button send nothing, reload nothing and listen to nothing: one listener each for the view\'s size and place, the pointer, the keys and the focus, the new controller\'s',
  [page.body.got.length, reloads, listening()], [0, [], [1, 1, 1, 1, 1, 1]])
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
// live valid (green) and dim states on mobile and desktop, wide split vs narrow merged backdrop,
// desktop strip order/leads/clicks/editing guard, item-change burst coalescing, and _labels fast path
{
  const bg_now = parts('backdrop')[0]
  const bar_now = parts('bar')[0]
  const reload_now = parts('reload')[0]
  const nav_strip_now = parts('nav-strip')[0]
  const strip_btn = name => nav_strip_now.children.find(b => b.dataset.key == name)
  const states_mobile = () => bar_now.children.slice(3).map(b => [b.dataset.key, b.className])
  const states_desktop = () => ({
    shown: !nav_strip_now.hidden,
    reload: reload_now.className,
    strip: nav_strip_now.children.map(b => [b.dataset.key, b.dataset.lead ?? null, b.hidden, b.className ?? '']),
  })
  const non_arrows_desktop = () => ['top', 'back', 'create'].map(k => [k, strip_btn(k).className ?? ''])
  open.items = map_tree.map(it => ({ ...it }))
  pointer.matches = false
  win.innerWidth = 1024
  pointer.fire('change')
  v2('_on_search("#map/a ")')
  const desk_all = [states_desktop(), bg_now.hidden, bg_now.className]
  const strip_order_leads = nav_strip_now.children.map(b => [b.dataset.key, b.dataset.lead ?? null])
  const non_arrows_all = non_arrows_desktop()
  const reload_desktop_cls = reload_now.className
  // resizing below 480 px merges the split desktop backdrop into the full-width strip, and back
  win.innerWidth = 479
  viewport.fire('resize')
  const desk_narrow = bg_now.className
  win.innerWidth = 480
  viewport.fire('resize')
  const desk_wide = bg_now.className
  // clicking any button of the desktop strip (arrows, even dimmed, and top/back/create) sends its
  // key to document.body even while MindBox has focus
  v2('_on_search("#map")') // only down is valid (green); up, left, right are dim; top/back/create untouched
  const desk_down = states_desktop()
  const non_arrows_down = non_arrows_desktop()
  page.body.got.length = box.got.length = 0
  focus(box)
  const up_click = strip_btn('up').fire('click') // dim!
  const right_click = strip_btn('right').fire('click') // dim!
  const sent_dim = [got(page.body), box.got.length, up_click.prevented, up_click.stopped, right_click.prevented, right_click.stopped]
  const strip_action_clicks = ['top', 'back', 'create'].map(name => {
    page.body.got.length = box.got.length = 0
    const ev = strip_btn(name).fire('click')
    return [name, got(page.body), got(box), ev.prevented, ev.stopped]
  })
  blur()
  v2('_on_search("#map/a/0")') // only up valid
  const desk_up = states_desktop()
  v2('_on_search("#map/b")') // left, up, right valid; down dim
  const desk_up_horiz = states_desktop()
  // mobile: main row keeps full-width strip (even at wide width), marks valid green and invalid dim,
  // never changes non-arrows; reload loses desktop class; on-screen keyboard hides backdrop with main row
  pointer.matches = true
  pointer.fire('change')
  const reload_phone_cls = reload_now.className
  const mob_b = [states_mobile(), bar_now.children.slice(0, 3).map(b => b.className ?? ''), nav_strip_now.hidden, reload_now.className, bg_now.hidden, bg_now.className]
  page.body.got.length = 0
  bar_now.children.find(b => b.dataset.key == 'down').fire('click')
  const mob_dim_sent = got(page.body)
  focus(editor)
  viewport.height = 464
  viewport.fire('resize')
  const mob_kbd_bg = [bar_now.hidden, bg_now.hidden]
  viewport.height = 800
  viewport.fire('resize')
  blur()
  const mob_back_bg = [bar_now.hidden, bg_now.hidden, bg_now.className]
  v2('_on_search("#map/a")')
  const mob_all = states_mobile()
  // each item change restarts the 150 ms task wait so a burst is looked at once quiet (deleting #map/b dims left/right)
  log.length = 0
  open.items = open.items.filter(it => it.label != '#map/b')
  v2('_on_item_change("x1", "#map/b", "#map/b", true, false, false)')
  v2('_on_item_change("x2", "#map/c", "#map/c", false, false, false)')
  v2('_on_item_change("x3", "#map/d", "#map/d", false, false, true)') // dependency-only: ignored
  const burst = [log.filter(e => e == 'task key_buttons_nav').length, tasks.key_buttons_nav.delay, states_mobile()]
  tasks.key_buttons_nav.fn()
  const after_burst = states_mobile()
  // empty box dims all four arrows while desktop keeps the strip shown (non-arrows untouched) and keeps
  // the split desktop backdrop; item change while empty schedules no task
  pointer.matches = false
  pointer.fire('change')
  v2('_on_search("")')
  log.length = 0
  v2('_on_item_change("x4", "#map/z", "", false, false, false)')
  const non_arrows_empty = non_arrows_desktop()
  const empty_state = [states_desktop(), states_mobile(), bg_now.hidden, bg_now.className, log.length]
  // _labels fast path: narrows to root tree without wrapping unrelated roots
  const by_id = { m0: { id: 'm0', label: '#map', ancestors: [] }, m1: { id: 'm1', label: '#map/a', ancestors: ['#map'] }, o0: { id: 'o0', label: '#other', ancestors: [] } }
  const orig_items = { ...items }
  Object.assign(items, { '#map': by_id.m0, '#map/a': by_id.m1, m0: by_id.m0, m1: by_id.m1, o0: by_id.o0 })
  const wrapped = []
  win._labels = fn => {
    for (const [lbl, ids] of [['#map', ['m0']], ['#map/a', ['m1']], ['#other', ['o0']]]) {
      fn(lbl, ids)
    }
    return []
  }
  const orig_item_ref = items.o0
  Object.defineProperty(items, 'o0', { get() { wrapped.push('o0'); return orig_item_ref }, configurable: true })
  v2('_on_search("#map")')
  const via_labels = [states_mobile(), wrapped.length]
  delete win._labels
  for (const k of Object.keys(items)) if (!(k in orig_items)) delete items[k]
  // initial welcome/reconcile before any _on_search reads textarea-mindbox (stripping ZWSPs);
  // with reload_button off, the desktop strip and split desktop backdrop keep their shape
  open.items = map_tree.map(it => ({ ...it }))
  open.fields['textarea-mindbox'] = { value: '#map\u200B/a ' }
  const v3 = evaluation(3, 'keys-id', tasks, turned('reload_button', false))
  v3('_on_item_change("keys-id")')
  const [v3_bg, v3_strip] = [parts('backdrop')[0], parts('nav-strip')[0]]
  const from_box = [v3_bg.hidden, v3_bg.className, v3_strip.children.map(b => b.className ?? ''), v3_strip.style]
  delete open.fields['textarea-mindbox']
  open.items = []
  win.innerWidth = 390
  v2('_on_item_change("keys-id")')
  pointer.matches = true
  pointer.fire('change')
  page.body.got.length = 0
  // editing guard on the desktop strip: window.__items (and _items fallback) blocks the four arrows
  // and create while any item is open for editing (even while saving), taking each click without
  // sending; top and back still dispatch through key_buttons_target (editor, MindBox, or body) while
  // an item is open for editing; once closed, arrows and create resume on body
  pointer.matches = false
  pointer.fire('change')
  const live_strip = parts('nav-strip')[0]
  const live_btn = name => live_strip.children.find(b => b.dataset.key == name)
  win.__items = [{ id: 'e1', editing: true, saving: true }]
  focus(editor)
  page.body.got.length = editor.got.length = box.got.length = 0
  const edit_clicks = ['left', 'up', 'down', 'right', 'create'].map(name => {
    const ev = live_btn(name).fire('click')
    return [name, ev.prevented, ev.stopped]
  })
  const edit_blocked = [got(page.body), got(editor), edit_clicks, v2('key_buttons_any_editing(window)')]
  const edit_scroll_editor = ['top', 'back'].map(name => {
    page.body.got.length = editor.got.length = 0
    const ev = live_btn(name).fire('click')
    return [name, got(page.body), got(editor), ev.prevented, ev.stopped]
  })
  focus(box)
  const edit_scroll_box = ['top', 'back'].map(name => {
    page.body.got.length = box.got.length = 0
    const ev = live_btn(name).fire('click')
    return [name, got(page.body), got(box), ev.prevented, ev.stopped]
  })
  blur()
  const edit_scroll_body = ['top', 'back'].map(name => {
    page.body.got.length = 0
    const ev = live_btn(name).fire('click')
    return [name, got(page.body), ev.prevented, ev.stopped]
  })
  win.__items = [{ id: 'e1', editing: false, saving: false }]
  const after_edit = [v2('key_buttons_any_editing(window)'), ['top', 'back', 'create', 'up'].map(name => {
    page.body.got.length = 0
    const ev = live_btn(name).fire('click')
    return [name, ev.stopped, got(page.body)]
  })]
  delete win.__items
  open.items = [{ id: 'e2', editing: true }]
  const fallback_editing = v2('key_buttons_any_editing(window)')
  open.items = []
  const fallback_clean = v2('key_buttons_any_editing(window)')
  // key_buttons_read_nav reads danglingTags from window.__item(id)
  const raw_d = { p0: { id: 'p0', danglingTags: ['#d/later'] } }
  const d_wrap = { id: 'p0', label: '#d', ancestors: [], tags_visible: ['#d', '#d/later'] }
  win.__item = id => raw_d[id] ?? null
  open.items = [d_wrap]
  const read_dangling = v2('key_buttons_read_nav("#d")')
  raw_d.p0.danglingTags = []
  const read_live = v2('key_buttons_read_nav("#d")')
  delete win.__item
  // desktop strip editing dim: while any item is open for editing, the four arrows and create carry
  // `dim` while top and back stay plain; closing restores each to its target/plain look via focus,
  // item-change (including on an empty box without scheduling a nav task), the 15 s tick and the
  // 200 ms ticker; the phone's main row (`bar`) is untouched by an open edit
  open.items = map_tree.map(it => ({ ...it }))
  pointer.matches = false
  pointer.fire('change')
  const strip_classes = () => live_strip.children.map(b => [b.dataset.key, b.className ?? ''])
  const bar_now_edit = parts('bar')[0]
  const bar_classes = () => bar_now_edit.children.map(b => [b.dataset.key, b.className ?? ''])
  v2('_on_search("#map/a")')
  const dim_idle = strip_classes()
  win.__items = [{ id: 'e1', editing: true }]
  focus(editor)
  const dim_while_editing = strip_classes()
  v2('_on_search("#map")') // target updates while still editing: all five stay dimmed
  const dim_search_while_editing = strip_classes()
  win.__items = [{ id: 'e1', editing: false }]
  blur() // focusout -> 150 ms focus task -> restores target (#map: down valid, others dim, create plain)
  const dim_after_blur = strip_classes()
  // empty box + _on_item_change: restores create without scheduling a key_buttons_nav task
  v2('_on_search("")')
  win.__items = [{ id: 'e1', editing: true }]
  focus(editor)
  const dim_empty_editing = strip_classes()
  win.__items = [{ id: 'e1', editing: false }]
  log.length = 0
  v2('_on_item_change("e1", "", "", false, false, false)')
  const dim_empty_after_item_change = [strip_classes(), log.length]
  // 15 s item task tick reconciles editing open and close with no focus/item-change events
  blur()
  v2('_on_search("#map/a")')
  win.__items = [{ id: 'e1', editing: true }]
  tasks.key_buttons.fn()
  const dim_via_task_open = strip_classes()
  win.__items = [{ id: 'e1', editing: false }]
  tasks.key_buttons.fn()
  const dim_via_task_close = strip_classes()
  // 200 ms ticker catches editing transitions with no focus/search/item-change events
  const tDoc = Object.assign(new FakeNode('document'), {
    head: new FakeNode('head'),
    body: new FakeNode('body'),
    activeElement: null,
    visibilityState: 'visible',
    createElement: tag => new FakeNode(tag),
    createElementNS: (_, tag) => new FakeNode(tag),
  })
  const tWin = Object.assign(new FakeNode('window'), {
    innerWidth: 1000,
    innerHeight: 800,
    visualViewport: Object.assign(new FakeNode('viewport'), { width: 1000, height: 800, scale: 1, offsetLeft: 0, offsetTop: 0 }),
    matchMedia: () => Object.assign(new FakeNode('media'), { matches: false }),
    _items: () => map_tree.map(it => ({ ...it })),
    __items: [{ id: 'e1', editing: false }],
  })
  const tIntervals = []
  const tCtx = vm.createContext({
    _this: { id: 'keys-id', deephash: 40, dispatch_task(name, fn, delay, repeat) { return { name, fn, delay, repeat } } },
    _item: label => (label == '#key_buttons' ? { id: 'keys-id' } : null),
    document: tDoc,
    window: tWin,
    KeyboardEvent: FakeKey,
    Date: { now: () => clock.now },
    performance: { now: () => 10_000 },
    setInterval: (fn, ms) => { const h = { fn, ms, unref() {} }; tIntervals.push(h); return h },
    clearInterval: () => {},
  })
  vm.runInContext(code, tCtx)
  vm.runInContext('_on_welcome(); _on_search("#map/a")', tCtx)
  const tStrip = tDoc.body.children.find(n => n.dataset.keyButtons == 'nav-strip')
  const tClasses = () => tStrip.children.map(b => [b.dataset.key, b.className ?? ''])
  const dim_ticker_idle = tClasses()
  tWin.__items = [{ id: 'e1', editing: true }]
  tIntervals[0].fn()
  const dim_ticker_open = tClasses()
  tWin.__items = [{ id: 'e1', editing: false }]
  tIntervals[0].fn()
  const dim_ticker_close = tClasses()
  tWin._key_buttons.dispose()
  // phone's main row (`bar`) is untouched by an open edit and still dispatches directly to the focused editor
  pointer.matches = true
  pointer.fire('change')
  win.__items = [{ id: 'e1', editing: true }]
  focus(editor)
  const phone_bar_while_editing = bar_classes()
  page.body.got.length = editor.got.length = 0
  bar_now_edit.children.find(b => b.dataset.key == 'left').fire('click')
  bar_now_edit.children.find(b => b.dataset.key == 'create').fire('click')
  const phone_bar_sent_while_editing = [got(page.body), got(editor)]
  delete win.__items
  open.items = []
  blur()
  page.body.got.length = editor.got.length = box.got.length = 0
  log.length = 0
  check('desktop strip: seven buttons in order with group leads, arrows alone lit or dimmed (top, back and create never carry valid or dim), reload carries desktop class on a keyboard device and none on a phone',
    [strip_order_leads, non_arrows_all, non_arrows_down, non_arrows_empty, reload_desktop_cls, reload_phone_cls],
    [[['top', '1'], ['back', null], ['left', '1'], ['up', null], ['down', null], ['right', null], ['create', '1']],
      [['top', ''], ['back', ''], ['create', '']],
      [['top', ''], ['back', ''], ['create', '']],
      [['top', ''], ['back', ''], ['create', '']],
      'key-buttons-reload desktop',
      'key-buttons-reload'])
  check('desktop strip clicks & editing guard: top and back dispatch via key_buttons_target even while an item is editing (editor, MindBox, body); arrows and create dispatch from body and send nothing while any item is editing (including saving), resuming once closed; falls back to _items when __items absent, and read_nav honors __item(id).danglingTags',
    [v2('[...KEY_BUTTONS_SCROLL_NAMES]'), strip_action_clicks, edit_blocked, edit_scroll_editor, edit_scroll_box, edit_scroll_body, after_edit, fallback_editing, fallback_clean, read_dangling, read_live],
    [['top', 'back'],
      [['top', [], told(events('top')), 1, 1], ['back', [], told(events('back')), 1, 1], ['create', told(events('create')), [], 1, 1]],
      [[], [], [['left', 1, 1], ['up', 1, 1], ['down', 1, 1], ['right', 1, 1], ['create', 1, 1]], true],
      [['top', [], told(events('top')), 1, 1], ['back', [], told(events('back')), 1, 1]],
      [['top', [], told(events('top')), 1, 1], ['back', [], told(events('back')), 1, 1]],
      [['top', told(events('top')), 1, 1], ['back', told(events('back')), 1, 1]],
      [false, [['top', 1, told(events('top'))], ['back', 1, told(events('back'))], ['create', 1, told(events('create'))], ['up', 1, told(events('up'))]]],
      true, false,
      { left: false, up: false, down: false, right: false },
      { left: false, up: false, down: true, right: false }])
  const strip_cls = (t, b, l, u, d, r, c) => [['top', t], ['back', b], ['left', l], ['up', u], ['down', d], ['right', r], ['create', c]]
  const bar_cls = (t, b, c, l, u, d, r) => [['top', t], ['back', b], ['create', c], ['left', l], ['up', u], ['down', d], ['right', r]]
  check('desktop strip editing dim: while any item is editing, the four arrows and create carry dim while top and back stay plain; closing restores arrows by target and create plain via focus, item-change (also on empty box), 15 s tick and 200 ms ticker; phone bar is untouched by an open edit',
    [dim_idle, dim_while_editing, dim_search_while_editing, dim_after_blur, dim_empty_editing, dim_empty_after_item_change, dim_via_task_open, dim_via_task_close, dim_ticker_idle, dim_ticker_open, dim_ticker_close, phone_bar_while_editing, phone_bar_sent_while_editing],
    [strip_cls('', '', 'valid', 'valid', 'valid', 'valid', ''),
      strip_cls('', '', 'dim', 'dim', 'dim', 'dim', 'dim'),
      strip_cls('', '', 'dim', 'dim', 'dim', 'dim', 'dim'),
      strip_cls('', '', 'dim', 'dim', 'valid', 'dim', ''),
      strip_cls('', '', 'dim', 'dim', 'dim', 'dim', 'dim'),
      [strip_cls('', '', 'dim', 'dim', 'dim', 'dim', ''), 0],
      strip_cls('', '', 'dim', 'dim', 'dim', 'dim', 'dim'),
      strip_cls('', '', 'valid', 'valid', 'valid', 'valid', ''),
      strip_cls('', '', 'valid', 'valid', 'valid', 'valid', ''),
      strip_cls('', '', 'dim', 'dim', 'dim', 'dim', 'dim'),
      strip_cls('', '', 'valid', 'valid', 'valid', 'valid', ''),
      bar_cls('', '', '', 'valid', 'valid', 'valid', 'valid'),
      [[], [...told(events('left')), ...told(events('create'))]]])
  const strip_expect = (l, u, d, r) => ({
    shown: true,
    reload: 'key-buttons-reload desktop',
    strip: [['top', '1', false, ''], ['back', null, false, ''], ['left', '1', false, l], ['up', null, false, u], ['down', null, false, d], ['right', null, false, r], ['create', '1', false, '']],
  })
  check('nav live: valid arrows green and invalid dim on mobile and desktop strip; desktop shows right piece at >= 480 px and merges below 480 px; dim arrows still dispatch on body even with MindBox focused; phone keeps full-width strip and hides it under keyboard; item changes restart 150 ms wait; empty schedules none; _labels skips other roots; reconcile reads textarea-mindbox (ZWSP stripped) and keeps shape without reload',
    [desk_all, desk_narrow, desk_wide, desk_down, sent_dim, desk_up, desk_up_horiz, mob_b, mob_dim_sent, mob_kbd_bg, mob_back_bg, mob_all, burst, after_burst, empty_state, via_labels, from_box],
    [[strip_expect('valid', 'valid', 'valid', 'valid'), false, 'key-buttons-bg desktop split'],
      'key-buttons-bg desktop',
      'key-buttons-bg desktop split',
      strip_expect('dim', 'dim', 'valid', 'dim'),
      [['keydown ArrowUp', 'keyup ArrowUp', 'keydown ArrowRight', 'keyup ArrowRight'], 0, 1, 1, 1, 1],
      strip_expect('dim', 'valid', 'dim', 'dim'),
      strip_expect('valid', 'valid', 'dim', 'valid'),
      [[['left', 'valid'], ['up', 'valid'], ['down', 'dim'], ['right', 'valid']], ['', '', ''], true, 'key-buttons-reload', false, 'key-buttons-bg'],
      ['keydown ArrowDown', 'keyup ArrowDown'],
      [true, true],
      [false, false, 'key-buttons-bg'],
      [['left', 'valid'], ['up', 'valid'], ['down', 'valid'], ['right', 'valid']],
      [2, 150, [['left', 'valid'], ['up', 'valid'], ['down', 'valid'], ['right', 'valid']]],
      [['left', 'dim'], ['up', 'valid'], ['down', 'valid'], ['right', 'dim']],
      [strip_expect('dim', 'dim', 'dim', 'dim'), [['left', 'dim'], ['up', 'dim'], ['down', 'dim'], ['right', 'dim']], false, 'key-buttons-bg desktop split', 0],
      [[['left', 'dim'], ['up', 'dim'], ['down', 'valid'], ['right', 'dim']], 0],
      [false, 'key-buttons-bg desktop split', ['', '', 'valid', 'valid', 'valid', 'valid', ''], {}]])
}
// ---- glass click rejection over the fake page: press-start gesture state, button rects, cancel, dispose ----
{
  const glass_events = ['mousedown', 'click', 'dblclick', 'auxclick', 'contextmenu', 'pointerdown', 'touchstart', 'touchend', 'pointerup', 'pointercancel', 'touchcancel']
  const counts = () => glass_events.map(t => (page.listeners[t] ?? []).length)
  const no_scroll_listeners = [(page.listeners.wheel ?? []).length, (page.listeners.touchmove ?? []).length]
  const prev_pointer = pointer.matches
  win.innerWidth = 1000
  win.innerHeight = 600
  pointer.matches = false
  viewport.fire('resize')
  const under = new FakeNode('div')
  const nav_strip_el = parts('nav-strip')[0]
  const left_btn = nav_strip_el.children.find(b => b.dataset.key == 'left')
  const up_btn = nav_strip_el.children.find(b => b.dataset.key == 'up')
  // real bounding rects on vw=1000, vh=600 (right glass piece x 660..1000, dy 0..44 => y 556..600;
  // buttons bottom 10..34 => y 566..590, centre dy=22):
  // back 704..728, 18 px group gap 728..746 (midpoint x=737), left 746..770 (centre x=758),
  // 6 px button gap 770..776 (midpoint x=773), up 776..800 (centre x=788), ..., sparkle 962..986 (centre x=974)
  left_btn.getBoundingClientRect = () => ({ left: 746, right: 770, top: 566, bottom: 590, width: 24, height: 24 })
  up_btn.getBoundingClientRect = () => ({ left: 776, right: 800, top: 566, bottom: 590, width: 24, height: 24 })
  const sparkle_el = Object.assign(new FakeNode('button'), { className: 'vault-sparkle' })
  // the sparkle's own box on this page (24 px, right 14, bottom 10): x 962..986, y 566..590
  sparkle_el.getBoundingClientRect = () => ({ left: 962, right: 986, top: 566, bottom: 590, width: 24, height: 24 })
  const menu_el = Object.assign(new FakeNode('div'), { className: 'vault-sparkle-menu' })
  const menu_item = menu_el.appendChild(new FakeNode('button')) // a press on it is the menu's, by its ancestor
  const fire_doc = (type, target, x, dy, more = {}) => {
    const touch = type == 'touchstart' || type == 'touchend' || type == 'touchcancel'
    const coords = touch
      ? { touches: type == 'touchend' ? [] : [{ clientX: x, clientY: 600 - dy }], changedTouches: [{ clientX: x, clientY: 600 - dy }] }
      : { clientX: x, clientY: 600 - dy }
    const ev = page.fire(type, { target, ...coords, ...more })
    return [ev.prevented, ev.stopped]
  }
  // 1. Mouse press starting on bare glass in the 18 px group gap between back and left (x=737, dy=22)
  //    blocks the entire gesture (mousedown..contextmenu)
  const on_glass = [
    fire_doc('pointerdown', under, 737, 22, { pointerType: 'mouse', isPrimary: true }),
    fire_doc('mousedown', under, 737, 22),
    fire_doc('pointerup', under, 737, 22, { pointerType: 'mouse', isPrimary: true }),
    fire_doc('click', under, 737, 22, { detail: 1, pointerType: 'mouse' }),
    fire_doc('dblclick', under, 737, 22, { detail: 2 }),
    fire_doc('auxclick', under, 737, 22, { detail: 1 }),
    fire_doc('contextmenu', under, 737, 22),
  ]
  // 2. Desktop edge crossing across the 44 px top edge of the right piece (at x=737, back..left gap):
  //    press on glass at dy=43, release off glass at dy=45 still blocks click;
  //    reverse (press off glass at dy=45, release on glass at dy=43) delivers both mousedown and click
  const edge_in_to_out = [
    fire_doc('pointerdown', under, 737, 43, { pointerType: 'mouse', isPrimary: true }),
    fire_doc('mousedown', under, 737, 43),
    fire_doc('pointerup', under, 737, 45, { pointerType: 'mouse', isPrimary: true }),
    fire_doc('click', under, 737, 45, { detail: 1, pointerType: 'mouse' }),
  ]
  const edge_out_to_in = [
    fire_doc('pointerdown', under, 737, 45, { pointerType: 'mouse', isPrimary: true }),
    fire_doc('mousedown', under, 737, 45),
    fire_doc('pointerup', under, 737, 43, { pointerType: 'mouse', isPrimary: true }),
    fire_doc('click', under, 737, 43, { detail: 1, pointerType: 'mouse' }),
  ]
  // 3. Touch gap retargeting: tap in the 6 px gap between left and up (x=773, dy=22) with target snapped
  //    to up_btn, and compatibility mousedown/click snapped to up_btn's centre (x=788, dy=22): all blocked
  //    and button does not fire
  page.body.got.length = 0
  const touch_gap = [
    fire_doc('pointerdown', up_btn, 773, 22, { pointerType: 'touch', isPrimary: true }),
    fire_doc('touchstart', up_btn, 773, 22),
    fire_doc('pointerup', up_btn, 773, 22, { pointerType: 'touch', isPrimary: true }),
    fire_doc('touchend', up_btn, 773, 22),
    fire_doc('mousedown', up_btn, 788, 22),
    fire_doc('click', up_btn, 788, 22, { detail: 1, pointerType: 'touch' }),
  ]
  up_btn.fire('click', { detail: 1, pointerType: 'touch' }) // even if reached directly, own_click_ok rejects it
  const touch_gap_keys = got(page.body)
  // 4. Touch inside left_btn rect (centre x=758, dy=22): not rejected, and left_btn fires (while up_btn does not)
  const touch_btn = [
    fire_doc('pointerdown', left_btn, 758, 22, { pointerType: 'touch', isPrimary: true }),
    fire_doc('touchstart', left_btn, 758, 22),
    fire_doc('pointerup', left_btn, 758, 22, { pointerType: 'touch', isPrimary: true }),
    fire_doc('touchend', left_btn, 758, 22),
    fire_doc('mousedown', left_btn, 758, 22),
    fire_doc('click', left_btn, 758, 22, { detail: 1, pointerType: 'touch' }),
  ]
  up_btn.fire('click', { detail: 1, pointerType: 'touch' }) // wrong button: must not fire
  left_btn.fire('click', { detail: 1, pointerType: 'touch' }) // started inside left_btn: fires!
  const touch_btn_keys = got(page.body)
  page.body.got.length = 0
  // 5. Cancelled gesture (scroll begins on bare glass in back..left gap x=737, dy=22 -> pointercancel)
  //    resets state so next independent click off glass (x=737, dy=45) passes
  fire_doc('pointerdown', under, 737, 22, { pointerType: 'touch', isPrimary: true })
  const cancel_touchstart = fire_doc('touchstart', under, 737, 22)
  fire_doc('pointercancel', under, 0, 600, { pointerType: 'touch', isPrimary: true })
  const after_cancel_click = fire_doc('click', under, 737, 45, { detail: 1 })
  // 6. Bare glass under the sparkle's place (x=974, dy=22) is rejected whether a sparkle shows or not;
  //    bare page target inside left_btn's square box (x=758, dy=22, outside the circle) is rejected;
  //    bypasses: old lower-left place (x=20, dy=22), left of the piece on its shadow (x=655, dy=22),
  //    above the row on its shadow (x=737, dy=48), own button rect (left_btn at x=758, dy=22),
  //    #vault sparkle (x=974, dy=22), and #vault menu over the right glass piece (x=737, dy=22),
  //    the menu itself and a button inside it
  fire_doc('pointerdown', under, 974, 22, { pointerType: 'mouse', isPrimary: true })
  const on_sparkle_glass = fire_doc('click', under, 974, 22, { detail: 1, pointerType: 'mouse' })
  fire_doc('pointerdown', under, 758, 22, { pointerType: 'mouse', isPrimary: true })
  const corner_glass = fire_doc('click', under, 758, 22, { detail: 1, pointerType: 'mouse' })
  const click_gesture = (target, x, dy) => {
    fire_doc('pointerdown', target, x, dy, { pointerType: 'mouse', isPrimary: true })
    fire_doc('pointerup', target, x, dy, { pointerType: 'mouse', isPrimary: true })
    return fire_doc('click', target, x, dy, { detail: 1, pointerType: 'mouse' })
  }
  const bypasses = [
    click_gesture(under, 20, 22), // old lower-left place: no glass there now
    click_gesture(under, 655, 22), // left of the right piece (on outer shadow)
    click_gesture(under, 737, 48), // above the row (on outer shadow)
    click_gesture(left_btn, 758, 22), // inside own button rect (left_btn centre)
    click_gesture(sparkle_el, 974, 22), // #vault sparkle over the right glass piece
    click_gesture(menu_el, 737, 22), // #vault menu over the right glass piece
    click_gesture(menu_item, 737, 22), // a button inside that menu
  ]
  // 7. A touch in the gap beside the sparkle that the browser adjusts onto it (x=961, one pixel
  //    left of its box 962..986, over the right glass piece, dy=22) is a press on the glass, as a
  //    tap between two buttons is: its events are stopped, and the compatibility mousedown and
  //    click prevented too; only its pointerup passes (the release is recorded, nothing more).
  //    A tap at the sparkle's centre (x=974, dy=22) is the sparkle's
  const touch_tap = (target, x, mx) => [
    fire_doc('pointerdown', target, x, 22, { pointerType: 'touch', isPrimary: true }),
    fire_doc('touchstart', target, x, 22),
    fire_doc('pointerup', target, x, 22, { pointerType: 'touch', isPrimary: true }),
    fire_doc('touchend', target, x, 22),
    fire_doc('mousedown', target, mx, 22),
    fire_doc('click', target, mx, 22, { detail: 1, pointerType: 'touch' }),
  ]
  const sparkle_gap = touch_tap(sparkle_el, 961, 974)
  const sparkle_centre = touch_tap(sparkle_el, 974, 974)
  // 8. Events made by code (`isTrusted` false, no `detail`: the app's keyboard shortcuts toggle and
  //    navigate through clicks and mousedowns they dispatch) pass after a rejected physical press
  //    in the back..left gap (x=737, dy=22) and leave its record alone: that press's own late click
  //    is still stopped, and the next real press above the glass (x=737, dy=65) is judged afresh.
  //    After a rejected touch that brings no mouse events of its own, a mousedown made by code is
  //    not taken for that touch's. An own button's click made by code fires whatever the last press was
  click_gesture(under, 737, 22)
  const by_code = [
    fire_doc('click', under, 0, 600, { isTrusted: false }),
    fire_doc('click', under, 0, 600, { isTrusted: false }),
    fire_doc('mousedown', under, 0, 600, { isTrusted: false }),
  ]
  const late_click = fire_doc('click', under, 737, 22, { detail: 1, pointerType: 'mouse' })
  const next_press = click_gesture(under, 737, 65) // above the row, off glass
  fire_doc('pointerdown', under, 737, 22, { pointerType: 'touch', isPrimary: true })
  fire_doc('touchstart', under, 737, 22)
  fire_doc('pointerup', under, 737, 22, { pointerType: 'touch', isPrimary: true })
  fire_doc('touchend', under, 737, 22)
  const code_mousedown_after_touch = fire_doc('mousedown', under, 0, 600, { isTrusted: false })
  page.body.got.length = 0
  left_btn.fire('click', { isTrusted: false })
  const code_click_keys = got(page.body)
  page.body.got.length = 0
  win._modal_visible = () => true
  const under_modal = click_gesture(under, 737, 22)
  delete win._modal_visible
  delete left_btn.getBoundingClientRect
  delete up_btn.getBoundingClientRect
  const before_dispose = counts()
  log.length = 0
  items['#key_buttons'] = { id: 'other-id' }
  v2('_on_item_change("keys-id")')
  const after_dispose = counts()
  check('glass rejection: press-start decision blocks rejected gestures across mouse/touch/retargeted gap/edge crossing on the right piece, admits button rects/sparkle/menu/modal/lower-left/off-glass starts, resets on cancel, keeps wheel/touchmove unattached, and cleans up on dispose',
    [before_dispose, no_scroll_listeners, on_glass, edge_in_to_out, edge_out_to_in, touch_gap, touch_gap_keys, touch_btn, touch_btn_keys, cancel_touchstart, after_cancel_click, on_sparkle_glass, corner_glass, bypasses, under_modal, after_dispose],
    [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [0, 0],
      [[0, 1], [1, 1], [0, 0], [1, 1], [1, 1], [1, 1], [1, 1]],
      [[0, 1], [1, 1], [0, 0], [1, 1]],
      [[0, 0], [0, 0], [0, 0], [0, 0]],
      [[0, 1], [0, 1], [0, 0], [0, 1], [1, 1], [1, 1]],
      [],
      [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
      ['keydown ArrowLeft', 'keyup ArrowLeft'],
      [0, 1], [0, 0],
      [1, 1], [1, 1],
      [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
      [0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]])
  check('glass rejection: a touch the browser adjusts onto the sparkle from the gap beside it is a press on the glass; a tap inside its box is the sparkle\'s',
    [sparkle_gap, sparkle_centre],
    [[[0, 1], [0, 1], [0, 0], [0, 1], [1, 1], [1, 1]], [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]])
  check('glass rejection: events made by code pass after a rejected press and leave its record alone; an own button\'s click made by code fires',
    [by_code, late_click, next_press, code_mousedown_after_touch, code_click_keys],
    [[[0, 0], [0, 0], [0, 0]], [1, 1], [0, 0], [0, 0], ['keydown ArrowLeft', 'keyup ArrowLeft']])
  win.innerWidth = 390
  win.innerHeight = 800
  pointer.matches = prev_pointer
}
check('controller: the item renamed, its code kept, takes its rows and its button away', [log, parts('backdrop').length, parts('bar').length, parts('keyboard').length, parts('reload').length, parts('nav-strip').length, parts('nav-vertical').length, parts('nav-horizontal').length, parts('style').length, listening(), v2('typeof window._key_buttons')], [['-backdrop', '-bar', '-keyboard', '-reload', '-nav-strip', '-guests', '-style'], 0, 0, 0, 0, 0, 0, 0, 0, [0, 0, 0, 0, 0, 0], 'undefined'])
items['#key_buttons'] = { id: 'keys-id' }
v2('_on_item_change("keys-id")')
check('controller: named #key_buttons again it draws again', [parts('backdrop').length, parts('bar').length, parts('keyboard').length, parts('reload').length, parts('nav-strip').length, parts('nav-vertical').length, parts('nav-horizontal').length], [1, 1, 1, 1, 1, 0, 0])
log.length = 0
tasks.key_buttons._on_cancel() // the app, at the task's next run after the item's deletion
check('controller: the item\'s deletion removes the rows, their style and the listeners at the task\'s cancel, and its task then ends',
  [log, parts('backdrop').length, parts('bar').length, parts('reload').length, parts('nav-strip').length, listening(), tasks.key_buttons.fn()], [['-backdrop', '-bar', '-keyboard', '-reload', '-nav-strip', '-guests', '-style'], 0, 0, 0, 0, [0, 0, 0, 0, 0, 0], null])

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
  const seen = { rows: [parts('bar')[0].hidden, parts('keyboard')[0].hidden, parts('keyboard')[0].children.length], typed: [typed.prevented, got(editor)], scrolled: [...scrolled], look: 'key_buttons_caret' in own, reload: parts('reload').map(node => node.hidden), listening: listening() }
  run('window._key_buttons.dispose()')
  return seen
}
const whole = scene(code)
check('parts: as the table has them, the keyboard brings its row and Shift+Space is a Tab, and the caret\'s line is left where it is',
  whole, { rows: [true, false, 3], typed: [1, ['keydown Tab', 'keyup Tab']], scrolled: [], look: false, reload: [true], listening: [1, 1, 1, 1, 1, 1] })
check('parts: without the reload button none is drawn', scene(turned('reload_button', false)), { ...whole, reload: [] })
check('parts: without the keyboard\'s row nothing shows above the keyboard (the main row hides as before)', scene(turned('keyboard_row', false)), { ...whole, rows: [true, true, 0] })
check('parts: without Shift+Space the key is a space as typed, and nothing listens for it', scene(turned('shift_space_tab', false)), { ...whole, typed: [0, []], listening: [1, 1, 1, 0, 1, 1] })
check('parts: with the caret\'s scroll switched on, the keyboard\'s opening gets its one look and the covered line is scrolled clear', scene(turned('caret_clear', true)), { ...whole, scrolled: [[0, 308]], look: true })
check('parts: with the caret\'s scroll on and no row above the keyboard, the line is cleared of the keyboard alone',
  scene(turned('caret_clear', true).replace('  keyboard_row: true,', '  keyboard_row: false,')), { ...whole, rows: [true, true, 0], scrolled: [[0, 264]], look: true })
calm()

// ---- the item ----------------------------------------------------------------------------------
const prose = item.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
check('item: its label, its code as an embed of key_buttons.js, and the welcome and listener tags (app special tags only, so an install pulls in no other item)',
  [prose.match(/(?:^|\s)#[\w/]+/g).map(tag => tag.trim()), /\n```js_removed:key_buttons\.js\n\/\/ key_buttons\.js\n```\n/.test(item), /<</.test(item), /\n#_welcome #_listen\n$/.test(item)],
  [['#key_buttons', '#_welcome', '#_listen'], true, false, true])

// ---- a controller whose code is no longer the item's: the task retires it --------------------------
{
  calm()
  const own = {}
  const run = evaluation(5, 'keys-id', own)
  run('_on_welcome()')
  const kept = [own.key_buttons.fn(), parts('bar').length, listening()] // a tick with the item as it was
  run.item.deephash = 6 // the item's text saved without this code: no hook of it runs, and its hash is another
  log.length = 0
  const retired = [own.key_buttons.fn(), [...log], ['backdrop', 'bar', 'keyboard', 'reload', 'nav-strip', 'style'].map(kind => parts(kind).length), listening(), run('typeof window._key_buttons')]
  log.length = 0
  check('stale: the task keeps a controller whose code is still the item\'s; once the item\'s hash is another (its code removed, or the app\'s #_debug tag put on it: no hook says so) the next run retires it: the rows, the button, the style and every listener go, the task ends, and a later run does nothing',
    [kept, retired, own.key_buttons.fn(), log], [[undefined, 1, [1, 1, 1, 1, 1, 1]], [null, ['-backdrop', '-bar', '-keyboard', '-reload', '-nav-strip', '-guests', '-style'], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], 'undefined'], null, []])
  const theirs = {}
  const gone = evaluation(7, 'keys-id', theirs)
  gone('_on_welcome()')
  Object.defineProperty(gone.item, 'deephash', { get() { throw new Error('item keys-id is deleted') } })
  log.length = 0
  check('stale: a controller whose item can no longer be read (deleted, should the app not have cancelled its task) is retired the same way',
    [theirs.key_buttons.fn(), [...log], listening(), gone('typeof window._key_buttons')], [null, ['-backdrop', '-bar', '-keyboard', '-reload', '-nav-strip', '-guests', '-style'], [0, 0, 0, 0, 0, 0], 'undefined'])
  log.length = 0
}

;(async () => {
  // ---- the reload: the app's own where there is one, and a question before every reload where there is none
  calm()
  const own = {}
  const run = evaluation(11, 'keys-id', own)
  run('_on_welcome()')
  const again = parts('reload').at(-1)
  const settled = () => new Promise(resolve => setImmediate(resolve)) // the reload is the page's own promise
  const press = async () => { again.fire('click'); await settled() }
  reloads.length = asked.length = 0
  win._reload = () => { asked.push('the app\'s own reload'); return Promise.resolve(true) }
  await press()
  delete win._reload // the released app from here on: it has no reload of its own
  check('reload: where the app has a reload of its own, a press asks for that and for nothing else: the item puts no question and reloads nothing itself', [asked, reloads], [['the app\'s own reload'], []])
  const question = run('KEY_BUTTONS_RELOAD_QUESTION')
  // what an item's handles show of the app, in two states. A draft its owner has just KEPT (the item's close
  // button, then Cancel in the app's question about the discard): the app has copied the draft into the item's
  // text by then, so the item and its editor on the page agree, and nothing is being saved. And a page with
  // nothing open
  const kept = { items: [{ id: 'i1', text: 'the draft', saving: false, editing: true }], fields: { 'textarea-i1': { value: 'the draft' } } }
  const clean = { items: [], fields: {} }
  const tried = []
  for (const [state, answer] of [[kept, false], [kept, undefined], [kept, true], [clean, false], [clean, true]]) {
    Object.assign(open, state)
    dialog.answer = answer
    reloads.length = asked.length = 0
    await press()
    tried.push([[...asked], [...reloads]])
  }
  check('reload: on an app without one of its own every press asks first, in the app\'s dialog, whatever the page shows of its items (a draft kept after its discard was cancelled reads as clean there, as a clean page does): only a confirmed question reloads; a cancelled one, and one closed some other way, do not',
    [question, tried], ['Reload and discard any unsaved changes?', [[[question], []], [[question], []], [[question], ['page']], [[question], []], [[question], ['page']]]])
  let answer = () => {} // (until the question is put: a press that puts none leaves nothing to answer)
  dialog.answer = () => new Promise(resolve => (answer = resolve))
  Object.assign(open, kept)
  reloads.length = asked.length = 0
  again.fire('click')
  again.fire('click')
  await settled()
  const while_open = [asked.length, [...reloads]]
  answer(true)
  await settled()
  check('reload: while its question is open a second press puts no second one; confirmed, the page reloads once', [while_open, asked.length, reloads], [[1, []], 1, ['page']])
  reloads.length = asked.length = 0
  again.fire('click')
  await settled()
  run('window._key_buttons.dispose()')
  answer(true)
  await settled()
  check('reload: a controller that is gone by the time of the answer reloads nothing', [asked.length, reloads], [1, []])
  Object.assign(open, clean)

  // ---- guests' part of the bar: geom, glass hit-testing, inline vs second floor, busy & dropped --
  {
    const g0 = v1('key_buttons_backdrop_geom(KEY_BUTTONS_LOOK, 0)')
    const g4 = v1('key_buttons_backdrop_geom(KEY_BUTTONS_LOOK, 4)')
    const g6 = v1('key_buttons_backdrop_geom(KEY_BUTTONS_LOOK, 6)')
    const css6 = v1('key_buttons_css(KEY_BUTTONS_LOOK, 6)')
    const frame6 = v1('key_buttons_backdrop_frame(KEY_BUTTONS_LOOK, 6)')
    check('guests geom & css: guest group widens split w_piece by n*24 + (n-1)*6 + 18 while keeping narrow-gap @media keyed on own piece (339 px)',
      [
        [g0.w_guests, g0.w_piece],
        [g4.w_guests, g4.w_piece],
        [g6.w_guests, g6.w_piece],
        css6.includes(`@media (max-width: ${g0.w_piece - 1}px)`),
        css6.includes(`.key-buttons-guests { position: fixed; right: ${g0.w_piece - look.reload.left + look.group}px; bottom: ${look.reload.bottom}px;`),
        css6.includes(`.key-buttons-guests.floor { right: auto; left: ${look.reload.left}px; bottom: ${g0.h_row + look.reload.bottom}px }`),
        css6.includes(`.key-buttons-guests.floor.touch { left: ${touch_reload.left}px; bottom: ${look.size + 3 * look.bottom}px }`),
        css6.includes(`width: ${g6.w_piece}px; -webkit-clip-path: path('${g6.clip_split}')`),
        frame6.includes(`<path d="${g6.border_split}"`),
      ],
      [[0, 340], [132, 472], [192, 532], true, true, true, true, true, true])
    // third parameter `strip`: defaults to merge (480); widens narrow, strip paths, CSS clip, and frame SVG
    const gStripDef = v1('key_buttons_backdrop_geom(KEY_BUTTONS_LOOK, 0)')
    const gStripSmall = v1('key_buttons_backdrop_geom(KEY_BUTTONS_LOOK, 0, 400)')
    const gStrip532 = v1('key_buttons_backdrop_geom(KEY_BUTTONS_LOOK, 0, 532)')
    const cssStripDef = v1('key_buttons_css(KEY_BUTTONS_LOOK, 0)')
    const cssStrip532 = v1('key_buttons_css(KEY_BUTTONS_LOOK, 0, 532)')
    const frameStripDef = v1('key_buttons_backdrop_frame(KEY_BUTTONS_LOOK, 0)')
    const frameStrip532 = v1('key_buttons_backdrop_frame(KEY_BUTTONS_LOOK, 0, 532)')
    check('guests strip geom & frame: third parameter strip widens narrow, clip/shape/border strip paths, CSS clip, and frame strip SVG past merge (480 default)',
      [
        [gStripDef.narrow, gStripDef.clip_strip, gStripDef.shape_strip, gStripDef.border_strip],
        gStripSmall.narrow,
        [gStrip532.narrow, gStrip532.clip_strip, gStrip532.shape_strip, gStrip532.border_strip],
        cssStripDef.includes(`clip-path: path('${gStripDef.clip_strip}')`),
        cssStrip532.includes(`-webkit-clip-path: path('${gStrip532.clip_strip}'); clip-path: path('${gStrip532.clip_strip}')`),
        [
          frameStripDef.includes('<mask id="key-buttons-bg-out-strip" maskUnits="userSpaceOnUse" x="0" y="0" width="480"'),
          frameStripDef.includes(`<path d="${gStripDef.shape_strip}"`),
          frameStripDef.includes(`<path d="${gStripDef.border_strip}"`),
        ],
        [
          frameStrip532.includes('<mask id="key-buttons-bg-out-strip" maskUnits="userSpaceOnUse" x="0" y="0" width="532"'),
          frameStrip532.includes(`<path d="${gStrip532.shape_strip}"`),
          frameStrip532.includes(`<path d="${gStrip532.border_strip}"`),
        ],
      ],
      [
        [480, 'M 0 0 H 480 V 44 H 0 Z', 'M -36 36 H 516 V 116 H -36 Z', 'M 0 36.5 H 480'],
        480,
        [532, 'M 0 0 H 532 V 44 H 0 Z', 'M -36 36 H 568 V 116 H -36 Z', 'M 0 36.5 H 532'],
        true,
        true,
        [true, true, true],
        [true, true, true],
      ])
    const in_glass = (x, y, vw, vh, mode, guests, floor) =>
      v1('key_buttons_in_glass(__args.x, __args.y, __args.vw, __args.vh, __args.mode, false, KEY_BUTTONS_LOOK, __args.guests, __args.floor)', { x, y, vw, vh, mode, guests, floor })
    // vw=1000, vh=600: with 6 guests split extends from x=1000-532=468..1000 (without guests 660..1000);
    // second floor width=202 covers x<=202, dy in (44, 88] => y in [512, 556)
    check('guests in_glass: split piece includes guest extension (and group gap) only when guests > 0; second floor covers x<=floor, row < dy <= 2*row on desktop-strip and mobile',
      [
        in_glass(500, 578, 1000, 600, 'desktop-split', 0, 0),
        in_glass(500, 578, 1000, 600, 'desktop-split', 6, 0),
        in_glass(460, 578, 1000, 600, 'desktop-split', 6, 0),
        in_glass(100, 530, 500, 600, 'desktop-strip', 0, 0),
        in_glass(100, 530, 500, 600, 'desktop-strip', 0, 202),
        in_glass(203, 530, 500, 600, 'desktop-strip', 0, 202),
        in_glass(100, 511, 500, 600, 'desktop-strip', 0, 202),
        in_glass(100, 530, 390, 844, 'mobile', 0, 242),
        in_glass(243, 530, 390, 844, 'mobile', 0, 242),
        in_glass(100, 755, 390, 844, 'mobile', 0, 242), // dy=89 > 88
        in_glass(100, 756, 390, 844, 'mobile', 0, 242), // dy=88 <= 88
      ],
      [false, true, false, false, true, false, false, false, false, false, true])
    // second floor's rounded top-right corner (radius = look.reload.size / 2 = 12):
    // outer sliver is no glass, inside the arc and elsewhere on the floor are glass (desktop and phone)
    check('guests in_glass corner: second floor excludes the 12 px outer sliver of its top-right corner and includes points inside the arc and elsewhere on desktop and phone',
      [
        // desktop floor: vw=500, vh=600, floor=202, row=44, 2*row=88 -> arc centre (190, dy=76 -> y=524)
        in_glass(201, 513, 500, 600, 'desktop-strip', 0, 202), // outer sliver (11^2 + 11^2 = 242 > 144)
        in_glass(199, 515, 500, 600, 'desktop-strip', 0, 202), // outer sliver (9^2 + 9^2 = 162 > 144)
        in_glass(198, 516, 500, 600, 'desktop-strip', 0, 202), // inside arc (8^2 + 8^2 = 128 <= 144)
        in_glass(190, 512, 500, 600, 'desktop-strip', 0, 202), // arc top tangent
        in_glass(10, 513, 500, 600, 'desktop-strip', 0, 202),  // top-left of floor (unrounded)
        in_glass(100, 530, 500, 600, 'desktop-strip', 0, 202), // interior of floor
        // phone floor: vw=390, vh=844, floor=242, row=44, 2*row=88 -> arc centre (230, dy=76 -> y=768)
        in_glass(241, 757, 390, 844, 'mobile', 0, 242),        // outer sliver (11^2 + 11^2 = 242 > 144)
        in_glass(239, 759, 390, 844, 'mobile', 0, 242),        // outer sliver (9^2 + 9^2 = 162 > 144)
        in_glass(238, 760, 390, 844, 'mobile', 0, 242),        // inside arc (8^2 + 8^2 = 128 <= 144)
        in_glass(230, 756, 390, 844, 'mobile', 0, 242),        // arc top tangent
        in_glass(5, 757, 390, 844, 'mobile', 0, 242),          // top-left of floor (unrounded)
        in_glass(100, 778, 390, 844, 'mobile', 0, 242),        // interior of floor
      ],
      [false, false, true, true, true, true, false, false, true, true, true, true])

    // controller lifecycle for guests, inline vs floor vs phone touch vs keyboard-up, busy & dropped
    calm()
    const gWarns = []
    const gErrors = []
    let perfNow = 1000
    const gOwn = {}
    const gContext = vm.createContext({
      _this: {
        id: 'keys-id', deephash: 20,
        dispatch_task(name, fn, delay, repeat) { gOwn[name]?._on_cancel?.(); return (gOwn[name] = { fn, delay, repeat }) },
      },
      _item: label => items[label] ?? null,
      document: page,
      window: win,
      KeyboardEvent: FakeKey,
      Date: { now: () => clock.now },
      performance: { now: () => perfNow },
      console: { warn: m => gWarns.push(m), error: m => gErrors.push(m) },
    })
    vm.runInContext(code, gContext)
    win.innerWidth = 1000
    win.innerHeight = 800
    pointer.matches = false
    let takenCalls = 0
    let resolveAsync
    let asyncPending = false
    const pressed = []
    const makeSpecs = (n = 6) =>
      Array.from({ length: n }, (_, i) => ({
        name: ['up', 'down', 'agent', 'done', 'snooze', 'cancel'][i] ?? 'g' + i,
        title: 'Title ' + i,
        icon: 'M0 0h10',
        box: i == 2 ? 24 : undefined,
        fill: i == 2,
        color: i == 4 ? '#fa4' : '#fff',
        press: () => {
          pressed.push(i)
          if (i == 0) {
            if (asyncPending) return undefined
            asyncPending = true
            return new Promise(r => (resolveAsync = () => { asyncPending = false; r() }))
          }
          if (i == 1) return Promise.reject(new Error('async boom'))
          if (i == 2) throw new Error('sync boom')
        },
      }))
    // hand over BEFORE controller draws: key_buttons_create() calls self.guest() on creation
    win._key_buttons_guests = { buttons: makeSpecs(6), taken: () => takenCalls++ }
    vm.runInContext('_on_welcome()', gContext)
    const ctrl = win._key_buttons
    const gEl = parts('guests')[0]
    const gBg = parts('backdrop')[0]
    const gFloor = gBg.children.find(c => c.className == 'key-buttons-bg-floor')
    const gStyle = parts('style')[0]
    const gFrame = gBg.children.find(c => c.className == 'key-buttons-bg-frame')
    const stripDraw = () => [
      ctrl.guest_strip,
      gStyle.textContent.match(/clip-path: path\('(M 0 0 H \d+ V 44 H 0 Z)'\)/)?.[1] ?? null,
      gFrame.innerHTML.match(/<path d="(M 0 36\.5 H \d+)"/)?.[1] ?? null,
      gFrame.innerHTML.match(/<mask id="key-buttons-bg-out-strip"[^>]*width="(\d+)"/)?.[1] ?? null,
    ]
    const built = gEl.children.map(b => [b.dataset.guest, b.className ?? '', b.style.color, b.title, b.attrs['aria-label'], b.children[0].attrs.viewBox])
    const wideState = [takenCalls, gEl.hidden, gEl.className, gBg.className, ctrl.guest_count, ctrl.guest_floor, gFloor.style]
    const stripWide = stripDraw()
    // narrow desktop between merge (480) and w_piece(6) (532): switches to desktop-strip + second floor
    win.innerWidth = 500
    viewport.fire('resize')
    const midNarrow = [gEl.hidden, gEl.className, gBg.className, ctrl.bg_mode, ctrl.guest_count, ctrl.guest_floor, { ...gFloor.style }]
    const strip500 = stripDraw()
    // narrow desktop below merge (430): stays on desktop floor, strip still drawn to 532
    win.innerWidth = 430
    viewport.fire('resize')
    const belowMerge = [gEl.hidden, gEl.className, gBg.className, ctrl.guest_floor]
    const strip430 = stripDraw()
    // phone touch (390): second floor with touch class, 32 px buttons lined up with touch reload (left 10 -> width 2*10 + 6*32 + 5*6 = 242)
    win.innerWidth = 390
    pointer.matches = true
    pointer.fire('change')
    const phoneFloor = [gEl.hidden, gEl.className, gBg.className, ctrl.bg_mode, ctrl.guest_floor, { ...gFloor.style }]
    const stripPhone = stripDraw()
    // on-screen keyboard up hides guests and backdrop
    focus(editor)
    viewport.height = 464
    viewport.fire('resize')
    const kbdHidden = [gEl.hidden, gBg.hidden, ctrl.guest_floor, { ...gFloor.style }]
    viewport.height = 800
    viewport.fire('resize')
    blur(gOwn)
    // back to wide desktop, test glass rejection on guest extension & second floor, busy class, and dropped warning
    const gUnder = new FakeNode('div')
    // phone floor glass (vw=390, vh=800, floor=242, row=44 -> dy=66 is y=734): x=100 inside floor rejected, x=260 outside passed
    const floorHit = [
      page.fire('pointerdown', { target: gUnder, clientX: 100, clientY: 734, pointerType: 'touch', isPrimary: true }).stopped,
      page.fire('pointerdown', { target: gUnder, clientX: 260, clientY: 734, pointerType: 'touch', isPrimary: true }).stopped,
    ]
    pointer.matches = false
    win.innerWidth = 1000
    pointer.fire('change')
    // wide desktop split with 6 guests (w_piece=532 -> x in [468, 1000], dy=22 -> y=778): x=500 in guest glass rejected, x=450 outside passed
    const extHit = [
      page.fire('pointerdown', { target: gUnder, clientX: 500, clientY: 778, pointerType: 'mouse', isPrimary: true }).stopped,
      page.fire('pointerdown', { target: gUnder, clientX: 450, clientY: 778, pointerType: 'mouse', isPrimary: true }).stopped,
    ]
    const b0 = gEl.children[0]
    const b1 = gEl.children[1]
    const b2 = gEl.children[2]
    b0.getBoundingClientRect = () => ({ left: 500, right: 524, top: 766, bottom: 790, width: 24, height: 24 })
    // tap started on bare glass beside b0 (x=495, y=778), click arrives on b0 -> rejected and warned
    page.fire('pointerdown', { target: b0, clientX: 495, clientY: 778, pointerType: 'touch', isPrimary: true })
    page.fire('pointerup', { target: b0, clientX: 495, clientY: 778, pointerType: 'touch', isPrimary: true })
    b0.fire('click', { detail: 1, pointerType: 'touch', timeStamp: 990 })
    const droppedWarn = [...gWarns]
    const pressedAfterDrop = [...pressed]
    // valid click on b0 (async promise): stays .busy until resolved
    page.fire('pointerdown', { target: b0, clientX: 512, clientY: 778, pointerType: 'mouse', isPrimary: true })
    page.fire('pointerup', { target: b0, clientX: 512, clientY: 778, pointerType: 'mouse', isPrimary: true })
    b0.fire('click', { detail: 1, pointerType: 'mouse', timeStamp: 990 })
    const busyWhilePending = b0.classList.contains('busy')
    resolveAsync()
    await settled()
    const busyAfterResolve = b0.classList.contains('busy')
    // overlapping second tap on b0 while first promise is pending returns at once: .busy stays lit
    // until the first promise resolves (counted per button)
    pressed.length = 0
    page.fire('pointerdown', { target: b0, clientX: 512, clientY: 778, pointerType: 'mouse', isPrimary: true })
    page.fire('pointerup', { target: b0, clientX: 512, clientY: 778, pointerType: 'mouse', isPrimary: true })
    b0.fire('click', { detail: 1, pointerType: 'mouse', timeStamp: 990 })
    const busyFirstTap = b0.classList.contains('busy')
    page.fire('pointerdown', { target: b0, clientX: 512, clientY: 778, pointerType: 'mouse', isPrimary: true })
    page.fire('pointerup', { target: b0, clientX: 512, clientY: 778, pointerType: 'mouse', isPrimary: true })
    b0.fire('click', { detail: 1, pointerType: 'mouse', timeStamp: 995 })
    await settled()
    const busyAfterSecondTap = b0.classList.contains('busy')
    resolveAsync()
    await settled()
    const busyAfterFirstDone = b0.classList.contains('busy')
    const overlappingPresses = [...pressed]
    // adjusted tap started on bare glass beside b0, dispatched through document capture first:
    // glass_block stops it before b0 sees it and logs one warning (also for its inner svg);
    // scrolling over glass (no click) and clicking bare glass outside any button stay quiet
    gWarns.length = 0
    pressed.length = 0
    page.fire('pointerdown', { target: b0, clientX: 495, clientY: 778, pointerType: 'touch', isPrimary: true })
    page.fire('touchstart', { target: b0, touches: [{ clientX: 495, clientY: 778 }] })
    page.fire('pointerup', { target: b0, clientX: 495, clientY: 778, pointerType: 'touch', isPrimary: true })
    page.fire('touchend', { target: b0, touches: [], changedTouches: [{ clientX: 495, clientY: 778 }] })
    const capBtn = page.fire('click', { target: b0, detail: 1, pointerType: 'touch', timeStamp: 990 })
    if (!capBtn.stopped) b0.fire('click', { detail: 1, pointerType: 'touch', timeStamp: 990 })
    const glassTapBtn = [capBtn.stopped, capBtn.prevented, [...pressed], [...gWarns]]
    gWarns.length = 0
    page.fire('pointerdown', { target: b0.children[0], clientX: 495, clientY: 778, pointerType: 'touch', isPrimary: true })
    page.fire('pointerup', { target: b0.children[0], clientX: 495, clientY: 778, pointerType: 'touch', isPrimary: true })
    const capSvg = page.fire('click', { target: b0.children[0], detail: 1, pointerType: 'touch', timeStamp: 990 })
    if (!capSvg.stopped) b0.fire('click', { detail: 1, pointerType: 'touch', timeStamp: 990 })
    const glassTapSvg = [capSvg.stopped, [...pressed], [...gWarns]]
    gWarns.length = 0
    page.fire('pointerdown', { target: gUnder, clientX: 495, clientY: 778, pointerType: 'touch', isPrimary: true })
    page.fire('touchstart', { target: gUnder, touches: [{ clientX: 495, clientY: 778 }] })
    page.fire('touchmove', { target: gUnder, touches: [{ clientX: 495, clientY: 740 }] })
    page.fire('pointercancel', { target: gUnder, pointerType: 'touch', isPrimary: true })
    page.fire('touchend', { target: gUnder, touches: [], changedTouches: [{ clientX: 495, clientY: 740 }] })
    const glassScroll = [[...pressed], [...gWarns]]
    gWarns.length = 0
    page.fire('pointerdown', { target: gUnder, clientX: 495, clientY: 778, pointerType: 'touch', isPrimary: true })
    page.fire('pointerup', { target: gUnder, clientX: 495, clientY: 778, pointerType: 'touch', isPrimary: true })
    const capBare = page.fire('click', { target: gUnder, detail: 1, pointerType: 'touch', timeStamp: 990 })
    const glassBareClick = [capBare.stopped, [...gWarns]]
    // valid synthetic clicks on b1 (rejects) and b2 (sync throws): both log console.error and clear .busy
    b1.fire('click', { isTrusted: false })
    b2.fire('click', { isTrusted: false })
    await settled()
    const errorsAfterFail = [b1.classList.contains('busy'), b2.classList.contains('busy'), [...gErrors]]
    // returning to 500 px raises guest_strip to 532 again; widening back to 1000 px (room for wider piece) resets to 0
    win.innerWidth = 500
    viewport.fire('resize')
    const stripBack500 = stripDraw()
    win.innerWidth = 1000
    viewport.fire('resize')
    const stripBackWide = stripDraw()
    // clearing guests while at 500 px (no floor stands) also resets guest_strip to 0
    win.innerWidth = 500
    viewport.fire('resize')
    win._key_buttons_guests = { buttons: [] }
    ctrl.guest()
    const stripCleared500 = stripDraw()
    // re-hand over at 1000 px so clearedState tests taken() error isolation on wide desktop
    win.innerWidth = 1000
    win._key_buttons_guests = { buttons: makeSpecs(6) }
    ctrl.guest()
    // taken() throwing is caught and logged; empty buttons hides guests
    gErrors.length = 0
    win._key_buttons_guests = { buttons: [], taken: () => { throw new Error('taken boom') } }
    ctrl.guest()
    const clearedState = [gEl.hidden, ctrl.guest_count, ctrl.guest_floor, gBg.className, [...gErrors]]
    ctrl.dispose()
    delete win._key_buttons_guests
    win.innerWidth = 390
    check('guests controller: builds guest buttons on welcome, places inline on wide desktop, moves to second floor when narrow (500 and 430) and on phone touch (width 242), hides under keyboard',
      [built.slice(0, 3), built[4], wideState, midNarrow, belowMerge, phoneFloor, kbdHidden],
      [
        [['up', '', '#fff', 'Title 0', 'Title 0', '0 0 16 16'], ['down', '', '#fff', 'Title 1', 'Title 1', '0 0 16 16'], ['agent', 'fill', '#fff', 'Title 2', 'Title 2', '0 0 24 24']],
        ['snooze', '', '#fa4', 'Title 4', 'Title 4', '0 0 16 16'],
        [1, false, 'key-buttons-guests', 'key-buttons-bg desktop split', 6, 0, { width: '', bottom: '', height: '' }],
        [false, 'key-buttons-guests floor', 'key-buttons-bg desktop floor', 'desktop-strip', 0, 202, { width: '202px', bottom: '44px', height: '44px' }],
        [false, 'key-buttons-guests floor', 'key-buttons-bg desktop floor', 202],
        [false, 'key-buttons-guests floor touch', 'key-buttons-bg floor', 'mobile', 242, { width: '242px', bottom: '44px', height: '44px' }],
        [true, true, 0, { width: '', bottom: '', height: '' }],
      ])
    const STRIP_480 = [0, 'M 0 0 H 480 V 44 H 0 Z', 'M 0 36.5 H 480', '480']
    const STRIP_532 = [532, 'M 0 0 H 532 V 44 H 0 Z', 'M 0 36.5 H 532', '532']
    check('guests controller strip: 500 px and 430 px desktop floors draw strip to w_piece (532) in guest_strip, stylesheet clip, and frame; resets to 0 (480) on mobile, wide desktop, or when floor clears',
      [stripWide, strip500, strip430, stripPhone, stripBack500, stripBackWide, stripCleared500],
      [STRIP_480, STRIP_532, STRIP_532, STRIP_480, STRIP_532, STRIP_480, STRIP_480])
    check('guests controller: rejects bare glass on guest extension and second floor, rejects click started off button with console.warn, keeps .busy until promise settles (resolve, reject, sync throw), logs press/taken errors, hides when cleared',
      [floorHit, extHit, droppedWarn, pressedAfterDrop, busyWhilePending, busyAfterResolve, errorsAfterFail, clearedState],
      [
        [1, 0],
        [1, 0],
        ['key buttons: a tap on "up" was not taken: it did not start on this button'],
        [],
        true,
        false,
        [false, false, ["key buttons: a guest button's press failed: Error: sync boom", "key buttons: a guest button's press failed: Error: async boom"]],
        [true, 0, 0, 'key-buttons-bg desktop split', ["key buttons: a guest's taken() failed: Error: taken boom"]],
      ])
    check('guests controller busy count: second tap returning immediately leaves .busy lit until first pending promise resolves',
      [busyFirstTap, busyAfterSecondTap, busyAfterFirstDone, overlappingPresses],
      [true, true, false, [0, 0]])
    check('guests controller glass capture: adjusted tap onto a button (or its svg) through document capture runs no press and logs one warning; scrolling over glass or clicking bare glass stays quiet',
      [glassTapBtn, glassTapSvg, glassScroll, glassBareClick],
      [
        [1, 1, [], ['key buttons: a tap on "up" was not taken: it began on the glass beside the button']],
        [1, [], ['key buttons: a tap on "up" was not taken: it began on the glass beside the button']],
        [[], []],
        [1, []],
      ])

    // ---- fixed-end guest buttons: placement, wider gap, widths with/without split, glass -------
    const gs = (n, split) => v1('key_buttons_backdrop_geom(KEY_BUTTONS_LOOK, __args.n, 0, __args.split)', { n, split })
    const css6Split = v1('key_buttons_css(KEY_BUTTONS_LOOK, 6, 0, true)')
    const frame6Split = v1('key_buttons_backdrop_frame(KEY_BUTTONS_LOOK, 6, 0, true)')
    const extraGap = look.group - look.gap // 18 - 6 = 12
    check('guests fixed geom & css: split widens w_guests and w_piece by group - gap (12 px) when guests > 1, leaves guests <= 1 or unsplit unchanged, and emits wide/floor order & gap CSS rules',
      [
        [0, 1, 2, 4, 6, 7].map(n => [gs(n, false).w_guests, gs(n, true).w_guests, gs(n, false).w_piece, gs(n, true).w_piece]),
        css6Split.includes(`width: ${gs(6, true).w_piece}px; -webkit-clip-path: path('${gs(6, true).clip_split}')`),
        frame6Split.includes(`<path d="${gs(6, true).border_split}"`),
        css6Split.includes(`.key-buttons-guests > button:not([data-fixed]) + button[data-fixed] { margin-left: ${extraGap}px }`),
        css6Split.includes('.key-buttons-guests.floor > button[data-fixed] { order: -1 }'),
        css6Split.includes('.key-buttons-guests.floor > button:not([data-fixed]) + button[data-fixed] { margin-left: 0 }'),
        css6Split.includes(`.key-buttons-guests.floor > button:not([data-fixed]) ~ button[data-fixed]:last-child { margin-right: ${extraGap}px }`),
      ],
      [
        [
          [0, 0, 340, 340],
          [42, 42, 382, 382],
          [72, 84, 412, 424],
          [132, 144, 472, 484],
          [192, 204, 532, 544],
          [222, 234, 562, 574],
        ],
        true,
        true,
        true,
        true,
        true,
        true,
      ])
    const in_glass_split = (x, y, vw, vh, mode, guests, floor, split) =>
      v1('key_buttons_in_glass(__args.x, __args.y, __args.vw, __args.vh, __args.mode, false, KEY_BUTTONS_LOOK, __args.guests, __args.floor, __args.split)', { x, y, vw, vh, mode, guests, floor, split })
    // vw=1000, vh=600, guests=6: split widens glass from rx<=532 (x>=468) to rx<=544 (x>=456);
    // top-left corner arc centre (rx=532, dy=32) => (x=468, y=568), radius 12
    check('guests fixed in_glass: split glass includes the extra 12 px extension and rounded corner on wide split, and widened floor on desktop/phone',
      [
        in_glass_split(460, 578, 1000, 600, 'desktop-split', 6, 0, false), // outside 532 without split
        in_glass_split(460, 578, 1000, 600, 'desktop-split', 6, 0, true),  // inside 544 with split
        in_glass_split(455, 578, 1000, 600, 'desktop-split', 6, 0, true),  // 1 px outside 544
        in_glass_split(457, 557, 1000, 600, 'desktop-split', 6, 0, true),  // outer corner sliver (11^2 + 11^2 > 144)
        in_glass_split(460, 560, 1000, 600, 'desktop-split', 6, 0, true),  // inside corner arc (8^2 + 8^2 <= 144)
        in_glass_split(208, 530, 500, 600, 'desktop-strip', 0, 214, false), // widened desktop floor (202 -> 214)
        in_glass_split(215, 530, 500, 600, 'desktop-strip', 0, 214, false), // 1 px outside desktop floor
        in_glass_split(248, 778, 390, 844, 'mobile', 0, 254, false),        // widened phone floor (242 -> 254)
        in_glass_split(255, 778, 390, 844, 'mobile', 0, 254, false),        // 1 px outside phone floor
      ],
      [false, true, false, false, true, true, false, true, false])

    // Controller tests with marked buttons: partitioning regardless of handed order, same-count split rebuild,
    // fixed-only / unmarked-only (no extra gap), mid-narrow threshold (538 px), phone floor width, and bare-glass capture on wider gap & edge
    calm()
    win.innerWidth = 1000
    win.innerHeight = 800
    pointer.matches = false
    gWarns.length = 0
    gErrors.length = 0
    const mkBtn = (name, fixed = false) => ({ name, title: name, icon: 'M0 0h10', color: '#fff', ...(fixed ? { fixed: true } : {}), press: () => {} })
    // start with 6 unmarked buttons (w_piece = 532)
    win._key_buttons_guests = { buttons: ['a', 'b', 'c', 'd', 'e', 'f'].map(n => mkBtn(n, false)) }
    vm.runInContext('_on_welcome()', gContext)
    const fCtrl = win._key_buttons
    const fEl = parts('guests')[0]
    const fBg = parts('backdrop')[0]
    const fFloor = fBg.children.find(c => c.className == 'key-buttons-bg-floor')
    const fStyle = parts('style')[0]
    const fFrame = fBg.children.find(c => c.className == 'key-buttons-bg-frame')
    const splitWidthOf = () => Number(fStyle.textContent.match(/\.key-buttons-bg\.desktop\.split > \.key-buttons-bg-pane \{ left: auto; right: 0; width: (\d+)px;/)?.[1] ?? 0)
    const stripWidthOf = () => Number(fStyle.textContent.match(/clip-path: path\('M 0 0 H (\d+) V 44 H 0 Z'\)/)?.[1] ?? 0)
    const unmarked6 = [fCtrl.guest_count, fCtrl.guest_split, splitWidthOf(), fEl.children.map(b => [b.dataset.guest, b.dataset.fixed ?? null, b.className ?? ''])]
    // same count (6), now with 2 marked handed interleaved/first -> bar places non-fixed first, fixed last, widens to 544
    win._key_buttons_guests = { buttons: [mkBtn('up', true), mkBtn('agent'), mkBtn('done'), mkBtn('down', true), mkBtn('snooze'), mkBtn('cancel')] }
    fCtrl.guest()
    const split6 = [
      fCtrl.guest_count,
      fCtrl.guest_split,
      splitWidthOf(),
      fFrame.innerHTML.includes(`H ${544 + 72}`),
      fEl.children.map(b => [b.dataset.guest, b.dataset.fixed ?? null, b.className ?? '']),
    ]
    // mid-narrow 538 px (between 532 and 544): split 6 goes to floor (width 214, strip 544); unmarked 6 fits inline!
    win.innerWidth = 538
    viewport.fire('resize')
    const splitAt538 = [fCtrl.bg_mode, fEl.className, fCtrl.guest_count, fCtrl.guest_split, fCtrl.guest_floor, fFloor.style.width, fCtrl.guest_strip, stripWidthOf()]
    win._key_buttons_guests = { buttons: ['a', 'b', 'c', 'd', 'e', 'f'].map(n => mkBtn(n, false)) }
    fCtrl.guest()
    const unmarkedAt538 = [fCtrl.bg_mode, fEl.className, fCtrl.guest_count, fCtrl.guest_split, fCtrl.guest_floor, fCtrl.guest_strip]
    // fixed-only (2 marked, 0 other) and unmarked-only (1 unmarked): split is false (no extra 12 px)
    win.innerWidth = 1000
    win._key_buttons_guests = { buttons: [mkBtn('up', true), mkBtn('down', true)] }
    fCtrl.guest()
    const fixedOnlyWide = [fCtrl.guest_count, fCtrl.guest_split, splitWidthOf()]
    win.innerWidth = 390
    pointer.matches = true
    viewport.fire('resize')
    const fixedOnlyPhone = [fEl.className, fCtrl.guest_floor, fFloor.style.width]
    // phone touch with 6 split buttons: floor width 254 (2*10 + 6*32 + 5*6 + 12)
    win._key_buttons_guests = { buttons: [mkBtn('agent'), mkBtn('done'), mkBtn('snooze'), mkBtn('cancel'), mkBtn('up', true), mkBtn('down', true)] }
    fCtrl.guest()
    const split6Phone = [fEl.className, fCtrl.guest_floor, fFloor.style.width]
    // glass capture on phone floor: wider gap between down [48..80] and agent [98..130] (x=89), extra edge (x=248), outside (x=260)
    const fUnder = new FakeNode('div')
    const fRectsPhone = { up: [10, 42], down: [48, 80], agent: [98, 130], done: [136, 168], snooze: [174, 206], cancel: [212, 244] }
    for (const b of fEl.children) {
      const [l, r] = fRectsPhone[b.dataset.guest]
      b.getBoundingClientRect = () => ({ left: l, right: r, top: 718, bottom: 750, width: 32, height: 32 })
    }
    const probeGlass = (x, y, target = fUnder) => {
      page.fire('pointerdown', { target, clientX: x, clientY: y, pointerType: 'mouse', isPrimary: true })
      const ev = page.fire('click', { target, detail: 1, pointerType: 'mouse' })
      page.fire('pointerup', { target, clientX: x, clientY: y, pointerType: 'mouse', isPrimary: true })
      return ev.stopped
    }
    const phoneGlassHits = [probeGlass(89, 734), probeGlass(248, 734), probeGlass(260, 734)]
    // glass capture on wide desktop (vw=1000, vh=800, 6 split -> w_piece=544, x in [456..1000]):
    // buttons right-aligned at right=344 (x=656): down [632..656], up [602..626], 18 px gap [584..602], cancel [560..584], ..., agent [470..494]
    pointer.matches = false
    win.innerWidth = 1000
    viewport.fire('resize')
    const fRectsWide = { agent: [470, 494], done: [500, 524], snooze: [530, 554], cancel: [560, 584], up: [602, 626], down: [632, 656] }
    for (const b of fEl.children) {
      const [l, r] = fRectsWide[b.dataset.guest]
      b.getBoundingClientRect = () => ({ left: l, right: r, top: 766, bottom: 790, width: 24, height: 24 })
    }
    const wideGlassHits = [
      probeGlass(593, 778), // middle of wider 18 px gap between cancel and up -> blocked
      probeGlass(460, 778), // leftmost widened 12 px edge (532 < rx=540 <= 544) -> blocked
      probeGlass(450, 778), // outside widened 544 px edge -> passes through
    ]
    // adjusted tap starting in the wider 18 px gap onto `up` is dropped with one warning
    gWarns.length = 0
    const upBtn = fEl.children.find(b => b.dataset.guest == 'up')
    const wideGapToUp = [probeGlass(593, 778, upBtn), [...gWarns]]
    fCtrl.dispose()
    delete win._key_buttons_guests
    win.innerWidth = 390
    check('guests fixed controller: partitions marked buttons last with data-fixed, widens split/floor/strip by 12 px only when split, flips at 538 px, and blocks bare glass in wider gap and edge',
      [unmarked6, split6, splitAt538, unmarkedAt538, fixedOnlyWide, fixedOnlyPhone, split6Phone, phoneGlassHits, wideGlassHits, wideGapToUp],
      [
        [6, false, 532, ['a', 'b', 'c', 'd', 'e', 'f'].map(n => [n, null, ''])],
        [6, true, 544, true, [['agent', null, ''], ['done', null, ''], ['snooze', null, ''], ['cancel', null, ''], ['up', '1', ''], ['down', '1', '']]],
        ['desktop-strip', 'key-buttons-guests floor', 0, false, 214, '214px', 544, 544],
        ['desktop-split', 'key-buttons-guests', 6, false, 0, 0],
        [2, false, 412],
        ['key-buttons-guests floor touch', 90, '90px'],
        ['key-buttons-guests floor touch', 254, '254px'],
        [1, 1, 0],
        [1, 1, 0],
        [1, ['key buttons: a tap on "up" was not taken: it began on the glass beside the button']],
      ])
  }

  // ---- timing diagnostics: thresholds, waited/slow_line/timed/down/dropped, and stuck ticker ----
  {
    const slow = v1('KEY_BUTTONS_SLOW')
    check('diagnostics table: thresholds for waited (300 ms), work (1000 ms), stuck (1000 ms) and tick (200 ms)',
      slow, { waited: 300, work: 1000, stuck: 1000, tick: 200 })
    const waited = (e, now) => v1('key_buttons_waited(__args.e, __args.now)', { e, now })
    clock.now = 1_700_000_000_500
    check('diagnostics waited: computes rounded ms for perf stamps and epoch (>1e12) stamps, null for invalid/zero/negative/future stamps',
      [
        waited(null, 1000),
        waited({}, 1000),
        waited({ timeStamp: 0 }, 1000),
        waited({ timeStamp: -5 }, 1000),
        waited({ timeStamp: 1001 }, 1000),
        waited({ timeStamp: 1000 }, 1000),
        waited({ timeStamp: 699.6 }, 1000),
        waited({ timeStamp: 1_700_000_000_120 }, 1000),
        waited({ timeStamp: 1_700_000_000_600 }, 1000),
      ],
      [null, null, null, null, null, 0, 300, 380, null])
    const slow_line = (name, marks, thr) =>
      v1('key_buttons_slow_line(__args.name, __args.marks, __args.thr ?? KEY_BUTTONS_SLOW)', { name, marks, thr })
    check('diagnostics slow_line: null below all thresholds (299/999), warns at exact thresholds (waited 300, down 300, work 1000), formats optional down/work and unknown waited, honors custom thresholds',
      [
        slow_line('done', { down: 299, waited: 299, work: 999 }),
        slow_line('done', { waited: 300 }),
        slow_line('done', { down: 300, waited: 50, work: 12.4 }),
        slow_line('done', { work: 1000 }),
        slow_line('done', { waited: 100 }, { waited: 100, work: 1000 }),
      ],
      [
        null,
        'key buttons: the tap on "done" reached the page 300 ms after the finger left',
        'key buttons: the tap on "done" reached the page 50 ms after the finger left (300 ms after it came down); its work took 12 ms',
        'key buttons: the tap on "done" reached the page ? ms after the finger left; its work took 1000 ms',
        'key buttons: the tap on "done" reached the page 100 ms after the finger left',
      ])

    // timed, down/down_taken, dropped on mobile bar button, and stuck ticker with fake setInterval
    calm()
    const dWarns = []
    let dNow = 5000
    const intervals = []
    const clearedIds = []
    const dDoc = Object.assign(new FakeNode('document'), {
      head: new FakeNode('head'),
      body: new FakeNode('body'),
      documentElement: new FakeNode('html'),
      activeElement: null,
      visibilityState: 'visible',
      createElement: tag => new FakeNode(tag),
      createElementNS: (_, tag) => new FakeNode(tag),
    })
    const dWin = Object.assign(new FakeNode('window'), {
      innerWidth: 390,
      innerHeight: 800,
      visualViewport: Object.assign(new FakeNode('viewport'), { width: 390, height: 800, scale: 1, offsetLeft: 0, offsetTop: 0 }),
      matchMedia: q => (q == '(pointer: coarse)' ? Object.assign(new FakeNode('media'), { matches: true }) : { matches: false }),
      _items: () => [],
    })
    const dTasks = {}
    const dCtx = vm.createContext({
      _this: { id: 'keys-id', deephash: 30, dispatch_task(name, fn, delay, repeat) { return (dTasks[name] = { fn, delay, repeat }) } },
      _item: label => (label == '#key_buttons' ? { id: 'keys-id' } : null),
      document: dDoc,
      window: dWin,
      KeyboardEvent: FakeKey,
      Date: class extends Date {
        static now() { return 1_700_000_000_000 }
        toLocaleTimeString() { return '12:00:00' }
      },
      performance: { now: () => dNow },
      console: { warn: m => dWarns.push(m), error: () => {} },
      setInterval: (fn, ms) => { const h = { id: intervals.length + 1, fn, ms, unref() {} }; intervals.push(h); return h },
      clearInterval: h => clearedIds.push(h.id),
    })
    vm.runInContext(code, dCtx)
    const dEval = (expr, args) => { dCtx.__args = args; return vm.runInContext(expr, dCtx) }
    // key_buttons_down / down_taken + key_buttons_timed (sync fast, sync slow work, async resolve/reject, sync throw)
    const btn = {}
    dNow = 5000
    dEval('key_buttons_down(__args.btn, __args.e)', { btn, e: { timeStamp: 4950 } }) // down_at = 4950
    const takenOnce = dEval('key_buttons_down_taken(__args)', btn)
    const takenTwice = dEval('key_buttons_down_taken(__args)', btn)
    dNow = 5100
    dEval('key_buttons_timed(__args.n, __args.e, __args.d, __args.w)', { n: 'fast', e: { timeStamp: 5050 }, d: 5000, w: () => 42 }) // waited=50, down=100, work=0 -> silent
    const afterFast = dWarns.length
    dEval('key_buttons_timed(__args.n, __args.e, __args.d, __args.w)', { n: 'slow-work', e: { timeStamp: 5080 }, d: 5050, w: () => { dNow += 1000 } }) // work=1000 -> warns
    let resP
    const pSlow = dEval('key_buttons_timed(__args.n, __args.e, __args.d, __args.w)', { n: 'async-ok', e: { timeStamp: dNow - 10 }, d: null, w: () => new Promise(r => (resP = r)) })
    const beforeAsyncSettle = dWarns.length
    dNow += 1050
    resP('ok')
    await pSlow
    let rejP
    const pRej = dEval('key_buttons_timed(__args.n, __args.e, __args.d, __args.w)', { n: 'async-err', e: { timeStamp: dNow - 350 }, d: null, w: () => new Promise((_, r) => (rejP = r)) })
    rejP(new Error('nope'))
    await pRej.catch(() => {})
    let syncErr = null
    try { dEval('key_buttons_timed(__args.n, __args.e, __args.d, __args.w)', { n: 'sync-throw', e: { timeStamp: dNow - 310 }, d: null, w: () => { throw new Error('kaboom') } }) } catch (e) { syncErr = e.message }
    const timedWarns = [...dWarns]
    // bar button dropped tap warning + stuck ticker via controller
    dWarns.length = 0
    dNow = 10_000
    vm.runInContext('_on_welcome()', dCtx)
    const tickFn = intervals[0].fn
    const tickMs = intervals[0].ms
    // normal tick (+200 ms, late=0) and 999 ms late (+1199 ms) -> silent
    dNow += 200; tickFn()
    dNow += 1199; tickFn()
    const tickerSilent = dWarns.length
    // 1000 ms late (+1200 ms) while visible -> warns
    dNow += 1200; tickFn()
    const tickerStuck = [...dWarns]
    dWarns.length = 0
    // page hidden -> visibilitychange resets baseline; waking 5000 ms later must NOT warn
    dDoc.visibilityState = 'hidden'
    dDoc.fire('visibilitychange')
    dNow += 5000
    dDoc.visibilityState = 'visible'
    dDoc.fire('visibilitychange')
    tickFn() // tick_front was false -> no warn, sets tick_front = true
    const afterWake = dWarns.length
    // pageshow also resets baseline
    dWin.fire('pageshow')
    dNow += 3000
    tickFn()
    const afterPageshow = dWarns.length
    // subsequent visible stall warns again
    dNow += 1500
    tickFn()
    const afterSecondStall = [...dWarns]
    // bar button dropped click warns
    dWarns.length = 0
    const mobBar = dDoc.body.children.find(n => n.dataset.keyButtons == 'bar')
    const leftMob = mobBar.children.find(b => b.dataset.key == 'left')
    leftMob.getBoundingClientRect = () => ({ left: 150, right: 182, top: 806, bottom: 838, width: 32, height: 32 })
    dDoc.fire('pointerdown', { target: leftMob, clientX: 145, clientY: 822, pointerType: 'touch', isPrimary: true })
    dDoc.fire('pointerup', { target: leftMob, clientX: 145, clientY: 822, pointerType: 'touch', isPrimary: true })
    leftMob.fire('click', { detail: 1, pointerType: 'touch', timeStamp: dNow - 10 })
    const barDropped = [...dWarns]
    const visBefore = [(dDoc.listeners.visibilitychange ?? []).length, (dWin.listeners.pageshow ?? []).length]
    dWin._key_buttons.dispose()
    const visAfter = [(dDoc.listeners.visibilitychange ?? []).length, (dWin.listeners.pageshow ?? []).length, clearedIds]
    check('diagnostics timed & down: consumes _down_at once, stays quiet when fast, warns on slow sync work, async resolve/reject, and sync throw (rethrowing)',
      [takenOnce, takenTwice, afterFast, beforeAsyncSettle, syncErr, timedWarns],
      [
        4950,
        null,
        0,
        1,
        'kaboom',
        [
          'key buttons: the tap on "slow-work" reached the page 20 ms after the finger left (50 ms after it came down); its work took 1000 ms',
          'key buttons: the tap on "async-ok" reached the page 10 ms after the finger left; its work took 1050 ms',
          'key buttons: the tap on "async-err" reached the page 350 ms after the finger left; its work took 0 ms',
          'key buttons: the tap on "sync-throw" reached the page 310 ms after the finger left; its work took 0 ms',
        ],
      ])
    check('diagnostics ticker & bar drop: ticks every 200 ms, warns at >=1000 ms late when visible, ignores hide/show/pageshow gaps, warns on bar dropped tap, and cleans up on dispose',
      [tickMs, tickerSilent, tickerStuck, afterWake, afterPageshow, afterSecondStall, barDropped, visBefore, visAfter],
      [
        200,
        0,
        ['key buttons: the page did not respond for 1000 ms, until 12:00:00'],
        0,
        0,
        ['key buttons: the page did not respond for 1300 ms, until 12:00:00'],
        ['key buttons: a tap on "left" was not taken: it did not start on this button'],
        [1, 1],
        [0, 0, [1]],
      ])

    // ---- key_buttons_busy (long animation frames) ----
    const busy = (frames, from, to) => v1('key_buttons_busy(__args.frames, __args.from, __args.to)', { frames, from, to })
    check('diagnostics busy overlap: empty on null/empty or non-overlapping frames, strict edges at from and to, includes overlapping frames',
      [
        busy(null, 100, 200),
        busy([], 100, 200),
        busy([
          { startTime: 20, duration: 50, scripts: [{ duration: 50, invokerType: 'event-listener', invoker: 'DIV.onclick' }] },
          { startTime: 50, duration: 50, scripts: [{ duration: 50, invokerType: 'event-listener', invoker: 'SPAN.onclick' }] },
          { startTime: 200, duration: 50, scripts: [{ duration: 50, invokerType: 'event-listener', invoker: 'A.onclick' }] },
          { startTime: 250, duration: 50, scripts: [{ duration: 50, invokerType: 'event-listener', invoker: 'P.onclick' }] },
        ], 100, 200),
        busy([
          { startTime: 50, duration: 51, scripts: [{ duration: 51, invokerType: 'event-listener', invoker: 'BUTTON.onclick' }] },
          { startTime: 199, duration: 50, scripts: [{ duration: 50, invokerType: 'user-callback', invoker: 'FrameRequestCallback' }] },
        ], 100, 200),
      ],
      ['', '', '', '; the browser names 2 long frames: 51 ms event-listener BUTTON.onclick; 50 ms user-callback FrameRequestCallback'])

    check('diagnostics busy scripts: top four longest scripts across frames, the kind and the safe invoker alone (no function, file or place, whatever the address), forced style/layout only from 50 ms',
      [
        busy([
          {
            startTime: 100,
            duration: 900,
            scripts: [
              { duration: 80, invokerType: 'classic-script', invoker: 'https://olcan.com/_app/immutable/chunks/fifth.js', sourceURL: 'https://olcan.com/_app/immutable/chunks/fifth.js', sourceCharPosition: 1 },
              { duration: 450.4, invokerType: 'event-listener', invoker: 'SPAN.onclick', sourceFunctionName: 'onTag', sourceURL: 'https://olcan.com/_app/immutable/nodes/2.DC9Vbosy.js?v=2#frag', sourceCharPosition: 42, forcedStyleAndLayoutDuration: 84.6 },
              { duration: 120, invokerType: 'weird-kind', sourceFunctionName: 'App.fn_1', sourceURL: 'https://olcan.com/_app/immutable/workers/kdf_worker-DhNkOoTV.js?q=1', sourceCharPosition: -1, forcedStyleAndLayoutDuration: 49.9 },
            ],
          },
          {
            startTime: 200,
            duration: 600,
            scripts: [
              { duration: 310, invokerType: 'user-callback', invoker: 'TimerHandler:setTimeout', sourceURL: 'https://olcan.com/_app/immutable/chunks/BTOe9b8E.js#hash', sourceCharPosition: 0, forcedStyleAndLayoutDuration: 50 },
              { duration: 200, invokerType: 'resolve-promise', invoker: 'import.then', sourceFunctionName: 'bad fn name', sourceURL: 'https://olcan.com/_app/immutable/entry/app.BJVqzvZH.js', sourceCharPosition: null },
            ],
          },
        ], 100, 1000),
        busy([
          {
            startTime: 100,
            duration: 400,
            scripts: [
              { duration: 300, invokerType: 'module-script', invoker: 'https://olcan.com/_app/immutable/chunks/BTOe9b8E.js', sourceFunctionName: 'a'.repeat(61), sourceURL: 'https://olcan.com/_app/immutable/chunks/BTOe9b8E.js', sourceCharPosition: 9 },
              { duration: 200, invokerType: 'user-callback', invoker: 'MessagePort.onmessage', sourceFunctionName: 'okFn', sourceURL: `https://olcan.com/_app/immutable/chunks/${'x'.repeat(78)}.js`, sourceCharPosition: 3 },
              { duration: 150, invokerType: 'event-listener', invoker: 'DOMWindow.onkeydown', sourceURL: 'https://olcan.com/_app/immutable/chunks/../../file/secret.js', sourceFunctionName: 'leak', sourceCharPosition: 5 },
              { duration: 120, invokerType: 'user-callback', invoker: 'Window.onmessage', sourceURL: 'blob:https://olcan.com/_app/immutable/chunks/blob.js', sourceFunctionName: 'blobFn', sourceCharPosition: 2 },
            ],
          },
        ], 100, 600),
      ],
      [
        '; the browser names 2 long frames: 450 ms event-listener SPAN.onclick, 85 ms of it forced style/layout; 310 ms user-callback TimerHandler:setTimeout, 50 ms of it forced style/layout; 200 ms resolve-promise; 120 ms script',
        '; the browser names 1 long frame: 300 ms module-script; 200 ms user-callback MessagePort.onmessage; 150 ms event-listener Window.onkeydown; 120 ms user-callback Window.onmessage',
      ])

    // the invoker strings as Chromium 151 gave them in a probe (2026-11-26): a listener on the document
    // carries its node name, the window `DOMWindow`, an SVG element its lowercase tag
    check('diagnostics busy invokers as the browser gives them: the document, the window, an SVG element, a custom element, a message port, and a promise step',
      busy([
        {
          startTime: 100,
          duration: 900,
          scripts: [
            { duration: 160, invokerType: 'event-listener', invoker: '#document.onclick' },
            { duration: 150, invokerType: 'event-listener', invoker: 'DOMWindow.onkeydown' },
            { duration: 140, invokerType: 'event-listener', invoker: 'circle#c.onclick' },
            { duration: 130, invokerType: 'event-listener', invoker: 'MY-WIDGET#w.onclick' },
          ],
        },
        {
          startTime: 1000,
          duration: 400,
          scripts: [
            { duration: 120, invokerType: 'event-listener', invoker: 'MessagePort.onmessage' },
            { duration: 110, invokerType: 'resolve-promise', invoker: 'Window.fetch.then' },
          ],
        },
      ], 100, 1400).replace(/^; the browser names 2 long frames: /, '').split('; ').slice(0, 4).concat(
        busy([{ startTime: 1000, duration: 400, scripts: [{ duration: 120, invokerType: 'event-listener', invoker: 'MessagePort.onmessage' }, { duration: 110, invokerType: 'resolve-promise', invoker: 'Window.fetch.then' }] }], 1000, 1400).replace(/^; the browser names 1 long frame: /, '').split('; ')
      ),
      [
        '160 ms event-listener Document.onclick',
        '150 ms event-listener Window.onkeydown',
        '140 ms event-listener CIRCLE.onclick',
        '130 ms event-listener element.onclick',
        '120 ms event-listener MessagePort.onmessage',
        '110 ms resolve-promise',
      ])

    const loafPrivacyLines = [
      busy([{ startTime: 100, duration: 300, scripts: [
        { duration: 300, invokerType: 'event-listener', invoker: 'H2#quarterly-payroll-s1.onclick', sourceFunctionName: 'fnSecretS1', sourceURL: '', sourceCharPosition: 11 },
        { duration: 250, invokerType: 'event-listener', invoker: 'DIV.secret-class-s2.onclick', sourceFunctionName: 'fnSecretS2', sourceURL: 'https://olcan.com/file/item-secret-s2.js?q=qS2#fS2', sourceCharPosition: 22 },
        { duration: 200, invokerType: 'event-listener', invoker: 'PAYROLL-CARD-S3#id-s3.onclick', sourceFunctionName: 'fnSecretS3', sourceURL: 'https://olcan.com/vendor/cdn.example/secret-s3.js', sourceCharPosition: 33 },
        { duration: 150, invokerType: 'classic-script', invoker: 'https://other.example/file-secret-s4.js?tok=qSecretS4#fragSecretS4', sourceFunctionName: 'fnSecretS4', sourceURL: 'https://other.example/file-secret-s4.js?tok=qSecretS4#fragSecretS4', sourceCharPosition: 44 },
      ] }], 100, 500),
      busy([{ startTime: 100, duration: 300, scripts: [
        { duration: 300, invokerType: 'event-listener', invoker: 'IMG[src="https://secret.example/img-s5.png?tok=qS5#fS5"].onload', sourceFunctionName: 'fnSecretS5', sourceURL: 'https://olcan.com/proxy/http://127.0.0.1/secret-s5.js', sourceCharPosition: 55 },
        { duration: 250, invokerType: 'module-script', invoker: 'https://olcan.com/_app/immutable/nodes/fileShapedS6.js?tok=invQueryS6#invFragS6', sourceFunctionName: 'fnShapedS6', sourceURL: 'https://olcan.com/_app/immutable/nodes/fileShapedS6.js?tok=srcQueryS6#srcFragS6', sourceCharPosition: 15 },
        { duration: 200, invokerType: 'event-listener', invoker: 'BUTTON#idS7.onsecretEventS7', sourceFunctionName: 'fnSecretS7', sourceURL: 'https://olcan.com/', sourceCharPosition: 77 },
        { duration: 150, invokerType: 'user-callback', invoker: 'customCbSecretS8', sourceFunctionName: 'fnSecretS8', sourceURL: 'https://other.example/_app/immutable/chunks/evilS8.js', sourceCharPosition: 88 },
      ] }], 100, 500),
    ]
    const loafSentinels = [
      'quarterly-payroll-s1', 'fnSecretS1', 'secret-class-s2', 'fnSecretS2', 'item-secret-s2', 'qS2', 'fS2',
      'PAYROLL-CARD-S3', 'payroll-card-s3', 'id-s3', 'fnSecretS3', 'secret-s3',
      'file-secret-s4', 'qSecretS4', 'fragSecretS4', 'fnSecretS4', 'other.example',
      'img-s5', 'qS5', 'fS5', 'secret.example', 'fnSecretS5', 'secret-s5',
      'fileShapedS6', 'fnShapedS6', 'invQueryS6', 'invFragS6', 'srcQueryS6', 'srcFragS6', '_app', ':15',
      'idS7', 'secretEventS7', 'fnSecretS7', 'customCbSecretS8', 'fnSecretS8', 'evilS8',
    ]
    const loafAll = loafPrivacyLines.join('\n')
    check('diagnostics busy privacy: never leaks heading ids, classes, custom tags, function or file names (an app-shaped address included), URL queries/fragments, image sources, or raw invokers while keeping safe attribution',
      [loafSentinels.filter(s => loafAll.includes(s)), loafPrivacyLines],
      [
        [],
        [
          '; the browser names 1 long frame: 300 ms event-listener H2.onclick; 250 ms event-listener DIV.onclick; 200 ms event-listener element.onclick; 150 ms classic-script',
          '; the browser names 1 long frame: 300 ms event-listener IMG.onload; 250 ms module-script; 200 ms event-listener; 150 ms user-callback',
        ],
      ])

    check('diagnostics busy render & empty: sums time from style/layout start to frame end only from 50 ms, singular/plural frame, no script when empty',
      [
        busy([{ startTime: 100, duration: 120, scripts: [] }], 100, 250),
        busy([{ startTime: 100, duration: 80, styleAndLayoutStart: 155 }, { startTime: 180, duration: 80, styleAndLayoutStart: 236 }], 100, 300),
        busy([{ startTime: 100, duration: 80, styleAndLayoutStart: 150 }, { startTime: 180, duration: 80, styleAndLayoutStart: 235 }], 100, 300),
        busy([{ startTime: 100, duration: 100, styleAndLayoutStart: 0 }, { startTime: 120, duration: 50, styleAndLayoutStart: 200 }], 100, 300),
      ],
      [
        '; the browser names 1 long frame: no script',
        '; the browser names 2 long frames: no script',
        '; the browser names 2 long frames: no script; 55 ms from style/layout start to frame end',
        '; the browser names 2 long frames: no script',
      ])

    // ---- key_buttons_busy_events (Event Timing fallback: Safari 26.2+, Firefox) ----
    const busyEvents = (events, from, to) => v1('key_buttons_busy_events(__args.events, __args.from, __args.to)', { events, from, to })
    check('diagnostics busy events overlap & order: empty on null/empty/edges, top three longest in order, singular/plural event',
      [
        busyEvents(null, 100, 200),
        busyEvents([], 100, 200),
        busyEvents([
          { name: 'click', startTime: 50, duration: 50, processingStart: 51, processingEnd: 99 },
          { name: 'click', startTime: 200, duration: 50, processingStart: 201, processingEnd: 249 },
        ], 100, 200),
        busyEvents([
          { name: 'click', startTime: 1000, duration: 1650, processingStart: 1012, processingEnd: 2642, target: { tagName: 'SPAN', className: 'tag extra', textContent: 'secret note', value: 'secret val' } },
        ], 900, 2700),
        busyEvents([
          { name: 'keydown', startTime: 50, duration: 51, processingStart: 51, processingEnd: 95, target: { tagName: 'TEXTAREA', id: 'box' } },
          { name: 'click', startTime: 110, duration: 400, processingStart: 120, processingEnd: 500, target: { tagName: 'BUTTON', className: 'go' } },
          { name: 'pointerup', startTime: 115, duration: 300, processingStart: 125, processingEnd: 410, target: { tagName: 'BUTTON' } },
          { name: 'input', startTime: 199, duration: 150, processingStart: 198.5, processingEnd: 340, target: null },
        ], 100, 200),
      ],
      [
        '',
        '',
        '',
        '; the browser names 1 slow event: 1650 ms click on SPAN (waited 12 ms, handled for 1630 ms)',
        '; the browser names 4 slow events: 400 ms click on BUTTON (waited 10 ms, handled for 380 ms); 300 ms pointerup on BUTTON (waited 10 ms, handled for 285 ms); 150 ms input (waited 0 ms, handled for 142 ms)',
      ])
    check('diagnostics busy events ranking: slow handler beats earlier 0 ms hover/pointer events sharing the same delayed paint, and interactionId breaks equal-duration 0 ms ties',
      [
        busyEvents([
          { name: 'pointerover', startTime: 1000, duration: 1512, processingStart: 1000, processingEnd: 1000, interactionId: 0, target: { tagName: 'BUTTON', id: 'go' } },
          { name: 'pointerenter', startTime: 1000, duration: 1504, processingStart: 1000, processingEnd: 1000, interactionId: 0, target: null },
          { name: 'pointerdown', startTime: 1004, duration: 1504, processingStart: 1004, processingEnd: 1004, interactionId: 7, target: { tagName: 'BUTTON', id: 'go' } },
          { name: 'click', startTime: 1004, duration: 1504, processingStart: 1004, processingEnd: 2504, interactionId: 7, target: { tagName: 'BUTTON', id: 'go' } },
        ], 900, 2600),
      ],
      ['; the browser names 4 slow events: 1504 ms click on BUTTON (waited 0 ms, handled for 1500 ms); 1512 ms pointerover on BUTTON (waited 0 ms, handled for 0 ms); 1504 ms pointerdown on BUTTON (waited 0 ms, handled for 0 ms)'])

    const evTargetLines = [
      busyEvents([{ name: 'click', startTime: 100, duration: 200, processingStart: 105, processingEnd: 295, target: { tagName: 'H2', id: 'quarterly-payroll-e1', className: 'cls-secret-e1 other', textContent: 'private diary e1', innerText: 'private diary e1', value: 'secret-val-e1' } }], 100, 300),
      busyEvents([{ name: 'click', startTime: 100, duration: 200, processingStart: 105, processingEnd: 295, target: { tagName: 'SPAN', id: '  ', className: '  cls-secret-e2  other ', textContent: 'private diary e2', value: 'secret-val-e2' } }], 100, 300),
      busyEvents([{ name: 'click', startTime: 100, duration: 200, processingStart: 105, processingEnd: 295, target: { tagName: 'svg', className: { baseVal: 'icon-secret-e3 spin' }, textContent: 'private diary e3' } }], 100, 300),
      busyEvents([{ name: 'click', startTime: 100, duration: 200, processingStart: 105, processingEnd: 295, target: { tagName: 'DIV', classList: ['list-secret-e4', 'second-cls'], className: 'other', textContent: 'private diary e4' } }], 100, 300),
      busyEvents([{ name: 'click', startTime: 100, duration: 200, processingStart: 105, processingEnd: 295, target: { tagName: 'PAYROLL-WIDGET-E5', id: 'id-e5', className: 'cls-e5', textContent: 'private diary e5' } }], 100, 300),
      busyEvents([{ name: 'secret-event-e6', startTime: 100, duration: 200, processingStart: 105, processingEnd: 295, target: { tagName: 'BUTTON', id: 'id-e6', textContent: 'private diary e6' } }], 100, 300),
      busyEvents([{ name: 'click', startTime: 100, duration: 200, processingStart: 105, processingEnd: 295, target: null }], 100, 300),
      busyEvents([{ name: 'click', startTime: 100, duration: 200, processingStart: 105, processingEnd: 295, target: { nodeType: 3, nodeValue: 'private diary e7' } }], 100, 300),
    ]
    const evSentinels = [
      'quarterly-payroll-e1', 'cls-secret-e1', 'private diary', 'secret-val-e1',
      'cls-secret-e2', 'secret-val-e2', 'icon-secret-e3', 'list-secret-e4',
      'PAYROLL-WIDGET-E5', 'payroll-widget-e5', 'id-e5', 'cls-e5', 'secret-event-e6', 'id-e6',
    ]
    const evTargetAll = evTargetLines.join('\n')
    check('diagnostics busy events target: uses standard HTML/SVG tag alone or element fallback, never id, class, custom tag, event name outside list, text, or value, omits target when gone or non-element',
      [evSentinels.filter(s => evTargetAll.includes(s)), evTargetLines],
      [
        [],
        [
          '; the browser names 1 slow event: 200 ms click on H2 (waited 5 ms, handled for 190 ms)',
          '; the browser names 1 slow event: 200 ms click on SPAN (waited 5 ms, handled for 190 ms)',
          '; the browser names 1 slow event: 200 ms click on SVG (waited 5 ms, handled for 190 ms)',
          '; the browser names 1 slow event: 200 ms click on DIV (waited 5 ms, handled for 190 ms)',
          '; the browser names 1 slow event: 200 ms click on element (waited 5 ms, handled for 190 ms)',
          '; the browser names 1 slow event: 200 ms event on BUTTON (waited 5 ms, handled for 190 ms)',
          '; the browser names 1 slow event: 200 ms click (waited 5 ms, handled for 190 ms)',
          '; the browser names 1 slow event: 200 ms click (waited 5 ms, handled for 190 ms)',
        ],
      ])

    // ---- ticker with stand-in PerformanceObserver (long-animation-frame, event, both, none, throwing) ----
    const runClock = ({ supportedEntryTypes, ctorThrows = false, observeThrows = false } = {}) => {
      const cWarns = []
      const cIntervals = []
      const cTimers = []
      const cInstances = []
      let cNow = 10_000
      const cDoc = Object.assign(new FakeNode('document'), {
        head: new FakeNode('head'),
        body: new FakeNode('body'),
        documentElement: new FakeNode('html'),
        activeElement: null,
        visibilityState: 'visible',
        createElement: tag => new FakeNode(tag),
        createElementNS: (_, tag) => new FakeNode(tag),
      })
      const cWin = Object.assign(new FakeNode('window'), {
        innerWidth: 1000,
        innerHeight: 800,
        visualViewport: Object.assign(new FakeNode('viewport'), { width: 1000, height: 800, scale: 1, offsetLeft: 0, offsetTop: 0 }),
        matchMedia: () => ({ matches: false }),
        _items: () => [],
      })
      class StandInObserver {
        constructor(cb) {
          if (ctorThrows) throw new Error('ctor boom')
          this.cb = cb
          this.observed = []
          this.disconnected = 0
          cInstances.push(this)
        }
        observe(opts) {
          this.observed.push(opts)
          if (observeThrows) throw new Error('observe boom')
        }
        disconnect() {
          this.disconnected++
        }
        emit(entries) {
          this.cb({ getEntries: () => entries })
        }
      }
      if (supportedEntryTypes !== undefined) StandInObserver.supportedEntryTypes = supportedEntryTypes
      const globals = {
        _this: { id: 'keys-id', deephash: 31, dispatch_task(name, fn, delay, repeat) { return { name, fn, delay, repeat } } },
        _item: label => (label == '#key_buttons' ? { id: 'keys-id' } : null),
        document: cDoc,
        window: cWin,
        location: cWin.location,
        URL,
        KeyboardEvent: FakeKey,
        Date: class extends Date {
          static now() { return 1_700_000_000_000 }
          toLocaleTimeString() { return '12:00:00' }
        },
        performance: { now: () => cNow },
        console: { warn: m => cWarns.push(m), error: () => {} },
        setInterval: (fn, ms) => { const h = { fn, ms, unref() {} }; cIntervals.push(h); return h },
        clearInterval: () => {},
        setTimeout: (fn, ms) => { const h = { fn, ms, unref() {} }; cTimers.push(h); return h },
      }
      if (supportedEntryTypes !== undefined) globals.PerformanceObserver = StandInObserver
      const cCtx = vm.createContext(globals)
      vm.runInContext(code, cCtx)
      vm.runInContext('_on_welcome()', cCtx)
      return {
        warns: cWarns,
        timers: cTimers,
        instances: cInstances,
        now: () => cNow,
        tick(advance) { cNow += advance; cIntervals[0].fn() },
        flushTimers() { while (cTimers.length) cTimers.shift().fn() },
        dispose() { cWin._key_buttons?.dispose() },
      }
    }

    // 1. long-animation-frame: waits 300 ms, includes frames arriving after tick, writes one line, disconnects on dispose
    const loaf = runClock({ supportedEntryTypes: ['long-animation-frame'] })
    loaf.tick(1500) // from 10000 to 11500, deadline 10200, late = 1300 ms
    const loafImmediate = [loaf.warns.length, loaf.timers.map(t => t.ms)]
    // frame arrives AFTER the late tick, during the 300 ms wait
    loaf.instances[0].emit([{ startTime: 10_100, duration: 1300, scripts: [{ duration: 1280, invokerType: 'event-listener', invoker: 'SPAN#secret.onclick', sourceFunctionName: 'openTag', sourceURL: 'https://olcan.com/_app/immutable/nodes/2.DC9Vbosy.js?v=1', sourceCharPosition: 7 }] }])
    loaf.flushTimers()
    const loafAfterWait = [...loaf.warns]
    const loafDiscBefore = loaf.instances[0].disconnected
    loaf.dispose()
    const loafDiscAfter = loaf.instances[0].disconnected
    check('diagnostics clock long-animation-frame: observes loaf, waits 300 ms for late frames, writes one line with the safe attribution, disconnects on dispose',
      [loaf.instances.length, loaf.instances[0].observed, loafImmediate, loafAfterWait, loafDiscBefore, loafDiscAfter],
      [
        1,
        [{ type: 'long-animation-frame', buffered: false }],
        [0, [300]],
        ['key buttons: the page did not respond for 1300 ms, until 12:00:00; the browser names 1 long frame: 1280 ms event-listener SPAN.onclick'],
        0,
        1,
      ])

    // 2. cap of 60 frames kept (fixtures inside the missed window 10200..11500); the five old frames'
    // scripts take 900 ms and the sixty kept ones 100 ms, which tells them apart in the line
    const cap = runClock({ supportedEntryTypes: ['long-animation-frame'] })
    const oldFive = Array.from({ length: 5 }, (_, i) => ({ startTime: 10_210 + i, duration: 900, scripts: [{ duration: 900, invokerType: 'classic-script' }] }))
    const newSixty = Array.from({ length: 60 }, (_, i) => ({ startTime: 10_220 + i, duration: 100, scripts: [{ duration: 100, invokerType: 'classic-script' }] }))
    cap.instances[0].emit(oldFive)
    cap.instances[0].emit(newSixty)
    cap.tick(1500)
    cap.flushTimers()
    cap.dispose()
    check('diagnostics clock cap: more than 60 long frames keep only the last 60',
      [cap.warns.length, cap.warns[0].includes('60 long frames'), cap.warns[0].includes('100 ms classic-script'), cap.warns[0].includes('900 ms')],
      [1, true, true, false])

    // 3. attribution starts at the missed deadline (tick_at + 200), excluding entries ending by it and including entries spanning it
    const dlLoaf = runClock({ supportedEntryTypes: ['long-animation-frame'] })
    dlLoaf.instances[0].emit([
      { startTime: 10_010, duration: 80, scripts: [{ duration: 80, invokerType: 'event-listener', invoker: 'DIV.onclick' }] }, // ends 10090 < 10200
      { startTime: 10_100, duration: 100, scripts: [{ duration: 100, invokerType: 'event-listener', invoker: 'SPAN.onclick' }] }, // ends 10200 == deadline
      { startTime: 10_150, duration: 100, scripts: [{ duration: 100, invokerType: 'event-listener', invoker: 'BUTTON.onclick' }] }, // spans 10200 -> 10250
    ])
    dlLoaf.tick(1500) // deadline 10200..11500
    dlLoaf.flushTimers()
    dlLoaf.dispose()
    const dlEv = runClock({ supportedEntryTypes: ['event'] })
    dlEv.instances[0].emit([
      { name: 'keydown', startTime: 10_010, duration: 104, processingStart: 10_012, processingEnd: 10_110, target: { tagName: 'INPUT' } }, // ends 10114 < 10200
      { name: 'pointerup', startTime: 10_080, duration: 120, processingStart: 10_082, processingEnd: 10_190, target: { tagName: 'DIV' } }, // ends 10200 == deadline
      { name: 'click', startTime: 10_150, duration: 200, processingStart: 10_155, processingEnd: 10_340, target: { tagName: 'BUTTON' } }, // spans 10200 -> 10350
    ])
    dlEv.tick(1500) // deadline 10200..11500
    dlEv.flushTimers()
    dlEv.dispose()
    check('diagnostics clock deadline: starts lookup at missed deadline (tick_at + 200), excludes entries ending by it and includes entries spanning it on both paths',
      [dlLoaf.warns, dlEv.warns],
      [
        ['key buttons: the page did not respond for 1300 ms, until 12:00:00; the browser names 1 long frame: 100 ms event-listener BUTTON.onclick'],
        ['key buttons: the page did not respond for 1300 ms, until 12:00:00; the browser names 1 slow event: 200 ms click on BUTTON (waited 5 ms, handled for 185 ms)'],
      ])

    // 4. disposal before delayed warning timer fires stays silent on both paths
    const dispLoaf = runClock({ supportedEntryTypes: ['long-animation-frame'] })
    dispLoaf.tick(1500)
    dispLoaf.instances[0].emit([{ startTime: 10_250, duration: 400, scripts: [{ duration: 400, invokerType: 'event-listener', invoker: 'BUTTON.onclick' }] }])
    const dispLoafPending = dispLoaf.timers.length
    dispLoaf.dispose()
    dispLoaf.flushTimers()
    const dispEv = runClock({ supportedEntryTypes: ['event'] })
    dispEv.tick(1500)
    dispEv.instances[0].emit([{ name: 'click', startTime: 10_250, duration: 400, processingStart: 10_255, processingEnd: 10_650, target: { tagName: 'BUTTON' } }])
    const dispEvPending = dispEv.timers.length
    dispEv.dispose()
    dispEv.flushTimers()
    check('diagnostics clock dispose before delayed warn: late tick followed by disposal writes nothing when pending timer flushes',
      [dispLoafPending, dispLoaf.warns, dispEvPending, dispEv.warns],
      [1, [], 1, []])

    // 5. unsupported, constructor throws, observe throws -> plain line written at once
    const none = runClock({ supportedEntryTypes: [] })
    none.tick(1500)
    const noneRes = [none.instances.length, none.timers.length, [...none.warns]]
    none.dispose()
    const ctorBad = runClock({ supportedEntryTypes: ['long-animation-frame'], ctorThrows: true })
    ctorBad.tick(1500)
    const ctorRes = [ctorBad.instances.length, ctorBad.timers.length, [...ctorBad.warns]]
    ctorBad.dispose()
    const obsBad = runClock({ supportedEntryTypes: ['long-animation-frame'], observeThrows: true })
    obsBad.tick(1500)
    const obsRes = [obsBad.timers.length, [...obsBad.warns]]
    obsBad.dispose()
    const PLAIN_1300 = ['key buttons: the page did not respond for 1300 ms, until 12:00:00']
    check('diagnostics clock fallback: unsupported or throwing PerformanceObserver/observe writes plain line at once',
      [noneRes, ctorRes, obsRes],
      [[0, 0, PLAIN_1300], [0, 0, PLAIN_1300], [0, PLAIN_1300]])

    // 6. event supported alone (Safari 26.2+, Firefox): observes event with 104 ms threshold, waits 300 ms, caps at 60 inside the missed window, disconnects on dispose
    const ev = runClock({ supportedEntryTypes: ['event'] })
    ev.tick(1800) // from 10000 to 11800, deadline 10200, late = 1600 ms
    const evImmediate = [ev.warns.length, ev.timers.map(t => t.ms)]
    ev.instances[0].emit([
      { name: 'click', startTime: 10_100, duration: 1650, processingStart: 10_112, processingEnd: 11_742, target: { tagName: 'SPAN', id: 'secret-id', className: 'tag', textContent: 'secret' } },
    ])
    ev.flushTimers()
    const evAfterWait = [...ev.warns]
    const evDiscBefore = ev.instances[0].disconnected
    ev.dispose()
    const evDiscAfter = ev.instances[0].disconnected
    const evCap = runClock({ supportedEntryTypes: ['event'] })
    evCap.instances[0].emit(Array.from({ length: 5 }, (_, i) => ({ name: 'keydown', startTime: 10_210 + i, duration: 500, processingStart: 10_211 + i, processingEnd: 10_700 + i, target: { tagName: 'INPUT', id: `old_${i}` } })))
    evCap.instances[0].emit(Array.from({ length: 60 }, (_, i) => ({ name: 'click', startTime: 10_220 + i, duration: 120, processingStart: 10_221 + i, processingEnd: 10_335 + i, target: { tagName: 'BUTTON', id: `new_${i}` } })))
    evCap.tick(1500)
    evCap.flushTimers()
    evCap.dispose()
    check('diagnostics clock event fallback: observes event alone with 104 ms threshold, waits 300 ms, writes safe slow events, keeps last 60, disconnects on dispose',
      [
        ev.instances.length,
        ev.instances[0].observed,
        evImmediate,
        evAfterWait,
        evDiscBefore,
        evDiscAfter,
        evCap.warns.length,
        evCap.warns[0].includes('60 slow events'),
        evCap.warns[0].includes('120 ms click on BUTTON'),
        evCap.warns[0].includes('keydown'),
        evCap.warns[0].includes('old_') || evCap.warns[0].includes('new_'),
      ],
      [
        1,
        [{ type: 'event', buffered: false, durationThreshold: 104 }],
        [0, [300]],
        ['key buttons: the page did not respond for 1600 ms, until 12:00:00; the browser names 1 slow event: 1650 ms click on SPAN (waited 12 ms, handled for 1630 ms)'],
        0,
        1,
        1,
        true,
        true,
        false,
        false,
      ])

    // 7. both supported: long-animation-frame wins and no second observer is made
    const both = runClock({ supportedEntryTypes: ['long-animation-frame', 'event'] })
    both.tick(1500)
    both.instances[0].emit([{ startTime: 10_250, duration: 1200, scripts: [{ duration: 1200, invokerType: 'event-listener', invoker: 'BUTTON#secret.onclick' }] }])
    both.flushTimers()
    both.dispose()
    check('diagnostics clock priority: when both long-animation-frame and event are supported, long frames win and no second observer is made',
      [both.instances.length, both.instances[0].observed, both.warns],
      [
        1,
        [{ type: 'long-animation-frame', buffered: false }],
        ['key buttons: the page did not respond for 1300 ms, until 12:00:00; the browser names 1 long frame: 1200 ms event-listener BUTTON.onclick'],
      ])
  }

  if (failures) {
    console.log(`${failures} FAILED`)
    process.exit(1)
  }
  console.log('all ok')
})()
