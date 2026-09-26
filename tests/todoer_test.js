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
const consts = ['_pending_commands', 'TODOER_VERSION', 'HGRAB_RADIUS', 'HGRAB_RATIO', 'SAVE_WAIT_MS', 'SAVE_POLL_MS', 'RESUME_GAP_MS', 'RESUME_HOLD_MS', '_url_char'].map(name => src.match(new RegExp(`\\nconst ${name} = [^\\n]*\\n`))[0]).join('')
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
    '_marker_of',
    '_link_marker',
    '_decorate_row',
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
  ]).join('\n') +
    consts +
    src.match(/\nasync function _enqueue_command\([^\n]*\) \{[\s\S]*?\n\}\n/)[0],
  context
)
const { _order_save_step, _sweep_step, _corpus_current, _resume_hold, _held, _on_welcome, _task_list, _age, _stats_suffix, _age_title, _set_marker, _marker_of, _link_marker, _decorate_row, _review_anchor_builder, _extract_todo_snippet, _todo_line, _delegated_view, _enqueue_command, _merged_order, _order_blocked, _suppress_touch_context_menu, _sideways, _grab_on_sideways_touch, _on_command_delegate, _delegate_created, _wait_for_save, _link_urls } = context
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
check('an owner-held bound child: delegated', _task_list({ held: 'owner', reason: 'proposal', parent: 'p1', acked: {} }, null), 'delegated')
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
vm.runInContext(
  vault_src.match(/\nconst VAULT_EDITOR = [^\n]*\n/)[0] + ['vault_review_url', 'vault_review_anchor', 'vault_review_links'].map(vault_fn).join(''),
  vault_ctx
)
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
