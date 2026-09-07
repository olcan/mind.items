#vault lists the runs the vault [bridge](#agent/vault) is executing and lets you stop one. A run is listed when its model execution starts and delisted when that execution ends (before its reply is published). A stop is delivered at the run's next suspension point; the runtime then finishes its work in flight before the stop takes effect (a shell command is terminated and drained, the Claude session closes) and it arrives as a `stopped` reply; the request stays claimed, so edit the message to run it again. Rows are as of the bridge's last update.
---
#### Active Runs
<< vault_runs_table() >>
---
```js:js_removed
// this item's hidden store carries two subtrees: _bridge, written by the vault bridge
// ({v, host, boot, updated, runs: {run_id: {item, persona, worktree, started, stopping}}}),
// and _owner, written here ({stop: {run_id: ms}}); see notes/design/mind_vault_item.md in the vault
const vault_runs = () => _this._global_store._bridge?.runs ?? {}

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
  if (!bridge) return '_no listing yet (the bridge writes it at its first run after the install)_'
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

// provision the store at app startup (the bridge only updates it, never creates it)
function _on_welcome() {
  if (!_this._global_store._owner) _this.global_store._owner = { stop: {} }
}
```
#_welcome #_util/core
