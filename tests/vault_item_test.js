#!/usr/bin/env node
// plain-node table for the #vault item (vault.md): the row builder over the REAL `table` helper of
// util/core.js (extracted by name), so a read-only run (no worktree) renders, a stop flag or a
// bridge-reported stop shows "stopping…", a status line or an outcome is a second row of one cell
// spanning the columns, and the empty and missing listings render their notes.
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
  constructor(name, running = 0, text = '', tags = [], deps = []) { this.name = name; this.count = running; this.text = text; this.tags = tags; this.id = name + '-id'; this.deps = deps; this.hash = 1 }
  get label() { return this.name } // the case-preserving label text
  get tags_hidden() { return Array.from(this.text.matchAll(/(?:^|\s)#_([\w/-]+)/g), m => '#' + m[1].toLowerCase()) } // the app's view: the hiding underscore dropped, lowercase
  get dependencies() { return this.deps } // the ordered closure, as the fixtures declare it
  get deephash() { return this.hash }
  read() { return this.text.replace(/<!--inert-->[\s\S]*?<!--\/inert-->/g, m => '<!--inert-->' + ' '.repeat(m.length - 24) + '<!--/inert-->') } // the grammar view: an inert body opaque
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
const routed_text = name => `${name} #_agent/vault\n<<user>> hello`
const items = { 'chat-id': new FakeItem('#chat/topic', 0, routed_text('#chat/topic'), [], ['chat-root']), 'chat2-id': new FakeItem('#chat/two', 0, routed_text('#chat/two'), [], ['chat-root']), 'busy-id': new FakeItem('#chat/busy', 1, '', [], ['chat-root']), 'web-id': new FakeItem('#chat/web', 0, '#chat/web #_agent/openai\nhello', [], ['chat-root']) }
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
  _item: key => { // by id, or by UNIQUE case-insensitive name (as the app's _item(name)); 'other-id' is a deleted item
    if (items[key]) return items[key]
    const named = Object.values(items).filter(i => i.name?.toLowerCase() === String(key).toLowerCase())
    return named.length === 1 ? named[0] : null
  },
  Date: class extends Date { static now() { return clock.now } }, // the item's clock, advanced by the witness
  Math,
  Object,
  console,
  marked: { parse: s => `<parsed>${s}</parsed>` }, // the app's Markdown parser, stubbed
  window: { _grammar: { version: 2, routed: text => /#_?agent\/(vault|native)(\/|\b)/i.test(text) } }, // the app's versioned grammar capability with its routing predicate over an item's raw text, stubbed
  _items: () => Object.values(items),
  elem: s => (s === '.logs' ? logs_div.replaced ?? logs_div : s === '.proposals' ? proposals_div : s !== '.runs' || runs_div.missing ? null : runs_div.replaced ?? runs_div), // the item's own elements (util/core/item.js)
}
// the responder's own functions (chat.js: the #chat item's is_chat_item and parse_messages;
// agent/chat.js: #agent/chat's vault_routed_item), evaluated in a context of their own over the
// same fakes, and reached by the vault item through the source fakes' eval seam (the app's
// _item(ref).eval); evals counted for the cache rows
const chat_src = fs.readFileSync(path.join(__dirname, '..', 'chat.js'), 'utf8')
const agent_src = fs.readFileSync(path.join(__dirname, '..', 'agent', 'chat.js'), 'utf8')
const pick_fn = (src, name) => src.match(new RegExp(`\\nfunction ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}\\n`))[0]
const pick_arrow = (src, name) => src.match(new RegExp(`\\nconst ${name} = [\\s\\S]*?\\n\\n`))[0]
// the app's evals reachable from the chat code (a delimiter name through __eval, an agent
// block through _this.eval): recorded, and refused, so an observer that evaluates fails loudly
const evaluated = []
const refuse = code => { evaluated.push(code); throw new Error('the observer must not evaluate chat text') }
const chat_env = {
  _item: env._item, window: env.window, console,
  equal: (a, b) => JSON.stringify(a) === JSON.stringify(b), lower: x => x.toLowerCase(), defined: x => x !== undefined,
  is_string: x => typeof x === 'string', is_item: x => x instanceof FakeItem, is_plain_object: x => x !== null && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype,
  each: (a, f) => { a.forEach((x, i) => f(x, i, a)); return a }, fatal: (...m) => { throw new Error(m.join(' ')) },
  __eval: refuse, _this: { error() {}, write_log() {}, eval: refuse }, JSON,
}
const chat_ctx = vm.createContext(chat_env)
const evals = { count: 0 }
const source_item = (name, text) => Object.assign(new FakeItem(name, 0, text), { eval: code => { evals.count++; return vm.runInContext(code, chat_ctx) } })
items['chat-root'] = source_item('#chat', '#chat defines utilities for chat items\n#_util/core #_autodep')
items['agent-chat'] = source_item('#agent/chat', '#agent/chat is a generic chat agent\n#_chat')
items['chat-root'].id = 'chat-root'
items['agent-chat'].id = 'agent-chat'
// the chat root is captured at the code's load (`const _chat = _item('$id')`), so the fakes come first
vm.runInContext(chat_src.match(/^const _chat = _item\('\$id'\)\n/)[0].replace('$id', 'chat-root') + pick_arrow(chat_src, 'is_chat_item') + pick_arrow(chat_src, 'chat_parent') + chat_src.match(/\nconst _message_regex =\n[^\n]*\n/)[0] + pick_fn(chat_src, 'parse_messages') + pick_fn(chat_src, 'parse_last_turn') + pick_fn(agent_src, 'vault_routed_item'), chat_ctx)
const saves = [] // this item's own saves: the options each save_global_store call carried
env._this = {
  id: 'vault-id',
  save_global_store: opts => saves.push(opts), // the app's save (a task; the change handlers run after it)
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
  [mark('#chat/topic'), 'fable', 'r1', '5s', '(read-only)', '·', 'stopping…'])
check('rows: an unknown item id shows the id; a bridge-reported stop shows stopping', rows[1],
  ['other-id', 'fable_wt', 'r2', '65s', 'chat_x', '·', 'stopping…'])
const sup = { r1: { status: 'supervisor: reviewing the diff', progress: 0.25, notes: [{ t: now, text: 'looks fine <b>' }] } }
const withStatus = vm.runInContext("(() => { const b = _this._global_store._bridge; b.runs.r2.status = 'Reading file docs/x.md'; b.runs.r2.log = ['00:00:01 Reading file docs/x.md', '00:00:02 Executing bash: ls']; return vault_runs_rows(b, {}, " + now + ", id => 'stop', " + JSON.stringify(sup) + ") })()", ctx)
// an entry's free text: a second row of ONE cell (the table helper spans it over the columns), the
// text in the span the item's style wraps at the visible width and keeps in view
const sub = text => [`<span>${text}</span>`]
const unspan = html => html.match(/^<span>([\s\S]*)<\/span>$/)?.[1] ?? 'NO SPAN: ' + html
check('rows: a status line is a second row of ONE cell under its run; the main row keeps the progress alone, or a dot; the supervisor status overrides the bridge activity', withStatus, [
  [mark('#chat/topic'), 'fable', 'r1', '5s', '(read-only)', '25%', 'stop'],
  sub('supervisor\\: reviewing the diff'), /* the parser's escapes, undone at render */
  ['other-id', 'fable_wt', 'r2', '65s', 'chat_x', '·', 'stopping…'],
  sub('Reading file docs\\/x\\.md'),
])
const details = vm.runInContext("vault_runs_details(_this._global_store._bridge, " + JSON.stringify(sup) + ")", ctx)
check('details: one block per run with a log tail or notes, escaped; the summary shows the hand cursor and keeps its click from the item', details, '<details data-run="r1"><summary style="cursor:pointer" onclick="event.stopPropagation()">r1 log</summary><pre>note looks fine &lt;b&gt;</pre></details>\n<details data-run="r2"><summary style="cursor:pointer" onclick="event.stopPropagation()">r2 log</summary><pre>00:00:01 Reading file docs/x.md\n00:00:02 Executing bash: ls</pre></details>')
vm.runInContext("delete _this._global_store._bridge.runs.r2.status; delete _this._global_store._bridge.runs.r2.log", ctx)
const rendered = vm.runInContext('vault_runs_table()', ctx)
check('table: the real helper renders both rows with the headers, then a blank line and the stamp', rendered.split('\n').length, 6)
check('table: header row (the progress column: the status line itself is the row below)', rendered.split('\n')[0], '| item | persona | run | elapsed | worktree | progress |  |')
check('table: the listing stamp follows as its own paragraph, with its age', /\n\n_listed by test-host at .* \(0s ago\)_$/.test(rendered), true)
const one = vm.runInContext(
  "(() => { const b = {updated: " + now + ", host: 'h', runs: {r3: {item: 'x', persona: 'p', started: " + now + ", worktree: null}}};" +
  " _this._global_store = {_bridge: b, _owner: {stop: {}}}; return vault_runs_table() })()", ctx)
check('table: a lone read-only run renders (the empty-column case)', one.split('\n')[2], "| x | p | r3 | 0s | (read-only) | · | [stop](stop_run('r3')) |")
vm.runInContext("_this._global_store = {_bridge: {updated: " + now + ", host: 'h', runs: {}}}", ctx)
check('empty listing keeps its stamp', vm.runInContext('vault_runs_table()', ctx), '_none_ _listed by h at ' + new Date(now).toLocaleTimeString() + ' (0s ago)_')
vm.runInContext('_this._global_store = {}', ctx)
check('missing listing explains itself', vm.runInContext('vault_runs_table()', ctx).startsWith('_no listing yet'), true)
// stop_run prunes flags of delisted runs on the explicit action and never touches _bridge
vm.runInContext("_this._global_store = {_bridge: {runs: {r9: {}}}, _owner: {stop: {old: 1}}}; _this.global_store = _this._global_store; stop_run('r9')", ctx)
check('stop_run keeps _bridge and prunes stale flags', vm.runInContext('_this.global_store', ctx), { _bridge: { runs: { r9: {} } }, _owner: { stop: { r9: vm.runInContext('_this.global_store._owner.stop.r9', ctx) } } })
check('the stop flag is a timestamp', typeof vm.runInContext('_this.global_store._owner.stop.r9', ctx), 'number')
check('stop_run saves the whole store without the re-render the app forces on a save (the change handler renders the flag in place)', saves.splice(0), [{ invalidate_elem_cache: false }])
vm.runInContext("_this._global_store = {}; _this.global_store = _this._global_store; _on_welcome()", ctx)
check('welcome provisions the store', vm.runInContext('_this.global_store', ctx), { _owner: { stop: {} } })
check('welcome saves the provisioned store the same way', saves.splice(0), [{ invalidate_elem_cache: false }])
// the running marks: one reference of this tab's own per listed chat item (the app's refcount)
const counts = () => vm.runInContext("[items['chat-id'].count, items['chat2-id'].count, items['busy-id'].count]", ctx)
const marks = () => vm.runInContext('_this.store._vault_marked', ctx)
// a listing of minimal rows: the bridge's rows always carry a persona and a start, and the table,
// rendered at every store change, needs a value in every column, so the helper fills them in
const listing = runs => vm.runInContext(`_this._global_store._bridge = {runs: ${runs}}; for (const r of Object.values(_this._global_store._bridge.runs)) { r.persona ??= 'p'; r.started ??= ${now} }; _on_global_store_change('vault-id', false)`, ctx)
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
runs_div.writes = 0 // the store changes above rendered into it; this section counts the script's own
delete runs_div._vault_html
vm.runInContext("_this._global_store = {_bridge: {updated: " + now + ", host: 'h', runs: {r7: {item: 'chat-id', persona: 'p', started: " + (now - 3000) + ", worktree: null}}}, _owner: {stop: {}}}", ctx)
vm.runInContext(script[1], ctx)
check('the script renders at once: the table with the elapsed value, then the stamp paragraph', [runs_div.writes, runs_div.innerHTML.startsWith('<parsed>| item |'), runs_div.innerHTML.includes(`| ${mark('#chat/topic')} | p | r7 | 3s | (read-only) | · |`), /\n\n_listed by h at /.test(runs_div.innerHTML)], [1, true, true, true])
check('the script registers the one-second task', tasks.map(t => [t.name, t.delay, t.repeat]), [['update', 1000, 1000]])
tasks[0].fn()
check('a tick without a clock change is not reassigned', runs_div.writes, 1)
clock.now += 2000
tasks[0].fn()
check('a tick after two seconds advances the elapsed column without a store delivery', [runs_div.writes, runs_div.innerHTML.includes('| r7 | 5s |')], [2, true])
// a change of this store (the bridge's listing, or this tab's flag) rewrites the elements in
// place from the change handler, which returns true: the app then skips the re-render it would
// force on a remote delivery (design 2026-09-19: fresh empty elements painted before this script
// refilled them, the item collapsed for a frame); another store's change is not this item's
const changed = vm.runInContext("_this._global_store._bridge.runs.r7.status = 'Reading file x'; _on_global_store_change('vault-id', true)", ctx)
check('a store change rewrites the listing in place and reports it rendered: the status line a full-span row under its run', [changed, runs_div.writes, runs_div.innerHTML.includes("| r7 | 5s | (read-only) | · | [stop](stop_run('r7')) |\n| <span>Reading file x</span> |||||||")], [true, 3, true])
check('a foreign store\'s change rewrites nothing and reports nothing', [vm.runInContext("_on_global_store_change('other-id', true)", ctx), runs_div.writes], [undefined, 3])
vm.runInContext("_this._global_store._bridge.runs = {}", ctx)
tasks[0].fn()
check('an empty listing renders its note', [runs_div.writes, runs_div.innerHTML.startsWith('<parsed>_none_')], [4, true])
runs_div.missing = true // the item left the DOM
tasks[0].fn()
check('a tick without the element is a no-op', runs_div.writes, 4)
runs_div.missing = false
runs_div.replaced = { writes: 0, _html: '', get innerHTML() { return this._html }, set innerHTML(v) { this.writes++; this._html = v } }
vm.runInContext(script[1], ctx) // the item re-rendered: a fresh element, the script runs again
check('a re-render renders the fresh element and re-registers the task', [runs_div.replaced.writes, tasks.length], [1, 2])
// the real parser, when the app checkout is reachable (the sibling mind.page; MIND_PAGE_DIR names
// another, which then MUST load; a review worktree leaves external/mind.page empty, which skips
// these rows and the wiki rows at the end, a printed line each), built as the app's global parser
// is (client-globals.ts: marked with the vendored marked-extended-tables, whose colspan syntax the
// table helper's repeated pipes are): a main row per run, its status line as a second row of one
// cell spanning the columns, the stamp as a separate paragraph
const app = process.env.MIND_PAGE_DIR ?? path.join(__dirname, '..', '..', 'mind.page')
let realMarked = null
try {
  const { Marked } = require(path.join(app, 'node_modules', 'marked'))
  const tables = require(path.join(app, 'src', 'vendor', 'marked-extended-tables.js')).default
  realMarked = new Marked({ gfm: true })
  realMarked.use(tables())
} catch (e) {
  if (process.env.MIND_PAGE_DIR) throw e
  console.log('skip real parser rows (the app checkout is not reachable; set MIND_PAGE_DIR)')
}
// the body rows of a parsed table, each a list of [attributes, content] cells
const parsed_rows = html => Array.from((html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr>([\s\S]*?)<\/tr>/g), r => Array.from(r[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g), c => [c[1].trim(), c[2]]))
if (realMarked) {
  vm.runInContext("_this._global_store._bridge.runs = {r8: {item: 'chat-id', persona: 'p', started: " + clock.now + ", worktree: null, status: 'Executing bash: rg todo | head <x>'}}", ctx)
  const html = realMarked.parse(vm.runInContext('vault_runs_table()', ctx))
  const rows = parsed_rows(html)
  check('real parser: one run is a main row of seven cells ending with the stop link, then ONE cell spanning the seven columns with the status in its span, its pipe and markup kept as text', [rows.length, rows[0].length, rows[0][6], rows[1]], [2, 7, ['align=left', `<a href="stop_run('r8')">stop</a>`], [['colspan=7 align=left', '<span>Executing bash: rg todo | head &lt;x&gt;</span>']]])
  // literal status text: bare and escaped pipes (any backslash parity; a trailing one before the
  // span's own pipes), a trailing backslash, backticks, emphasis, a link, HTML, quotes, line
  // breaks, and the extension's rowspan marker all render as the status text itself, in one
  // full-span cell
  const visible = html => html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  for (const [text, shown] of [
    ["Executing bash: grep 'foo\\|bar' file.txt", null],
    ['Executing bash: grep "a\\\\|b" f', null],
    ['Executing bash: cat x |', null],
    ['Executing bash: echo `x` **y** _z_ [q](u) ~~w~~ a\\b & <i>t</i> #h', null],
    ['Reading file docs/README.md ... done.', null],
    ['line one\r\nline two\rline three\nline four', 'line one line two line three line four'],
    ['^', null],
    ['abc\\', null],
  ]) {
    vm.runInContext("_this._global_store._bridge.runs.r8.status = " + JSON.stringify(text), ctx)
    const rows = parsed_rows(realMarked.parse(vm.runInContext('vault_runs_table()', ctx)))
    const span = unspan(rows[1][0][1])
    check(`real parser: ${JSON.stringify(text)} is one literal full-span cell under the seven-cell row with the stop link last`, [rows.length, rows[0].length, rows[0][6][1], rows[1].map(([attrs]) => attrs), /<[a-z]/.test(span), visible(span)], [2, 7, `<a href="stop_run('r8')">stop</a>`, ['colspan=7 align=left'], false, shown ?? text])
  }
  check('real parser: the stamp is a paragraph after the table', /<\/table>\s*<p><em>listed by h at .* \(\d+s ago\)<\/em><\/p>/.test(html), true)
  check('real parser: the item cell carries the clickable tag markup', html.includes("onmousedown=\"_handleTagClick('vault-id','#chat/topic','#chat/topic',event)\""), true)
  vm.runInContext('delete _this._global_store._bridge.runs.r8.status', ctx)
  check('real parser: a run without a status line is its main row alone', parsed_rows(realMarked.parse(vm.runInContext('vault_runs_table()', ctx))).map(r => r.length), [7])
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
// a store change rewrites the logs in place too (no item re-render); a re-render of the whole
// item for another reason (an edit, /update) brings fresh elements and runs the script again
vm.runInContext("_this._global_store._bridge.runs.r1.log.push('00:00:03 d'); _on_global_store_change('vault-id', false)", ctx)
check('a store change rewrites the logs in place and keeps the open block open', [logs_div.writes, logs_div.details.map(d => [d.dataset.run, d.open])], [3, [['r1', true], ['r2', false]]])
logs_div.replaced = fresh_logs_div()
runs_div.replaced = { writes: 0, _html: '', get innerHTML() { return this._html }, set innerHTML(v) { this.writes++; this._html = v } }
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
check('proposal rows: the item cell, the worktree, its commits, the state (a chat\'s), the links; a completed refusal is the entry\'s second row (one cell, spanned over the columns) WITH the links (retry or switch); a decision the bridge has not answered yet is in flight', prows, [
  [mark('#chat/topic'), 'chat_a1', '2', 'chat', '[approve](accepted:chat_a1) · [reject](rejected:chat_a1)'],
  ['other-id', 'chat_b2', '0', 'chat', '[approve](accepted:chat_b2) · [reject](rejected:chat_b2)'],
  sub('refused\\: test\\.sh failed \\(exit 3\\) \\| see log'),
  ['other-id', 'chat_c3', '1', 'chat', 'accepted…'],
  sub('refused\\: chat\\_c3 has a running run\\; decide again when it ends'),
])
vm.runInContext("_this._global_store._bridge.worktrees.chat_a1.result = 'refused: chat_a1 is already decided'", ctx)
check('a supervisor refusal (no owner flag) is shown under the row, the links kept', vm.runInContext("vault_proposal_rows(_this._global_store._bridge, {}, " + proposalLink + ")", ctx).slice(0, 2), [[mark('#chat/topic'), 'chat_a1', '2', 'chat', '[approve](accepted:chat_a1) · [reject](rejected:chat_a1)'], sub('refused\\: chat\\_a1 is already decided')])
vm.runInContext("decide_worktree('chat_b2', 'rejected')", ctx)
check('after a refusal the owner can switch the decision: a new flag, newer than the outcome, is in flight, the outcome still under the row', [vm.runInContext('_this.global_store._owner.decide.chat_b2.decision', ctx), vm.runInContext("vault_proposal_rows(_this._global_store._bridge, _this.global_store._owner.decide, " + proposalLink + ")", ctx).slice(2, 4)], ['rejected', [['other-id', 'chat_b2', '0', 'chat', 'rejected…'], sub('refused\\: test\\.sh failed \\(exit 3\\) \\| see log')]])
// task worktrees (design mind_vault_item 15): the state column is the task's marker word, the
// links are the decisions the bridge admits (its rule, published per decision: no rule here), a
// row admitting nothing shows a dot and why under it (after the outcome of a flag it refused; an
// unreadable record likewise), and a flag still unanswered is in flight whatever the row admits
const why = w => `agent-held (${w}); decide after it hands back`
vm.runInContext("Object.assign(_this._global_store._bridge.worktrees, {" +
  "chat_t1: {item: 'chat-id', generation: 1, commits: 3, result: 'refused: " + why('working') + "', decided: " + now + ", task: {held: 'agent', reason: 'working'}, admits: {accepted: '" + why('working') + "', rejected: '" + why('working') + "'}}, " +
  "chat_t2: {item: 'other-id', generation: 2, commits: 1, result: null, decided: 0, task: {held: 'owner', reason: 'taken'}, admits: {accepted: 'no standing proposal (taken); delegate for one', rejected: null}}, " +
  "chat_t3: {item: 'other-id', generation: 1, commits: 1, result: null, decided: 0, task: {held: 'owner', reason: 'proposal'}, admits: {accepted: null, rejected: null}}, " +
  "chat_t4: {item: 'other-id', generation: 1, commits: 1, result: null, decided: 0, task: {held: null, reason: 'unreadable'}, admits: {accepted: 'task record unreadable; see the bridge log', rejected: 'task record unreadable; see the bridge log'}}, " +
  "chat_t5: {item: 'other-id', generation: 1, commits: 1, result: null, decided: 0, task: {held: 'agent', reason: 'checkin'}, admits: {accepted: '" + why('checkin') + "', rejected: '" + why('checkin') + "'}}}); " +
  "_this._global_store._owner.decide.chat_t1 = {decision: 'rejected', t: " + now + "}; _this._global_store._owner.decide.chat_t5 = {decision: 'rejected', t: " + now + "}", ctx)
check('task rows: the state column, the admitted links only, a dot and the why under the row for none (after a refused flag\'s outcome), an unreadable record, a flag in flight', vm.runInContext("vault_proposal_rows(_this._global_store._bridge, _this._global_store._owner.decide, " + proposalLink + ").slice(6)", ctx), [
  [mark('#chat/topic'), 'chat_t1', '3', 'working', '·'],
  sub('refused\\: agent\\-held \\(working\\)\\; decide after it hands back · agent\\-held \\(working\\)\\; decide after it hands back'),
  ['other-id', 'chat_t2', '1', 'taken', '[reject](rejected:chat_t2)'],
  ['other-id', 'chat_t3', '1', 'proposal', '[approve](accepted:chat_t3) · [reject](rejected:chat_t3)'],
  ['other-id', 'chat_t4', '1', 'unreadable', '·'],
  sub('task record unreadable\\; see the bridge log'),
  ['other-id', 'chat_t5', '1', 'checkin', 'rejected…'],
])
vm.runInContext("for (const name of ['chat_t1', 'chat_t2', 'chat_t3', 'chat_t4', 'chat_t5']) delete _this._global_store._bridge.worktrees[name]; delete _this._global_store._owner.decide.chat_t1; delete _this._global_store._owner.decide.chat_t5", ctx)
check('proposals table: header and rows', vm.runInContext('vault_proposals_table()', ctx).split('\n')[0], '| item | worktree | commits | state |  |')
// the review links (design mind_vault_item 10): with the vault root in the listing the worktree cell links the
// editor's multi-diff of the proposal (the vault's VS Code extension handles the URI) and the folder; without
// it (an older bridge) the bare name; a name outside the grammar is never linked
check('review links with the root: anchors that stop the click (the item renders the table itself, so a bubbling click would open the editor)', vm.runInContext("vault_review_links('chat_a1', '/Users/olcan/vault')", ctx), '<a href="vscode-insiders://olcan.auto-open-obsidian/review?worktree=chat_a1&amp;root=%2FUsers%2Folcan%2Fvault" onclick="event.stopPropagation()">chat_a1</a> · <a href="vscode-insiders://olcan.auto-open-obsidian/open?worktree=chat_a1&amp;root=%2FUsers%2Folcan%2Fvault" onclick="event.stopPropagation()">dir</a>')
check('review links without the root, or an odd name (a space, a dot name)', [vm.runInContext("vault_review_links('chat_a1', undefined)", ctx), vm.runInContext("vault_review_links('a b', '/r')", ctx), vm.runInContext("vault_review_links('..', '/r')", ctx)], ['chat_a1', 'a b', '..'])
check('both links carry the root encoded (a space, a hash), the folder one through the extension too', vm.runInContext("vault_review_links('chat_a1', '/Users/o c/v#1')", ctx), '<a href="vscode-insiders://olcan.auto-open-obsidian/review?worktree=chat_a1&amp;root=%2FUsers%2Fo%20c%2Fv%231" onclick="event.stopPropagation()">chat_a1</a> · <a href="vscode-insiders://olcan.auto-open-obsidian/open?worktree=chat_a1&amp;root=%2FUsers%2Fo%20c%2Fv%231" onclick="event.stopPropagation()">dir</a>')
// the anchor builder behind the links, and the ONE anchor form of a review url: the todoer's task rows reach it
// through this item's eval to link a marker word, so a click there takes the path a click here takes — the inline
// click stop (the item renders the table itself, so a bubbling click would open the editor) and NO target, which
// leaves the click's default action alone, so the browser navigates in place and hands the vscode: url to the
// editor (a target would open a browser tab that launches the editor and stays behind empty). Optional text and
// tooltip; the url and the tooltip are escaped here; none without a url
check('the anchor builder: the text and the tooltip, the url and the tooltip escaped, the click stop, no target or rel', vm.runInContext('vault_review_anchor(\'chat_a1\', \'/r"x&y\', \'review\', \'done\', \'w · <t>\')', ctx), '<a href="vscode-insiders://olcan.auto-open-obsidian/review?worktree=chat_a1&amp;root=%2Fr%22x%26y" title="w · &lt;t&gt;" onclick="event.stopPropagation()">done</a>')
check('the anchor builder: the name is the default text and there is no tooltip without one — the links above are exactly this anchor', [vm.runInContext("vault_review_anchor('chat_a1', '/Users/olcan/vault')", ctx), vm.runInContext("vault_review_links('chat_a1', '/Users/olcan/vault')", ctx).split(' · ')[0]], ['<a href="vscode-insiders://olcan.auto-open-obsidian/review?worktree=chat_a1&amp;root=%2FUsers%2Folcan%2Fvault" onclick="event.stopPropagation()">chat_a1</a>', '<a href="vscode-insiders://olcan.auto-open-obsidian/review?worktree=chat_a1&amp;root=%2FUsers%2Folcan%2Fvault" onclick="event.stopPropagation()">chat_a1</a>'])
check('the anchor builder: none without the root, or for a name outside the grammar (the marker then stays plain text)', [vm.runInContext("vault_review_anchor('chat_a1', undefined)", ctx), vm.runInContext("vault_review_anchor('a b', '/r', 'review', 'done')", ctx)], [null, null])
// the url builder behind the anchor (the one place for the scheme and the editor): raw urls, escaped by the
// anchor; none without a root or for a name outside the grammar
check('the url builder: the review (the default action) and the folder', [vm.runInContext("vault_review_url('chat_a1', '/Users/olcan/vault')", ctx), vm.runInContext("vault_review_url('chat_a1', '/Users/olcan/vault', 'open')", ctx)], ['vscode-insiders://olcan.auto-open-obsidian/review?worktree=chat_a1&root=%2FUsers%2Folcan%2Fvault', 'vscode-insiders://olcan.auto-open-obsidian/open?worktree=chat_a1&root=%2FUsers%2Folcan%2Fvault'])
check('the url builder: none without the root, or for a name outside the grammar (a space, the dot names)', [vm.runInContext("vault_review_url('chat_a1', undefined)", ctx), vm.runInContext("vault_review_url('a b', '/r')", ctx), vm.runInContext("vault_review_url('..', '/r')", ctx), vm.runInContext("vault_review_url('.', '/r')", ctx)], [null, null, null, null])
vm.runInContext("_this._global_store._bridge.root = '/Users/olcan/vault'", ctx)
check('the rows carry the links once the listing names the root', vm.runInContext("vault_proposal_rows(_this._global_store._bridge, {}, " + proposalLink + ")", ctx)[0][1], '<a href="vscode-insiders://olcan.auto-open-obsidian/review?worktree=chat_a1&amp;root=%2FUsers%2Folcan%2Fvault" onclick="event.stopPropagation()">chat_a1</a> · <a href="vscode-insiders://olcan.auto-open-obsidian/open?worktree=chat_a1&amp;root=%2FUsers%2Folcan%2Fvault" onclick="event.stopPropagation()">dir</a>')
if (realMarked) {
  // the table reaches the page through the real parser: the anchors survive in the cell (a
  // markdown link would have rendered without the app's click handler and opened the editor), and
  // the outcome is the entry's second row, one cell spanning the five columns
  const rows = parsed_rows(realMarked.parse(vm.runInContext('vault_proposals_table()', ctx)))
  check('real parser: the worktree cell keeps both anchors, the click stopped and the query escaped', rows[0][1][1], '<a href="vscode-insiders://olcan.auto-open-obsidian/review?worktree=chat_a1&amp;root=%2FUsers%2Folcan%2Fvault" onclick="event.stopPropagation()">chat_a1</a> · <a href="vscode-insiders://olcan.auto-open-obsidian/open?worktree=chat_a1&amp;root=%2FUsers%2Folcan%2Fvault" onclick="event.stopPropagation()">dir</a>')
  check('real parser: the outcome is one cell spanning the five columns under its row', [rows[0].length, rows[1]], [5, [['colspan=5 align=left', '<span>refused: chat_a1 is already decided</span>']]])
}
vm.runInContext("delete _this._global_store._bridge.root", ctx)
vm.runInContext("decide_worktree('chat_a1', 'rejected')", ctx)
const decide = vm.runInContext('_this.global_store._owner.decide', ctx)
check('decide_worktree writes the flag with a timestamp, keeps the other listed flags, and keeps stop', [Object.keys(decide).sort(), decide.chat_a1.decision, typeof decide.chat_a1.t, vm.runInContext('_this.global_store._owner.stop', ctx)], [['chat_a1', 'chat_b2', 'chat_c3'], 'rejected', 'number', {}])
vm.runInContext("_this._global_store._bridge.worktrees = {chat_a1: {item: 'chat-id', generation: 1, commits: 2}}; decide_worktree('chat_a1', 'accepted')", ctx)
check('a flag of a worktree no longer listed is dropped on the explicit action', Object.keys(vm.runInContext('_this.global_store._owner.decide', ctx)), ['chat_a1'])
check('each decision saves the whole store without a forced re-render', saves.splice(0), [{ invalidate_elem_cache: false }, { invalidate_elem_cache: false }, { invalidate_elem_cache: false }])
vm.runInContext("_this._global_store._bridge.worktrees = {}; update_vault_runs()", ctx)
check('no proposals renders as none, into the proposals element', proposals_div.innerHTML, '<parsed>_none_</parsed>')

// the queued window (design section 11): the bridge lists requests admitted to a lane before
// their run starts; the item marks them, shows the status 'queued', and lists them in the table;
// a queued entry becoming a run keeps the one reference; the welcome marks from the store alone
vm.runInContext("_this.store = {}; _this._global_store = {_bridge: {host: 'h', updated: " + now + ", runs: {}, queued: {'chat2-id': {persona: 'fable', since: " + (clock.now - 3000) + "}}}, _owner: {stop: {}}}; _this.global_store = _this._global_store; _on_welcome()", ctx)
check('welcome marks a queued request from the store (no item is scanned) and shows its status', [counts(), marks(), status('chat2-id')], [[0, 1, 0], { 'chat2-id': true }, ['queued', 0]])
check('the table lists the queued request with its wait and no stop link', vm.runInContext('vault_runs_table()', ctx).split('\n')[2], `| ${mark('#chat/two')} | fable | · | 3s | · | queued | · |`)
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
check('a queued worker has a compact row', table(), [`| ${mark('#chat/two')} | worker | w0000aaaa | 5s | chat_two | queued | · |`])
bridge(`{${s3}}`, w_queued)
check('under its chat\'s supervisor turn the worker keeps its row beside the supervisor\'s (its status line the row under it)', table().map(r => r.split(' | ')[2] ?? r), ['w0000aaaa', 's3', '| <span>Thinking</span> |||||||'])
bridge(`{${w1}}`, "{'chat2-id': {worker: 'w0000aaaa', phase: 'executing', run: 'w1', worktree: 'chat_two', since: " + (clock.now - 5000) + "}}")
check('an executing worker is its run\'s row only (no duplicate), with its status line under it', table().map(r => r.split(' | ')[2] ?? r), ['w1', '| <span>Reading x</span> |||||||'])
bridge('{}', "{'chat2-id': {worker: 'w0000aaaa', phase: 'finishing', run: 'w1', worktree: 'chat_two', since: " + (clock.now - 5000) + "}}")
check('a finishing worker (delisted) has its row back', table(), [`| ${mark('#chat/two')} | worker | w0000aaaa | 5s | chat_two | finishing | · |`])
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
items['chat-id'].text += '\n<<agent(vault/default)>> the reply' // the reply: the text ends with an agent turn
change('chat-id', { remote: true }) // the reply lands with no listing seen
check('the reply (a remote change) releases a pending mark', [counts(), marks(), pending()], [[0, 0, 0], {}, {}])
items['chat-id'].text = '#chat/topic #_agent/vault\n<<user>> asked again' // a new request: marked
change('chat-id')
check('a new request after the reply is marked again', [counts(), pending()['chat-id'] !== undefined], [[1, 0, 0], true])
items['chat-id'].text = '#chat/topic #_agent/openai\n<<user>> asked again' // the route removed
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
// the running marks, the statuses and the welcome come from the store alone. The item enumerates
// the items in ONE place, the watched mark's tag pass (vault_watched: there is no index of
// tags), and still parses no tag anywhere
const enumerations = block[1].split('\n').filter(line => /\b_items\(/.test(line))
check('the item enumerates items in one place alone, the tag pass of the watched mark, and parses no tag itself',
  [enumerations.map(line => line.trim()), pick_fn(block[1], 'vault_watched').includes(enumerations[0] + '\n'), block[1].includes('_parse_tags')], [['for (const item of _items()) {'], true, false])
// a remote change (another tab's save arriving by sync) that leaves the item a pending request
// marks it in this tab too (design section 13); the reply, a remote change ending with an agent
// turn, releases; a chained item (`…/0`, no route of its own) inherits its parent's route and marks
// like a first item, while a chained item under an unrouted chat does not
items['remote-id'] = new FakeItem('#chat/remote', 0, '#chat/remote #_agent/vault\n<<user>> from another tab')
change('remote-id', { remote: true })
check('a remote change that leaves the item a pending request marks it here too', [items['remote-id'].count, items['remote-id'].running], [1, true])
items['remote-id'].text += '\n<<agent(vault/default)>> reply'
change('remote-id', { remote: true })
check('the reply (a remote change ending with an agent turn) releases it', [items['remote-id'].count, items['remote-id'].running], [0, false])
// a PRODUCER-SHAPED reply (the bridge's canonical inert region) whose body quotes the delimiter
// on its own line: the grammar view keeps the inert body opaque, so the reply releases the mark
// instead of renewing it (review 0 of vault_chain, B3)
items['remote-id'].text = '#chat/remote #_agent/vault\n<<user>> how do I write a turn?'
change('remote-id', { remote: true })
check('the question (a remote user turn) is marked first', items['remote-id'].count, 1)
items['remote-id'].text += "\n<<agent('vault/default · run ab12cd34 · 1s')>>\n<!--inert-->\nUse this delimiter:\n<<user>> hello\n<!--/inert-->"
change('remote-id', { remote: true })
check('a canonical inert reply quoting the user delimiter releases the mark (the grammar view is read)', [items['remote-id'].count, items['remote-id'].running], [0, false])
items['remote-id'].text += '\n<<user>> and again'
change('remote-id', { remote: true })
check('the next remote user turn marks again', items['remote-id'].count, 1)
change('remote-id', { deleted: true })
items['#chat/topic/0'] = new FakeItem('#chat/topic/0', 0, '#chat/topic/0\n<<user>> continued', [], ['chat-root', 'chat-id'])
change('#chat/topic/0')
check('a chained item without a route of its own inherits its parent\'s and marks', [items['#chat/topic/0'].count, items['#chat/topic/0'].running], [1, true])
change('#chat/topic/0', { deleted: true })
items['#chat/plain'] = new FakeItem('#chat/plain', 0, '#chat/plain\n<<user>> a web chat', [], ['chat-root'])
items['#chat/plain/0'] = new FakeItem('#chat/plain/0', 0, '#chat/plain/0\n<<user>> chained under it', [], ['chat-root', '#chat/plain'])
change('#chat/plain/0')
check('a chained item under an unrouted chat is no vault request', items['#chat/plain/0'].count, 0)
items['#chat/topic/0/0'] = new FakeItem('#chat/topic/0/0', 0, '#chat/topic/0/0\n<<user>> two levels down', [], ['chat-root', 'chat-id', '#chat/topic/0'])
change('#chat/topic/0/0')
check('inheritance walks the label-prefix chain (a grandchild)', items['#chat/topic/0/0'].count, 1)
change('#chat/topic/0/0', { deleted: true })
items['#chat/topic/1'] = new FakeItem('#chat/topic/1', 0, '#chat/topic/1\n<<user>> asked\n<<agent(vault/default)>> answered', [], ['chat-root', 'chat-id'])
change('#chat/topic/1')
check('a chained item whose last turn is the agent\'s is no request', items['#chat/topic/1'].count, 0)
// a routed item that opens no user turn is no request: its local save takes no mark. The REAL
// installed sources (the route item, the command item, this helper: their bytes from disk) all
// carry a vault route and an ESCAPED mention of the delimiter in prose or code (what /update
// re-saves); the synthetic persona item carries a route and no turn; a chat with a turn,
// canonical, with spaces inside the delimiter, or indented by spaces, is marked
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
for (const turn of ['<<user>> hello', '<< user >> hello', '<<user >> hello', '<< user>> hello', ' <<user>> hello', '   << user >> hello']) {
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
// the request and the route decided by the RESPONDER'S functions (chat.js parse_last_turn at
// parse_messages' boundaries, agent/chat.js vault_routed_item, reached through #chat's and
// #agent/chat's eval seam; the owner's ask of 2026-09-27): a bare opener (a Ctrl+Enter child)
// is no request, a turn blank before a _log block neither, text on later lines is, and the
// reading EVALUATES NOTHING (a name expression, an agent block, a message block stay text, the
// turn pending as the bridge reads it); a task chat under an UNDELEGATED todo is routed
// through its #_chat/vault dependency (the command item carries the route) and marks at its
// save, its continuation through the chat; an ambiguous chain (two direct chats) marks as the
// web fails closed; the fetched functions are cached under the source's deephash (one eval
// each) and refetched after an /update; without the sources, or with one whose eval throws or
// is async, the item's own reading decides, warned once per tab and function
const warns = []
env.console = { ...console, warn: (...a) => warns.push(a.join(' ')) }
const evals0 = evals.count // the earlier rows evaluated the sources once each; the store reset below drops that cache
vm.runInContext("_this.store = {}; _this._global_store = {_bridge: {host: 'h', updated: " + now + ", runs: {}, queued: {}}, _owner: {stop: {}}}; _this.global_store = _this._global_store; _on_welcome()", ctx)
items['cv-id'] = new FakeItem('#chat/vault', 0, '#chat/vault #_agent/vault\n\\<<user>> …', [], ['chat-root'])
items['work-id'] = new FakeItem('#work', 0, '#work #todo fix the cache')
items['work0-id'] = new FakeItem('#work/0', 0, '', [], ['chat-root', 'cv-id'])
const saved = (id, text) => { items[id].text = text; change(id); return [items[id].count, items[id].running] }
check('responder: a bare opener (a Ctrl+Enter child under an undelegated todo) is no request', saved('work0-id', '#work/0 #_chat/vault\n<<user>> '), [0, false])
check('responder: the turn typed, the chat under the UNDELEGATED todo marks at its save (routed through #_chat/vault)', saved('work0-id', '#work/0 #_chat/vault\n<<user>> how is it going?'), [1, true])
check('responder: a turn blank before a _log block is no request (the boundary ends the turn there)', saved('work0-id', '#work/0 #_chat/vault\n<<user>>\n```_log\nINFO: x\n```\n'), [0, false])
check('responder: a real question followed by a _log block remains pending', saved('work0-id', '#work/0 #_chat/vault\n<<user>> why did it fail?\n```_log\nINFO: x\n```\n'), [1, true])
check('responder: text on the lines after the opener is a request', saved('work0-id', '#work/0 #_chat/vault\n<<user>>\n\nhow is it going?\n'), [1, true])
check('responder: the reply (an agent turn last, its inert body opaque) releases', saved('work0-id', "#work/0 #_chat/vault\n<<user>> q\n<<agent('vault/default · run ab12cd34 · 1s')>>\n<!--inert-->\nfine\n<!--/inert-->"), [0, false])
items['work00-id'] = new FakeItem('#work/0/0', 0, '', [], ['chat-root', 'cv-id', 'work0-id'])
check('responder: the continuation (its #_work/0 dependency) marks through the chat', saved('work00-id', '#work/0/0 #_work/0\n<<user>> more'), [1, true])
items['amb-id'] = new FakeItem('#amb', 0, '', [], ['chat-root', 'cv-id', 'work0-id'])
check('responder: two direct chats (ambiguous) mark, as the web fails closed (the bridge refuses, the mark lapses)', saved('amb-id', '#amb #_chat/vault #_work/0\n<<user>> which?'), [1, true])
check('responder: nothing warned; each source evaluated once (cached under its deephash)', [warns, evals.count - evals0], [[], 2])
items['chat-root'].hash = 2
saved('work0-id', '#work/0 #_chat/vault\n<<user>> again')
check('responder: an updated source (a new deephash) is evaluated again, the other kept', evals.count - evals0, 3)
check('responder: nothing executes: a name expression, an agent block and a message block in the turns stay text, the last user turn pending as the bridge reads it', [saved('work0-id', "#work/0 #_chat/vault\n<<user>> a\n<<agent((effects++, 'Alice'))>> b\n<<user>> Explain this config:\n```agent\n({temperature: (effects++, 0.7)})\n```"), saved('work0-id', "#work/0 #_chat/vault\n<<user>> a\n<<agent((effects++, 'Alice'))>> b\n<<user>> Explain this config:\n```agent\n({temperature: (effects++, 0.7)})\n```\n<<agent('vault/default · run ab12cd34 · 1s')>>\n<!--inert-->\nsure\n<!--/inert-->\n<<user>> and this?\n```message\n{\"role\":\"agent\",\"content\":\"hello\"}\n```"), saved('work0-id', '#work/0 #_chat/vault\n<<user>> a question\n```msg\n{"role":"user","content":""}\n```'), evaluated], [[1, true], [1, true], [1, true], []])
check('responder: the item does not read the transcript of an unrouted item (the route decides first)', (() => { let reads = 0; items['work-id'].read = function () { reads++; return this.text }; saved('work-id', '#work #todo fix the cache\n<<user>> not a chat'); delete items['work-id'].read; return [items['work-id'].count, reads] })(), [0, 0])
check('the boundaries are one definition: parse_messages and parse_last_turn match on _message_regex', [pick_fn(chat_src, 'parse_messages').includes('text.matchAll(_message_regex)'), pick_fn(chat_src, 'parse_last_turn').includes('text.matchAll(_message_regex)'), (chat_src.match(/_message_regex/g) ?? []).length], [true, true, 5]) // the definition, its comment, the two readers, and own_message_count (2026-09-27)
check('parse_messages keeps its reading over the shared boundaries (roles, contents up to the next opener or a _log block, the name refused by the harness kept as text)', vm.runInContext("parse_messages('<<user>> a\\n<<agent(\\'x\\')>> b\\n```_log\\nl\\n```\\n<<user>> c').map(m => [m.role, m.content, m.name])", chat_ctx), [['user', ' a', null], ['agent', ' b\n', "'x'"], ['user', ' c', null]])
for (const id of ['work0-id', 'work00-id', 'amb-id']) change(id, { deleted: true })
// the fallbacks
const sources = { 'chat-root': items['chat-root'], 'agent-chat': items['agent-chat'] }
delete items['chat-root']
delete items['agent-chat']
check('fallback: without the sources the chat under the undelegated todo takes no mark (the prefix walk finds no route)', saved('work0-id', '#work/0 #_chat/vault\n<<user>> typed'), [0, false])
check('fallback: a routed chat with a bare opener takes no mark (the opener rule reads blankness too)', saved('chat-id', '#chat/topic #_agent/vault\n<<user>> '), [0, false])
check('fallback: a routed chat with text marks, and a chained item inherits through the prefix walk', [saved('chat-id', routed_text('#chat/topic')), saved('#chat/topic/0', '#chat/topic/0\n<<user>> continued')], [[1, true], [1, true]])
check('fallback: warned once per function', warns.map(w => w.replace(/;.*/, '')), ['#vault: vault_routed_item unavailable (#agent/chat is not installed)', '#vault: parse_last_turn unavailable (#chat is not installed)'])
change('chat-id', { deleted: true })
change('#chat/topic/0', { deleted: true })
Object.assign(items, sources)
warns.length = 0
vm.runInContext('_this.store._vault_warned = {}', ctx)
let throws = 0
items['agent-chat'].hash = 2
items['agent-chat'].eval = () => { throws++; throw new Error('boom') }
check('fallback: a source whose eval throws is warned once and not retried until it changes; the route falls back', [saved('chat-id', routed_text('#chat/topic')), saved('chat-id', routed_text('#chat/topic') + '!'), throws, warns.length, warns[0].startsWith('#vault: vault_routed_item unavailable (#agent/chat eval failed: Error: boom)')], [[1, true], [1, true], 1, 1, true])
const reset_warned = () => vm.runInContext('_this.store._vault_warned = {}', ctx) // the once-per-tab guard, lifted between the variants
reset_warned()
items['agent-chat'].hash = 3
items['agent-chat'].eval = () => Promise.resolve(() => true)
saved('chat-id', routed_text('#chat/topic') + '?')
check('fallback: a promise from a source\'s eval (a return-shape check; the call is the synchronous wrapper) falls back too, warned', [warns.length, warns[1].startsWith('#vault: vault_routed_item unavailable (#agent/chat is async)')], [2, true])
reset_warned()
items['agent-chat'].hash = 4
items['agent-chat'].eval = () => null
saved('chat-id', routed_text('#chat/topic') + '.')
check('fallback: a source without the function falls back, warned', [warns.length, warns[2].startsWith('#vault: vault_routed_item unavailable (#agent/chat defines no vault_routed_item)')], [3, true])
items['agent-chat'].hash = 5
items['agent-chat'].eval = code => vm.runInContext(code, chat_ctx)
reset_warned()
items['chat-root'].eval = () => () => { throw new Error('parse boom') }
items['chat-root'].hash = 3
saved('chat-id', routed_text('#chat/topic') + ';')
check('fallback: a reader that throws on a text is warned once and the opener rule decides', [items['chat-id'].count, warns.length, warns[3].startsWith('#vault: parse_last_turn unavailable (threw: Error: parse boom)')], [1, 4, true])
items['chat-root'].eval = code => vm.runInContext(code, chat_ctx)
items['chat-root'].hash = 4
change('chat-id', { deleted: true })
items['chat-id'].text = routed_text('#chat/topic')
env.console = console
check('the item source has no unescaped macro delimiters (the app expands macros before it strips code blocks)', (item.match(/(?<!\\)<</g) ?? []).length, 0)
check('the stamp age formats seconds, minutes, and hours', [vm.runInContext('vault_age(5000)', ctx), vm.runInContext('vault_age(200000)', ctx), vm.runInContext('vault_age(7500000)', ctx)], ['5s', '3m 20s', '2h 5m'])
check('nothing else saved the store (a welcome with a provisioned store, the marks, the statuses)', saves, [])

// wiki links in a cell (the vault's design notes/design/wiki_links.md 2.3): an accepted reference
// is the app's anchor (the REAL builder, src/wiki_links.ts loaded by node's type stripping), the
// text around it escaped as before; a refused reference, or a cell without the app's seams, is
// literal as before; a table with such cells parses through the REAL Marked with the app's vendored
// table extension (a fresh instance, not the app's global one) into the expected cells. The table rewrite wires the anchors it inserts
// (the app's own anchor pass runs at the item's render, not here); skipped with the real parser
// rows above when the app checkout is not reachable
if (realMarked) {
  const wiki = require(path.join(app, 'src', 'wiki_links.ts'))
  const { Marked } = require(path.join(app, 'node_modules', 'marked'))
  const tables = require(path.join(app, 'src', 'vendor', 'marked-extended-tables.js')).default
  const cell = text => vm.runInContext('vault_cell(' + JSON.stringify(text) + ')', ctx)
  const text = "see [[docs/x|the guide]] and [[../x]] | `b` <c> it's"
  check('cell: without the app seams every reference is literal (escaped as before)', cell(text), "see \\[\\[docs\\/x\\|the guide\\]\\] and \\[\\[\\.\\.\\/x\\]\\] \\| \\`b\\` \\<c\\> it\\'s")
  env.window._wiki_link_regexp = wiki.wikiLinkRegExp
  env.window._wiki_link_html = (target, alias, options) => wiki.wikiLinkHtml({ url: 'x://h/f' }, target, alias, options)
  const linked = cell(text)
  check('cell: the accepted reference is the anchor, the rest escaped, the refused one literal', linked,
    "see <a href=\"x&#58;&#47;&#47;h&#47;f&#63;path&#61;docs&#37;2Fx\" title=\"docs&#47;x\" data-wiki-link>the guide</a> and \\[\\[\\.\\.\\/x\\]\\] \\| \\`b\\` \\<c\\> it\\'s")
  const marked = new Marked({ gfm: true })
  marked.use(tables())
  const parsed = marked.parse('| a | b |\n| - | - |\n| ' + cell("rg todo | head [[notes/A&B|A's & B]] x") + ' | ' + cell("[[a|b]] | c") + ' |\n', { async: false })
  const cells = Array.from(parsed.matchAll(/<td>([\s\S]*?)<\/td>/g), m => m[1])
  check('cell: the parsed table keeps its two cells, the pipes literal and the anchors intact', cells.length, 2)
  check('cell: the first cell', cells[0], 'rg todo | head <a href="x&#58;&#47;&#47;h&#47;f&#63;path&#61;notes&#37;2FA&#37;26B" title="notes&#47;A&#38;B" data-wiki-link>A&#39;s &#38; B</a> x')
  check('cell: the second cell', cells[1], '<a href="x&#58;&#47;&#47;h&#47;f&#63;path&#61;a" title="a" data-wiki-link>b</a> | c')
  // a status line with a reference, through the row builder and the real parser: the sub-row's
  // one cell holds the anchor with the text around it escaped as before, and parsed it is the one
  // anchor inside the cell spanning the seven columns, the pipe and the markup around it literal
  vm.runInContext("_this._global_store._bridge.runs = {r8: {item: 'chat-id', persona: 'p', started: " + clock.now + ", worktree: null, status: 'see [[docs/x|the guide]] | <x>'}}", ctx)
  const anchor = '<a href="x&#58;&#47;&#47;h&#47;f&#63;path&#61;docs&#37;2Fx" title="docs&#47;x" data-wiki-link>the guide</a>'
  check('rows: a status line with a wiki reference is a sub-row whose span holds the anchor, the text around it escaped', vm.runInContext("vault_runs_rows(_this._global_store._bridge, {}, " + clock.now + ", id => 'stop')", ctx), [[mark('#chat/topic'), 'p', 'r8', '0s', '(read-only)', '·', 'stop'], sub(`see ${anchor} \\| \\<x\\>`)])
  const linked_rows = parsed_rows(realMarked.parse(vm.runInContext('vault_runs_table()', ctx)))
  check('real parser: the one anchor sits inside the cell spanning the seven columns under the main row', [linked_rows.length, linked_rows[0].length, linked_rows[1].map(([attrs]) => attrs), (linked_rows[1][0][1].match(/<a /g) ?? []).length, unspan(linked_rows[1][0][1])], [2, 7, ['colspan=7 align=left'], 1, `see ${anchor} | &lt;x&gt;`])
  vm.runInContext('_this._global_store._bridge.runs = {}', ctx)
  delete env.window._wiki_link_regexp
  delete env.window._wiki_link_html
  const anchors = [{}, {}]
  runs_div.querySelectorAll = sel => (sel === 'a[data-wiki-link]' ? anchors : [])
  vm.runInContext("vault_render('.runs', () => '<a data-wiki-link>x</a>')", ctx)
  const event = { stopped: 0, stopPropagation() { this.stopped++ } }
  anchors.forEach(a => a.onclick(event))
  check('the table rewrite wires every wiki anchor with the click stop', [anchors.every(a => typeof a.onclick === 'function'), event.stopped], [true, 2])
  delete runs_div.querySelectorAll
  delete runs_div._vault_html
} else console.log('skip wiki link rows (the app checkout is not reachable; set MIND_PAGE_DIR)')

// ---- the sparkle (vault design mind_bridge_watcher 6.2, 6.3) ---------------------------------
// what it shows is a pure function of the bridge's listing, the #status item's hosts and the
// time; the command it sends; and the controller's lifetime over a small fake DOM (the real
// page's focus, keys and viewport are the browser lane's: mind.page tests/e2e/sparkle.spec.ts)
{
  const TOOK = '2026-11-15T10:00:00.000Z'
  const T = clock.now
  const watching = { name: 'claude-fable-5-2-max', took: TOOK, state: 'watching' }
  const fresh = { 'test-host': { v: 1, updated: T - 60000, boot: 1, publisher: 'bridge' } }
  const state = (bridge, hosts, now = T, marks = undefined) => {
    ctx.__args = { bridge, hosts, now, marks }
    return vm.runInContext('vault_sparkle_state(__args.bridge, __args.hosts, __args.now, __args.marks)', ctx)
  }
  const listed = (watcher, host = 'test-host') => ({ host, watcher })
  const SEEN = T - 60000 // the bridge's heartbeat as the page has it
  const shown = { kind: 'watching', key: 'watching:' + TOOK, name: watching.name, took: TOOK, tab: false, jump: null, busy: false, dim: false, title: 'claude-fable-5-2-max is watching', seen: SEEN }
  check('sparkle: a fresh watcher is shown watching', state(listed(watching), fresh), shown)
  check('sparkle: an answering watcher pulses under its own name', state(listed({ ...watching, state: 'answering' }), fresh),
    { ...shown, busy: true, title: 'claude-fable-5-2-max is answering a request' })
  check('sparkle: a hand-off names the agent that answers', state(listed({ ...watching, state: 'answering', by: 'gpt-6-astra-ultra' }), fresh).title,
    'gpt-6-astra-ultra is answering a request')
  check('sparkle: a watching watcher never shows a by', state(listed({ ...watching, by: 'gpt-6-astra-ultra' }), fresh).title, shown.title)
  const offer = { kind: 'offer', key: 'offer::', start: null, tab: false, jump: null, busy: false, dim: true, title: 'Start a watcher', last: null, seen: SEEN }
  check('sparkle: with no watcher, or one that names no agent or no take, a fresh bridge shows the offer to start one, dim',
    [null, undefined, 'x', { ...watching, name: '' }, { ...watching, name: 5 }, { ...watching, took: '' }, { name: 'a' }, { state: 'none' }].map(w => state(listed(w), fresh)),
    Array(8).fill(offer))
  const at = updated => ({ 'test-host': { ...fresh['test-host'], updated } })
  check('sparkle: the bridge is fresh up to the #status stale interval, and stale past it',
    [state(listed(watching), at(T - 3 * 60000)) != null, state(listed(watching), at(T - 3 * 60000 - 1))], [true, null])
  check('sparkle: nothing is on offer from a bridge that is not fresh', [state(listed(null), at(T - 3 * 60000)).kind, state(listed(null), at(T - 3 * 60000 - 1)), state(listed(null), {})], ['offer', null, null])
  check('sparkle: it fails closed: no hosts, no entry for the listing\'s host, the one-shot publisher, a time that is no number, a host that names no entry of its own',
    [
      state(listed(watching), null),
      state(listed(watching), {}),
      state(listed(watching, 'other-host'), fresh),
      state(listed(watching), { 'test-host': { ...fresh['test-host'], publisher: 'cli' } }),
      state(listed(watching), { 'test-host': { publisher: 'bridge' } }),
      state(listed(watching), at('1700000000000')),
      state(listed(watching), at(NaN)),
      state(listed(watching, '__proto__'), fresh),
      state({ watcher: watching }, fresh),
      state(null, fresh),
    ], Array(10).fill(null))
  const stopping = { stopping: { took: TOOK, at: T - 1000 } }
  check('sparkle: a stop this tab sent shows as stopping, while its watch is the one listed and for half a minute',
    [state(listed(watching), fresh, T, stopping), state(listed(watching), fresh, T + 29000, stopping).title,
      state(listed(watching), fresh, T + 29001, stopping).title, state(listed({ ...watching, took: 'another' }), fresh, T, stopping).title],
    [{ ...shown, busy: true, title: "Stopping claude-fable-5-2-max's watch" }, "Stopping claude-fable-5-2-max's watch", shown.title, shown.title])
  const keyboard = win => { ctx.__win = win; return vm.runInContext('vault_keyboard_open(__win)', ctx) }
  check('sparkle: a keyboard is a visual viewport much shorter than the window, a pinch zoom is not',
    [keyboard({ innerHeight: 800 }), keyboard({ innerHeight: 800, visualViewport: { height: 800, scale: 1 } }), keyboard({ innerHeight: 800, visualViewport: { height: 650, scale: 1 } }),
      keyboard({ innerHeight: 800, visualViewport: { height: 649, scale: 1 } }), keyboard({ innerHeight: 800, visualViewport: { height: 400, scale: 2 } })],
    [false, false, false, true, false])
  check('sparkle: the stop command names its id, its kind, the take and the time',
    vm.runInContext(`vault_watch_stop('ab12', '${TOOK}', 7)`, ctx), { id: 'ab12', kind: 'stop', took: TOOK, at: 7 })

  // slice 6: with nobody watching, what is on offer (a start under way, what became of the last
  // one, the last watcher that can be resumed), this tab's own marks, and the menu's entries
  const none = (start, last) => listed({ state: 'none', ...(start ? { start } : {}), ...(last ? { last } : {}) })
  const START = { id: 'start-1', agent: 'claude', at: TOOK, state: 'starting' }
  const LAST = { name: 'gpt-6-astra-ultra', agent: 'codex', key: 'k1' }
  const starting = { kind: 'starting', key: 'starting:start-1:', start: 'start-1', tab: false, jump: null, busy: true, dim: true, title: 'An agent is starting to watch', last: null, seen: SEEN }
  check('sparkle: a start the bridge shows as starting pulses dim, and says whether its tab is known',
    [state(none(START), fresh), state(none({ ...START, tab: true }), fresh).tab], [starting, true])
  check('sparkle: the last watcher that can be resumed is kept with what is shown, when it reads as one',
    [LAST, { ...LAST, name: 5 }, { ...LAST, key: '' }, { ...LAST, agent: 'vim' }, { ...LAST, agent: 'constructor' }, { ...LAST, agent: ['codex'] }, { name: 'a', agent: 'codex' }, 'x'].map(l => state(none(null, l), fresh).last),
    [{ key: 'k1', agent: 'codex', name: 'gpt-6-astra-ultra' }, { key: 'k1', agent: 'codex', name: '' }, null, null, null, null, null, null])
  check('sparkle: what is shown is told apart by its kind, its start and the last watcher',
    [state(none(START, LAST), fresh).key, state(none(null, LAST), fresh).key, state(none({ ...START, state: 'failed' }), fresh).key], ['starting:start-1:k1', 'offer::k1', 'failed:start-1:'])
  const said = (start, marks) => state(none(start), fresh, T, marks).title
  check('sparkle: a start that failed or whose outcome is unknown says so, with the bridge\'s note',
    [said({ ...START, state: 'failed', note: 'herdr is not running here' }), said({ ...START, agent: 'codex', state: 'failed' }), said({ ...START, agent: 'vim', state: 'failed' }),
      said({ ...START, state: 'failed', resume: true, note: 'the last watcher changed, or is gone' }), said({ ...START, state: 'unknown', note: 'no watcher appeared' }), said({ ...START, state: 'unknown', resume: true, note: 7 })],
    ['Claude did not start: herdr is not running here', 'Codex did not start', 'The agent did not start', 'The last watcher was not resumed: the last watcher changed, or is gone',
      "A start's outcome is unknown: no watcher appeared", "A start's outcome is unknown"])
  check('sparkle: a start\'s agent is one of the two this code names, or none: an inherited name, a number and a list are none',
    ['constructor', 5, ['codex']].map(agent => said({ ...START, agent, state: 'failed' })), Array(3).fill('The agent did not start'))
  check('sparkle: the title takes two hundred characters of the bridge\'s note', said({ ...START, state: 'failed', note: 'x'.repeat(300) }), 'Claude did not start: ' + 'x'.repeat(200))
  check('sparkle: a failed or unknown start is dim and still, and a start that does not read as one is no start',
    [state(none({ ...START, state: 'unknown', tab: true }), fresh), state(none({ ...START, state: 'failed', tab: 1 }), fresh), state(none({ ...START, state: 'done' }), fresh), state(none({ ...START, id: '' }), fresh),
      state(none({ ...START, id: 5 }), fresh), state(none('x'), fresh)].map(s => [s.kind, s.busy, s.dim, s.tab, s.start]),
    [['unknown', false, true, true, 'start-1'], ['failed', false, true, false, 'start-1'], ['offer', false, true, false, null], ['offer', false, true, false, null], ['offer', false, true, false, null], ['offer', false, true, false, null]])
  const cancelling = { cancelling: { id: 'start-1', at: T - 1000 } }
  check('sparkle: a cancel this tab sent shows on the start it names, for half a minute',
    [said(START, cancelling), state(none(START), fresh, T + 29000, cancelling).title, state(none(START), fresh, T + 29001, cancelling).title, said({ ...START, id: 'start-2' }, cancelling)],
    ['Cancelling the start', 'Cancelling the start', starting.title, starting.title])
  // a start this tab sent that the bridge has not named (review 29, B2): never silently the offer again
  const unnamed = { started: { id: 'mine-1', at: T - 1000 } }
  const own = (start, at = T) => { const s = state(none(start), fresh, at, unnamed); return [s.kind, s.start, s.busy, s.title] }
  const UNCONFIRMED = ['unconfirmed', 'mine-1', false, 'The bridge did not confirm the start: open the menu to start again']
  check('sparkle: a start this tab sent shows as starting for half a minute, then as NOT CONFIRMED',
    [own(null), own(null, T + 29000), own(null, T + 29001)], [['starting', 'mine-1', true, starting.title], ['starting', 'mine-1', true, starting.title], UNCONFIRMED])
  check('sparkle: the bridge\'s own record of that start is what shows, once it names it',
    [own({ ...START, id: 'mine-1', state: 'failed', note: 'herdr is not running here' }, T + 29001), own({ ...START, id: 'mine-1' }, T + 29001)],
    [['failed', 'mine-1', false, 'Claude did not start: herdr is not running here'], ['starting', 'mine-1', true, starting.title]])
  check('sparkle: another start\'s record never acknowledges it: one under way is shown, one that is over does not stand in for it',
    [own(START), own(START, T + 29001), own({ ...START, state: 'failed' }), own({ ...START, state: 'failed' }, T + 29001), own({ ...START, state: 'unknown' }, T + 29001)],
    [['starting', 'start-1', true, starting.title], ['starting', 'start-1', true, starting.title], ['starting', 'mine-1', true, starting.title], UNCONFIRMED, UNCONFIRMED])
  check('sparkle: a watcher is shown whatever else is said, with its tab when the bridge can close it',
    [state(listed({ ...watching, tab: true, start: START, last: LAST }), fresh, T, unnamed), state(listed({ ...watching, tab: 'yes' }), fresh).tab], [{ ...shown, tab: true }, false])
  // the jump: what brings up a watching or starting agent's herdr tab, for the browser's extension
  const JUMP = { tab: 'w4:tB', host: 'm3ultra', herdr: 'm3ultra:default', session: 'sess-1' }
  check('sparkle: a watching agent\'s herdr tab, and that of a start under way, are kept with what is shown as the bridge gave them; nothing else has one',
    [state(listed({ ...watching, jump: JUMP }), fresh).jump, state(none({ ...START, tab: true, jump: JUMP }), fresh).jump,
      state(none({ ...START, state: 'unknown', tab: true, jump: JUMP }), fresh).jump, state(none({ ...START, state: 'failed', jump: JUMP }), fresh).jump, state(none(null, LAST), fresh).jump],
    [JUMP, JUMP, null, null, null])
  check('sparkle: a jump is its strings alone, and none without a tab',
    [{ tab: 'w1:t2' }, { ...JUMP, host: 5, session: '' }, { ...JUMP, extra: 'x', tab: 'w1:t2' }, { host: 'm3ultra' }, { ...JUMP, tab: 7 }, 'w1:t2', null].map(jump => state(listed({ ...watching, jump }), fresh).jump),
    [{ tab: 'w1:t2' }, { tab: 'w4:tB', herdr: 'm3ultra:default' }, { tab: 'w1:t2', host: 'm3ultra', herdr: 'm3ultra:default', session: 'sess-1' }, null, null, null, null])
  const closing = { closing: { took: TOOK, at: T - 1000 }, stopping: { took: TOOK, at: T - 1000 } }
  check('sparkle: a close this tab sent shows as closing, before a stop, for its watch and for half a minute',
    [state(listed(watching), fresh, T, closing).title, state(listed(watching), fresh, T, closing).busy, state(listed(watching), fresh, T + 29001, closing).title, state(listed({ ...watching, took: 'another' }), fresh, T, closing).title],
    ["Closing claude-fable-5-2-max's session", true, shown.title, shown.title])
  const entries = s => { ctx.__state = s; return vm.runInContext('vault_sparkle_entries(__state)', ctx) }
  const STARTS = [['claude', 'Start Claude Watcher'], ['codex', 'Start Codex Watcher']]
  const RESUME = ['resume', 'Resume Last Watcher (Codex)']
  const CANCEL = ['cancel', 'Cancel Start']
  check('sparkle: the menu\'s entries are what can be asked of what is shown',
    [entries(null), entries(shown), entries({ ...shown, tab: true }), entries(offer), entries(state(none(null, LAST), fresh)), entries(starting), entries(state(none(START, LAST), fresh)),
      entries(state(none(null, LAST), fresh, T + 29001, unnamed)), entries(state(none({ ...START, state: 'failed', tab: true }, LAST), fresh)),
      entries(state(none({ ...START, state: 'unknown' }), fresh)), entries(state(none({ ...START, state: 'unknown', tab: true }), fresh))],
    [[], [['stop', 'Stop Watching']], [['stop', 'Stop Watching'], ['close', 'Close Agent Session']], STARTS, [...STARTS, RESUME], [CANCEL], [CANCEL],
      [...STARTS, RESUME, CANCEL], [...STARTS, RESUME], STARTS, [...STARTS, CANCEL]])
  check('sparkle: a start, a resume, a cancel and a close name their id, their kind, what they act on, the heartbeat seen and the time',
    [vm.runInContext("vault_watch_command('start', 'ab12', { agent: 'codex' }, 5, 7)", ctx), vm.runInContext("vault_watch_command('close', 'ab12', { took: 'T' }, 5, 7)", ctx)],
    [{ id: 'ab12', kind: 'start', agent: 'codex', seen: 5, at: 7 }, { id: 'ab12', kind: 'close', took: 'T', seen: 5, at: 7 }])

  // ---- the watched mark (vault design mind_bridge_watcher D25): what the item watcher follows --
  // the bridge publishes rules, never items (`_bridge.watcher.follows`, vault
  // lib/mindpage_follows.py); the item reads them as what they must be, matches them against
  // the page's items by the app's own lookups, and marks an item only where the app's reading
  // of it is surely the watcher's
  const SINCE = '2026-11-17T09:00:00.000Z'
  const HEAD = { watch: 'todos', name: watching.name, since: SINCE }
  const NONE = { all: false, ids: [], labels: [], tags: [], more: [] }
  const follows = watcher => { ctx.__watcher = watcher; return vm.runInContext('vault_follows(__watcher)', ctx) }
  const read = told => follows({ follows: [told] })
  const BANK = 'J1Jp8z6uvj01EK8qNju5'
  check('watched: the published rules are read rule by rule: tags, ids, label globs with words for the rest, and a follow of all items, which is that and nothing else',
    follows({ ...watching, follows: [{ ...HEAD, tags: ['#todo'] }, { ...HEAD, watch: 'bank', ids: [BANK] }, { ...HEAD, watch: 'markets', labels: ['#markets*'], more: ['/kalshi|polymarket/'] }, { ...HEAD, watch: 'sweep', all: true, tags: ['#todo'] }, { more: ['3 more watches'] }] }),
    [{ ...HEAD, ...NONE, tags: ['#todo'] }, { ...HEAD, ...NONE, watch: 'bank', ids: [BANK] }, { ...HEAD, ...NONE, watch: 'markets', labels: ['#markets*'], more: ['/kalshi|polymarket/'] }, { ...HEAD, ...NONE, watch: 'sweep', all: true },
      { watch: '', name: '', since: '', ...NONE, more: ['3 more watches'] }])
  check('watched: anything else is dropped: no watcher, no list, an entry that is no rule, a member that is no string, an id of another shape, a rule left with nothing, an `all` that is not true',
    [follows(null), follows('x'), follows({ follows: 'x' }), follows({ follows: [null, 'x', 5, {}, { ...HEAD }, { ...HEAD, tags: 'x', ids: [5, null, ''], all: 1 }] }),
      read({ ...HEAD, watch: 5, name: ['x'], ids: [BANK, 'a b', 'x'.repeat(65), '#todo', 7], tags: ['#todo', 7, { x: 1 }] })],
    [[], [], [], [], [{ watch: '', name: '', since: SINCE, ...NONE, ids: [BANK], tags: ['#todo'] }]])
  check('watched: the bridge\'s bounds hold here too: nine entries, fifty ids, sixteen globs and tags, twelve words, each cut',
    [follows({ follows: Array(12).fill({ ...HEAD, tags: ['#todo'] }) }).length, read({ ...HEAD, ids: Array.from({ length: 60 }, (_, n) => 'id' + n) })[0].ids.length,
      read({ ...HEAD, labels: Array.from({ length: 20 }, (_, n) => '#l' + n), tags: Array.from({ length: 20 }, (_, n) => '#t' + n) }).map(rule => [rule.labels.length, rule.tags.length]),
      read({ ...HEAD, more: Array.from({ length: 20 }, (_, n) => 'word ' + n) })[0].more.length, read({ ...HEAD, more: ['/' + 'x'.repeat(200) + '/'] })[0].more, read({ ...HEAD, name: 'n'.repeat(100), tags: ['#t'] })[0].name.length],
    [9, 50, [[16, 16]], 12, ['/' + 'x'.repeat(95) + '…'], 64])
  check('watched: what this page cannot check as the watcher does is said, not matched: a relative tag, a tag or a glob outside printable ASCII, a glob with a bracket; a rule of such alone is words alone',
    [read({ ...HEAD, tags: ['#todo', '#/1', '#//x', '#café', '#_todo'], labels: ['#markets*', '#chat/[0-9]*', '#café*', '#a?'] }), read({ ...HEAD, tags: ['#/1'] })],
    [[{ ...HEAD, ...NONE, tags: ['#todo', '#_todo'], labels: ['#markets*', '#a?'], more: ['#/1', '#//x', '#café', 'label #chat/[0-9]*', 'label #café*'] }], [{ ...HEAD, ...NONE, more: ['#/1'] }]])
  check('watched: a tag and a glob are compared in lowercase, as the watcher holds them; an id is as given', read({ ...HEAD, tags: ['#ToDo'], labels: ['#Markets*'], ids: ['AbC'] }),
    [{ ...HEAD, ...NONE, ids: ['AbC'], labels: ['#markets*'], tags: ['#todo'] }])
  const names = (glob, label) => { ctx.__args = { glob, label }; return vm.runInContext('vault_glob_names(__args.glob, __args.label)', ctx) }
  check('watched: a glob names a label as the watcher\'s fnmatch does: the whole label, `*` any run (a slash too, and none), `?` one character, a star in the label taken as a character',
    [['#todo', '#todo'], ['#todo', '#todos'], ['#todo', '#tod'], ['#markets*', '#markets'], ['#markets*', '#markets/kalshi'], ['#markets*', '#market'], ['#markets/*', '#markets'], ['#markets/*', '#markets/kalshi'],
      ['#markets/*', '#markets/a/b'], ['#?', '#a'], ['#?', '#ab'], ['#?', '#'], ['#a?c', '#abc'], ['*', '#anything'], ['#*/1', '#chat/5/1'], ['#*/1', '#chat/5/12'], ['#a*b*c', '#aXbYbZc'], ['#a*b*c', '#aXbYbZ'],
      ['#*x', '#*yx'], ['#a**', '#a'], ['', ''], ['', '#a']].map(([glob, label]) => names(glob, label)),
    [true, false, false, true, true, false, false, true, true, true, false, false, true, true, true, false, true, false, true, true, true, false])
  const began = performance.now() // as a RegExp of thirty-one `.*` this glob would not finish against this label
  const stars = names('#' + '*a'.repeat(31) + 'b', '#' + 'a'.repeat(63))
  check('watched: a glob of many stars is a loop\'s work, not a pattern\'s backtracking', [stars, performance.now() - began < 1000], [false, true])

  // the page's items as the app holds them: the id an item's box carries, the saved id the
  // watcher knows (the same unless the item was created in this tab), the raw text, and the
  // app's OWN reading of that text, which the item code takes as given and never parses: the
  // label (the label index's key) and `tags_raw` (lowercase, the hiding underscore kept, a
  // relative tag resolved against the label, an agent reply's child tags added)
  const held = (id, text, label, tags_raw, saved = id) => ({ id, saved_id: saved, text, label, tags_raw, tags_hidden: [], dependencies: [] }) // the last two for the save-time mark's route walk, which hears the same changes
  const corpus = list => {
    const calls = { items: 0 }
    const labels = new Map()
    for (const item of list) if (item.label) labels.set(item.label.toLowerCase(), [...(labels.get(item.label.toLowerCase()) ?? []), item.id])
    for (const item of list) item.name = item.label && labels.get(item.label.toLowerCase()).length == 1 ? item.label : 'id:' + item.id
    const seam = env._item
    return {
      calls,
      _items: () => { calls.items++; return [...list] }, // every item (the app: newest first)
      _labels: selector => [...labels].filter(([label, ids]) => selector(label, ids)).map(([label]) => label), // the app's label index
      _item: ref => list.find(item => item.saved_id === ref || item.id === ref) ?? seam(ref), // a saved id reaches the item held under a temporary one
    }
  }
  const FENCE = '`'.repeat(3)
  const page_items = [
    held('t1', '#todo buy milk', '#todo', ['#todo']),
    held('t2', '#Todo call the bank', '#Todo', ['#todo']), // the label is shared, and written in another case
    held('w1', '#work #todo fix the cache', '#work', ['#work', '#todo']),
    held('h1', '#notes a hidden carrier #_todo', '#notes', ['#notes', '#_todo']),
    held('n1', '#todo/next is nested under it', '#todo/next', ['#todo/next']),
    held('u1', 'unlabelled, see #todo', '', ['#todo']),
    held('m1', '#markets', '#markets', ['#markets']),
    held('m2', '#markets/kalshi #todo/x', '#markets/kalshi', ['#markets/kalshi', '#todo/x']),
    held('tmp-1', '#bank statement', '#bank', ['#bank'], BANK), // created in this tab: a temporary id until the reload
    held('c1', "#chat/5 #_agent/vault\n\\<<user>> q\n#/1", '#chat/5', ['#chat/5', '#_agent/vault', '#chat/5/1']), // a relative tag, resolved by the app
    held('c2', '#chat #//todo is a sibling of a root label', '#chat', ['#chat', '#todo']),
    held('u2', 'unlabelled: #/1 stays as written', '', ['#/1']),
    held('l1', `#work2 #todo x\n${FENCE}_log\n#todo\n${FENCE}`, '#work2', ['#work2', '#todo']), // a log block and a tag that is not the label
    held('l2', `#todo y\n${FENCE}js_output\n1\n${FENCE}`, '#todo', ['#todo']), // a log block under an item that begins with its label
    held('l3', `<div class="x">\n#todo z\n${FENCE}_LOG_removed\n${FENCE}`, '#todo', ['#todo']), // the label after a wrapper, and a log block
    held('l4', '<div class="x">\n#todo w', '#todo', ['#todo']), // the label after a wrapper, and no block
    held('e1', '#café con leche', '#café', ['#café']),
  ]
  const looked = (rules, list = page_items) => {
    const fake = corpus(list)
    const kept = { _items: env._items, _item: env._item }
    Object.assign(env, { _items: fake._items, _labels: fake._labels, _item: fake._item })
    ctx.__rules = follows({ follows: rules })
    try { return [vm.runInContext('vault_watched(__rules)', ctx), fake.calls.items] } finally { Object.assign(env, kept); delete env._labels }
  }
  const marked = (rule, list) => looked([{ ...HEAD, ...rule }], list)[0].ids
  check('watched: an id names its item by the saved id, which reaches the item this tab holds under a temporary one; a temporary id, another case and an id of no item name nothing; no item is enumerated',
    [looked([{ ...HEAD, ids: [BANK, 't1', 'T2', 'tmp-1', 'gone'] }]), marked({ ids: ['tmp-1'] })], [[{ ids: ['t1', 'tmp-1'], rules: [{ n: 2, unsure: 0, name: null }] }, 0], []])
  check('watched: a rule of one id says its item\'s name when that is a label, not when the label is shared', [looked([{ ...HEAD, ids: [BANK] }])[0].rules, looked([{ ...HEAD, ids: ['t1'] }])[0].rules],
    [[{ n: 1, unsure: 0, name: '#bank' }], [{ n: 1, unsure: 0, name: null }]])
  check('watched: a label glob names every item under each label it matches, shared labels too, whatever the label\'s case; never an unlabelled item or a label outside ASCII; no item is enumerated',
    [looked([{ ...HEAD, labels: ['#todo'] }]), marked({ labels: ['#markets*'] }), marked({ labels: ['#markets/*'] }), marked({ labels: ['#todo*'] }), marked({ labels: ['#c*'] }), marked({ labels: ['*'] }).includes('u1')],
    [[{ ids: ['l2', 'l4', 't1', 't2'], rules: [{ n: 4, unsure: 1, name: null }] }, 0], ['m1', 'm2'], ['m2'], ['l2', 'l4', 'n1', 't1', 't2'], ['c1', 'c2'], false])
  check('watched: a tag is one of the item\'s raw tags, exactly: its label or a tag in its text, not the hidden form, not a tag nested under it; ONE pass over the items, whatever the rules',
    [looked([{ ...HEAD, tags: ['#todo'] }]), marked({ tags: ['#_todo'] }), marked({ tags: ['#todo/x'] }), looked([{ ...HEAD, tags: ['#todo', '#work'] }, { ...HEAD, tags: ['#notes'] }])[1]],
    [[{ ids: ['l2', 'l4', 't1', 't2', 'u1', 'w1'], rules: [{ n: 6, unsure: 3, name: null }] }, 1], ['h1'], ['m2'], 1])
  check('watched: a tag the app resolved from a relative one is none to the watcher: on a labelled item whose text holds one, a tag that is not the label marks nothing; unlabelled, the tag is as written',
    [looked([{ ...HEAD, tags: ['#chat/5/1'] }])[0], marked({ tags: ['#chat/5'] }), marked({ tags: ['#_agent/vault'] }), looked([{ ...HEAD, tags: ['#todo'] }])[0].ids.includes('c2'), marked({ tags: ['#/1'] })],
    [{ ids: [], rules: [{ n: 0, unsure: 1, name: null }] }, ['c1'], [], false, []])
  check('watched: the watcher masks a log or output block and the app does not: an item that holds a line that could open one is marked by its label alone, and only when its text begins with it',
    [['l1', 'l2', 'l3', 'l4'].map(id => marked({ tags: ['#todo'] }).includes(id)), ['l2', 'l3', 'l4'].map(id => marked({ labels: ['#todo'] }).includes(id)), marked({ tags: ['#work2'] }), marked({ labels: ['#work2'] })],
    [[false, true, false, true], [true, false, true], ['l1'], ['l1']])
  // (the app's header rule stops its `.` at a carriage return and at the two line separators; the watcher's does not)
  const odd = [held('r1', '<span>\r#todo <b>v</b>', '#todo', ['#todo']), held('r2', '<p>\u2028#todo <i>y</i>', '#todo', ['#todo']), held('r3', '<p>\n#todo', '#todo', ['#todo'])]
  check('watched: a label after html and a carriage return or a line separator is a label to the app alone: a glob does not mark it; the tag, which both sides read, does',
    [looked([{ ...HEAD, labels: ['#todo'] }], odd)[0], marked({ tags: ['#todo'] }, odd)], [{ ids: ['r3'], rules: [{ n: 1, unsure: 2, name: null }] }, ['r1', 'r2', 'r3']])
  check('watched: an item one selector cannot be sure of and another names is named; the marks are the union over the rules, each item once, in a fixed order',
    looked([{ ...HEAD, tags: ['#todo'], ids: ['l1'], labels: ['#work2'] }, { ...HEAD, labels: ['#markets*'], tags: ['#todo'] }, { ...HEAD, more: ['/x/'] }])[0],
    { ids: ['l1', 'l2', 'l4', 'm1', 'm2', 't1', 't2', 'u1', 'w1'], rules: [{ n: 7, unsure: 2, name: '#work2' }, { n: 8, unsure: 3, name: null }, { n: 0, unsure: 0, name: null }] })
  check('watched: an item id that is not letters, digits, `_` and `-` alone never enters the stylesheet: its item is counted and not marked', looked([{ ...HEAD, tags: ['#x'] }], [held('a"] *, [x="', '#x', '#x', ['#x']), held('ok_1-2', '#x', '#x', ['#x'])])[0],
    { ids: ['ok_1-2'], rules: [{ n: 2, unsure: 0, name: null }] })
  const line = (rule, seen, drawn = true) => { ctx.__args = { rule: read({ ...HEAD, ...rule })[0], seen, drawn }; return vm.runInContext('vault_follow_line(__args.rule, __args.seen, __args.drawn)', ctx) }
  const seen = (n, unsure = 0, name = null) => ({ n, unsure, name })
  check('watched: a rule\'s line says what it selects and what the page did: a count when every item it selects is marked, `marked` when it selects more than the page can tell, `not marked` when its items carry none',
    [line({ tags: ['#todo'] }, seen(112)), line({ labels: ['#markets*'], ids: ['a', 'b'] }, seen(16)), line({ tags: ['#todo'], more: ['/deadline/'] }, seen(112)), line({ tags: ['#todo'] }, seen(110, 2)),
      line({ more: ['/deadline/'] }, null), line({ more: ['/deadline/'] }, seen(0)), line({ labels: ['#chat*'] }, seen(1204), false), line({ tags: ['#todo'] }, seen(1)), line({ tags: ['#todo'] }, seen(0))],
    ['edits: #todo (112 items)', 'edits: #markets*, 2 by id (16 items)', 'edits: #todo, /deadline/ (112 items marked)', 'edits: #todo (110 items marked)',
      'edits: /deadline/ (not marked)', 'edits: /deadline/ (not marked)', 'edits: #chat* (1,204 items, not marked)', 'edits: #todo (1 item)', 'edits: #todo (0 items)'])
  check('watched: a follow of all items is its own line; a rule of ids that all resolve is said short, one of them by its item\'s name; before a look there is no count, and beside a follow of all items nothing is marked',
    [line({ all: true, tags: ['#todo'] }, null), line({ ids: ['a'] }, seen(1, 0, '#bank')), line({ ids: ['a'] }, seen(1)), line({ ids: ['a', 'b', 'c'] }, seen(3)), line({ ids: ['a', 'b', 'c'] }, seen(2)), line({ ids: ['a'] }, seen(0)),
      line({ ids: ['a'], tags: ['#todo'] }, seen(5, 0, '#bank')), line({ ids: ['a'], more: ['2 more by id'] }, seen(1, 0, '#bank')), line({ tags: ['#todo'] }, null), line({ tags: ['#todo'] }, null, false), line({ ids: ['a'] }, null, false),
      line({ ids: ['a', 'b'] }, seen(2), false)],
    ['edits: all items', 'edits: #bank', 'edits: 1 item', 'edits: 3 items', 'edits: 3 by id (2 items)', 'edits: 1 by id (0 items)', 'edits: #todo, #bank (5 items)', 'edits: #bank, 2 more by id (1 item marked)', 'edits: #todo',
      'edits: #todo (not marked)', 'edits: 1 by id (not marked)', 'edits: 2 by id (2 items, not marked)'])
  const titled = told => { ctx.__rule = follows({ follows: [told] })[0]; return vm.runInContext('vault_follow_title(__rule)', ctx) }
  check('watched: a line\'s tooltip names the agent, since when and its watch; the closing entry, which counts watches, has none',
    [titled({ ...HEAD, tags: ['#todo'] }), titled({ ...HEAD, name: '', since: 'x', tags: ['#todo'] }), titled({ more: ['3 more watches'] })],
    [`${watching.name} follows since ${new Date(SINCE).toLocaleString()} (watch todos)`, 'An agent follows (watch todos)', ''])
  // the owner's approved look, exactly (the preview of 2026-11-16): a 15px sparkle by the number,
  // lowered by two whole pixels, and a 23px one left of the edit menu's buttons, in the sparkle's
  // yellow, from rules that name the items' boxes by id
  const sparkle_svg = px => encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 16 16" aria-hidden="true"><path fill="#f5e389" d="M8 0.5l1.9 5.6 5.6 1.9-5.6 1.9L8 15.5l-1.9-5.6L0.5 8l5.6-1.9z"/></svg>`)
  const BOXES = ids => `:is(${ids.map(id => `.container[data-item-id="${id}"]`).join(', ')})`
  const LOOK = ids => `${BOXES(ids)} .item-menu > .button.index::before { content: url("data:image/svg+xml,${sparkle_svg(15)}"); flex: none; margin-right: 3px; position: relative; top: 2px }\n` +
    `${BOXES(ids)} .edit-menu::before { content: ''; flex: none; align-self: center; width: 23px; height: 23px; margin-right: 6px; background: url("data:image/svg+xml,${sparkle_svg(23)}") center / contain no-repeat }`
  check('watched: the mark is the approved look: one sheet of two rules over the items\' boxes, a 15px sparkle by the number and a 23px one in the edit menu; no item, no rule',
    [vm.runInContext("vault_watched_css(['t1', 'tmp-1'])", ctx), vm.runInContext('vault_watched_css([])', ctx)], [LOOK(['t1', 'tmp-1']), ''])

  // the controller, over a fake page: nodes with listeners, the app's task seam (a same-named
  // dispatch calls the earlier task's _on_cancel at once), and one item code evaluation per
  // deephash (the app evaluates the item's code afresh at every hook)
  const log = []
  class FakeNode {
    constructor(tag) { this.tag = tag; this.children = []; this.parent = null; this.listeners = {}; this.dataset = {}; this.attrs = {}; this.hidden = false; this.title = ''; this.classes = new Set() }
    appendChild(child) { child.parent = this; this.children.push(child); log.push(`+${child.dataset.vaultSparkle ?? child.tag}`); return child }
    remove() { if (!this.parent) return; this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; log.push(`-${this.dataset.vaultSparkle ?? this.tag}`) }
    contains(node) { for (let n = node; n; n = n.parent) if (n === this) return true; return false }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) }
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn) }
    setAttribute(name, value) { this.attrs[name] = value }
    removeAttribute(name) { delete this.attrs[name] }
    get classList() { return { toggle: (name, on) => (on ? this.classes.add(name) : this.classes.delete(name)), contains: name => this.classes.has(name) } }
    focus() { page.activeElement = this }
    blur() { if (page.activeElement === this) page.activeElement = null }
    fire(type, more = {}) {
      const event = { type, target: this, prevented: 0, stopped: 0, preventDefault() { this.prevented++ }, stopPropagation() { this.stopped++ }, ...more }
      for (const fn of [...(this.listeners[type] ?? [])]) fn(event)
      return event
    }
  }
  const page = new FakeNode('document')
  Object.assign(page, {
    head: new FakeNode('head'), body: new FakeNode('body'), activeElement: null,
    createElement: tag => new FakeNode(tag),
    all() { const out = []; const walk = n => { out.push(n); n.children.forEach(walk) }; walk(this.head); walk(this.body); return out },
    querySelectorAll(selector) { if (selector != '[data-vault-sparkle]') throw new Error(selector); return this.all().filter(n => 'vaultSparkle' in n.dataset) },
  })
  const parts = kind => page.all().filter(n => n.dataset.vaultSparkle == kind)
  const viewport = new FakeNode('viewport')
  Object.assign(viewport, { height: 800, scale: 1 })
  const sent = []
  const alerts = []
  const writes = { fail: 0 }
  const win = Object.assign(env.window, {
    innerHeight: 800, visualViewport: viewport, modal: false, _modal_visible: () => win.modal,
    _enqueue_hidden_document: async (name, item, id = null) => {
      sent.push({ name, item, id })
      return { id: id ?? 'doc-' + sent.length, written: writes.fail-- > 0 ? Promise.reject(new Error('offline')) : Promise.resolve() }
    },
  })
  const tasks = {}
  const store = { _bridge: { host: 'test-host', watcher: { ...watching } } }
  const status = new FakeItem('#status')
  status._global_store = { _status: { hosts: fresh } }
  items['status-id'] = status
  status.id = 'status-id'
  // the page's #vault: the label names this item, and a renamed copy would not be it
  items['vault-id'] = new FakeItem('#vault')
  items['vault-id'].id = 'vault-id'
  // one evaluation of an item's code, as a hook's: `_this` with the deephash of the text then,
  // and the item's own store and tasks (the app keeps both per item)
  const evaluation = (deephash, id = 'vault-id', own = { store, tasks }, page_seams = {}) => {
    const _this = {
      id, deephash, _global_store: own.store, store: {}, save_global_store() {},
      dispatch_task(name, fn, delay, repeat) {
        own.tasks[name]?._on_cancel?.() // the app: cancel any existing task under the name
        const task = { fn, delay, repeat }
        log.push(`task ${name}`)
        return (own.tasks[name] = task)
      },
    }
    const context = vm.createContext({ ...env, _this, document: page, crypto: require('crypto').webcrypto, alert: m => alerts.push(m), ...page_seams })
    vm.runInContext(tableSrc[0] + '\n' + block[1], context)
    return code => vm.runInContext(code, context)
  }
  const v1 = evaluation(1)
  v1('_on_welcome()')
  check('sparkle: the page\'s welcome draws it', parts('node').length, 1)
  const [node] = parts('node')
  check('sparkle: a hook draws one element, its style and the stylesheet of the watched items\' marks, shown with the watcher\'s words, and one task',
    [log, parts('node').length, parts('style').length, node.parent === page.body, node.hidden, node.title, node.attrs['aria-label'], node.classes.has('answering'), tasks.sparkle.delay, tasks.sparkle.repeat],
    [['+style', '+watched', '+node', 'task sparkle'], 1, 1, true, false, shown.title, shown.title, false, 15000, 15000])
  store._bridge.watcher.jump = JUMP
  v1('_on_global_store_change(_this.id)')
  const hung = node.dataset.vaultJump
  delete store._bridge.watcher.jump
  v1('_on_global_store_change(_this.id)')
  check('sparkle: the watching agent\'s herdr tab hangs on the element, for the browser\'s extension, and goes with it', [hung, 'vaultJump' in node.dataset], [JSON.stringify(JUMP), false])
  store._bridge.watcher.jump = JUMP
  v1('_on_global_store_change(_this.id)')
  status._global_store._status.hosts = at(T - 4 * 60000) // review 37: the bridge goes stale while a tab hangs there
  v1("_on_global_store_change('status-id')")
  check('sparkle: a bridge that goes stale takes the tab off the hidden element too', [node.hidden, 'vaultJump' in node.dataset], [true, false])
  status._global_store._status.hosts = fresh
  delete store._bridge.watcher.jump
  v1("_on_global_store_change('status-id')")
  store._bridge.watcher.state = 'answering'
  v1('_on_global_store_change(_this.id)')
  check('sparkle: a store change updates the same element in place', [parts('node')[0] === node, log.length, node.classes.has('answering'), node.title],
    [true, 4, true, 'claude-fable-5-2-max is answering a request'])
  status._global_store._status.hosts = at(T - 4 * 60000)
  v1("_on_global_store_change('status-id')")
  check('sparkle: the #status item\'s store counts too: a stale bridge hides it', node.hidden, true)
  status._global_store._status.hosts = fresh
  v1("_on_global_store_change('busy-id')")
  check('sparkle: another item\'s store is nothing to it', node.hidden, true)
  v1('_on_focus()')
  store._bridge.watcher.state = 'watching'
  check('sparkle: a return to the page looks at once', node.hidden, false)
  // the menu: it captures the watch it shows
  node.fire('click')
  const menu = () => parts('menu')[0]
  const stop = () => menu()?.children[0]
  const nowhere = () => page.activeElement === null // the focus is given up: the keyboard is the page's
  const layer = () => parts('backdrop')[0]
  check('sparkle: a click opens the menu above it, over a layer that covers the page; the menu has the focus and no entry does',
    [parts('menu').length, stop()?.tag, stop()?.textContent, parts('menu').length == 1 && page.activeElement === menu(), menu()?.tabIndex, node.attrs['aria-expanded'], (page.listeners.pointerdown ?? []).length, parts('backdrop').length, log.slice(-2)],
    [1, 'button', 'Stop Watching', true, -1, 'true', 1, 1, ['+backdrop', '+menu']])
  const escape = menu().fire('keydown', { key: 'Escape' })
  check('sparkle: Escape closes a menu a pointer opened, with its layer, and gives the focus up: the keyboard is the page\'s, and the key was the menu\'s alone',
    [parts('menu').length, parts('backdrop').length, nowhere(), escape.stopped, escape.prevented, (page.listeners.pointerdown ?? []).length, 'aria-expanded' in node.attrs], [0, 0, true, 1, 1, 0, false])
  node.fire('keydown', { key: ' ' })
  check('sparkle: Space on the focused sparkle opens the menu, on its first entry', [parts('menu').length, page.activeElement === stop()], [1, true])
  menu().fire('keydown', { key: 'Escape' })
  check('sparkle: Escape closes a menu the keyboard opened and returns the focus to the sparkle', [parts('menu').length, page.activeElement === node], [0, true])
  node.fire('keydown', { key: ' ' })
  win.modal = true
  const under = menu()?.fire('keydown', { key: 'Enter' }) ?? {}
  check('sparkle: under a modal the key is the modal\'s: the menu closes, sends nothing, and the sparkle takes no focus back', [parts('menu').length, under.stopped, under.prevented, sent.length, nowhere()], [0, 0, 0, 0, true])
  win.modal = false
  node.fire('contextmenu')
  node.fire('contextmenu')
  check('sparkle: the context menu opens it, once', parts('menu').length, 1)
  page.fire('pointerdown', { target: node })
  check('sparkle: a press on the sparkle itself is not a press outside', parts('menu').length, 1)
  const pressed_node = ['mousedown', 'touchstart'].map(type => node.fire(type)).map(e => [e.prevented, e.stopped])
  check('sparkle: a press on the sparkle is not the app\'s, and a mouse\'s gives it no focus (a later key could show a clicked sparkle\'s ring); a touch keeps its tap',
    [pressed_node, page.activeElement === menu()], [[[1, 1], [0, 1]], true])
  node.fire('click')
  check('sparkle: a click on the sparkle closes its menu and the focus is given up, the sparkle\'s too', [parts('menu').length, nowhere()], [0, true])
  node.fire('contextmenu')
  const pressed_layer = ['pointerdown', 'mousedown', 'touchstart'].map(type => layer().fire(type)).map(e => [e.prevented, e.stopped])
  page.fire('pointerdown', { target: layer() })
  check('sparkle: a press on the layer closes nothing yet, takes no focus, and is nothing to the app or the page',
    [parts('menu').length, pressed_layer, page.activeElement === menu()], [1, [[1, 1], [1, 1], [0, 1]], true])
  const clicked_layer = layer().fire('click')
  check('sparkle: the click on the layer closes the menu, and is the layer\'s alone: nothing is sent, and the focus is given up',
    [parts('menu').length, parts('backdrop').length, clicked_layer.prevented, clicked_layer.stopped, sent.length, nowhere()], [0, 0, 1, 1, 0, true])
  node.fire('contextmenu')
  const menued_layer = layer().fire('contextmenu')
  check('sparkle: a context menu on the layer closes the menu too, and is not the browser\'s', [parts('menu').length, menued_layer.prevented, menued_layer.stopped], [0, 1, 1])
  node.fire('contextmenu')
  page.fire('pointerdown', { target: page.body })
  check('sparkle: a press on anything else outside (something drawn above the layer) closes the menu', [parts('menu').length, parts('backdrop').length], [0, 0])
  node.fire('click')
  menu().fire('focusout', { relatedTarget: node })
  check('sparkle: the focus moving to the sparkle itself leaves the menu to its click', parts('menu').length, 1)
  node.fire('click')
  check('sparkle: and that click, on the sparkle of an open menu, closes it', [parts('menu').length, parts('backdrop').length], [0, 0])
  node.fire('click')
  node.fire('focusout', { relatedTarget: stop() })
  check('sparkle: the focus going from the sparkle back into the menu keeps it', parts('menu').length, 1)
  node.fire('focusout', { relatedTarget: null })
  check('sparkle: the focus leaving the sparkle for elsewhere closes its menu', parts('menu').length, 0)
  node.fire('click')
  menu().fire('focusout', { relatedTarget: null })
  check('sparkle: the focus leaving the menu closes it (a modal blurs the page\'s element)', parts('menu').length, 0)
  node.fire('click')
  const released = menu().fire('keyup', { key: 'Enter' })
  win.modal = true
  const under_up = menu().fire('keyup', { key: 'Enter' })
  win.modal = false
  check('sparkle: a key\'s release in the menu is the menu\'s, and the modal\'s under a modal', [released.stopped, released.prevented, under_up.stopped, under_up.prevented], [1, 1, 0, 0])
  delete store._bridge.watcher
  v1('_on_global_store_change(_this.id)')
  check('sparkle: a watcher that goes takes its menu with it, and the sparkle is the offer to start one, dim',
    [parts('menu').length, node.hidden, node.title, node.classes.has('idle'), node.classes.has('answering')], [0, false, offer.title, true, false])
  store._bridge.watcher = { ...watching }
  v1('_on_global_store_change(_this.id)')
  node.fire('click')
  viewport.height = 400
  viewport.fire('resize')
  check('sparkle: a keyboard closes an open menu', [parts('menu').length, node.hidden], [0, true])
  viewport.height = 800
  viewport.fire('resize')
  node.fire('click')
  store._bridge.watcher.took = 'a later take' // the watch is replaced while the menu is open
  const first = stop()
  first.fire('click')
  check('sparkle: Stop Watching stops the watch the menu SHOWED, as one command document',
    [sent.length, sent[0]?.name == 'watch_command_' + sent[0]?.item.id, /^[0-9a-f]{16}$/.test(sent[0]?.item.id), sent[0]?.item.kind, sent[0]?.item.took, sent[0]?.item.at, sent[0]?.id, parts('menu').length],
    [1, true, true, 'stop', TOOK, T, null, 0])
  store._bridge.watcher.took = TOOK
  v1('_on_global_store_change(_this.id)')
  node.fire('click')
  store._bridge.watcher.took = 'a later take'
  v1('_on_global_store_change(_this.id)')
  check('sparkle: a replaced watch closes the menu that showed the earlier one', [parts('menu').length, node.title], [0, shown.title])
  store._bridge.watcher.took = TOOK
  v1('vault_sparkle_reconcile()')
  node.fire('keydown', { key: 'Enter' })
  const pressed = menu()?.fire('keydown', { key: ' ' }) ?? {}
  check('sparkle: the keyboard reaches the entry, a sent stop shows as stopping, and the focus is the sparkle\'s again', [sent.length, sent[1]?.item.took, pressed.stopped, pressed.prevented, node.title, node.classes.has('answering'), page.activeElement === node],
    [2, TOOK, 2, 1, "Stopping claude-fable-5-2-max's watch", true, true])
  const up = node.fire('keyup', { key: ' ' })
  check('sparkle: the key\'s release is not a second activation', [up.prevented, up.stopped, parts('menu').length], [1, 1, 0])
  clock.now = T + 31000
  status._global_store._status.hosts = at(clock.now)
  tasks.sparkle.fn()
  check('sparkle: the task\'s look ends the stopping after half a minute', node.title, shown.title)
  clock.now = T
  status._global_store._status.hosts = fresh
  // a phone's keyboard
  viewport.height = 400
  viewport.fire('resize')
  check('sparkle: a short visual viewport hides it at the viewport\'s own event', node.hidden, true)
  viewport.height = 800
  viewport.fire('resize')
  check('sparkle: and its return shows it again', node.hidden, false)
  // an update of the item's code: the old controller goes BEFORE the new one draws, and the old
  // task's cancellation, which the app runs when the new task is dispatched, removes nothing new
  node.fire('click')
  log.length = 0
  const old = win._vault_sparkle
  const v2 = evaluation(2)
  v2("_on_item_change('vault-id', '#vault', '#vault', false, true, false)")
  const [node2] = parts('node')
  check('sparkle: another tab\'s update replaces the controller: the old menu, its layer, element, style and marks go first, then the new draw, then the task',
    [log, node2 !== node, parts('node').length, parts('style').length, parts('menu').length, (page.listeners.pointerdown ?? []).length, (viewport.listeners.resize ?? []).length, win._vault_sparkle.code],
    [['-menu', '-backdrop', '-node', '-style', '-watched', '+style', '+watched', '+node', 'task sparkle'], true, 1, 1, 0, 0, 1, 2])
  // (the old code's hooks no longer run; its closures may)
  const sent_before = sent.length
  node.fire('click')
  old.open()
  old.act('stop', { took: TOOK })
  viewport.fire('resize')
  check('sparkle: the old controller opens no menu and sends no stop', [parts('menu').length, sent.length - sent_before, parts('node')[0] === node2, node2.hidden], [0, 0, true, false])
  // a controller whose window reference was lost: its task's cancellation, at the new task's
  // dispatch, releases what it owned and does not take the new controller's reference
  delete win._vault_sparkle
  v2('_on_focus()')
  check('sparkle: a lost controller is released by its task, and its late dispose leaves the new one alone',
    [parts('node').length, parts('style').length, win._vault_sparkle?.node === parts('node')[0], parts('node')[0] !== node2], [1, 1, true, true])
  const kept = parts('node')[0]
  log.length = 0
  v2('_on_focus()')
  v2('_on_welcome()')
  v2("_on_item_change('vault-id', '#vault', '#vault', false, true, true)") // a dependency's change that left the hash as it was
  check('sparkle: the same code keeps its controller across hooks', [parts('node')[0] === kept, log], [true, []])
  // the item is deleted: the app cancels its task at the task's next run
  tasks.sparkle._on_cancel?.()
  check('sparkle: the task\'s cancellation releases everything the controller owns',
    [parts('node').length, parts('style').length, '_vault_sparkle' in win, (viewport.listeners.resize ?? []).length, tasks.sparkle.fn() === null, parts('node').length], [0, 0, false, 0, true, 0])
  // an install after the page's welcome: the item's own change draws the sparkle, in this tab
  // and in another, and provisions nothing; the app's install hook provisions the store
  delete store._owner
  v2("_on_item_change('vault-id', '#vault', '#vault', false, true, false)")
  check('sparkle: another tab\'s change of the item draws the sparkle and leaves the store alone', [parts('node').length, '_owner' in store], [1, false])
  tasks.sparkle._on_cancel?.()
  v2("_on_item_change('vault-id', '#vault', '', false, false, false)")
  check('sparkle: the item\'s own creation in this tab draws it, and provisions nothing either', [parts('node').length, '_owner' in store], [1, false])
  store._bridge.watcher.state = 'answering'
  v2("_on_item_change('status-id', '#status', '#status', false, false, false)")
  check('sparkle: another item\'s change is nothing to it', parts('node')[0].classes.has('answering'), false)
  store._bridge.watcher.state = 'watching'
  v2('_on_install()')
  v2('_on_install()')
  check('sparkle: the install hook provisions the store, once', [parts('node').length, store._owner], [1, { stop: {} }])
  delete store._owner
  // two items carry this code (review 27): the page's #vault, and a renamed copy of it whose
  // store still names a watcher while the bridge's entry stays fresh. Only the item the label
  // names draws; the other releases what it drew, draws nothing at its later hooks, and leaves
  // the current item's sparkle alone whatever the order of their hooks
  parts('node')[0].fire('click')
  items['vault-id'].name = '#vault_old'
  v2("_on_item_change('vault-id', '#vault_old', '#vault', false, false, false)")
  check('sparkle: a renamed item releases its sparkle, its store still naming a watcher',
    [parts('node').length, parts('style').length, parts('menu').length, '_vault_sparkle' in win, tasks.sparkle.fn() === null, store._bridge.watcher.name],
    [0, 0, 0, false, true, watching.name])
  for (const hook of ['_on_focus()', "_on_global_store_change('status-id')", '_on_global_store_change(_this.id)']) v2(hook)
  check('sparkle: and draws nothing at its later hooks', [parts('node').length, '_vault_sparkle' in win], [0, false])
  const current = { store: { _bridge: { host: 'test-host', watcher: { ...watching, name: 'current-agent' } } }, tasks: {} }
  items['vault2-id'] = new FakeItem('#vault')
  items['vault2-id'].id = 'vault2-id'
  const c1 = evaluation(1, 'vault2-id', current)
  c1("_on_item_change('vault2-id', '#vault', '', false, false, false)")
  c1('_on_install()')
  const mine = parts('node')[0]
  const owned = () => [parts('node')[0] === mine, parts('node').length, mine?.title, win._vault_sparkle?.item]
  check('sparkle: the item under the label draws its own watcher', [...owned(), current.store._owner], [true, 1, 'current-agent is watching', 'vault2-id', { stop: {} }])
  for (const hook of ['_on_focus()', "_on_global_store_change('status-id')", '_on_global_store_change(_this.id)', '_on_welcome()']) v2(hook)
  tasks.sparkle.fn()
  check('sparkle: the renamed item\'s hooks and task leave the current sparkle alone', owned(), [true, 1, 'current-agent is watching', 'vault2-id'])
  c1('_on_focus()')
  v2('_on_focus()')
  const then_old = owned()
  v2('_on_focus()')
  c1('_on_focus()')
  check('sparkle: in either order of the two items\' hooks', [then_old, owned()], [[true, 1, 'current-agent is watching', 'vault2-id'], [true, 1, 'current-agent is watching', 'vault2-id']])
  items['vault-id'].name = '#vault' // two items under the label: neither is the page's #vault
  c1('_on_focus()')
  check('sparkle: two items under the label show nothing', [parts('node').length, '_vault_sparkle' in win], [0, false])
  items['vault-id'].name = '#vault_old'
  tasks.sparkle._on_cancel?.()
  // ---- the watched mark's controller, over the same fake page: the page's #vault (vault2-id)
  // with a store of its own, and the page's items as the app holds them (the corpus above).
  // What it costs and when: nothing while nothing is followed; one look a moment after the
  // rules or an item changed; never at the time's tick. What it draws: the approved look over
  // the items the rules surely name, none for a stale bridge, a follow of all items or more
  // than five hundred; and the lines of the sparkle's menu
  {
    const list = page_items.map(item => ({ ...item, tags_raw: [...item.tags_raw] }))
    const fake = corpus(list)
    const own = { store: { _bridge: { host: 'test-host', watcher: { ...watching } } }, tasks: {} }
    const w1 = evaluation(11, 'vault2-id', own, { _items: fake._items, _labels: fake._labels, _item: fake._item })
    const changed = (id, dependency = false) => w1(`_on_item_change('${id}', '#x', '#x', false, false, ${dependency})`)
    const publish = (rules, more = watching) => { own.store._bridge.watcher = { ...more, follows: rules }; w1('_on_global_store_change(_this.id)') }
    const looks = () => log.filter(entry => entry == 'task watched').length
    const TODO = { ...HEAD, tags: ['#todo'] }
    const TODOS = ['l2', 'l4', 't1', 't2', 'u1', 'w1'] // the items the tag surely names, as the look rows above have them
    log.length = 0
    w1('_on_focus()')
    const spark = parts('node')[0]
    const sheet = parts('watched')[0]
    let [written, css] = [0, sheet.textContent ?? ''] // the sheet's text, its writes counted
    Object.defineProperty(sheet, 'textContent', { get: () => css, set: text => { written++; css = text } })
    const menu = () => parts('menu')[0]
    // what the menu holds below its entries, read by opening it and closing it again
    const said = () => { spark.fire('click'); const out = menu().children.filter(child => child.tag == 'div').map(child => [child.textContent, child.title]); spark.fire('click'); return out }
    const TITLE = `${watching.name} follows since ${new Date(SINCE).toLocaleString()} (watch todos)`
    changed('t1')
    const drew = [...log]
    check('watched: the controller owns one more node, the marks\' stylesheet, empty while nothing is followed; an item\'s change then dispatches nothing, reads no item, and the menu has no line',
      [drew, sheet.tag, sheet.parent === page.head, css, fake.calls.items, said(), spark.title], [['+style', '+watched', '+node', 'task sparkle'], 'style', true, '', 0, [], shown.title])
    log.length = 0
    publish([TODO])
    const asked = [...log]
    check('watched: published rules with something to check ask for ONE look, 250 ms later, as a task of the item, and no item is read before it; the menu says what is followed, without a count yet',
      [asked, own.tasks.watched.delay, own.tasks.watched.repeat, fake.calls.items, css, said()], [['task watched'], 250, undefined, 0, '', [['edits: #todo', TITLE]]])
    own.tasks.watched.fn()
    check('watched: the look draws the approved look over the items the rule surely names, in one pass over the items, and the menu\'s line has its count',
      [css, fake.calls.items, said(), spark.title], [LOOK(TODOS), 1, [['edits: #todo (6 items marked)', TITLE]], shown.title])
    log.length = 0
    changed('t1')
    const once = [[...log], own.tasks.watched.delay]
    changed('t1', true)
    check('watched: with a rule applied, an item\'s change asks for one look, 250 ms later; a change of one of its dependencies asks for none', [once, looks()], [[['task watched'], 250], 1])
    written = 0
    own.tasks.watched.fn()
    w1('_on_global_store_change(_this.id)') // the same rules again: a store change that says nothing new
    for (const hook of ['_on_focus()', "_on_global_store_change('status-id')"]) w1(hook)
    own.tasks.sparkle.fn() // the time's tick
    check('watched: a look that finds the same items rewrites nothing; the same rules again, a return to the page and the tick ask for no look and read no item', [written, css == LOOK(TODOS), looks(), fake.calls.items], [0, true, 1, 2])
    const m1 = list.find(item => item.id == 'm1')
    m1.tags_raw.push('#todo') // the owner saves the tag on an item
    changed('m1')
    own.tasks.watched.fn()
    const gained = css
    list.splice(list.findIndex(item => item.id == 't1'), 1) // and deletes another
    w1("_on_item_change('t1', '#todo', '#todo', true, false, false)")
    own.tasks.watched.fn()
    check('watched: a tag saved on an item marks it at the next look, and a deleted item\'s mark goes', [gained, css, said().map(([text]) => text)],
      [LOOK(['l2', 'l4', 'm1', 't1', 't2', 'u1', 'w1']), LOOK(['l2', 'l4', 'm1', 't2', 'u1', 'w1']), ['edits: #todo (6 items marked)']])
    // a stale bridge: the sparkle's own test. The marks go at once, with no look, and come back with it
    log.length = 0
    status._global_store._status.hosts = at(T - 4 * 60000)
    w1("_on_global_store_change('status-id')")
    const stale = [css, looks(), spark.hidden]
    changed('t2')
    status._global_store._status.hosts = fresh
    w1("_on_global_store_change('status-id')")
    const back = [css, looks()]
    own.tasks.watched.fn()
    check('watched: a bridge that goes stale clears the marks at once and nothing looks while it is; fresh again, one look brings them back',
      [stale, back, css], [['', 0, true], ['', 1], LOOK(['l2', 'l4', 'm1', 't2', 'u1', 'w1'])])
    // a follow of all items: no item is marked, and nothing looks; the line and the sparkle's own words say it
    log.length = 0
    const read_before = fake.calls.items
    publish([TODO, { ...HEAD, watch: 'sweep', all: true }])
    changed('t2')
    check('watched: a follow of all items marks none, at once, and reads none: every item is followed, so its line and the sparkle\'s tooltip say it, and the other rules\' lines say not marked',
      [css, looks(), fake.calls.items - read_before, said().map(([text]) => text), spark.title, spark.attrs['aria-label']],
      ['', 0, 0, ['edits: #todo (not marked)', 'edits: all items'], shown.title + ' · edits: all items', shown.title + ' · edits: all items'])
    publish([{ ...HEAD, more: ['/deadline/'] }])
    changed('t2')
    check('watched: rules of words alone (a regex) mark nothing and look at nothing; the tooltip is the watcher\'s again', [css, looks(), said().map(([text]) => text), spark.title], ['', 0, ['edits: /deadline/ (not marked)'], shown.title])
    // the cap: more than five hundred items are not marked, and the line says how many
    for (let n = 0; n < 500; n++) list.push(held('bulk' + n, 'a note #bulk', '', ['#bulk']))
    publish([{ ...HEAD, tags: ['#bulk'] }, { ...HEAD, ids: ['w1'] }]) // five hundred and one items between them
    own.tasks.watched.fn()
    const over = [css, said().map(([text]) => text)]
    list.pop()
    changed('bulk499')
    own.tasks.watched.fn()
    check('watched: over five hundred items none is marked and the lines say how many; at five hundred they are',
      [over, css == LOOK([...Array.from({ length: 499 }, (_, n) => 'bulk' + n), 'w1'].sort()), said().map(([text]) => text)],
      [['', ['edits: #bulk (500 items, not marked)', 'edits: #work (1 item, not marked)']], true, ['edits: #bulk (499 items)', 'edits: #work']])
    list.splice(list.findIndex(item => item.id == 'bulk0'), 499)
    // the menu: the lines are below the entries, text alone; they take no focus and the arrows skip them
    publish([TODO, { ...HEAD, watch: 'bank', name: '<b>x</b>', ids: [BANK] }], { state: 'none' })
    own.tasks.watched.fn()
    spark.fire('keydown', { key: 'Enter' })
    const drawn = menu().children.map(child => [child.tag, child.dataset.vaultEntry ?? child.textContent, child.attrs.role ?? null, Object.keys(child.listeners).length > 0])
    const walked = ['ArrowUp', 'ArrowDown', 'ArrowDown'].map(key => { menu().fire('keydown', { key }); return page.activeElement?.dataset.vaultEntry ?? page.activeElement?.tag })
    check('watched: with nobody on the account the menu has the starts, then the same lines: text alone, below the entries, with no listener of their own, and the arrows move through the entries alone',
      [spark.classes.has('idle'), drawn, walked, menu().children[3].title],
      [true, [['button', 'claude', 'menuitem', true], ['button', 'codex', 'menuitem', true], ['div', 'edits: #todo (6 items marked)', null, false], ['div', 'edits: #bank', null, false]], ['codex', 'claude', 'codex'],
        `<b>x</b> follows since ${new Date(SINCE).toLocaleString()} (watch bank)`])
    m1.tags_raw.pop() // the counts of an open menu change: the tag is taken off an item
    changed('m1')
    const still = parts('menu').length
    own.tasks.watched.fn()
    const after_look = parts('menu').length
    spark.fire('click')
    publish([TODO], { state: 'none' })
    check('watched: a menu whose lines are no longer what it shows closes: at the look that changes a count, and at a change of the rules', [still, after_look, parts('menu').length, said().map(([text]) => text)],
      [1, 0, 0, ['edits: #todo']])
    own.tasks.watched.fn()
    // an update of the item's code: the controller that goes takes its marks with it, and the new one looks again
    log.length = 0
    const old = win._vault_sparkle
    const w2 = evaluation(12, 'vault2-id', own, { _items: fake._items, _labels: fake._labels, _item: fake._item })
    w2("_on_item_change('vault2-id', '#vault', '#vault', false, true, false)")
    const [sheet2] = parts('watched')
    const replaced = [[...log], sheet2 !== sheet, sheet.parent, parts('watched').length, sheet2.textContent ?? '']
    const read_then = fake.calls.items
    written = 0
    old.mark()
    old.look()
    const idle = [written, fake.calls.items - read_then, looks()]
    own.tasks.watched.fn()
    // (the look is asked for twice, at the new controller's first rules and at the item's own change, and is one task: the app replaces a task of the same name)
    check('watched: a replaced controller takes its marks with it, and then looks at nothing and reads no item; the new one draws its own sheet, empty until its look',
      [replaced, idle, sheet2.textContent],
      [[['-node', '-style', '-watched', '+style', '+watched', '+node', 'task sparkle', 'task watched', 'task watched'], true, null, 1, ''], [0, 0, 2], LOOK(['l2', 'l4', 't2', 'u1', 'w1'])])
    // only the controller's own item asks it to look: the renamed copy (vault-id) hears the same change
    log.length = 0
    v2("_on_item_change('t2', '#todo', '#todo', false, false, false)")
    check('watched: an item change heard by another item that carries this code asks the page\'s controller for nothing', looks(), 0)
    own.tasks.sparkle._on_cancel?.() // the item is deleted: the app cancels its task
    own.tasks.watched.fn()
    check('watched: the controller\'s end removes the marks, and a look still due does nothing', [parts('watched').length, parts('node').length, '_vault_sparkle' in win], [0, 0, false])
  }
  // the command's transport: one retry at the same document id, then said
  ;(async () => {
    // ---- slice 6: the controller over the same fake page, for the page's #vault (vault2-id):
    // the offer and its click, the menu's entries and keys, this tab's start that the bridge
    // never names, and the close's dialog
    const modals = []
    win._modal = (content, options) => new Promise(resolve => modals.push({ content, options, resolve }))
    const settle = () => new Promise(resolve => setTimeout(resolve, 0))
    const bridge = current.store._bridge
    const hook = () => c1('_on_global_store_change(_this.id)')
    const item = (n = -1) => ({ ...sent.at(n)?.item, id: 'x' })
    const menu = () => parts('menu')[0]
    const offered = () => menu()?.children.map(button => button.dataset.vaultEntry) ?? null
    sent.length = 0
    delete bridge.watcher
    c1('_on_focus()')
    const spark = parts('node')[0]
    check('sparkle: with nobody watching and a fresh bridge it is drawn dim, as the offer',
      [spark.hidden, spark.title, spark.classes.has('idle'), spark.classes.has('answering')], [false, offer.title, true, false])
    const keyed = spark.fire('keydown', { key: 'Enter' })
    check('sparkle: Enter on the offer starts nothing: it opens the menu, on the first start, and is not the app\'s key',
      [sent.length, offered(), page.activeElement?.dataset.vaultEntry, keyed.prevented, keyed.stopped], [0, ['claude', 'codex'], 'claude', 1, 1])
    const again = spark.fire('keydown', { key: 'Enter', repeat: true }) // held on the sparkle: the menu stays as it is
    check('sparkle: a held key\'s repeats on the sparkle toggle nothing', [parts('menu').length, sent.length, again.prevented, again.stopped], [1, 0, 1, 1])
    spark.fire('keydown', { key: ' ' })
    spark.fire('click')
    check('sparkle: a click on the offer starts nothing: it opens the menu, with the starts, none of them focused',
      [sent.length, offered(), page.activeElement === menu()], [0, ['claude', 'codex'], true])
    menu().children[0].fire('click')
    const first = sent[0]?.item
    check('sparkle: Start Claude Watcher sends one start, with the bridge\'s heartbeat as the page has it, and the keyboard is the page\'s after it',
      [sent.length, sent[0]?.name == 'watch_command_' + first?.id, /^[0-9a-f]{16}$/.test(first?.id), item(0), sent[0]?.id, parts('menu').length, page.activeElement === null],
      [1, true, true, { id: 'x', kind: 'start', agent: 'claude', seen: SEEN, at: T }, null, 0, true])
    check('sparkle: and shows it as starting at once, dim and pulsing', [spark.title, spark.classes.has('answering'), spark.classes.has('idle')], [starting.title, true, true])
    spark.fire('click')
    check('sparkle: while it starts a click sends no second start: the menu\'s one entry is the cancel', [sent.length, menu()?.children.map(button => button.textContent)], [1, ['Cancel Start']])
    status._global_store._status.hosts = at(T - 4 * 60000)
    c1("_on_global_store_change('status-id')")
    check('sparkle: a bridge that goes stale takes the open menu and the sparkle with it', [parts('menu').length, spark.hidden], [0, true])
    status._global_store._status.hosts = fresh
    c1("_on_global_store_change('status-id')")
    spark.fire('click')
    bridge.watcher = { state: 'none', start: { id: first.id, agent: 'claude', at: TOOK, state: 'starting', tab: true, jump: JUMP } }
    hook()
    check('sparkle: a start under way hangs its tab on the element too', spark.dataset.vaultJump, JSON.stringify(JUMP))
    check('sparkle: the bridge naming the start keeps it shown, its menu open, and ends this tab\'s own mark', [spark.title, parts('menu').length, win._vault_sparkle.marks.started], [starting.title, 1, null])
    status._global_store._status.hosts = at(T - 5000) // the bridge's heartbeat moves on while the menu is open
    c1("_on_global_store_change('status-id')")
    menu().children[0].fire('click')
    check('sparkle: Cancel Start names the start the menu showed, with the heartbeat the page has when it is sent, and shows on it',
      [item(), sent.length, spark.title, parts('menu').length], [{ id: 'x', kind: 'cancel', start: first.id, seen: T - 5000, at: T }, 2, 'Cancelling the start', 0])
    status._global_store._status.hosts = fresh
    bridge.watcher.start = { ...bridge.watcher.start, state: 'unknown', note: 'no watcher appeared' }
    hook()
    spark.fire('click')
    check('sparkle: after an outcome that is not known a click starts nothing: it opens the menu, with the starts and the cancel, none of them focused; and no tab hangs on the element',
      [sent.length, spark.title, offered(), spark.classes.has('answering'), page.activeElement === menu(), 'vaultJump' in spark.dataset], [2, "A start's outcome is unknown: no watcher appeared", ['claude', 'codex', 'cancel'], false, true, false])
    const idle = ['Enter', ' '].map(key => menu().fire('keydown', { key }))
    check('sparkle: with no entry focused Enter and Space act on nothing, and are the menu\'s all the same (Space would scroll the page)',
      [sent.length, parts('menu').length, idle.map(e => [e.prevented, e.stopped])], [2, 1, [[1, 1], [1, 1]]])
    const focus = () => (page.activeElement === menu() ? null : page.activeElement?.dataset.vaultEntry)
    const walk = key => { menu().fire('keydown', { key }); return focus() }
    const point = (n, type = 'pointermove') => { menu().children[n].fire(type); return focus() }
    const leave = pointerType => { menu().fire('pointerleave', { pointerType }); return focus() }
    check('sparkle: with no entry focused the arrows start at the menu\'s ends, and they move through it around them',
      [walk('ArrowDown'), leave('mouse'), walk('ArrowUp'), walk('ArrowUp'), walk('ArrowDown'), walk('ArrowDown')], ['claude', null, 'cancel', 'codex', 'cancel', 'claude'])
    check('sparkle: one entry has the focus, which is the highlight: a pointer over an entry or pressed on it takes it there, an arrow moves it on, and a mouse that leaves the menu leaves no entry with it (a touch that leaves does)',
      [point(1), point(2, 'pointerdown'), walk('ArrowUp'), leave('touch'), leave('mouse'), walk('ArrowDown'), walk('ArrowDown')], ['codex', 'cancel', 'codex', 'codex', null, 'claude', 'codex'])
    spark.focus()
    menu().fire('pointerleave', { pointerType: 'mouse' })
    check('sparkle: a mouse that leaves the menu takes the focus from an entry alone, not from the sparkle', page.activeElement === spark, true)
    menu().children[1].focus()
    const repeated = menu().fire('keydown', { key: 'Enter', repeat: true }) // a held key: the app's it is not, and it acts on nothing
    check('sparkle: a held key\'s repeats act on no entry', [sent.length, parts('menu').length, repeated.prevented, repeated.stopped], [2, 1, 1, 1])
    const chosen = menu().fire('keydown', { key: 'Enter' })
    const second = sent[2]?.item
    check('sparkle: Enter acts on the entry that has the focus, and a menu a pointer opened gives the focus up after it',
      [item(), chosen.prevented, parts('menu').length, parts('backdrop').length, spark.title, page.activeElement === null], [{ id: 'x', kind: 'start', agent: 'codex', seen: SEEN, at: T }, 1, 0, 0, starting.title, true])
    // review 29, B2: the bridge never names this start, and what it says of the earlier one is no word on it
    clock.now = T + 31000
    status._global_store._status.hosts = at(clock.now - 1000)
    current.tasks.sparkle.fn()
    spark.fire('click')
    check('sparkle: a start the bridge never named is NOT CONFIRMED after half a minute, and a click opens the menu',
      [spark.title, spark.classes.has('answering'), sent.length, offered()], ['The bridge did not confirm the start: open the menu to start again', false, 3, ['claude', 'codex', 'cancel']])
    menu().children[2].fire('click')
    check('sparkle: its cancel names that start and lets go of it here, and what shows is what the bridge says',
      [item(), win._vault_sparkle.marks.started, spark.title], [{ id: 'x', kind: 'cancel', start: second.id, seen: clock.now - 1000, at: clock.now }, null, "A start's outcome is unknown: no watcher appeared"])
    clock.now = T
    status._global_store._status.hosts = fresh
    win._vault_sparkle.marks.started = { id: 'mine-2', at: T } // a start of this tab's, while the bridge has another under way
    bridge.watcher.start = { ...bridge.watcher.start, id: 'theirs-1', state: 'starting' }
    hook()
    spark.fire('click')
    menu().children[0].fire('click')
    check('sparkle: a cancel of the start the bridge shows names that one, and keeps this tab\'s own', [item(), win._vault_sparkle.marks.started?.id],
      [{ id: 'x', kind: 'cancel', start: 'theirs-1', seen: SEEN, at: T }, 'mine-2'])
    win._vault_sparkle.marks.started = null
    sent.pop()
    delete bridge.watcher
    hook()
    spark.fire('click', { shiftKey: true })
    check('sparkle: a shift-click is a click like any other: the menu, and nothing started', [sent.length, offered()], [4, ['claude', 'codex']])
    menu().children[1].fire('click')
    check('sparkle: Start Codex Watcher starts Codex', [item(), sent.length], [{ id: 'x', kind: 'start', agent: 'codex', seen: SEEN, at: T }, 5])
    // review 34, B1: an agent that watches hides this tab's unnamed start and is no word on it
    const third = sent.at(-1).item
    clock.now = T + 31000
    status._global_store._status.hosts = at(clock.now - 1000)
    bridge.watcher = { ...watching, tab: true } // Y, started elsewhere, takes the account
    hook()
    const masked = [spark.title, spark.classes.has('idle'), win._vault_sparkle.marks.started?.id === third.id]
    delete bridge.watcher // and leaves
    hook()
    spark.fire('click')
    check('sparkle: an agent that watches hides this tab\'s unnamed start and is no word on it: after that watch it is NOT CONFIRMED still, and a click starts nothing',
      [masked, spark.title, sent.length, offered()], [[shown.title, false, true], 'The bridge did not confirm the start: open the menu to start again', 5, ['claude', 'codex', 'cancel']])
    menu().children[2].fire('click')
    check('sparkle: and its cancel still names that start', [item(), win._vault_sparkle.marks.started], [{ id: 'x', kind: 'cancel', start: third.id, seen: clock.now - 1000, at: clock.now }, null])
    sent.pop()
    clock.now = T
    status._global_store._status.hosts = fresh
    hook()
    // the last watcher: the resume names the one the menu showed
    bridge.watcher = { state: 'none', last: { ...LAST } }
    hook()
    spark.fire('contextmenu')
    const resume = menu().children[2]
    bridge.watcher.last.key = 'k2' // another watcher became the last one, and the page has not looked yet
    resume.fire('click')
    check('sparkle: Resume Last Watcher names the watcher the menu showed', [resume.textContent, item(), sent.length], ['Resume Last Watcher (Codex)', { id: 'x', kind: 'resume', last: 'k1', seen: SEEN, at: T }, 6])
    win._vault_sparkle.marks.started = null
    hook()
    spark.fire('contextmenu')
    bridge.watcher.last = { ...LAST, key: 'k3' }
    hook()
    check('sparkle: a menu whose last watcher was replaced closes', [parts('menu').length, spark.title], [0, offer.title])
    // Close Agent Session: the app's dialog first, then the take the menu showed
    bridge.watcher = { ...watching, tab: true }
    hook()
    spark.fire('click')
    check('sparkle: a watcher in a herdr tab the bridge can close has its stop and its session\'s close', menu().children.map(button => button.textContent), ['Stop Watching', 'Close Agent Session'])
    menu().children[1].fire('click')
    await settle()
    check('sparkle: Close Agent Session asks first, in the app\'s own dialog, and sends nothing yet',
      [modals.length, modals[0]?.content, modals[0]?.options, sent.length, parts('menu').length, spark.title],
      [1, "Close claude-fable-5-2-max's session?<br><br>Its herdr tab closes, which ends the agent. Its conversation can be resumed.", { confirm: 'Close', cancel: 'Cancel' }, 6, 0, shown.title])
    bridge.watcher.took = 'a later take' // another watch took the account while the dialog is open
    status._global_store._status.hosts = at(T - 5000) // and the bridge's heartbeat moved on
    hook()
    modals[0].resolve(true)
    await settle()
    check('sparkle: the close names the take the menu showed, though another watch holds the account now, with the heartbeat the page has when it is sent',
      [item(), sent.length, spark.title], [{ id: 'x', kind: 'close', took: TOOK, seen: T - 5000, at: T }, 7, shown.title])
    status._global_store._status.hosts = fresh
    bridge.watcher.took = TOOK
    hook()
    check('sparkle: and shows on its own watch as closing', [spark.title, spark.classes.has('answering')], ["Closing claude-fable-5-2-max's session", true])
    for (const answer of [false, undefined]) { // cancelled, or closed some other way
      spark.fire('click')
      menu().children[1].fire('click')
      await settle()
      modals.at(-1).resolve(answer)
      await settle()
    }
    spark.fire('click')
    menu().children[1].fire('click')
    await settle()
    win._vault_sparkle.dispose()
    modals.at(-1).resolve(true)
    await settle()
    check('sparkle: a close that is not confirmed, or whose controller is gone, sends nothing',
      [modals.length, sent.length, parts('menu').length, parts('node').length], [4, 7, 0, 0])
    sent.length = 0
    writes.fail = 1
    const command = { id: 'c1', kind: 'stop', took: TOOK, at: 1 }
    ctx.__command = command
    Object.assign(ctx, { alert: m => alerts.push(m) })
    const ok = await vm.runInContext('vault_send_watch_command(__command)', ctx)
    await new Promise(resolve => setTimeout(resolve, 0))
    check('sparkle: a failed write is retried once at the same document id', [ok, sent.map(s => [s.name, s.item === command, s.id]), alerts], [true, [['watch_command_c1', true, null], ['watch_command_c1', true, 'doc-1']], []])
    sent.length = 0
    writes.fail = 2
    await vm.runInContext('vault_send_watch_command(__command)', ctx)
    await new Promise(resolve => setTimeout(resolve, 0))
    check('sparkle: a second failure is said, not retried again', [sent.length, alerts], [2, ["the watch's stop was not saved: offline"]])
    alerts.length = 0
    win._enqueue_hidden_document = async () => { throw new Error('enqueueHiddenDocument called on anonymous account') }
    check('sparkle: a command that cannot be prepared is said', [await vm.runInContext('vault_send_watch_command(__command)', ctx), alerts],
      [false, ['could not stop the watch: enqueueHiddenDocument called on anonymous account']])
    if (failures) { console.log(`${failures} failure(s)`); process.exit(1) }
    console.log('all checks passed')
  })()
}
