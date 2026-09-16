#!/usr/bin/env node
// plain-node table for the todoer's task helpers (todoer.js; design: the vault's
// notes/design/mind_task_agents.md 2.2-2.4): the list a todo belongs to under the bridge's
// projection and this tab's pending overlay, the coarse age, the marker written on the todo line
// on its snippet side (suffix and prefix modes, replacement and removal, the whole-text mode
// decision, a marker-only suffix line), and the snippet rule accepting a bracketed word after
// the tag. The helpers are evaluated from the source under a stub environment whose
// `_replace_tags` applies the pattern over the raw text with the app's tag delimiter (the real
// helper also skips code blocks and html; not exercised here).
// run: node external/mind.items/tests/todoer_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const src = fs.readFileSync(path.join(__dirname, '..', 'todoer.js'), 'utf8')
const pick = names => names.map(name => {
  const m = src.match(new RegExp(`\\n(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}\\n`))
  if (!m) throw new Error(`function ${name} not found in todoer.js`)
  return m[0]
})
const consts = ['_pending_commands', 'TODOER_VERSION', 'HGRAB_RADIUS', 'HGRAB_RATIO'].map(name => src.match(new RegExp(`\\nconst ${name} = [^\\n]*\\n`))[0]).join('')
const delimiter = '[\\s<>&?!,.;:"\'`(){}\\[\\]]'
const context = {
  console,
  _replace_tags: (text, pattern, fn) => {
    const re = new RegExp(pattern + `(?=${delimiter}|$)`, 'gu')
    let m
    while ((m = re.exec(text))) fn(m[0], m.index)
    return text
  },
  error: () => {},
  warn: () => {},
  fatal: msg => { throw new Error(msg) },
  _todoer: { store: {} },
  crypto: { getRandomValues: a => a.fill(7) },
  Sortable: { dragged: null }, // the row of the pending press, as Sortable exposes it
  PointerEvent: class {}, // present: the grab follows the touch through pointer events
}
vm.createContext(context)
vm.runInContext(
  pick([
    '_task_state',
    '_task_list',
    '_age',
    '_stats_suffix',
    '_age_title',
    '_snippet_uses_suffix',
    '_todo_offset',
    '_set_marker',
    '_without_log',
    '_extract_todo_snippet',
    '_todo_line',
    '_merged_order',
    '_suppress_touch_context_menu',
    '_order_blocked',
    '_sideways',
    '_grab_on_sideways_touch',
    '_delegated_view',
    '_clear_pending',
    '_rerender_todoer_widgets',
  ]).join('\n') +
    consts +
    src.match(/\nasync function _enqueue_command\([^\n]*\) \{[\s\S]*?\n\}\n/)[0],
  context
)
const { _task_list, _age, _stats_suffix, _age_title, _set_marker, _extract_todo_snippet, _todo_line, _delegated_view, _enqueue_command, _merged_order, _order_blocked, _suppress_touch_context_menu, _sideways, _grab_on_sideways_touch } = context
const TODOER_VERSION = vm.runInContext('TODOER_VERSION', context) // a const is not a context property
const HGRAB_RADIUS = vm.runInContext('HGRAB_RADIUS', context)
const HGRAB_RATIO = vm.runInContext('HGRAB_RATIO', context)
// a top-level `const` of the evaluated source is script-scoped, not a context property: read it in place
const _pending_commands = vm.runInContext('_pending_commands', context)

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// the list a todo belongs to
check('no record: main', _task_list(null, null), 'main')
check('agent-held: delegated', _task_list({ held: 'agent', acked: {} }, null), 'delegated')
check('owner-held: main', _task_list({ held: 'owner', acked: {} }, null), 'main')
check('pending delegate overlays an owner-held task', _task_list({ held: 'owner', acked: {} }, { id: 'c1', kind: 'delegate' }), 'delegated')
check('pending take-back overlays an agent-held task', _task_list({ held: 'agent', acked: {} }, { id: 'c2', kind: 'takeback' }), 'main')
check('an acknowledged command no longer overlays', _task_list({ held: 'agent', acked: { c2: 'stale' } }, { id: 'c2', kind: 'takeback' }), 'delegated')
check('pending delegate with no record yet', _task_list(null, { id: 'c1', kind: 'delegate' }), 'delegated')

// the age
const now = 1_700_000_000_000
check('age: no projection', _age(undefined, now), '?')
check('age: seconds', _age(now - 30_000, now), '<1m')
check('age: minutes', _age(now - 5 * 60_000, now), '5m')
check('age: hours', _age(now - 2 * 3_600_000, now), '2h')
check('age: days', _age(now - 3 * 86_400_000, now), '3d')
// the stats suffix (design 9.6): workers started and the summed cost, when the projection carries them
check('stats: none', _stats_suffix(undefined), '')
check('stats: zero', _stats_suffix({ turns: 1, workers: 0, active: 0, cost: 0, since: 0 }), '')
check('stats: workers and cost', _stats_suffix({ turns: 3, workers: 2, active: 1, cost: 14.5, since: now }), ' · 2w · $14.50')
check('stats: cost alone', _stats_suffix({ workers: 0, cost: 0.333 }), ' · $0.33')
check('stats: some unknown', _stats_suffix({ workers: 3, cost: 2, unknown: 1 }), ' · 3w · $2.00+?')
check('stats: only unknown', _stats_suffix({ workers: 1, cost: 0, unknown: 1 }), ' · 1w · $?')
// the subscription runtime's share (the vault's format_money twin): the chat footer's qualifier
check('stats: all on the subscription runtime', _stats_suffix({ workers: 2, cost: 14.5, sub: 14.5 }), ' · 2w · $14.50 (sub)')
check('stats: a part on the subscription runtime', _stats_suffix({ workers: 2, cost: 14.5, sub: 12.5 }), ' · 2w · $14.50 (sub $12.50)')
check('stats: all on the subscription runtime, some unknown', _stats_suffix({ cost: 14.5, unknown: 1, sub: 14.5 }), ' · $14.50+? (sub)')
check('stats: a share under a cent is none', _stats_suffix({ cost: 14.5, sub: 0.004 }), ' · $14.50')
check('stats: a remainder under a cent is all', _stats_suffix({ cost: 14.5, sub: 14.496 }), ' · $14.50 (sub)')
check('stats: only unknown carries no qualifier', _stats_suffix({ cost: 0, unknown: 1, sub: 0 }), ' · $?')
check('stats: an older projection without the share', _stats_suffix({ workers: 1, cost: 2 }), ' · 1w · $2.00')
check('age title: since', _age_title(now, { since: now - 60_000 }).split('\n').length, 2)
check('age title: no stats', _age_title(now, undefined).includes('\n'), false)
check('age title: unacknowledged', _age_title(undefined, undefined), 'not acknowledged yet')

// the marker on the todo line (design 2.4)
check('suffix: written after the tag', _set_marker('#todo fix the cache\nbody\n', 'delegated'), '#todo [delegated] fix the cache\nbody\n')
check('suffix: replaced', _set_marker('#todo [question] fix the cache\n', 'taken'), '#todo [taken] fix the cache\n')
check('suffix: removed', _set_marker('#todo [question] fix the cache\n', null), '#todo fix the cache\n')
check('prefix: written before the tag', _set_marker('fix the cache #todo\n', 'delegated'), 'fix the cache [delegated] #todo\n')
check('prefix: replaced', _set_marker('fix the cache [question] #todo\n', 'taken'), 'fix the cache [taken] #todo\n')
check('prefix: removed', _set_marker('fix the cache [question] #todo\n', null), 'fix the cache #todo\n')
check('a marker-only suffix line stays suffix', _set_marker('Context\n#todo [question]\n', 'taken'), 'Context\n#todo [taken]\n')
check('the whole text before the tag decides the mode', _set_marker('Context\n#todo\n', 'delegated'), 'Context\n[delegated] #todo\n')
check('the first tag only, later lines untouched', _set_marker('a #todo b\nc #todo d\n', 'working'), 'a #todo [working] b\nc #todo d\n')
check('no tag: unchanged', _set_marker('nothing here\n', 'working'), 'nothing here\n')
check('a bracketed word on the other side is the owner\'s', _set_marker('[x] #todo fix\n', 'working'), '[x] #todo [working] fix\n')
// a multiline todo: the text after the tag on LATER lines keeps suffix mode (the snippet shows
// them), so the marker goes after the tag on the todo line, where the snippet shows it
check('multiline: the following lines decide suffix mode', _set_marker('Context\n#todo\nFix the cache\n', 'delegated'), 'Context\n#todo [delegated]\nFix the cache\n')
check('multiline: replaced on the todo line', _set_marker('Context\n#todo [delegated]\nFix the cache\n', 'taken'), 'Context\n#todo [taken]\nFix the cache\n')
check('the delegated view: marker and route tag once', _delegated_view('#todo fix\nbody\n'), '#todo [delegated] fix\nbody\n#_agent/vault\n')
check('the delegated view: an existing route tag is kept single', _delegated_view('#todo [question] fix\nbody\n#_agent/vault\n'), '#todo [delegated] fix\nbody\n#_agent/vault\n')

// the snippet rule with a marker (the widget's own mode decision)
const item = text => ({ name: 'i', read: () => text })
check('snippet: suffix with a marker', _extract_todo_snippet(item('Context\n#todo [question]\n')), '#todo [question]\n')
check('snippet: suffix, marker and text', _extract_todo_snippet(item('#todo [working] fix\n')), '#todo [working] fix\n')
check('snippet: prefix keeps its marker', _extract_todo_snippet(item('fix [question] #todo\n')), 'fix [question] #todo')
check('snippet: prefix without a marker', _extract_todo_snippet(item('Context\n#todo\n')), 'Context\n#todo')
check('snippet: drops the _log block', _extract_todo_snippet(item('#todo hello\n\n```_log\nINFO: 1 handed back: done\n```\n#_agent/vault\n')), '#todo hello\n\n#_agent/vault\n')
check('snippet: drops the _log block before a prefix tag', _extract_todo_snippet(item('Fix the cache\n```_log\nINFO: 1 a\n```\n[question] #todo\n')), 'Fix the cache\n[question] #todo')
check('snippet: drops an empty _log block', _extract_todo_snippet(item('#todo hello\n```_log\n```\n')), '#todo hello\n')
check('snippet: the mode is decided with the log in place', _extract_todo_snippet(item(_set_marker('Fix the cache\n[question] #todo\n\n```_log\nINFO: 1 handed back: question\n```\nTry the returning device too\n#_agent/vault\n', 'delegated'))), 'Fix the cache\n[delegated] #todo')
check('snippet: multiline stays suffix', _extract_todo_snippet(item('Context\n#todo\nFix the cache\n')), '#todo\nFix the cache\n')

// the row click's selection: the todo line, raw bytes in the item, where the snippet (a display
// slice with the _log block dropped) need not be (the "could not find text" console error on a
// [done] task's row)
const done_task = '#todo [done] fix the cache\n- working\n    - the cache is fixed\n\n```_log\nINFO: 14:13 handed back: done\n```\n#_agent/vault\n'
const done_snippet = _extract_todo_snippet(item(done_task))
check('selection: the snippet of a done task is not in its text', done_task.includes(done_snippet.replace(/^[\s…]+|[\s…]+$/g, '')), false)
check('selection: the todo line is', _todo_line(done_snippet), '#todo [done] fix the cache')
check('selection: the todo line is in the text', done_task.includes(_todo_line(done_snippet)), true)
check('selection: suffix, the first line', _todo_line('#todo [working] fix\nbody line\n'), '#todo [working] fix')
check('selection: prefix, the last line', _todo_line('… Context\nfix the cache [question] #todo'), 'fix the cache [question] #todo')
check('selection: a truncated suffix keeps its line', _todo_line('#todo a very long line that the snippet cut …'), '#todo a very long line that the snippet cut')
check('selection: a one-line snippet is itself', _todo_line('#todo fix'), '#todo fix')
// through the extractor: a suffix whose later text ends in another tag is a suffix still (the
// first tag decides), and a look-alike tag before a prefix tag is not the tag
check('selection: a suffix ending in another tag', _todo_line(_extract_todo_snippet(item('#todo fix\ncontext #todo'))), '#todo fix')
check('selection: a look-alike tag before a prefix tag', _todo_line(_extract_todo_snippet(item('#todos\nfix #todo'))), 'fix #todo')
check('selection: a nested look-alike before a prefix tag', _todo_line(_extract_todo_snippet(item('#todo/nested\nfix #todo'))), 'fix #todo')
check('selection: a long todo line through the extractor', _todo_line(_extract_todo_snippet(item('#todo ' + 'word '.repeat(50) + 'end\nbody\n'))).startsWith('#todo word word'), true)

// the enqueue path's overlay across retries and failures (design 2.2): an older command's
// transport never replaces or clears a newer gesture's overlay; a retry keeps the document id
const deferred = () => {
  let reject
  const promise = new Promise((_, r) => (reject = r))
  promise.catch(() => {}) // observed by the caller's own catch
  return { promise, reject }
}
const writes = [] // [{name, id, retry}] in call order
const pending_writes = []
context.window = {
  _enqueue_hidden_document: async (name, cmd, retry_id) => {
    const d = deferred()
    const id = retry_id ?? 'doc-' + cmd.id
    writes.push({ name, id, retry: retry_id })
    pending_writes.push(d)
    return { id, written: d.promise }
  },
}
context.alert = () => {}
context.each = (xs, f) => (xs ?? []).forEach(f)
context._todoer.dependents = []
const tick = () => new Promise(r => setTimeout(r, 0))
;(async () => {
  const task = { id: 'i1', name: 'task', saved_id: 's1' }
  await _enqueue_command(task, { task: 's1', id: 'd1', kind: 'delegate', epoch: 0, at: 1, body: 'b' })
  await _enqueue_command(task, { task: 's1', id: 't1', kind: 'takeback', epoch: 0, at: 2 })
  check('the newest gesture holds the overlay', _pending_commands().i1, { id: 't1', kind: 'takeback' })
  pending_writes[0].reject(new Error('terminal')) // the older delegate's write fails once
  await tick()
  await tick()
  check('the retry keeps the document id', writes[2], { name: 'task_command_d1', id: 'doc-d1', retry: 'doc-d1' })
  check('the retry does not replace the newer take-back', _pending_commands().i1, { id: 't1', kind: 'takeback' })
  pending_writes[2].reject(new Error('terminal again')) // the retry fails too
  await tick()
  await tick()
  check('the final failure of the older command leaves the newer overlay', _pending_commands().i1, { id: 't1', kind: 'takeback' })
  pending_writes[1].reject(new Error('the take-back fails once'))
  await tick()
  await tick()
  pending_writes[3].reject(new Error('and again'))
  await tick()
  await tick()
  check('the newest command\'s final failure clears its own overlay', _pending_commands().i1, undefined)
  // a retry whose preparation throws clears the original overlay (the backfill), never a newer one
  await _enqueue_command(task, { task: 's1', id: 'd2', kind: 'delegate', epoch: 0, at: 3, body: 'b' })
  context.window._enqueue_hidden_document = async () => {
    throw new Error('cannot prepare')
  }
  pending_writes[4].reject(new Error('terminal'))
  await tick()
  await tick()
  check('a retry that cannot be prepared clears the command\'s own overlay', _pending_commands().i1, undefined)
  console.log(failures ? `${failures} FAILED` : 'all ok')
  process.exit(failures ? 1 : 0)
})()


// the saved order merges this tab's rows with the ids it does not show (design 6, 2026-09-12):
// a delivery-caused render reproduces the delivered string; a local change keeps unknown ids
// in place; a build older than the store's writer stops writing orders
check('order: a delivery reproduces the delivered string', _merged_order(['a', 'b'], 'a,x,b'), 'a,x,b')
check('order: a local reorder keeps an unknown id after the row it followed', _merged_order(['b', 'a'], 'a,x,b'), 'b,a,x')
check('order: a new local row lands where the DOM puts it', _merged_order(['a', 'n', 'b'], 'a,x,b'), 'a,x,n,b')
check('order: unknown ids before any known row lead', _merged_order(['a'], 'y,x,a'), 'y,x,a')
check('order: a row this tab lacks is an unknown id too, kept in place', _merged_order(['b'], 'a,x,b'), 'a,x,b')
check('order: nothing stored', _merged_order(['a', 'b'], undefined), 'a,b')
check('order: an empty DOM keeps the stored ids', _merged_order([], 'a,b'), 'a,b')
check('version: a newer writer blocks this build', _order_blocked({ version: TODOER_VERSION + 1 }), true)
check('version: the same or an older writer does not', [_order_blocked({ version: TODOER_VERSION }), _order_blocked({}), _order_blocked(undefined)], [false, false, false])

// the context menu on the list is prevented after a touch press and kept for every other
// origin (2026-09-12): the event's own pointer type decides where the browser provides it
// (Chromium), else the last press's origin, recorded by pointerdown or touchstart and cleared
// by a keyboard menu request or a mousedown (a touch's compatibility mousedown too: best effort)
{
  const handlers = {}
  const options = {}
  const list = { addEventListener: (type, fn, opts) => ((handlers[type] = fn), (options[type] = opts)) }
  _suppress_touch_context_menu(list)
  check('touch: the press listeners capture, touchstart passive', [options.pointerdown, options.touchstart, options.keydown, options.mousedown], [true, { capture: true, passive: true }, true, true])
  const menu = (e = {}) => {
    const event = { prevented: false, preventDefault() { this.prevented = true }, ...e }
    handlers.contextmenu(event)
    return event.prevented
  }
  handlers.pointerdown({ pointerType: 'touch' })
  check('touch: a long press prevents the context menu', menu(), true)
  handlers.pointerdown({ pointerType: 'mouse' })
  check('touch: a mouse press keeps the context menu', menu(), false)
  handlers.pointerdown({ pointerType: 'touch' })
  handlers.keydown({ key: 'F10', shiftKey: true })
  check('touch: a keyboard menu after a touch press is kept', menu(), false)
  handlers.pointerdown({ pointerType: 'pen' })
  handlers.touchstart({})
  check('touch: touchstart never overrides a pen classification', menu(), false)
  check('touch: the event\'s own pointer type decides where present', [menu({ pointerType: 'touch' }), menu({ pointerType: '' }), menu({ pointerType: 'mouse' })], [true, false, false])
  const legacy = {}
  const legacyList = { addEventListener: (type, fn) => (legacy[type] = fn) }
  _suppress_touch_context_menu(legacyList)
  const legacyMenu = () => {
    const event = { prevented: false, preventDefault() { this.prevented = true } }
    legacy.contextmenu(event)
    return event.prevented
  }
  legacy.touchstart({})
  check('touch: touchstart (no pointer events) prevents it', legacyMenu(), true)
  legacy.mousedown({ button: 2 })
  check('touch: a mousedown after touch (no pointer events) clears the fallback', legacyMenu(), false)
}

// a quick sideways touch grabs its row without the delay (2026-09-12): a primary touch that moved
// HGRAB_RADIUS px mostly sideways (HGRAB_RATIO) while its row's press is pending (Sortable.dragged
// a row of this list, not chosen yet) presses the row again through Sortable's press path with
// the delay at 0 at the touch's position, and from then on that touch's cancelable touchmove
// events are prevented; a move mostly up or down leaves the touch alone, for the rest of that touch;
// a second finger on this list, a mouse, or another pointer grab nothing; a press again that throws
// propagates with the delay restored
check('sideways: not moved enough is undecided', [_sideways(0, 0), _sideways(HGRAB_RADIUS - 1, 0), _sideways(0, 1 - HGRAB_RADIUS)], [null, null, null])
check('sideways: mostly sideways grabs', [_sideways(HGRAB_RADIUS, 0), _sideways(-HGRAB_RADIUS, HGRAB_RADIUS / HGRAB_RATIO), _sideways(30, -15)], [true, true, true])
check('sideways: mostly up or down does not', [_sideways(0, HGRAB_RADIUS), _sideways(HGRAB_RADIUS, HGRAB_RADIUS / HGRAB_RATIO + 1), _sideways(-5, -12)], [false, false, false])
{
  const calls = []
  const handlers = {}
  const options = {}
  const list = { addEventListener: (type, fn, opts) => ((handlers[type] = fn), (options[type] = opts)) }
  const row = { parentNode: list, chosen: false, classList: { contains: cls => row.chosen && cls == 'chosen' } }
  const sortable = {
    options: { delay: 250, chosenClass: 'chosen' },
    option(name, value) {
      if (value === undefined) return this.options[name]
      this.options[name] = value
      calls.push(['option', name, value])
    },
    _disableDelayedDrag: () => calls.push(['_disableDelayedDrag']),
    _onDrop: (...args) => calls.push(['_onDrop', ...args]),
    _onTapStart: e => calls.push(['_onTapStart', e, sortable.options.delay]),
  }
  list.sortable = sortable
  const { Sortable } = context
  _grab_on_sideways_touch(list)
  check('grab: the listeners capture, touchmove not passive', [options.pointerdown, options.pointermove, options.pointerup, options.pointercancel, options.touchmove], [true, true, true, true, { capture: true, passive: false }])
  const pointer = (type, clientX, clientY, extra = {}) => {
    const e = { type, pointerType: 'touch', pointerId: 1, isPrimary: true, clientX, clientY, target: 'text', ...extra }
    handlers[type](e)
    return e
  }
  const touchmove = (extra = {}) => {
    const e = { cancelable: true, prevented: false, preventDefault() { this.prevented = true }, ...extra }
    handlers.touchmove(e)
    return e
  }
  const reset = () => {
    calls.length = 0
    row.chosen = false
    Sortable.dragged = row
    handlers.pointerup({})
  }
  reset()
  pointer('pointerdown', 100, 50)
  pointer('pointermove', 105, 51)
  check('grab: a short move is undecided', [calls, touchmove().prevented], [[], false])
  pointer('pointermove', 112, 52)
  check('grab: a sideways move presses the row again without the delay, at the touch', calls, [['_disableDelayedDrag'], ['_onDrop'], ['option', 'delay', 0], ['_onTapStart', { type: 'pointerdown', pointerType: 'touch', button: 0, cancelable: true, target: 'text', clientX: 112, clientY: 52 }, 0], ['option', 'delay', 250]])
  check('grab: the delay is restored', sortable.options.delay, 250)
  calls.length = 0
  pointer('pointermove', 112, 90)
  check('grab: from the grab on, that touch\'s cancelable touchmove events are prevented, nothing pressed again', [touchmove().prevented, touchmove({ cancelable: false }).prevented, calls], [true, false, []])
  pointer('pointerup', 112, 90)
  check('grab: once the touch ended, nothing is prevented', touchmove().prevented, false)
  reset()
  pointer('pointerdown', 100, 50)
  pointer('pointermove', 103, 62)
  pointer('pointermove', 140, 62)
  check('grab: a move mostly up or down leaves the touch alone, for the rest of that touch', [calls, touchmove().prevented], [[], false])
  reset()
  pointer('pointerdown', 100, 50)
  pointer('pointermove', 104, 50)
  pointer('pointercancel', 104, 50)
  pointer('pointermove', 120, 50)
  check('grab: a touch the browser took (pointercancel) grabs nothing', calls, [])
  reset()
  row.chosen = true
  pointer('pointerdown', 100, 50)
  pointer('pointermove', 112, 50)
  check('grab: a row already chosen (the delay ended) is left to Sortable', calls, [])
  reset()
  Sortable.dragged = null
  pointer('pointerdown', 100, 50)
  pointer('pointermove', 112, 50)
  check('grab: no pending press, no grab', calls, [])
  reset()
  Sortable.dragged = { parentNode: {}, classList: row.classList }
  pointer('pointerdown', 100, 50)
  pointer('pointermove', 112, 50)
  check('grab: another list\'s pending press, no grab', calls, [])
  reset()
  pointer('pointerdown', 100, 50)
  pointer('pointerdown', 200, 50, { pointerId: 2, isPrimary: false })
  pointer('pointermove', 112, 50)
  check('grab: a second finger, no grab', calls, [])
  reset()
  pointer('pointerdown', 100, 50, { pointerType: 'mouse' })
  pointer('pointermove', 112, 50, { pointerType: 'mouse' })
  check('grab: a mouse press is not a touch', calls, [])
  reset()
  pointer('pointerdown', 100, 50)
  pointer('pointermove', 112, 50, { pointerId: 7 })
  check('grab: another pointer\'s move is not this touch\'s', calls, [])
  reset()
  list.sortable = { ...sortable, _onTapStart: () => { throw new Error('press failed') } }
  pointer('pointerdown', 100, 50)
  let thrown = null
  try {
    pointer('pointermove', 112, 50)
  } catch (e) {
    thrown = e.message
  }
  check('grab: a press again that throws propagates, the delay restored', [thrown, sortable.options.delay, calls.slice(-1)], ['press failed', 250, [['option', 'delay', 250]]])
  reset()
  list.sortable = { options: sortable.options, option: sortable.option }
  pointer('pointerdown', 100, 50)
  pointer('pointermove', 112, 50)
  check('grab: a Sortable without the press path, no grab, no throw', calls, [])
  const legacy = {}
  const { PointerEvent } = context
  delete context.PointerEvent
  _grab_on_sideways_touch({ addEventListener: (type, fn) => (legacy[type] = fn) })
  context.PointerEvent = PointerEvent
  check('grab: without pointer events nothing is installed (the delayed drag only)', Object.keys(legacy), [])
}
