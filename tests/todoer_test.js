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
const consts = src.match(/\nconst _pending_commands = [^\n]*\n/)[0] + src.match(/\nconst TODOER_VERSION = [^\n]*\n/)[0]
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
}
vm.createContext(context)
vm.runInContext(
  pick([
    '_task_state',
    '_task_list',
    '_age',
    '_snippet_uses_suffix',
    '_todo_offset',
    '_set_marker',
    '_without_log',
    '_extract_todo_snippet',
    '_merged_order',
    '_order_blocked',
    '_delegated_view',
    '_clear_pending',
    '_rerender_todoer_widgets',
  ]).join('\n') +
    consts +
    src.match(/\nasync function _enqueue_command\([^\n]*\) \{[\s\S]*?\n\}\n/)[0],
  context
)
const { _task_list, _age, _set_marker, _extract_todo_snippet, _delegated_view, _enqueue_command, _merged_order, _order_blocked } = context
const TODOER_VERSION = vm.runInContext('TODOER_VERSION', context) // a const is not a context property
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
