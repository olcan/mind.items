#!/usr/bin/env node
// mocked state-transition harness for the bridge-reply auto-push (review 188 §1.4):
// loads the REAL pusher.js into a vm with fake timers, a deferred fake GitHub client,
// and a live fake item, then drives _on_item_change through the production schedules
// the pure table cannot see. No Firestore, real GitHub, or browser.
const fs = require('fs')
const vm = require('vm')
const src = fs.readFileSync(__dirname + '/../pusher.js', 'utf8')

const P = '#chat topic\n<<user>> hi'
const FOOTER = "<<agent('vault/default · run ab12cd34 · $0.03 · 22s')>>"
const reply = body => FOOTER + '\n<!--inert-->\n' + body + '\n<!--/inert-->'
const append = (pre, r) => (pre.endsWith('\n') ? pre : pre + '\n') + r

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}
const flush = () => new Promise(resolve => setImmediate(resolve))

// the fake repo models git's fast-forward rule: createTree applies entries to its base_tree,
// createCommit records the parent, updateRef refuses a commit whose parent is not the head,
// getBranch reports the real head and getContent a path's blob at a commit (404 when absent);
// externalCommit(path, content) is a commit this tab did not make (the vault's item tool)
function makeWorld({ holdTree = false, items = ['session1'] } = {}) {
  const world = {
    holding: holdTree, // createTree stalls while true (in-flight git write)
    timers: [], // captured setTimeout callbacks (fake timers)
    commits: [], // item file contents of the commit objects created, in order
    pushed: [], // the contents whose ref update succeeded (master actually moved)
    submitted: [], // [parent, tree] per commit object created
    treeWaiters: [], // held createTree resolvers when holdTree
    logs: [],
    item: null,
    items: {},
    heads: 0, // getBranch calls
    reads: 0, // getContent calls
    contentRefs: [], // the refs getContent was asked for, in order
    repo: { head: 'c0', commits: { c0: { parent: null, tree: 't0' } }, trees: { t0: {} }, n: 0 },
    getContentError: null, // thrown by getContent when set (a non-404 failure)
    holdingContent: false, // getContent stalls while true (a slow read)
    contentWaiters: [], // held getContent resolvers when holdingContent
    getBranchError: null, // thrown by getBranch when set
    branches: {}, // other refs updated (update_branch after a prune)
  }
  const blob = content => ({ sha: world.sandbox.github_sha(content), content })
  const applied = (base, entries) => {
    const tree = { ...world.repo.trees[base] }
    for (const e of entries) {
      if (e.sha === null) delete tree[e.path]
      else tree[e.path] = blob(e.content)
    }
    return tree
  }
  world.externalCommit = (path, content) => {
    const head = world.repo.head
    const tree = 'xtree' + ++world.repo.n
    world.repo.trees[tree] = applied(world.repo.commits[head].tree, [{ path, content }])
    const sha = 'xcommit' + world.repo.n
    world.repo.commits[sha] = { parent: head, tree }
    world.repo.head = sha
    return sha
  }
  world.fileAtHead = path => world.repo.trees[world.repo.commits[world.repo.head].tree][path]?.content
  const github = {
    git: {
      getTree: async ({ tree_sha }) => ({
        data: { tree: Object.keys(world.repo.trees[tree_sha]).map(path => ({ path, type: 'blob', mode: '100644' })) },
      }),
      createTree: async ({ base_tree, tree }) => {
        world.lastTree = tree
        if (world.holding) await new Promise(resolve => world.treeWaiters.push(resolve))
        const sha = 'tree' + ++world.repo.n
        world.repo.trees[sha] = applied(base_tree, tree)
        return { data: { sha } }
      },
      createCommit: async ({ parents, tree }) => {
        const content = world.lastTree.find(e => e.path.startsWith('items/'))?.content
        world.commits.push(content)
        const sha = 'commit' + world.commits.length
        world.repo.commits[sha] = { parent: parents[0], tree }
        world.submitted.push([parents[0], tree])
        return { data: { sha } }
      },
      updateRef: async ({ ref, sha }) => {
        if (ref !== 'heads/master') return (world.branches[ref] = sha), {} // e.g. last_prune
        if (world.repo.commits[sha].parent !== world.repo.head) throw new Error('Update is not a fast forward')
        world.repo.head = sha
        world.pushed.push(world.commits[Number(sha.replace('commit', '')) - 1])
        return {}
      },
    },
    repos: {
      getBranch: async () => {
        world.heads++
        if (world.getBranchError) throw world.getBranchError
        const head = world.repo.head
        return { data: { commit: { sha: head, commit: { tree: { sha: world.repo.commits[head].tree } } } } }
      },
      getContent: async ({ path, ref }) => {
        world.lastContentRef = ref
        world.reads++
        world.contentRefs.push(ref)
        if (world.getContentError) throw world.getContentError
        const commit = ref === 'heads/master' ? world.repo.head : ref // the live head, or a commit
        const entry = world.repo.trees[world.repo.commits[commit].tree][path]
        // the server answers at the head of the request; a held read delays the answer's delivery
        if (world.holdingContent) await new Promise(resolve => world.contentWaiters.push(resolve))
        if (!entry) throw Object.assign(new Error('Not Found'), { status: 404 })
        return { data: { sha: entry.sha } }
      },
    },
  }
  const sandbox = {
    TextEncoder,
    Date,
    Promise,
    JSON,
    Object,
    Array,
    Math,
    RegExp,
    String,
    console,
    window: { _primary: true },
    setTimeout: fn => world.timers.push(fn),
    _hash_160_sha1: bytes => 'h' + Buffer.from(bytes).toString('hex'),
    _exists: () => true,
    _modal: async () => 'msg', // truthy: a /prune is confirmed
    _modal_close: async () => {},
    _modal_update: () => {},
    alert: msg => world.logs.push(['alert', msg]),
    _items: () => Object.values(world.items),
    merge: (a, b) => ({ ...a, ...b }),
    encodeBase64: () => '',
    _this: {
      store: { items: {}, github, _push: undefined, external_base: false, verified: {} }, // as init leaves it
      global_store: { dest: 'o/r', commit_sha: 'c0', tree_sha: 't0' },
      log: (...a) => world.logs.push(['log', ...a]),
      warn: (...a) => world.logs.push(['warn', ...a]),
      error: (...a) => world.logs.push(['error', ...a]),
      debug: () => {},
    },
    _item: id => (id === '#updater' ? undefined : world.items[id]),
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  sandbox._side_push_item = async () => {} // side-push exercised elsewhere
  world.sandbox = sandbox
  world.github = github
  for (const id of items) {
    world.items[id] = {
      id,
      saved_id: null,
      name: items.length > 1 ? id : 'chat',
      text: P,
      editing: false,
      saving: false,
      store: { _pusher: { auto_push_disabled: false } },
      read: () => '',
      eval: () => {},
      pushable: false,
    }
  }
  world.item = world.items[items[0]] // the one item of the single-item rows (its text: world.text)
  Object.defineProperty(world.item, 'text', { get: () => world.text })
  world.text = P
  world.change = (remote, deleted = false, id = items[0]) =>
    sandbox._on_item_change(id, world.items[id].name, world.items[id].name, deleted, remote, false)
  return world
}

// two pushed items, doc1 (A, its text w.text) and doc2 (B); then an external commit elsewhere
// and an edit of A whose rejected push adopts the external base and retries: A verified there,
// B not yet (as S13 and S15 build by hand)
async function adoptedWorld() {
  const w = makeWorld({ items: ['session1', 'session2'] })
  const A = w.items.session1, B = w.items.session2
  A.saved_id = 'doc1'
  B.saved_id = 'doc2'
  B.text = 'B0'
  w.change(false, false, 'session1')
  await flush()
  await w.sandbox._this.store._push
  w.change(false, false, 'session2')
  await flush()
  await w.sandbox._this.store._push
  w.externalCommit('items/other.md', 'x')
  w.text = P + '\nA1'
  w.change(false, false, 'session1')
  await flush()
  await w.sandbox._this.store._push
  w.timers.splice(0).forEach(t => t())
  await flush()
  await w.sandbox._this.store._push
  return w
}

async function run() {
  // S1 (188 §1.2 schedule 1): local change BEFORE saved_id; reply before the retry
  {
    const w = makeWorld()
    w.change(false) // unsaved: auto_push_item schedules the 1s retry, no state recorded
    check('S1 retry scheduled, nothing pushed', [w.timers.length, w.commits.length], [1, 0])
    w.item.saved_id = 'doc1' // firestore save settles; bridge reads and answers
    w.text = append(P, reply('R1'))
    w.change(true) // reply arrives BEFORE the retry fires
    await flush()
    await w.sandbox._this.store._push
    const state = w.sandbox._this.store.items['doc1']
    check('S1 reply pushed once, mirror = final text', w.commits, [w.text])
    check('S1 map truthful', state.sha === state.remote_sha && state.sha === w.sandbox.github_sha(w.text), true)
    const timers = w.timers.splice(0)
    for (const t of timers) t() // the retry fires later
    await flush()
    await w.sandbox._this.store._push
    check('S1 retry is a no-op (still one commit)', w.commits.length, 1)
  }
  // S2 (schedule 2): reply arrives while the request Git write is IN-FLIGHT
  {
    const w = makeWorld({ holdTree: true })
    w.item.saved_id = 'doc1'
    w.change(false) // request push queued; createTree held
    await flush()
    check('S2 request push in-flight', w.treeWaiters.length, 1)
    w.text = append(P, reply('R2'))
    w.change(true) // reply while awaiting git; origin pending provenance -> push queued
    await flush()
    const stateBefore = w.sandbox._this.store.items['doc1']
    check('S2 no fictional reply state while in-flight', stateBefore?.remote_sha === w.sandbox.github_sha(w.text), false)
    w.holding = false // git recovers
    w.treeWaiters.splice(0).forEach(resolve => resolve())
    await flush()
    await w.sandbox._this.store._push
    await flush()
    const state = w.sandbox._this.store.items['doc1']
    // the in-flight request push captured the PRE-reply text; the queued reply push
    // then lands the final text -- the reply is pushed exactly once, mirror ends final
    // (S6 below exercises the assume/mark mutation-identity claim this row does not)
    check('S2 request commit then reply commit, mirror ends final', w.commits, [P, w.text])
    check('S2 map truthful', state.sha === state.remote_sha && state.sha === w.sandbox.github_sha(w.text), true)
  }
  // S3 (189 §1.1 corrected): the origin loses _primary while its request push is
  // GENUINELY IN FLIGHT -- only then does origin provenance act without primary
  {
    const w = makeWorld({ holdTree: true })
    w.item.saved_id = 'doc1'
    w.change(false) // request push queued; createTree held (state NOT completed)
    await flush()
    w.sandbox.window._primary = false // focus moves to another tab
    w.text = append(P, reply('R3'))
    w.change(true) // reply while in flight: pending provenance -> push
    await flush()
    w.holding = false
    w.treeWaiters.splice(0).forEach(resolve => resolve())
    await flush()
    await w.sandbox._this.store._push
    await flush()
    check('S3 in-flight origin pushes despite losing primary', w.commits, [P, w.text])
  }
  // S3b (189 §1.1): the ordinary completed/non-primary lifecycle -- after the request
  // push completed (which also DELETED its exact pending token, so this world does not
  // exercise stale-token precedence; the pure overlap rows carry that evidence), the
  // non-primary former origin assumes and the primary tab makes it true
  {
    const w = makeWorld()
    w.item.saved_id = 'doc1'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push // request push completed: state P/P
    w.sandbox.window._primary = false
    w.text = append(P, reply('R3b'))
    w.change(true)
    await flush()
    await w.sandbox._this.store._push
    const state = w.sandbox._this.store.items['doc1']
    check('S3b no second commit from the former origin', w.commits.length, 1)
    check('S3b assumption recorded for the primary to make true', state.sha === state.remote_sha && state.sha === w.sandbox.github_sha(w.text), true)
  }
  // S6 (189 §1.4): an ordinary (non-bridge) remote edit while the request push is
  // RUNNING takes the assume branch and must MUTATE the very object the running
  // closure holds -- never replace it
  {
    const w = makeWorld({ holdTree: true })
    w.item.saved_id = 'doc1'
    w.change(false)
    await flush() // closure started: it has read store.items['doc1']
    const held = w.sandbox._this.store.items['doc1']
    held.sentinel = 'held'
    w.text = P + '\nremote ordinary edit'
    w.change(true) // non-bridge remote change -> assume branch
    const after = w.sandbox._this.store.items['doc1']
    check('S6 assume branch mutated the SAME object', after === held && after.sentinel === 'held', true)
    w.holding = false
    w.treeWaiters.splice(0).forEach(resolve => resolve())
    await flush()
    await w.sandbox._this.store._push
    await flush()
    // the completing push records what IT pushed (P) on that same live object; the
    // newer remote text's mirroring belongs to its originator tab (init reconciles)
    check('S6 completing push wrote the same live object, no orphan', held === w.sandbox._this.store.items['doc1'] && held.sha === held.remote_sha && held.sha === w.sandbox.github_sha(P), true)
  }
  // S4: the request push FAILS (external non-fast-forward, the external commits having
  // changed this item's own file: no automatic retry); the reply must MARK, never become
  // reply/reply fiction
  {
    const w = makeWorld()
    w.item.saved_id = 'doc1'
    w.externalCommit('items/doc1.md', 'external text') // the mirror holds a text this tab lacks
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    const afterFail = { ...w.sandbox._this.store.items['doc1'] }
    check('S4 failed push disabled auto-push (lost track)', afterFail.remote_sha, undefined)
    w.text = append(P, reply('R4'))
    w.change(true)
    await flush()
    await w.sandbox._this.store._push
    const state = w.sandbox._this.store.items['doc1']
    check('S4 no fiction: remote_sha stays unset', state.remote_sha, undefined)
    check('S4 badge surfaced', w.item.pushable, true)
  }
  // S5: auto-push disabled -> mark (badge + honest state), no push, no assumption
  {
    const w = makeWorld()
    w.item.saved_id = 'doc1'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    w.item.store._pusher.auto_push_disabled = true
    w.text = append(P, reply('R5'))
    w.change(true)
    await flush()
    const state = w.sandbox._this.store.items['doc1']
    check('S5 no second commit', w.commits.length, 1)
    check('S5 sha recorded, remote_sha honest (request push)', [state.sha === w.sandbox.github_sha(w.text), state.remote_sha === w.sandbox.github_sha(P)], [true, true])
    check('S5 badge surfaced', w.item.pushable, true)
  }
  // S7: an external commit elsewhere in the repo (the vault's item tool committed another
  // item) moved master; the automatic push of a local edit fails once, finds this item's
  // file at the new head as this tab pushed it, and retries ONCE on that head
  {
    const w = makeWorld()
    w.item.saved_id = 'doc1'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push // pushed: state P/P, master at commit1
    const head = w.externalCommit('items/other.md', 'another item') // this item's file untouched
    w.text = P + '\nlocal edit'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    const state = w.sandbox._this.store.items['doc1']
    check('S7 rejected once, retry scheduled, nothing pushed yet', [w.timers.length, w.pushed.length, w.lastContentRef], [1, 1, head])
    check('S7 base moved to the fetched head, session marked external', [w.sandbox._this.global_store.commit_sha, w.sandbox._this.store.external_base], [head, true])
    check('S7 not marked, auto-push kept', [w.item.pushable, state.remote_sha === w.sandbox.github_sha(P)], [false, true])
    w.timers.splice(0).forEach(t => t()) // the retry fires
    await flush()
    await w.sandbox._this.store._push
    check('S7 the retry was built on the fetched head and pushed the edit once', [w.submitted[w.submitted.length - 1][0], w.pushed], [head, [P, w.text]])
    check('S7 map truthful, the other item untouched', [state.sha === state.remote_sha && state.sha === w.sandbox.github_sha(w.text), w.fileAtHead('items/other.md')], [true, 'another item'])
    check('S7 warned once, retrying', w.logs.filter(l => l[0] == 'warn').map(l => /retrying once/.test(l[1])), [true])
  }
  // S8: the external commit changed THIS item's file: no retry, stop and mark as before
  {
    const w = makeWorld()
    w.item.saved_id = 'doc1'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    w.externalCommit('items/doc1.md', 'changed elsewhere')
    w.text = P + '\nlocal edit'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    const state = w.sandbox._this.store.items['doc1']
    check('S8 no retry, nothing more pushed, the external text kept', [w.timers.length, w.pushed.length, w.fileAtHead('items/doc1.md')], [0, 1, 'changed elsewhere'])
    check('S8 lost track and marked', [state.remote_sha, w.item.pushable], [undefined, true])
    check('S8 warned about the changed file', w.logs.some(l => l[0] == 'warn' && l[1].includes('changed items/doc1.md')), true)
  }
  // S9: the one retry is rejected too (master moved again while the retry's tree was being
  // written): no third attempt, the item marked; the durable disabling of a never-pushed
  // item is the inherited limitation (both shas undefined), not this row's claim
  {
    const w = makeWorld()
    w.item.saved_id = 'doc1'
    w.externalCommit('items/other.md', 'x') // master moved before the first push
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    check('S9 first rejection retries (the absent file matches a never-pushed item)', w.timers.length, 1)
    w.holding = true // the retry: its head verified, its tree held...
    w.timers.splice(0).forEach(t => t())
    await flush()
    check('S9 the retry is writing its tree', w.treeWaiters.length, 1)
    w.externalCommit('items/other.md', 'y') // ...and master moves again meanwhile
    w.holding = false
    w.treeWaiters.splice(0).forEach(resolve => resolve())
    await flush()
    await w.sandbox._this.store._push
    const state = w.sandbox._this.store.items['doc1']
    check('S9 second rejection: no third attempt, marked, no further fetch or read', [w.timers.length, state.remote_sha, w.item.pushable, w.heads, w.reads], [0, undefined, true, 1, 1])
    check('S9 warned (again)', w.logs.some(l => l[0] == 'warn' && l[1].includes('(again)')), true)
  }
  // S10 (review 0 B1): two items; an external commit changed B's file while the tab holds
  // B's old text; local edits of A and B are queued together. A's push is rejected, adopts
  // the head and retries once; B's queued push, on that base, must find its file changed and
  // stop and mark, never overwrite; A's retry then lands
  {
    const w = makeWorld({ items: ['session1', 'session2'] })
    const A = w.items.session1, B = w.items.session2
    A.saved_id = 'doc1'
    B.saved_id = 'doc2'
    B.text = 'B0'
    w.change(false, false, 'session1')
    await flush()
    await w.sandbox._this.store._push
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push // both pushed: A P, B B0
    w.externalCommit('items/doc2.md', 'B-external') // B changed in the mirror, the tab not told
    w.text = P + '\nA-local'
    B.text = 'B-local'
    w.change(false, false, 'session1') // queued together, neither awaited
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    const sA = w.sandbox._this.store.items['doc1'], sB = w.sandbox._this.store.items['doc2']
    check('S10 A retries, B refused on the adopted base', [w.timers.length, sB.remote_sha, B.pushable, A.pushable], [1, undefined, true, false])
    check('S10 B-external preserved', w.fileAtHead('items/doc2.md'), 'B-external')
    w.timers.splice(0).forEach(t => t())
    await flush()
    await w.sandbox._this.store._push
    check('S10 A landed on the external head, B still preserved', [w.fileAtHead('items/doc1.md'), w.fileAtHead('items/doc2.md')], [w.text, 'B-external'])
    check('S10 A truthful', sA.sha === sA.remote_sha && sA.sha === w.sandbox.github_sha(w.text), true)
    check('S10 B warned as changed by external commits', w.logs.some(l => l[0] == 'warn' && l[1].includes('items/doc2.md changed by unknown (external)')), true)
  }
  // S14 (the live failure of 2026-09-23): an item CREATED by an external commit and delivered
  // to the tab (assumed pushed) while the session's base, adopted earlier, lags master; a
  // local edit of that item must push, not be marked as changed (a check at the stale base
  // read the file as absent). The read is at the LIVE head; the base being stale, the ref
  // update rejects once and the retry lands on the fetched head.
  {
    const w = makeWorld({ items: ['session1', 'session2'] })
    const A = w.items.session1, B = w.items.session2
    A.saved_id = 'doc1'
    w.change(false, false, 'session1')
    await flush()
    await w.sandbox._this.store._push // A pushed on c0
    w.externalCommit('items/other.md', 'x')
    w.text = P + '\nA edit'
    w.change(false, false, 'session1') // rejected, the head adopted, the retry lands: external base
    await flush()
    await w.sandbox._this.store._push
    w.timers.splice(0).forEach(t => t())
    await flush()
    await w.sandbox._this.store._push
    check('S14 the session adopted an external base', w.sandbox._this.store.external_base, true)
    const created = w.externalCommit('items/doc2.md', 'B created') // the vault's item tool
    B.saved_id = 'doc2'
    B.text = 'B created'
    w.change(true, false, 'session2') // delivered: assumed pushed by its originator
    const sB = w.sandbox._this.store.items['doc2']
    check('S14 the delivered creation assumed pushed', sB.sha === sB.remote_sha && sB.sha === w.sandbox.github_sha('B created'), true)
    B.text = 'B created\ndone'
    w.change(false, false, 'session2') // the owner marks it done
    await flush()
    await w.sandbox._this.store._push
    check('S14 read at the live head, not marked; the stale base rejected once and re-verified at the fetched head, the retry scheduled', [w.contentRefs.slice(-2), B.pushable, w.timers.length], [['heads/master', created], false, 1])
    w.timers.splice(0).forEach(t => t())
    await flush()
    await w.sandbox._this.store._push
    check('S14 the retry landed on the fetched head', [w.fileAtHead('items/doc2.md'), B.pushable, sB.sha === sB.remote_sha, w.submitted[w.submitted.length - 1][0]], ['B created\ndone', false, true, created])
    check('S14 no conflict warned', w.logs.some(l => l[0] == 'warn' && l[1].includes('changed by unknown')), false)
  }
  // S11: a non-404 getContent failure during the check: the push fails and is logged, the
  // item neither marked nor written (a transient error, retried by the next change)
  {
    const w = makeWorld()
    w.item.saved_id = 'doc1'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    w.externalCommit('items/other.md', 'x')
    w.getContentError = Object.assign(new Error('Service Unavailable'), { status: 503 })
    w.text = P + '\nlocal edit'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push.catch(() => {})
    const state = w.sandbox._this.store.items['doc1']
    check('S11 failed without marking or writing', [w.timers.length, w.pushed.length, state.remote_sha === w.sandbox.github_sha(P), w.item.pushable], [0, 1, true, false])
    check('S11 the error logged', w.logs.some(l => l[0] == 'error' && l[1].includes('Service Unavailable')), true)
  }
  // S12: getBranch fails after the rejection: the same, nothing marked or written
  {
    const w = makeWorld()
    w.item.saved_id = 'doc1'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    w.externalCommit('items/other.md', 'x')
    w.getBranchError = new Error('Bad Gateway')
    w.text = P + '\nlocal edit'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push.catch(() => {})
    const state = w.sandbox._this.store.items['doc1']
    check('S12 failed without marking or writing', [w.timers.length, w.pushed.length, state.remote_sha === w.sandbox.github_sha(P), w.item.pushable], [0, 1, true, false])
    check('S12 the error logged', w.logs.some(l => l[0] == 'error' && l[1].includes('Bad Gateway')), true)
  }
  // S13 (review 1 B2): a save lands while the verification read of an automatic push is in
  // flight; the push must write the text it pushes with that text's hash (no false conflict
  // for the queued push, no false badge), and a later edit still pushes. Two items: doc1
  // adopts the external base (verified there), doc2 is the one read at its next push.
  {
    const w = makeWorld({ items: ['session1', 'session2'] })
    const A = w.items.session1, B = w.items.session2
    A.saved_id = 'doc1'
    B.saved_id = 'doc2'
    B.text = 'B0'
    w.change(false, false, 'session1')
    await flush()
    await w.sandbox._this.store._push
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push // both pushed
    w.externalCommit('items/other.md', 'x') // adopt an external base through doc1's retry
    w.text = P + '\nafter external'
    w.change(false, false, 'session1')
    await flush()
    await w.sandbox._this.store._push
    w.timers.splice(0).forEach(t => t())
    await flush()
    await w.sandbox._this.store._push
    check('S13 external base adopted, doc1 verified there, doc2 not', [w.sandbox._this.store.external_base, !!w.sandbox._this.store.verified['items/doc1.md'], !!w.sandbox._this.store.verified['items/doc2.md']], [true, true, false])
    w.holdingContent = true // the verification read of doc2's next push stalls
    B.text = 'B-edit-1'
    w.change(false, false, 'session2')
    await flush()
    check('S13 read in flight', w.contentWaiters.length, 1)
    B.text = 'B-edit-2' // a second save while the read waits: its push queues
    w.change(false, false, 'session2')
    await flush()
    w.holdingContent = false
    w.contentWaiters.splice(0).forEach(resolve => resolve())
    await flush()
    await w.sandbox._this.store._push
    await flush()
    const state = w.sandbox._this.store.items['doc2']
    check('S13 one push, the pushed text and its recorded hash agree', [w.pushed.length, w.fileAtHead('items/doc2.md'), state.sha === state.remote_sha && state.sha === w.sandbox.github_sha(B.text)], [4, B.text, true])
    check('S13 no false conflict', [B.pushable, w.logs.some(l => l[0] == 'warn' && l[1].includes('changed by unknown'))], [false, false])
    const reads = w.reads
    B.text = 'B-edit-3'
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    check('S13 a later edit still pushes, without a read (verified)', [w.fileAtHead('items/doc2.md'), state.sha === state.remote_sha, w.reads], [B.text, true, reads])
  }
  // S15: the read cost. After an adoption, the first push of each item reads once at the live
  // head; a repeat push of a verified item reads nothing; a new adoption forgets the memo
  {
    const w = makeWorld({ items: ['session1', 'session2'] })
    const A = w.items.session1, B = w.items.session2
    A.saved_id = 'doc1'
    B.saved_id = 'doc2'
    B.text = 'B0'
    w.change(false, false, 'session1')
    await flush()
    await w.sandbox._this.store._push
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    check('S15 no reads without an external commit', [w.reads, w.heads], [0, 0])
    w.externalCommit('items/other.md', 'x')
    w.text = P + '\nA1'
    w.change(false, false, 'session1')
    await flush()
    await w.sandbox._this.store._push
    w.timers.splice(0).forEach(t => t())
    await flush()
    await w.sandbox._this.store._push
    check('S15 the adoption fetched the head and read once there, the retry neither', [w.reads, w.heads], [1, 1])
    B.text = 'B1'
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    check('S15 the first push of another item reads once at the live head, no branch read', [w.reads, w.heads, w.lastContentRef, w.fileAtHead('items/doc2.md')], [2, 1, 'heads/master', 'B1'])
    B.text = 'B2'
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    w.text = P + '\nA2'
    w.change(false, false, 'session1')
    await flush()
    await w.sandbox._this.store._push
    check('S15 repeat pushes of verified items read nothing', [w.reads, w.heads, w.fileAtHead('items/doc2.md'), w.fileAtHead('items/doc1.md')], [2, 1, 'B2', w.text])
    w.externalCommit('items/other.md', 'y') // a new adoption forgets the memo
    w.text = P + '\nA3'
    w.change(false, false, 'session1')
    await flush()
    await w.sandbox._this.store._push
    w.timers.splice(0).forEach(t => t())
    await flush()
    await w.sandbox._this.store._push
    B.text = 'B3'
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    check('S15 after a new adoption (one branch read) the other item reads once again', [w.reads, w.heads, w.fileAtHead('items/doc2.md')], [4, 2, 'B3'])
  }
  // S16 (review 4 B3): a deletion's adoption starts a new epoch too. B verified since A's
  // adoption; an external commit changes B; a local deletion of A is rejected, fetches and
  // adopts the head (B-external in it) and lands; B's next save must read and be refused, not
  // skip its verification on the memo and write B over B-external on the adopted base
  {
    const w = await adoptedWorld()
    const B = w.items.session2
    B.text = 'B1'
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    check('S16 B verified at the live head', [!!w.sandbox._this.store.verified['items/doc2.md'], w.fileAtHead('items/doc2.md')], [true, 'B1'])
    w.externalCommit('items/doc2.md', 'B-external')
    w.change(false, true, 'session1') // A deleted locally: its file deleted in the repo
    await flush()
    await w.sandbox._this.store._push
    check('S16 the deletion adopted the head and landed, the memo started over', [w.fileAtHead('items/doc1.md'), w.fileAtHead('items/doc2.md'), w.sandbox._this.store.external_base, Object.keys(w.sandbox._this.store.verified).length], [undefined, 'B-external', true, 0])
    B.text = 'B2'
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    check('S16 B read at the live head, refused and marked, B-external preserved', [w.lastContentRef, B.pushable, w.sandbox._this.store.items['doc2'].remote_sha, w.fileAtHead('items/doc2.md')], ['heads/master', true, undefined, 'B-external'])
    check('S16 B warned as changed by external commits', w.logs.some(l => l[0] == 'warn' && l[1].includes('items/doc2.md changed by unknown (external)')), true)
  }
  // S16b: the same in a session without a prior adoption: the deletion's adoption is the
  // session's first, and B's next save must verify there (the landed pusher wrote B over
  // B-external here too: a deletion adopted the head without starting the verification)
  {
    const w = makeWorld({ items: ['session1', 'session2'] })
    const A = w.items.session1, B = w.items.session2
    A.saved_id = 'doc1'
    B.saved_id = 'doc2'
    B.text = 'B0'
    w.change(false, false, 'session1')
    await flush()
    await w.sandbox._this.store._push
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    w.externalCommit('items/doc2.md', 'B-external')
    w.change(false, true, 'session1')
    await flush()
    await w.sandbox._this.store._push
    check('S16b the first adoption of the session by a deletion', [w.fileAtHead('items/doc1.md'), w.sandbox._this.store.external_base, w.heads], [undefined, true, 1])
    B.text = 'B1'
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    check('S16b B refused and marked, B-external preserved', [B.pushable, w.sandbox._this.store.items['doc2'].remote_sha, w.fileAtHead('items/doc2.md')], [true, undefined, 'B-external'])
  }
  // S17 (review 4 B3): /prune under a push's verification read. B's first push after A's
  // adoption reads at the live head; the server answers at that head but the answer is held;
  // an external commit changes B; /prune scans master (B-external there, items/other.md
  // stale) and is confirmed while the read waits. Its adoption must queue behind the push:
  // B writes on the base its read vouched for and is rejected, then refused at the fetched
  // head; the prune lands on that head. (Adopting the scanned head at once let B's push write
  // its local text on it, over B-external, unmarked.)
  {
    const w = await adoptedWorld()
    const B = w.items.session2
    const base = w.sandbox._this.global_store.commit_sha
    w.holdingContent = true
    B.text = 'B-local'
    w.change(false, false, 'session2')
    await flush()
    check('S17 read in flight, answered at the head before the external commit', [w.contentWaiters.length, w.lastContentRef], [1, 'heads/master'])
    w.externalCommit('items/doc2.md', 'B-external')
    const pruning = w.sandbox._on_command_prune()
    await flush()
    check('S17 the confirmed prune waits for the push before adopting the scanned head', [w.sandbox._this.global_store.commit_sha, w.fileAtHead('items/other.md')], [base, 'x'])
    w.holdingContent = false
    w.contentWaiters.splice(0).forEach(resolve => resolve())
    await pruning
    await flush()
    await w.sandbox._this.store._push
    check('S17 B rejected on its base, refused at the fetched head and marked, B-external preserved, the prune landed', [w.submitted.some(([parent]) => parent === base), B.pushable, w.sandbox._this.store.items['doc2'].remote_sha, w.fileAtHead('items/doc2.md'), w.fileAtHead('items/other.md'), w.fileAtHead('items/doc1.md')], [true, true, undefined, 'B-external', undefined, w.text])
    check('S17 B warned as changed at the fetched head, last_prune moved', [w.logs.some(l => l[0] == 'warn' && l[1].includes('that changed items/doc2.md')), w.branches['heads/last_prune']], [true, w.repo.head])
  }
  // S18: /prune keeps the verified items verified when master is at the base already (no
  // adoption, no read after it), and starts a new epoch when its scanned head holds external
  // commits (one read at the live head for each item's next push)
  {
    const w = await adoptedWorld()
    const B = w.items.session2
    B.text = 'B1'
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push // both verified now
    const reads = w.reads
    await w.sandbox._on_command_prune() // items/other.md is stale, master at the base
    check('S18 pruned at the base: no adoption, the memo kept', [w.fileAtHead('items/other.md'), Object.keys(w.sandbox._this.store.verified).sort(), w.sandbox._this.global_store.commit_sha === w.repo.head], [undefined, ['items/doc1.md', 'items/doc2.md'], true])
    B.text = 'B2'
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    check('S18 no read after a prune at the base', [w.reads, w.fileAtHead('items/doc2.md')], [reads, 'B2'])
    w.externalCommit('items/stale.md', 'y')
    await w.sandbox._on_command_prune() // the scanned head holds the external commit: adopted
    check('S18 pruned after an external commit: adopted, the memo started over', [w.fileAtHead('items/stale.md'), Object.keys(w.sandbox._this.store.verified).length, w.sandbox._this.global_store.commit_sha === w.repo.head], [undefined, 0, true])
    B.text = 'B3'
    w.change(false, false, 'session2')
    await flush()
    await w.sandbox._this.store._push
    check('S18 the next push of an item reads once at the live head and lands', [w.reads, w.lastContentRef, w.fileAtHead('items/doc2.md'), B.pushable], [reads + 1, 'heads/master', 'B3', false])
  }
  if (failures) {
    console.error(`\n${failures} FAILURES`)
    process.exit(1)
  }
  console.log('\nall schedules pass')
}
run()
