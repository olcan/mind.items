#vault lists what the vault [bridge](#agent/vault) holds: its queued and running requests, a supervisor's workers, and the proposals of writable runs.
- **stop** cancels a run at its next step: the work in flight finishes, the reply is `stopped`, and the request stays claimed (edit it to run it again).
- **approve** merges a proposal's worktree into main once its gates pass; **reject** removes it; a delegated todo's worktree (its **state** is the todo's marker, `chat` for a chat's) takes them only while the todo is owner-held, and a row the bridge admits nothing on says why. A worktree an agent made itself is listed for its review alone: the bridge neither merges nor removes it, so tell the agent on its todo what to do with it.
- the **sparkle** at the page's lower right is an agent session watching this account in the bridge's place (solid while it watches, pulsing while it answers); dim, nobody watches and it offers to start one. Its menu (a click or a tap, or a right click) has **Stop Watching** and **Close Agent Session**, or the starts, **Resume Last Watcher** and **Cancel Start**.
- a little **sparkle by an item's number**, and left of its buttons while it is edited, marks an item an agent follows: an edit or a deletion of it wakes that agent. The menu's **watched:** lines say what each agent follows and how many items that is, each of which carries the mark; while an agent follows all items, every item is marked. The bottom-right sparkle's tooltip says the same on its second line.
- a proposal's **worktree** link opens its changes against main, submodules included, in VS Code; **dir** opens its folder in a new window (both on the editor's host, a remote one included); a todo row's marker word opens the same review for a listed worktree.
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
<style>
#item .runs, #item .proposals { overflow-x: auto; container-type: inline-size } /* a table wider than the item scrolls inside its own element instead of widening the item; the element is the width reference (cqw) of the full-span cells below */
#item .runs :is(td, th), #item .proposals :is(td, th) { white-space: nowrap } /* the main rows hold short words and links: one line each, whatever the width */
#item .runs td[colspan], #item .proposals td[colspan] { white-space: normal; overflow-wrap: anywhere; line-height: 1.4; opacity: 0.9; padding: 0 5px 4px 1.5em } /* an entry's free text (a status line, an outcome; design mind_vault_item 17): one cell spanning every column, wrapping at any point, read as the entry's sub-line; the rows' own size (a smaller one dimmed the text the row exists to show on a phone) */
#item .runs td[colspan] > span, #item .proposals td[colspan] > span { display: block; position: sticky; left: 1.5em; max-width: calc(100cqw - 1.5em - 5px) } /* the text wraps at the element's VISIBLE width and stays in view while a wide table scrolls under it */
#item .logs pre { overflow-x: auto } /* a log tail's long lines scroll inside the block */
</style>
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
// bridge takes it now) or why not); an agent's own worktree that a todo's proposal hand-back
// named is listed among them with the same fields (generation 0, both decisions refused in
// admits); see notes/design/mind_vault_item.md
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
// and progress props, shown while the item runs, by its running mark since 2026-11-19: the
// status is the mark's tooltip and a progress above 0 fills the mark, where they were a line and
// a bar at the item's bottom; in-tab, nothing saved). The app reads the status as html,
// unescaped, and its show_status skips an empty status and a zero progress, so the text is
// escaped here and the props are assigned directly (a progress of 0 is none: the mark turns);
// `shown` records the items this tab set, for the clearing below
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
// write, delivery: seconds). A pending request (vault_routed, below): the item's transcript over
// the grammar view ends with a nonblank user turn and the item is routed, both decided by the
// web responder's own functions (parse_last_turn, vault_routed_item) or, without them, by this
// item's opener rule and prefix walk; the changed item alone is read, never the corpus, so an
// edit of an old turn that still ends with a user turn, or a route the bridge never answers
// (an ambiguous chain), marks too and lapses at the timeout below; a change that leaves no pending
// request (the reply, a deletion, a removed route or turn) releases the mark. The listing takes
// the reference over when it lists the item (vault_mark_running); until then it is released at
// the item's next change that ends the request, at its deletion, or at the first tick or
// reconciliation past its VAULT_PENDING_MS deadline, so a stopped bridge leaves no lasting mark
const VAULT_PENDING_MS = 30000
// the editor the review links open (the vault's own VS Code extension `auto-open-obsidian`
// handles the URI): `vscode-insiders`, or `vscode` for the stable build
const VAULT_EDITOR = 'vscode-insiders'
// a chat REQUEST the app routes to the vault, decided as the web responder decides its own
// (agent/chat.js run_on_chat_item; the owner's ask of 2026-09-27): the item's transcript over
// the grammar view (item.read(): macros unevaluated, an inert reply body opaque), read by #chat's
// parse_last_turn (the boundaries of the responder's parse_messages, evaluating and
// reinterpreting NOTHING: a delimiter's name argument, a trailing agent block and a message
// block stay text, as the bridge reads them), ENDS with a NONBLANK user turn (content.trim(): a
// bare opener, a user turn blank before a _log or _output block, or an agent turn last is no
// request, as the bridge's pending_turn decides on its restored transcript), and the item is
// ROUTED as #agent/chat's
// vault_routed_item decides it: its own route tag, else its ONE direct chat dependency's,
// recursively (a hidden tag naming a chat item, or the immediate label prefix under autodep), so
// a task chat under an undelegated todo (`#work/0 #_chat/vault`) is routed through the command
// item; several direct chats fail closed as routed (the bridge refuses them, the mark lapses).
// Both functions come from their items through the app's eval seam (vault_chat_fn: cached per
// tab under the source item's deephash, so an /update is picked up), and when one is unavailable
// (the item missing, its eval throwing or not returning a function, the call throwing) the item
// falls back to its own reading, warned once per tab and function (whatever the reason, and not
// again for a later one): the LAST role opener at a line start is a nonblank
// user turn (vault_last_turn_is_user: `\<<user>>`, ASCII spaces before and inside allowed; an
// escaped mention inside prose or code, as in the route, command, and persona items /update
// re-saves, is no opener; a reply ends with an agent turn) and the route among the tags of the
// item's own grammar view or, for a chained item (`…/N`, created by the app under a chat)
// without one, its nearest label-prefix ancestor's (vault_route_text). The fallback patterns are
// built from a string so the item's own text carries no unescaped delimiter (a macro source)
const VAULT_OPENER = new RegExp('^ *\<< *(system|user|_?agent|tool)(?: *\\([^\\n]*\\))? *>>', 'gm')
const vault_last_turn_is_user = text => {
  let role = null
  let end = 0
  for (const m of text.matchAll(VAULT_OPENER)) [role, end] = [m[1], m.index + m[0].length]
  // a blank last user turn (the opener alone, as a fresh chat item carries it) is no request:
  // the bridge never answers it (its pending_turn rule), so marking it would only show the item
  // running until the timeout (2026-09-26, the owner's report)
  return role === 'user' && text.slice(end).trim() !== ''
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
// a function of another item's code through the app's eval seam (docs/mind_page_item_code.md:
// an item's functions are in scope for its dependents only; another item reaches them through
// _item(ref).eval, which returns the value synchronously for a sync item), cached per tab under
// the source item's deephash; null (the fallback, warned once per tab and function) when the item
// is missing, its eval throws or returns anything but a function (a promise included: the call
// is the synchronous wrapper, its async dependencies excluded), or it defines no such function;
// a fetch failure of an existing item is cached under its hash, so it is retried once the item
// changes; a missing item is looked up again at every change
const vault_chat_fn = (ref, name) => {
  const source = _item(ref, { silent: true })
  if (!source) return vault_fallback(name, `${ref} is not installed`)
  const cache = (_this.store._vault_fns ??= {})
  const cached = cache[name]
  if (cached && cached.hash === source.deephash) return cached.fn
  let fn = null
  let why = null
  try {
    fn = source.eval(`typeof ${name} == 'function' ? ${name} : null`)
    if (typeof fn?.then == 'function') [fn, why] = [null, `${ref} is async`]
    else if (typeof fn != 'function') [fn, why] = [null, `${ref} defines no ${name}`]
  } catch (e) {
    ;[fn, why] = [null, `${ref} eval failed: ${e}`]
  }
  if (why) vault_fallback(name, why)
  cache[name] = { hash: source.deephash, fn }
  return fn
}
const vault_fallback = (name, why) => {
  const warned = (_this.store._vault_warned ??= {})
  if (!warned[name]) console.warn(`#vault: ${name} unavailable (${why}); the save-time mark falls back to the item's own reading`)
  warned[name] = true
  return null
}
// the request: the last turn at the responder's boundaries, read without evaluation, over the
// grammar view; else the fallback opener rule (a call that throws falls back for that text)
const vault_pending_turn = text => {
  const last_turn = vault_chat_fn('#chat', 'parse_last_turn')
  if (last_turn) {
    try {
      const last = last_turn(text)
      return !!last && last.role === 'user' && last.content.trim() !== ''
    } catch (e) {
      vault_fallback('parse_last_turn', `threw: ${e}`)
    }
  }
  return vault_last_turn_is_user(text)
}
// the route: the responder's fence over the direct-chat lineage, else the fallback prefix walk
const vault_route_of = (item, id) => {
  const routed_item = vault_chat_fn('#agent/chat', 'vault_routed_item')
  if (routed_item) {
    try {
      return !!routed_item(item)
    } catch (e) {
      vault_fallback('vault_routed_item', `threw: ${e}`)
    }
  }
  return vault_route_text(id) !== null
}
const vault_routed = id => {
  if (!(window._grammar?.version >= 2)) return false
  const item = _item(id, { silent: true })
  if (!item) return false
  // the route first, so the transcript is read for routed items only
  return vault_route_of(item, id) && vault_pending_turn(item.read() ?? '')
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
  // the sparkle reads this store (who watches) and the #status item's (the bridge's freshness)
  if (id == _this.id || id == vault_status_item()?.id) vault_sparkle_reconcile()
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
// renderer as text it escapes (a status line is shell output; `rg todo | head` stays one cell).
// The one exception: a wiki link the app accepts under the account's setting (the vault's
// design notes/design/wiki_links.md 2.3) is the app's own anchor, its text and title as
// character references (nothing the escape would need to see), the text around it escaped as
// before; without the setting, or for a reference the app refuses, the span is literal text
const vault_cell = text => {
  const flat = String(text).replace(/\r\n|\r|\n/g, ' ')
  const literal = s => s.replace(/[!-\/:-@\[-`{-~]/g, c => '\\' + c)
  const regexp = window._wiki_link_regexp?.()
  const build = window._wiki_link_html
  if (!regexp || !build) return literal(flat)
  let out = ''
  let last = 0
  for (const m of flat.matchAll(regexp)) {
    const anchor = build(m[2], m[3] ?? null, { refs: true })
    if (!anchor) continue
    out += literal(flat.slice(last, m.index)) + anchor
    last = m.index + m[0].length
  }
  return out + literal(flat.slice(last))
}

// a table entry: the main row and, when there is one, the entry's free text (a status line, an
// outcome) as a second row of ONE cell, which the table helper extends with repeated pipes over
// every column (the colspan syntax of marked-extended-tables, installed on the app's global parser
// used below). The main row's cells are short words and links that the item's style keeps on one
// line each (nowrap; a table wider than the item scrolls inside its element), and the full-span
// cell wraps at any point under its entry, its span the style's handle to wrap the text at the
// item's visible width and keep it in view while the table scrolls (design mind_vault_item 17)
const vault_entry = (row, detail) => (detail ? [row, [`<span>${detail}</span>`]] : [row])

// the table rows for a listing (side-effect-free; `stop` maps run ids to flags, `link` renders one,
// `sup` maps run ids to supervisor entries): a run's status line is its entry's second row
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
  return queued.concat(workers, entries(runs).flatMap(([id, run]) => {
    const progress = vault_run_progress(sup[id])
    const status = String(vault_run_status(run, sup[id])).trim() // '' before the first activity
    return vault_entry([
      vault_item_cell(run.item),
      run.persona,
      id,
      Math.round((now - run.started) / 1000) + 's',
      run.worktree ?? '(read-only)', // nonempty: the table helper needs a value in every column
      progress === null ? '·' : Math.round(progress * 100) + '%', // the line itself is the row below
      run.stopping || stop?.[id] ? 'stopping…' : link(id),
    ], status && vault_cell(status))
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
  return table(rows, { headers: ['item', 'persona', 'run', 'elapsed', 'worktree', 'progress', ''] }) + '\n\n' + stamp
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
  // a wiki link's anchor in a table (data only, the app's builder): the click stop, so a click
  // opens the editor url in place and never the item's editor (the app's own anchor pass runs at
  // the item's render, not at this rewrite; design wiki_links 2.4)
  for (const a of Array.from(div.querySelectorAll?.('a[data-wiki-link]') ?? [])) a.onclick = e => e.stopPropagation()
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
// retried or switched); the outcome and the why are the entry's second row (vault_entry), the
// links or the decision in flight the main row's last cell (side-effect-free; `decide` maps
// worktrees to the owner's flags, `link` renders one action). An agent's own worktree (one the
// bridge did not make, named by its todo's proposal hand-back) is such a row the bridge admits
// nothing on: its review and folder links, and under it the bridge's phrase for what to do instead
function vault_proposal_rows(bridge, decide, link) {
  return entries(bridge?.worktrees ?? {}).flatMap(([name, wt]) => {
    const worktree = vault_review_links(name, bridge?.root)
    const flag = Object.hasOwn(decide ?? {}, name) ? decide[name] : undefined // a worktree can be named as an inherited property is
    const inFlight = !!flag && !(wt.decided >= flag.t)
    const admits = wt.admits ?? {} // an older bridge admits both
    const links = [['accepted', 'approve'], ['rejected', 'reject']].filter(([d]) => admits[d] == null).map(([d, text]) => link(name, d, text))
    const actions = inFlight ? `${flag.decision}…` : links.length ? links.join(' · ') : '·' // the why is the row below
    const why = inFlight || links.length ? '' : admits.accepted ?? admits.rejected
    const detail = [wt.result, why].filter(Boolean).map(vault_cell).join(' · ')
    return vault_entry([vault_item_cell(wt.item), worktree, String(wt.commits ?? 0), wt.task?.reason ?? 'chat', actions], detail)
  })
}

// the review url of a worktree (design mind_vault_item 10): the editor's multi-diff of the
// worktree's changes against main, populated submodules included (`review`), or the worktree's
// folder (`open`), through the vault's VS Code extension so the paths resolve on the extension
// host (a Remote-SSH window opens the remote vault's paths; a `file` link would look on the
// local machine); `root` is the vault root the bridge's listing carries (`_bridge.root`) for the
// absolute paths. Null without a root (an older bridge) or for a name outside the grammar
// (never `.` or `..`). The one place for the scheme and the editor
function vault_review_url(name, root, action = 'review') {
  if (!root || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(name)) return null
  return `${VAULT_EDITOR}://olcan.auto-open-obsidian/${action}?worktree=${name}&root=${encodeURIComponent(root)}`
}

// the review ANCHOR of a worktree: `text` linked to that url (escaped), with `title` as its
// tooltip when given, an inline click stop, and NO target. The click stop keeps the click off
// the item (a click that bubbles opens the item's editor, as the log toggle's did) and leaves
// the DEFAULT action alone, so the browser navigates in place and hands the `vscode:` url
// straight to the editor; a target would open a browser tab that launches the editor and stays
// behind empty (observed on the device). `text` is html as given (a caller passes the checked
// name or a fixed word). Null when there is no url (no root, a name outside the grammar).
// The ONE anchor form of this url: the todoer's task rows link their marker through it (reached
// by this item's eval), so a click there takes exactly the path a click here takes
function vault_review_anchor(name, root, action = 'review', text = name, title = '') {
  const url = vault_review_url(name, root, action)
  if (!url) return null
  const tip = title ? ` title="${_.escape(title)}"` : ''
  return `<a href="${_.escape(url)}"${tip} onclick="event.stopPropagation()">${text}</a>`
}

// the review links of a proposal: the multi-diff under the name and the folder under `dir`, or
// the bare name when there is no url (no root, a name outside the grammar). HTML anchors
// (above), not markdown links: the item renders its tables itself (`marked`), so the app's link
// pass never sees them
function vault_review_links(name, root) {
  const link = (action, text) => vault_review_anchor(name, root, action, text)
  if (!link('review', name)) return name
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
  const decide = Object.fromEntries(entries(store._owner?.decide ?? {}).filter(([wt]) => Object.hasOwn(listed, wt)))
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
  // this item itself changed (its text or a dependency's): installed, updated or edited, in
  // this tab or another. The sparkle drawn by the earlier code is replaced
  // (vault_sparkle_reconcile); this is the one hook that says so in every tab
  if (id == _this.id) vault_sparkle_reconcile()
  if (dependency) return // a dependency of the changed item, not the item itself
  vault_watched_changed() // a tag or a label put or taken, an item created or deleted (the watched mark)
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
  vault_provision()
  vault_reconcile_running()
  vault_sparkle_reconcile()
}

function vault_provision() {
  if (_this._global_store._owner) return
  _this._global_store._owner = { stop: {} }
  vault_save()
}

// an install after the page's welcome runs no _on_welcome: the store is provisioned here (the
// app runs this hook since its fix of 2026-11-15; on an earlier build the next page load's
// welcome provisions it, as before). The sparkle is drawn by the item's own change hook
function _on_install() {
  vault_provision()
}

// a return to the page looks at the sparkle at once (a hidden page's task is throttled, and
// the bridge's freshness is partly the time's)
function _on_focus() {
  vault_sparkle_reconcile()
}

// the sparkle (vault design notes/design/mind_bridge_watcher.md, 6.2 and 6.3): the agent session
// that watches this account in the bridge supervisor's place, and the way to start one, as ONE
// fixed element at the page's lower right with Markco's looks and words. The bridge publishes
// _bridge.watcher in this item's store: who watches ({name, took, state: 'watching' |
// 'answering', by?, tab?}), or with nobody watching what is on offer ({state: 'none', start?,
// last?}): the start the owner asked for ({id, agent, state: 'starting' | 'failed' | 'unknown',
// note?, resume?, tab?}) and the last watcher that can be resumed ({name, agent, key}). Beside
// either it lists what the item watcher follows (`follows`: the watched mark, further down). The
// element is drawn from this item's hooks and a task, never from its render, so it shows with
// #vault off screen. What the owner asks goes to the bridge as a hidden command document under
// a name of its own, `watch_command_<id>` ({id, kind, ..., at}). A stop names the take of the
// watch the menu showed. A start, a resume, a cancel and a close also carry `seen`: the
// bridge's own heartbeat as this page has it, by which the bridge drops one that comes late
const VAULT_STATUS_STALE_MS = 3 * 60000 // the #status item's own stale interval (status.md)
const VAULT_SPARKLE_TICK_MS = 15000 // the look at the time's part of the bridge's freshness
const VAULT_MARK_MS = 30000 // how long a command this tab sent shows as under way
const VAULT_KEYBOARD_PX = 150 // a visual viewport this much shorter than the window: a keyboard, probably
const VAULT_AGENTS = { claude: 'Claude', codex: 'Codex' } // the agents a start can ask for
const VAULT_NOTE_CHARS = 200 // how much of the bridge's note on a start the sparkle's title takes
// this evaluation's code version: the item's text and its dependencies' (a controller drawn by
// other code is replaced; captured here, since a closure reads the item's hash as it is later)
const vault_code = _this.deephash

const vault_status_item = () => _item('#status', { silent: true })
// whether this item is the page's one #vault, the item the bridge lists into: a renamed copy
// that keeps this code is not, and neither is any of two items under the label
const vault_is_current = () => _item('#vault', { silent: true })?.id == _this.id
const vault_status_hosts = () => vault_status_item()?._global_store?._status?.hosts ?? null

// the bridge's start and last watcher as this code can use them: null for anything else. An
// agent is one of the two this code names (an inherited property's name is none)
const vault_agent = agent => (typeof agent == 'string' && Object.hasOwn(VAULT_AGENTS, agent) ? agent : null)
// what brings an agent's herdr tab up on the owner's machine, as the bridge gives it (the tab,
// with its host, its herdr session and the agent's own session when it has them): strings
// alone, and null without a tab. The page does nothing with it but hang it on the sparkle
// (`data-vault-jump`), for a browser extension that can ask the machine for that tab
const vault_jump = jump =>
  jump && typeof jump == 'object' && typeof jump.tab == 'string' && jump.tab
    ? Object.fromEntries(['tab', 'host', 'herdr', 'session'].filter(key => typeof jump[key] == 'string' && jump[key]).map(key => [key, jump[key]]))
    : null
const vault_start = start =>
  start && typeof start == 'object' && typeof start.id == 'string' && start.id && ['starting', 'failed', 'unknown'].includes(start.state)
    ? { id: start.id, state: start.state, agent: vault_agent(start.agent), resume: start.resume === true, tab: start.tab === true, jump: vault_jump(start.jump), note: typeof start.note == 'string' ? start.note.slice(0, VAULT_NOTE_CHARS) : '' }
    : null
const vault_last_watcher = last =>
  last && typeof last == 'object' && typeof last.key == 'string' && last.key && vault_agent(last.agent)
    ? { key: last.key, agent: last.agent, name: typeof last.name == 'string' ? last.name : '' }
    : null

// what the sparkle shows (null: nothing), a pure function of the bridge's listing, the #status
// item's hosts, the time and this tab's own marks. Nothing shows unless the bridge that wrote
// the listing is fresh: its own #status entry, written by the bridge, within the stale interval
// (it fails closed: no entry for the listing's host, another publisher such as the one-shot
// `cli`, or a time that is no number shows nothing). `seen` is that entry's time, which a
// command carries. A watcher is shown solid; with nobody watching the sparkle is dim: the offer
// to start one, a start under way, or what became of the last one. `marks` are commands this
// tab sent, each shown for VAULT_MARK_MS at most: `stopping` and `closing` ({took, at}) for the
// watch listed, `cancelling` ({id, at}) for the start shown, and `started` ({id, at}), a start
// the bridge has not named yet: starting for that long, then NOT CONFIRMED until the owner acts
// on it or the bridge names that id (another start's record never acknowledges this one, and
// an agent that watches only hides it: it need not be the one this start asked for)
function vault_sparkle_state(bridge, hosts, now, marks = {}) {
  const entry = typeof bridge?.host == 'string' && hosts ? hosts[bridge.host] : null
  if (!entry || entry.publisher != 'bridge' || typeof entry.updated != 'number') return null
  if (!(now - entry.updated <= VAULT_STATUS_STALE_MS)) return null
  const seen = entry.updated
  const watcher = bridge.watcher && typeof bridge.watcher == 'object' ? bridge.watcher : {}
  const { name, took, state, by } = watcher
  const live = mark => !!mark && now - mark.at <= VAULT_MARK_MS
  if (typeof name == 'string' && name && typeof took == 'string' && took) {
    const closing = live(marks.closing) && marks.closing.took === took
    const stopping = live(marks.stopping) && marks.stopping.took === took
    const answering = state == 'answering'
    const who = typeof by == 'string' && by ? by : name
    const title = closing ? `Closing ${name}'s session` : stopping ? `Stopping ${name}'s watch` : answering ? `${who} is answering` : `${name} is watching`
    return { kind: 'watching', key: 'watching:' + took, name, took, tab: watcher.tab === true, jump: vault_jump(watcher.jump), busy: closing || stopping || answering, dim: false, title, seen }
  }
  const last = vault_last_watcher(watcher.last)
  const start = vault_start(watcher.start)
  const shown = (kind, id, title, more = {}) => ({ kind, key: `${kind}:${id ?? ''}:${last?.key ?? ''}`, start: id, tab: false, jump: null, busy: false, dim: true, title, last, seen, ...more })
  if (start?.state == 'starting') {
    const cancelling = live(marks.cancelling) && marks.cancelling.id === start.id
    return shown('starting', start.id, cancelling ? 'Cancelling the start' : 'An agent is starting to watch', { busy: true, tab: start.tab, jump: start.jump })
  }
  const sent = marks.started && marks.started.id !== start?.id ? marks.started : null
  if (sent && live(sent)) return shown('starting', sent.id, 'An agent is starting to watch', { busy: true })
  if (sent) return shown('unconfirmed', sent.id, 'The bridge did not confirm the start: open the menu to start again')
  if (start) {
    const what = start.state == 'unknown' ? "A start's outcome is unknown" : start.resume ? 'The last watcher was not resumed' : `${VAULT_AGENTS[start.agent] ?? 'The agent'} did not start`
    return shown(start.state, start.id, start.note ? `${what}: ${start.note}` : what, { tab: start.tab })
  }
  return shown('offer', null, 'Start a watcher')
}

// the menu's entries for what the sparkle shows, each [key, label]: with a watcher its stop
// and, when its agent runs in a herdr tab the bridge can close, its session's close; with
// nobody watching the starts, the resume of the last watcher when there is one, and the cancel
// of a start that may have opened a tab. A start under way offers its cancel alone
function vault_sparkle_entries(state) {
  if (!state) return []
  if (state.kind == 'watching') return [['stop', 'Stop Watching'], ...(state.tab ? [['close', 'Close Agent Session']] : [])]
  const cancel = [['cancel', 'Cancel Start']]
  if (state.kind == 'starting') return cancel
  const resume = state.last ? [['resume', `Resume Last Watcher (${VAULT_AGENTS[state.last.agent]})`]] : []
  const starts = [['claude', 'Start Claude Watcher'], ['codex', 'Start Codex Watcher'], ...resume]
  return state.kind == 'unconfirmed' || (state.kind == 'unknown' && state.tab) ? [...starts, ...cancel] : starts
}

// a phone's keyboard, as far as a page can tell: the visual viewport much shorter than the
// window (a heuristic, not proof; a pinch zoom shrinks it too and is left alone)
const vault_keyboard_open = win => {
  const view = win.visualViewport
  return !!view && view.scale <= 1.01 && win.innerHeight - view.height > VAULT_KEYBOARD_PX
}

const vault_command_id = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('')

const vault_watch_stop = (id, took, at) => ({ id, kind: 'stop', took, at })
// a start ({agent}), a resume ({last}), a cancel ({start}) or a close ({took}): what it names
// is what the menu showed, and `seen` the bridge's heartbeat as the page has it when it is sent
const vault_watch_command = (kind, id, fields, seen, at) => ({ id, kind, ...fields, seen, at })

// send the bridge a command of the watch, through the app's narrow hidden-document operation
// (as the todoer's commands go): a terminal create failure is retried ONCE at the same
// document id, then said
async function vault_send_watch_command(command, retry_id = null) {
  let enqueued
  try {
    enqueued = await window._enqueue_hidden_document('watch_command_' + command.id, command, retry_id)
  } catch (e) {
    alert(`could not ${command.kind} the watch: ${e?.message ?? e}`)
    return false
  }
  enqueued.written.catch(e => {
    if (!retry_id) return vault_send_watch_command(command, enqueued.id)
    alert(`the watch's ${command.kind} was not saved: ${e?.message ?? e}`)
  })
  return true
}

// the watched mark (vault design notes/design/mind_bridge_watcher.md, D25): the mark of an item
// whose edit or deletion would wake an agent, i.e. one that a running `mind_watch.py follow` or
// `await` selects. The bridge publishes WHAT each such follow selects, never a list of items, as
// `_bridge.watcher.follows` (vault lib/mindpage_follows.py): up to eight rules, each
// `{watch, name, since}` with `all: true`, or with those of `ids`, `labels` (globs with `*` and
// `?`) and `tags` that are not empty. The watcher refuses a watch that a page cannot show item by
// item (a selector of another shape, a selection over a bound, a ninth watch), so a rule is the
// whole watch: the sparkle's controller matches the rules against this page's items, marks the
// ones they name, however many, and says in its menu what is followed, one line a rule. A rule
// of all items marks every item, with nothing to match. A FOLLOW OF ANOTHER READING HAS NO RULE: the
// bridge publishes one only for a follow that selects by its own reading (the app's), and counts
// any other (one started by the watcher's code before the reading had a version, until it is
// started again) in a closing entry, `{more: ['1 more watch']}`: nothing is marked for it, and
// its line says that one more watch runs. A rule's own `more` (words for what no page checks) is
// an older bridge's alone: such a rule's line says the words and no count
const VAULT_FOLLOWS = 9 // the bridge's eight rules and its closing entry
const VAULT_WATCHED_MS = 250 // changes of items within this long are one look at the rules
const VAULT_WATCHED_SLOW_MS = 50 // a look that took longer is said in the menu, and warned of once
// what this page checks, by shape, which is what the watcher admits (ID, GLOB and TAG in vault
// lib/mindpage_follows.py): an id; a glob without a bracket (the watcher's fnmatch reads one as
// a set) and an absolute tag (a relative one, `#/x`, is another tag on every item), both of
// printable ASCII: the app and the watcher lowercase a text by the Unicode tables of their own
// runtimes, which agree there
const VAULT_FOLLOW_ID = /^[A-Za-z0-9_-]{1,64}$/
const VAULT_FOLLOW_GLOB = /^[!-Z\\^-~]{1,64}$/
const VAULT_FOLLOW_TAG = /^#[!-.0-~][!-~]{0,62}$/

// the published rules as this code can use them, like the start and the last watcher above:
// strings of those shapes within the bridge's own bounds, and nothing else. A selector of
// another shape joins `more`, the words of the menu's line; a rule left with nothing is none
const vault_follow = told => {
  if (!told || typeof told != 'object') return null
  const text = (key, most) => (typeof told[key] == 'string' ? told[key].slice(0, most) : '')
  const head = { watch: text('watch', 64), name: text('name', 64), since: text('since', 32) }
  if (told.all === true) return { ...head, all: true, ids: [], labels: [], tags: [], more: [] }
  const list = (key, most) => (Array.isArray(told[key]) ? told[key].filter(s => typeof s == 'string' && s).slice(0, most) : [])
  const [globs, tags] = [list('labels', 16), list('tags', 16)]
  const said = [...tags.filter(tag => !VAULT_FOLLOW_TAG.test(tag)), ...globs.filter(glob => !VAULT_FOLLOW_GLOB.test(glob)).map(glob => 'label ' + glob), ...list('more', 12)]
  const rule = {
    ...head,
    all: false,
    ids: list('ids', 50).filter(id => VAULT_FOLLOW_ID.test(id)),
    labels: globs.filter(glob => VAULT_FOLLOW_GLOB.test(glob)).map(glob => glob.toLowerCase()),
    tags: tags.filter(tag => VAULT_FOLLOW_TAG.test(tag)).map(tag => tag.toLowerCase()),
    more: said.map(words => (words.length > 96 ? words.slice(0, 96) + '…' : words)),
  }
  return rule.ids.length || rule.labels.length || rule.tags.length || rule.more.length ? rule : null
}
const vault_follows = watcher =>
  watcher && typeof watcher == 'object' && Array.isArray(watcher.follows) ? watcher.follows.slice(0, VAULT_FOLLOWS).map(vault_follow).filter(rule => rule) : []

// whether the glob names the label, as the watcher's fnmatch reads the two: `*` is any run of
// characters (`/` included), `?` one character, and the whole label must match. The label comes
// as its characters (code points, as fnmatch counts them: a character outside the basic plane is
// one to `?`); the glob is printable ASCII. A loop and no RegExp: no text of a rule becomes a
// pattern. It is not linear: after a mismatch a star takes one more character and what follows
// it in the glob is tried again, so the work is at most the label's length times the glob's (64
// at most), where a pattern of many stars has no such bound
function vault_glob_names(glob, label) {
  let [g, l, star, kept] = [0, 0, -1, 0]
  while (l < label.length) {
    if (glob[g] == '*') [star, kept, g] = [g, l, g + 1]
    else if (g < glob.length && (glob[g] == '?' || glob[g] == label[l])) [g, l] = [g + 1, l + 1]
    else if (star >= 0) [g, kept, l] = [star + 1, kept + 1, kept + 1]
    else return false
  }
  while (glob[g] == '*') g++
  return g == glob.length
}

// ONE READING. An agent is woken for the items its watcher selects (vault lib/mindpage_watch.py,
// Selection), and the watcher reads an item's label and tags as the app does: its reader (vault
// lib/mindpage_reading.py) is the app's own passage in Python, relative tags, the child tags of
// an agent's replies and the app's header rule included, and one corpus that both run over pins
// the two (mind.page tests/e2e/fixtures/reading_corpus.json). So this page marks by the app's
// reading as it is, the label index and `tags_raw`, and parses no tag itself

// one look at the page's items for the rules: for each rule the items it names (`n`) and, for a
// rule of one id, its item's name when it is a label; and the union to mark, as the in-tab ids
// the items' boxes carry (sorted, so the same items are the same stylesheet). An id reaches its
// item through the app's own lookup, which finds the item this tab holds under a temporary id by
// its saved one, and must BE the saved id, which is what the watcher compares. A glob is tested
// against the keys of the app's label index, whose ids are marked as they are: no item is read
// for it. A tag is one of an item's `tags_raw` (the app's own parse, the hiding underscore
// kept), in ONE pass over the items, made only when some rule has a tag
function vault_watched(follows) {
  const found = follows.map(() => ({ ids: new Set(), name: null }))
  follows.forEach((rule, at) => {
    for (const id of rule.ids) {
      const item = _item(id, { silent: true })
      if (item?.saved_id !== id) continue
      found[at].ids.add(item.id)
      if (rule.ids.length == 1 && item.name?.startsWith('#')) found[at].name = item.name
    }
  })
  if (follows.some(rule => rule.labels.length))
    _labels((label, ids) => {
      const characters = [...label]
      follows.forEach((rule, at) => {
        if (rule.labels.some(glob => vault_glob_names(glob, characters))) for (const id of ids) found[at].ids.add(id)
      })
    })
  if (follows.some(rule => rule.tags.length))
    for (const item of _items()) {
      const tags = item.tags_raw ?? []
      follows.forEach((rule, at) => {
        if (rule.tags.some(tag => tags.includes(tag))) found[at].ids.add(item.id)
      })
    }
  return {
    ids: [...new Set(found.flatMap(({ ids }) => [...ids]))].filter(id => /^[\w-]+$/.test(id)).sort(),
    rules: found.map(({ ids, name }) => ({ n: ids.size, name })),
  }
}

// the menu's line for a rule: what it selects, as the watcher was told it, then how many items
// of this page that is at its last look (`seen`, null when none was made). The count is the
// whole watch: every item the rule names is marked, however many, and it names no other. While
// some watch follows all items (`all`) every item is marked and no look is made, so each other
// rule's line is what it selects and no more. A rule of ids alone that all resolve is said
// short, one of them by its item's name. An entry with words (`more`: the closing entry's count
// of the watches that have no rule, or an older bridge's words for a selector) says them and no
// count: nothing of it is checked here
const vault_count = n => `${n.toLocaleString('en-US')} item${n == 1 ? '' : 's'}`
// what a rule selects, in its line's words: its tags, its label globs, its ids (the one item's
// name when the last look found it), then an entry's own words
const vault_follow_ids = (rule, seen) => (rule.ids.length ? [seen?.name ?? `${rule.ids.length} by id`] : [])
const vault_follow_what = (rule, seen) => (rule.all ? 'all items' : [...rule.tags, ...rule.labels, ...vault_follow_ids(rule, seen), ...rule.more].join(', '))
function vault_follow_line(rule, seen, all) {
  if (rule.all) return 'watched: all items'
  const by_id = vault_follow_ids(rule, seen)
  const what = vault_follow_what(rule, seen)
  if (all || !seen || rule.more.length) return `watched: ${what}`
  if (what == by_id[0] && seen.n == rule.ids.length) return `watched: ${seen.name ?? vault_count(seen.n)}`
  return `watched: ${what} (${vault_count(seen.n)})`
}
// the line's tooltip: the agent that follows, what it follows as the line says it, and since
// when. Not the watch's name, an agent's own label for its saved state: a watch of `#watch`
// named `watch` read "(watch watch)" (the owner, 2026-11-18: "using the tag form `#watch`
// would be clearer"). An entry that is no watch's own (no name of one) has no tooltip
const vault_follow_title = (rule, seen) => {
  const since = new Date(rule.since)
  return rule.watch ? `${rule.name || 'An agent'} follows ${vault_follow_what(rule, seen)}${isNaN(since) ? '' : ` since ${since.toLocaleString()}`}` : ''
}
// the sparkle's tooltip: what it shows (`shown`: who watches, a start, a stop), and on a second
// line what is watched (the owner, 2026-11-18: "i'd like to see it as second line of the
// tooltip too"): the menu's `watched:` lines on one line, the word said once and a dot
// between the watches, a rule's own commas being its selectors'. A line that is no watch's (a
// slow look's) is not in it, and with no watch the tooltip is one line
const VAULT_WATCHED = 'watched: '
function vault_sparkle_title(shown, lines) {
  const watched = lines.filter(line => line.text.startsWith(VAULT_WATCHED)).map(line => line.text.slice(VAULT_WATCHED.length))
  return watched.length ? `${shown}\n${VAULT_WATCHED}${watched.join(' · ')}` : shown
}

// the mark itself, the owner's look (2026-11-16): ONE stylesheet whose rules name the items by
// the id their box carries (data-item-id), so nothing is attached to an item and the app's
// search, toggles, hiding and column layout cannot lose it: a little sparkle, with no
// background, left of the item's number, and while the item is edited, when its number is not
// shown, the same sparkle left of the edit menu's buttons ("so i can tell either way when the
// item is being watched"). By the number the sparkle has room of its own (2026-11-17: the
// number's box is as wide as its digits now, where it kept four digits' room that a short
// number left to the sparkle): it takes none of the box (its margins sum to minus its width),
// so it is drawn in the 18px left of the digits whatever the box's width, and two rules keep
// those 18px free, the item's text out of them (the app's placeholder for the menu, the first
// child of the item's text, floats with that much margin) and a run button to their left
// (shifted, so the menu's own size, which the app measures once for all items, is not the
// mark's to change). Its sizes are the owner's: about the height of the number's digits on an
// item and centred on them, a little less than the buttons' height in the editor. No text of a
// rule enters the stylesheet: the ids are the app's own, kept to `[\w-]+` (vault_watched). Under
// a watch of all items (`all`) the same rules name no item: they are on every item's box.
// The room is SAID, once, and the app keeps it free (2026-11-18): `--item-mark-room` on the
// item's box, the app's own name for the room of a mark that item code draws left of the number
// (Item.svelte, THE MARKS LEFT OF AN ITEM'S NUMBER). The app adds the room of its running mark,
// the circle it draws left of this sparkle while the item runs, so neither knows the other's
// size. An app from before that day reads no such property: for it alone the two rules that
// kept the room until then stay, now reading the same property (on the app that keeps the room
// itself they set what it sets). They go once no tab runs the older app
const vault_watched_css = (ids, all = false) => {
  if (!all && !ids.length) return ''
  const boxes = all ? '.container[data-item-id]' : `:is(${ids.map(id => `.container[data-item-id="${id}"]`).join(', ')})`
  const mark = px => `url("data:image/svg+xml,${encodeURIComponent(VAULT_SPARKLE_SVG.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" `).replace('currentColor', '#f5e389'))}")`
  return [
    // by the number: an image ON the number's baseline (its box is a line of the number's own
    // font, centred in the number's box as the number's text is), lowered by WHOLE pixels. The
    // browser rounds the text's baseline and an image's edge to the pixel grid separately, so a
    // fractional offset left the sparkle half a pixel high on some items and half a pixel low on
    // others, by where each item sits (measured by pixels in Open Sans at 1x and 2x, 2026-11-16).
    // A whole one moves the two together, and 15px lowered by 2 puts its middle on the middle of
    // the digits (13px lowered by 1 does too; 14px can only be half a pixel off, either way)
    `${boxes} .item-menu > .button.index::before { content: ${mark(15)}; flex: none; margin: 0 3px 0 -18px; position: relative; top: 2px }`,
    // its room, the 18px left of the digits, said to the app, which keeps the item's text out of
    // them and moves a run button aside
    `${boxes} { --item-mark-room: 18px }`,
    // the same for an app from before 2026-11-18, which kept no room for a mark
    `${boxes} .item > [id^="menu-"]:first-child { margin-left: var(--item-mark-room) }`,
    `${boxes} .item-menu > .button.run { position: relative; right: var(--item-mark-room) }`,
    // in the editor: centred on the buttons
    `${boxes} .edit-menu::before { content: ''; flex: none; align-self: center; width: 23px; height: 23px; margin-right: 6px; background: ${mark(23)} center / contain no-repeat }`,
  ].join('\n')
}
// an item changed: the sparkle's controller of THIS item looks at the rules again a moment later,
// when a rule with something to check is applied. With none nothing is dispatched and no item
// is read, so an account where nothing is followed, or all of it is, pays no look and no pass
// over its items for the mark (under a watch of all items the browser still applies the one
// rule to every item's box)
const vault_watched_changed = () => {
  const held = window._vault_sparkle
  if (held?.item === _this.id) held.look?.()
}

const VAULT_SPARKLE_CSS = `
.vault-sparkle { position: fixed; right: 14px; bottom: 10px; z-index: 90; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: #222; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); color: #f5e389; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; -webkit-tap-highlight-color: transparent }
.vault-sparkle[hidden] { display: none }
.vault-sparkle:focus { outline: none }
.vault-sparkle:focus-visible { outline: 1px solid #f5e389 }
.vault-sparkle.idle { color: rgba(245, 227, 137, 0.45) }
@media (hover: hover) { .vault-sparkle.idle:hover { color: rgba(245, 227, 137, 0.9) } }
.vault-sparkle > svg { display: block; width: 16px; height: 16px }
.vault-sparkle.answering > svg { animation: vault-sparkle-pulse 1.2s ease-in-out infinite }
@keyframes vault-sparkle-pulse { 50% { opacity: 0.3 } }
.vault-sparkle-backdrop { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 89; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); animation: vault-sparkle-fade 0.12s ease-out }
@keyframes vault-sparkle-fade { from { opacity: 0 } }
.vault-sparkle-menu { position: fixed; right: 14px; bottom: 42px; z-index: 90; box-sizing: border-box; max-height: calc(100vh - 52px); max-height: calc(100dvh - 52px); overflow-y: auto; overscroll-behavior: contain; padding: 4px; border: 1px solid #444; border-radius: 6px; background: #1b1b1b; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5) }
.vault-sparkle-menu:focus { outline: none }
.vault-sparkle-menu > button { display: block; width: 100%; margin: 0; padding: 6px 12px; border: 0; border-radius: 4px; background: none; color: #ddd; font: 14px/1.2 sans-serif; text-align: left; white-space: nowrap; cursor: pointer }
.vault-sparkle-menu > button:focus { background: #333; outline: none }
.vault-sparkle-menu > div { max-width: min(340px, calc(100vw - 54px)); padding: 3px 12px; color: #999; font: 12px/1.3 sans-serif; overflow-wrap: anywhere; cursor: default; user-select: none; -webkit-user-select: none }
.vault-sparkle-menu > button + div { margin-top: 4px; padding-top: 7px; border-top: 1px solid #333 }
`
const VAULT_SPARKLE_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0.5l1.9 5.6 5.6 1.9-5.6 1.9L8 15.5l-1.9-5.6L0.5 8l5.6-1.9z"/></svg>'

// draw or update the page's one sparkle. Its controller lives on window, since the item's code
// is evaluated afresh at every hook and nothing else outlives one: it OWNS the element, its
// style, the watched items' stylesheet, the menu, the viewport listener and the task that looks at the
// time, and its dispose() releases all of them and nothing of a newer controller's (a disposed
// controller opens no menu and sends nothing, and its task ends). A controller drawn by other code (an update of this item or of a
// dependency, in this tab or another) or for another item is disposed BEFORE the new one
// draws: the app cancels the earlier controller's task only when the new task is dispatched,
// and that cancellation is the earlier controller's own dispose again. Only the page's one
// #vault draws: any other item that carries this code draws nothing, releases a controller
// of its own, and leaves the controller of the item that is #vault alone
function vault_sparkle_reconcile() {
  if (typeof document == 'undefined') return // no page
  let held = window._vault_sparkle
  if (!vault_is_current()) {
    if (held?.item === _this.id) held.dispose()
    return
  }
  if (held && (held.code !== vault_code || held.item !== _this.id)) {
    held.dispose()
    held = null
  }
  ;(held ?? vault_sparkle_create()).show()
}

function vault_sparkle_create() {
  // `rule` is the JSON of the rules last applied (`follows`), `all` whether one of them is of
  // all items, `checks` whether they hold anything this page checks, `found` what the last
  // look at the items found for them (null: no look), `took` how long that look took (ms),
  // and `warned` whether a slow look was warned of
  const self = { code: vault_code, item: _this.id, shown: null, marks: {}, menu: null, disposed: false, rule: '[]', follows: [], all: false, checks: false, found: null, took: 0, warned: false }
  const style = (self.style = document.createElement('style'))
  style.dataset.vaultSparkle = 'style'
  style.textContent = VAULT_SPARKLE_CSS
  document.head.appendChild(style)
  // the watched items' mark: a stylesheet of its own, rewritten when the items the rules name
  // are others, and gone with the controller (a replaced controller takes its marks with it)
  const watched = (self.watched = document.createElement('style'))
  watched.dataset.vaultSparkle = 'watched'
  document.head.appendChild(watched)
  const node = (self.node = document.createElement('button'))
  node.type = 'button'
  node.className = 'vault-sparkle'
  node.dataset.vaultSparkle = 'node'
  node.setAttribute('aria-haspopup', 'menu')
  node.hidden = true
  node.innerHTML = VAULT_SPARKLE_SVG
  document.body.appendChild(node)

  // what the store, the #status item, the time and this tab's marks say now. A start this tab
  // sent is the bridge's to show once the bridge names it: nothing else ends its mark here but
  // the owner's own word on it (its cancel, or another start). A watcher is no word on it.
  // A menu whose state is no longer the one shown closes: its entries are offered no longer
  self.show = () => {
    const bridge = _this._global_store._bridge
    const state = vault_sparkle_state(bridge, vault_status_hosts(), Date.now(), self.marks)
    if (self.marks.started && vault_start(bridge?.watcher?.start)?.id === self.marks.started.id) self.marks.started = null
    // what the item watcher follows, read only while the bridge is fresh (the sparkle's own
    // test). Rules that are not the ones applied are applied: where nothing has to be worked
    // out the marks are set at once and no item is read (every item's under a watch of all
    // items; none's with nothing to check: no rule, a stale bridge, words alone), else a
    // look is asked for. An unchanged rule looks at nothing, so the time's tick never scans
    const follows = state ? vault_follows(bridge.watcher) : []
    const rule = JSON.stringify(follows)
    if (rule !== self.rule) {
      const all = follows.some(told => told.all)
      const checks = !all && follows.some(told => told.ids.length || told.labels.length || told.tags.length)
      Object.assign(self, { rule, follows, all, checks, found: null })
      if (checks) self.look()
      else self.mark()
    }
    const keyboard = vault_keyboard_open(window)
    if (self.menu && (!state || keyboard || state.key !== self.menu.key || self.lines().key !== self.menu.lines)) self.close()
    self.shown = state
    node.hidden = !state || keyboard
    // the watching or starting agent's herdr tab, for an extension of the browser that can
    // bring it up at a click on the sparkle (the click is the menu's here, as everywhere else):
    // none while there is nothing to show, the hidden element included (review 37)
    const jump = state?.jump ? JSON.stringify(state.jump) : null
    if (jump === null) delete node.dataset.vaultJump
    else node.dataset.vaultJump = jump
    if (!state) return
    self.say()
    node.classList.toggle('answering', state.busy)
    node.classList.toggle('idle', state.dim)
  }
  // the sparkle's own words, its tooltip: what it shows, and below it what is watched, as the
  // menu's lines say it now (vault_sparkle_title). Said again after each look, whose counts
  // the lines carry
  self.say = () => {
    if (!self.shown) return
    const title = vault_sparkle_title(self.shown.title, self.lines().lines)
    if (node.title !== title) {
      node.title = title
      node.setAttribute('aria-label', title)
    }
  }

  // the look at the items for the rules applied: whatever it finds is marked, the marks are
  // rewritten when the items are others, and a menu whose lines are no longer the ones it
  // shows closes. With nothing to check it reads no item: the marks are on every item under
  // a watch of all items, and cleared otherwise. It times its own work (`took`): the listing
  // and matching (vault_watched) and the stylesheet's replacement, with no style or layout
  // forced and no frame waited for, so what the browser then does with the sheet is not in
  // it. A look over VAULT_WATCHED_SLOW_MS is said in the menu (lines) until a later one is
  // under it, and warned of once in the controller's life: evidence of a slow page, should
  // there ever be any, is then the owner's own devices'
  self.mark = () => {
    if (self.disposed) return
    const began = performance.now()
    self.found = self.checks ? vault_watched(self.follows) : null
    const css = vault_watched_css(self.found?.ids ?? [], self.all)
    if (watched.textContent !== css) watched.textContent = css
    self.took = performance.now() - began
    if (self.took > VAULT_WATCHED_SLOW_MS && !self.warned) {
      self.warned = true
      const [marked, rules] = [self.all ? 'all items' : vault_count(self.found?.ids.length ?? 0), self.follows.length]
      console.warn(`vault: marking the watched items took ${Math.round(self.took)} ms (${marked} marked, ${rules} rule${rules == 1 ? '' : 's'})`)
    }
    if (self.menu && self.lines().key !== self.menu.lines) self.close()
    self.say()
  }
  // a look a moment from now, as a task of the item: one for a burst of changes (a later
  // request replaces the task), and none inside the welcome, which enumerates no item
  self.look = () => {
    if (!self.disposed && self.checks) _this.dispatch_task('watched', () => void self.mark(), VAULT_WATCHED_MS)
  }
  // the menu's lines for the rules applied, by the last look, then one more while that look
  // was a slow one, and their text as one key
  self.lines = () => {
    const lines = self.follows.map((rule, at) => {
      const seen = self.found?.rules[at] ?? null
      return { text: vault_follow_line(rule, seen, self.all), title: vault_follow_title(rule, seen) }
    })
    if (self.took > VAULT_WATCHED_SLOW_MS) lines.push({ text: `marking took ${Math.round(self.took)} ms`, title: '' })
    return { lines, key: lines.map(line => line.text).join('\n') }
  }

  // the menu, above the sparkle. It captures what it shows, so an entry acts on that watch,
  // that start or that last watcher and on no other; its keys are its own while it has the
  // focus (the app's window handlers bubble, so a stop here keeps them out), except under a
  // modal, which gets the key and closes the menu; it closes on Escape, on a click outside,
  // when the focus leaves it, and when what it showed is no longer what the sparkle shows.
  // ONE entry is highlighted at most, the one with the focus, which follows the last input: a
  // pointer over an entry takes it there, an arrow moves it, and a mouse that leaves the menu
  // leaves no entry with it. Opened from the keyboard (`keyboard`) the first entry has it;
  // opened by a pointer none has, until the pointer or an arrow comes. A layer under the menu
  // covers the page while it is open, so a click or a tap outside closes the menu and is
  // nothing to the page under it. Below the entries, one line of text for each rule the item
  // watcher follows (vault_follow_line), and one for a slow look: no entry, so it takes no
  // focus and the arrows skip it, and a menu whose lines are no longer what the page would
  // show closes. The menu is never taller than the window (its style): what does not fit
  // scrolls inside it, and the entries are its first rows, in view when it opens
  self.open = (keyboard = false) => {
    if (self.disposed || self.menu || !self.shown || node.hidden) return
    const target = self.shown
    const entries = vault_sparkle_entries(target)
    const followed = self.lines()
    const menu = document.createElement('div')
    menu.className = 'vault-sparkle-menu'
    menu.dataset.vaultSparkle = 'menu'
    menu.setAttribute('role', 'menu')
    menu.tabIndex = -1
    const act = (e, key) => {
      e.preventDefault()
      e.stopPropagation()
      self.close(true)
      self.act(key, target)
    }
    const buttons = entries.map(([key, label]) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.dataset.vaultEntry = key
      button.textContent = label
      button.addEventListener('click', e => act(e, key))
      for (const type of ['pointermove', 'pointerdown'])
        button.addEventListener(type, () => button.focus({ preventScroll: true }))
      return menu.appendChild(button)
    })
    for (const { text, title } of followed.lines) {
      const line = document.createElement('div')
      line.textContent = text
      if (title) line.title = title
      menu.appendChild(line)
    }
    menu.addEventListener('pointerleave', e => {
      if (e.pointerType == 'mouse' && buttons.includes(document.activeElement)) menu.focus({ preventScroll: true })
    })
    menu.addEventListener('keydown', e => {
      if (window._modal_visible?.()) return self.close() // the modal's key
      e.stopPropagation()
      const at = buttons.indexOf(document.activeElement)
      if (e.key == 'Escape') {
        e.preventDefault()
        self.close(true)
      } else if (e.key == 'ArrowDown' || e.key == 'ArrowUp') {
        e.preventDefault()
        const next = e.key == 'ArrowDown' ? at + 1 : (at < 0 ? 0 : at) - 1 + buttons.length
        buttons[next % buttons.length].focus({ preventScroll: true })
      } else if (e.key == 'Enter' || e.key == ' ') {
        if (e.repeat || at < 0) e.preventDefault() // only the press itself acts, and on the entry that has the focus
        else act(e, entries[at][0])
      }
    })
    menu.addEventListener('keyup', e => {
      if (window._modal_visible?.()) return
      e.stopPropagation()
      e.preventDefault()
    })
    for (const type of ['mousedown', 'touchstart']) menu.addEventListener(type, e => e.stopPropagation(), { passive: true })
    menu.addEventListener('focusout', e => {
      if (!menu.contains(e.relatedTarget) && e.relatedTarget !== node) self.close()
    })
    // the layer: a press on it is not the page's or the app's, and takes no focus; its click
    // (the whole press, so nothing of it is left for what lies under) closes the menu
    const backdrop = document.createElement('div')
    backdrop.className = 'vault-sparkle-backdrop'
    backdrop.dataset.vaultSparkle = 'backdrop'
    for (const type of ['pointerdown', 'mousedown'])
      backdrop.addEventListener(type, e => {
        e.preventDefault()
        e.stopPropagation()
      })
    backdrop.addEventListener('touchstart', e => e.stopPropagation(), { passive: true })
    for (const type of ['click', 'contextmenu'])
      backdrop.addEventListener(type, e => {
        e.preventDefault()
        e.stopPropagation()
        self.close()
      })
    // a press on anything else that is not the menu or the sparkle (something drawn above the layer)
    const outside = e => {
      if (!menu.contains(e.target) && !node.contains(e.target) && e.target !== backdrop) self.close()
    }
    document.addEventListener('pointerdown', outside, true)
    self.menu = { element: menu, key: target.key, lines: followed.key, outside, backdrop, keyboard }
    node.setAttribute('aria-expanded', 'true')
    document.body.appendChild(backdrop)
    document.body.appendChild(menu)
    ;(keyboard ? buttons[0] : menu).focus({ preventScroll: true })
  }

  // close the menu. The focus it held goes back to the sparkle only where `refocus` asks and
  // the menu was opened from the keyboard (Escape, or an entry chosen there); otherwise it is
  // given up, so the keyboard is the page's again and the sparkle shows no focus ring (a click
  // on the sparkle that closes its menu too: the press took no focus from the menu)
  self.close = (refocus = false) => {
    const menu = self.menu
    if (!menu) return
    self.menu = null
    document.removeEventListener('pointerdown', menu.outside, true)
    const held = menu.element.contains(document.activeElement) ? document.activeElement : null
    if (refocus && menu.keyboard && !self.disposed) node.focus({ preventScroll: true })
    else held?.blur()
    menu.element.remove()
    menu.backdrop.remove()
    node.removeAttribute('aria-expanded')
  }

  // one entry's action, on what the menu showed (`target`), sent with the bridge's heartbeat
  // as the page has it now. A cancel of this tab's own start that the bridge never named also
  // lets go of that start here: that says nothing of whether the bridge cancelled anything
  self.act = (key, target) => {
    if (self.disposed) return
    if (key == 'close') return void self.close_session(target)
    const [id, at, seen] = [vault_command_id(), Date.now(), self.shown?.seen ?? target.seen]
    if (key == 'stop') {
      self.marks.stopping = { took: target.took, at }
      vault_send_watch_command(vault_watch_stop(id, target.took, at))
    } else if (key == 'cancel') {
      self.marks.cancelling = { id: target.start, at }
      if (self.marks.started?.id === target.start) self.marks.started = null
      vault_send_watch_command(vault_watch_command('cancel', id, { start: target.start }, seen, at))
    } else {
      self.marks.started = { id, at }
      const resume = key == 'resume'
      vault_send_watch_command(vault_watch_command(resume ? 'resume' : 'start', id, resume ? { last: target.last.key } : { agent: key }, seen, at))
    }
    self.show()
  }

  // Close Agent Session, after the owner's word in the app's own dialog (Markco's words). The
  // close names the take the menu showed: a watch that took the account while the dialog was
  // open is not the one closed
  self.close_session = async target => {
    const sure = `Close ${_.escape(target.name)}'s session?<br><br>Its herdr tab closes, which ends the agent. Its conversation can be resumed.`
    if ((await window._modal(sure, { confirm: 'Close', cancel: 'Cancel' })) !== true || self.disposed) return
    const at = Date.now()
    self.marks.closing = { took: target.took, at }
    vault_send_watch_command(vault_watch_command('close', vault_command_id(), { took: target.took }, self.shown?.seen ?? target.seen, at))
    self.show()
  }

  // a click or a tap opens the menu (or closes it), whatever is shown: nothing is started,
  // stopped or closed but by an entry of it, so no stray tap starts an agent's session
  const click = e => {
    e.preventDefault()
    e.stopPropagation()
    if (self.menu) return self.close()
    self.open()
  }
  const toggle = e => {
    e.preventDefault()
    e.stopPropagation()
    if (self.menu) self.close()
    else self.open(true)
  }
  node.addEventListener('click', click)
  node.addEventListener('contextmenu', e => {
    e.preventDefault()
    e.stopPropagation()
    self.open()
  })
  // Enter and Space are the sparkle's while it has the focus (the app's window handlers take
  // them otherwise, and its keyup handler cancels a button's own activation). They open the
  // menu whatever is shown, the offer too: the sparkle keeps the focus after its menu closes,
  // and a start is never one stray press away. A held key opens the menu and does no more:
  // its repeats are swallowed, here and in the menu
  node.addEventListener('keydown', e => {
    if (e.key != 'Enter' && e.key != ' ') return
    if (!e.repeat) return toggle(e)
    e.preventDefault()
    e.stopPropagation()
  })
  node.addEventListener('keyup', e => {
    if (e.key != 'Enter' && e.key != ' ') return
    e.preventDefault()
    e.stopPropagation()
  })
  // a press on the sparkle is not the app's, and a mouse's gives it no focus: a button that a
  // click focused shows no ring at first, and a later key can show it (seen in Chromium, where
  // the Super key alone did). Focus the keyboard gave stays (Tab, and the return from a menu
  // the keyboard opened), and the ring says so. A touch is only kept from the app: its tap is
  // the click
  node.addEventListener('mousedown', e => {
    e.preventDefault()
    e.stopPropagation()
  })
  node.addEventListener('touchstart', e => e.stopPropagation(), { passive: true })
  // the focus leaving the sparkle while its menu is open closes the menu, unless it goes into it
  node.addEventListener('focusout', e => {
    if (self.menu && !self.menu.element.contains(e.relatedTarget)) self.close()
  })
  // a phone's keyboard hides the sparkle, and its going shows it again: at the viewport's own
  // events, not at the task's next look
  const viewport = window.visualViewport
  const on_viewport = () => self.show()
  viewport?.addEventListener('resize', on_viewport)

  self.dispose = () => {
    if (self.disposed) return
    self.close()
    self.disposed = true
    viewport?.removeEventListener('resize', on_viewport)
    node.remove()
    style.remove()
    watched.remove()
    if (window._vault_sparkle === self) delete window._vault_sparkle
  }
  window._vault_sparkle = self
  // the time's part of freshness and of this tab's marks, and this item's deletion: the app
  // cancels the task of a deleted item at its next run (and of a replaced controller when the
  // next one dispatches)
  const task = _this.dispatch_task('sparkle', () => (self.disposed ? null : void vault_sparkle_reconcile()), VAULT_SPARKLE_TICK_MS, VAULT_SPARKLE_TICK_MS)
  task._on_cancel = self.dispose
  return self
}
```
#_welcome #_util/core #_listen
