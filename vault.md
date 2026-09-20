#vault lists what the vault [bridge](#agent/vault) holds: its queued and running requests, a supervisor's workers, and the proposals of writable runs.
- **stop** cancels a run at its next step: the work in flight finishes, the reply is `stopped`, and the request stays claimed (edit it to run it again).
- **approve** merges a proposal's worktree into main once its gates pass; **reject** removes it; a delegated todo's worktree (its **state** is the todo's marker, `chat` for a chat's) takes them only while the todo is owner-held, and a row the bridge admits nothing on says why.
- a proposal's **worktree** link opens its changes against main, submodules included, in VS Code; **dir** opens its folder in a new window (both on the editor's host, a remote one included).
---
#### Runs
<div class="runs"></div>
<div class="logs"></div>
#### Proposals
<div class="proposals"></div>
---
```_html_hidden
<script _uncached>
update_vault_runs() // the first update synchronously (on script eval, i.e. at every render)
dispatch_task('update', update_vault_runs, 1000, 1000) // the elapsed column ticks every second
</script>
```
```js:js_removed
// this item's hidden store carries three subtrees: _bridge, written by the vault bridge
// ({v, host, boot, updated, runs: {run_id: {item, persona, worktree, started, stopping, status,
// log, activity}}}; status and log come from the run's log every few seconds), _supervisor,
// written by the operator or a supervisor run ({runs: {run_id: {status, progress, notes}}}),
// and _owner, written here ({stop: {run_id: ms}, decide: {worktree: {decision, t}}}); the
// bridge's listing also carries the undecided chat worktrees, the proposals ({worktrees: {name:
// {item, generation, commits, result, decided, task, admits}}}: task is a delegated todo's
// state ({held, reason}) or null for a chat's worktree, admits maps each decision to null (the
// bridge takes it now) or why not); see notes/design/mind_vault_item.md
const vault_runs = () => _this._global_store._bridge?.runs ?? {}
// the requests admitted to an execution lane and waiting for their run ({item_id: {persona, since}})
const vault_queued = () => _this._global_store._bridge?.queued ?? {}
// the chat items the bridge holds: queued or executing (the store is the single source; no
// item is parsed for it)
// the supervisor's active workers ({item_id: {worker, phase, run, worktree, since}}; design
// notes/design/mind_vault_supervisor.md): live metadata only, the single source of a pending
// worker's visibility (the lane's queued entry is the owner request's, keyed by item)
const vault_workers = () => _this._global_store._bridge?.workers ?? {}
// the chat items the bridge holds: queued, executing, or owning an active worker
const vault_held_items = () =>
  new Set([...keys(vault_queued()), ...keys(vault_workers()), ...entries(vault_runs()).map(([, run]) => run.item)])
// the bridge lists an item by its saved document id, while the app calls _on_item_change with the
// item's own id, a temporary one for a chat created in this tab until the tab reloads (_item
// resolves the saved id to that item): this tab's records are keyed by the item's own id
const vault_item_key = id => _item(id, { silent: true })?.id ?? id

// the app's per-item running flag is a refcount (a web agent's item holds one reference during
// its call); this tab holds one reference of its own on every chat item the bridge holds, beside
// any other holder's (a web call in flight on the same chat keeps its own): `marked` (in-tab
// state under _this.store) records this tab's references by item, so an unchanged listing adds
// none and a delisted run's item releases exactly one; a deleted item is skipped. `pending` (also
// under _this.store) records, by item, the save time of a reference taken at a save
// (vault_mark_saved) that the store does not list yet: the listing takes such a reference over
// when it lists the item (the entry leaves `pending`, the reference stays, the store owns it from
// then on) and never releases one it has not taken over
function vault_mark_running(listed, marked, pending = {}) {
  listed = new Set([...listed].map(vault_item_key)) // the saved ids as this tab's item ids
  for (const id of keys(marked)) {
    if (listed.has(id)) {
      delete pending[id] // handed over to the listing
      continue
    }
    if (id in pending) continue // saved here and not listed yet: vault_release_pending's
    delete marked[id]
    const item = _item(id, { silent: true })
    if (item) item.running = false
  }
  for (const id of listed) {
    if (marked[id]) continue
    const item = _item(id, { silent: true })
    if (!item) continue
    item.running = true
    marked[id] = true
  }
  return marked
}

// the listed runs' status lines and progress onto their chat items (the app's per-item status
// and progress props, shown while the item runs; in-tab, nothing saved). The app assigns the
// status to innerHTML unescaped and its show_status skips an empty status and a zero progress,
// so the text is escaped here and the props are assigned directly; `shown` records the items
// this tab set, for the clearing below
function vault_show_status(runs, sup = {}, shown = {}, queued = {}, workers = {}) {
  const set = (itemId, status, progress) => {
    const item = _item(itemId, { silent: true })
    if (!item) return
    shown[itemId] = true
    try {
      item.status = status
      item.progress = progress
    } catch (e) {
      console.warn(`#vault: status of ${itemId} not shown: ${e}`)
    }
  }
  for (const itemId of keys(queued)) set(itemId, 'queued', 0)
  // a chat with an active worker and no listed run of its own shows the worker's phase (queued,
  // starting, finishing); its executing worker has a row of its own below
  const listed = new Set(entries(runs).map(([, run]) => run.item))
  for (const [itemId, worker] of entries(workers)) {
    if (!listed.has(itemId)) set(itemId, _.escape(String(worker.phase ?? 'queued')), 0)
  }
  // one status per chat item (design mind_vault_supervisor 2.3): among a chat's listed runs one
  // is chosen, a run with a supervisor-posted status LINE first (a note-only or progress-only
  // entry does not count), then the latest start, then the run id, so the order the bridge lists
  // them in never decides
  const chosen = {}
  for (const [id, run] of entries(runs)) {
    const key = [sup[id]?.status ? 1 : 0, run.started ?? 0, id]
    const prev = chosen[run.item]
    if (!prev || vault_key_after(key, prev.key)) chosen[run.item] = { id, run, key }
  }
  for (const { id, run } of Object.values(chosen)) {
    set(run.item, _.escape(vault_run_status(run, sup[id])), vault_run_progress(sup[id]) ?? 0)
  }
  return vault_clear_status(shown, vault_held_items())
}
// lexicographic order over [posted, started, id]: whether `a` sorts after `b`
const vault_key_after = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    return a[i] > b[i]
  }
  return false
}

// clear (status '' and progress 0) the items this tab set a status on that are no longer listed,
// once their last running reference is gone: an item still running keeps its status and stays
// recorded, and the clearing is retried at every release of a reference (the listing mark at a
// store change) or any later
// change of the item (a web call on the same chat posts its own status and clears it when it
// completes; its reply is an item change)
function vault_clear_status(shown, listed) {
  for (const itemId of keys(shown)) {
    if (listed.has(itemId)) continue
    const item = _item(itemId, { silent: true })
    if (item?.running) continue // deferred
    delete shown[itemId]
    if (!item) continue
    try {
      item.status = ''
      item.progress = 0
    } catch (e) {
      console.warn(`#vault: status of ${itemId} not cleared: ${e}`)
    }
  }
  return shown
}

// this tab's mark records, under its item state (see vault_mark_running). A `true` in `pending`
// is the item's earliest code's own pending reference (2026-09-06: held beside the listing's,
// in a tab that ran that code until this update reached it; the session store survives
// /_update): released here, once, keeping the listing's record
const vault_marks = () => {
  const marked = (_this.store._vault_marked ??= {})
  const pending = (_this.store._vault_pending ??= {})
  for (const [id, since] of entries(pending)) {
    if (since !== true) continue
    delete pending[id]
    const item = _item(id, { silent: true })
    if (item) item.running = false
  }
  return [marked, pending]
}

// the one reconciliation, at welcome and at every change of this store, local or remote (the app
// calls _on_global_store_change on the store's owner within about a second of a bridge write);
// the marks survive either order, a store change can reach the tab before its welcome
function vault_reconcile_running() {
  const [marked, pending] = vault_marks()
  vault_mark_running(vault_held_items(), marked, pending)
  vault_expire_pending()
  _this.store._vault_shown = vault_show_status(
    vault_runs(), _this._global_store._supervisor?.runs ?? {}, _this.store._vault_shown ?? {}, vault_queued(), vault_workers()
  )
}

// the save-time mark, the way a web agent marks its item at dispatch: a change (a save in this
// tab, or another tab's save arriving by sync) that leaves an item a pending vault request takes
// this tab's reference at once, ahead of the bridge's listing (save, watch, admission, store
// write, delivery: seconds). A pending request: the item's LAST role opener over the grammar view
// (item.read(), macros unevaluated, inert reply regions opaque) is a user turn, and the app's
// routing predicate (window._grammar.routed: a vault route among the tags of the grammar view)
// holds over the item's raw text or, for a chained item without a route of its own, over its
// nearest label-prefix ancestor's (vault_routed). Only the role openers are read, never a whole
// request, so an edit of an old turn that still ends with a user turn, or a route the bridge
// never answers, marks too and lapses at the timeout below; a change that leaves no pending
// request (the reply, a deletion, a removed route or turn) releases the mark. The listing takes
// the reference over when it lists the item (vault_mark_running); until then it is released at
// the item's next change that ends the request, at its deletion, or at the first tick or
// reconciliation past its VAULT_PENDING_MS deadline, so a stopped bridge leaves no lasting mark
const VAULT_PENDING_MS = 30000
// the editor the review links open (the vault's own VS Code extension `auto-open-obsidian`
// handles the URI): `vscode-insiders`, or `vscode` for the stable build
const VAULT_EDITOR = 'vscode-insiders'
// a chat REQUEST the app routes to the vault: the item's raw text ENDS with a user turn (the
// last delimiter opener at a line start is the chat grammar's `\<<user>>`, ASCII spaces before
// and inside allowed: an escaped mention inside prose or code, as in the route, command, and
// persona items /update re-saves, is not one; a reply ends with an agent turn; only the role
// openers are read, over the grammar view, never a whole request) and the app's routing predicate holds over the item or,
// for a chained item (`…/N`, created by the app under a chat) without a route of its own, over
// its nearest label-prefix ancestor, as the bridge inherits a route through the direct-chat
// lineage and the web framework through the dependency closure. The patterns are built from
// strings so the item source carries no macro delimiter.
const VAULT_OPENER = new RegExp('^ *\<< *(system|user|_?agent|tool)(?: *\\([^\\n]*\\))? *>>', 'gm')
const vault_last_turn_is_user = text => {
  let role = null
  for (const m of text.matchAll(VAULT_OPENER)) role = m[1]
  return role === 'user'
}
const vault_route_text = id => {
  // the item's own text when the app routes it, else the nearest label-prefix ancestor's
  const routed = window._grammar.routed
  let item = _item(id, { silent: true })
  if (!item) return null
  if (routed(item.text ?? '')) return item.text
  for (let name = item.name ?? ''; name.includes('/'); ) {
    name = name.slice(0, name.lastIndexOf('/'))
    const parent = _item(name, { silent: true })
    if (!parent) return null // no unique parent by that name: no inheritance
    if (routed(parent.text ?? '')) return parent.text
  }
  return null
}
const vault_routed = id => {
  if (!(window._grammar?.version >= 2)) return false
  const item = _item(id, { silent: true })
  if (!item) return false
  // the grammar view (item.read(): the app's cached view, macros unevaluated, an inert reply
  // body opaque), so a delimiter quoted inside a bridge reply is not a turn
  return vault_last_turn_is_user(item.read() ?? '') && vault_route_text(id) !== null
}

function vault_mark_saved(id, marked, pending) {
  if (marked[id] && !(id in pending)) return // listed by the store, which owns the reference
  if (!marked[id]) {
    const item = _item(id, { silent: true })
    if (!item) return
    item.running = true
    marked[id] = true
  }
  pending[id] = Date.now() // a re-save restarts the timeout
  dispatch_task('pending', vault_expire_pending, 1000, 1000) // ticks while a mark is pending
}

// release a pending mark (none for an item the listing has taken over): the reference is given
// back if the item exists (a deleted item's count is gone with it)
function vault_release_pending(id, marked, pending) {
  if (!(id in pending)) return
  delete pending[id]
  delete marked[id]
  const item = _item(id, { silent: true })
  if (item) item.running = false
}

// the timeout, as the task above and at every reconciliation: the pending marks past it are
// released; the task ends once nothing is pending (null cancels it)
function vault_expire_pending() {
  const [marked, pending] = vault_marks()
  const now = Date.now()
  for (const [id, since] of entries(pending)) if (since + VAULT_PENDING_MS <= now) vault_release_pending(id, marked, pending)
  if (!keys(pending).length) return null
}

// this store's changes, local (a flag) or remote (a listing; the app calls the owner within
// about a second of a bridge write): the marks and statuses, then the tables in place. true
// tells the app the change is rendered, so it skips the re-render it forces on a remote
// delivery (fresh empty elements, painted before this script refilled them: the item collapsed
// for a frame and everything below it shifted; design 2026-09-19)
function _on_global_store_change(id) {
  if (id != _this.id) return // another item's store (this item listens to item changes below)
  vault_reconcile_running()
  update_vault_runs()
  return true
}

// the app's clickable tag markup (its Marked instance renders `[text](#tag)` this way; the global
// parser used below does not), so the item cell navigates to the chat item as the macro did
const vault_item_link = name =>
  `<mark class="link" title="${_.escape(name)}" onmousedown="_handleTagClick('${_this.id}','${_.escape(name)}','${_.escape(name)}',event)" onclick="event.preventDefault();event.stopPropagation();">${_.escape(name)}</mark>`

// a run's status line: the supervisor's when set, else the bridge's last activity line
const vault_run_status = (run, sup) => sup?.status ?? run.status ?? ''
const vault_run_progress = sup => (typeof sup?.progress == 'number' ? sup.progress : null)

// literal text as a markdown table cell: line breaks flattened, then every ASCII punctuation
// character backslash-escaped (the parser's escape rule): a pipe cannot split the row whatever
// precedes it (a literal backslash doubles, so the backslashes before a pipe stay odd: `grep
// 'foo\|bar'` is one cell), backticks and emphasis stay text, and `<`, `>`, `&` reach the
// renderer as text it escapes (a status line is shell output; `rg todo | head` stays one cell)
const vault_cell = text =>
  String(text).replace(/\r\n|\r|\n/g, ' ').replace(/[!-\/:-@\[-`{-~]/g, c => '\\' + c)

// the table rows for a listing (side-effect-free; `stop` maps run ids to flags, `link` renders one,
// `sup` maps run ids to supervisor entries)
function vault_runs_rows(bridge, stop, now, link, sup = {}) {
  const queued = entries(bridge?.queued ?? {}).map(([itemId, q]) => [
    vault_item_cell(itemId),
    q.persona,
    '·', // no run yet (nonempty: the table helper needs a value in every column)
    Math.round((now - q.since) / 1000) + 's',
    '·',
    'queued',
    '·',
  ])
  // a supervisor's worker whose run is not listed (queued, in setup, or finishing; design
  // mind_vault_supervisor 2.3, R4): a compact row from the workers projection, so a pending
  // worker is visible here as well as on its chat item
  const runs = bridge?.runs ?? {}
  const workers = entries(bridge?.workers ?? {})
    .filter(([, w]) => !(w.run && runs[w.run]))
    .map(([itemId, w]) => [
      vault_item_cell(itemId),
      'worker',
      w.worker,
      Math.round((now - w.since) / 1000) + 's',
      w.worktree ?? '·',
      String(w.phase ?? 'queued'),
      '·',
    ])
  return queued.concat(workers, entries(runs).map(([id, run]) => {
    const progress = vault_run_progress(sup[id])
    const status = vault_run_status(run, sup[id]) || '·' // no activity yet
    return [
      vault_item_cell(run.item),
      run.persona,
      id,
      Math.round((now - run.started) / 1000) + 's',
      run.worktree ?? '(read-only)', // nonempty: the table helper needs a value in every column
      (progress === null ? '' : Math.round(progress * 100) + '% ') + vault_cell(status),
      run.stopping || stop?.[id] ? 'stopping…' : link(id),
    ]
  }))
}

// the log tails and supervisor notes under the table, one details block per run; the summary's
// click stays in the block (a click that reaches the item opens its editor): stopped, not
// prevented, so it still toggles the block; its hand cursor is an inline style, as the app's
// cursor rules reach only its own controls and an item's tags and checkboxes (its `_clickable`
// hook shields a click but styles nothing); the pre body stays content, a click there edits
function vault_runs_details(bridge, sup = {}) {
  return entries(bridge?.runs ?? {})
    .map(([id, run]) => {
      const lines = [...(run.log ?? []), ...(sup[id]?.notes ?? []).map(n => `note ${n.text}`)]
      if (!lines.length) return ''
      return `<details data-run="${_.escape(id)}"><summary style="cursor:pointer" onclick="event.stopPropagation()">${_.escape(id)} log</summary><pre>${_.escape(lines.join('\n'))}</pre></details>`
    })
    .filter(Boolean)
    .join('\n')
}

// a known chat item links to it; a deleted one shows its id
const vault_item_cell = id => {
  const name = _item(id, { silent: true })?.name
  return name ? vault_item_link(name) : id
}

// an age for the stamp: seconds under a minute, else minutes, else hours and minutes
function vault_age(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return s + 's'
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's'
  return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm'
}

function vault_runs_table() {
  const store = _this._global_store
  const bridge = store._bridge
  if (!bridge) return '_no listing yet: the bridge writes one when it starts_'
  const now = Date.now()
  const stamp = `_listed by ${bridge.host} at ${new Date(bridge.updated).toLocaleTimeString()} (${vault_age(now - bridge.updated)} ago)_`
  const sup = store._supervisor?.runs ?? {}
  const rows = vault_runs_rows(bridge, store._owner?.stop, now, id =>
    link_eval(_this, `stop_run('${id}')`, 'stop'), sup
  )
  if (!rows.length) return `_none_ ${stamp}`
  // the blank line closes the table (the parser would read the stamp as another row otherwise)
  return table(rows, { headers: ['item', 'persona', 'run', 'elapsed', 'worktree', 'status', ''] }) + '\n\n' + stamp
}

// the log tails and supervisor notes: their own element, replaced only when their content
// changes (not on the elapsed tick), with the open blocks kept open by run id
function vault_logs_html() {
  const store = _this._global_store
  return vault_runs_details(store._bridge, store._supervisor?.runs ?? {})
}

// render the listing into the item's own elements (the #status pattern: a per-second task that
// rewrites a div, no item re-render); a store change updates them in place through
// _on_global_store_change, and a re-render for any other reason (an edit, /update) runs the
// script above over fresh elements
function update_vault_runs() {
  vault_render('.runs', () => marked.parse(vault_runs_table()))
  vault_render('.logs', vault_logs_html)
  vault_render('.proposals', () => marked.parse(vault_proposals_table()))
  const open = _this.store._vault_open ?? {}
  for (const id of keys(open)) if (!(id in vault_runs())) delete open[id] // delisted: forgotten
}

// render into one of this item's own elements, skipping an unchanged rendering (the DOM's own
// serialization differs from the parser's string, so the last string is remembered). The open
// details blocks are remembered by run id in this tab's item state (from their toggle events)
// and re-opened after any replacement: an in-place rewrite here, or a re-render of the whole
// item (fresh elements, this script run again)
function vault_render(selector, render) {
  const div = elem(selector)
  if (!div) return // the item is not in the DOM
  const html = render()
  if (div._vault_html === html) return
  div._vault_html = html
  div.innerHTML = html
  const open = (_this.store._vault_open ??= {})
  for (const d of Array.from(div.querySelectorAll?.('details[data-run]') ?? [])) {
    if (open[d.dataset.run]) d.open = true
    d.addEventListener?.('toggle', () => (open[d.dataset.run] = d.open))
  }
}

// the proposals: the undecided chat worktrees the bridge lists (a writable run's changes,
// committed in the chat's worktree; nothing reaches main until decided), each with its state (a
// delegated todo's marker word, `chat` for a chat's), the bridge's last outcome for it (a
// refusal, or the supervisor's) and the approve/reject links the bridge ADMITS now (a todo's
// worktree takes a decision only while the todo is owner-held; the bridge publishes its rule's
// answer per decision, `admits`, and enforces it, so no rule lives here; a row it admits nothing
// on shows why instead), or the decision in flight (the owner's flag newer than the outcome the
// bridge answered: the links return once the bridge has answered, so a refused decision can be
// retried or switched) (side-effect-free; `decide` maps worktrees to the owner's flags, `link`
// renders one action)
function vault_proposal_rows(bridge, decide, link) {
  return entries(bridge?.worktrees ?? {}).map(([name, wt]) => {
    const worktree = vault_review_links(name, bridge?.root)
    const flag = decide?.[name]
    const outcome = wt.result ? vault_cell(wt.result) : ''
    const inFlight = !!flag && !(wt.decided >= flag.t)
    const admits = wt.admits ?? {} // an older bridge admits both
    const links = [['accepted', 'approve'], ['rejected', 'reject']].filter(([d]) => admits[d] == null).map(([d, text]) => link(name, d, text))
    const actions = inFlight ? `${flag.decision}…` : links.length ? links.join(' · ') : vault_cell(admits.accepted ?? admits.rejected)
    return [vault_item_cell(wt.item), worktree, String(wt.commits ?? 0), wt.task?.reason ?? 'chat', [outcome, actions].filter(Boolean).join(' ')]
  })
}

// the review links of a proposal (design mind_vault_item 10): the editor's multi-diff of the
// worktree's changes against main, populated submodules included, and the worktree's folder,
// both through the vault's VS Code extension so they resolve on the extension host (a Remote-SSH
// window opens the remote vault's paths; a `file` link would look on the local machine); the
// bridge lists the vault root (`root`) for the absolute paths, and a listing without it (an
// older bridge) shows the bare name. HTML anchors that stop the click's propagation, not
// markdown links: the item renders its tables itself (`marked`), so the app's link pass never
// sees them, and a click that bubbles opens the item's editor (as the log toggle's did)
function vault_review_links(name, root) {
  if (!root || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(name)) return name // never `.` or `..`
  const query = `worktree=${name}&root=${encodeURIComponent(root)}`
  const link = (action, text) =>
    `<a href="${_.escape(`${VAULT_EDITOR}://olcan.auto-open-obsidian/${action}?${query}`)}" onclick="event.stopPropagation()">${text}</a>`
  return `${link('review', name)} · ${link('open', 'dir')}`
}

function vault_proposals_table() {
  const store = _this._global_store
  const bridge = store._bridge
  if (!bridge) return '_no listing yet_'
  const rows = vault_proposal_rows(bridge, store._owner?.decide, (name, decision, text) =>
    link_eval(_this, `decide_worktree('${name}', '${decision}')`, text)
  )
  if (!rows.length) return '_none_'
  return table(rows, { headers: ['item', 'worktree', 'commits', 'state', ''] })
}

// the owner's decision on a proposal: the flag lives in this item's store, which the bridge
// watches (it rejects by removing the worktree, accepts by merging it into main after the
// worktree's gates pass, and lists the outcome); flags of worktrees no longer listed are dropped
// here, on this explicit action only
function decide_worktree(name, decision) {
  const listed = _this._global_store._bridge?.worktrees ?? {}
  const store = _this._global_store
  const decide = Object.fromEntries(entries(store._owner?.decide ?? {}).filter(([wt]) => wt in listed))
  decide[name] = { decision, t: Date.now() }
  store._owner = { ...(store._owner ?? {}), decide }
  vault_save()
}

// save this item's store (the whole store, as the app's saving accessor writes it) without the
// re-render the app forces on a save: the change handler renders the flag in place
const vault_save = () => _this.save_global_store({ invalidate_elem_cache: false })

// ask the bridge to stop a run: the flag lives in this item's store, which the bridge watches;
// flags of runs no longer listed are dropped here, on this explicit action only (an automatic
// save on every remote listing change could overwrite the bridge's next listing)
function stop_run(id) {
  const runs = vault_runs()
  const store = _this._global_store
  const stop = Object.fromEntries(entries(store._owner?.stop ?? {}).filter(([run_id]) => run_id in runs))
  stop[id] = Date.now()
  store._owner = { ...(store._owner ?? {}), stop }
  vault_save()
}

// a change (a save in this tab, or another tab's save arriving by sync) that leaves an item a
// pending vault request takes the save-time mark (or restarts its timeout); a change that does not
// (its reply, which ends with an agent turn; a deletion; an edit that removed the route or the
// turn) ends the request: the pending mark is released (a reference the listing has taken over is
// the store's alone). Then the deferred status clearing (see vault_clear_status),
// retried at every change of an item this tab set a status on: the web call's reply on the same
// chat is such a change
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // a dependency of the changed item, not the item itself
  const [marked, pending] = vault_marks()
  // a change, local or remote, that leaves the item a pending request marks it: a save in this
  // tab, or another tab's save arriving by sync (its reply arrives as a remote change too, and
  // ends with an agent turn: released)
  if (!deleted && vault_routed(id)) vault_mark_saved(id, marked, pending)
  else vault_release_pending(id, marked, pending)
  if (_this.store._vault_shown?.[id]) // a status this tab set: cleared once the item stops running
    _this.store._vault_shown = vault_clear_status(_this.store._vault_shown, vault_held_items())
}

// provision the store at app startup (the bridge only updates it, never creates it) and mark
// the items the bridge holds, queued or executing, from the store: no item is scanned
function _on_welcome() {
  if (!_this._global_store._owner) {
    _this._global_store._owner = { stop: {} }
    vault_save()
  }
  vault_reconcile_running()
}
```
#_welcome #_util/core #_listen
