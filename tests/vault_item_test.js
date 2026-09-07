#!/usr/bin/env node
// plain-node table for the #vault item (vault.md): the row builder over the REAL `table` helper of
// util/core.js (extracted by name), so a read-only run (no worktree) renders, a stop flag or a
// bridge-reported stop shows "stopping…", and the empty and missing listings render their notes.
// run: node external/mind.items/tests/vault_item_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const item = fs.readFileSync(path.join(__dirname, '..', 'vault.md'), 'utf8')
const block = item.match(/```js:js_removed\n([\s\S]*?)\n```/)
if (!block) throw new Error('no js block in vault.md')
const core = fs.readFileSync(path.join(__dirname, '..', 'util', 'core.js'), 'utf8')
const tableSrc = core.match(/\nfunction table\(cells, options = \{\}\) \{[\s\S]*?\n\}\n/)
if (!tableSrc) throw new Error('table helper not found in util/core.js')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

const now = 1_700_000_000_000
// the app's running flag is a refcount behind a boolean getter (index.svelte `set running`)
class FakeItem {
  constructor(name, running = 0) { this.name = name; this.count = running }
  get running() { return !!this.count }
  set running(v) { this.count += v ? 1 : -1; if (this.count < 0) throw new Error('running below zero') }
}
const items = { 'chat-id': new FakeItem('#chat/topic'), 'chat2-id': new FakeItem('#chat/two'), 'busy-id': new FakeItem('#chat/busy', 1) }
// the helper's own dependencies, as util/core.js defines them (kept minimal and equivalent)
const env = {
  entries: Object.entries,
  keys: Object.keys,
  is_array: Array.isArray,
  is_string: x => typeof x === 'string',
  str: String,
  is_numeric: x => !isNaN(parseFloat(x)),
  array: (n, f) => Array.from({ length: n }, (_, k) => f(k)),
  apply: (a, f) => { for (let i = 0; i < a.length; i++) a[i] = f(a[i]); return a },
  _: { maxBy: (a, key) => a.reduce((x, y) => (x[key] > y[key] ? x : y)) },
  fatal: m => { throw new Error(m) },
  link_eval: (_item, js, text) => `[${text}](${js})`,
  _item: id => items[id] ?? null, // 'other-id' is a deleted item
  Date: class extends Date { static now() { return now } }, // the item's clock, frozen at `now`
  Math,
  Object,
  console,
}
env._this = {
  _global_store: {
    _bridge: {
      updated: now,
      host: 'test-host',
      runs: {
        r1: { item: 'chat-id', persona: 'fable', started: now - 5000, worktree: null },
        r2: { item: 'other-id', persona: 'fable_wt', started: now - 65000, worktree: 'chat_x', stopping: true },
      },
    },
    _owner: { stop: { r1: now } },
  },
}
env.global_store = env._this._global_store
env._this.store = {}
env.items = items // the fake items, for the count checks below
const ctx = vm.createContext(env)
vm.runInContext(tableSrc[0] + '\n' + block[1], ctx)

const rows = vm.runInContext(
  "vault_runs_rows(_this._global_store._bridge, _this._global_store._owner.stop, " + now + ", id => 'stop:' + id)", ctx)
check('rows: a read-only run renders a placeholder worktree and its stop flag', rows[0],
  ['#chat/topic', 'fable', 'r1', '5s', '(read-only)', 'stopping…'])
check('rows: an unknown item id shows the id; a bridge-reported stop shows stopping', rows[1],
  ['other-id', 'fable_wt', 'r2', '65s', 'chat_x', 'stopping…'])
const rendered = vm.runInContext('vault_runs_table()', ctx)
check('table: the real helper renders both rows with the headers', rendered.split('\n').length, 5)
check('table: header row', rendered.split('\n')[0], '| item | persona | run | elapsed | worktree |  |')
check('table: the freshness stamp follows', /_as of .* on test-host_$/.test(rendered), true)
const one = vm.runInContext(
  "(() => { const b = {updated: " + now + ", host: 'h', runs: {r3: {item: 'x', persona: 'p', started: " + now + ", worktree: null}}};" +
  " _this._global_store = {_bridge: b, _owner: {stop: {}}}; return vault_runs_table() })()", ctx)
check('table: a lone read-only run renders (the empty-column case)', one.split('\n')[2], "| x | p | r3 | 0s | (read-only) | [stop](stop_run('r3')) |")
vm.runInContext("_this._global_store = {_bridge: {updated: " + now + ", host: 'h', runs: {}}}", ctx)
check('empty listing keeps its stamp', vm.runInContext('vault_runs_table()', ctx), '_none_ _as of ' + new Date(now).toLocaleTimeString() + ' on h_')
vm.runInContext('_this._global_store = {}', ctx)
check('missing listing explains itself', vm.runInContext('vault_runs_table()', ctx).startsWith('_no listing yet'), true)
// stop_run prunes flags of delisted runs on the explicit action and never touches _bridge
vm.runInContext("_this._global_store = {_bridge: {runs: {r9: {}}}, _owner: {stop: {old: 1}}}; _this.global_store = _this._global_store; stop_run('r9')", ctx)
check('stop_run keeps _bridge and prunes stale flags', vm.runInContext('_this.global_store', ctx), { _bridge: { runs: { r9: {} } }, _owner: { stop: { r9: vm.runInContext('_this.global_store._owner.stop.r9', ctx) } } })
check('the stop flag is a timestamp', typeof vm.runInContext('_this.global_store._owner.stop.r9', ctx), 'number')
vm.runInContext("_this._global_store = {}; _this.global_store = _this._global_store; _on_welcome()", ctx)
check('welcome provisions the store', vm.runInContext('_this.global_store', ctx), { _owner: { stop: {} } })
// the running marks: one reference of this tab's own per listed chat item (the app's refcount)
const counts = () => vm.runInContext("[items['chat-id'].count, items['chat2-id'].count, items['busy-id'].count]", ctx)
const marks = () => vm.runInContext('_this.store._vault_marked', ctx)
const listing = runs => vm.runInContext(`_this._global_store._bridge = {runs: ${runs}}; _on_global_store_change('id', false)`, ctx)
vm.runInContext("_this.store = {}; _this._global_store = {_bridge: {runs: {r1: {item: 'chat-id'}, r2: {item: 'other-id'}}}, _owner: {stop: {}}}; _this.global_store = _this._global_store; _on_welcome()", ctx)
check('welcome marks the listed runs (a deleted item skipped) and records the marks', [counts(), marks()], [[1, 0, 1], { 'chat-id': true }])
listing("{r3: {item: 'busy-id'}, r4: {item: 'chat2-id'}}")
check('a changed listing releases and marks; a busy chat gets its own reference beside the web call\'s', [counts(), marks()], [[0, 1, 2], { 'busy-id': true, 'chat2-id': true }])
vm.runInContext("_on_global_store_change('id', true)", ctx)
check('an unchanged listing adds no reference', counts(), [0, 1, 2])
vm.runInContext("items['busy-id'].running = false", ctx) // the web call completes first
check('web completion first leaves the bridge indicator on', counts(), [0, 1, 1])
listing("{r4: {item: 'chat2-id'}}") // then the bridge run on that chat ends
check('the bridge delisting then releases the last reference', counts(), [0, 1, 0])
vm.runInContext("items['busy-id'].running = true", ctx) // a new web call in flight
listing("{r5: {item: 'busy-id'}, r4: {item: 'chat2-id'}}")
listing("{r4: {item: 'chat2-id'}}") // the bridge run ends first
check('bridge completion first leaves the web indicator on', counts(), [0, 1, 1])
vm.runInContext("items['busy-id'].running = false", ctx)
check('the web completion then releases it', counts(), [0, 1, 0])
listing('{}')
check('an empty listing releases every reference of this tab', [counts(), marks()], [[0, 0, 0], {}])
// a store change can reach a tab before its welcome: welcome keeps the marks it finds and adds
// no reference, so the delisting still releases it (order: change, welcome, delist)
vm.runInContext('_this.store = {}', ctx) // a fresh tab
listing("{r6: {item: 'chat-id'}}")
vm.runInContext('_on_welcome()', ctx)
check('welcome after a store change keeps the marks and adds no reference', [counts(), marks()], [[1, 0, 0], { 'chat-id': true }])
listing('{}')
check('the delisting after that order releases the reference', [counts(), marks()], [[0, 0, 0], {}])

if (failures) { console.log(`${failures} failure(s)`); process.exit(1) }
console.log('all checks passed')
