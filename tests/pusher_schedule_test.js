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

// failUpdateRef: how many updateRef calls fail as non-fast-forward (true: every one);
// remoteBlobs: the repo's blob sha per path at the head getBranch reports (absent: 404)
function makeWorld({ holdTree = false, failUpdateRef = false, remoteBlobs = {} } = {}) {
  const world = {
    holding: holdTree, // createTree stalls while true (in-flight git write)
    timers: [], // captured setTimeout callbacks (fake timers)
    commits: [], // item file contents of the commit objects created, in order
    pushed: [], // the contents whose ref update succeeded (master actually moved)
    treeWaiters: [], // held createTree resolvers when holdTree
    logs: [],
    item: null,
    failUpdateRef: failUpdateRef === true ? Infinity : Number(failUpdateRef),
    remoteBlobs,
    heads: 0, // getBranch calls: each reports a fresh external head
  }
  const github = {
    git: {
      createTree: async ({ tree }) => {
        world.lastTree = tree
        if (world.holding) await new Promise(resolve => world.treeWaiters.push(resolve))
        return { data: { sha: 'tree' + world.commits.length } }
      },
      createCommit: async () => {
        const content = world.lastTree.find(e => e.path.startsWith('items/'))?.content
        world.commits.push(content)
        return { data: { sha: 'commit' + world.commits.length } }
      },
      updateRef: async ({ sha }) => {
        if (world.failUpdateRef > 0) {
          world.failUpdateRef--
          throw new Error('Update is not a fast forward')
        }
        world.pushed.push(world.commits[Number(sha.replace('commit', '')) - 1])
        return {}
      },
    },
    repos: {
      getBranch: async () => {
        world.heads++
        return { data: { commit: { sha: 'head' + world.heads, commit: { tree: { sha: 'headtree' + world.heads } } } } }
      },
      getContent: async ({ path, ref }) => {
        world.lastContentRef = ref
        const sha = world.remoteBlobs[path]
        if (sha === undefined) throw Object.assign(new Error('Not Found'), { status: 404 })
        return { data: { sha } }
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
    _modal: async () => 'msg',
    _modal_close: async () => {},
    merge: (a, b) => ({ ...a, ...b }),
    encodeBase64: () => '',
    _this: {
      store: { items: {}, github, _push: undefined },
      global_store: { dest: 'o/r', commit_sha: 'c0', tree_sha: 't0' },
      log: (...a) => world.logs.push(['log', ...a]),
      warn: (...a) => world.logs.push(['warn', ...a]),
      error: (...a) => world.logs.push(['error', ...a]),
      debug: () => {},
    },
    _item: id => (id === '#updater' ? undefined : world.item),
  }
  vm.createContext(sandbox)
  vm.runInContext(src, sandbox)
  sandbox._side_push_item = async () => {} // side-push exercised elsewhere
  world.sandbox = sandbox
  world.github = github
  world.item = {
    id: 'session1',
    saved_id: null,
    name: 'chat',
    get text() {
      return world.text
    },
    editing: false,
    saving: false,
    store: { _pusher: { auto_push_disabled: false } },
    read: () => '',
    eval: () => {},
    pushable: false,
  }
  world.text = P
  world.change = (remote, deleted = false) =>
    sandbox._on_item_change('session1', 'chat', 'chat', deleted, remote, false)
  return world
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
    const w = makeWorld({ failUpdateRef: true, remoteBlobs: { 'items/doc1.md': 'external' } })
    w.item.saved_id = 'doc1'
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
  // file at the new head as this tab pushed it, and retries ONCE on the new base
  {
    const w = makeWorld()
    w.item.saved_id = 'doc1'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push // pushed: state P/P on base c0
    w.remoteBlobs['items/doc1.md'] = w.sandbox.github_sha(P) // the repo still holds P
    w.failUpdateRef = 1 // master moved by an external commit: the next updateRef fails
    w.text = P + '\nlocal edit'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    const state = w.sandbox._this.store.items['doc1']
    check('S7 retry scheduled after the refetch, nothing pushed yet', [w.timers.length, w.pushed.length, w.lastContentRef], [1, 1, 'head1'])
    check('S7 base moved to the fetched head', [w.sandbox._this.global_store.commit_sha, w.sandbox._this.global_store.tree_sha], ['head1', 'headtree1'])
    check('S7 not marked, auto-push kept', [w.item.pushable, state.remote_sha === w.sandbox.github_sha(P)], [false, true])
    w.timers.splice(0).forEach(t => t()) // the retry fires
    await flush()
    await w.sandbox._this.store._push
    check('S7 retry pushed the edit once', w.pushed, [P, w.text])
    check('S7 map truthful', state.sha === state.remote_sha && state.sha === w.sandbox.github_sha(w.text), true)
    check('S7 warned once, retrying', w.logs.filter(l => l[0] == 'warn').map(l => /retrying once/.test(l[1])), [true])
  }
  // S8: the external commit changed THIS item's file: no retry, stop and mark as before
  {
    const w = makeWorld()
    w.item.saved_id = 'doc1'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    w.remoteBlobs['items/doc1.md'] = 'changed-elsewhere'
    w.failUpdateRef = 1
    w.text = P + '\nlocal edit'
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    const state = w.sandbox._this.store.items['doc1']
    check('S8 no retry, nothing more pushed', [w.timers.length, w.pushed.length], [0, 1])
    check('S8 lost track and marked', [state.remote_sha, w.item.pushable], [undefined, true])
    check('S8 warned about the changed file', w.logs.some(l => l[0] == 'warn' && l[1].includes('changed items/doc1.md')), true)
  }
  // S9: the retry fails again (master moved once more): disabled after the one retry
  {
    const w = makeWorld({ remoteBlobs: { 'items/doc1.md': undefined } })
    w.item.saved_id = 'doc1'
    w.failUpdateRef = 2 // a never-pushed item: the file is absent at every head (404)
    w.change(false)
    await flush()
    await w.sandbox._this.store._push
    check('S9 first failure retries (absent file matches never pushed)', w.timers.length, 1)
    w.timers.splice(0).forEach(t => t())
    await flush()
    await w.sandbox._this.store._push
    const state = w.sandbox._this.store.items['doc1']
    check('S9 second failure disables, no third try', [w.timers.length, state.remote_sha, w.item.pushable], [0, undefined, true])
    check('S9 warned (again)', w.logs.some(l => l[0] == 'warn' && l[1].includes('(again)')), true)
  }
  if (failures) {
    console.error(`\n${failures} FAILURES`)
    process.exit(1)
  }
  console.log('\nall schedules pass')
}
run()
