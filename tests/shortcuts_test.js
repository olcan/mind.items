#!/usr/bin/env node
// plain-node table for the #shortcuts item (shortcuts.js and shortcuts.md): the menu key,
// contexts, entry matching, active predicates, section ordering and filtering, rendered HTML
// views and hostile text escaping, held-key suppression, keyboard navigation and scrolling
// (steer), opening-time snapshot (taken), controller reconciliation, disposal, and the 15 s
// recovery watch (_shortcuts_watch / _shortcuts_live / _shortcuts_end) over a made-up page.
// Complete dialog pipeline and browser behavior are in mind.page tests/e2e/tasks.spec.ts.
// run: node external/mind.items/tests/shortcuts_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const code = fs.readFileSync(path.join(__dirname, '..', 'shortcuts.js'), 'utf8')
const itemText = fs.readFileSync(path.join(__dirname, '..', 'shortcuts.md'), 'utf8')
new vm.Script(code, { filename: 'shortcuts.js' })

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// lodash _.escape, matching the app's lodash
const lodashEscape = s =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ---- a made-up page with head/style, scroll box, capturing listeners, recording modal, and task seam
function makePage({ noDoc = false } = {}) {
  const log = []
  const headChildren = []
  let menuBox = null
  const winListeners = [] // { target, type, fn, capture }
  const docListeners = [] // { target, type, fn, capture }
  const captureOf = opt => (typeof opt == 'object' && opt !== null ? !!opt.capture : !!opt)
  const targetMethods = (target, list) => ({
    addEventListener(type, fn, capture = false) {
      const cap = captureOf(capture)
      list.push({ target, type, fn, capture: cap })
      log.push(`+listen:${target}:${type}:${cap}`)
    },
    removeEventListener(type, fn, capture = false) {
      const cap = captureOf(capture)
      const i = list.findIndex(l => l.type === type && l.fn === fn && l.capture === cap)
      if (i >= 0) {
        list.splice(i, 1)
        log.push(`-listen:${target}:${type}:${cap}`)
      }
    },
  })

  const doc = noDoc
    ? undefined
    : {
        activeElement: null,
        ...targetMethods('document', docListeners),
        head: {
          children: headChildren,
          appendChild(node) {
            node.parent = this
            headChildren.push(node)
            log.push('+style')
            return node
          },
        },
        querySelector(sel) {
          return sel === '.modal .shortcuts-menu' ? menuBox : null
        },
        createElement(tag) {
          const node = {
            tagName: tag.toUpperCase(),
            dataset: {},
            textContent: '',
            parent: null,
            remove() {
              if (!this.parent) return
              const i = headChildren.indexOf(this)
              if (i >= 0) headChildren.splice(i, 1)
              this.parent = null
              log.push('-style')
            },
          }
          return node
        },
      }

  let modalSeq = 0
  let visibleModal = null
  let savedActive = null
  const modalLog = []
  const win = {
    ...targetMethods('window', winListeners),
    _modal(content) {
      const handle = { id: ++modalSeq }
      visibleModal = handle
      if (doc) {
        savedActive = doc.activeElement
        doc.activeElement = null // as Modal.svelte blurs on open
      }
      modalLog.push(['open', handle.id, content])
      return handle
    },
    _modal_update(handle, content) {
      modalLog.push(['update', handle?.id ?? null, content])
    },
    _modal_close(handle) {
      modalLog.push(['close', handle?.id ?? null])
      if (!handle || visibleModal === handle) {
        visibleModal = null
        if (doc) {
          doc.activeElement = savedActive // as Modal.svelte restores lastActiveElement on close
          savedActive = null
        }
      }
    },
    _modal_visible(handle) {
      return handle === undefined ? visibleModal !== null : visibleModal === handle
    },
  }

  // Dispatch in browser order: window capture -> document capture -> document bubble -> window bubble.
  // stopImmediatePropagation ends dispatch at once; stopPropagation finishes the current target's phase.
  const makeEvent = (init = {}) => ({
    key: '',
    code: '',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    prevented: 0,
    stoppedImmediate: 0,
    stopped: 0,
    preventDefault() {
      this.prevented++
    },
    stopImmediatePropagation() {
      this.stoppedImmediate++
    },
    stopPropagation() {
      this.stopped++
    },
    ...init,
  })
  const dispatch = (type, ev) => {
    const phases = [
      winListeners.filter(l => l.type === type && l.capture),
      docListeners.filter(l => l.type === type && l.capture),
      docListeners.filter(l => l.type === type && !l.capture),
      winListeners.filter(l => l.type === type && !l.capture),
    ]
    for (const group of phases) {
      for (const l of [...group]) {
        l.fn(ev)
        if (ev.stoppedImmediate) return ev
      }
      if (ev.stopped) return ev
    }
    return ev
  }
  const fireKey = (init = {}) => dispatch('keydown', makeEvent(init))
  const fireKeyUp = (init = {}) => dispatch('keyup', makeEvent(init))

  const items = { '#shortcuts': { id: 'sc-1' } }
  // Models index.svelte's dispatch_task (lines 1855-1909):
  // - dispatching a name cancels any existing task under that name via `_on_cancel`
  // - running a task whose `fn()` returns `null` cancels it via `_on_cancel` and removes it
  // - deleting an item cancels its active task via `_on_cancel` without invoking `fn()`
  const tasks = {}
  const cancelTask = name => {
    const t = tasks[name]
    if (!t) return false
    delete tasks[name]
    t._on_cancel?.()
    log.push(`cancel:${name}:${t.seq}`)
    return true
  }
  const runTask = name => {
    const t = tasks[name]
    if (!t) return 'missing'
    const out = t.fn()
    if (out === null && tasks[name] === t) {
      delete tasks[name]
      t._on_cancel?.()
      log.push(`self-cancel:${name}:${t.seq}`)
      return null
    }
    return out
  }
  let taskSeq = 0

  const evaluate = ({ id = 'sc-1', deephash = 'h1', deephashFn = null, idFn = null } = {}) => {
    let hash = deephash
    const _this = {
      get id() {
        return idFn ? idFn() : id
      },
      get deephash() {
        return deephashFn ? deephashFn() : hash
      },
      setHash(v) {
        hash = v
      },
      dispatch_task(name, fn, delay, repeat) {
        const prev = tasks[name]
        if (prev) {
          prev._on_cancel?.()
          log.push(`replace-cancel:${name}:${prev.seq}`)
        }
        const entry = { seq: ++taskSeq, name, fn, delay, repeat }
        tasks[name] = entry
        log.push(`task:${name}:${delay}:${repeat}:${entry.seq}`)
        return entry
      },
    }
    const sandbox = {
      window: win,
      document: doc,
      _this,
      _item: label => items[label] ?? null,
      _: { escape: lodashEscape },
    }
    vm.createContext(sandbox)
    vm.runInContext(code, sandbox)
    return Object.assign(
      (expr, arg) => {
        sandbox.__arg = arg
        return vm.runInContext(expr, sandbox)
      },
      { sandbox, _this },
    )
  }

  return {
    doc,
    win,
    headChildren,
    winListeners,
    docListeners,
    get listeners() {
      return [...winListeners, ...docListeners]
    },
    modalLog,
    log,
    items,
    tasks,
    runTask,
    cancelTask,
    fireKey,
    fireKeyUp,
    evaluate,
    setMenuBox: box => (menuBox = box),
    setVisibleModal: m => (visibleModal = m),
    getVisibleModal: () => visibleModal,
  }
}

// ---- 0. embedded-file hygiene: no unescaped macro opener and no hash-tag word in JS comments ---
const opener = '<'.repeat(2)
const openerRe = new RegExp(`(?<!\\\\)${opener}`, 'g')
check('hygiene: shortcuts.js and shortcuts.md hold no unescaped macro opener',
  [(code.match(openerRe) ?? []).length, (itemText.match(openerRe) ?? []).length],
  [0, 0])
check('hygiene: shortcuts.js comments hold no word starting with hash sign',
  code.split('\n').filter(l => /\/\/.*#[A-Za-z_]/.test(l)).length,
  0)

// ---- 1. _shortcuts_key -------------------------------------------------------------------------
{
  const p = makePage()
  const ev = p.evaluate()
  const yes = [
    { key: '?' },
    { key: '?', code: 'Slash', shiftKey: true },
    { key: '?', code: 'Digit0', shiftKey: true },
    { key: '?', ctrlKey: true },
    { key: '?', altKey: true },
    { key: '?', metaKey: true },
    { key: '¿', code: 'Slash', shiftKey: true, altKey: true },
    { key: '/', code: 'Slash', shiftKey: true },
  ]
  const no = [
    { key: '/', code: 'Slash', shiftKey: false },
    { key: '/', code: 'Slash' },
    { key: 'a', code: 'KeyA', shiftKey: true },
    { key: 'Shift', code: 'ShiftLeft', shiftKey: true },
    { key: 'Escape', code: 'Escape' },
    {},
  ]
  check('_shortcuts_key: matches ? character or Slash with Shift, rejects slash without Shift and other keys',
    [yes.map(e => ev('_shortcuts_key(__arg)', e)), no.map(e => ev('_shortcuts_key(__arg)', e))],
    [yes.map(() => true), no.map(() => false)])
}

// ---- 2. _shortcuts_context ---------------------------------------------------------------------
{
  const p = makePage()
  const ev = p.evaluate()
  const probe = active => {
    p.doc.activeElement = active
    return ev('_shortcuts_context()')
  }
  check('_shortcuts_context: identifies box, editor fields (textarea/input/select/contentEditable), and window',
    [
      probe(null),
      probe({ tagName: 'BODY', isContentEditable: false }),
      probe({ tagName: 'DIV', isContentEditable: false }),
      probe({ id: 'textarea-mindbox', tagName: 'TEXTAREA' }),
      probe({ id: 'textarea-item-1', tagName: 'TEXTAREA' }),
      probe({ tagName: 'INPUT' }),
      probe({ tagName: 'SELECT' }),
      probe({ tagName: 'DIV', isContentEditable: true }),
    ],
    ['window', 'window', 'window', 'box', 'editor', 'editor', 'editor', 'editor'])
}

// ---- 3. _shortcuts_in --------------------------------------------------------------------------
{
  const p = makePage()
  const ev = p.evaluate()
  const inCtx = (entry, ctx) => ev('_shortcuts_in(__arg[0], __arg[1])', [entry, ctx])
  const ctxs = ['window', 'box', 'editor', 'all']
  check('_shortcuts_in: single context, list of contexts, all (entry and query), omitted/null default to window, empty list',
    [
      ctxs.map(c => inCtx({ context: 'window' }, c)),
      ctxs.map(c => inCtx({ context: 'box' }, c)),
      ctxs.map(c => inCtx({ context: 'editor' }, c)),
      ctxs.map(c => inCtx({ context: ['box', 'editor'] }, c)),
      ctxs.map(c => inCtx({ context: 'all' }, c)),
      ctxs.map(c => inCtx({ context: ['box', 'all'] }, c)),
      ctxs.map(c => inCtx({}, c)),
      ctxs.map(c => inCtx({ context: null }, c)),
      ctxs.map(c => inCtx({ context: [] }, c)),
    ],
    [
      [true, false, false, true],
      [false, true, false, true],
      [false, false, true, true],
      [false, true, true, true],
      [true, true, true, true],
      [true, true, true, true],
      [true, false, false, true],
      [true, false, false, true],
      [false, false, false, true],
    ])
}

// ---- 4. _shortcuts_active ----------------------------------------------------------------------
{
  const p = makePage()
  const ev = p.evaluate()
  const act = entry => ev('_shortcuts_active(__arg)', entry)
  check('_shortcuts_active: missing or non-function is yes, truthy is yes, falsy is no, throwing is no',
    [
      act({}),
      act({ active: undefined }),
      act({ active: null }),
      act({ active: false }),
      act({ active: () => true }),
      act({ active: () => 1 }),
      act({ active: () => false }),
      act({ active: () => 0 }),
      act({ active: () => '' }),
      act({ active: () => null }),
      act({ active: () => { throw new Error('boom') } }),
    ],
    [true, true, true, true, true, true, false, false, false, false, false])
}

// ---- 5. _shortcuts_sections --------------------------------------------------------------------
{
  const p = makePage()
  const ev = p.evaluate()
  let activeCalls = 0
  const added = {
    first: [
      { keys: 'a', does: 'win yes', active: () => (activeCalls++, true) },
      { keys: 'b', does: 'win no', active: () => (activeCalls++, false) },
      { keys: 'c', does: 'win throws', active: () => { activeCalls++; throw new Error('gone') } },
      null,
      undefined,
      'not an object',
      42,
    ],
    notAList: 'broken',
    alsoBad: { keys: 'z', does: 'obj not array' },
    nullSec: null,
    onlyInactive: [{ keys: 'i', does: 'off', active: () => false }],
    second: [
      { keys: 'e', does: 'ed', context: ['box', 'editor'] },
      { keys: 'x', does: 'everywhere', context: 'all', active: () => true },
    ],
  }
  const summary = (ctx, now, reg) =>
    ev('_shortcuts_sections(__arg[0], __arg[1], __arg[2])', [ctx, now, reg]).map(([name, list]) => [
      name,
      list.map(e => e.keys),
    ])
  const refWindow = summary('window', false, added)
  const callsAfterRef = activeCalls
  const nowWindow = summary('window', true, added)
  const nowBox = summary('box', true, added)
  const refEditor = summary('editor', false, added)
  const refAll = summary('all', false, added)
  const badRegs = [null, undefined, 'str', 123].map(r => summary('window', false, r))
  check('_shortcuts_sections: preserves section order, skips non-list sections and non-object entries, drops empty views, filters active on now only',
    [refWindow, callsAfterRef, nowWindow, nowBox, refEditor, refAll, badRegs],
    [
      [['first', ['a', 'b', 'c']], ['onlyInactive', ['i']], ['second', ['x']]],
      0,
      [['first', ['a']], ['second', ['x']]],
      [['second', ['e', 'x']]],
      [['second', ['e', 'x']]],
      [['first', ['a', 'b', 'c']], ['onlyInactive', ['i']], ['second', ['e', 'x']]],
      [[], [], [], []],
    ])
}

// ---- 6. _shortcuts_html: views, marked tab, hint span, where line, when brackets, none, taken --
{
  const p = makePage()
  const ev = p.evaluate()
  let predicateCalls = 0
  const added = {
    alpha: [
      { keys: 'j', does: 'next row', when: 'a row is selected', active: () => (predicateCalls++, true) },
      { keys: 'd', does: 'done', when: 'a todo is selected', active: () => (predicateCalls++, false) },
      { keys: 'g', does: 'go now', active: () => (predicateCalls++, true) },
    ],
    beta: [{ keys: 't', does: 'type', when: 'in box', context: 'box', active: () => (predicateCalls++, true) }],
  }
  const html = (view, ctx, reg = added, taken = null) =>
    ev('_shortcuts_html(__arg[0], __arg[1], __arg[2], __arg[3])', [view, ctx, reg, taken])
  const onTabs = h => [...h.matchAll(/<button[^>]*data-view="([^"]+)"[^>]*class="on"[^>]*>/g)].map(m => m[1])
  const allTabs = h =>
    [...h.matchAll(/<button type="button" data-view="([^"]+)"(?: class="on")? onclick="event\.stopPropagation\(\);window\._shortcuts_menu\?\.show\(this\.dataset\.view\)">([^<]+)<\/button>/g)].map(
      m => [m[1], m[2]],
    )
  const whereOf = h => h.match(/<div class="where">([^<]+)<\/div>/)?.[1] ?? null
  const noneOf = h => h.match(/<div class="none">([^<]+)<\/div>/)?.[1] ?? null

  const nowWin = html('now', 'window')
  const nowBox = html('now', 'box')
  const nowEd = html('now', 'editor')
  const nowUnknown = html('now', 'other')
  const refWin = html('window', 'window')
  const refBox = html('box', 'window')
  const refEd = html('editor', 'window')
  const refAll = html('all', 'window')

  const expectedTabs = ['now', 'window', 'box', 'editor', 'all'].map(v => [v, v])
  check('_shortcuts_html: tabs list all five views with stopPropagation onclick, arrow hint span, and mark only the active view',
    [
      allTabs(nowWin),
      nowWin.includes('<span class="hint">&larr; &rarr;</span></div>'),
      onTabs(nowWin),
      onTabs(refWin),
      onTabs(refBox),
      onTabs(refEd),
      onTabs(refAll),
    ],
    [expectedTabs, true, ['now'], ['window'], ['box'], ['editor'], ['all']])

  check('_shortcuts_html: where line appears on now alone (for window, box, editor, and fallback), absent on reference views',
    [whereOf(nowWin), whereOf(nowBox), whereOf(nowEd), whereOf(nowUnknown), whereOf(refWin), whereOf(refBox), whereOf(refEd), whereOf(refAll)],
    [
      'what the keys do right now, in the window',
      'what the keys do right now, in the box',
      "what the keys do right now, in an item's editor",
      'what the keys do right now, in the window',
      null,
      null,
      null,
      null,
    ])

  check('_shortcuts_html: when appears in brackets in reference views alone (omitted when absent and on now)',
    [
      nowWin.includes('<span class="when">'),
      nowWin.includes('a row is selected'),
      nowWin.includes('<td>next row</td>'),
      nowWin.includes('<td>go now</td>'),
      nowWin.includes('done'),
      refWin.includes('<td>next row<span class="when"> (a row is selected)</span></td>'),
      refWin.includes('<td>done<span class="when"> (a todo is selected)</span></td>'),
      refWin.includes('<td>go now</td>'),
      refAll.includes('<td>type<span class="when"> (in box)</span></td>'),
    ],
    [false, false, true, true, false, true, true, true, true])

  check('_shortcuts_html: empty now and empty reference view show their distinct none lines',
    [noneOf(nowEd), noneOf(refEd), noneOf(html('now', 'window', {})), noneOf(html('all', 'window', {}))],
    [
      'no shortcut of an item does anything here right now',
      'no item has added a shortcut for this context',
      'no shortcut of an item does anything here right now',
      'no item has added a shortcut for this context',
    ])

  // taken parameter (including empty []) bypasses re-asking active() on now
  const callsBeforeTaken = predicateCalls
  const fromTaken = html('now', 'window', added, [['snap', [{ keys: 's', does: 'from snapshot' }]]])
  const fromEmptyTaken = html('now', 'window', added, [])
  check('_shortcuts_html: taken snapshot (non-empty or empty []) is rendered on now without re-calling active',
    [
      predicateCalls - callsBeforeTaken,
      fromTaken.includes('from snapshot'),
      fromTaken.includes('next row'),
      noneOf(fromEmptyTaken),
    ],
    [0, true, false, 'no shortcut of an item does anything here right now'])
}

// ---- 7. hostile texts in section name, keys, does, and when ------------------------------------
{
  const p = makePage()
  const ev = p.evaluate()
  const dblLt = '<'.repeat(2)
  const payloads = [
    '<img src=x onerror=alert(1)>',
    '<div onmouseover="alert(1)">hover</div>',
    '<script>alert(1)</script>',
    '<img src="https://evil.example/a.png">',
    '[click](https://evil.example/link)',
    '![pic](https://evil.example/b.png)',
    `${dblLt}macro_call()>>`,
    '#secret_tag',
    '"double" & \'single\'',
    'first line\n\n# heading\n![img](https://evil.example/c.png)\n[link](http://evil.example/d)\n<script>alert(2)</script>',
  ]
  const joinedHostile = payloads.join(' | ')
  const reg = {
    [joinedHostile]: payloads.map((txt, i) => ({
      keys: txt,
      does: `d${i}: ${txt}`,
      when: `w${i}: ${txt}`,
      active: () => true,
    })),
  }
  const refHtml = ev('_shortcuts_html(__arg[0], __arg[1], __arg[2])', ['all', 'window', reg])
  const nowHtml = ev('_shortcuts_html(__arg[0], __arg[1], __arg[2])', ['now', 'window', reg])

  const countTags = h => {
    const counts = {}
    for (const m of h.matchAll(/<\/?([a-zA-Z0-9-]+)/g)) {
      const tag = m[1].toLowerCase()
      counts[tag] = (counts[tag] ?? 0) + 1
    }
    return counts
  }
  const n = payloads.length
  // Expected tag pairs (opening + closing):
  // div: outer + tabs + section + name (+ where in now) -> 4*2=8 in ref, 5*2=10 in now
  // button: 5*2=10; table: 1*2=2; tr: n*2; td: n*4; span: (n + 1 hint)*2 in ref, (1 hint)*2 in now
  const expectedRefTags = { div: 8, button: 10, span: (n + 1) * 2, table: 2, tr: n * 2, td: n * 4 }
  const expectedNowTags = { div: 10, button: 10, span: 2, table: 2, tr: n * 2, td: n * 4 }
  const expectedEscaped = s => lodashEscape(String(s).replace(/\s+/g, ' ')).replace(/:\/\//g, '&#58;//')
  const allEscapedPresentRef =
    refHtml.includes(`<div class="name">${expectedEscaped(joinedHostile)}</div>`) &&
    payloads.every((txt, i) =>
      refHtml.includes(`<td class="keys">${expectedEscaped(txt)}</td>`) &&
      refHtml.includes(`<td>${expectedEscaped(`d${i}: ${txt}`)}<span class="when"> (${expectedEscaped(`w${i}: ${txt}`)})</span></td>`),
    )
  const allEscapedPresentNow =
    nowHtml.includes(`<div class="name">${expectedEscaped(joinedHostile)}</div>`) &&
    payloads.every((txt, i) =>
      nowHtml.includes(`<td class="keys">${expectedEscaped(txt)}</td>`) &&
      nowHtml.includes(`<td>${expectedEscaped(`d${i}: ${txt}`)}</td>`),
    )
  check('hostile texts: single line, exact menu tag counts only (no script/img/a/extra div), every payload escaped in name, keys, does, and when',
    [
      !/[\r\n]/.test(refHtml),
      !/[\r\n]/.test(nowHtml),
      countTags(refHtml),
      countTags(nowHtml),
      allEscapedPresentRef,
      allEscapedPresentNow,
    ],
    [true, true, expectedRefTags, expectedNowTags, true, true])

  // Corroboration through part of the app's Modal.svelte pipeline (marked + marked-extended-tables +
  // replaceNakedURLs, WITHOUT the app's wiki-link extension; the browser row in mind.page
  // tests/e2e/tasks.spec.ts is the evidence for the complete dialog pipeline).
  // Skips ONLY when MIND_PAGE_DIR is unset and the sibling mind.page checkout is absent; if the
  // checkout is present (or MIND_PAGE_DIR is set), any missing module or broken extraction FAILS.
  const appDir = process.env.MIND_PAGE_DIR ?? path.join(__dirname, '..', '..', 'mind.page')
  const checkoutPresent = fs.existsSync(path.join(appDir, 'package.json'))
  if (!checkoutPresent && !process.env.MIND_PAGE_DIR) {
    console.log('skip partial Modal.svelte pipeline corroboration (sibling mind.page checkout absent; set MIND_PAGE_DIR)')
  } else {
    const { Marked } = require(path.join(appDir, 'node_modules', 'marked'))
    const tables = require(path.join(appDir, 'src', 'vendor', 'marked-extended-tables.js')).default
    const utilSrc = fs.readFileSync(path.join(appDir, 'src', 'util.js'), 'utf8')
    const modalSrc = fs.readFileSync(path.join(appDir, 'src', 'components', 'Modal.svelte'), 'utf8')
    const entityMatch = utilSrc.match(/export (const escapedUrlEntity = [^\n]+)/)
    const charMatch = utilSrc.match(/export (const escapedUrlChar = [^\n]+)/)
    const replaceMatch = modalSrc.match(/function replaceNakedURLs\(text\) \{[\s\S]*?\n  \}/)
    if (!entityMatch || !charMatch || !replaceMatch) {
      throw new Error(`failed to extract Modal.svelte/util.js pipeline helpers from ${appDir}`)
    }
    const mCtx = vm.createContext({ URL })
    vm.runInContext(`${entityMatch[1]}\n${charMatch[1]}\n${replaceMatch[0]}`, mCtx)
    const realMarked = new Marked({ gfm: true })
    realMarked.use(tables())
    const modalRender = content => mCtx.replaceNakedURLs(realMarked.parse(content, { breaks: true }))
    const renderedRef = modalRender(refHtml)
    const renderedNow = modalRender(nowHtml)
    check('hostile texts (corroboration: partial Modal.svelte marked+replaceNakedURLs pipeline without wiki-links; browser row is complete evidence)',
      [countTags(renderedRef), countTags(renderedNow), /<a\b|<img\b|<script\b/i.test(renderedRef + renderedNow)],
      [expectedRefTags, expectedNowTags, false])
  }
}

// ---- 8. controller: reconcile, hooks, listener rules, held key, steer, snapshot, dispose, watch -
{
  // 8a. no document: _shortcuts_reconcile and _shortcuts_watch are no-ops
  const noDocPage = makePage({ noDoc: true })
  const evNoDoc = noDocPage.evaluate()
  evNoDoc('_shortcuts_reconcile()')
  evNoDoc('_shortcuts_watch()')
  check('reconcile & watch: no document does nothing',
    [noDocPage.win._shortcuts_menu ?? null, noDocPage.listeners.length, Object.keys(noDocPage.tasks)],
    [null, 0, []])

  // 8b. reconcile & hooks
  const p = makePage()
  p.items['#shortcuts'] = null // ambiguous or missing
  const evMissing = p.evaluate({ id: 'sc-1', deephash: 'h1' })
  evMissing('_shortcuts_reconcile()')
  const afterMissing = [p.win._shortcuts_menu ?? null, p.headChildren.length, p.listeners.length]

  p.items['#shortcuts'] = { id: 'sc-1' }
  evMissing('_on_welcome()')
  const ctrl1 = p.win._shortcuts_menu
  const afterCreate = [
    !!ctrl1,
    ctrl1.item,
    ctrl1.code,
    p.headChildren.length,
    p.headChildren[0]?.dataset.shortcuts,
    p.listeners.length,
    p.listeners.map(l => [l.target, l.type, l.capture]),
  ]

  // another item with different id cannot hijack or dispose sc-1's controller
  const evOther = p.evaluate({ id: 'sc-other', deephash: 'h-other' })
  evOther('_shortcuts_reconcile()')
  const afterOther = [p.win._shortcuts_menu === ctrl1, ctrl1.disposed]

  // same code and item: reconcile keeps the controller without duplicating style/listener
  evMissing('_on_item_change("other-id")')
  evMissing('_on_item_change("sc-1")')
  const afterSame = [p.win._shortcuts_menu === ctrl1, p.headChildren.length, p.listeners.length]

  // different code for the same item: replaces and disposes the old controller
  const evV2 = p.evaluate({ id: 'sc-1', deephash: 'h2' })
  evV2('_on_item_change("sc-1")')
  const ctrl2 = p.win._shortcuts_menu
  const afterReplace = [ctrl1.disposed, ctrl2 !== ctrl1, ctrl2.code, p.headChildren.length, p.listeners.length]

  // item loses the #shortcuts label: reconciling it disposes its own controller
  p.items['#shortcuts'] = null
  evV2('_shortcuts_reconcile()')
  const afterLostName = [ctrl2.disposed, p.win._shortcuts_menu ?? null, p.headChildren.length, p.listeners.length]

  check('reconcile & hooks: creates only for current #shortcuts, keeps on same code, ignores other item change, replaces on new code, disposes when losing name',
    [afterMissing, afterCreate, afterOther, afterSame, afterReplace, afterLostName],
    [
      [null, 0, 0],
      [true, 'sc-1', 'h1', 1, 'style', 2, [['document', 'keydown', true], ['document', 'keyup', true]]],
      [true, false],
      [true, 1, 2],
      [true, true, 'h2', 1, 2],
      [true, null, 0, 0],
    ])
}

// 8c. listener rules one by one (with recording modal)
{
  const p = makePage()
  p.win._shortcuts = {
    demo: [
      { keys: 'w', does: 'win action', active: () => true },
      { keys: 'b', does: 'box action', context: 'box', active: () => true },
      { keys: 'e', does: 'ed action', context: 'editor', active: () => true },
    ],
  }
  const ev = p.evaluate({ id: 'sc-1', deephash: 'h1' })
  ev('_on_welcome()')
  const ctrl = p.win._shortcuts_menu

  // unrelated key
  const evA = p.fireKey({ key: 'a', code: 'KeyA' })
  const afterUnrelated = [evA.prevented, evA.stoppedImmediate, p.modalLog.length]

  // held repeat while closed in window: claims key (prevents/stops) but does NOT open
  const evRepClosed = p.fireKey({ key: '?', code: 'Slash', shiftKey: true, repeat: true })
  const afterRepClosed = [evRepClosed.prevented, evRepClosed.stoppedImmediate, p.modalLog.length, ctrl.open()]

  // plain ? in window opens on now in window
  const evOpenWin = p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const openedHtml = p.modalLog.at(-1)?.[2] ?? ''
  const afterOpenWin = [
    evOpenWin.prevented,
    evOpenWin.stoppedImmediate,
    ctrl.open(),
    openedHtml.includes('data-view="now" data-context="window"'),
    openedHtml.includes('win action'),
    openedHtml.includes('box action'),
  ]

  // switching views via ctrl.show updates modal in place and keeps context
  ctrl.show('all')
  const afterUpdate = [p.modalLog.at(-1)?.[0], p.modalLog.at(-1)?.[2].includes('data-view="all" data-context="window"')]

  // held repeat while open: claims key (prevents/stops) but does NOT close
  const evRepOpen = p.fireKey({ key: '?', code: 'Slash', shiftKey: true, repeat: true })
  const afterRepOpen = [evRepOpen.prevented, evRepOpen.stoppedImmediate, ctrl.open()]

  // ? while open closes it
  const evClose = p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const afterClose = [evClose.prevented, evClose.stoppedImmediate, ctrl.open(), p.modalLog.at(-1)?.[0]]

  // another dialog visible: ? does nothing (plain or with Ctrl)
  const foreignModal = { id: 999 }
  p.setVisibleModal(foreignModal)
  const modalsBeforeForeign = p.modalLog.length
  const evForeign1 = p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const evForeign2 = p.fireKey({ key: '?', code: 'Slash', shiftKey: true, ctrlKey: true })
  const afterForeign = [
    evForeign1.prevented,
    evForeign1.stoppedImmediate,
    evForeign2.prevented,
    evForeign2.stoppedImmediate,
    p.modalLog.length - modalsBeforeForeign,
    p.getVisibleModal() === foreignModal,
  ]
  p.setVisibleModal(null)

  // in box: plain ? ignored; Ctrl, Alt, Meta each open on now in box
  p.doc.activeElement = { id: 'textarea-mindbox', tagName: 'TEXTAREA' }
  const evBoxPlain = p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const boxPlainRes = [evBoxPlain.prevented, evBoxPlain.stoppedImmediate, ctrl.open()]
  const boxModRes = []
  for (const mod of [{ ctrlKey: true }, { altKey: true, key: '¿' }, { metaKey: true }]) {
    const e = p.fireKey({ key: '?', code: 'Slash', shiftKey: true, ...mod })
    const h = p.modalLog.at(-1)?.[2] ?? ''
    boxModRes.push([e.prevented, e.stoppedImmediate, ctrl.open(), h.includes('data-view="now" data-context="box"'), h.includes('box action')])
    ctrl.close()
  }

  // in editor fields (TEXTAREA, INPUT, SELECT, contentEditable): plain ? ignored; modifier opens in editor
  const editorFields = [
    { id: 'textarea-item-1', tagName: 'TEXTAREA' },
    { tagName: 'INPUT' },
    { tagName: 'SELECT' },
    { tagName: 'DIV', isContentEditable: true },
  ]
  const edPlainRes = []
  const edModRes = []
  for (const field of editorFields) {
    p.doc.activeElement = field
    const plain = p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
    edPlainRes.push([plain.prevented, plain.stoppedImmediate, ctrl.open()])
    const withMod = p.fireKey({ key: '?', code: 'Slash', shiftKey: true, ctrlKey: true })
    const h = p.modalLog.at(-1)?.[2] ?? ''
    edModRes.push([withMod.prevented, withMod.stoppedImmediate, ctrl.open(), h.includes('data-view="now" data-context="editor"'), h.includes('ed action')])
    ctrl.close()
  }

  check('listener: ignores unrelated keys, claims repeats without toggling, opens/updates/closes in window, yields to other dialogs',
    [afterUnrelated, afterRepClosed, afterOpenWin, afterUpdate, afterRepOpen, afterClose, afterForeign],
    [
      [0, 0, 0],
      [1, 1, 0, false],
      [1, 1, true, true, true, false],
      ['update', true],
      [1, 1, true],
      [1, 1, false, 'close'],
      [0, 0, 0, 0, 0, true],
    ])

  check('listener: in box and editor fields, plain ? passes through and Ctrl/Alt/Cmd opens on that context',
    [boxPlainRes, boxModRes, edPlainRes, edModRes],
    [
      [0, 0, false],
      [[1, 1, true, true, true], [1, 1, true, true, true], [1, 1, true, true, true]],
      editorFields.map(() => [0, 0, false]),
      editorFields.map(() => [1, 1, true, true, true]),
    ])
}

// 8d. held physical key across open/close in a field (including Shift released first and no-code keyboards)
{
  const p = makePage()
  const boxEl = { id: 'textarea-mindbox', tagName: 'TEXTAREA' }
  p.doc.activeElement = boxEl
  p.evaluate()('_on_welcome()')
  const ctrl = p.win._shortcuts_menu

  // A stray repeat in a field with no prior press taken passes through
  const strayRep = p.fireKey({ key: '?', code: 'Slash', shiftKey: true, repeat: true })
  const afterStray = [strayRep.prevented, strayRep.stoppedImmediate, ctrl.open(), ctrl.held]

  // Review sequence: open from field with modifier, close with Shift+Slash, release Shift first
  // so repeats carry '/' and shiftKey: false -> taken by physical key code
  const openEv = p.fireKey({ key: '?', code: 'Slash', shiftKey: true, ctrlKey: true })
  p.fireKeyUp({ key: '?', code: 'Slash', shiftKey: true, ctrlKey: true })
  p.fireKey({ key: 'Shift', code: 'ShiftLeft', shiftKey: true })
  const closeEv = p.fireKey({ key: '?', code: 'Slash', shiftKey: true, repeat: false })
  const modalsAfterClose = p.modalLog.length
  p.fireKeyUp({ key: 'Shift', code: 'ShiftLeft', shiftKey: false })
  const repSlash = p.fireKey({ key: '/', code: 'Slash', shiftKey: false, repeat: true })
  const afterShiftUpRep = [
    openEv.prevented,
    closeEv.prevented,
    p.doc.activeElement === boxEl,
    ctrl.held,
    repSlash.prevented,
    repSlash.stoppedImmediate,
    ctrl.open(),
    p.modalLog.length - modalsAfterClose,
  ]

  // Another key pressed and released meanwhile does NOT end the hold: next Slash repeat still taken
  const otherDown = p.fireKey({ key: 'a', code: 'KeyA', repeat: false })
  p.fireKeyUp({ key: 'a', code: 'KeyA' })
  const repAfterOther = p.fireKey({ key: '/', code: 'Slash', shiftKey: false, repeat: true })
  // A repeat of ANOTHER physical key sending '?' is NOT taken by the Slash hold
  const repOtherPhys = p.fireKey({ key: '?', code: 'Digit0', shiftKey: true, repeat: true })
  const afterIntervening = [
    otherDown.prevented,
    ctrl.held,
    repAfterOther.prevented,
    repAfterOther.stoppedImmediate,
    repOtherPhys.prevented,
    repOtherPhys.stoppedImmediate,
    ctrl.open(),
  ]

  // Releasing Slash ends the hold: subsequent repeat, fresh Slash, and fresh Shift+Slash all pass through
  p.fireKeyUp({ key: '/', code: 'Slash', shiftKey: false })
  const heldAfterRelease = ctrl.held
  const repAfterRelease = p.fireKey({ key: '/', code: 'Slash', shiftKey: false, repeat: true })
  const freshSlash = p.fireKey({ key: '/', code: 'Slash', shiftKey: false, repeat: false })
  const freshShiftSlash = p.fireKey({ key: '?', code: 'Slash', shiftKey: true, repeat: false })
  const afterRelease = [
    heldAfterRelease,
    repAfterRelease.prevented,
    repAfterRelease.stoppedImmediate,
    freshSlash.prevented,
    freshSlash.stoppedImmediate,
    freshShiftSlash.prevented,
    freshShiftSlash.stoppedImmediate,
    ctrl.open(),
  ]

  // Missed keyup: a fresh press of the SAME physical key ends the hold and passes through
  p.fireKey({ key: '?', code: 'Slash', shiftKey: true, ctrlKey: true })
  p.fireKey({ key: '?', code: 'Slash', shiftKey: true, repeat: false })
  const freshWithoutUp = p.fireKey({ key: '/', code: 'Slash', shiftKey: false, repeat: false })
  const repAfterFresh = p.fireKey({ key: '/', code: 'Slash', shiftKey: false, repeat: true })
  const afterMissedUp = [
    ctrl.held,
    freshWithoutUp.prevented,
    freshWithoutUp.stoppedImmediate,
    repAfterFresh.prevented,
    repAfterFresh.stoppedImmediate,
    ctrl.open(),
  ]

  // Keyboard that gives no e.code falls back to e.key for hold and release
  p.fireKey({ key: '?', code: '', shiftKey: true, ctrlKey: true })
  p.fireKeyUp({ key: '?', code: '', shiftKey: true, ctrlKey: true })
  p.fireKey({ key: '?', code: '', shiftKey: true, repeat: false })
  const noCodeHeld = ctrl.held
  const noCodeRep = p.fireKey({ key: '?', code: '', shiftKey: true, repeat: true })
  p.fireKeyUp({ key: '?', code: '', shiftKey: true })
  const noCodeAfterUp = ctrl.held
  const noCodeFresh = p.fireKey({ key: '?', code: '', shiftKey: true, repeat: false })
  const afterNoCode = [
    noCodeHeld,
    noCodeRep.prevented,
    noCodeRep.stoppedImmediate,
    noCodeAfterUp,
    noCodeFresh.prevented,
    noCodeFresh.stoppedImmediate,
    ctrl.open(),
  ]

  check('held key: physical key hold swallows slash repeats after Shift release, ignores intervening/other physical keys, ends on release or fresh press, and works without code',
    [afterStray, afterShiftUpRep, afterIntervening, afterRelease, afterMissedUp, afterNoCode],
    [
      [0, 0, false, null],
      [1, 1, true, 'Slash', 1, 1, false, 0],
      [0, 'Slash', 1, 1, 0, 0, false],
      [null, 0, 0, 0, 0, 0, 0, false],
      [null, 0, 0, 0, 0, false],
      ['?', 1, 1, null, 0, 0, false],
    ])
}

// 8e. menu keys while up (steer) and ignored while down
{
  const p = makePage()
  const scrollBox = { scrollTop: 0, clientHeight: 200, scrollHeight: 1000 }
  p.setMenuBox(scrollBox)
  p.evaluate()('_on_welcome()')
  const ctrl = p.win._shortcuts_menu

  // While menu is DOWN, none of the menu's navigation or scroll keys is read
  const steerKeys = [
    { key: 'ArrowLeft' },
    { key: 'ArrowRight' },
    { key: 'Tab' },
    { key: 'Tab', shiftKey: true },
    { key: 'ArrowUp' },
    { key: 'ArrowDown' },
    { key: 'PageUp' },
    { key: 'PageDown' },
    { key: ' ' },
    { key: ' ', shiftKey: true },
    { key: 'Home' },
    { key: 'End' },
  ]
  const downResults = steerKeys.map(k => {
    const e = p.fireKey(k)
    return [e.prevented, e.stoppedImmediate]
  })
  const downState = [downResults.every(([pr, st]) => pr === 0 && st === 0), p.modalLog.length, scrollBox.scrollTop]

  // Open menu on now
  p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const viewOf = () => (p.modalLog.at(-1)?.[2] ?? '').match(/data-view="([^"]+)"/)?.[1] ?? null

  // ArrowRight wraps through all five views; ArrowLeft wraps backwards; Tab and Shift+Tab wrap both ways
  const walk = []
  for (const k of [
    { key: 'ArrowRight' }, // window
    { key: 'ArrowRight' }, // box
    { key: 'ArrowRight' }, // editor
    { key: 'ArrowRight' }, // all
    { key: 'ArrowRight' }, // now (wrap)
    { key: 'ArrowLeft' }, // all (wrap)
    { key: 'ArrowLeft' }, // editor
    { key: 'Tab' }, // all
    { key: 'Tab' }, // now (wrap)
    { key: 'Tab', shiftKey: true }, // all (wrap)
    { key: 'Tab' }, // now
  ]) {
    const e = p.fireKey(k)
    walk.push([e.prevented, e.stoppedImmediate, viewOf()])
  }

  // Held ArrowRight switches once: repeat is claimed (prevented+stopped) without advancing
  const firstRight = p.fireKey({ key: 'ArrowRight', repeat: false })
  const viewAfterFirst = viewOf()
  const heldRight = p.fireKey({ key: 'ArrowRight', repeat: true })
  const viewAfterRepeat = viewOf()
  const heldArrowRes = [firstRight.prevented, heldRight.prevented, heldRight.stoppedImmediate, viewAfterFirst, viewAfterRepeat]

  // Scroll keys over the made-up box (clientHeight 200 -> page = 160, scrollHeight 1000)
  const scrollSteps = []
  for (const k of [
    { key: 'ArrowDown' }, // 40
    { key: 'ArrowUp' }, // 0
    { key: 'ArrowUp' }, // 0 (clamped)
    { key: 'PageDown' }, // 160
    { key: ' ' }, // 320
    { key: 'PageUp' }, // 160
    { key: ' ', shiftKey: true }, // 0
    { key: 'End' }, // 1000
    { key: 'Home' }, // 0
  ]) {
    const e = p.fireKey(k)
    scrollSteps.push([e.prevented, e.stoppedImmediate, scrollBox.scrollTop])
  }
  // Small box (clientHeight 20): page floors at 40
  const smallBox = { scrollTop: 0, clientHeight: 20, scrollHeight: 500 }
  p.setMenuBox(smallBox)
  p.fireKey({ key: 'PageDown' })
  const smallPage = smallBox.scrollTop
  p.setMenuBox(scrollBox)

  // Keys with Ctrl/Alt/Cmd and other keys (Escape, Enter, a) are left alone while menu is up
  const viewBeforeIgnored = viewOf()
  const modalsBeforeIgnored = p.modalLog.length
  const ignoredWhileUp = [
    { key: 'ArrowRight', ctrlKey: true },
    { key: 'ArrowRight', altKey: true },
    { key: 'ArrowRight', metaKey: true },
    { key: 'Tab', ctrlKey: true },
    { key: 'ArrowDown', metaKey: true },
    { key: ' ', ctrlKey: true },
    { key: 'Escape' },
    { key: 'Enter' },
    { key: 'a' },
  ].map(k => {
    const e = p.fireKey(k)
    return [e.prevented, e.stoppedImmediate]
  })
  const ignoredRes = [
    ignoredWhileUp.every(([pr, st]) => pr === 0 && st === 0),
    viewOf() === viewBeforeIgnored,
    p.modalLog.length === modalsBeforeIgnored,
    scrollBox.scrollTop === 0,
  ]

  check('menu keys (steer): ignored while down; arrows/Tab wrap views once per press; scroll keys move box; modified and other keys left alone',
    [downState, walk, heldArrowRes, scrollSteps, smallPage, ignoredRes],
    [
      [true, 0, 0],
      [
        [1, 1, 'window'],
        [1, 1, 'box'],
        [1, 1, 'editor'],
        [1, 1, 'all'],
        [1, 1, 'now'],
        [1, 1, 'all'],
        [1, 1, 'editor'],
        [1, 1, 'all'],
        [1, 1, 'now'],
        [1, 1, 'all'],
        [1, 1, 'now'],
      ],
      [1, 1, 1, 'window', 'window'],
      [
        [1, 1, 40],
        [1, 1, 0],
        [1, 1, 0],
        [1, 1, 160],
        [1, 1, 320],
        [1, 1, 160],
        [1, 1, 0],
        [1, 1, 1000],
        [1, 1, 0],
      ],
      40,
      [true, true, true, true],
    ])
}

// 8f. opening-time snapshot (taken) & unknown view fallback
{
  const p = makePage()
  const boxEl = { id: 'textarea-mindbox', tagName: 'TEXTAREA' }
  let activeCalls = 0
  let flag = true
  p.win._shortcuts = {
    snap: [
      {
        keys: 'q',
        does: 'box focused check',
        context: 'box',
        active: () => {
          activeCalls++
          return flag && p.doc.activeElement?.id === 'textarea-mindbox'
        },
      },
    ],
  }
  p.evaluate()('_on_welcome()')
  const ctrl = p.win._shortcuts_menu

  p.doc.activeElement = boxEl
  p.fireKey({ key: '?', code: 'Slash', shiftKey: true, ctrlKey: true })
  // Modal blurred activeElement on open; activeCalls must be 1 and entry present
  const afterOpen1 = [activeCalls, p.doc.activeElement, p.modalLog.at(-1)[2].includes('box focused check')]

  // Switch away and back to now, call show('now') again, and pass unknown view -> all reuse snapshot without calling active
  ctrl.show('window')
  ctrl.show('now')
  const afterReturnNow = [activeCalls, p.modalLog.at(-1)[2].includes('box focused check')]
  ctrl.show('now')
  const afterSecondNow = [activeCalls, p.modalLog.at(-1)[2].includes('box focused check')]
  ctrl.show('not-a-view')
  const unknownHtml = p.modalLog.at(-1)[2]
  const afterUnknown = [
    activeCalls,
    unknownHtml.includes('data-view="now"'),
    unknownHtml.includes('data-view="now" class="on"'),
    unknownHtml.includes('box focused check'),
  ]

  // Close and open again with flag=false: active() IS asked anew on the second opening
  ctrl.close()
  flag = false
  p.fireKey({ key: '?', code: 'Slash', shiftKey: true, ctrlKey: true })
  const afterOpen2 = [activeCalls, p.modalLog.at(-1)[2].includes('box focused check')]

  check('snapshot (taken) & unknown view: active asked once at opening, reused across view switches/repeat show/unknown view, re-asked on next opening',
    [afterOpen1, afterReturnNow, afterSecondNow, afterUnknown, afterOpen2],
    [
      [1, null, true],
      [1, true],
      [1, true],
      [1, true, true, true],
      [2, false],
    ])
}

// 8g. dispose (listener, style, open dialog, own window reference only, idempotence)
{
  const p = makePage()
  p.evaluate({ id: 'sc-1', deephash: 'h1' })('_on_welcome()')
  const ctrl = p.win._shortcuts_menu
  const listenersBeforeDispose = p.listeners.map(l => [l.target, l.type, l.capture])
  p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const openBeforeDispose = ctrl.open()
  ctrl.dispose()
  const closeCountAfter1 = p.modalLog.filter(e => e[0] == 'close').length
  ctrl.dispose() // idempotent
  const closeCountAfter2 = p.modalLog.filter(e => e[0] == 'close').length
  ctrl.show('now') // no-op when disposed
  const evAfterDispose = p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const removedListenLog = p.log.filter(x => x.startsWith('-listen:'))

  // dispose does not delete a different controller already installed on window._shortcuts_menu
  const pSwap = makePage()
  pSwap.evaluate({ id: 'sc-1', deephash: 'h1' })('_on_welcome()')
  const firstCtrl = pSwap.win._shortcuts_menu
  const foreignCtrl = { id: 'replacement' }
  pSwap.win._shortcuts_menu = foreignCtrl
  firstCtrl.dispose()
  const keptForeign = pSwap.win._shortcuts_menu === foreignCtrl

  check('dispose: closes open dialog, removes document keydown and keyup listeners and style, clears own window ref only, and is idempotent',
    [
      listenersBeforeDispose,
      openBeforeDispose,
      ctrl.disposed,
      ctrl.open(),
      closeCountAfter1,
      closeCountAfter2,
      p.headChildren.length,
      p.listeners.length,
      removedListenLog,
      p.win._shortcuts_menu ?? null,
      evAfterDispose.prevented,
      keptForeign,
    ],
    [
      [['document', 'keydown', true], ['document', 'keyup', true]],
      true,
      true,
      false,
      1,
      1,
      0,
      0,
      ['-listen:document:keydown:true', '-listen:document:keyup:true'],
      null,
      0,
      true,
    ])
}

// 8h. watch (_shortcuts_watch, _shortcuts_live, _shortcuts_end): recovery after duplicate label,
//     two items at welcome, re-watch of same code, code update, code removed, and deleted item
{
  // (1) One item alone -> kept at ticks -> second item appears (retires controller, keeps task) -> alone again (recreates controller)
  const p = makePage()
  const ev1 = p.evaluate({ id: 'sc-1', deephash: 'h1' })
  ev1('_on_welcome()')
  const c1 = p.win._shortcuts_menu
  const t1 = p.tasks.shortcuts
  const tickAlone = p.runTask('shortcuts')
  const stateAlone = [!!c1, t1.delay, t1.repeat, tickAlone === undefined, p.win._shortcuts_menu === c1, !c1.disposed]

  // Second item takes the name (#shortcuts becomes ambiguous)
  p.items['#shortcuts'] = null
  const tickDup = p.runTask('shortcuts')
  const stateDup = [tickDup === undefined, c1.disposed, p.win._shortcuts_menu ?? null, p.tasks.shortcuts === t1, p.listeners.length, p.headChildren.length]

  // Second item goes away: item is alone again -> next tick recreates controller
  p.items['#shortcuts'] = { id: 'sc-1' }
  const tickBack = p.runTask('shortcuts')
  const cBack = p.win._shortcuts_menu
  const stateBack = [tickBack === undefined, !!cBack && cBack !== c1, !cBack.disposed, p.listeners.length, p.headChildren.length]

  // (2) New watch of the SAME code at a later hook: earlier task cancelled, controller untouched, one task left
  const ev1Again = p.evaluate({ id: 'sc-1', deephash: 'h1' })
  ev1Again('_on_item_change("sc-1")')
  const t2 = p.tasks.shortcuts
  const stateRewatch = [t2 !== t1, p.win._shortcuts_menu === cBack, !cBack.disposed, Object.keys(p.tasks).length, p.listeners.length]

  // (3) Update to OTHER code: old controller disposed, new controller created, old task's _shortcuts_end touches nothing of new one
  const ev2 = p.evaluate({ id: 'sc-1', deephash: 'h2' })
  ev2._this.setHash('h2')
  ev1Again._this.setHash('h2') // item's live deephash is now h2 when old task's _on_cancel runs
  ev2('_on_item_change("sc-1")')
  const cNew = p.win._shortcuts_menu
  const stateUpdate = [cBack.disposed, !!cNew && cNew !== cBack, cNew.code, !cNew.disposed, p.listeners.length, p.headChildren.length]

  // (4) Text saved without this code: next tick sees _shortcuts_live() == false, returns null -> self-cancels and disposes controller
  ev2._this.setHash('h3')
  const tickGoneCode = p.runTask('shortcuts')
  const stateCodeGone = [tickGoneCode, !p.tasks.shortcuts, cNew.disposed, p.win._shortcuts_menu ?? null, p.listeners.length, p.headChildren.length]

  // (5) Two items of the name at welcome: none created, task runs; once alone, controller created at next tick
  const p2 = makePage()
  p2.items['#shortcuts'] = null
  p2.evaluate({ id: 'sc-1', deephash: 'h1' })('_on_welcome()')
  const atDupWelcome = [p2.win._shortcuts_menu ?? null, !!p2.tasks.shortcuts, p2.listeners.length]
  p2.items['#shortcuts'] = { id: 'sc-1' }
  p2.runTask('shortcuts')
  const afterDupWelcomeCleared = [!!p2.win._shortcuts_menu, !p2.win._shortcuts_menu?.disposed, p2.listeners.length]

  // (6) Item gone (handle getters throw): app cancels task -> _shortcuts_end disposes controller without throwing
  let deleted = false
  const p3 = makePage()
  p3.evaluate({
    id: 'sc-1',
    idFn: () => {
      if (deleted) throw new Error('deleted item id')
      return 'sc-1'
    },
    deephashFn: () => {
      if (deleted) throw new Error('deleted item deephash')
      return 'h1'
    },
  })('_on_welcome()')
  const cDel = p3.win._shortcuts_menu
  deleted = true
  p3.cancelTask('shortcuts')
  const stateDeleted = [cDel.disposed, p3.win._shortcuts_menu ?? null, p3.listeners.length, p3.headChildren.length]

  check('watch: stays alive on duplicate and recovers when alone (also from duplicate welcome); re-watch keeps live controller; update/code-removal/deletion dispose cleanly',
    [stateAlone, stateDup, stateBack, stateRewatch, stateUpdate, stateCodeGone, atDupWelcome, afterDupWelcomeCleared, stateDeleted],
    [
      [true, 15000, 15000, true, true, true],
      [true, true, null, true, 0, 0],
      [true, true, true, 2, 1],
      [true, true, true, 1, 2],
      [true, true, 'h2', true, 2, 1],
      [null, true, true, null, 0, 0],
      [null, true, 0],
      [true, true, 2],
      [true, null, 0, 0],
    ])
}

// 8i. document capture: menu listens on document (not window), yields to a capturing window
//     listener added after it, opens and steers when no such listener is present, and removes
//     both listeners from document at dispose
{
  const p = makePage()
  const scrollBox = { scrollTop: 0, clientHeight: 200, scrollHeight: 1000 }
  p.setMenuBox(scrollBox)
  p.win._shortcuts = { demo: [{ keys: 'g', does: 'go', active: () => true }] }
  p.evaluate({ id: 'sc-1', deephash: 'h1' })('_on_welcome()')
  const ctrl = p.win._shortcuts_menu

  const registered = [
    p.winListeners.length,
    p.docListeners.map(l => [l.type, l.capture]),
  ]

  // A capturing window listener added AFTER the menu (as a full-window view overlay does) runs first
  let overlayCount = 0
  const overlay = e => {
    e.stopImmediatePropagation()
    if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) overlayCount++
  }
  p.win.addEventListener('keydown', overlay, true)
  const evBlocked = p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const whileOverlayUp = [overlayCount, evBlocked.stoppedImmediate, evBlocked.prevented, ctrl.open(), p.modalLog.length]

  // Removing the window capturing listener lets ? open the menu and its own keys work as before
  p.win.removeEventListener('keydown', overlay, true)
  const evOpened = p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const viewOf = () => (p.modalLog.at(-1)?.[2] ?? '').match(/data-view="([^"]+)"/)?.[1] ?? null
  const afterOpen = [overlayCount, evOpened.prevented, evOpened.stoppedImmediate, ctrl.open(), viewOf()]

  const evRight = p.fireKey({ key: 'ArrowRight' })
  const viewAfterRight = viewOf()
  const evDown = p.fireKey({ key: 'ArrowDown' })
  const evClosed = p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const afterSteerAndClose = [
    evRight.prevented,
    evRight.stoppedImmediate,
    viewAfterRight,
    evDown.prevented,
    evDown.stoppedImmediate,
    scrollBox.scrollTop,
    evClosed.prevented,
    ctrl.open(),
  ]

  ctrl.dispose()
  const evAfterDispose = p.fireKey({ key: '?', code: 'Slash', shiftKey: true })
  const afterDispose = [
    p.docListeners.length,
    p.winListeners.length,
    p.log.filter(x => x.startsWith('-listen:document:')),
    evAfterDispose.prevented,
    ctrl.open(),
  ]

  check('document capture: listens on document (not window), yields to later window capture listener, steers without it, and disposes from document',
    [registered, whileOverlayUp, afterOpen, afterSteerAndClose, afterDispose],
    [
      [0, [['keydown', true], ['keyup', true]]],
      [1, 1, 0, false, 0],
      [1, 1, 1, true, 'now'],
      [1, 1, 'window', 1, 1, 40, 1, false],
      [0, 0, ['-listen:document:keydown:true', '-listen:document:keyup:true'], 0, false],
    ])
}

console.log(failures ? `${failures} failure(s)` : 'all ok')
process.exit(failures ? 1 : 0)
