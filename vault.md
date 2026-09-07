#vault lists the runs the vault [bridge](#agent/vault) is executing and lets you stop one. A run is listed when its model execution starts and delisted when that execution ends (before its reply is published). A stop is delivered at the run's next suspension point; the runtime then finishes its work in flight before the stop takes effect (a shell command is terminated and drained, the Claude session closes) and it arrives as a `stopped` reply; the request stays claimed, so edit the message to run it again. Rows come from the bridge's last listing, whose time and age the line under the table shows (the elapsed column ticks locally; the bridge also publishes an empty listing when it starts, so a dead bridge's rows clear on its restart). The status column is the run's last activity from its log, refreshed every few seconds, overridden by a supervisor's status line (with a progress ratio when one is set); each run's log tail and supervisor notes fold out under the table, and the chat item shows the same status while it runs. A chat item with a pending vault request is shown as _running_ in every open tab, as a web agent's item is during its call: from the moment it is saved with the request (before the bridge lists it) until its reply lands.
---
#### Active Runs
<div class="runs"></div>
<div class="logs"></div>
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
// and _owner, written here ({stop: {run_id: ms}}); see notes/design/mind_vault_item.md
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

// the listed runs' status lines and progress onto their chat items (the app's per-item status
// and progress props, shown while the item runs; in-tab, nothing saved). The app assigns the
// status to innerHTML unescaped and its show_status skips an empty status and a zero progress,
// so the text is escaped here and the props are assigned directly. A delisted run's item is
// cleared (status '' and progress 0) once its last running reference is released (the marks
// are reconciled first); an item still running for another writer (a web call on the same
// chat) keeps its status for that writer, which posts its own and clears it when it completes
function vault_show_status(runs, sup = {}, shown = {}) {
  const listed = {}
  for (const [id, run] of entries(runs)) {
    const item = _item(run.item, { silent: true })
    if (!item) continue
    listed[run.item] = true
    try {
      item.status = _.escape(vault_run_status(run, sup[id]))
      item.progress = vault_run_progress(sup[id]) ?? 0
    } catch (e) {
      console.warn(`#vault: status of ${run.item} not shown: ${e}`)
    }
  }
  for (const itemId of keys(shown)) {
    if (itemId in listed) continue
    const item = _item(itemId, { silent: true })
    if (!item || item.running) continue
    try {
      item.status = ''
      item.progress = 0
    } catch (e) {
      console.warn(`#vault: status of ${itemId} not cleared: ${e}`)
    }
  }
  return listed
}

// the one reconciliation, at welcome and at every change of this store, local or remote (the app
// calls _on_global_store_change on the store's owner within about a second of a bridge write);
// the marks survive either order, a store change can reach the tab before its welcome
function vault_reconcile_running() {
  _this.store._vault_marked = vault_mark_running(vault_runs(), _this.store._vault_marked ?? {})
  _this.store._vault_shown = vault_show_status(
    vault_runs(), _this._global_store._supervisor?.runs ?? {}, _this.store._vault_shown ?? {}
  )
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

// literal text as a markdown table cell: HTML-escaped, pipes escaped for the table grammar,
// newlines flattened (a status line is shell output; `rg todo | head` must stay one cell)
const vault_cell = text => _.escape(String(text)).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

// the table rows for a listing (side-effect-free; `stop` maps run ids to flags, `link` renders one,
// `sup` maps run ids to supervisor entries)
function vault_runs_rows(bridge, stop, now, link, sup = {}) {
  return entries(bridge?.runs ?? {}).map(([id, run]) => {
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
  })
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
  vault_render('.runs', marked.parse(vault_runs_table()))
  vault_render('.logs', vault_logs_html())
}

// render into one of this item's own elements, skipping an unchanged rendering (the DOM's own
// serialization differs from the parser's string, so the last string is remembered) and keeping
// the open details blocks open across a replacement (by their run id)
function vault_render(selector, html) {
  const div = elem(selector)
  if (!div) return // the item is not in the DOM
  if (div._vault_html === html) return
  const open = new Set(
    Array.from(div.querySelectorAll?.('details[open][data-run]') ?? []).map(d => d.dataset.run)
  )
  div._vault_html = html
  div.innerHTML = html
  for (const d of Array.from(div.querySelectorAll?.('details[data-run]') ?? []))
    if (open.has(d.dataset.run)) d.open = true
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

// the message delimiters of #chat's parse_messages (the bridge ports the same grammar)
const VAULT_MESSAGE =
  /(?:^|\n) *\<< *(system|user|_?agent|tool)(?: *\( *([^\n]*) *\))? *>>(.*?)(?=$|\n *\<< *(?:system|user|_?agent|tool)(?: *\([^\n]*\))? *>>| *```(?:_output|_log)\s*\n)/gis

// the bridge's route rule (its REQUEST_TAG_PATTERN) for ASCII persona names (JavaScript's \w is
// ASCII, Python's Unicode): a vault tag with an optional persona name of word characters; exactly
// one such tag routes. An unknown persona still gets an error reply,
// which clears the mark; a malformed or ambiguous route gets no reply, so it is never marked
const VAULT_ROUTE = /^#_?agent\/(vault|native)(\/\w+)?$/
const vault_tag = tag => /^#_?agent\/(vault|native)(\/|$)/i.test(tag) // the cheap prefilter

// a pending vault request: exactly one route among the tags of the app's grammar view of the
// item (item.read(): inert reply regions are opaque markers there), and the last message a
// `\<<user>>` with content, the bridge's rule. Not mirrored (hand-built regions, backfills): the
// bridge's refusal of an unclosed region and its blankness test over the restored body
function vault_pending(item) {
  if (!(window._grammar?.version >= 2)) return false
  const view = item.read()
  const routes = window._parse_tags(view.toLowerCase()).raw.filter(tag => VAULT_ROUTE.test(tag))
  if (routes.length != 1) return false
  let last = null
  for (const match of view.matchAll(VAULT_MESSAGE)) last = match
  return !!last && last[1].toLowerCase() == 'user' && last[3].trim().length > 0
}

// the pending mark: this tab's own reference on a chat item with a pending vault request,
// acquired when the item is saved with one (a local or remote change; the app calls
// _on_item_change on listener items) and released when its reply lands or the item is deleted.
// It precedes the bridge's listing by the two Firestore round trips and outlasts the delisting
// until the reply is in the item, so the indicator covers the whole request; a listing mark on
// the same item is a second reference (the refcount), released on its own schedule
function vault_mark_pending(id, pending, marked) {
  const item = _item(id, { silent: true })
  if (pending && item && !marked[id]) {
    item.running = true
    marked[id] = true
  } else if (!pending && marked[id]) {
    delete marked[id]
    if (item) item.running = false
  }
  return marked
}

function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // a dependency of the changed item, not the item itself
  const item = deleted ? null : _item(id, { silent: true })
  const pending = !!item && !!item.tags?.some(vault_tag) && vault_pending(item)
  _this.store._vault_pending = vault_mark_pending(id, pending, _this.store._vault_pending ?? {})
}

// provision the store at app startup (the bridge only updates it, never creates it), mark the
// listed runs' items, and mark the chat items whose vault request is pending
function _on_welcome() {
  if (!_this._global_store._owner) _this.global_store._owner = { stop: {} }
  vault_reconcile_running()
  for (const item of _items())
    if (item.tags?.some(vault_tag) && vault_pending(item))
      _this.store._vault_pending = vault_mark_pending(item.id, true, _this.store._vault_pending ?? {})
}
```
#_welcome #_util/core #_listen
