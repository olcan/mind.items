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
const clock = { now }
// the listing's element: counts assignments so an unchanged rendering is seen to skip the DOM
const runs_div = { writes: 0, _html: '', get innerHTML() { return this._html }, set innerHTML(v) { this.writes++; this._html = v } }
// the app's running flag is a refcount behind a boolean getter (index.svelte `set running`)
class FakeItem {
  constructor(name, running = 0, text = '', tags = []) { this.name = name; this.count = running; this.text = text; this.tags = tags; this.id = name + '-id' }
  read() { return this.text } // the app's cached grammar view; plain text here
  get running() { return !!this.count }
  set running(v) { this.count += v ? 1 : -1; if (this.count < 0) throw new Error('running below zero') }
}
const items = { 'chat-id': new FakeItem('#chat/topic'), 'chat2-id': new FakeItem('#chat/two'), 'busy-id': new FakeItem('#chat/busy', 1) }
for (const [id, item] of Object.entries(items)) item.id = id
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
  _: { maxBy: (a, key) => a.reduce((x, y) => (x[key] > y[key] ? x : y)), escape: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) },
  fatal: m => { throw new Error(m) },
  link_eval: (_item, js, text) => `[${text}](${js})`,
  _item: id => items[id] ?? null, // 'other-id' is a deleted item
  Date: class extends Date { static now() { return clock.now } }, // the item's clock, advanced by the witness
  Math,
  Object,
  console,
  marked: { parse: s => `<parsed>${s}</parsed>` }, // the app's Markdown parser, stubbed
  window: { _grammar: { version: 2 }, _parse_tags: text => ({ raw: text.match(/#[\w/-]+/g) ?? [] }) }, // the app's grammar capability and tag parser, stubbed
  _items: () => Object.values(items),
  elem: s => (s !== '.runs' || runs_div.missing ? null : runs_div.replaced ?? runs_div), // the item's own element (util/core/item.js)
}
env._this = {
  id: 'vault-id',
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
const mark = name => `<mark class="link" title="${name}" onmousedown="_handleTagClick('vault-id','${name}','${name}',event)" onclick="event.preventDefault();event.stopPropagation();">${name}</mark>`
check('rows: a read-only run renders a placeholder worktree and its stop flag; the item cell is the app\'s clickable tag', rows[0],
  [mark('#chat/topic'), 'fable', 'r1', '5s', '(read-only)', 'stopping…'])
check('rows: an unknown item id shows the id; a bridge-reported stop shows stopping', rows[1],
  ['other-id', 'fable_wt', 'r2', '65s', 'chat_x', 'stopping…'])
const rendered = vm.runInContext('vault_runs_table()', ctx)
check('table: the real helper renders both rows with the headers, then a blank line and the stamp', rendered.split('\n').length, 6)
check('table: header row', rendered.split('\n')[0], '| item | persona | run | elapsed | worktree |  |')
check('table: the listing stamp follows as its own paragraph, with its age', /\n\n_bridge listing from test-host, updated .* \(0s ago\)_$/.test(rendered), true)
const one = vm.runInContext(
  "(() => { const b = {updated: " + now + ", host: 'h', runs: {r3: {item: 'x', persona: 'p', started: " + now + ", worktree: null}}};" +
  " _this._global_store = {_bridge: b, _owner: {stop: {}}}; return vault_runs_table() })()", ctx)
check('table: a lone read-only run renders (the empty-column case)', one.split('\n')[2], "| x | p | r3 | 0s | (read-only) | [stop](stop_run('r3')) |")
vm.runInContext("_this._global_store = {_bridge: {updated: " + now + ", host: 'h', runs: {}}}", ctx)
check('empty listing keeps its stamp', vm.runInContext('vault_runs_table()', ctx), '_none_ _bridge listing from h, updated ' + new Date(now).toLocaleTimeString() + ' (0s ago)_')
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
const listing = runs => vm.runInContext(`_this._global_store._bridge = {runs: ${runs}}; _on_global_store_change('vault-id', false)`, ctx)
vm.runInContext("_this.store = {}; _this._global_store = {_bridge: {runs: {r1: {item: 'chat-id'}, r2: {item: 'other-id'}}}, _owner: {stop: {}}}; _this.global_store = _this._global_store; _on_welcome()", ctx)
check('welcome marks the listed runs (a deleted item skipped) and records the marks', [counts(), marks()], [[1, 0, 1], { 'chat-id': true }])
listing("{r3: {item: 'busy-id'}, r4: {item: 'chat2-id'}}")
check('a changed listing releases and marks; a busy chat gets its own reference beside the web call\'s', [counts(), marks()], [[0, 1, 2], { 'busy-id': true, 'chat2-id': true }])
vm.runInContext("_on_global_store_change('vault-id', true)", ctx)
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

// the startup script itself (the _html_hidden block): an immediate render, a one-second task
// registration, and ticks that advance the elapsed column without any store delivery
const script = item.match(/<script _uncached>\n([\s\S]*?)<\/script>/)
if (!script) throw new Error('no _uncached script in vault.md')
const tasks = []
env.dispatch_task = (name, fn, delay, repeat) => tasks.push({ name, fn, delay, repeat })
vm.runInContext("_this._global_store = {_bridge: {updated: " + now + ", host: 'h', runs: {r7: {item: 'chat-id', persona: 'p', started: " + (now - 3000) + ", worktree: null}}}, _owner: {stop: {}}}", ctx)
vm.runInContext(script[1], ctx)
check('the script renders at once: the table with the elapsed value, then the stamp paragraph', [runs_div.writes, runs_div.innerHTML.startsWith('<parsed>| item |'), runs_div.innerHTML.includes(`| ${mark('#chat/topic')} | p | r7 | 3s | (read-only) |`), /\n\n_bridge listing from h, updated /.test(runs_div.innerHTML)], [1, true, true, true])
check('the script registers the one-second task', tasks.map(t => [t.name, t.delay, t.repeat]), [['update', 1000, 1000]])
tasks[0].fn()
check('a tick without a clock change is not reassigned', runs_div.writes, 1)
clock.now += 2000
tasks[0].fn()
check('a tick after two seconds advances the elapsed column without a store delivery', [runs_div.writes, runs_div.innerHTML.includes('| r7 | 5s |')], [2, true])
vm.runInContext("_this._global_store._bridge.runs = {}", ctx)
tasks[0].fn()
check('an empty listing renders its note', [runs_div.writes, runs_div.innerHTML.startsWith('<parsed>_none_')], [3, true])
runs_div.missing = true // the item left the DOM
tasks[0].fn()
check('a tick without the element is a no-op', runs_div.writes, 3)
runs_div.missing = false
runs_div.replaced = { writes: 0, _html: '', get innerHTML() { return this._html }, set innerHTML(v) { this.writes++; this._html = v } }
vm.runInContext(script[1], ctx) // the item re-rendered: a fresh element, the script runs again
check('a re-render renders the fresh element and re-registers the task', [runs_div.replaced.writes, tasks.length], [1, 2])
// the real parser, when the app's dependency is reachable (the main checkout; a review worktree
// leaves external/mind.page empty): one body row per run, the stamp as a separate paragraph
let realMarked = null
try { realMarked = require(path.join(__dirname, '..', '..', 'mind.page', 'node_modules', 'marked')).marked } catch (e) { console.log('skip real parser rows (marked not reachable)') }
if (realMarked) {
  vm.runInContext("_this._global_store._bridge.runs = {r8: {item: 'chat-id', persona: 'p', started: " + clock.now + ", worktree: null}}", ctx)
  const html = realMarked.parse(vm.runInContext('vault_runs_table()', ctx))
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? ''
  check('real parser: one body row for one run', (body.match(/<tr>/g) ?? []).length, 1)
  check('real parser: the stamp is a paragraph after the table', /<\/table>\s*<p><em>bridge listing from h, updated .* \(\d+s ago\)<\/em><\/p>/.test(html), true)
  check('real parser: the item cell carries the clickable tag markup', body.includes("onmousedown=\"_handleTagClick('vault-id','#chat/topic','#chat/topic',event)\""), true)
}

// the pending marks: a vault-routed chat item is marked the moment it is saved with a pending
// request (this tab's _on_item_change), released when its reply lands or it is deleted; a
// non-routed chat item and a dependency change are ignored; a listing mark is a second reference
vm.runInContext("_this.store = {}; _this._global_store = {_bridge: {runs: {}}, _owner: {stop: {}}}", ctx)
const setText = (id, text, tags) => vm.runInContext(`items['${id}'].text = ${JSON.stringify(text)}; items['${id}'].tags = ${JSON.stringify(tags)}`, ctx)
const change = (id, deleted = false, dependency = false) => vm.runInContext(`_on_item_change('${id}', '#x', '#x', ${deleted}, false, ${dependency})`, ctx)
const pendingMarks = () => vm.runInContext('_this.store._vault_pending', ctx)
setText('chat-id', '#chat/topic/0 #_agent/vault/fable_wt\n<<user>> please run the tests', ['#chat/topic/0', '#_agent/vault/fable_wt'])
change('chat-id')
check('a saved pending vault request marks its item at once', [counts(), pendingMarks()], [[1, 0, 0], { 'chat-id': true }])
change('chat-id')
check('a second change with the request still pending adds no reference', counts(), [1, 0, 0])
vm.runInContext("_this._global_store._bridge.runs = {r9: {item: 'chat-id'}}; _on_global_store_change('other-store-id', false)", ctx)
check('another store\'s change does not reconcile the listing (a listener hears every store)', counts(), [1, 0, 0])
vm.runInContext("_on_global_store_change('vault-id', false)", ctx)
check('the own store\'s change does: the listing mark is a second reference on the item', counts(), [2, 0, 0])
listing('{}')
check('the delisting releases the listing reference, the pending one remains', counts(), [1, 0, 0])
setText('chat-id', '#chat/topic/0 #_agent/vault/fable_wt\n<<user>> please run the tests\n<<agent(\'vault/fable_wt\')>> done', ['#chat/topic/0', '#_agent/vault/fable_wt'])
change('chat-id')
check('the reply releases the pending reference', [counts(), pendingMarks()], [[0, 0, 0], {}])
setText('chat2-id', '#chat/two #_agent/gpt\n<<user>> hello', ['#chat/two', '#_agent/gpt'])
change('chat2-id')
check('a chat item routed to a web agent is ignored', counts(), [0, 0, 0])
setText('chat2-id', '#chat/two #_agent/vault\n<<user>> hello', ['#chat/two', '#_agent/vault'])
change('chat2-id', false, true)
check('a dependency change is ignored', counts(), [0, 0, 0])
change('chat2-id')
check('the vault-routed request marks the item', counts(), [0, 1, 0])
const chat2 = items['chat2-id']
delete items['chat2-id'] // deleted: the app's _item resolves null
change('chat2-id', true)
check('a deleted item drops its mark without a decrement', [pendingMarks(), chat2.count], [{}, 1])
items['chat2-id'] = chat2
chat2.count = 0
setText('chat2-id', '#chat/two #_agent/vault/typo-name\n<<user>> hello', ['#chat/two', '#_agent/vault/typo-name'])
change('chat2-id')
check('a malformed persona tag is not a request (the bridge would not answer it)', counts(), [0, 0, 0])
setText('chat2-id', '#chat/two #_agent/vault #_agent/vault/fable\n<<user>> hello', ['#chat/two', '#_agent/vault', '#_agent/vault/fable'])
change('chat2-id')
check('an ambiguous route is not a request', counts(), [0, 0, 0])
setText('chat2-id', '#chat/two #_agent/vault\n<<user>>   \n', ['#chat/two', '#_agent/vault'])
change('chat2-id')
check('a blank user turn is not pending', counts(), [0, 0, 0])
// welcome marks the pending requests it finds (a tab opened mid-request)
setText('chat-id', '#chat/topic/0 #_agent/vault/fable_wt\n<<user>> still waiting', ['#chat/topic/0', '#_agent/vault/fable_wt'])
vm.runInContext("_this.store = {}; _this._global_store = {_bridge: {runs: {}}, _owner: {stop: {}}}; _this.global_store = _this._global_store; _on_welcome()", ctx)
check('welcome marks the chat items whose request is pending', [counts(), pendingMarks()], [[1, 0, 0], { 'chat-id': true }])
check('the item source has no unescaped macro delimiters (the app expands macros before it strips code blocks)', (item.match(/(?<!\\)<</g) ?? []).length, 0)
check('the stamp age formats seconds, minutes, and hours', [vm.runInContext('vault_age(5000)', ctx), vm.runInContext('vault_age(200000)', ctx), vm.runInContext('vault_age(7500000)', ctx)], ['5s', '3m 20s', '2h 5m'])

if (failures) { console.log(`${failures} failure(s)`); process.exit(1) }
console.log('all checks passed')
