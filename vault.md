#vault lists the runs the vault [bridge](#agent/vault) is executing and lets you stop one. A run is listed when its model execution starts and delisted when that execution ends (before its reply is published). A stop is delivered at the run's next suspension point; the runtime then finishes its work in flight before the stop takes effect (a shell command is terminated and drained, the Claude session closes) and it arrives as a `stopped` reply; the request stays claimed, so edit the message to run it again. Rows are as of the bridge's last update (the bridge also publishes an empty listing when it starts, so a dead bridge's rows clear on its restart). The chat item of a listed run is shown as _running_ in every open tab, as a web agent's item is during its call, until the run is delisted.
---
#### Active Runs
<< vault_runs_table() >>
---
```js:js_removed
// this item's hidden store carries two subtrees: _bridge, written by the vault bridge
// ({v, host, boot, updated, runs: {run_id: {item, persona, worktree, started, stopping}}}),
// and _owner, written here ({stop: {run_id: ms}}); see notes/design/mind_vault_item.md in the vault
const vault_runs = () => _this._global_store._bridge?.runs ?? {}

// the app's per-item running flag is a refcount (a web agent's item holds one reference during
// its call); this tab holds one reference of its own on every listed run's chat item, beside any
// other holder's (a web call in flight on the same chat keeps its own): `marked` (in-tab state
// under _this.store) records this tab's references, so an unchanged listing adds none and a
// delisted run's item releases exactly one; a deleted item is skipped
function vault_mark_running(runs, marked) {
  const listed = new Set(entries(runs).map(([, run]) => run.item))
  for (const id of keys(marked)) {
    if (listed.has(id)) continue
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

// the one reconciliation, at welcome and at every change of this store, local or remote (the app
// calls _on_global_store_change on the store's owner within about a second of a bridge write);
// the marks survive either order, a store change can reach the tab before its welcome
function vault_reconcile_running() {
  _this.store._vault_marked = vault_mark_running(vault_runs(), _this.store._vault_marked ?? {})
}

function _on_global_store_change() {
  vault_reconcile_running()
}

// the table rows for a listing (side-effect-free; `stop` maps run ids to flags, `link` renders one)
function vault_runs_rows(bridge, stop, now, link) {
  return entries(bridge?.runs ?? {}).map(([id, run]) => [
    _item(run.item, { silent: true })?.name ?? run.item,
    run.persona,
    id,
    Math.round((now - run.started) / 1000) + 's',
    run.worktree ?? '(read-only)', // nonempty: the table helper needs a value in every column
    run.stopping || stop?.[id] ? 'stopping…' : link(id),
  ])
}

function vault_runs_table() {
  const store = _this._global_store
  const bridge = store._bridge
  if (!bridge) return '_no listing yet (the bridge writes it when it starts and at each run)_'
  const stamp = `_as of ${new Date(bridge.updated).toLocaleTimeString()} on ${bridge.host}_`
  const rows = vault_runs_rows(bridge, store._owner?.stop, Date.now(), id =>
    link_eval(_this, `stop_run('${id}')`, 'stop')
  )
  if (!rows.length) return `_none_ ${stamp}`
  return table(rows, { headers: ['item', 'persona', 'run', 'elapsed', 'worktree', ''] }) + '\n' + stamp
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

// provision the store at app startup (the bridge only updates it, never creates it) and mark
// the listed runs' items
function _on_welcome() {
  if (!_this._global_store._owner) _this.global_store._owner = { stop: {} }
  vault_reconcile_running()
}
```
#_welcome #_util/core
