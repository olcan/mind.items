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
// the logs' element: its details blocks are stubbed from the rendered data-run attributes
const fresh_logs_div = () => ({
  writes: 0, _html: '', details: [],
  get innerHTML() { return this._html },
  set innerHTML(v) { this.writes++; this._html = v; this.details = Array.from(v.matchAll(/data-run="([^"]*)"/g), m => fake_details(m[1])) },
  querySelectorAll(sel) { return sel.includes('[open]') ? this.details.filter(d => d.open) : this.details },
})
const logs_div = fresh_logs_div()
const proposals_div = { writes: 0, _html: '', get innerHTML() { return this._html }, set innerHTML(v) { this.writes++; this._html = v } }
// a details element: open state, its toggle listener (the user's click flips `open` and fires
// `toggle`, as does a programmatic assignment; synchronous here)
const fake_details = run => ({
  dataset: { run }, _open: false, listeners: [],
  get open() { return this._open },
  set open(v) { if (this._open === v) return; this._open = v; for (const fn of this.listeners) fn() },
  addEventListener(type, fn) { if (type === 'toggle') this.listeners.push(fn) },
  click() { this.open = !this.open },
})
// the app's running flag is a refcount behind a boolean getter (index.svelte `set running`)
class FakeItem {
  constructor(name, running = 0, text = '', tags = []) { this.name = name; this.count = running; this.text = text; this.tags = tags; this.id = name + '-id' }
  read() { return this.text } // the app's cached grammar view; plain text here
  // the app's status/progress props: the status lands in innerHTML, progress is checked on set
  get status() { return this._status ?? null }
  set status(v) { this._status = v }
  get progress() { return this._progress ?? null }
  set progress(v) { if (v < 0 || v > 1) throw new Error('invalid progress ' + v); this._progress = v }
  get running() { return !!this.count }
  set running(v) { this.count += v ? 1 : -1; if (this.count < 0) throw new Error('running below zero') }
}
// the chat items' raw texts carry a vault route (the stubbed routing predicate below reads them)
// and open a user turn (a request): the item parses no request grammar for its marks, it checks
// the turn opener at a line start only
const routed_text = name => `${name} #_agent/vault/fable\n<<user>> hello`
const items = { 'chat-id': new FakeItem('#chat/topic', 0, routed_text('#chat/topic')), 'chat2-id': new FakeItem('#chat/two', 0, routed_text('#chat/two')), 'busy-id': new FakeItem('#chat/busy', 1), 'web-id': new FakeItem('#chat/web', 0, '#chat/web #_agent/openai\nhello') }
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
  window: { _grammar: { version: 2, routed: text => /#_?agent\/(vault|native)(\/|\b)/i.test(text) } }, // the app's versioned grammar capability with its routing predicate over an item's raw text, stubbed
  _items: () => Object.values(items),
  elem: s => (s === '.logs' ? logs_div.replaced ?? logs_div : s === '.proposals' ? proposals_div : s !== '.runs' || runs_div.missing ? null : runs_div.replaced ?? runs_div), // the item's own elements (util/core/item.js)
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
  [mark('#chat/topic'), 'fable', 'r1', '5s', '(read-only)', '\\(no activity yet\\)', 'stopping…'])
check('rows: an unknown item id shows the id; a bridge-reported stop shows stopping', rows[1],
  ['other-id', 'fable_wt', 'r2', '65s', 'chat_x', '\\(no activity yet\\)', 'stopping…'])
const sup = { r1: { status: 'supervisor: reviewing the diff', progress: 0.25, notes: [{ t: now, text: 'looks fine <b>' }] } }
const withStatus = vm.runInContext("(() => { const b = _this._global_store._bridge; b.runs.r2.status = 'Reading file docs/x.md'; b.runs.r2.log = ['00:00:01 Reading file docs/x.md', '00:00:02 Executing bash: ls']; return vault_runs_rows(b, {}, " + now + ", id => 'stop', " + JSON.stringify(sup) + ") })()", ctx)
check('rows: the supervisor status with its progress overrides the bridge activity; a bridge status shows as is', [withStatus[0][5], withStatus[1][5]], ['25% supervisor\\: reviewing the diff', 'Reading file docs\\/x\\.md'] /* the parser's escapes, undone at render */)
const details = vm.runInContext("vault_runs_details(_this._global_store._bridge, " + JSON.stringify(sup) + ")", ctx)
check('details: one block per run with a log tail or notes, escaped', details, '<details data-run="r1"><summary>r1 log</summary><pre>note looks fine &lt;b&gt;</pre></details>\n<details data-run="r2"><summary>r2 log</summary><pre>00:00:01 Reading file docs/x.md\n00:00:02 Executing bash: ls</pre></details>')
vm.runInContext("delete _this._global_store._bridge.runs.r2.status; delete _this._global_store._bridge.runs.r2.log", ctx)
const rendered = vm.runInContext('vault_runs_table()', ctx)
check('table: the real helper renders both rows with the headers, then a blank line and the stamp', rendered.split('\n').length, 6)
check('table: header row', rendered.split('\n')[0], '| item | persona | run | elapsed | worktree | status |  |')
check('table: the listing stamp follows as its own paragraph, with its age', /\n\n_bridge listing from test-host, updated .* \(0s ago\)_$/.test(rendered), true)
const one = vm.runInContext(
  "(() => { const b = {updated: " + now + ", host: 'h', runs: {r3: {item: 'x', persona: 'p', started: " + now + ", worktree: null}}};" +
  " _this._global_store = {_bridge: b, _owner: {stop: {}}}; return vault_runs_table() })()", ctx)
check('table: a lone read-only run renders (the empty-column case)', one.split('\n')[2], "| x | p | r3 | 0s | (read-only) | \\(no activity yet\\) | [stop](stop_run('r3')) |")
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
vm.runInContext("_this._global_store._bridge.runs.r4.status = 'Searching web (brave) for \\'freeze\\''; _this._global_store._supervisor = {runs: {r3: {status: 'watching', progress: 0.5}}}; _on_global_store_change('vault-id', false)", ctx)
const status = id => [items[id].status, items[id].progress]
check('the listed items show their status: the supervisor line with progress, or the bridge activity, escaped for innerHTML', [status('busy-id'), status('chat2-id')], [['watching', 0.5], ['Searching web (brave) for &#39;freeze&#39;', 0]])
check('the shown statuses are tracked by item', vm.runInContext('_this.store._vault_shown', ctx), { 'busy-id': true, 'chat2-id': true })
vm.runInContext("delete _this._global_store._supervisor", ctx)
vm.runInContext("_on_global_store_change('vault-id', true)", ctx)
check('an unchanged listing adds no reference', counts(), [0, 1, 2])
vm.runInContext("items['busy-id'].running = false", ctx) // the web call completes first
check('web completion first leaves the bridge indicator on', counts(), [0, 1, 1])
listing("{r4: {item: 'chat2-id'}}") // then the bridge run on that chat ends
check('the bridge delisting then releases the last reference', counts(), [0, 1, 0])
check('the delisted item, no longer running, has its status cleared', [status('busy-id'), vm.runInContext('_this.store._vault_shown', ctx)], [['', 0], { 'chat2-id': true }])
vm.runInContext("items['busy-id'].running = true", ctx) // a new web call in flight
listing("{r5: {item: 'busy-id', status: 'Reading file x'}, r4: {item: 'chat2-id'}}")
listing("{r4: {item: 'chat2-id'}}") // the bridge run ends first
check('bridge completion first leaves the web indicator on', counts(), [0, 1, 1])
check('an item still running for the web call keeps its status for that writer', status('busy-id'), ['Reading file x', 0])
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
check('the script renders at once: the table with the elapsed value, then the stamp paragraph', [runs_div.writes, runs_div.innerHTML.startsWith('<parsed>| item |'), runs_div.innerHTML.includes(`| ${mark('#chat/topic')} | p | r7 | 3s | (read-only) | \\(no activity yet\\) |`), /\n\n_bridge listing from h, updated /.test(runs_div.innerHTML)], [1, true, true, true])
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
for (const dir of [path.join(__dirname, '..', '..', 'mind.page', 'node_modules', 'marked'), process.env.MARKED_DIR].filter(Boolean)) {
  try { realMarked = require(dir).marked; break } catch (e) { /* the next candidate */ }
}
if (!realMarked) console.log('skip real parser rows (marked not reachable; set MARKED_DIR)')
if (realMarked) {
  vm.runInContext("_this._global_store._bridge.runs = {r8: {item: 'chat-id', persona: 'p', started: " + clock.now + ", worktree: null, status: 'Executing bash: rg todo | head <x>'}}", ctx)
  const html = realMarked.parse(vm.runInContext('vault_runs_table()', ctx))
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? ''
  check('real parser: one body row for one run', (body.match(/<tr>/g) ?? []).length, 1)
  check('real parser: seven cells, the status with its pipe and markup kept as text, the stop link last', [(body.match(/<td[ >]/g) ?? []).length, body.includes('<td align="left">Executing bash: rg todo | head &lt;x&gt;</td>'), /<td align="left"><a href="stop_run\('r8'\)">stop<\/a><\/td>\s*<\/tr>\s*$/.test(body)], [7, true, true])
  // literal status text: bare and escaped pipes (any backslash parity), backticks, emphasis, a
  // link, HTML, quotes, and line breaks all render as the status text itself, in one cell
  const visible = html => html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  for (const [text, shown] of [
    ["Executing bash: grep 'foo\\|bar' file.txt", null],
    ['Executing bash: grep "a\\\\|b" f', null],
    ['Executing bash: echo `x` **y** _z_ [q](u) ~~w~~ a\\b & <i>t</i> #h', null],
    ['Reading file docs/README.md ... done.', null],
    ['line one\r\nline two\rline three\nline four', 'line one line two line three line four'],
  ]) {
    vm.runInContext("_this._global_store._bridge.runs.r8.status = " + JSON.stringify(text), ctx)
    const row = realMarked.parse(vm.runInContext('vault_runs_table()', ctx)).match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? ''
    const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g), m => m[1])
    check(`real parser: ${JSON.stringify(text)} is one literal cell with the stop link last`, [cells.length, /<[a-z]/.test(cells[5]), visible(cells[5]), cells[6]], [7, false, shown ?? text, `<a href="stop_run('r8')">stop</a>`])
  }
  check('real parser: the stamp is a paragraph after the table', /<\/table>\s*<p><em>bridge listing from h, updated .* \(\d+s ago\)<\/em><\/p>/.test(html), true)
  check('real parser: the item cell carries the clickable tag markup', body.includes("onmousedown=\"_handleTagClick('vault-id','#chat/topic','#chat/topic',event)\""), true)
}

// the log tails: their own element, rewritten only when the content changes, with the open
// blocks kept open by run id across the rewrite
logs_div.writes = 0
vm.runInContext("_this._global_store._bridge.runs = {r1: {item: 'chat-id', persona: 'p', started: " + clock.now + ", worktree: null, log: ['00:00:01 a']}, r2: {item: 'chat2-id', persona: 'p', started: " + clock.now + ", worktree: null, log: ['00:00:01 b']}}; update_vault_runs()", ctx)
check('the logs render into their own element', [logs_div.writes, logs_div.details.map(d => d.dataset.run)], [1, ['r1', 'r2']])
vm.runInContext('update_vault_runs()', ctx)
check('an unchanged log rendering is not rewritten', logs_div.writes, 1)
logs_div.details[0].click() // the user opens r1's log
check('the open block is remembered in the item state from its toggle event', vm.runInContext('_this.store._vault_open', ctx), { r1: true })
vm.runInContext("_this._global_store._bridge.runs.r1.log.push('00:00:02 c'); update_vault_runs()", ctx)
check('a changed log rewrites the element and keeps the open block open', [logs_div.writes, logs_div.details.map(d => [d.dataset.run, d.open])], [2, [['r1', true], ['r2', false]]])
// the app's store delivery re-renders the whole item: fresh elements, the script run again
logs_div.replaced = fresh_logs_div()
runs_div.replaced = { writes: 0, _html: '', get innerHTML() { return this._html }, set innerHTML(v) { this.writes++; this._html = v } }
vm.runInContext("_this._global_store._bridge.runs.r1.log.push('00:00:03 d'); _on_global_store_change('vault-id', false)", ctx)
vm.runInContext(script[1], ctx)
check('after the item re-render the remembered block is open again on the fresh element', [logs_div.replaced.writes, logs_div.replaced.details.map(d => [d.dataset.run, d.open])], [1, [['r1', true], ['r2', false]]])
logs_div.replaced.details[0].click() // the user closes it
vm.runInContext("_this._global_store._bridge.runs.r1.log.push('00:00:04 e'); update_vault_runs()", ctx)
check('a user close is remembered: the next rewrite leaves it closed', [vm.runInContext('_this.store._vault_open', ctx), logs_div.replaced.details.map(d => d.open)], [{ r1: false }, [false, false]])
listing('{}') // the runs end: the marks released, the open state forgotten
vm.runInContext('update_vault_runs()', ctx)
check('a delisted run\'s open state is forgotten', [vm.runInContext('_this.store._vault_open', ctx), counts()], [{}, [0, 0, 0]])
logs_div.replaced = null
runs_div.replaced = null

// the proposals: the bridge's undecided chat worktrees with approve/reject links; a decision is a
// flag in this item's store (worktree -> {decision, t}), shown in flight with the bridge's outcome
vm.runInContext("_this._global_store = {_bridge: {runs: {}, worktrees: {chat_a1: {item: 'chat-id', generation: 1, commits: 2, result: null, decided: 0}, chat_b2: {item: 'other-id', generation: 2, commits: 0, result: 'refused: test.sh failed (exit 3) | see log', decided: " + now + "}, chat_c3: {item: 'other-id', generation: 1, commits: 1, result: 'refused: chat_c3 has a running run; decide again when it ends', decided: " + (now - 5) + "}}}, _owner: {stop: {}, decide: {chat_b2: {decision: 'accepted', t: " + now + "}, chat_c3: {decision: 'accepted', t: " + now + "}}}}; _this.global_store = _this._global_store", ctx)
const proposalLink = "(n, d, t) => `[${t}](${d}:${n})`"
const prows = vm.runInContext("vault_proposal_rows(_this._global_store._bridge, _this._global_store._owner.decide, " + proposalLink + ")", ctx)
check('proposal rows: the item cell, the worktree, its commits, the links; a completed refusal shows the outcome WITH the links (retry or switch); a decision the bridge has not answered yet is in flight', prows, [
  [mark('#chat/topic'), 'chat_a1', '2', '[approve](accepted:chat_a1) · [reject](rejected:chat_a1)'],
  ['other-id', 'chat_b2', '0', 'refused\\: test\\.sh failed \\(exit 3\\) \\| see log [approve](accepted:chat_b2) · [reject](rejected:chat_b2)'],
  ['other-id', 'chat_c3', '1', 'refused\\: chat\\_c3 has a running run\\; decide again when it ends accepted…'],
])
vm.runInContext("_this._global_store._bridge.worktrees.chat_a1.result = 'refused: chat_a1 is already decided'", ctx)
check('a supervisor refusal (no owner flag) is shown with the links', vm.runInContext("vault_proposal_rows(_this._global_store._bridge, {}, " + proposalLink + ")", ctx)[0][3], 'refused\\: chat\\_a1 is already decided [approve](accepted:chat_a1) · [reject](rejected:chat_a1)')
vm.runInContext("decide_worktree('chat_b2', 'rejected')", ctx)
check('after a refusal the owner can switch the decision: a new flag, newer than the outcome, is in flight', [vm.runInContext('_this.global_store._owner.decide.chat_b2.decision', ctx), vm.runInContext("vault_proposal_rows(_this._global_store._bridge, _this.global_store._owner.decide, " + proposalLink + ")", ctx)[1][3]], ['rejected', 'refused\\: test\\.sh failed \\(exit 3\\) \\| see log rejected…'])
check('proposals table: header and rows', vm.runInContext('vault_proposals_table()', ctx).split('\n')[0], '| item | worktree | commits |  |')
vm.runInContext("decide_worktree('chat_a1', 'rejected')", ctx)
const decide = vm.runInContext('_this.global_store._owner.decide', ctx)
check('decide_worktree writes the flag with a timestamp, keeps the other listed flags, and keeps stop', [Object.keys(decide).sort(), decide.chat_a1.decision, typeof decide.chat_a1.t, vm.runInContext('_this.global_store._owner.stop', ctx)], [['chat_a1', 'chat_b2', 'chat_c3'], 'rejected', 'number', {}])
vm.runInContext("_this._global_store._bridge.worktrees = {chat_a1: {item: 'chat-id', generation: 1, commits: 2}}; decide_worktree('chat_a1', 'accepted')", ctx)
check('a flag of a worktree no longer listed is dropped on the explicit action', Object.keys(vm.runInContext('_this.global_store._owner.decide', ctx)), ['chat_a1'])
vm.runInContext("_this._global_store._bridge.worktrees = {}; update_vault_runs()", ctx)
check('no proposals renders as none, into the proposals element', proposals_div.innerHTML, '<parsed>_none_</parsed>')

// the queued window (design section 11): the bridge lists requests admitted to a lane before
// their run starts; the item marks them, shows the status 'queued', and lists them in the table;
// a queued entry becoming a run keeps the one reference; the welcome marks from the store alone
vm.runInContext("_this.store = {}; _this._global_store = {_bridge: {host: 'h', updated: " + now + ", runs: {}, queued: {'chat2-id': {persona: 'fable', since: " + (clock.now - 3000) + "}}}, _owner: {stop: {}}}; _this.global_store = _this._global_store; _on_welcome()", ctx)
check('welcome marks a queued request from the store (no item is scanned) and shows its status', [counts(), marks(), status('chat2-id')], [[0, 1, 0], { 'chat2-id': true }, ['queued', 0]])
check('the table lists the queued request with its wait and no stop link', vm.runInContext('vault_runs_table()', ctx).split('\n')[2], `| ${mark('#chat/two')} | fable | (queued) | 3s | · | queued | · |`)
vm.runInContext("_this._global_store._bridge = {host: 'h', updated: " + now + ", runs: {r9: {item: 'chat2-id', persona: 'fable', started: " + now + ", worktree: null}}, queued: {}}; _on_global_store_change('vault-id', false)", ctx)
check('the queued entry becoming a run keeps the one reference and shows the run status', [counts(), status('chat2-id')], [[0, 1, 0], ['', 0]])
listing('{}')
check('the run ending releases the reference and clears the status', [counts(), status('chat2-id')], [[0, 0, 0], ['', 0]])
// one status per chat (design mind_vault_supervisor 2.3, B4 + R4): a supervisor's turn beside
// its worker shows the status posted on the worker's run whichever order the bridge lists them
// in; the worker outliving the supervisor keeps it; a later supervisor turn posting on its own
// run takes over; a note-only entry does not count; equal starts fall back to the run id; a
// worker queued behind another chat stays visible through the workers projection, under a
// follow-up supervisor request and after it
const bridge = (runs, workers = '{}') => vm.runInContext(`_this._global_store._bridge = {host: 'h', updated: ${now}, runs: ${runs}, queued: {}, workers: ${workers}}; _on_global_store_change('vault-id', false)`, ctx)
const sup_store = sup => vm.runInContext(`_this._global_store._supervisor = {runs: ${sup}}`, ctx)
const s1 = `s1: {item: 'chat2-id', persona: 'default', started: ${now - 2000}, worktree: null, status: 'Thinking'}`
const w1 = `w1: {item: 'chat2-id', persona: 'worker', started: ${now - 1000}, worktree: 'chat_two', status: 'Reading x'}`
sup_store("{w1: {status: 'step 1 of 3', progress: 0.3}}")
bridge(`{${s1}, ${w1}}`)
check('supervisor then worker: the status posted on the worker shows', status('chat2-id'), ['step 1 of 3', 0.3])
bridge(`{${w1}, ${s1}}`)
check('worker then supervisor: the same', status('chat2-id'), ['step 1 of 3', 0.3])
bridge(`{${w1}}`)
check('the supervisor ended first: the worker keeps showing its posted status', status('chat2-id'), ['step 1 of 3', 0.3])
const s2 = `s2: {item: 'chat2-id', persona: 'default', started: ${now + 1000}, worktree: null, status: 'Thinking'}`
sup_store("{w1: {status: 'step 1 of 3', progress: 0.3}, s2: {status: 'reviewing the report', progress: 0.9}}")
bridge(`{${w1}, ${s2}}`)
check('a later supervisor turn posting on its own run takes over', status('chat2-id'), ['reviewing the report', 0.9])
sup_store("{w1: {status: 'step 1 of 3', progress: 0.3}, s2: {notes: [{t: 1, text: 'n'}]}}")
bridge(`{${w1}, ${s2}}`)
check('a note-only supervisor entry does not count: the worker\'s posted status wins', status('chat2-id'), ['step 1 of 3', 0.3])
sup_store('{}')
const s3 = `s3: {item: 'chat2-id', persona: 'default', started: ${now - 1000}, worktree: null, status: 'Thinking'}`
bridge(`{${s3}, ${w1}}`)
check('nothing posted, equal starts: the run id decides, deterministically', status('chat2-id'), ['Reading x', 0])
bridge(`{${s3}}`, "{'chat2-id': {worker: 'w0000aaaa', phase: 'queued', run: null, worktree: 'chat_two', since: 1}}")
check('a queued worker under its chat\'s supervisor turn: the listed run\'s status shows, the chat is held', [status('chat2-id'), counts()], [['Thinking', 0], [0, 1, 0]])
bridge('{}', "{'chat2-id': {worker: 'w0000aaaa', phase: 'queued', run: null, worktree: 'chat_two', since: 1}}")
check('the supervisor turn over, the queued worker keeps the chat marked and shows its phase', [status('chat2-id'), counts()], [['queued', 0], [0, 1, 0]])
bridge('{}', "{'chat2-id': {worker: 'w0000aaaa', phase: 'finishing', run: 'w1', worktree: 'chat_two', since: 1}}")
check('a finishing worker (delisted, not yet ended) shows its phase', status('chat2-id'), ['finishing', 0])
bridge('{}')
check('the worker ended: the chat is released and its status cleared', [status('chat2-id'), counts()], [['', 0], [0, 0, 0]])
// the table shows a worker whose run is not listed as a row of its own (B2 of review 6): queued
// behind another chat, under its chat's follow-up supervisor turn, then executing (its run's row,
// no duplicate), finishing (delisted, its row back), and gone once ended
const table = () => vm.runInContext('vault_runs_table()', ctx).split('\n').filter(r => r.startsWith('| ')).slice(2) // the data rows
const w_queued = "{'chat2-id': {worker: 'w0000aaaa', phase: 'queued', run: null, worktree: 'chat_two', since: " + (clock.now - 5000) + "}}"
bridge('{}', w_queued)
check('a queued worker has a compact row', table(), [`| ${mark('#chat/two')} | worker | w0000aaaa (queued) | 5s | chat_two | queued | · |`])
bridge(`{${s3}}`, w_queued)
check('under its chat\'s supervisor turn the worker keeps its row beside the supervisor\'s', table().map(r => r.split(' | ')[2]), ['w0000aaaa (queued)', 's3'])
bridge(`{${w1}}`, "{'chat2-id': {worker: 'w0000aaaa', phase: 'executing', run: 'w1', worktree: 'chat_two', since: " + (clock.now - 5000) + "}}")
check('an executing worker is its run\'s row only (no duplicate)', table().map(r => r.split(' | ')[2]), ['w1'])
bridge('{}', "{'chat2-id': {worker: 'w0000aaaa', phase: 'finishing', run: 'w1', worktree: 'chat_two', since: " + (clock.now - 5000) + "}}")
check('a finishing worker (delisted) has its row back', table(), [`| ${mark('#chat/two')} | worker | w0000aaaa (finishing) | 5s | chat_two | finishing | · |`])
bridge('{}')
check('the worker ended: no row', vm.runInContext('vault_runs_table()', ctx).startsWith('_none_'), true)
// the welcome parses no item: _items throws during it
vm.runInContext("_this.store = {}; _this._global_store = {_bridge: {host: 'h', updated: " + now + ", runs: {}, queued: {}}, _owner: {stop: {}}}; _this.global_store = _this._global_store", ctx)
const realItems = env._items
env._items = () => { throw new Error('welcome must not enumerate items') }
vm.runInContext('_items = () => { throw new Error("welcome must not enumerate items") }', ctx)
let welcomeError = null
try { vm.runInContext('_on_welcome()', ctx) } catch (e) { welcomeError = String(e) }
check('the welcome marks from the store without enumerating items', welcomeError, null)
vm.runInContext('_items = undefined', ctx)
env._items = realItems
// the save-time mark (design section 12): a save in this tab of an item the app routes to the
// vault (the stubbed window._grammar.routed over the raw text) takes one reference at once and
// starts the timeout task; the listing takes the reference over when it lists the item, in either
// order, never two; without a listing the reply (a remote change), a save that removed the route,
// the deletion, or the timeout releases it
const change = (id, { remote = false, deleted = false } = {}) => vm.runInContext(`_on_item_change('${id}', '#x', '#x', ${deleted}, ${remote}, false)`, ctx)
const pending = () => vm.runInContext('_this.store._vault_pending', ctx)
const pendingTask = () => tasks.findLast(t => t.name === 'pending')
vm.runInContext("_this.store = {}; _this._global_store = {_bridge: {host: 'h', updated: " + now + ", runs: {}, queued: {}}, _owner: {stop: {}}}; _this.global_store = _this._global_store; _on_welcome()", ctx)
const tasksBefore = tasks.length
change('chat-id')
check('a local save of a routed item marks at once, records the save time, and starts the pending task', [counts(), marks(), pending(), tasks.length - tasksBefore, [pendingTask().delay, pendingTask().repeat]], [[1, 0, 0], { 'chat-id': true }, { 'chat-id': clock.now }, 1, [1000, 1000]])
clock.now += 1000
change('chat-id')
check('a re-save adds no reference and restarts the timeout', [counts(), pending()], [[1, 0, 0], { 'chat-id': clock.now }])
check('a tick before the timeout releases nothing and keeps the task', [pendingTask().fn() === undefined, counts()], [true, [1, 0, 0]])
listing("{r1: {item: 'chat-id'}}")
check('the listing takes the mark over: still one reference, no longer pending', [counts(), marks(), pending()], [[1, 0, 0], { 'chat-id': true }, {}])
check('the tick after the handoff ends the task', pendingTask().fn() === null, true)
change('chat-id')
change('chat-id', { remote: true })
check('while listed, a save and a remote change are the listing\'s: no reference taken or released', [counts(), pending()], [[1, 0, 0], {}])
listing('{}')
check('the delisting releases the handed-over reference', [counts(), marks()], [[0, 0, 0], {}])
listing("{r2: {item: 'chat2-id'}}") // the other order: listed first (a request saved on another device)
change('chat2-id')
check('listed first: the local save adds no reference and no pending mark', [counts(), pending()], [[0, 1, 0], {}])
listing('{}')
check('the delisting then releases the one reference', counts(), [0, 0, 0])
change('chat-id')
change('chat-id', { remote: true }) // the reply lands with no listing seen
check('the reply (a remote change) releases a pending mark', [counts(), marks(), pending()], [[0, 0, 0], {}, {}])
change('chat-id')
items['chat-id'].text = '#chat/topic #_agent/openai\nhello' // the route removed
change('chat-id')
check('a save that removed the route releases the pending mark', [counts(), pending()], [[0, 0, 0], {}])
items['chat-id'].text = routed_text('#chat/topic')
const gone = (items['gone-id'] = new FakeItem('#chat/gone', 0, routed_text('#chat/gone')))
change('gone-id')
delete items['gone-id'] // deleted: _item returns null
change('gone-id', { deleted: true })
check('a deletion drops the pending mark without a decrement (the count is gone with the item)', [gone.count, marks(), pending()], [1, {}, {}])
change('chat-id')
clock.now += 30000
check('the timeout tick releases the pending mark and ends the task', [pendingTask().fn() === null, counts(), marks(), pending()], [true, [0, 0, 0], {}, {}])
change('chat-id')
clock.now += 30000
vm.runInContext("_on_global_store_change('vault-id', false)", ctx)
check('a reconciliation releases an overdue pending mark too', [counts(), pending()], [[0, 0, 0], {}])
// the item's earliest code held a pending reference of its own beside the listing's, both `true`:
// a tab still running it when this update arrives releases the pending one and keeps the listing's
vm.runInContext("_this.store._vault_pending = {'chat-id': true}; items['chat-id'].count = 1; _on_global_store_change('vault-id', false)", ctx)
check('a legacy pending mark alone (the earliest code, kept in the session store across /_update) is released at the first reconciliation', [counts(), pending()], [[0, 0, 0], {}])
listing("{r3: {item: 'chat-id'}}")
vm.runInContext("_this.store._vault_pending = {'chat-id': true}; items['chat-id'].count = 2; _on_global_store_change('vault-id', false)", ctx)
check('a legacy pending mark beside the listing\'s reference releases only its own and keeps the listing\'s record', [counts(), marks(), pending()], [[1, 0, 0], { 'chat-id': true }, {}])
listing('{}')
check('the delisting then releases the listing\'s reference: nothing leaks', [counts(), marks()], [[0, 0, 0], {}])
// a chat created in this tab keeps a temporary id until the tab reloads: the app calls
// _on_item_change with it, the bridge lists the saved document id, and _item resolves the saved id
// to the same item, so the records are keyed by the item's own id in both orders (review 0 B1)
items['chat-saved'] = items['chat-id'] // the saved id resolves to the item whose own id is chat-id
change('chat-id')
listing("{r4: {item: 'chat-saved'}}")
check('a new chat: the listing by the saved id takes over the mark taken under the temporary id (one reference, not pending)', [counts(), marks(), pending()], [[1, 0, 0], { 'chat-id': true }, {}])
listing('{}')
check('and its delisting releases that reference before any reply', counts(), [0, 0, 0])
listing("{r5: {item: 'chat-saved'}}")
change('chat-id')
check('listed by the saved id first: a local edit under the temporary id adds no reference', [counts(), marks(), pending()], [[1, 0, 0], { 'chat-id': true }, {}])
listing('{}')
check('and the delisting releases the one reference', counts(), [0, 0, 0])
delete items['chat-saved']
change('web-id')
check('a save of a web-routed item takes no mark', [items['web-id'].count, marks()], [0, {}])
const grammar = env.window._grammar
delete env.window._grammar // a stale app without the capability
change('chat-id')
check('without the app\'s grammar capability no mark is taken (the listing alone marks)', [counts(), marks()], [[0, 0, 0], {}])
env.window._grammar = grammar
check('the item neither enumerates items nor parses request grammar for its marks', [/\b_items\(/.test(block[1]), block[1].includes('_parse_tags'), block[1].includes('.read(')], [false, false, false])
// a routed item that opens no user turn is no request: its local save takes no mark. The REAL
// installed sources (the route item, the command item, this helper) all carry a vault route and
// an ESCAPED mention of the delimiter in prose or code (what /update re-saves), a persona item
// carries neither; a chat with a turn, canonical or with spaces inside the delimiter, is marked
const installed = {
  'route-id': fs.readFileSync(path.join(__dirname, '..', 'agent', 'vault.md'), 'utf8'),
  'command-id': fs.readFileSync(path.join(__dirname, '..', 'chat', 'vault.md'), 'utf8'),
  'helper-id': item,
  'persona-id': '#agent/vault/x is a persona item\nno turn here',
}
for (const [id, text] of Object.entries(installed)) {
  items[id] = new FakeItem('#' + id, 0, text)
  check(`the harness routes the installed source ${id} (a vault route tag) so the turn check decides`, env.window._grammar.routed(text), true)
  change(id)
  check(`a local save of the installed ${id} takes no mark (an escaped delimiter mention is no turn)`, [items[id].count, items[id].running], [0, false])
}
for (const turn of ['<<user>> hello', '<< user >> hello', '<<user >> hello', '<< user>> hello']) {
  const id = 'turn-' + turn.replace(/\W/g, '')
  items[id] = new FakeItem('#chat/t', 0, `#chat/t #_agent/vault\n${turn}`)
  change(id)
  check(`a chat whose text opens the turn ${JSON.stringify(turn)} is marked at its save`, [items[id].count, items[id].running], [1, true])
  change(id, { deleted: true })
}
items['persona-id'].text = '#agent/vault/x\n<<user>> now a request'
change('persona-id')
check('the persona item given a real turn is marked at its save', [items['persona-id'].count, items['persona-id'].running], [1, true])
change('persona-id', { deleted: true })
check('its deletion releases the mark', items['persona-id'].count, 0)
check('a change of a non-routed item runs only the deferred status clearing', vm.runInContext("(() => { _this.store._vault_shown = {'busy-id': true}; items['busy-id'].status = 'stale'; _on_item_change('busy-id', '#x', '#x', false, false, false); return [_this.store._vault_shown, items['busy-id'].status, _this.store._vault_marked] })()", ctx), [{}, '', {}])
check('the item source has no unescaped macro delimiters (the app expands macros before it strips code blocks)', (item.match(/(?<!\\)<</g) ?? []).length, 0)
check('the stamp age formats seconds, minutes, and hours', [vm.runInContext('vault_age(5000)', ctx), vm.runInContext('vault_age(200000)', ctx), vm.runInContext('vault_age(7500000)', ctx)], ['5s', '3m 20s', '2h 5m'])

if (failures) { console.log(`${failures} failure(s)`); process.exit(1) }
console.log('all checks passed')
