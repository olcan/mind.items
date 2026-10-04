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
// the WHOLE script compiles (2026-09-30: a duplicate `const` in the render loop parsed nowhere the
// table looked, since it picks functions; the shipped script would have failed to load)
new vm.Script(src, { filename: 'todoer.js' })
const pick = names => names.map(name => {
  const m = src.match(new RegExp(`\\n(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}\\n`))
  if (!m) throw new Error(`function ${name} not found in todoer.js`)
  return m[0]
})
const consts = ['_pending_commands', 'TODOER_VERSION', 'HGRAB_RADIUS', 'HGRAB_RATIO', 'SAVE_WAIT_MS', 'SAVE_POLL_MS', 'RESUME_GAP_MS', 'RESUME_HOLD_MS', '_url_char', 'NOTIFY_ATTENTION', 'NOTIFY_REASONS', 'NOTIFIER_KEY', 'NOTIFIER_STALE_MS', 'NOTIFIER_REFRESH_MS', '_notify_text', '_notify_permission', '_notifier_id', '_seen_record'].map(name => src.match(new RegExp(`\\nconst ${name} = [^\\n]*\\n`))[0]).join('')
const delimiter = '[\\s<>&?!,.;:"\'`(){}\\[\\]]'
// the clock the evaluated source reads: live, or frozen at __now by the callback rows below
const RealDate = Date
class ClockDate extends RealDate {
  static now() {
    return context.__now ?? RealDate.now()
  }
}
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
  debug: () => {},
  fatal: msg => { throw new Error(msg) },
  _todoer: { store: {} },
  // the sweep callback's world (the callback tests below): a fake clock, the stubs it reads
  _this: { dispatch_task: (name, fn) => (context.__captured[name] = fn) },
  __captured: {},
  _primary: true,
  navigator: { onLine: true },
  _items: () => context.__items,
  __items: [],
  merge: (a, b) => Object.assign(a, b),
  each: (xs, f) => xs.forEach(f),
  values: o => Object.values(o ?? {}),
  _extract_todo_snippet: () => '',
  Date: ClockDate,
  __now: null,
  crypto: { getRandomValues: a => a.fill(7) },
  Sortable: { dragged: null }, // the row of the pending press, as Sortable exposes it
  window: {}, // the app's seams (the wiki links rows install them)
  PointerEvent: class {}, // present: the grab follows the touch through pointer events
  _: { // lodash, as the app has it
    escape: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    unescape: s => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e])),
  },
}
vm.createContext(context)
const picked =
  pick([
    '_task_state',
    '_task_list',
    '_age',
    '_stats_suffix',
    '_age_title',
    '_wake_suffix',
    '_snippet_uses_suffix',
    '_todo_offset',
    '_set_marker',
    '_marker_of',
    '_link_marker',
    '_decorate_row',
    '_row_label',
    '_review_anchor_builder',
    '_without_log',
    '_link_urls',
    '_mark_tags',
    '_link_markdown_links',
    '_link_wiki',
    '_row_html',
    '_wire_row_links',
    '_extract_todo_snippet',
    '_todo_line',
    '_merged_order',
    '_suppress_touch_context_menu',
    '_order_blocked',
    '_order_save_step',
    '_sweep_step',
    '_corpus_current',
    '_resume_hold',
    '_held',
    '_on_welcome',
    '_unsnooze',
    '_sideways',
    '_grab_on_sideways_touch',
    '_delegated_view',
    '_clear_pending',
    '_rerender_todoer_widgets',
    '_task_target',
    '_command_target',
    '_delegate',
    '_on_command_delegate',
    '_delegate_text',
    '_delegate_created',
    '_wait_for_save',
    '_visible',
    '_on_command_notify',
    '_parse_notify',
    '_state_key',
    '_notify_step',
    '_notify_change',
    '_notification_of',
    '_notify_show',
    '_notify_click',
    '_notifier_parse',
    '_notifier_step',
    '_notifier_stored',
    '_claim_notifier',
    '_notifier_elected',
    '_release_notifier',
    '_start_notifier',
    '_parent_of',
    '_list_of',
    '_notify_children',
    '_scan_notify',
    '_on_global_store_change',
  ]).join('\n') +
  consts +
  src.match(/\nasync function _enqueue_command\([^\n]*\) \{[\s\S]*?\n\}\n/)[0]
vm.runInContext(picked, context)
const { _order_save_step, _sweep_step, _corpus_current, _resume_hold, _held, _on_welcome, _task_list, _age, _stats_suffix, _age_title, _wake_suffix, _set_marker, _marker_of, _link_marker, _decorate_row, _row_label, _review_anchor_builder, _extract_todo_snippet, _todo_line, _delegated_view, _enqueue_command, _merged_order, _order_blocked, _suppress_touch_context_menu, _sideways, _grab_on_sideways_touch, _on_command_delegate, _delegate_created, _wait_for_save, _link_urls, _on_command_notify, _parse_notify, _state_key, _notify_step, _notify_change, _notification_of, _notifier_parse, _notifier_step, _claim_notifier, _notifier_elected, _release_notifier, _start_notifier, _notify_children, _scan_notify, _on_global_store_change } = context
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
// projects (the vault's notes/design/mind_project_agent.md 2.4 and 4): a project asking, blocked or
// out of budget sits in the main list while agent-held; a bound child stays delegated when owner-held
check('an agent-held project asking: main', _task_list({ held: 'agent', reason: 'question', project: true, acked: {} }, null), 'main')
check('an agent-held project blocked: main', _task_list({ held: 'agent', reason: 'blocked', project: true, acked: {} }, null), 'main')
check('an agent-held project out of budget: main', _task_list({ held: 'agent', reason: 'budget', project: true, acked: {} }, null), 'main')
check('an agent-held project working: delegated', _task_list({ held: 'agent', reason: 'delegated', project: true, acked: {} }, null), 'delegated')
check('an agent-held task asking (no project): delegated', _task_list({ held: 'agent', reason: 'question', acked: {} }, null), 'delegated')
// a bound child (2.9): delegated while its parent can act, the main list in the two states only
// the owner can resolve: a proposal on a project without a standing /land, blocked after a final refusal
const lands = { standing_land: true }
check('an owner-held bound child proposing under a standing /land: delegated', _task_list({ held: 'owner', reason: 'proposal', parent: 'p1', acked: {} }, null, lands), 'delegated')
check('an owner-held bound child proposing with no standing /land: main', _task_list({ held: 'owner', reason: 'proposal', parent: 'p1', acked: {} }, null, { standing_land: false }), 'main')
check('an owner-held bound child proposing with no parent state yet: main', _task_list({ held: 'owner', reason: 'proposal', parent: 'p1', acked: {} }, null, null), 'main')
check('an owner-held bound child blocked after a final refusal: main', _task_list({ held: 'owner', reason: 'blocked', final: true, parent: 'p1', acked: {} }, null, lands), 'main')
check('an owner-held bound child blocked otherwise: delegated', _task_list({ held: 'owner', reason: 'blocked', final: false, parent: 'p1', acked: {} }, null, lands), 'delegated')
check('an owner-held bound child done or asking: delegated', [_task_list({ held: 'owner', reason: 'done', parent: 'p1', acked: {} }, null, null), _task_list({ held: 'owner', reason: 'question', parent: 'p1', acked: {} }, null, null)], ['delegated', 'delegated'])
check('an agent-held bound child: delegated whatever the parent', _task_list({ held: 'agent', reason: 'delegated', parent: 'p1', acked: {} }, null, { standing_land: false }), 'delegated')
check('an owner-held reclaimed child (no parent): main', _task_list({ held: 'owner', reason: 'taken', acked: {} }, null), 'main')
check('a pending take-back overlays a bound child', _task_list({ held: 'owner', reason: 'proposal', parent: 'p1', acked: {} }, { id: 'c9', kind: 'takeback' }), 'main')
check('a pending delegate overlays a project asking', _task_list({ held: 'agent', reason: 'question', project: true, acked: {} }, { id: 'c8', kind: 'delegate' }), 'delegated')

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
check('stats: a project\'s active children first', _stats_suffix({ workers: 5, cost: 41.2, children: 3 }), ' · 3c · 5w · $41.20')
check('stats: no active children, no count', _stats_suffix({ workers: 1, cost: 1, children: 0 }), ' · 1w · $1.00')
check('stats: cost alone', _stats_suffix({ workers: 0, cost: 0.333 }), ' · $0.33')
check('stats: cents round half-up as the vault format_cost (a bare toFixed gives $1.11)', _stats_suffix({ cost: 1.115 }), ' · $1.12')
check('stats: some unknown', _stats_suffix({ workers: 3, cost: 2, unknown: 1 }), ' · 3w · $2.00+?')
check('stats: only unknown', _stats_suffix({ workers: 1, cost: 0, unknown: 1 }), ' · 1w · $?')
// the subscription runtime's share (the vault's format_money twin): the chat footer's qualifier
check('stats: all on the subscription runtime', _stats_suffix({ workers: 2, cost: 14.5, sub: 14.5 }), ' · 2w · $14.50 (sub)')
check('stats: a part on the subscription runtime', _stats_suffix({ workers: 2, cost: 14.5, sub: 12.5 }), ' · 2w · $14.50 (sub $12.50)')
check('stats: all on the subscription runtime, some unknown', _stats_suffix({ cost: 14.5, unknown: 1, sub: 14.5 }), ' · $14.50+? (sub)')
check('stats: a part on the subscription runtime, some unknown', _stats_suffix({ cost: 14.5, unknown: 1, sub: 12.5 }), ' · $14.50+? (sub $12.50)')
check('stats: a share under a cent is none', _stats_suffix({ cost: 14.5, sub: 0.004 }), ' · $14.50')
check('stats: a remainder under a cent is all', _stats_suffix({ cost: 14.5, sub: 14.496 }), ' · $14.50 (sub)')
check('stats: only unknown carries no qualifier', _stats_suffix({ cost: 0, unknown: 1, sub: 0 }), ' · $?')
check('stats: an older projection without the share', _stats_suffix({ workers: 1, cost: 2 }), ' · 1w · $2.00')
check('age title: since', _age_title(now, { since: now - 60_000 }).split('\n').length, 2)
check('age title: no stats', _age_title(now, undefined).includes('\n'), false)
check('age title: unacknowledged', _age_title(undefined, undefined), 'not acknowledged yet')
check('age title: next wake', _age_title(now, undefined, now + 3_600_000).split('\n')[1].startsWith('next wake '), true)
// the wake suffix (the vault's project design 2.10): a project's next wake in the browser's local
// time, so a project between turns is told apart from one mid-turn; the rows pin the zone (`now` is
// 2023-11-14 22:13 UTC, 14:13 in Los Angeles): the day boundary is the LOCAL one
const tz = process.env.TZ
process.env.TZ = 'UTC'
check('wake: none', _wake_suffix(undefined, now), '')
check('wake: not a time', _wake_suffix('soon', now), '')
check('wake: later today', _wake_suffix(now + 3_600_000, now), ' · ⏰ 23:13')
check('wake: another day', _wake_suffix(now + 3 * 3_600_000, now), ' · ⏰ 11/15 01:13')
check('wake: due (rendered after the deadline)', _wake_suffix(now - 1000, now), ' · ⏰ due')
process.env.TZ = 'America/Los_Angeles'
check('wake: the local day, not the UTC one', _wake_suffix(now + 3 * 3_600_000, now), ' · ⏰ 17:13')
check('wake: another local day', _wake_suffix(now + 12 * 3_600_000, now), ' · ⏰ 11/15 02:13')
if (tz === undefined) delete process.env.TZ
else process.env.TZ = tz

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

// the marker's link (design 2.4, the presentation): a task row's marker word links its
// worktree's review in VS Code through the #vault item's ANCHOR builder (the real
// vault_review_anchor, evaluated in a stub of that item's scope as the app's eval would), over
// the row's html, only where the writer places the marker; the item text is never touched. The
// anchor is #vault's own, so a click on a marker takes the same path as a click on the #vault
// row's link: an inline click stop and no target, so the browser navigates in place and hands
// the vscode: url to the editor with no tab in between. That same inline onclick is what keeps
// the row's anchor pass off the anchor (DOM, untested)
const vault_src = fs.readFileSync(path.join(__dirname, '..', 'vault.md'), 'utf8')
const vault_ctx = vm.createContext({ _: context._ })
const vault_fn = name => vault_src.match(new RegExp(`\\nfunction ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}\\n`))[0]
const vault_arrow = name => vault_src.match(new RegExp(`\\nconst ${name} = [^\\n]*\\n[\\s\\S]*?\\n\\}\\n`))[0]
vm.runInContext(
  vault_src.match(/\nconst VAULT_EDITOR = [^\n]*\n/)[0] +
    vault_src.match(/\nconst VAULT_OPENER = [^\n]*\n/)[0] +
    vault_arrow('vault_last_turn_is_user') +
    ['vault_review_url', 'vault_review_anchor', 'vault_review_links'].map(vault_fn).join(''),
  vault_ctx
)
// the pending-request predicate over the grammar view (the vault's notes/design/mind_vault_item.md
// section 13): the last opener must be a user turn AND that turn must not be blank (the bridge's
// pending_turn rule: a fresh chat item's opener alone is no request; 2026-09-26)
const last_user = text => vm.runInContext(`vault_last_turn_is_user(${JSON.stringify(text)})`, vault_ctx)
check('pending: a user turn with text', last_user('#x/0 #_chat/vault\n<<user>> hi'), true)
check('pending: text on the lines after the opener', last_user('#x/0 #_chat/vault\n<<user>>\n\nhi there\n'), true)
check('pending: a blank last user turn (a fresh chat item) is no request', [last_user('#x/0 #_chat/vault\n<<user>> '), last_user('#x/0 #_chat/vault\n<<user>>\n\n'), last_user('<<user>> a\n<<agent>> b\n<<user>> ')], [false, false, false])
check('pending: a reply ends the request', last_user('<<user>> a\n<<agent(x)>> b'), false)
check('pending: an escaped mention is no opener', last_user('text with \\<<user>> inside'), false)
const vault_item = (bridge, evaluate = js => vm.runInContext(js, vault_ctx)) => ({ _global_store: { _bridge: bridge }, eval: evaluate })
const listing = { root: '/Users/olcan/vault', worktrees: { chat_a1: { item: 'i', commits: 2 } } }
const review = 'vscode-insiders://olcan.auto-open-obsidian/review?worktree=chat_a1&root=%2FUsers%2Folcan%2Fvault'
const title = 'chat_a1 · its changes against main in VS Code'
const anchor = word => `<a href="${review.replace('&', '&amp;')}" title="${title}" onclick="event.stopPropagation()">${word}</a>`
check('marker: suffix', _marker_of('#todo [proposal] fix the cache\n'), { word: 'proposal', suffix: true })
check('marker: prefix', _marker_of('… context\nfix the cache [question] #todo'), { word: 'question', suffix: false })
check('marker: a marker-only line', _marker_of('#todo [done]\n'), { word: 'done', suffix: true })
check('marker: none (the owner removed it)', _marker_of('#todo fix the cache\n'), null)
check('marker: a bracketed word elsewhere is not the marker', [_marker_of('#todo fix [x] the cache\n'), _marker_of('[x] fix the cache #todo'), _marker_of('#todo  [x] fix\n')], [null, null, null])
check('marker: the writer\'s slot whatever follows the brackets (as _set_marker replaces it; a markdown link there is left to the html pass below)', [_marker_of('#todo [x](y) fix\n'), _set_marker('#todo [x](y) fix\n', 'working')], [{ word: 'x', suffix: true }, '#todo [working](y) fix\n'])
context._item = ref => (ref == '#vault' ? vault_item(listing) : null)
const build = _review_anchor_builder()
check('builder: the #vault item\'s review anchor for a worktree the listing names, over the root it carries', [typeof build, build('chat_a1', 'proposal', title)], ['function', anchor('proposal')])
check('builder: a worktree the listing does not name (retired, or not listed yet) gets none', build('chat_gone', 'proposal', title), null)
listing.worktrees['..'] = {}
check('builder: the vault\'s name grammar', build('..', 'proposal', title), null)
delete listing.worktrees['..']
context._item = () => vault_item({ worktrees: listing.worktrees })
check('builder: a listing without the root (an older bridge)', _review_anchor_builder(), null)
context._item = () => vault_item({ root: '/r' })
check('builder: a listing without worktrees names none', _review_anchor_builder()('chat_a1', 'proposal', title), null)
context._item = () => null
check('builder: no #vault item', _review_anchor_builder(), null)
context._item = () => vault_item(listing, () => undefined)
check('builder: an older #vault without the builder', _review_anchor_builder(), null)
context._item = () => vault_item(listing, () => Promise.resolve(() => 'x'))
check('builder: an async #vault answers with a promise, not the function', _review_anchor_builder(), null)
context._item = () => vault_item(listing, () => { throw new Error('eval missing dependencies: x') })
check('builder: a #vault that cannot evaluate', _review_anchor_builder(), null)
delete context._item
const slot = word => `[${anchor(word)}]`
// the row's decorations (the vault's project design 2.7): the marker is linked FIRST and a
// child's ↳ prefix added after it, so a bound child's proposal keeps its review link (review 5
// B2: the prefix ahead of the link broke the suffix branch's row-start match); no worktree, no
// link; no parent, no prefix; the anchor builder is #vault's, given the worktree and the word
const builder = (worktree, word, tip) => (worktree == 'chat_x_1' && tip.startsWith('chat_x_1 · ') ? anchor(word) : null)
check('decorate: a child with a suffix marker and a worktree keeps its review link behind the prefix', _decorate_row('<mark>#todo</mark> [proposal] fix', '#todo [proposal] fix', { worktree: 'chat_x_1' }, builder, 'the parent'), `↳ <mark>#todo</mark> ${slot('proposal')} fix`)
check('decorate: a child in prefix mode', _decorate_row('fix [question] <mark>#todo</mark>', 'fix [question] #todo', { worktree: 'chat_x_1' }, builder, 'the parent'), `↳ fix ${slot('question')} <mark>#todo</mark>`)
check('decorate: a child without a worktree gets the prefix and no link', _decorate_row('<mark>#todo</mark> [question] fix', '#todo [question] fix', { worktree: null }, builder, 'the parent'), '↳ <mark>#todo</mark> [question] fix')
check('decorate: an ordinary task links without a prefix', _decorate_row('<mark>#todo</mark> [proposal] fix', '#todo [proposal] fix', { worktree: 'chat_x_1' }, builder, null), `<mark>#todo</mark> ${slot('proposal')} fix`)
check('decorate: no builder (no #vault item), no link', _decorate_row('<mark>#todo</mark> [proposal] fix', '#todo [proposal] fix', { worktree: 'chat_x_1' }, null, 'the parent'), '↳ <mark>#todo</mark> [proposal] fix')
// a named item's label first, as a tag mark, behind a child's prefix and ahead of the linked marker
check('decorate: a named item\'s label ahead of the linked marker', _decorate_row('<mark>#todo</mark> [proposal] fix', '#todo [proposal] fix', { worktree: 'chat_x_1' }, builder, null, '#Proj'), `<mark>#Proj</mark> <mark>#todo</mark> ${slot('proposal')} fix`)
check('decorate: a named child: the prefix, the label, the row', _decorate_row('<mark>#todo</mark> [proposal] fix', '#todo [proposal] fix', { worktree: 'chat_x_1' }, builder, 'the parent', '#Proj'), `↳ <mark>#Proj</mark> <mark>#todo</mark> ${slot('proposal')} fix`)
check('decorate: a named item in prefix mode', _decorate_row('fix [question] <mark>#todo</mark>', 'fix [question] #todo', { worktree: 'chat_x_1' }, builder, null, '#Proj'), `<mark>#Proj</mark> fix ${slot('question')} <mark>#todo</mark>`)
// the label a row shows first (_row_label): the app's name is the unique label (item.label, the
// case-preserving text) or the id reference; dropped when the row already starts with it as a
// whole tag (a prefix snippet from the text's start, the label #todo of a lone #todo item)
const named = (label, name = label) => ({ id: 'i1', label, name })
check('label: a named item in suffix mode', _row_label(named('#Proj'), '#todo fix the cache'), '#Proj')
check('label: an unnamed item (its label shared)', _row_label(named('#todo', 'id:i1'), '#todo twin one'), null)
check('label: an item without a label', _row_label(named('', 'id:i1'), 'fix #todo'), null)
check('label: a prefix snippet that begins with the label', _row_label(named('#Proj'), '#Proj fix the cache #todo'), null)
check('label: the label #todo of a lone #todo item', _row_label(named('#todo'), '#todo twin one'), null)
check('label: a truncated prefix snippet', _row_label(named('#proj'), '… the cache #todo'), '#proj')
check('label: a longer tag at the start is not the label', _row_label(named('#proj'), '#project fix #todo'), '#proj')
check('label: the label followed by punctuation', _row_label(named('#proj'), '#proj, fix #todo'), null)
check('label: the label alone', _row_label(named('#proj'), '#proj'), null)
check('label: the text\'s case decides nothing', _row_label(named('#Proj'), '#proj fix #todo'), null)
check('link: suffix, the anchor wraps the word on the tag\'s mark; brackets, the rest of the row, and a bracketed word in the text kept', _link_marker('<mark>#todo</mark> [proposal] fix the <a>https://x.y/z</a> [x] cache', { word: 'proposal', suffix: true }, anchor('proposal')), `<mark>#todo</mark> ${slot('proposal')} fix the <a>https://x.y/z</a> [x] cache`)
check('link: prefix, the anchor replaces the marker at the row\'s end and the rest is kept verbatim (the leading &lrm; is just such text here: the widget prepends its own after this pass)', _link_marker('&lrm;fix the [x] cache [question] <mark>#todo</mark>', { word: 'question', suffix: false }, anchor('question')), `&lrm;fix the [x] cache ${slot('question')} <mark>#todo</mark>`)
check('link: a marker-only row (the collapsed newline after it kept)', _link_marker('<mark>#todo</mark> [done] ', { word: 'done', suffix: true }, anchor('done')), `<mark>#todo</mark> ${slot('done')} `)
check('link: the slot is on the mark, which owner text cannot produce (escaped), nor a marker the markdown pass consumed', [
  _link_marker('&lt;mark&gt;#todo&lt;/mark&gt; [proposal] fix', { word: 'proposal', suffix: true }, anchor('proposal')),
  _link_marker('fix [question] &lt;mark&gt;#todo&lt;/mark&gt;', { word: 'question', suffix: false }, anchor('question')),
  _link_marker('<mark>#todo</mark> <a href="y">x</a> fix', { word: 'x', suffix: true }, anchor('x')),
], ['&lt;mark&gt;#todo&lt;/mark&gt; [proposal] fix', 'fix [question] &lt;mark&gt;#todo&lt;/mark&gt;', '<mark>#todo</mark> <a href="y">x</a> fix'])
check('link: the url and the title are attribute-escaped, by the #vault builder that writes the anchor', vm.runInContext('vault_review_anchor(\'chat_a1\', \'/r"x&y\', \'review\', \'done\', \'w · <t>\')', vault_ctx), '<a href="vscode-insiders://olcan.auto-open-obsidian/review?worktree=chat_a1&amp;root=%2Fr%22x%26y" title="w · &lt;t&gt;" onclick="event.stopPropagation()">done</a>')
check('link: one builder for both views — the marker\'s anchor IS the anchor #vault\'s own proposals row links the worktree with (the same click path), the tooltip aside', [build('chat_a1', 'chat_a1'), vm.runInContext("vault_review_links('chat_a1', '/Users/olcan/vault')", vault_ctx).split(' · ')[0]], [anchor('chat_a1').replace(` title="${title}"`, ''), anchor('chat_a1').replace(` title="${title}"`, '')])
const linked = _link_marker('<mark>#todo</mark> [proposal] fix', { word: 'proposal', suffix: true }, anchor('proposal'))
check('link: the inline click stop and no target or rel, so the vscode: url opens in place with no tab in between (and the row\'s anchor pass, which keys on an inline onclick, leaves it alone)', [/\btarget=|\brel=/.test(linked), linked.includes('onclick="event.stopPropagation()"'), linked.includes(`href="${review.replace('&', '&amp;')}"`)], [false, true, true])

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

// the row's url linkifier over the ESCAPED html the row renders (2026-09-20): a closing quote
// arrives as `&quot;`, whose letters and `;` pass the url classes, so the whole entity used to
// ride into the link; a real `&` in a query string (`&amp;`) must still stay inside the url.
// `_replace_tags` here replaces over the raw text with the app's tag delimiter appended, as the
// real helper does (it also skips code blocks and html, which these rows do not exercise)
{
  const prev = context._replace_tags
  const delimiter = /(?=[\s<>&?!,.;:"'`(){}\[\]]|$)/.source // tagRegexDelimiter in util.js
  context._replace_tags = (text, pattern, fn) => text.replace(new RegExp(pattern.source + delimiter, 'g'), fn)
  const link = text => _link_urls(text)
  check(
    'row: an escaped closing quote is not part of the url',
    link('#todo Rafal Wilinski on X: &quot;Jev is now in charge of this account&#39;s humor https://t.co/ojSOHeMFT2&quot; / X'),
    '#todo Rafal Wilinski on X: &quot;Jev is now in charge of this account&#39;s humor <a>https://t.co/ojSOHeMFT2</a>&quot; / X'
  )
  check('row: an escaped angle bracket ends the url', link('see https://example.com/a&lt;b end'), 'see <a>https://example.com/a</a>&lt;b end')
  check('row: an escaped ampersand stays inside the url', link('see https://example.com/q?a=1&amp;b=2 end'), 'see <a>https://example.com/q?a=1&amp;b=2</a> end')
  check('row: a trailing entity is kept whole', link('see https://example.com/a&amp;'), 'see <a>https://example.com/a&amp;</a>')
  check('row: an escaped apostrophe ends the url', link('on X: &#39;humor https://t.co/x&#39; / X'), 'on X: &#39;humor <a>https://t.co/x</a>&#39; / X')
  check('row: a numeric escaped quote ends the url', link('see https://example.com/a&#34;b end'), 'see <a>https://example.com/a</a>&#34;b end')
  check('row: trailing punctuation stays out of the url', link('see https://example.com/a, end'), 'see <a>https://example.com/a</a>, end')
  context._replace_tags = prev
}

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
// the child-customization hook (the vault's notes/design/mind_task_chat.md, section 3): the
// todoer's js_init block defines window._customize_child, which the app calls with the creation
// parent (an _Item handle) and the allocated child text and appends the returned string after
// the label. Evaluated from todoer.md's block under a stub app whose items carry the app's REAL
// dependency semantics (ids in dependency order, the #chat root first for a chat item; a label
// prefix alone is a dependency only where the app's autodep rules make it one), its label form
// (with the #) and its tag views (the hiding underscore dropped); the vault route is the app's
// grammar predicate (stubbed: an #_agent/vault tag in the text)
const init_src = fs.readFileSync(path.join(__dirname, '..', 'todoer.md'), 'utf8').match(/```js:js_init_removed\n([\s\S]*?)\n```/)[1]
const corpus = {} // id -> {id, label, text, tags, tags_hidden, dependencies}
const lookups = { count: 0 }
const by_label = label => Object.values(corpus).filter(item => item.label == label)
const warned = []
const init_ctx = vm.createContext({
  console: { warn: (...args) => warned.push(args.join(' ')) },
  window: { _grammar: { routed: text => /(^|\s)#_agent\/vault(\s|$)/.test(text) } },
  _exists: (ref, multiple = true) => (multiple ? by_label(ref).length > 0 : by_label(ref).length == 1),
  _item: ref => {
    lookups.count++
    if (corpus[ref]) return corpus[ref]
    const found = by_label(ref)
    return found.length == 1 ? found[0] : null // ambiguous or missing: null (the app logs)
  },
})
vm.runInContext(init_src + '\n_init()', init_ctx)
const customize = init_ctx.window._customize_child
const define = (id, label, text, dependencies, tags = []) => {
  const all = [label, ...text.split(/\s+/).filter(w => w.startsWith('#') && w != label).map(t => t.replace(/^#_/, '#'))]
  const hidden = text.split(/\s+/).filter(w => w.startsWith('#_')).map(t => t.replace(/^#_/, '#'))
  corpus[id] = { id, label, text, tags: [...new Set([...all, ...tags])], tags_hidden: hidden, dependencies }
  return corpus[id]
}
const reset = () => {
  for (const id of Object.keys(corpus)) delete corpus[id]
  lookups.count = 0
}
const chat = () => define('chat', '#chat', '#chat #_autodep', [])
const vault = () => define('chat_vault', '#chat/vault', '#chat/vault #_agent/vault', ['chat'])
check('hook: defined by _init', typeof customize, 'function')
reset()
check('hook: a child of a #todo becomes a task chat (the route tag and #_autodep, the first user turn)', customize(define('work', '#work', '#work #todo fix', []), '#work/0 '), ' #_chat/vault #_autodep\n<<user>> ')
reset(); chat(); vault()
const task_chat = define('work0', '#work/0', '#work/0 #_chat/vault #_autodep <<user>> hi', ['chat', 'chat_vault'])
check('hook: a child of a task chat (an autodep carrier) continues it with the turn alone (the app makes the dependency)', customize(task_chat, '#work/0/0 '), '\n<<user>> ')
const continued = define('work00', '#work/0/0', '#work/0/0 <<user>> more', ['chat', 'chat_vault', 'work0'])
check('hook: a continuation\'s child continues it (the walk through the autodep prefix; the carrier two levels up)', customize(continued, '#work/0/0/0 '), '\n<<user>> ')
const legacy_chat = define('legacy0', '#legacy/0', '#legacy/0 #_chat/vault <<user>> hi', ['chat', 'chat_vault'])
check('hook: a child of a task chat made BEFORE the tag names its parent (no autodep ancestor)', customize(legacy_chat, '#legacy/0/0 '), ' #_legacy/0\n<<user>> ')
const legacy_continued = define('legacy00', '#legacy/0/0', '#legacy/0/0 #_legacy/0 <<user>> more', ['chat', 'chat_vault', 'legacy0'])
check('hook: a continuation\'s child continues it (the walk through the hidden tag)', customize(legacy_continued, '#legacy/0/0/0 '), ' #_legacy/0/0\n<<user>> ')
check('hook: an ordinary item under a legacy chat by label prefix alone (no dependency) gets nothing', customize(define('plain', '#legacy/0/plain', '#legacy/0/plain notes', []), '#legacy/0/plain/0 '), null)
check('hook: an item under an autodep chat by label prefix (the app\'s dependency) is a chat by dependency: its child continues', customize(define('plain2', '#work/0/plain', '#work/0/plain notes', ['chat', 'chat_vault', 'work0']), '#work/0/plain/0 '), '\n<<user>> ')
define('chat_gpt', '#chat/gpt', '#chat/gpt', ['chat'])
check('hook: a chat of another route under a legacy vault chat\'s label gets nothing (under an autodep chat the app would add the chat too: two direct parents, nothing either)', [customize(define('gpt', '#legacy/0/gpt', '#legacy/0/gpt #_chat/gpt <<user>> q', ['chat', 'chat_gpt']), '#legacy/0/gpt/0 '), customize(define('gpt2', '#work/0/gpt', '#work/0/gpt #_chat/gpt <<user>> q', ['chat', 'chat_vault', 'work0', 'chat_gpt']), '#work/0/gpt/0 ')], [null, null])
const conversation = define('conv', '#conversation', '#conversation #_chat/vault <<user>> a', ['chat', 'chat_vault'])
check('hook: a continuation named by a hidden tag without a slash continues', customize(define('followup', '#followup', '#followup #_conversation <<user>> b', ['chat', 'chat_vault', 'conv']), '#followup/0 '), ' #_followup\n<<user>> ')
check('hook: the stock /vault chat (an #_agent/vault route, under #chat/vault by autodep) continues with the turn alone (the #chat root carries the tag)', customize(define('cv0', '#chat/vault/0', '#chat/vault/0 #_agent/vault <<user>> c', ['chat', 'chat_vault']), '#chat/vault/0/0 '), '\n<<user>> ')
check('hook: an automatic-prefix continuation (the app\'s autodep dependency, no tag) continues', customize(define('cv00', '#chat/vault/0/0', '#chat/vault/0/0 <<user>> d', ['chat', 'chat_vault', 'cv0']), '#chat/vault/0/0/0 '), '\n<<user>> ')
let last = task_chat
for (let n = 1; n <= 12; n++) last = define(`deep${n}`, `${last.label}/0`, `${last.label}/0 #_${last.label.slice(1)} <<user>> ${n}`, [...last.dependencies, last.id])
lookups.count = 0
check('hook: repeated continuations by this very hook keep continuing (no depth cap; each item once, the label prefixes once more for the autodep carrier)', [customize(last, `${last.label}/0 `), lookups.count <= 32], ['\n<<user>> ', true])
last = define('deep99', `${last.label}/0`, `${last.label}/0 #_${last.label.slice(1)} <<user>> n`, [...last.dependencies, last.id])
for (let n = 100; n < 170; n++) last = define(`deep${n}`, `${last.label}/0`, `${last.label}/0 #_${last.label.slice(1)} <<user>> ${n}`, [...last.dependencies, last.id])
check('hook: a lineage past the lookup bound gets nothing (logged, never a long synchronous walk)', [customize(last, `${last.label}/0 `), warned.length, /more than 64 lookups/.test(warned[0] ?? '')], [null, 1, true])
warned.length = 0
const long_label = '#' + Array.from({ length: 70 }, (_, i) => 'seg' + i).join('/')
const short_lineage = define('longlbl', long_label, `${long_label} #_chat/vault <<user>> h`, ['chat', 'chat_vault'])
lookups.count = 0
check('hook: a short lineage under a label of 70 segments: the ancestor walk exhausts the SHARED bound, warns once, and the parent is named explicitly (the binding kept)', [customize(short_lineage, `${long_label}/0 `), warned.length, /label ancestors/.test(warned[0] ?? ''), lookups.count <= 64], [` #_${long_label.slice(1)}\n<<user>> `, 1, true, true])

check('hook: two direct chat parents are ambiguous: nothing', customize(define('amb', '#amb', '#amb #_work/0 #_conversation <<user>> e', ['chat', 'chat_vault', 'work0', 'conv']), '#amb/0 '), null)
// a routed item naming another chat beside its prefix chat continues the NAMED one (parent tags,
// 2026-09-28: the tag wins over the prefix; this shape was the ambiguity of review 22 B1), so its
// child continues it, and a continuation of it names it (a root label: no autodep ancestor); two
// tag-named chats stay the ambiguity, for the item and for a continuation below it
delete corpus.cv0 // the stock chat's fixture shares this label: one item per label, as the app resolves a hidden reference
const routed_tagged = define('cv0amb', '#chat/vault/0', '#chat/vault/0 #_agent/vault #_conversation <<user>> f', ['chat', 'chat_vault', 'conv'])
check('hook: a routed item naming a chat beside its prefix chat continues the named one: its child continues', customize(routed_tagged, '#chat/vault/0/0 '), '\n<<user>> ')
check('hook: a continuation of it names it (no autodep ancestor of a root label)', customize(define('cvamb0', '#cvamb0', '#cvamb0 #_chat/vault/0 <<user>> g', ['chat', 'chat_vault', 'conv', 'cv0amb']), '#cvamb0/0 '), ' #_cvamb0\n<<user>> ')
const routed_amb = define('cv0amb2', '#chat/vault/two', '#chat/vault/two #_agent/vault #_conversation #_chat/gpt <<user>> f', ['chat', 'chat_vault', 'conv', 'chat_gpt'])
check('hook: a routed item with two tag-named chats gets nothing', customize(routed_amb, '#chat/vault/two/0 '), null)
check('hook: a continuation whose ancestor is ambiguous gets nothing', customize(define('cvamb2', '#cvamb2', '#cvamb2 #_chat/vault/two <<user>> g', ['chat', 'chat_vault', 'conv', 'chat_gpt', 'cv0amb2']), '#cvamb2/0 '), null)
delete corpus.cv0amb
check('hook: a chat whose lineage never reaches a route (a vault chat item deleted) gets nothing', (delete corpus.chat_vault, customize(task_chat, '#work/0/0 ')), null)
vault()
reset(); chat(); vault()
const loop_a = define('la', '#la', '#la #_lb <<user>> x', ['chat', 'chat_vault', 'lb'])
define('lb', '#lb', '#lb #_la <<user>> y', ['chat', 'chat_vault', 'la'])
lookups.count = 0
check('hook: a cycle ends the walk (visited), within a few lookups', [customize(loop_a, '#la/0 '), lookups.count <= 8], [null, true])
reset(); chat(); vault()
const labels = ['#m1', '#m2', '#m3', '#m4', '#m5']
for (const [i, label] of labels.entries()) define(`m${i + 1}`, label, `${label} ${labels.filter(l => l != label).map(l => '#_' + l.slice(1)).join(' ')} <<user>> z`, ['chat', 'chat_vault', ...labels.filter(l => l != label).map(l => `m${labels.indexOf(l) + 1}`)])
lookups.count = 0
check('hook: a mesh of cross-references is bounded (ambiguous at the first step, each item looked up once)', [customize(corpus.m1, '#m1/0 '), lookups.count <= 7], [null, true])
// the bound met mid-scan with a parent already found (review 22 B2): the scan stops at once,
// the provisional parent is discarded, nothing is written, one warning
warned.length = 0
reset(); chat(); vault()
const later = define('later', '#later', '#later #_chat <<user>> h', ['chat'])
const fillers = Array.from({ length: 62 }, (_, i) => define(`u${i}`, `#u${i}`, `#u${i} filler`, []))
const heavy = define('heavy', '#heavy', `#heavy #_chat/vault ${fillers.map(f => '#_' + f.label.slice(1)).join(' ')} #_later <<user>> i`, ['chat', 'chat_vault', ...fillers.map(f => f.id), 'later'])
lookups.count = 0
check('hook: the bound met with a parent in hand decides nothing (one warning, the scan cut short)', [customize(heavy, '#heavy/0 '), warned.length, lookups.count <= 64], [null, 1, true])
// parent tags (2026-09-28): a renamed node (`#p/plan-b #_p/0/0`) sits under its tag parent in
// the app's tree; the item view's `ancestors` carries that ancestry, and the hook's ancestor
// walk follows it, so a child of the renamed node continues with the turn alone; the chat
// parent prefers the tag-named chat over the prefix chat
reset(); chat(); vault()
const renamed_root = define('rp0', '#rp/0', '#rp/0 #_chat/vault #_autodep <<user>> hi', ['chat', 'chat_vault'])
const renamed_mid = define('rp00', '#rp/0/0', '#rp/0/0 <<user>> more', ['chat', 'chat_vault', 'rp0'])
const renamed = define('rpb', '#rp/plan-b', '#rp/plan-b #_rp/0/0 <<user>> plan', ['chat', 'chat_vault', 'rp0', 'rp00'])
renamed.ancestors = ['#rp/0/0', '#rp/0', '#rp']
lookups.count = 0
check('hook: a child of a renamed node continues it with the turn alone (the carrier reached through the tag parent)', [customize(renamed, '#rp/plan-b/0 '), lookups.count <= 8], ['\n<<user>> ', true])
const renamed_child = define('rpb0', '#rp/plan-b/0', '#rp/plan-b/0 <<user>> next', ['chat', 'chat_vault', 'rp0', 'rp00', 'rpb'])
renamed_child.ancestors = ['#rp/plan-b', '#rp/0/0', '#rp/0', '#rp']
check('hook: a tag-free child of a renamed node continues too (its ancestry through the splice)', customize(renamed_child, '#rp/plan-b/0/0 '), '\n<<user>> ')
const competing = define('rp0b', '#rp/0/plan-b', '#rp/0/plan-b #_rp/0/0 <<user>> plan', ['chat', 'chat_vault', 'rp0', 'rp00'])
competing.ancestors = ['#rp/0/0', '#rp/0', '#rp']
check('hook: a tag-named chat beside the prefix chat is the parent (the lineage resolves, no ambiguity)', customize(competing, '#rp/0/plan-b/0 '), '\n<<user>> ')
const two_tags = define('rp2', '#rp/two', '#rp/two #_rp/0/0 #_rp/0 <<user>> both', ['chat', 'chat_vault', 'rp0', 'rp00'])
two_tags.ancestors = ['#rp']
check('hook: two tag-named chats stay the ambiguity: nothing', customize(two_tags, '#rp/two/0 '), null)
const no_view = define('rp0x', '#rp/0/x', '#rp/0/x <<user>> x', ['chat', 'chat_vault', 'rp0'])
check('hook: an app without the ancestors view: the label prefixes alone, as before', customize(no_view, '#rp/0/x/0 '), '\n<<user>> ')
reset()
check('hook: any other parent is left to the app', [customize(define('notes', '#notes', '#notes plain', []), '#notes/0 '), customize(null, '#x/0 '), customize(define('work2', '#work2', '#work2 #todo', []), null)], [null, null, null])

// ---- desktop notifications (the vault's design notes/design/mind_task_agents.md 2.7, 2026-10-03) ----
const NOTIFY_REASONS = vm.runInContext('NOTIFY_REASONS', context)
const NOTIFIER_KEY = vm.runInContext('NOTIFIER_KEY', context)
const NOTIFIER_STALE_MS = vm.runInContext('NOTIFIER_STALE_MS', context)
const NOTIFIER_REFRESH_MS = vm.runInContext('NOTIFIER_REFRESH_MS', context)
// the words of /notify
check('notify words: none is the status', _parse_notify(''), { status: true })
check('notify words: on alone is the attention set', _parse_notify('on'), { on: true, reasons: ['question', 'blocked', 'proposal', 'budget'] })
check('notify words: on with reasons, deduplicated', _parse_notify('on done question question'), { on: true, reasons: ['done', 'question'] })
check('notify words: on all', _parse_notify('on all done').reasons, NOTIFY_REASONS)
check('notify words: an unknown reason', _parse_notify('on soon').error.startsWith('unknown reason soon ('), true)
check('notify words: an unknown word beside all is refused too', _parse_notify('on all typo').error.startsWith('unknown reason typo ('), true)
check('notify words: off and test', [_parse_notify('off'), _parse_notify(' test ')], [{ off: true }, { test: true }])
check('notify words: off takes no words', _parse_notify('off now').error, 'off takes no words')
check('notify words: an unknown word', _parse_notify('maybe').error.startsWith('unknown word maybe ('), true)
// the key: possession, reason and epoch; a stats refresh, a repair or the widget's save changes none
check('key: no projection', _state_key(null), '')
check('key: the facts (a projection from an older bridge: no count)', _state_key({ held: 'owner', reason: 'question', epoch: 3, rev: 9, updated: 1 }), 'owner:question:3:')
check('key: the count of resurfacings', _state_key({ held: 'agent', reason: 'question', epoch: 1, surfaced: 2, project: true }), 'agent:question:1:2')
check('key: a stats refresh keeps it', _state_key({ held: 'agent', reason: 'delegated', epoch: 1, rev: 2, surfaced: 1, stats: { cost: 1 } }), _state_key({ held: 'agent', reason: 'delegated', epoch: 1, rev: 3, surfaced: 1, stats: { cost: 2 } }))
check('key: a project\'s second question under one epoch differs by the count alone', _state_key({ held: 'agent', reason: 'question', epoch: 1, surfaced: 1 }) != _state_key({ held: 'agent', reason: 'question', epoch: 1, surfaced: 2 }), true)
// the step
const notify_setting = { reasons: ['question', 'blocked'] }
const notify_step = over => _notify_step({ setting: notify_setting, prev: 'agent:delegated:0', key: 'owner:question:1', list: 'main', reason: 'question', permission: 'granted', ...over })
check('step: a change into an enabled reason in the main list notifies', notify_step({}), 'notify')
check('step: off without a setting or without reasons', [notify_step({ setting: null }), notify_step({ setting: { reasons: [] } })], ['off', 'off'])
check('step: an unchanged key', notify_step({ prev: 'owner:question:1' }), 'unchanged')
check('step: a first sight is a change', notify_step({ prev: undefined }), 'notify')
check('step: the delegated list', notify_step({ list: 'delegated' }), 'not in the main list')
check('step: a reason not enabled, no reason', [notify_step({ reason: 'done' }), notify_step({ reason: undefined, key: '' })], ['reason done', 'reason none'])
check('step: the permission last (the cause the owner can act on)', [notify_step({ permission: 'default' }), notify_step({ permission: 'denied', list: 'delegated' })], ['permission default', 'not in the main list'])
// the notification's facts: the reason first, the row's text without the tag and the marker
check('facts: a suffix snippet, a labelled item', _notification_of({ reason: 'question', shown: '#todo [question] fix the cache reverts on a returning device', label: '#e2e_task', parent: null, id: 's1' }), { title: '[question] fix the cache reverts on a returning device', options: { body: '#e2e_task', tag: 'todoer:s1', renotify: true, requireInteraction: true, icon: '/favicon.ico' } })
check('facts: a prefix snippet, no label, a child', _notification_of({ reason: 'done', shown: 'fix the cache [done] #todo', label: null, parent: '#todo the project', id: 's2' }), { title: '[done] fix the cache', options: { body: 'child of #todo the project', tag: 'todoer:s2', renotify: true, requireInteraction: false, icon: '/favicon.ico' } })
check('facts: a long text is shortened', _notification_of({ reason: 'blocked', shown: '#todo ' + 'x'.repeat(100), label: null, parent: null, id: 's3' }).title, '[blocked] ' + 'x'.repeat(79) + '…')
check('facts: the owner\'s own bracketed word elsewhere stays', _notification_of({ reason: 'budget', shown: '#todo [budget] [x] fix', label: null, parent: null, id: 's4' }).title, '[budget] [x] fix')
// the election (the device's windows share localStorage)
const me = 'tab-me'
check('election: no record is vacant', _notifier_step({ record: null, me, now: 1000 }), 'vacant')
check('election: an unreadable record is none', [_notifier_parse('{'), _notifier_parse('{"id":"x"}'), _notifier_parse(null), _notifier_parse('{"id":"x","time":5}')], [null, null, null, { id: 'x', time: 5 }])
check('election: an own fresh record', _notifier_step({ record: { id: me, time: 1000 }, me, now: 1000 + 60_000 }), 'me')
check('election: another window\'s fresh record', _notifier_step({ record: { id: 'tab-other', time: 1000 }, me, now: 1000 + 60_000 }), 'other')
check('election: a stale record is vacant (a closed or discarded window)', _notifier_step({ record: { id: 'tab-other', time: 1000 }, me, now: 1000 + NOTIFIER_STALE_MS }), 'vacant')
check('election: a stale own record too', _notifier_step({ record: { id: me, time: 1000 }, me, now: 1000 + NOTIFIER_STALE_MS + 1 }), 'vacant')
// the claims over a fake storage, the clock frozen
const storage = new Map()
context.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }
context._command_id = () => 'tab-me' // this window's id (cached by _notifier_id)
context.__now = 10_000
check('claim: a vacant election is claimed', [_claim_notifier(), JSON.parse(storage.get(NOTIFIER_KEY))], [true, { id: 'tab-me', time: 10_000 }])
context.__now = 10_000 + 30_000
check('claim: an own fresh record is left alone (no stamp per keystroke)', [_claim_notifier(), JSON.parse(storage.get(NOTIFIER_KEY)).time], [true, 10_000])
context.__now = 10_000 + NOTIFIER_REFRESH_MS
check('claim: an own record past the spacing is refreshed', [_claim_notifier(), JSON.parse(storage.get(NOTIFIER_KEY)).time], [true, 10_000 + NOTIFIER_REFRESH_MS])
storage.set(NOTIFIER_KEY, JSON.stringify({ id: 'tab-other', time: context.__now }))
check('elected: another window holds it', _notifier_elected(), false)
check('claim: a gesture takes it over', [_claim_notifier(), JSON.parse(storage.get(NOTIFIER_KEY)).id], [true, 'tab-me'])
check('elected: the holder', _notifier_elected(), true)
storage.set(NOTIFIER_KEY, JSON.stringify({ id: 'tab-other', time: context.__now - NOTIFIER_STALE_MS }))
check('heartbeat: refreshes an own record only', [_claim_notifier(true), JSON.parse(storage.get(NOTIFIER_KEY)).id], [false, 'tab-other'])
check('elected: a stale record is taken over', [_notifier_elected(), JSON.parse(storage.get(NOTIFIER_KEY)).id], [true, 'tab-me'])
check('release: the own record is removed', [_release_notifier(), storage.has(NOTIFIER_KEY)], [true, false])
check('release: nothing to release', _release_notifier(), false)
storage.set(NOTIFIER_KEY, JSON.stringify({ id: 'tab-other', time: context.__now }))
check('release: another window\'s record stays', [_release_notifier(), storage.has(NOTIFIER_KEY)], [false, true])
storage.clear()
context.localStorage = { getItem: () => { throw new Error('no storage') }, setItem: () => { throw new Error('no storage') }, removeItem: () => { throw new Error('no storage') } }
check('without storage: every window notifies, claims and releases nothing', [_notifier_elected(), _claim_notifier(), _release_notifier()], [true, false, false])
context.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) }
// THE CHANGE DETECTION with the world stubbed: a fake Notification records what is shown, the
// click's effects are captured (the welcome's baseline, the hook's and the render's calls)
const notified = []
class FakeNotification {
  static permission = 'granted'
  constructor(title, options) {
    this.title = title
    this.options = options
    notified.push(this)
  }
  close() {
    this.closed = true
  }
}
context.Notification = FakeNotification
context.MindBox = { set: (...args) => (context.__mindbox = args) }
context.window.focus = () => (context.__focused = (context.__focused ?? 0) + 1)
context.window.addEventListener = () => {}
context.document = { addEventListener: () => {}, hasFocus: () => false }
context._todoer.dispatch_task = (name, fn) => (context.__captured[name] = fn)
context._todoer._global_store = { notify: { reasons: ['question', 'blocked', 'proposal', 'budget'] } }
const todo = (id, state, text = '#todo fix the cache\nmore') => ({ id, saved_id: 's' + id, name: '#t' + id, label: null, tags: ['#todo'], read: () => text, _global_store: state ? { _agent: { state } } : {} })
context.__todos = {}
context._item = ref => context.__todos[ref] ?? null
check('change: before the welcome nothing notifies (the baseline is pending)', _notify_change(todo('a', { held: 'owner', reason: 'question', epoch: 1 })), 'baseline')
context.__items = [todo('a', { held: 'owner', reason: 'question', epoch: 1 }), todo('b', null)]
_start_notifier()
check('welcome: the baseline records every todo\'s key and list, the minute task is dispatched', [context._todoer.store.notify_seen, typeof context.__captured.notifier], [{ a: 'owner:question:1:|main', b: '|main' }, 'function'])
check('change: a baseline state notifies nothing', _notify_change(todo('a', { held: 'owner', reason: 'question', epoch: 1 })), 'unchanged')
check('change: a delegation (the delegated list) notifies nothing', _notify_change(todo('a', { held: 'agent', reason: 'delegated', epoch: 1 })), 'not in the main list')
check('change: the hand-back notifies from the elected window', [_notify_change(todo('a', { held: 'owner', reason: 'question', epoch: 2 })), notified.length, notified[0].title, notified[0].options.tag, notified[0].options.requireInteraction], ['notify', 1, '[question] fix the cache more', 'todoer:sa', true])
check('change: the same state again (a render after the hook) is nothing', _notify_change(todo('a', { held: 'owner', reason: 'question', epoch: 2 })), 'unchanged')
check('change: a done hand-back is not enabled', _notify_change(todo('a', { held: 'owner', reason: 'done', epoch: 3 })), 'reason done')
check('change: an agent-held project blocked (the main list) notifies', _notify_change(todo('a', { held: 'agent', reason: 'blocked', epoch: 3, project: true })), 'notify')
check('change: the project\'s same reason again without a new count is nothing', _notify_change(todo('a', { held: 'agent', reason: 'blocked', epoch: 3, project: true, rev: 9 })), 'unchanged')
check('change: a second check-in under the same epoch and reason (the count advanced) notifies again', _notify_change(todo('a', { held: 'agent', reason: 'blocked', epoch: 3, project: true, surfaced: 1 })), 'notify')
check('change: a todo without a projection', _notify_change(todo('c', null)), 'reason none')
check('change: the render\'s facts (the list and the parent given)', _notify_change(todo('a', { held: 'owner', reason: 'proposal', epoch: 4 }), { state: { held: 'owner', reason: 'proposal', epoch: 4 }, list: 'main', parent: null }), 'notify')
context.__todos.p = todo('p', { held: 'agent', reason: 'delegated', epoch: 0, project: true }, '#todo the project')
check('change: a bound child proposing with no standing /land names its parent', [_notify_change(todo('d', { held: 'owner', reason: 'proposal', epoch: 1, parent: 'p' })), notified[notified.length - 1].options.body], ['notify', 'child of #todo the project'])
check('change: a bound child under a standing /land stays delegated', (context.__todos.p._global_store._agent.state.standing_land = true, _notify_change(todo('d', { held: 'owner', reason: 'proposal', epoch: 2, parent: 'p' }))), 'not in the main list')
storage.set(NOTIFIER_KEY, JSON.stringify({ id: 'tab-other', time: context.__now }))
check('change: another window is elected', _notify_change(todo('a', { held: 'owner', reason: 'blocked', epoch: 5 })), 'another window')
storage.clear()
FakeNotification.permission = 'default'
check('change: no permission on this device', _notify_change(todo('a', { held: 'owner', reason: 'blocked', epoch: 6 })), 'permission default')
FakeNotification.permission = 'granted'
context._todoer._global_store = {}
check('change: the setting off', _notify_change(todo('a', { held: 'owner', reason: 'blocked', epoch: 7 })), 'off')
context._todoer._global_store = { notify: { reasons: ['question'] } }
context.Notification = class { static permission = 'granted'; constructor() { throw new Error('no') } }
const warn = console.warn
console.warn = () => {}
check('change: a constructor the browser refuses', _notify_change(todo('a', { held: 'owner', reason: 'question', epoch: 8 })), 'refused')
console.warn = warn
context.Notification = FakeNotification
// the click: the notification closed, this window forward, the item targeted by name with its
// todo line selected (as its row's click does); a deleted item: the window alone
context.__todos.a = todo('a', { held: 'owner', reason: 'question', epoch: 9 })
check('change: a question again under a new epoch', _notify_change(context.__todos.a), 'notify')
notified[notified.length - 1].onclick()
check('click: closed, the window focused, the item targeted', [notified[notified.length - 1].closed, context.__focused, context.__mindbox], [true, 1, ['#ta', { scroll: true, select: '#todo fix the cache' }]])
context.__mindbox = null
delete context.__todos.a
notified[notified.length - 1].onclick()
check('click: a deleted item focuses the window alone', [context.__focused, context.__mindbox], [2, null])
// ENTERING THE MAIN LIST with an unchanged state (review 0, B2): a bound child's proposal under
// its project's standing /land is delegated; the project's grant gone (the owner removed /land
// and delegated it again), the child belongs to the main list with the same key, and the
// project's store change compares its children (the hook's second pass)
context._todoer._global_store = { notify: { reasons: ['question', 'blocked', 'proposal', 'budget'] } }
context.__todos.p = todo('p', { held: 'agent', reason: 'delegated', epoch: 1, project: true, standing_land: true }, '#todo the project')
context.__todos.e = todo('e', { held: 'owner', reason: 'proposal', epoch: 1, parent: 'p' })
context.__items = [context.__todos.p, context.__todos.e]
const notified_before = notified.length
check('entering main: the child under a standing /land is delegated (recorded)', _notify_change(context.__todos.e), 'not in the main list')
check('entering main: the child compared again, unchanged', _notify_change(context.__todos.e), 'unchanged')
context.__todos.p._global_store._agent.state = { held: 'agent', reason: 'delegated', epoch: 1, project: true, standing_land: false }
check('entering main: the project\'s change compares its children, the child\'s proposal notifies', [_notify_children(context.__todos.p), notified.length - notified_before, notified[notified.length - 1].title], [1, 1, '[proposal] fix the cache more'])
check('entering main: compared once more, unchanged', _notify_children(context.__todos.p), 1) // compared, nothing shown
check('entering main: no more notifications from the repeat', notified.length - notified_before, 1)
check('children: a plain task compares no children', _notify_children(context.__todos.e), 0)
// a child RELEASED by its project (the owner removed /project): its parent cleared, possession,
// reason and epoch kept; an owner-held question moves from the delegated list to the main one
context.__todos.p._global_store._agent.state = { held: 'agent', reason: 'delegated', epoch: 1, project: true, standing_land: true }
context.__todos.f = todo('f', { held: 'owner', reason: 'question', epoch: 1, parent: 'p' })
check('released: the child\'s question under its project is delegated', _notify_change(context.__todos.f), 'not in the main list')
context.__todos.f._global_store._agent.state = { held: 'owner', reason: 'question', epoch: 1 }
check('released: the same state without the parent notifies', [_notify_change(context.__todos.f), notified.length - notified_before, notified[notified.length - 1].title], ['notify', 2, '[question] fix the cache more'])
// THE HOOK (the production call site): a todo's store change compares it and its children, then
// re-renders; another item's store change does nothing
const rerenders = []
context._on_item_change = id => rerenders.push(id)
context.__todos.g = todo('g', { held: 'owner', reason: 'blocked', epoch: 1 })
context.__todos.n = { id: 'n', tags: ['#note'] }
check('hook: a todo\'s store change notifies then re-renders', [_on_global_store_change('g', true), notified.length - notified_before, notified[notified.length - 1].title, rerenders], [undefined, 3, '[blocked] fix the cache more', ['g']])
check('hook: another item\'s store change does nothing', [_on_global_store_change('n', true), _on_global_store_change('missing', true), rerenders, notified.length - notified_before], [undefined, undefined, ['g'], 3])
// the hook's second pass: a project's store change (its standing /land gone) notifies the bound
// child whose proposal thereby enters the main list (B2's first route through the production hook)
context.__todos.q = todo('q', { held: 'agent', reason: 'delegated', epoch: 1, project: true, standing_land: true }, '#todo another project')
context.__todos.r = todo('r', { held: 'owner', reason: 'proposal', epoch: 1, parent: 'q' })
context.__items = [context.__todos.q, context.__todos.r]
check('hook: the child under a standing /land is recorded as delegated', _notify_change(context.__todos.r), 'not in the main list')
context.__todos.q._global_store._agent.state = { held: 'agent', reason: 'delegated', epoch: 1, project: true, standing_land: false }
check('hook: the project\'s store change notifies its child entering the main list', [_on_global_store_change('q', true), notified.length - notified_before, notified[notified.length - 1].options.body, rerenders], [undefined, 4, 'child of #todo another project', ['g', 'q']])
// THE SCAN (review 0, B1): a delivery the app announced to no hook (this tab owed a save for that
// store) is noticed by the minute task, which also keeps the election; nothing seen changes twice
context.__todos.g._global_store._agent.state = { held: 'owner', reason: 'question', epoch: 2 }
context.__items = [context.__todos.g, context.__todos.e]
context.__captured.notifier()
check('scan: the minute task notices the state the hook never saw', [notified.length - notified_before, notified[notified.length - 1].title, notified[notified.length - 1].options.tag], [5, '[question] fix the cache more', 'todoer:sg'])
check('scan: the heartbeat kept the election', JSON.parse(storage.get(NOTIFIER_KEY)).id, 'tab-me')
context.__captured.notifier()
check('scan: a second tick shows nothing more', notified.length - notified_before, 5)
check('scan: compares every todo', _scan_notify(), 2)
// the render's call site cannot run here (__render needs the DOM): pinned by the source
check('render: each row compares its projection (the call site the table cannot run)', /\n    _notify_change\(item, \{ state, list: task_list, parent \}\)\n/.test(src), true)
// TWO WINDOWS of one device (a second evaluation of the source sharing the storage and the frozen
// clock): the listeners _start_notifier installs, exercised: a focus takes the election over, the
// heartbeat renews an own record only, a pagehide releases, a sleep lets the first observer take
// a vacant election (review 0 backfill) while an undisturbed sleeper renews its own
const window_of = (tab, items) => {
  const listeners = {}
  const shown = []
  const ctx = {
    console, debug: () => {}, warn: () => {}, error: () => {}, fatal: msg => { throw new Error(msg) },
    _replace_tags: context._replace_tags, each: (xs, f) => xs.forEach(f), values: o => Object.values(o ?? {}), merge: (a, b) => Object.assign(a, b),
    Date: ClockDate, localStorage: context.localStorage, _command_id: () => tab,
    _todoer: { store: {}, _global_store: { notify: { reasons: ['question', 'blocked', 'proposal', 'budget'] } }, dispatch_task: (name, fn) => (listeners[name] = fn) },
    _items: () => items, _item: ref => items.find(i => i.id == ref) ?? null,
    Notification: class { static permission = 'granted'; constructor(title, options) { shown.push({ title, tag: options.tag }) } },
    MindBox: { set: () => {} },
    window: { focus: () => {}, addEventListener: (type, fn) => (listeners[type] = fn) },
    document: { addEventListener: (type, fn) => (listeners[type] = fn), hasFocus: () => false },
  }
  vm.createContext(ctx)
  vm.runInContext(picked, ctx)
  return { ctx, listeners, shown, change: item => vm.runInContext('_notify_change', ctx)(item), start: () => vm.runInContext('_start_notifier', ctx)() }
}
storage.clear()
const shared = [todo('w', { held: 'agent', reason: 'delegated', epoch: 1 })]
const A = window_of('tab-a', shared)
const B = window_of('tab-b', shared)
A.start()
B.start()
check('two windows: the listeners installed once each (focus, pointerdown, keydown, pagehide, the minute task)', [Object.keys(A.listeners).sort(), Object.keys(B.listeners).sort()], [['focus', 'keydown', 'notifier', 'pagehide', 'pointerdown'], ['focus', 'keydown', 'notifier', 'pagehide', 'pointerdown']])
context.__now = 100_000
A.listeners.focus()
check('two windows: the focused window claims', JSON.parse(storage.get(NOTIFIER_KEY)).id, 'tab-a')
context.__now += 1000
B.listeners.pointerdown()
check('two windows: a gesture in the other takes it over (the last-used window)', JSON.parse(storage.get(NOTIFIER_KEY)).id, 'tab-b')
shared[0]._global_store._agent.state = { held: 'owner', reason: 'question', epoch: 2 }
check('two windows: the delivery notifies in the last-used window only', [A.change(shared[0]), B.change(shared[0]), A.shown.length, B.shown.length], ['another window', 'notify', 0, 1])
context.__now += NOTIFIER_REFRESH_MS
A.listeners.notifier()
check('two windows: the other window\'s heartbeat renews nothing', JSON.parse(storage.get(NOTIFIER_KEY)), { id: 'tab-b', time: 101_000 })
B.listeners.notifier()
check('two windows: the elected window\'s heartbeat renews its record', JSON.parse(storage.get(NOTIFIER_KEY)), { id: 'tab-b', time: 101_000 + NOTIFIER_REFRESH_MS })
B.listeners.pagehide()
check('two windows: the elected window closing releases the election', storage.has(NOTIFIER_KEY), false)
shared[0]._global_store._agent.state = { held: 'owner', reason: 'blocked', epoch: 3 }
check('two windows: the next delivery is taken by the window left', [A.change(shared[0]), A.shown.length, JSON.parse(storage.get(NOTIFIER_KEY)).id], ['notify', 1, 'tab-a'])
context.__now += NOTIFIER_STALE_MS + 1000 // the device slept past the stale bound
A.listeners.notifier()
check('sleep: an undisturbed sleeper\'s heartbeat renews its own stale record', JSON.parse(storage.get(NOTIFIER_KEY)), { id: 'tab-a', time: context.__now })
context.__now += NOTIFIER_STALE_MS + 1000 // another sleep
shared[0]._global_store._agent.state = { held: 'owner', reason: 'question', epoch: 4 }
check('sleep: the first window to observe a delivery takes the vacant election', [B.change(shared[0]), JSON.parse(storage.get(NOTIFIER_KEY)).id, B.shown.length], ['notify', 'tab-b', 2])
A.listeners.notifier()
check('sleep: the sleeper\'s heartbeat then renews nothing and its scan shows nothing (the owner\'s next focus restores the rule)', [JSON.parse(storage.get(NOTIFIER_KEY)).id, A.shown.length], ['tab-b', 1])
A.listeners.focus()
check('sleep: the sleeper\'s focus takes the election back', JSON.parse(storage.get(NOTIFIER_KEY)).id, 'tab-a')
storage.clear()
context.__items = []
delete context.__todos.p

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

  // /delegate's argument (design 2.2): empty is the targeted item, a `#name` or `id:` first word
  // or a whole argument that resolves (an id) that item; any other text, the exact first word
  // `#todo` (the tag itself) included, is a todo created as /todo creates it (the app's {text}
  // return, with an init hook for the created item; a `#todo` first word kept as written) and
  // delegated once its save names it. The grammar gate before the creation returns the
  // command; nothing after the creation does (a retry would create a second todo)
  const alerts = []
  context.alert = m => alerts.push(m)
  const docs = [] // the command documents enqueued, in order
  context.window._enqueue_hidden_document = async (name, cmd) => {
    docs.push({ name, cmd })
    return { id: 'doc-' + cmd.id, written: Promise.resolve() }
  }
  context.window._grammar = { version: 2, edit: (text, fn) => fn(text) }
  let ids = 0
  context._command_id = () => 'c' + ++ids
  const items = {} // by id, and by name when named
  const make = (id, name, text, saved_id) => {
    const item = { id, name: name ?? id, text, saved_id, tags: text.match(/#\S+/g) ?? [], _global_store: {}, write: t => ((item.text = t), true) }
    items[id] = item
    if (name) items[name] = item
    return item
  }
  context._item = ref => items[ref] ?? null
  context._exists = ref => ref in items
  let target = null // the targeted item's container, as the document holds it
  context.document = { querySelector: () => target }
  context.setTimeout = setTimeout
  make('i1', null, '#todo fix\nbody\n', 's1')
  make('i2', '#other', '#todo other\n', 's2')
  target = { getAttribute: () => 'i1' }
  check('delegate: empty, the targeted item', [await _on_command_delegate('', ''), docs.at(-1)?.cmd.task, items.i1.text], [null, 's1', '#todo [delegated] fix\nbody\n#_agent/vault\n'])
  target = null
  check('delegate: empty without a target is refused, the command kept', [await _on_command_delegate('', ''), alerts.at(-1), docs.length], ['/delegate ', '/delegate: no target item', 1])
  check('delegate: a #name', [await _on_command_delegate('#other', '#other'), docs.at(-1).cmd.task], [null, 's2'])
  check('delegate: a missing #name is refused, never a todo', [await _on_command_delegate('#nope fix it', '#nope'), alerts.at(-1), docs.length], ['/delegate #nope fix it', '/delegate: #nope missing or ambiguous', 2])
  check('delegate: a missing id: reference is refused, never a todo', [await _on_command_delegate('id:nope', 'id:nope'), alerts.at(-1), docs.length], ['/delegate id:nope', '/delegate: id:nope missing or ambiguous', 2])
  check('delegate: an id is a reference', [await _on_command_delegate('i2', 'i2'), docs.at(-1).cmd.task, docs.length], [null, 's2', 3])
  context.window._grammar.version = 1
  check('delegate: text under the old grammar is refused before anything is created', [await _on_command_delegate('fix the cache', 'fix'), alerts.at(-1), docs.length], ['/delegate fix the cache', 'please reload to delegate todos (app update required)', 3])
  context.window._grammar.version = 2
  const ret = await _on_command_delegate('fix the cache', 'fix')
  check('delegate: text creates the todo as /todo does, with an init hook', [ret.text, ret.edit, typeof ret.init], ['#todo fix the cache', false, 'function'])
  const created = make('i3', null, ret.text, null) // the app's created item, not saved yet
  const done = ret.init(created)
  check('delegate: nothing is enqueued before the save', docs.length, 3)
  setTimeout(() => (created.saved_id = 's3'), 10)
  check('delegate: the saved todo is delegated under its saved id, the created text the capture', [await done, docs.at(-1).cmd, created.text], [null, { task: 's3', id: docs.at(-1).cmd.id, kind: 'delegate', epoch: 0, at: docs.at(-1).cmd.at, body: '#todo fix the cache' }, '#todo [delegated] fix the cache\n#_agent/vault\n'])
  check('delegate: a save that does not come is reported, the command not returned', [await _delegate_created(make('i4', null, '#todo never', null), 20), alerts.at(-1), docs.length], [null, 'cannot delegate i4: not saved after 0.02s; delegate it once it is', 4])
  const gone = make('i5', null, '#todo gone', null)
  const reported = alerts.length
  setTimeout(() => delete items.i5, 10)
  check('delegate: a todo deleted during the wait is let go', [await _delegate_created(gone, 5000), alerts.length, docs.length], [null, reported, 4])
  check('delegate: the wait is bounded', await _wait_for_save(make('i6', null, '#todo slow', null), 20, 5), false)
  // the exact first word `#todo` (the tag itself) is text, created as written (never a doubled
  // tag) and delegated once saved; `/delegate #todo` alone an empty todo, as /todo alone creates
  // one; a name that merely starts with it is a reference, refused when missing
  const tagged = await _on_command_delegate('#todo fix x', '#todo')
  check('delegate: the #todo first word is text, created as written', [tagged.text, tagged.edit, typeof tagged.init], ['#todo fix x', false, 'function'])
  const tagged_item = make('i7', null, tagged.text, null)
  const tagged_done = tagged.init(tagged_item)
  check('delegate: nothing is enqueued before the tagged todo\'s save', docs.length, 4)
  setTimeout(() => (tagged_item.saved_id = 's7'), 10)
  check('delegate: the tagged todo is delegated once saved, its text the capture', [await tagged_done, docs.at(-1).cmd.task, docs.at(-1).cmd.body, tagged_item.text], [null, 's7', '#todo fix x', '#todo [delegated] fix x\n#_agent/vault\n'])
  check('delegate: #todo alone is text, an empty todo', [(await _on_command_delegate('#todo', '#todo')).text, docs.length], ['#todo', 5])
  check('delegate: a missing name that merely starts with #todo is refused', [await _on_command_delegate('#todox', '#todox'), alerts.at(-1), docs.length], ['/delegate #todox', '/delegate: #todox missing or ambiguous', 5])
  make('i8', '#todox', '#todo x\n', 's8')
  check('delegate: a name that merely starts with #todo is a reference, delegated by its saved id', [await _on_command_delegate('#todox', '#todox'), docs.at(-1).cmd.task, docs.length], [null, 's8', 6])
  // wiki links in a row (the vault's design notes/design/wiki_links.md 2.3): the app's REAL grammar
  // and builder (src/wiki_links.ts, loaded by node's type stripping) through window, and the app's
  // REAL tag-exclusion replacer for the url pass (replaceTags and its exclusions, evaluated from
  // src/util.js; the harness's stub rewrites nothing); the escaped snippet's reference reaches the
  // builder unescaped, the anchor comes back opaque to the tag, markdown-link and url passes that
  // follow, the plain url still links; without the seams, or for a reference the builder refuses,
  // the snippet is as before
  {
    const app = path.join(__dirname, '..', '..', 'mind.page')
    const wiki = require(path.join(app, 'src', 'wiki_links.ts'))
    const util = fs.readFileSync(path.join(app, 'src', 'util.js'), 'utf8')
    // the pieces by their boundaries: an exclusion array to its join, a delimiter's line, a function to its closing brace
    const piece = (name, kind) => {
      const start = util.indexOf(`export ${kind} ${name}`)
      if (start < 0) throw new Error(`${name} not found in util.js`)
      const stop = kind === 'function' ? util.indexOf('\n}\n', start) + 3 : name.startsWith('tagRegexExclusions') ? util.indexOf("].join('|')", start) + "].join('|')".length : util.indexOf('\n', start) + 1
      return util.slice(start, stop).replace('export ', '')
    }
    const utilCtx = vm.createContext({ _: context._ })
    vm.runInContext(
      [['tagRegexExclusions', 'const'], ['tagRegexExclusionsEscaped', 'const'], ['tagRegexDelimiter', 'const'], ['tagRegexDelimiterEscaped', 'const'], ['skipExclusions', 'function'], ['replaceTags', 'function']]
        .map(([name, kind]) => piece(name, kind))
        .join('\n'),
      utilCtx
    )
    const replaceTags = vm.runInContext('replaceTags', utilCtx)
    const stub = context._replace_tags
    context._replace_tags = (text, pattern, fn) => replaceTags(text, pattern, fn)
    const _row_html = vm.runInContext('_row_html', context)
    const config = { url: 'x://h/f' }
    const plain = _row_html('#todo see [[notes/A&B|see #topic]] and #tag https://h/p and [[../x]]')
    check('row: without the app seams the snippet is as before (tags marked inside the references too, the url linked, the references literal)', plain,
      '<mark>#todo</mark> see [[notes/A&amp;B|see <mark>#topic</mark>]] and <mark>#tag</mark> <a>https://h/p</a> and [[../x]]')
    context.window._wiki_link_regexp = wiki.wikiLinkRegExp
    context.window._wiki_link_html = (target, alias, options) => wiki.wikiLinkHtml(config, target, alias, options)
    const html = _row_html('#todo see [[notes/A&B|see #topic [x](y)]] and #tag https://h/p and [[../x]]')
    check('row: the anchor is opaque to the passes after it (no mark, link or url inside), the url still linked, the refused reference literal', html,
      '<mark>#todo</mark> see <a href="x&#58;&#47;&#47;h&#47;f&#63;path&#61;notes&#37;2FA&#37;26B" title="notes&#47;A&#38;B" data-wiki-link>see &#35;topic &#91;x&#93;&#40;y&#41;</a> and <mark>#tag</mark> <a>https://h/p</a> and [[../x]]')
    check('row: the anchor carries no target, rel or handler', /target=|rel=|\son\w+=/.test(html), false)
    check('row: a reference without an alias shows its target, an apostrophe and a quote reach the builder unescaped', _row_html("[[docs/x]] [[a'b|c\"d]]"),
      '<a href="x&#58;&#47;&#47;h&#47;f&#63;path&#61;docs&#37;2Fx" title="docs&#47;x" data-wiki-link>docs&#47;x</a> <a href="x&#58;&#47;&#47;h&#47;f&#63;path&#61;a&#39;b" title="a&#39;b" data-wiki-link>c&#34;d</a>') // encodeURIComponent keeps an apostrophe; the carrier references it
    context._replace_tags = stub
    delete context.window._wiki_link_regexp
    delete context.window._wiki_link_html
  }

  // the row's anchors (_wire_row_links, the pass __render runs over the rendered row): a wiki
  // link's anchor gets the click stop alone and NO target (its default stays: the editor url opens
  // in place), a plain web link gets its target and the shortened text, an authored anchor (an
  // inline onclick) is left alone; over fake elements with the DOM surface the pass reads
  {
    const _wire_row_links = vm.runInContext('_wire_row_links', context)
    const anchor = (attrs, text) => ({
      attrs, innerText: text, href: attrs.href ?? '', title: attrs.title ?? '', target: undefined, onclick: null,
      hasAttribute(name) { return name in this.attrs },
      getAttribute(name) { return this.attrs[name] ?? null },
    })
    const wikiAnchor = anchor({ href: 'x://h/f?path=docs', title: 'docs', 'data-wiki-link': '' }, 'docs')
    const webAnchor = anchor({}, 'https://h/p/q')
    const authored = anchor({ href: 'vscode-insiders://x/review', onclick: 'event.stopPropagation()' }, 'r')
    _wire_row_links({ querySelectorAll: sel => (sel === 'a' ? [wikiAnchor, webAnchor, authored] : []) })
    const click = () => ({ stopped: 0, prevented: 0, stopPropagation() { this.stopped++ }, preventDefault() { this.prevented++ } })
    const wikiClick = click()
    wikiAnchor.onclick(wikiClick)
    check('anchors: the wiki anchor has no target, its click stops and keeps its default', [wikiAnchor.target, wikiAnchor.href, wikiClick.stopped, wikiClick.prevented], [undefined, 'x://h/f?path=docs', 1, 0])
    const webClick = click()
    webAnchor.onclick(webClick)
    check('anchors: the plain web link gets its target, the shortened text and the click stop', [webAnchor.target, webAnchor.href, webAnchor.innerText, webAnchor.title, webClick.stopped], ['_blank', 'https://h/p/q', 'h/…', 'https://h/p/q', 1])
    check('anchors: an authored anchor is left alone', [authored.target, authored.onclick], [undefined, null])
  }

  // the /notify command: the status, on (this device's permission asked from the gesture, the
  // setting saved for every device), off, test, a refused word
  {
    const said = []
    context.alert = m => said.push(m)
    const saves = []
    context._todoer._global_store = {}
    context._todoer.save_global_store = opts => saves.push(opts)
    let asked = 0
    context.Notification = class {
      static permission = 'default'
      static async requestPermission() {
        asked++
        context.Notification.permission = 'granted'
        return 'granted'
      }
      constructor(title, options) {
        this.title = title
        this.options = options
        said.push(`shown: ${title}`)
      }
    }
    check('/notify: the status', [await _on_command_notify(''), said.pop()], [null, 'notifications: off; this device: default'])
    check('/notify test: no permission yet', [await _on_command_notify('test'), said.pop()], [null, "notifications: this device's permission is default (/notify on asks for it)"])
    check('/notify on: asks this device, saves the setting', [await _on_command_notify('on'), asked, context._todoer._global_store.notify, saves, said.pop()], [null, 1, { reasons: ['question', 'blocked', 'proposal', 'budget'] }, [{ invalidate_elem_cache: false }], 'notifications: on for question, blocked, proposal, budget; this device: granted'])
    check('/notify on done: granted already, no second ask', [await _on_command_notify('on done'), asked, said.pop()], [null, 1, 'notifications: on for done; this device: granted'])
    check('/notify test: shows one', [await _on_command_notify('test'), said.pop()], [null, 'shown: [question] a test of the desktop notifications'])
    check('/notify on soon: refused, the command kept', [await _on_command_notify('on soon'), said.pop().startsWith('/notify: unknown reason soon')], ['/notify on soon', true])
    check('/notify off: clears the setting', [await _on_command_notify('off'), context._todoer._global_store.notify, saves.length, said.pop()], [null, undefined, 3, 'notifications: off'])
    context.Notification.permission = 'denied'
    check('/notify on under a denied permission: saved, the way out named', [await _on_command_notify('on'), asked, said.pop()], [null, 1, 'notifications: on for question, blocked, proposal, budget; this device: denied (allow notifications for this site in the browser, then /notify on again)'])
    check('/notify: nothing else was said', said, [])
  }

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
// one turn of the order save: the corpus server-confirmed first, then every listed item saved,
// then the build check; the unconfirmed turn waits whatever else holds (a newer stamp included)
check('order save: an unconfirmed corpus waits', [_order_save_step({ confirmed: false, saved_ids: ['a', 'b'], todoer_store: {} }), _order_save_step({ confirmed: false, saved_ids: ['a'], todoer_store: { version: TODOER_VERSION + 1 } })], ['wait', 'wait'])
check('order save: a resume hold waits', _order_save_step({ confirmed: true, held: true, saved_ids: ['a'], todoer_store: {} }), 'wait')
check('order save: an unsaved listed item waits', _order_save_step({ confirmed: true, saved_ids: ['a', null], todoer_store: {} }), 'wait')
check('order save: a newer build blocks', _order_save_step({ confirmed: true, saved_ids: ['a'], todoer_store: { version: TODOER_VERSION + 1 } }), 'blocked')
check('order save: otherwise saves', [_order_save_step({ confirmed: true, saved_ids: ['a'], todoer_store: {} }), _order_save_step({ confirmed: true, held: false, saved_ids: [], todoer_store: undefined })], ['save', 'save'])
// one tick of the unsnooze sweep: the primary instance only, on a confirmed corpus, online, past a resume hold
check('sweep: not the primary instance skips', _sweep_step({ primary: false, confirmed: true, online: true }), 'skip')
check('sweep: an unconfirmed corpus waits', _sweep_step({ primary: true, confirmed: false, online: true }), 'wait')
check('sweep: offline waits', _sweep_step({ primary: true, confirmed: true, online: false }), 'wait')
check('sweep: a resume hold waits', _sweep_step({ primary: true, confirmed: true, online: true, held: true }), 'wait')
check('sweep: otherwise sweeps', _sweep_step({ primary: true, confirmed: true, online: true }), 'sweep')
// the corpus is current when confirmed AND currently served; an app without the live flag decides by the confirmation
check('current: confirmed and served', _corpus_current({ _server_confirmed: true, _server_current: true }), true)
check('current: confirmed, the stream dead', _corpus_current({ _server_confirmed: true, _server_current: false }), false)
check('current: confirmed on an app without the live flag', _corpus_current({ _server_confirmed: true }), true)
check('current: unconfirmed, whatever the flag', [_corpus_current({ _server_confirmed: false, _server_current: true }), _corpus_current({})], [false, false])
// the resume hold: a long gap between ticks holds the writers for RESUME_HOLD_MS; a minute's gap (a throttled tab) does not; a first tick has no gap
const RESUME_GAP_MS = vm.runInContext('RESUME_GAP_MS', context)
const RESUME_HOLD_MS = vm.runInContext('RESUME_HOLD_MS', context)
check('resume: the first tick holds nothing', _resume_hold({ last_tick: undefined, now: 1000, hold_until: undefined }), 0)
check('resume: a minute since the last tick holds nothing', _resume_hold({ last_tick: 1000, now: 1000 + 60_000, hold_until: 0 }), 0)
check('resume: a gap past the limit holds for the hold span', _resume_hold({ last_tick: 1000, now: 1000 + RESUME_GAP_MS + 1, hold_until: 0 }), 1000 + RESUME_GAP_MS + 1 + RESUME_HOLD_MS)
check('resume: an existing hold stands through ordinary ticks', _resume_hold({ last_tick: 5000, now: 5000 + 60_000, hold_until: 999_999 }), 999_999)
// THE SWEEP CALLBACK ITSELF, with the world stubbed and the clock faked (the wiring, not the
// predicates): _on_welcome registers it under `unsnooze`; a due item is one whose snooze time
// passed; _unsnooze writes snoozed 0 on it
const sweep = () => context.__captured.unsnooze()
const due = () => (context.__items = [{ _global_store: { _todoer: { snoozed: 100 } }, global_store: { _todoer: { snoozed: 100 } } }])
const unsnoozed = () => context.__items[0].global_store._todoer.snoozed === 0
_on_welcome()
Object.assign(context.window, { _server_confirmed: true, _server_current: true }) // the harness's window stub, the app's flags added
context.__now = 1000
due(); sweep()
check('callback: a due item is unsnoozed on a current corpus', unsnoozed(), true)
context.window._server_current = false
due(); sweep()
check('callback: not while the stream is dead (the live flag off)', unsnoozed(), false)
context.window._server_current = true
context.navigator.onLine = false
due(); sweep()
check('callback: not while offline', unsnoozed(), false)
context.navigator.onLine = true
// the resume hold from the callback's own observation: a tick after a long gap holds
context.__now = 1000 + 10 * 60_000
due(); sweep()
check('callback: the first tick after a long gap holds (no unsnooze)', [unsnoozed(), context._todoer.store.hold_until], [false, 1000 + 10 * 60_000 + RESUME_HOLD_MS])
context.__now += 60_000
due(); sweep()
check('callback: a tick inside the hold still waits', unsnoozed(), false)
context.__now += 60_001
due(); sweep()
check('callback: the tick past the hold sweeps', unsnoozed(), true)
// THE ORDER SAVE'S OBSERVATION (review 0's B3): after a second suspension the order task can
// wake before the sweep; its own _held() sees the gap and holds, whatever the sweep saw
context.__now += 60_000
sweep() // an ordinary tick: last_tick fresh, no hold
check('held: an ordinary observation holds nothing', _held(), false)
context.__now += 20 * 60_000 // asleep: the order task wakes first
check('held: the first observation after a gap holds, before any sweep', [_held(), context._todoer.store.hold_until > context.__now], [true, true])
const woke = context.__now
context.__now += 5000 // dragging during the hold: observed every second
check('held: inside the hold', _held(), true)
context.__now = woke + RESUME_HOLD_MS + 1000 // asleep again until past the hold's end
check('held: a second suspension that outlives the hold is a new gap: held again', _held(), true)
context.__now += 30_000
check('held: still inside the new hold', _held(), true)
// observed every minute meanwhile (the sweep's cadence, under the gap threshold): the hold ends
const end = context._todoer.store.hold_until
while (context.__now + 60_000 <= end) {
  context.__now += 60_000
  _held()
}
context.__now += 60_000
check('held: past the new hold, observed every minute meanwhile', _held(), false)
context.__now = null // the clock runs live again for the rows below

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
