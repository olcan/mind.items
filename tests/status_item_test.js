#!/usr/bin/env node
// plain-node table for the #status item (status.md): the vault sections' row builders over the
// REAL `table` helper of util/core.js and the REAL Markdown parser (marked, REQUIRED: the sibling
// external/mind.page/node_modules or MARKED_DIR; a missing parser fails the run, never skips), the
// snapshot selection, the roles, the literal cells, the run links through #vault, the fold-out
// memory, the in-place store change, and welcome's one-time save.
// run: MARKED_DIR=/Users/olcan/vault/external/mind.page/node_modules/marked node external/mind.items/tests/status_item_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const item = fs.readFileSync(path.join(__dirname, '..', 'status.md'), 'utf8')
const block = item.match(/```js_removed\n([\s\S]*?)\n```/)
if (!block) throw new Error('no js block in status.md')
const core = fs.readFileSync(path.join(__dirname, '..', 'util', 'core.js'), 'utf8')
const tableSrc = core.match(/\nfunction table\(cells, options = \{\}\) \{[\s\S]*?\n\}\n/)
if (!tableSrc) throw new Error('table helper not found in util/core.js')
let marked = null
for (const dir of [process.env.MARKED_DIR, path.join(__dirname, '..', '..', 'mind.page', 'node_modules', 'marked')].filter(Boolean)) {
  try { marked = require(dir).marked; break } catch (e) { /* the next candidate */ }
}
if (!marked) throw new Error('the real parser is required: set MARKED_DIR to a marked package directory')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

const now = 1_800_000_000_000
const clock = { now }
const MIN = 60000
// a details element: its open state and toggle listeners (a click flips `open` and fires
// `toggle`, as a programmatic assignment does; synchronous here)
const fake_details = fold => ({
  dataset: { fold }, _open: false, listeners: [],
  get open() { return this._open },
  set open(v) { if (this._open === v) return; this._open = v; for (const fn of this.listeners) fn() },
  addEventListener(type, fn) { if (type === 'toggle') this.listeners.push(fn) },
  click() { this.open = !this.open },
})
const fake_div = () => ({
  writes: 0, _html: '', details: [],
  get innerHTML() { return this._html },
  set innerHTML(v) { this.writes++; this._html = v; this.details = Array.from(v.matchAll(/data-fold="([^"]*)"/g), m => fake_details(m[1])) },
  querySelectorAll(sel) { return sel.includes('[open]') ? this.details.filter(d => d.open) : this.details },
})
const divs = { '.instances': fake_div(), '.hosts': fake_div(), '.runs': fake_div(), '.tasks': fake_div() }
const items = {
  'chat-id': { id: 'chat-id', name: '#chat/topic' },
  'vault-id': { id: 'vault-id', name: '#vault', _global_store: { _bridge: { updated: now - 5000, host: 'm3.local', boot: now - 2 * 3600000, runs: { '5ad5b172': { item: 'chat-id', persona: 'default' } } } } },
}
const env = {
  entries: Object.entries,
  keys: Object.keys,
  is_array: Array.isArray,
  is_string: x => typeof x === 'string',
  str: String,
  is_numeric: x => !isNaN(parseFloat(x)),
  array: (n, f) => Array.from({ length: n }, (_, k) => f(k)),
  apply: (a, f) => { for (let i = 0; i < a.length; i++) a[i] = f(a[i]); return a },
  _: {
    maxBy: (a, key) => a.reduce((x, y) => (x[key] > y[key] ? x : y)),
    escape: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    groupBy: (a, f) => a.reduce((g, x) => ((g[f(x)] ??= []).push(x), g), {}),
    size: o => Object.keys(o).length,
  },
  group: (a, f) => env._.groupBy(a, f),
  size: o => env._.size(o),
  round: Math.round,
  fatal: m => { throw new Error(m) },
  _item: key => { // by id, or by UNIQUE case-insensitive name (as the app's _item(name))
    if (items[key]) return items[key]
    const named = Object.values(items).filter(i => i.name?.toLowerCase() === String(key).toLowerCase())
    return named.length === 1 ? named[0] : null
  },
  Date: class extends Date { static now() { return clock.now } },
  Math,
  Object,
  console,
  marked,
  elem: s => divs[s] ?? null,
  _instances: [],
  UAParser: class { constructor() {} getOS() { return { name: 'os' } } getResult() { return { os: { name: 'os' }, browser: { name: 'b' } } } },
}
const saves = []
env._this = { id: 'status-id', store: {}, save_global_store: opts => saves.push(opts), _global_store: {} }
const ctx = vm.createContext(env)
vm.runInContext(tableSrc[0] + '\n' + block[1], ctx)
const run = code => vm.runInContext(code, ctx)

// the snapshot and the ages
check('snapshot: the newest entry wins; entries without a stamp are skipped; none is null',
  [run(`status_snapshot({a: {updated: 5}, b: {updated: 9}, c: {}, d: null})`).host, run('status_snapshot({})'), run('status_snapshot({c: {}})')], ['b', null, null])
check('ages as list_agents.sh prints them, never negative', [run('status_age(7000)'), run('status_age(182000)'), run('status_age(7500000)'), run('status_age(-5)')], ['7s', '3m02s', '2h05m', '0s'])
check('cells: literal text (a pipe cannot split the row, markup stays text); an empty value is ·', [run("status_cell('rg a | b <x>')"), run("status_cell('')"), run('status_cell(null)')], ['rg a \\| b \\<x\\>', '·', '·'])

// the coordinator's roles over the observed set
const coordinator = `{
  m3: {started: ${now - 10 * MIN}, heartbeat: ${now - 30000}, status: 'ready', running_tasks: ['tasks.a.b'], suspended: false},
  m4: {started: ${now - 5 * MIN}, heartbeat: ${now - 60000}, status: 'initializing', running_tasks: [], suspended: false},
  old: {started: ${now - 99 * MIN}, heartbeat: ${now - 4 * MIN}, status: 'ready', running_tasks: [], suspended: false},
  susp: {started: ${now}, heartbeat: ${now}, status: 'ready', running_tasks: [], suspended: true},
}`
check('roles: the live host started last is primary even when suspended (the coordinator elects it and shows the suspension), the other live ones standby, a stale heartbeat stale',
  run(`status_roles(${coordinator}, false, ${now})`), { m3: 'standby', m4: 'standby', old: 'stale', susp: 'suspended' })
check('roles: the global marker suspends every host', run(`status_roles(${coordinator}, true, ${now})`), { m3: 'suspended', m4: 'suspended', old: 'suspended', susp: 'suspended' })

// the entries of two publishing hosts: m3's the newest (the snapshot), m4's stale
const entry_m3 = `{v: 1, updated: ${now - 20000}, boot: ${now - 3600000}, publisher: 'bridge', unreadable: 1,
  runs: [
    {state: 'aa11bb22', run: '5ad5b172', agent: 'supervisor_agent', name: null, host: 'm3', pid: 1, started: ${now - 65000}, alive: true, cost: 0.1234, subscription: true, run_file: 'runs/x.md'},
    {state: 'cc33dd44', run: null, agent: 'review', name: 'nightly', host: 'm3', pid: 2, started: ${now - 7500000}, alive: false, cost: null, subscription: false, run_file: null},
    {state: 'ee55ff66', run: '5ad5b172', agent: null, name: 'remote', host: 'other', pid: 3, started: ${now - 1000}, alive: null, cost: 2, subscription: false, run_file: null},
  ],
  finished: [
    {state: '11223344', run: null, agent: 'worker', name: null, host: 'm3', started: ${now - 100000}, finished: ${now - 40000}, elapsed: 60.5, status: 'ok', error: null, cost: 2.5, subscription: false, modified: ${now - 40000}},
    {state: '55667788', run: null, agent: 'worker', name: null, host: 'm3', started: ${now - 100000}, finished: ${now - 50000}, elapsed: 1.2, status: 'error', error: 'RuntimeError: boom | bang', cost: null, subscription: true, modified: ${now - 50000}},
    {state: 'ddeeff00', run: null, agent: 'orphan', name: null, host: 'm3', started: ${now - 100000}, finished: null, elapsed: null, status: null, error: null, cost: null, subscription: false, modified: ${now - 3000}},
  ],
  tasks: [
    {name: 'tasks.hello.hello', task: 'bin/tasks/hello.py:5', last_run: ${now - 3600000}, host: 'm3', next_run: ${now - 1}},
    {name: 'tasks.b.c', task: 'bin/tasks/b.py', last_run: ${now - 60000}, host: 'm4', next_run: ${now + 125000}},
    {name: 'tasks.never', task: 'tasks.never', last_run: null, host: null, next_run: null},
  ],
  hosts: ${coordinator}, suspended_all: false,
  sync_loop: {time: ${now - 90000}, paused: false, holds: 0, pending: 2, runs: 719, last_run: {status: 'applied', observation: 'complete', refusal: null, mutations: 0}},
  omitted: {finished: 3}}`
const entry_m4 = `{v: 1, updated: ${now - 4 * MIN}, boot: ${now - 5 * MIN}, publisher: 'cli', runs: [], finished: [], tasks: [], hosts: {}, suspended_all: false, sync_loop: null, unreadable: 0}`
run(`_this._global_store = {_owner: {}, _status: {v: 1, hosts: {m3: ${entry_m3}, m4: ${entry_m4}}}}`)
const warn = t => `<span class="warn">${t}</span>`
const mark = name => `<mark class="link" title="${name}" onmousedown="_handleTagClick('status-id','${name}','${name}',event)" onclick="event.preventDefault();event.stopPropagation();">${name}</mark>`
const hostRows = run(`status_host_rows(status_hosts(), status_snapshot(status_hosts()), ${now})`)
check('hosts: a punctuated host name is a literal cell', run(`status_host_rows({'a|b.c': {updated: ${now}}}, null, ${now})`)[0][0], 'a\\|b\\.c')
check('hosts: a publishing host with its listing age and boot, its coordinator role, status, heartbeat and tasks', hostRows[0], ['m3', '20s ago', '1h00m', 'standby', 'ready', '30s ago', 'tasks\\.a\\.b'])
check('hosts: a stale publisher is marked; its coordinator row is a standby', hostRows[1], ['m4', '4m00s ago ' + warn('stale'), '5m00s', 'standby', 'initializing', '1m00s ago', '·'])
check('hosts: a coordinator-only host has no listing; a stale heartbeat is marked; a suspended one says so', [hostRows[2], hostRows[3]], [['old', '·', '·', warn('stale'), 'ready', '4m00s ago', '·'], ['susp', '·', '·', 'suspended', 'ready', '0s ago', '·']])
const stamp = run(`status_stamp(status_snapshot(status_hosts()), vault_listing(), ${now})`)
check('stamp: the snapshot origin, the bridge from the #vault store, the sync loop observation, the unreadable count, the #vault link',
  [/^_snapshot from m3 at .* \(20s ago\) · bridge on m3\\\.local listed 5s ago, up 2h00m · sync loop last run applied at .* \(1m30s ago\), 0 holds, 2 pending · 1 unreadable state files · actions on <mark class="link" title="#vault"/.test(stamp), stamp.endsWith('>#vault</mark>_')], [true, true])
check('stamp: without any entry the note says so', run(`status_stamp(null, null, ${now})`), 'no status yet: the bridge publishes one when it starts')
const vaultItemForStamp = items['vault-id']
delete items['vault-id']
check('stamp: without a #vault item there is no actions link', run(`status_stamp(status_snapshot(status_hosts()), null, ${now})`).includes('actions on'), false)
items['vault-id'] = vaultItemForStamp
check('stamp: a paused loop without a last result (a pause or an exit clears it), no bridge listing', run(`status_stamp({host: 'h', entry: {updated: ${now}, sync_loop: {time: null, paused: true, holds: 1, pending: 0, last_run: null}, unreadable: 0}}, null, ${now})`).includes('· sync loop paused, no last result, 1 holds, 0 pending'), true)
const runRows = run(`status_run_rows(status_snapshot(status_hosts()), vault_listing(), ${now})`)
check('runs: a live run with its cost and the chat item the #vault listing names for its bridge id', runRows[0], ['aa11bb22', 'supervisor\\_agent', 'm3', '1m05s', '$0.1234 (sub)', 'running', mark('#chat/topic')])
check('runs: a dead row (an orphaned state file) in the warning style, the agent and run names joined, its elapsed since the start, no bridge id: no link', runRows[1], ['cc33dd44', 'review \\/ nightly', 'm3', '2h05m', '·', warn('dead'), '·'])
check('runs: another host\'s file is unjudged (@host); its bridge id still links', runRows[2], ['ee55ff66', 'remote', 'other', '1s', '$2.0000', '@other', mark('#chat/topic')])
const vaultItem = items['vault-id']
delete items['vault-id']
check('runs: a missing #vault item leaves the rows without links and breaks nothing', run(`status_run_rows(status_snapshot(status_hosts()), vault_listing(), ${now})`).map(r => r[6]), ['·', '·', '·'])
items['vault-id'] = vaultItem
check('runs: no snapshot renders no rows', run(`status_run_rows(null, vault_listing(), ${now})`), [])
const finishedRows = run(`status_finished_rows(status_snapshot(status_hosts()), ${now})`)
check('finished: an ok run, an error run with its first line as a literal cell, a file clean.sh moved shows its last write (nothing invented)', finishedRows,
  [['11223344', 'worker', 'm3', '40s ago', '1m00s', 'ok', '$2.5000'], ['55667788', 'worker', 'm3', '50s ago', '1s', warn('error') + ' RuntimeError\\: boom \\| bang', '· (sub)'], ['ddeeff00', 'orphan', 'm3', 'written 3s ago', '·', '·', '·']])
check('tasks: due, a countdown, never run; a suspended host is marked', run(`status_task_rows(status_snapshot(status_hosts()), ${now})`),
  [['bin\\/tasks\\/hello\\.py\\:5', 'due', '1h00m ago', 'm3'], ['bin\\/tasks\\/b\\.py', '2m05s', '1m00s ago', 'm4'], ['tasks\\.never', '·', '·', '·']])
check('tasks: the global suspension marks every row', run(`(() => { const s = status_snapshot(status_hosts()); s.entry.suspended_all = true; const rows = status_task_rows(s, ${now}); s.entry.suspended_all = false; return rows.map(r => r[3]) })()`), ['m3 ' + warn('suspended'), 'm4 ' + warn('suspended'), '· ' + warn('suspended')])

// the real parser over the tables: one body row per entry, the literal cells intact
const hostsHtml = marked.parse(run(`status_hosts_md(${now})`))
check('parser: the hosts table has one body row per host and the stamp paragraph', [(hostsHtml.match(/<tr>/g) || []).length, /<p><em>snapshot from m3 at /.test(hostsHtml)], [5, true])
const runsHtml = run(`status_runs_html(${now})`)
check('parser: the running table with the link mark and the warning span, then the fold-out with the finished table and the omitted count',
  [(runsHtml.match(/<tbody>/g) || []).length, runsHtml.includes(mark('#chat/topic')), runsHtml.includes(warn('dead')), /<details data-fold="finished"><summary onclick="event.stopPropagation\(\)">finished \(24 h\): 3 \(3 finished omitted\)<\/summary>/.test(runsHtml), runsHtml.includes('<td>RuntimeError: boom | bang</td>') || runsHtml.includes('boom | bang')], [2, true, true, true, true])
const tasksHtml = marked.parse(run(`status_tasks_md(${now})`))
check('parser: the tasks table renders the location literally', [(tasksHtml.match(/<tr>/g) || []).length, tasksHtml.includes('bin/tasks/hello.py:5</td>')], [4, true])

// the startup script: an immediate render of every section, the one-second task, ticking ages
const script = item.match(/<script _uncached>\n([\s\S]*?)<\/script>/)
if (!script) throw new Error('no _uncached script in status.md')
const tasks = []
env.dispatch_task = (name, fn, delay, repeat) => tasks.push({ name, fn, delay, repeat })
run(script[1])
check('the script renders the instances line and the three sections at once and registers the task', [divs['.instances'].writes, divs['.hosts'].writes, divs['.runs'].writes, divs['.tasks'].writes, tasks.map(t => [t.name, t.delay, t.repeat])], [1, 1, 1, 1, [['update', 1000, 1000]]])
check('the instances line keeps its own rendering', divs['.instances'].innerHTML.startsWith('<p>0 instances live on ~0 devices:'), true)
check('nothing saves during rendering', saves, [])
tasks[0].fn()
check('a tick without a clock change rewrites nothing', [divs['.hosts'].writes, divs['.runs'].writes, divs['.tasks'].writes], [1, 1, 1])
clock.now += 2000
tasks[0].fn()
check('a tick after two seconds advances the ages in every section', [divs['.hosts'].writes, divs['.runs'].innerHTML.includes('1m07s</td>'), divs['.tasks'].innerHTML.includes('2m03s</td>')], [2, true, true])
items['vault-id']._global_store._bridge.runs = {}
tasks[0].fn()
check('a change of #vault alone (its listing emptied) reaches the page at the next tick: the links are gone', divs['.runs'].innerHTML.includes(mark('#chat/topic')), false)

// the fold-out memory: opened by the user, kept through a rewrite and through the item's re-render
const fold = () => divs['.runs'].details[0]
fold().click()
check('the fold-out open state is recorded by name', run('_this.store._status_open'), { finished: true })
clock.now += 1000
tasks[0].fn()
check('a rewrite re-opens the remembered fold-out', fold().open, true)
divs['.runs'] = fake_div() // the app re-rendered the item: a fresh element, the script runs again
run(script[1])
check('a re-render restores it too and registers the task again', [fold().open, tasks.length], [true, 2])
fold().click()
check('a user close is remembered', run('_this.store._status_open'), { finished: false })

// the store change handler and welcome
const before = divs['.hosts'].writes
run(`_this._global_store._status.hosts.m3.updated = ${clock.now}`)
check('a change of this store rewrites in place and reports it rendered', [run("_on_global_store_change('status-id')"), divs['.hosts'].writes], [true, before + 1])
check('a foreign store\'s change rewrites nothing and reports nothing', [run("_on_global_store_change('other-id')"), divs['.hosts'].writes], [undefined, before + 1])
run('_this._global_store = {}; _on_welcome()')
check('welcome provisions the store once, without the re-render the app forces on a save', [run('_this._global_store'), saves], [{ _owner: {} }, [{ invalidate_elem_cache: false }]])
run('_on_welcome()')
check('a provisioned store is left alone', saves.length, 1)
run(`_this._global_store = {_owner: {}}`)
tasks[0].fn()
check('without any entry the sections render their notes', [divs['.hosts'].innerHTML.includes('no status yet'), divs['.runs'].innerHTML.startsWith('<p><em>none</em></p>'), divs['.tasks'].innerHTML.startsWith('<p><em>none</em></p>')], [true, true, true])

if (failures) { console.log(`${failures} failures`); process.exit(1) }
console.log('all ok')
