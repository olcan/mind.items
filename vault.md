#vault lists the runs the vault [bridge](#agent/vault) is executing and lets you stop one. A run is listed when its model execution starts and delisted when that execution ends (before its reply is published). A stop is delivered at the run's next suspension point; the runtime then finishes its work in flight before the stop takes effect (a shell command is terminated and drained, the Claude session closes) and it arrives as a `stopped` reply; the request stays claimed, so edit the message to run it again. Rows come from the bridge's last listing, whose time and age the line under the table shows (the elapsed column ticks locally; the bridge also publishes an empty listing when it starts, so a dead bridge's rows clear on its restart). The status column is the run's last activity from its log, refreshed every few seconds, overridden by a supervisor's status line (with a progress ratio when one is set); each run's log tail and supervisor notes fold out under the table, and the chat item shows the same status while it runs. A chat item is shown as _running_ in every open tab from the moment the bridge admits its request (listed as queued while it waits its turn, with the status `queued`) until its run's model execution ends, as an active agent's item is on every tab; in the tab that saves a vault request the mark is immediate, as a web agent's: the save itself marks the item until the bridge's listing takes over (or, without a listing, until the reply lands, the item is deleted, or 30 s pass).
---
#### Active Runs
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
// {item, generation, commits, result}}}); see notes/design/mind_vault_item.md
const vault_runs = () => _this._global_store._bridge?.runs ?? {}
// the requests admitted to an execution lane and waiting for their run ({item_id: {persona, since}})
const vault_queued = () => _this._global_store._bridge?.queued ?? {}
// the chat items the bridge holds: queued or executing (the store is the single source; no
// item is parsed for it)
const vault_held_items = () => new Set([...keys(vault_queued()), ...entries(vault_runs()).map(([, run]) => run.item)])

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
function vault_show_status(runs, sup = {}, shown = {}, queued = {}) {
  for (const itemId of keys(queued)) {
    const item = _item(itemId, { silent: true })
    if (!item) continue
    shown[itemId] = true
    try {
      item.status = 'queued'
      item.progress = 0
    } catch (e) {
      console.warn(`#vault: status of ${itemId} not shown: ${e}`)
    }
  }
  for (const [id, run] of entries(runs)) {
    const item = _item(run.item, { silent: true })
    if (!item) continue
    shown[run.item] = true
    try {
      item.status = _.escape(vault_run_status(run, sup[id]))
      item.progress = vault_run_progress(sup[id]) ?? 0
    } catch (e) {
      console.warn(`#vault: status of ${run.item} not shown: ${e}`)
    }
  }
  return vault_clear_status(shown, vault_held_items())
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

// this tab's mark records, under its item state (see vault_mark_running)
const vault_marks = () => [(_this.store._vault_marked ??= {}), (_this.store._vault_pending ??= {})]

// the one reconciliation, at welcome and at every change of this store, local or remote (the app
// calls _on_global_store_change on the store's owner within about a second of a bridge write);
// the marks survive either order, a store change can reach the tab before its welcome
function vault_reconcile_running() {
  const [marked, pending] = vault_marks()
  vault_mark_running(vault_held_items(), marked, pending)
  vault_expire_pending()
  _this.store._vault_shown = vault_show_status(
    vault_runs(), _this._global_store._supervisor?.runs ?? {}, _this.store._vault_shown ?? {}, vault_queued()
  )
}

// the save-time mark, the way a web agent marks its item at dispatch: a save in this tab of an
// item the app routes to the vault takes this tab's reference at once, ahead of the bridge's
// listing (save, watch, admission, store write, delivery: seconds). The routing predicate is the
// app's (window._grammar.routed: a vault route among the tags of the grammar view, inert reply
// regions opaque) over the item's raw text, and no request grammar is parsed here: every save of
// a routed item marks, and a save that is no request (an edit of an old turn, a route the bridge
// never answers) lapses at the timeout below. The listing takes the reference over when it lists
// the item (vault_mark_running); until then it is released at the item's next remote change (its
// reply; an edit from another device releases it too, and the listing marks a live request
// again), at its deletion, or after VAULT_PENDING_MS, so a stopped bridge leaves no stale mark
const VAULT_PENDING_MS = 30000
const vault_routed = id =>
  window._grammar?.version >= 2 && !!window._grammar.routed(_item(id, { silent: true })?.text ?? '')

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
// released (a `true` of the item's earliest code, kept in a tab's session store across /_update,
// is past it too); the task ends once nothing is pending (null cancels it)
function vault_expire_pending() {
  const [marked, pending] = vault_marks()
  const now = Date.now()
  for (const [id, since] of entries(pending)) if (since + VAULT_PENDING_MS <= now) vault_release_pending(id, marked, pending)
  if (!keys(pending).length) return null
}

function _on_global_store_change(id) {
  if (id != _this.id) return // another item's store (this item listens to item changes below)
  vault_reconcile_running()
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
    '(queued)',
    Math.round((now - q.since) / 1000) + 's',
    '·', // nonempty: the table helper needs a value in every column
    'queued',
    '·',
  ])
  return queued.concat(entries(bridge?.runs ?? {}).map(([id, run]) => {
    const progress = vault_run_progress(sup[id])
    const status = vault_run_status(run, sup[id]) || '(no activity yet)'
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

// the log tails and supervisor notes under the table, one details block per run
function vault_runs_details(bridge, sup = {}) {
  return entries(bridge?.runs ?? {})
    .map(([id, run]) => {
      const lines = [...(run.log ?? []), ...(sup[id]?.notes ?? []).map(n => `note ${n.text}`)]
      if (!lines.length) return ''
      return `<details data-run="${_.escape(id)}"><summary>${_.escape(id)} log</summary><pre>${_.escape(lines.join('\n'))}</pre></details>`
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
  if (!bridge) return '_no listing yet (the bridge writes it when it starts and at each run)_'
  const now = Date.now()
  const stamp = `_bridge listing from ${bridge.host}, updated ${new Date(bridge.updated).toLocaleTimeString()} (${vault_age(now - bridge.updated)} ago)_`
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

// render the listing into the item's own element (the #status pattern: a per-second task that
// rewrites a div, no item re-render); a store change re-renders the item, which re-runs the
// script above and so updates at once
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
// and re-opened after any replacement: an in-place rewrite here, or the app's re-render of the
// whole item at a store change (fresh elements, this script run again)
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

// the proposals: the undecided chat worktrees the bridge lists (a writable run's changes, staged
// in the chat's worktree; nothing reaches main until decided), each with the bridge's last outcome
// for it (a refusal, or the supervisor's) and approve/reject links, or the decision in flight
// (the owner's flag newer than the outcome the bridge answered: the links return once the bridge
// has answered, so a refused decision can be retried or switched) (side-effect-free; `decide`
// maps worktrees to the owner's flags, `link` renders one action)
function vault_proposal_rows(bridge, decide, link) {
  return entries(bridge?.worktrees ?? {}).map(([name, wt]) => {
    const flag = decide?.[name]
    const outcome = wt.result ? vault_cell(wt.result) : ''
    const inFlight = !!flag && !(wt.decided >= flag.t)
    const actions = inFlight
      ? `${flag.decision}…`
      : link(name, 'accepted', 'approve') + ' · ' + link(name, 'rejected', 'reject')
    return [vault_item_cell(wt.item), name, String(wt.commits ?? 0), [outcome, actions].filter(Boolean).join(' ')]
  })
}

function vault_proposals_table() {
  const store = _this._global_store
  const bridge = store._bridge
  if (!bridge) return '_no listing yet_'
  const rows = vault_proposal_rows(bridge, store._owner?.decide, (name, decision, text) =>
    link_eval(_this, `decide_worktree('${name}', '${decision}')`, text)
  )
  if (!rows.length) return '_none_'
  return table(rows, { headers: ['item', 'worktree', 'commits', ''] })
}

// the owner's decision on a proposal: the flag lives in this item's store, which the bridge
// watches (it rejects by removing the worktree, accepts by merging it into main after the
// worktree's gates pass, and lists the outcome); flags of worktrees no longer listed are dropped
// here, on this explicit action only
function decide_worktree(name, decision) {
  const listed = _this._global_store._bridge?.worktrees ?? {}
  const store = _this.global_store // the saving accessor
  const decide = Object.fromEntries(entries(store._owner?.decide ?? {}).filter(([wt]) => wt in listed))
  decide[name] = { decision, t: Date.now() }
  store._owner = { ...(store._owner ?? {}), decide }
}

// ask the bridge to stop a run: the flag lives in this item's store, which the bridge watches;
// flags of runs no longer listed are dropped here, on this explicit action only (an automatic
// save on every remote listing change could overwrite the bridge's next listing)
function stop_run(id) {
  const runs = vault_runs()
  const store = _this.global_store // the saving accessor
  const stop = Object.fromEntries(entries(store._owner?.stop ?? {}).filter(([run_id]) => run_id in runs))
  stop[id] = Date.now()
  store._owner = { ...(store._owner ?? {}), stop }
}

// a save in this tab of an item the app routes to the vault takes the save-time mark (or restarts
// its timeout); a remote change of a pending item is its reply, and a deletion or a save that
// removed the route ends the request: the pending mark is released (a reference the listing has
// taken over is the store's alone). Then the deferred status clearing (see vault_clear_status),
// retried at every change of an item this tab set a status on: the web call's reply on the same
// chat is such a change
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // a dependency of the changed item, not the item itself
  const [marked, pending] = vault_marks()
  if (!deleted && !remote && vault_routed(id)) vault_mark_saved(id, marked, pending)
  else vault_release_pending(id, marked, pending)
  if (_this.store._vault_shown?.[id]) // a status this tab set: cleared once the item stops running
    _this.store._vault_shown = vault_clear_status(_this.store._vault_shown, vault_held_items())
}

// provision the store at app startup (the bridge only updates it, never creates it) and mark
// the items the bridge holds, queued or executing, from the store: no item is scanned
function _on_welcome() {
  if (!_this._global_store._owner) _this.global_store._owner = { stop: {} }
  vault_reconcile_running()
}
```
#_welcome #_util/core #_listen
