#!/usr/bin/env node
// plain-node table for the updater (updater.js): the connectivity retry of the on-load checks
// (`_retry_on_connectivity`: paused-but-pending until a success, one pending retry, triggers
// during the spacing or an attempt never lost, a bounded backoff with no browser event, a
// hidden tab waits, attempts never overlap, a success disarms), the fatal-error classification
// (`is_infra_error`), and `init_updater`'s wiring under stubs (fake firebase, deferred checks,
// writes and dialogs): every install asks (the on-load catch-up and the webhooks queue through
// one confirm-and-write worker), the batch is the ids accepted at the decision, Skip drains
// without memory, a check never interleaves with a batch's writes, a stale instance stamp does
// not skip the dialog, and the REMOVED sources (`REMOVED_SOURCES`: an installed copy of a removed
// path is a removal decided before any token or GitHub call, named apart in the dialog, confirmed
// per item, deleted or kept). run: node external/mind.items/tests/updater_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const src = fs.readFileSync(path.join(__dirname, '..', 'updater.js'), 'utf8')
const pick = names => names.map(name => {
  // a parameter list may span lines (the retry helper's does)
  const m = src.match(new RegExp(`\\n(?:async )?function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n\\}\\n`))
  if (!m) throw new Error(`function ${name} not found in updater.js`)
  return m[0]
})
const consts = ['RETRY_SPACING', 'RETRY_BACKOFF_MAX', 'RETRY_TIMER_ATTEMPTS'].map(name => src.match(new RegExp(`\\nconst ${name} = [^\\n]*\\n`))[0]).join('')
const arrows = ['is_infra_error', 'REMOVED_SOURCES', 'removed_source'].map(name => src.match(new RegExp(`\\nconst ${name} = [\\s\\S]*?\\n\\n`))[0]).join('')
// the helper and the classification alone, no browser
const helpers = { console }
vm.createContext(helpers)
vm.runInContext(pick(['_retry_on_connectivity']).join('\n') + consts + arrows, helpers)
const { _retry_on_connectivity } = helpers
// a top-level `const` of the evaluated source is script-scoped, not a context property: read in place
const RETRY_SPACING = vm.runInContext('RETRY_SPACING', helpers)
const RETRY_TIMER_ATTEMPTS = vm.runInContext('RETRY_TIMER_ATTEMPTS', helpers)
const is_infra_error = vm.runInContext('is_infra_error', helpers)
const REASON = vm.runInContext("REMOVED_SOURCES['chat/fable.md']", helpers) // a removed source's reason

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
  if (!ok) {
    failures++
    console.log(`     expected ${JSON.stringify(expected)}\n     actual   ${JSON.stringify(actual)}`)
  }
}
const tick = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise(resolve => setImmediate(resolve))
}

// a fake browser: listeners by event dispatched WITHOUT awaiting them (as the browser does), a
// clock, fake timers advanced by the clock, the visibility state
const browser = () => {
  const listeners = { online: new Set(), visibilitychange: new Set() }
  const timers = new Map()
  let next_timer = 1
  const env = {
    time: 1_000_000,
    now: () => env.time,
    setTimeout: (fn, delay) => {
      const id = next_timer++
      timers.set(id, { fn, at: env.time + delay })
      return id
    },
    clearTimeout: id => timers.delete(id),
    window: { addEventListener: (t, f) => listeners[t].add(f), removeEventListener: (t, f) => listeners[t].delete(f) },
    document: {
      visibilityState: 'visible',
      addEventListener: (t, f) => listeners[t].add(f),
      removeEventListener: (t, f) => listeners[t].delete(f),
    },
    armed: () => [listeners.online.size, listeners.visibilitychange.size],
    pending: () => timers.size,
    fire: event => {
      for (const f of [...listeners[event]]) f()
    },
    advance: async ms => {
      env.time += ms
      for (const [id, t] of [...timers]) {
        if (t.at <= env.time) {
          timers.delete(id)
          t.fn()
          await tick()
        }
      }
      await tick()
    },
  }
  return env
}
// a run whose outcomes are scripted: `null` succeeds, an error fails, a function defers
const scripted = outcomes => {
  const state = { runs: 0, pending: null }
  const run = () => {
    state.runs++
    const outcome = outcomes.shift()
    if (typeof outcome == 'function') return new Promise((resolve, reject) => (state.pending = { resolve, reject }))
    return outcome ? Promise.reject(outcome) : Promise.resolve()
  }
  return { run, state }
}
const logger = logs => ({ log: m => logs.push(['log', m]), warn: m => logs.push(['warn', m]) })
const failed = new Error('HttpError: Failed to fetch')
const PAUSED = ['warn', 'update checks paused (Error: HttpError: Failed to fetch); retrying when the connection returns']

const retry_rows = async () => {
  {
    const env = browser()
    const logs = []
    const { run, state } = scripted([null])
    await _retry_on_connectivity(run, logger(logs), env)
    check('success: one run, nothing armed, no timer, nothing logged', [state.runs, env.armed(), env.pending(), logs], [1, [0, 0], 0, []])
  }
  {
    // early recovery: the connection returns 1 s after the failure; the retry is not dropped,
    // it runs at the end of the spacing (one pending retry, the backoff timer replaced)
    const env = browser()
    const logs = []
    const { run, state } = scripted([failed, null])
    await _retry_on_connectivity(run, logger(logs), env)
    check('failure: paused with the resume in the message, triggers armed, a backoff timer pending', [logs, env.armed(), env.pending()], [[PAUSED], [1, 1], 1])
    await env.advance(1_000)
    env.fire('online')
    await tick()
    check('early online: no attempt yet, one pending retry', [state.runs, env.pending()], [1, 1])
    await env.advance(RETRY_SPACING)
    check('the spacing over: the retry ran, succeeded, disarmed, no timer', [state.runs, env.armed(), env.pending()], [2, [0, 0], 0])
    check('the retry logged', logs.slice(1), [['log', 'retrying update checks']])
  }
  {
    // recovery during an outstanding attempt: the trigger is honored after the attempt fails
    const env = browser()
    const logs = []
    const { run, state } = scripted([failed, () => {}, null])
    await _retry_on_connectivity(run, logger(logs), env)
    await env.advance(RETRY_SPACING) // the backoff timer: the second attempt starts, deferred
    check('the timer retried: an attempt in flight', [state.runs, !!state.pending], [2, true])
    env.fire('online') // the connection returns while the request is still out
    await tick()
    check('a trigger during an attempt starts nothing', state.runs, 2)
    state.pending.reject(failed)
    await tick()
    check('the attempt failed: the trigger honored as one pending retry', [state.runs, env.pending()], [2, 1])
    await env.advance(RETRY_SPACING)
    check('then the retry ran and succeeded', [state.runs, env.armed(), env.pending()], [3, [0, 0], 0])
  }
  {
    // recovery without any browser event: the bounded backoff timer retries on its own
    const env = browser()
    const logs = []
    const { run, state } = scripted([failed, failed, failed, null])
    await _retry_on_connectivity(run, logger(logs), env)
    await env.advance(RETRY_SPACING) // 30 s
    await env.advance(RETRY_SPACING * 2) // 60 s
    await env.advance(RETRY_SPACING * 4) // 120 s
    check('the backoff retried on its own until a success', [state.runs, env.armed(), env.pending()], [4, [0, 0], 0])
    check('every retry logged, every failure repeated the pause', logs.map(l => l[0]), ['warn', 'log', 'warn', 'log', 'warn', 'log'])
  }
  {
    // a hidden tab: timers and events wait for the tab to be shown again
    const env = browser()
    const logs = []
    const { run, state } = scripted([failed, null])
    await _retry_on_connectivity(run, logger(logs), env)
    env.document.visibilityState = 'hidden'
    await env.advance(RETRY_SPACING)
    env.fire('online')
    await tick()
    check('hidden: nothing ran', [state.runs, env.armed()], [1, [1, 1]])
    env.document.visibilityState = 'visible'
    env.fire('visibilitychange')
    await tick()
    check('shown again: the retry ran and succeeded', [state.runs, env.armed(), env.pending()], [2, [0, 0], 0])
  }
  {
    // the timer-driven attempts are bounded; events keep retrying afterwards
    const env = browser()
    const logs = []
    const outcomes = Array.from({ length: RETRY_TIMER_ATTEMPTS + 1 }, () => failed)
    outcomes.push(null)
    const { run, state } = scripted(outcomes)
    await _retry_on_connectivity(run, logger(logs), env)
    for (let i = 0; i < RETRY_TIMER_ATTEMPTS + 2; i++) await env.advance(11 * 60_000)
    check('the timer stopped after its bound, the listeners stayed', [state.runs, env.pending(), env.armed()], [RETRY_TIMER_ATTEMPTS + 1, 0, [1, 1]])
    env.fire('online')
    await tick()
    check('an event still retries, and the success disarms', [state.runs, env.armed()], [RETRY_TIMER_ATTEMPTS + 2, [0, 0]])
  }
  check('infra: a plain fetch failure', is_infra_error(new TypeError('Failed to fetch')), true)
  check('infra: safari wording', is_infra_error({ message: 'Load failed' }), true)
  check('infra: a rate limit', is_infra_error({ status: 403, message: 'rate limit' }), true)
  check('infra: a server error', is_infra_error({ status: 502, message: 'bad gateway' }), true)
  check('item-specific: a missing file', is_infra_error({ status: 404, message: 'Not Found' }), false)
}

// init_updater under stubs: the items, their checks and writes, the dialogs, the webhooks;
// `real_check` runs the REAL check_updates (its GitHub client faked: page.github) instead of
// the stub, for the check's own side effects (the pushable mark); `real_update` the REAL
// update_item (its removal branch: the confirm and the item's `delete`)
const wiring = ({ real_check = false, real_update = false } = {}) => {
  const page = {
    logs: [],
    writes: [], // [item name, the updates written]
    modals: [], // { content, resolve, promise }
    closes: 0, // _modal_close calls
    updates: [], // _modal_update texts
    checks: [], // [item name, mark_pushables]
    items: {},
    answers: {}, // item name -> the updates a check returns (a function defers)
    webhook: null, // the listener's callback
    time: 5_000_000,
    github: null, // real_check: { repos: { listCommits, getCommit } } fakes
    pusher: null, // { store: { _push } }: a #pusher with a push in flight
  }
  const item = (name, id) => (page.items[id] = { id, name, attr: { source: 'github', owner: 'o', repo: 'r', branch: 'master', path: `${name.slice(1)}.md` }, global_store: {} })
  const env = {
    window: { addEventListener() {}, removeEventListener() {}, _init_time: 42 },
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    now: () => page.time,
    setTimeout: () => 1, // never fires here: the rows drive the triggers
    clearTimeout() {},
  }
  const context = {
    console,
    window: env.window,
    document: env.document,
    setTimeout: env.setTimeout,
    clearTimeout: env.clearTimeout,
    Date: { now: () => page.time },
    _this: {
      name: '#updater',
      store: {},
      global_store: {},
      log: m => page.logs.push(['log', m]),
      warn: m => page.logs.push(['warn', m]),
      error: m => page.logs.push(['error', m]),
      debug: () => {},
      fatal: m => { throw new Error(m) },
    },
    github_token: async () => 'token',
    github_client: () => page.github,
    github_sha: text => 'h:' + text, // the real one hashes; the comparison is what matters
    empty: x => Object.keys(x ?? {}).length == 0,
    size: x => Object.keys(x ?? {}).length,
    keys: Object.keys,
    _labels: fn => Object.values(page.items).map(i => i.name).filter(name => fn(name, [1])),
    _item: (id, opts) => (id == '#pusher' ? page.pusher : page.items[id] ?? Object.values(page.items).find(i => i.name == id)),
    _modal: ({ content }) => {
      const modal = { content }
      modal.promise = new Promise(resolve => (modal.resolve = v => { modal.resolved = true; resolve(v) }))
      page.modals.push(modal)
      return modal.promise
    },
    _modal_update: (modal, content) => page.updates.push(content),
    _modal_close: promise => {
      // as the app: closing resolves undefined; with no argument EVERY open dialog is closed
      // (the pusher does that before its commit prompt)
      page.closes++
      const targets = promise ? [page.modals.find(m => m.promise === promise)] : page.modals.filter(m => !m.resolved)
      for (const m of targets) {
        m.resolved = true
        m.resolve(undefined)
      }
    },
    values: Object.values,
    entries: Object.entries,
    check_updates: (it, mark = false) => {
      page.checks.push([it.name, mark])
      const answer = page.answers[it.name]
      if (typeof answer == 'function') return answer()
      if (answer instanceof Error) return Promise.reject(answer)
      return Promise.resolve(answer ?? null)
    },
    update_item: (it, updates) => {
      page.writes.push([it.name, updates])
      return Promise.resolve(true)
    },
    firebase: {
      firestore: {
        getFirestore: () => ({}),
        collection: () => ({}),
        where: () => ({}),
        query: () => ({}),
        onSnapshot: (q, cb) => (page.webhook = cb),
      },
    },
  }
  vm.createContext(context)
  if (real_check) vm.runInContext(pick(['check_updates']).join('\n') + '\nasync function pace_github_call() {}', context) // the declaration replaces the stub
  if (real_update) vm.runInContext(pick(['update_item']).join('\n'), context)
  vm.runInContext(pick(['init_updater', '_retry_on_connectivity', '_on_global_store_change']).join('\n') + consts + arrows + "\nconst installed_named_items = () => _labels((_, ids) => ids.length == 1).map(label => _item(label)).filter(item => item.attr?.source)\n", context)
  page.init = () => vm.runInContext('init_updater()', context)
  page.push = (name, sha) => page.webhook({ docChanges: () => [{ type: 'added', doc: { data: () => ({ body: { ref: 'refs/heads/master', after: sha, before: 'x', repository: { name: 'r', owner: { login: 'o' } }, commits: [{ id: sha, message: 'm', modified: [`${name.slice(1)}.md`] }] } }) } }] })
  page.answer = ok => page.modals[page.modals.length - 1].resolve(ok)
  // another tab completed the item's update: its global store carries the marker, the
  // path -> commit snapshot it wrote (a string stands for a one-path marker at that commit)
  page.remote = (name, marker) => {
    const it = Object.values(page.items).find(i => i.name == name)
    it.global_store._updater = { last_update: typeof marker == 'string' ? { file: marker } : marker }
    page.context._on_global_store_change(it.id, true)
  }
  page.store = () => page.context._this.store
  page.item = item
  page.context = context
  return page
}

const wiring_rows = async () => {
  {
    // startup: an item with an update queues a dialog; nothing is written before the answer
    const page = wiring()
    page.item('#todoer', 'i1')
    page.answers['#todoer'] = { v: 2 }
    await page.init()
    await tick()
    check('startup: the item checked with mark_pushables', page.checks, [['#todoer', true]])
    check('startup: one dialog, no write yet', [page.modals.map(m => m.content), page.writes], [['#updater is ready to update 1 installed item: #todoer'], []])
    page.answer(true)
    await tick()
    check('Update: re-checked, then written once', [page.checks.length, page.writes], [2, [['#todoer', { v: 2 }]]])
    check('the modal cleared', page.context._this.store.update_modal, null)
  }
  {
    // Skip: nothing written, the queue drained, and the same commit delivered again asks again
    const page = wiring()
    page.item('#todoer', 'i1')
    await page.init()
    await tick()
    page.push('#todoer', 'sha1')
    await tick()
    check('a push: one dialog', page.modals.length, 1)
    page.answer(false)
    await tick()
    check('Skip: no write, a warning, the queue drained', [page.writes, page.logs.filter(l => l[0] == 'warn').length, page.context._this.store.modified_ids], [[], 1, []])
    page.push('#todoer', 'sha1')
    await tick()
    check('the same commit again: asked again (no skip memory)', page.modals.length, 2)
  }
  {
    // a push while the dialog is open joins it; a push after the answer waits for the next dialog
    const page = wiring()
    page.item('#todoer', 'i1')
    page.item('#pusher2', 'i2')
    page.item('#c', 'i3')
    page.answers['#todoer'] = { v: 2 }
    page.answers['#pusher2'] = { v: 3 }
    await page.init() // the catch-up finds updates for two of the three items
    await tick()
    check('the catch-up dialog names both items', page.modals[0].content, '#updater is ready to update 2 installed items: #todoer, #pusher2')
    // a push for #todoer while the dialog is open: already queued, the dialog unchanged
    page.push('#todoer', 'sha2')
    await tick()
    check('a push for a queued item: no second dialog, no text change', [page.modals.length, page.updates], [1, []])
    // a push for a third item while the dialog is open: it joins the dialog (the text follows)
    page.answers['#c'] = { v: 4 }
    page.push('#c', 'shac')
    await tick()
    check('a push for a new item joins the open dialog', [page.modals.length, page.updates], [1, ['#updater is ready to update 3 installed items: #todoer, #pusher2, #c']])
    // the writes are deferred: a push arriving after the answer must wait for the next dialog
    let release
    page.context.update_item = (it, updates) => new Promise(resolve => { page.writes.push([it.name, updates]); release = resolve })
    page.answer(true)
    await tick()
    check('accepted: the first write in flight', page.writes.map(w => w[0]), ['#todoer'])
    page.push('#pusher2', 'sha3') // after the acceptance: not part of this batch's approval
    await tick()
    check('a push after acceptance: queued, no dialog while the batch writes', [page.modals.length, page.store().modified_ids], [1, ['i2']])
    for (let i = 0; i < 3; i++) {
      release(true) // each item of the batch
      await tick()
    }
    check('the batch written, then a NEW dialog for the late push', [page.writes.map(w => w[0]), page.modals.length], [['#todoer', '#pusher2', '#c'], 2])
  }
  {
    // a push overlapping a RETRIED scan (the listener is attached by then): the catch-up fails
    // offline, the connection returns, the retried scan's check is outstanding (a slow GitHub)
    // when the push arrives; the push's worker waits on the scan (no check or write overtakes
    // it), then one dialog asks once and the write is of the latest version (a re-check at the
    // write). Removing the scan's publication (`store._scan = scan`) fails this row
    const page = wiring()
    page.item('#todoer', 'i1')
    page.answers['#todoer'] = new TypeError('Failed to fetch')
    let online
    page.context.window.addEventListener = (t, f) => { if (t == 'online') online = f }
    await page.init()
    await tick()
    let resolve_check
    page.answers['#todoer'] = () => new Promise(resolve => (resolve_check = resolve))
    page.time += 60_000
    online()
    await tick()
    check('the retried scan\'s check is outstanding', [page.checks.length, page.modals.length], [2, 0])
    page.push('#todoer', 'sha2')
    await tick()
    check('a push during the scan: queued, its worker waits (no check, no dialog)', [page.checks.length, page.modals.length, page.store().modified_ids], [2, 0, ['i1']])
    page.answers['#todoer'] = { v: 2 } // GitHub moved on by the time of the write's re-check
    resolve_check({ v: 1 })
    await tick()
    check('the scan released: one dialog for the item, the push\'s sha kept', [page.modals.length, page.store().pending_updates], [1, { i1: 'sha2' }])
    page.answer(true)
    await tick()
    check('written once, with the version of the re-check (never the stale one)', page.writes, [['#todoer', { v: 2 }]])
  }
  {
    // a stale instance stamp (the removed skip) does not skip the dialog
    const page = wiring()
    page.item('#todoer', 'i1')
    page.context._this.global_store.auto_updater_init_time = 42 // == window._init_time
    await page.init()
    await tick()
    page.push('#todoer', 'sha1')
    await tick()
    check('a stale stamp equal to the instance: still asked', page.modals.length, 1)
  }
  {
    // R1: a fatal error at the write HOLDS the batch: nothing prompts or requests again on its
    // own; the next push re-queues the held work (asked again with it)
    const page = wiring()
    page.item('#todoer', 'i1')
    page.item('#c', 'i3')
    await page.init()
    await tick()
    page.push('#todoer', 'sha1')
    await tick()
    page.answers['#todoer'] = new TypeError('Failed to fetch')
    page.answer(true)
    await tick()
    check('a failed batch: held, no repeat dialog or request, the stop logged', [page.modals.length, page.checks.length, page.store().held_updates, page.store().modified_ids, page.logs.filter(l => l[0] == 'error').map(l => l[1])], [1, 3, { i1: 'sha1' }, [], ['update batch stopped (TypeError: Failed to fetch); the remaining items update on the next push, /update, or page load']])
    page.answers['#todoer'] = { v: 2 }
    page.push('#c', 'shac')
    await tick()
    check('the next push re-queues the held work with it', [page.modals.length, page.modals[1].content, page.store().held_updates], [2, '#updater is ready to update 2 installed items: #todoer, #c', {}])
  }
  {
    // R1: a worker already scheduled before the failure (a duplicate webhook) finds nothing
    const page = wiring()
    page.item('#todoer', 'i1')
    await page.init()
    await tick()
    page.push('#todoer', 'sha1')
    page.push('#todoer', 'sha1') // delivered twice: a second worker queued behind the first
    await tick()
    page.answers['#todoer'] = new TypeError('Failed to fetch')
    page.answer(true)
    await tick()
    check('a duplicate push\'s worker after the failure: no dialog, the work stays held', [page.modals.length, page.store().held_updates, page.store().modified_ids], [1, { i1: 'sha1' }, []])
  }
  {
    // R1: A+B accepted, A's check outstanding, a newer push for B, then A fails: B's newer
    // queue entry supersedes its held one (unique ids: held keeps A, the queue keeps B)
    const page = wiring()
    page.item('#a', 'i1')
    page.item('#b', 'i2')
    await page.init()
    await tick()
    page.push('#a', 'sha1')
    page.push('#b', 'sha1b')
    await tick()
    let reject_check
    page.answers['#a'] = () => new Promise((resolve, reject) => (reject_check = reject))
    page.answers['#b'] = { v: 2 }
    page.answer(true)
    await tick()
    page.push('#b', 'sha2')
    await tick()
    reject_check(new TypeError('Failed to fetch'))
    await tick()
    check('A failed with a newer B queued: A held, B queued once with the newer sha, B asked', [page.store().held_updates, page.store().modified_ids, page.store().pending_updates, page.modals.map(m => m.content)], [{ i1: 'sha1' }, ['i2'], { i2: 'sha2' }, ['#updater is ready to update 2 installed items: #a, #b', '#updater is ready to update 1 installed item: #b']])
  }
  {
    // R2: an accepted item another tab completes before its write starts is skipped (the
    // remote completion cancels it); an unrelated queued item survives
    const page = wiring()
    page.item('#a', 'i1')
    page.item('#b', 'i2')
    page.item('#c', 'i3')
    await page.init()
    await tick()
    page.push('#a', 'sha1')
    page.push('#b', 'sha1b')
    await tick()
    page.answers['#a'] = { v: 2 }
    page.answers['#b'] = { v: 2 }
    page.answers['#c'] = { v: 2 }
    let release
    page.context.update_item = (it, updates) => new Promise(resolve => { page.writes.push([it.name, updates]); release = resolve })
    page.answer(true)
    await tick()
    page.push('#c', 'shac')
    await tick()
    page.remote('#b', 'sha1b')
    check('B done remotely while A writes: cancelled from the accepted batch (A started), C still queued', [page.logs.filter(l => l[1] == 'detected remote update for #b').length, page.store().accepted_updates, page.store().modified_ids], [1, {}, ['i3']])
    release(true)
    await tick()
    check('A written, B skipped (no check, no write), then C asked', [page.writes.map(w => w[0]), page.checks.filter(c => c[0] == '#b' && !c[1]).length, page.logs.filter(l => l[1] == 'update of #b done remotely; skipped').length, page.modals.map(m => m.content)], [['#a'], 0, 1, ['#updater is ready to update 2 installed items: #a, #b', '#updater is ready to update 1 installed item: #c']])
  }
  {
    // R2: an accepted item does not consume a later queue entry's pending state: the newer
    // push keeps its sha, and its matching remote completion dismisses the next dialog
    const page = wiring()
    page.item('#a', 'i1')
    page.item('#b', 'i2')
    await page.init()
    await tick()
    page.push('#a', 'sha1')
    page.push('#b', 'sha1b')
    await tick()
    page.answers['#a'] = { v: 2 }
    page.answers['#b'] = { v: 2 }
    let release
    page.context.update_item = (it, updates) => new Promise(resolve => { page.writes.push([it.name, updates]); release = resolve })
    page.answer(true)
    await tick()
    page.push('#b', 'sha2')
    await tick()
    release(true) // A
    await tick()
    release(true) // B (the accepted entry)
    await tick()
    check('the batch written; the later B entry keeps its own sha and asks anew', [page.writes.map(w => w[0]), page.store().pending_updates, page.modals.length, page.store().update_modal != null], [['#a', '#b'], { i2: 'sha2' }, 2, true])
    page.remote('#b', 'sha2')
    await tick()
    check('its remote completion dismisses the dialog (nothing skipped, nothing written)', [page.closes, page.store().modified_ids, page.store().pending_updates, page.writes.length, page.logs.filter(l => l[0] == 'warn').length], [1, [], {}, 2, 0])
  }
  {
    // F1: a completion of an OLDER accepted version cancels that entry alone: the newer
    // queued entry (a later push) keeps its dialog and runs
    const page = wiring()
    page.item('#a', 'i1')
    page.item('#b', 'i2')
    await page.init()
    await tick()
    page.push('#a', 'sha1')
    page.push('#b', 'b1')
    await tick()
    page.answers['#a'] = { v: 2 }
    page.answers['#b'] = { v: 2 }
    let release
    page.context.update_item = (it, updates) => new Promise(resolve => { page.writes.push([it.name, updates]); release = resolve })
    page.answer(true)
    await tick()
    page.push('#b', 'b2')
    await tick()
    page.remote('#b', 'b1')
    check('the older accepted B cancelled, the newer queued B kept', [page.store().accepted_updates, page.store().modified_ids, page.store().pending_updates], [{}, ['i2'], { i2: 'b2' }])
    release(true) // A
    await tick()
    check('A written, the accepted B skipped, the newer B asked', [page.writes.map(w => w[0]), page.modals.map(m => m.content)], [['#a'], ['#updater is ready to update 2 installed items: #a, #b', '#updater is ready to update 1 installed item: #b']])
    page.answer(true)
    await tick()
    check('the newer B written after its own decision', page.writes.map(w => w[0]), ['#a', '#b'])
  }
  {
    // F2: a completion arriving DURING an accepted item's write-time check skips the write
    const page = wiring()
    page.item('#a', 'i1')
    await page.init()
    await tick()
    page.push('#a', 'sha1')
    await tick()
    let resolve_check
    page.answers['#a'] = () => new Promise(resolve => (resolve_check = resolve))
    page.answer(true)
    await tick()
    page.remote('#a', 'sha1')
    check('cancelled during the check', page.store().accepted_updates, {})
    resolve_check({ v: 2 })
    await tick()
    check('the check returned an update, nothing written, the skip logged', [page.writes, page.logs.filter(l => l[1] == 'update of #a done remotely; skipped').length], [[], 1])
  }
  {
    // an entry cancelled before starting is not resurrected as held when a later item fails
    const page = wiring()
    page.item('#a', 'i1')
    page.item('#b', 'i2')
    page.item('#c', 'i3')
    await page.init()
    await tick()
    page.push('#a', 'sha1')
    page.push('#b', 'b1')
    await tick()
    let reject_check
    page.answers['#a'] = () => new Promise((resolve, reject) => (reject_check = reject))
    page.answer(true)
    await tick()
    page.remote('#b', 'b1')
    reject_check(new TypeError('Failed to fetch'))
    await tick()
    check('A failed after B was cancelled: A held alone', page.store().held_updates, { i1: 'sha1' })
    page.answers['#a'] = { v: 2 }
    page.answers['#c'] = { v: 2 }
    page.push('#c', 'shac')
    await tick()
    check('the next push asks for A and C, not B', page.modals[1].content, '#updater is ready to update 2 installed items: #a, #c')
  }
  {
    // an ordinary remote store change of an installed item with no updater marker (never
    // updated yet) neither throws nor touches the queue (the handler called directly: the
    // `remote` helper manufactures a completion marker)
    const page = wiring()
    page.item('#a', 'i1')
    await page.init()
    await tick()
    page.items.i1.global_store = { setting: 1 }
    page.context._on_global_store_change('i1', true)
    check('no marker, nothing queued: no exception, no updater action', [page.logs.filter(l => l[1].startsWith('detected')).length, page.closes], [0, 0])
    page.push('#a', 'sha1')
    await tick()
    page.context._on_global_store_change('i1', true)
    check('no marker, the item queued: the entry and its dialog untouched', [page.store().modified_ids, page.store().pending_updates, page.closes, page.store().update_modal != null], [['i1'], { i1: 'sha1' }, 0, true])
  }
  {
    // the catch-up's find is queued under the check's path -> commit snapshot, so a completion
    // elsewhere (another tab installing it: its marker is the snapshot it wrote) dismisses the
    // startup dialog only when it covers every path at the same commit: a marker of another
    // commit, or of a subset of the paths, or an older embed leaves the entry pending
    const page = wiring()
    page.item('#todoer', 'i1')
    page.item('#c', 'i3')
    page.answers['#todoer'] = { 'todoer.md': 'm1', 'embed.js': 'e2' } // the item and an embed
    page.answers['#c'] = { 'first.js': 'f1', 'second.js': 's2' } // embed-only, two paths
    await page.init()
    await tick()
    check('the startup finds queued under their snapshots', page.store().pending_updates, { i1: { 'todoer.md': 'm1', 'embed.js': 'e2' }, i3: { 'first.js': 'f1', 'second.js': 's2' } })
    page.remote('#todoer', { 'todoer.md': 'm0', 'embed.js': 'e2' }) // another commit of the item
    page.remote('#todoer', { 'todoer.md': 'm1', 'embed.js': 'e1' }) // the item's commit, an older embed
    page.remote('#todoer', { 'todoer.md': 'm1' }) // the item's commit alone
    page.remote('#c', { 'first.js': 'f1', 'second.js': 's1' }) // one of two embeds
    check('partial completions: nothing dismissed, the dialog untouched', [page.store().modified_ids, page.updates, page.closes, page.logs.filter(l => l[1].startsWith('detected')).length], [['i1', 'i3'], [], 0, 0])
    page.remote('#todoer', { 'todoer.md': 'm1', 'embed.js': 'e2', 'other.js': 'o1' }) // covers every path (and more)
    check('a covering completion: dismissed from the dialog', [page.store().modified_ids, page.updates], [['i3'], ['#updater is ready to update 1 installed item: #c']])
    page.remote('#c', { 'first.js': 'f1', 'second.js': 's2' })
    await tick()
    check('the last one done elsewhere too: the dialog closed, nothing written or skipped-warned', [page.closes, page.store().update_modal, page.writes, page.logs.filter(l => l[0] == 'warn').length], [1, null, [], 0])
  }
  {
    // C2: a held scan entry is refreshed by the recovery scan's fresher snapshot (a push's
    // key would be kept): the initial scan finds A at m1 then fails on B; the initial empty
    // snapshot starts A's worker whose accepted check fails (A held at m1); the recovery scan
    // lists A at m2: the dialog's entry is m2, a delayed completion at m1 leaves it pending
    const page = wiring()
    page.item('#a', 'i1')
    page.item('#b', 'i2')
    page.answers['#a'] = { 'a.md': 'm1' }
    page.answers['#b'] = new TypeError('Failed to fetch')
    let online
    page.context.window.addEventListener = (t, f) => { if (t == 'online') online = f }
    await page.init()
    await tick()
    page.webhook({ docChanges: () => [] }) // the listener's initial snapshot
    await tick()
    check('A found before the scan paused: asked', [page.modals.length, page.store().pending_updates], [1, { i1: { 'a.md': 'm1' } }])
    page.answers['#a'] = new TypeError('Failed to fetch')
    page.answer(true)
    await tick()
    check('A\'s accepted check failed: held under its snapshot', page.store().held_updates, { i1: { 'a.md': 'm1' } })
    page.answers['#a'] = { 'a.md': 'm2' }
    page.answers['#b'] = null
    page.time += 60_000
    online()
    await tick()
    check('the recovery scan refreshed the held evidence: asked at m2', [page.modals.length, page.store().pending_updates, page.store().held_updates], [2, { i1: { 'a.md': 'm2' } }, {}])
    page.remote('#a', { 'a.md': 'm1' }) // a delayed completion of the OLD find
    check('the old completion leaves the m2 entry pending', [page.store().modified_ids, page.closes], [['i1'], 0])
    page.answer(true)
    await tick()
    check('Update: m2 written', page.writes, [['#a', { 'a.md': 'm2' }]])
  }
  {
    // S1: a push during a RETRIED scan with workers scheduled meanwhile (an empty listener
    // callback, then a relevant push) does not wait for the scan: the worker's wait for the
    // scan and its dialog are published as store._worker, never as store._update, which
    // #pusher waits on (pusher.js: `Promise.allSettled([_push, updater.store._update])`);
    // the writes alone are (from the decision on). One dialog, the re-checked version written
    const page = wiring()
    page.item('#todoer', 'i1')
    page.answers['#todoer'] = new TypeError('Failed to fetch')
    let online
    page.context.window.addEventListener = (t, f) => { if (t == 'online') online = f }
    await page.init()
    await tick()
    let resolve_check
    page.answers['#todoer'] = () => new Promise(resolve => (resolve_check = resolve))
    page.time += 60_000
    online()
    await tick()
    page.webhook({ docChanges: () => [] }) // an empty callback schedules a worker
    page.push('#todoer', 'sha2') // a relevant one too
    await tick()
    let pushed = false
    Promise.allSettled([page.store()._update]).then(() => (pushed = true)) // the pusher's wait
    await tick()
    check('the retried scan pending, workers scheduled: a push proceeds, no dialog yet', [pushed, page.modals.length, page.checks.length], [true, 0, 2])
    page.answers['#todoer'] = { v: 2 }
    resolve_check({ v: 1 })
    await tick()
    check('the scan released: one dialog', page.modals.length, 1)
    pushed = false
    Promise.allSettled([page.store()._update]).then(() => (pushed = true))
    await tick()
    check('the dialog open: a push proceeds', pushed, true)
    page.answer(true)
    await tick()
    check('Update: written once with the re-checked version', page.writes, [['#todoer', { v: 2 }]])
  }
  {
    // S2 (the real check_updates): a manual /update landing while the scan's getCommit is
    // outstanding: the check compares nothing against the old install (no pushable mark, no
    // queued find); a later check sees the new state
    const page = wiring({ real_check: true })
    const it = page.item('#a', 'i1')
    it.attr.sha = 'c1'
    it.text = 'v1'
    let release_commit
    page.github = {
      repos: {
        listCommits: async () => ({ data: [{ sha: 'c2' }] }), // GitHub moved on to c2
        getCommit: ({ ref }) => new Promise(resolve => (release_commit = () => resolve({ data: { files: [{ filename: 'a.md', sha: 'h:v1' }] } }))),
      },
    }
    const init = page.init()
    await tick()
    check('the scan\'s getCommit outstanding', typeof release_commit, 'function')
    // the manual update installs c2 (as update_item does: attr.sha in place, the text, pushable off)
    it.text = 'v2'
    it.attr.sha = 'c2'
    it.pushable = false
    release_commit()
    await init
    await tick()
    check('the stale comparison discarded: not pushable, nothing queued', [it.pushable, page.store().modified_ids, page.logs.filter(l => l[0] == 'warn').length], [false, [], 0])
  }
  {
    // the real check_updates, the control: an unchanged item completes normally (no find, no
    // pushable mark, no warning), and an item behind GitHub is found
    const page = wiring({ real_check: true })
    const a = page.item('#a', 'i1')
    a.attr.sha = 'c1'
    a.text = 'v1'
    const b = page.item('#b', 'i2')
    b.attr.sha = 'c1'
    b.text = 'v1'
    page.github = {
      repos: {
        listCommits: async ({ path }) => ({ data: [{ sha: path == 'b.md' ? 'c2' : 'c1' }] }),
        getCommit: async ({ path }) => ({ data: { files: [{ filename: path, sha: 'h:v1' }] } }),
      },
    }
    await page.init()
    await tick()
    check('the control: A unchanged (nothing), B behind (found), no warnings', [a.pushable, page.store().pending_updates, page.logs.filter(l => l[0] != 'log').length, page.modals.length], [undefined, { i2: { 'b.md': 'c2' } }, 0, 1])
  }
  {
    // S3: the pusher closes EVERY dialog before its commit prompt (the app's close-all
    // resolves them undefined, unlike an explicit Skip's false): the update dialog closed
    // that way is not a decision: the queue is kept and asked again once the push settles
    // (a failed push included), never over the pusher's prompt
    const page = wiring()
    page.item('#a', 'i1')
    let resolve_check
    page.answers['#a'] = () => new Promise(resolve => (resolve_check = resolve))
    const init = page.init()
    await tick()
    let settle_push
    page.pusher = { store: { _push: new Promise(resolve => (settle_push = resolve)) } } // a manual push in flight
    resolve_check({ v: 1 }) // the scan finds A
    await init
    await tick()
    check('the update dialog asked while the push runs', page.modals.length, 1)
    page.context._modal_close() // the pusher, before its commit prompt: close-all
    await tick()
    check('closed by the pusher: not skipped, the queue kept, not reopened over the prompt', [page.logs.filter(l => l[0] == 'warn').length, page.store().modified_ids, page.modals.length, page.logs.filter(l => l[1] == 'update dialog closed by another operation; asking again after it').length], [0, ['i1'], 1, 1])
    page.answers['#a'] = { v: 1 }
    settle_push() // the push settles (failed or not)
    await tick()
    check('the push settled: asked again', page.modals.length, 2)
    page.answer(true)
    await tick()
    check('Update: A written once', page.writes, [['#a', { v: 1 }]])
  }
  {
    // a push during the on-load scan does not wait for it: the scan is published as
    // store._scan (the worker waits on it), never as store._update, which #pusher waits on
    // before every push (pusher.js: `Promise.allSettled([_push, updater.store._update])`);
    // publishing the scan as _update held every push for the scan's minutes (2026-09-15)
    const page = wiring()
    page.item('#todoer', 'i1')
    let resolve_check
    page.answers['#todoer'] = () => new Promise(resolve => (resolve_check = resolve))
    const init = page.init()
    await tick()
    let pushed = false
    Promise.allSettled([page.store()._update]).then(() => (pushed = true)) // the pusher's wait
    await tick()
    check('the scan pending: a push proceeds, the scan published for the worker alone', [page.checks.length, pushed, typeof page.store()._scan?.then], [1, true, 'function'])
    resolve_check(null)
    await init
  }
  {
    // the retry path asks too: the catch-up fails (offline), the connection returns, the
    // retried scan finds the update, the dialog asks, nothing written before the answer
    const page = wiring()
    page.item('#todoer', 'i1')
    page.answers['#todoer'] = new TypeError('Failed to fetch')
    let online
    page.context.window.addEventListener = (t, f) => { if (t == 'online') online = f }
    await page.init()
    await tick()
    check('offline: paused, no dialog', [page.logs.filter(l => l[0] == 'warn').length, page.modals.length], [1, 0])
    page.answers['#todoer'] = { v: 2 }
    page.time += 60_000
    online()
    await tick()
    check('online: the retried scan asks, nothing written yet', [page.modals.length, page.writes], [1, []])
    page.answer(true)
    await tick()
    check('Update: written once', page.writes, [['#todoer', { v: 2 }]])
  }
  {
    // a REMOVED source (the real check_updates): an installed copy of a path listed in
    // REMOVED_SOURCES is a removal decided before any token or GitHub call (a token prompt for it
    // throws here, its client calls are counted), named apart in the dialog beside an update and
    // handed to update_item as the batch's entry; the same path in another repository is checked
    // as before
    const page = wiring({ real_check: true })
    const retired = page.item('#chat/fable', 'i1')
    retired.attr.repo = 'mind.items'
    const other = page.item('#chat/gemma', 'i2') // a listed path, another repository: behind GitHub
    other.attr.sha = 'c1'
    other.text = 'v1'
    const calls = []
    page.github = {
      repos: {
        listCommits: async ({ repo, path }) => (calls.push(`${repo}/${path}`), { data: [{ sha: 'c2' }] }),
        getCommit: async ({ path }) => ({ data: { files: [{ filename: path, sha: 'h:v1' }] } }),
      },
    }
    page.context.github_token = async it => {
      if (it.attr.repo == 'mind.items') throw new Error('token asked for a removed source')
      return 'token'
    }
    await page.init()
    await tick()
    check('the removal found without GitHub, the other repository checked, nothing warned', [page.store().pending_updates, calls, page.logs.filter(l => l[0] != 'log')], [{ i1: { removed: REASON }, i2: { 'chat/gemma.md': 'c2' } }, ['r/chat/gemma.md'], []])
    check('the dialog names the removal apart', page.modals.map(m => m.content), ['#updater is ready to update 1 installed item: #chat/gemma, and to delete 1 retired item: #chat/fable'])
    page.answer(true)
    await tick()
    check('Update: the removal handed on as the entry, the other item re-checked and written', [page.writes, calls.length], [[['#chat/fable', { removed: REASON }], ['#chat/gemma', { 'chat/gemma.md': 'c2' }]], 2])
  }
  {
    // the removal's decision (the real update_item): Keep is a warning and no deletion (asked
    // again by the next load's scan, like any pending update); Delete deletes the item without
    // the app's own confirm (the dialog and the confirm asked) and writes nothing
    const page = wiring({ real_check: true, real_update: true })
    const retired = page.item('#chat/fable', 'i1')
    retired.attr.repo = 'mind.items'
    retired.deletions = [] // the confirm argument of each delete call
    retired.delete = confirm => (retired.deletions.push(confirm), true)
    page.github = null // a client call would throw
    await page.init()
    await tick()
    check('a removal alone: the dialog', page.modals.map(m => m.content), ['#updater is ready to delete 1 retired item: #chat/fable'])
    page.answer(true)
    await tick()
    check('Update: confirmed per item, with the reason', page.modals[1]?.content, `Delete #chat/fable? Its source o/mind.items/master/chat/fable.md was removed: ${REASON}`)
    page.answer(false) // Keep
    await tick()
    check('Keep: not deleted, one warning, no error, the queue drained', [retired.deletions, page.logs.filter(l => l[0] == 'warn').map(l => l[1]), page.logs.filter(l => l[0] == 'error'), page.store().modified_ids], [[], [`#chat/fable kept (its source o/mind.items/master/chat/fable.md was removed: ${REASON})`], [], []])
    await page.init() // the next page load's scan asks again
    await tick()
    page.answer(true)
    await tick()
    page.answer(true) // Delete
    await tick()
    check('Delete: deleted without the app\'s confirm, nothing written, no error, the deletion logged', [retired.deletions, page.writes, page.logs.filter(l => l[0] == 'error'), page.logs.filter(l => l[1].startsWith('deleted retired #chat/fable')).length], [[false], [], [], 1])
  }
  {
    // an accepted item deleted meanwhile (another tab took its removal, or the owner deleted
    // it): skipped with a log line, the rest of the batch written
    const page = wiring()
    page.item('#a', 'i1')
    page.item('#b', 'i2')
    page.answers['#a'] = { v: 2 }
    page.answers['#b'] = { v: 2 }
    await page.init()
    await tick()
    delete page.items.i1
    page.answer(true)
    await tick()
    check('the deleted item skipped, the other written, nothing left accepted', [page.writes.map(w => w[0]), page.logs.filter(l => l[1] == 'update of i1 skipped: the item no longer exists (deleted meanwhile)').length, page.store().accepted_updates], [['#b'], 1, {}])
  }
}

const main = async () => {
  await retry_rows()
  await wiring_rows()
  if (failures) {
    console.log(`${failures} failed`)
    process.exit(1)
  }
  console.log('all ok')
}
main()
