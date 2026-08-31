#!/usr/bin/env node
// plain-node decision table for the bridge-reply auto-push contract (reviews 187 §1.4 +
// 188 §§1.1-1.3): extracts the PURE helpers from pusher.js and pins the writer-image
// tail grammar and every decision row. the mocked state-transition harness
// (pusher_schedule_test.js) covers the asynchronous production schedules.
const fs = require('fs')
const vm = require('vm')
const src = fs.readFileSync(__dirname + '/../pusher.js', 'utf8')
const start = src.indexOf('const _bridge_tail')
const end = src.indexOf('const _pending_requests')
if (start < 0 || end < 0 || end <= start) throw new Error('helper block not found in pusher.js')
const { _split_bridge_reply, _bridge_reply_action } = vm.runInNewContext(
  src.slice(start, end) + ';({ _split_bridge_reply, _bridge_reply_action })',
  {}
)

const sha_of = p => 'sha:' + p
// the ACTIVE writer grammar (vault format_footer): cost sits BEFORE duration
const footer = "<<agent('vault/default · run ab12cd34 · $0.03 · 22s')>>"
const footerNoCost = "<<agent('vault/opus5 · run 00ffee11 · 7s')>>"
const reply = (body, f = footer) => f + '\n<!--inert-->\n' + body + '\n<!--/inert-->'
const append = (pre, r) => (pre.endsWith('\n') ? pre : pre + '\n') + r // vault append_reply
const P = '#chat topic\n<<user>> hi'

let failures = 0
const check = (name, actual, expected) => {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${actual}${ok ? '' : ' != ' + expected}`)
}
const act = (text, state, opts) =>
  _bridge_reply_action(text, state, {
    pending_sha: null,
    primary: true,
    disabled: false,
    sha_of,
    ...opts,
  })
const pushedState = pre => ({ sha: sha_of(pre), remote_sha: sha_of(pre) })

// --- writer-image tail grammar (188 §§1.1, 1.3) ---
check('cost-bearing footer (cost BEFORE duration)', act(append(P, reply('Hello!')), pushedState(P)), 'push')
check('costless footer', act(append(P, reply('Hello!', footerNoCost)), pushedState(P)), 'push')
check('REVERSED order (duration before cost) rejected', act(append(P, "<<agent('vault/default · run ab12cd34 · 22s · $0.03')>>\n<!--inert-->\nx\n<!--/inert-->"), pushedState(P)), 'assume')
check('uppercase persona rejected', act(append(P, "<<agent('vault/Default · run ab12cd34 · 1s')>>\n<!--inert-->\nx\n<!--/inert-->"), pushedState(P)), 'assume')
check('slashed persona rejected', act(append(P, "<<agent('vault/a/b · run ab12cd34 · 1s')>>\n<!--inert-->\nx\n<!--/inert-->"), pushedState(P)), 'assume')
check('leading-zero duration rejected', act(append(P, "<<agent('vault/default · run ab12cd34 · 01s')>>\n<!--inert-->\nx\n<!--/inert-->"), pushedState(P)), 'assume')
check('malformed cost rejected', act(append(P, "<<agent('vault/default · run ab12cd34 · $.. · 1s')>>\n<!--inert-->\nx\n<!--/inert-->"), pushedState(P)), 'assume')
check('one-decimal cost rejected', act(append(P, "<<agent('vault/default · run ab12cd34 · $0.1 · 1s')>>\n<!--inert-->\nx\n<!--/inert-->"), pushedState(P)), 'assume')
check('bad run id rejected', act(append(P, "<<agent('vault/default · run xyz · 1s')>>\n<!--inert-->\nx\n<!--/inert-->"), pushedState(P)), 'assume')
check('web-agent footer rejected', act(append(P, "<<agent('gpt5p6 · run ab12cd34 · 3s')>>\n<!--inert-->\nx\n<!--/inert-->"), pushedState(P)), 'assume')
// canonical empty body is OPEN\n\nCLOSE; the unframed OPEN\nCLOSE is NOT writer-image
check('canonical empty body', act(append(P, reply('')), pushedState(P)), 'push')
check('unframed empty rejected', act(append(P, footer + '\n<!--inert-->\n<!--/inert-->'), pushedState(P)), 'assume')
// the writer escape leaves no bare close SUBSTRING anywhere in a genuine body
check('inline bare close in body rejected', act(append(P, reply('leading <!--/inert--> trailing')), pushedState(P)), 'assume')
check('escaped-close body', act(append(P, reply('x <!--\\/inert--> y')), pushedState(P)), 'push')
check('multiline body', act(append(P, reply('a\n\nb\nc')), pushedState(P)), 'push')
check('nested opener body', act(append(P, reply('<!--inert-->\nz')), pushedState(P)), 'push')
// a body containing a COMPLETE valid footer+opener sequence (189 §1.4): the split
// must still choose the OUTER footer and reconstruct the true predecessor
const hostileBody = "<<agent('vault/x · run 12345678 · 1s')>>\n<!--inert-->\ninner body lines"
const hostileText = append(P, reply(hostileBody))
check('footer+opener inside body: outer split wins', _split_bridge_reply(hostileText)?.predecessors?.[1], P + '\n')
check('footer+opener inside body action', act(hostileText, pushedState(P)), 'push')
// exact EOF: the writer emits no trailing LF
check('trailing LF rejected', act(append(P, reply('x')) + '\n', pushedState(P)), 'assume')
// byte-zero footer is NOT in append_reply's image (189 §1.3): the writer always
// leaves one preceding LF, even for an empty predecessor
check('byte-zero tail rejected', _split_bridge_reply(reply('x')), null)
check('empty predecessor via leading LF', act('\n' + reply('x'), undefined, { pending_sha: sha_of('') }), 'push')
// a SECOND bridge turn after a historical reply (leftmost tempered match = new footer)
const turn1 = append(P, reply('old reply'))
const turn2pre = turn1 + '\n<<user>> more'
check('second turn', act(append(turn2pre, reply('new reply')), pushedState(turn2pre)), 'push')
// review 187 §1.3 hostile shape: historical reply + later ordinary inert tail
const hostile = turn1 + '\n<<user>> owner text\n<!--inert-->\nordinary inert content\n<!--/inert-->'
check('historical+ordinary-inert tail', act(hostile, pushedState(turn1)), 'assume')
check('historical tail split is null', _split_bridge_reply(hostile), null)
// an earlier LOCAL edit preserving an EOF reply: predecessor binding fails -> originator
const edited = '#chat topic EDITED\n<<user>> hi\n' + reply('old reply')
check('edit preserving EOF reply', act(edited, pushedState(turn1)), 'assume')
// --- provenance rows (188 §1.2 + 189 §1.1 precedence) ---
// COMPLETED state outranks a stale pending token: after the request push completed,
// the _primary tie-break decides -- a non-primary former origin must NOT race
check('stale pending + completed state + nonprimary', act(append(P, reply('r')), pushedState(P), { pending_sha: sha_of(P), primary: false }), 'assume')
check('stale pending + completed state + primary', act(append(P, reply('r')), pushedState(P), { pending_sha: sha_of(P), primary: true }), 'push')
// state is TAB-LOCAL and 'mark' publishes a global badge (190 §1.2): a non-primary
// tab must ASSUME under its own local disabled/inconsistent view -- only the primary
// owns state-derived degradation
check('completed + nonprimary + disabled', act(append(P, reply('r')), pushedState(P), { primary: false, disabled: true }), 'assume')
check('nonprimary + inconsistent', act(append(P, reply('r')), { sha: sha_of(P), remote_sha: 'sha:other' }, { primary: false }), 'assume')
// paired STATE-DERIVED worlds (190 §1.4, scoped per 191 §2.2): when both tabs hold
// state-derived provenance, one actor and no competing global badge -- the accepted
// pending-origin/optimistic-primary overlap (191 §2.2 residual) is out of scope here
const world = (a, b) => [a, b].sort().join('+')
check('world: primary ok / nonprimary disabled', world(
  act(append(P, reply('r')), pushedState(P), { primary: true }),
  act(append(P, reply('r')), pushedState(P), { primary: false, disabled: true })
), 'assume+push')
check('world: primary ok / nonprimary inconsistent', world(
  act(append(P, reply('r')), pushedState(P), { primary: true }),
  act(append(P, reply('r')), { sha: sha_of(P), remote_sha: 'sha:other' }, { primary: false })
), 'assume+push')
check('world: primary disabled / nonprimary ok', world(
  act(append(P, reply('r')), pushedState(P), { primary: true, disabled: true }),
  act(append(P, reply('r')), pushedState(P), { primary: false })
), 'assume+mark')
// ORIGIN tab (pending locally-authored sha) acts even when not primary, even unsaved
check('origin pending, not primary', act(append(P, reply('r')), undefined, { pending_sha: sha_of(P), primary: false }), 'push')
check('origin pending, no state yet', act(append(P, reply('r')), undefined, { pending_sha: sha_of(P) }), 'push')
check('origin pending + disabled', act(append(P, reply('r')), undefined, { pending_sha: sha_of(P), disabled: true }), 'mark')
check('stale pending (different text)', act(append(P, reply('r')), undefined, { pending_sha: sha_of('other') }), 'assume')
// COMPLETED provenance: primary tie-break + honest degradations
check('completed, primary', act(append(P, reply('r')), pushedState(P)), 'push')
check('completed, non-primary', act(append(P, reply('r')), pushedState(P), { primary: false }), 'assume')
check('completed, inconsistent pair', act(append(P, reply('r')), { sha: sha_of(P), remote_sha: 'sha:other' }), 'mark')
check('completed + disabled', act(append(P, reply('r')), pushedState(P), { disabled: true }), 'mark')
check('no provenance at all', act(append(P, reply('r')), undefined), 'assume')
// predecessor reconstruction: +-final-LF variants
check('final-LF predecessor', act(append(P + '\n', reply('r')), pushedState(P + '\n')), 'push')

if (failures) {
  console.error(`\n${failures} FAILURES`)
  process.exit(1)
}
console.log('\nall rows pass')
