#status <div class="instances"></div>
- the vault side below is what the bridge publishes from the state files: `dead` is an orphaned state file (`clean.sh` moves it), `stale` a host that stopped publishing; the actions (stop, approve, reject) live on the vault item, linked in the stamp under the hosts when it is installed.
#### Hosts
<div class="hosts"></div>
#### Runs
<div class="runs"></div>
#### Tasks
<div class="tasks"></div>
```_html_hidden
<script _uncached>
update_status() // do first update synchronously (on script eval)
dispatch_task('update', update_status, 1000, 1000) // update every second
// cancel_task('update')
</script>
<style>
#item p:first-child { display: inline }
#item .instances { display: inline }
#item table { /*white-space: nowrap;*/ border-spacing: 0 5px /* extra spacing */ }
#item table th { text-align: left; background: transparent }
#item table :not(thead) > tr { background: #171717 }
#item table :not(thead) > tr:first-of-type { background: #222 }
#item table td { padding: 2px 10px }
#item table td:first-child { border-radius: 4px 0 0 4px }
#item table td:last-child {  border-radius: 0 4px 4px 0 }
#item .warn { color: #e66 }
#item details > summary { cursor: pointer }
</style>
```
```js_removed
function update_status() {
  if (!elem('.instances')) return
  elem('.instances').innerHTML = marked.parse(list_instances(),{breaks:true})
  update_vault_status()
}
const device_name = x => [
  new UAParser(x.user_agent).getOS().name,
  x.screen_size.width + 'x' + x.screen_size.height
].join(' &nbsp; ')

function list_instances() {
  const devices = group(_instances, device_name)
  return [
    `${_instances.length} instances live on ~${size(devices)} devices:`,
    entries(devices).map(([device, instances])=>
      table(instances.map((x,j)=>{
        const ua = new UAParser(x.user_agent).getResult()
        const res = x.screen_size.width + 'x' + x.screen_size.height
        const fage = round((Date.now() - x.focus_time) / 1000)
        const uage = round((Date.now() - x.update_time) / 1000)
        // if client is connected locally, take server host name instead
        const ip = x.client_ip == '::1' ? x.server_name : x.client_ip
        // shorten gpu name on ANGLE (...) gpu reported by Chrome on Apple devices
        const bits = x.screen_colors.color_depth + '-bit'
        const cpu = x.hardware_concurrency + '-core'
        const gpu = x.gpu?.match(/ANGLE \(.+, (.+), .+/)?.pop() ?? x.gpu
        // note fage>uage (focus_time) is _delayed_ by up to uage
        // so fage uncertainty range is actually (fage-uage)-fage
        // but we still sort by last _confirmed_ focus so we display that
        // info listed after browser tends to be browser-dependent and thus unreliable
        return [
          [fage+'s', uage+'s'].join('<br>'),
          [res, ua.os.name].join('<br>'),
          [ua.browser.name, cpu, /*bits,*/ gpu].join('<br>'),
          [ip, '&nbsp;&nbsp;↳ '+x.server_domain].join('<br>'),
        ]
      }), {headers:[device], alignments:'rrll'})
    ).join('\n\n')
  ].join('\n')
}

// the vault side (design notes/design/mind_status_item.md): this item's hidden store carries
// `_status`, written by the vault bridge on each host as a read-modify-write of its own entry
// ({v, hosts: {host: {v, updated, boot, publisher, runs, finished, tasks, hosts, suspended_all,
// sync_loop, unreadable, omitted}}}; the field contract is lib/mindpage_status.py), and `_owner`,
// provisioned here at welcome (the bridge only updates the store, never creates it). Every time
// is absolute (ms) and the ages tick with the per-second task above. Read-only: the actions
// live on #vault, whose store is read here for the run links only. v1 presents ONE observation,
// the entry with the newest `updated`; the other publishing hosts appear in the hosts table.
const STATUS_STALE_MS = 3 * 60000 // three of the bridge's 60 s heartbeats
const COORDINATOR_STALE_MS = 180000 // lib/task_coordinator.py STALE_THRESHOLD
const status_hosts = () => _this._global_store._status?.hosts ?? {}
const vault_listing = () => _item('#vault', { silent: true })?._global_store?._bridge ?? null

// the snapshot: the publishing host whose entry is the newest, or null without any
function status_snapshot(hosts) {
  let best = null
  for (const [host, entry] of entries(hosts)) {
    if (typeof entry?.updated != 'number') continue
    if (!best || entry.updated > best.entry.updated) best = { host, entry }
  }
  return best
}

// an age as list_agents.sh prints it (`2h05m`, `3m02s`, `7s`); never negative
function status_age(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const pad = n => String(n).padStart(2, '0')
  return h ? `${h}h${pad(m)}m` : m ? `${m}m${pad(r)}s` : `${r}s`
}

// literal text as a markdown table cell (the #vault item's rule: line breaks flattened, every
// ASCII punctuation character backslash-escaped, so a pipe cannot split the row and markup
// stays text); an empty value is `·` (the table helper needs a value in every column)
const status_cell = text =>
  text == null || text === '' ? '·' : String(text).replace(/\r\n|\r|\n/g, ' ').replace(/[!-\/:-@\[-`{-~]/g, c => '\\' + c)
const status_warn = text => `<span class="warn">${_.escape(text)}</span>`

// the app's clickable tag markup for an item (as the #vault item renders its item cells)
function status_item_link(id) {
  const item = _item(id, { silent: true })
  const name = item?.name || id
  return `<mark class="link" title="${_.escape(name)}" onmousedown="_handleTagClick('${_this.id}','${_.escape(name)}','${_.escape(name)}',event)" onclick="event.preventDefault();event.stopPropagation();">${_.escape(name)}</mark>`
}

// the coordinator's roles over the complete observed set (lib/task_coordinator.py read_status):
// live within its threshold; the live host started last is primary; a suspension wins
function status_roles(coordinator, suspended_all, now) {
  const live = entries(coordinator).filter(([, h]) => typeof h.heartbeat == 'number' && now - h.heartbeat <= COORDINATOR_STALE_MS)
  const primary = live.length ? live.reduce((a, b) => ((b[1].started ?? 0) > (a[1].started ?? 0) ? b : a))[0] : null
  const roles = {}
  for (const [name, h] of entries(coordinator))
    roles[name] = suspended_all || h.suspended ? 'suspended' : live.some(([n]) => n == name) ? (name == primary ? 'primary' : 'standby') : 'stale'
  return roles
}

// the hosts table: every publishing host (its listing age, stale after three heartbeats) and
// every coordinator host of the snapshot (its role, status, heartbeat age, running tasks)
function status_host_rows(hosts, snapshot, now) {
  const coordinator = snapshot?.entry.hosts ?? {}
  const roles = status_roles(coordinator, snapshot?.entry.suspended_all ?? false, now)
  const names = [...new Set([...keys(hosts), ...keys(coordinator)])].sort()
  return names.map(name => {
    const entry = hosts[name]
    const listed = typeof entry?.updated == 'number' ? status_age(now - entry.updated) + ' ago' + (now - entry.updated > STATUS_STALE_MS ? ' ' + status_warn('stale') : '') : '·'
    const boot = typeof entry?.boot == 'number' ? status_age(now - entry.boot) : '·'
    const h = coordinator[name]
    const role = h ? (roles[name] == 'stale' ? status_warn('stale') : roles[name]) : '·'
    const heartbeat = typeof h?.heartbeat == 'number' ? status_age(now - h.heartbeat) + ' ago' : '·'
    const tasks = h?.running_tasks?.length ? h.running_tasks.map(status_cell).join(', ') : '·'
    return [status_cell(name), listed, boot, role, status_cell(h?.status), heartbeat, tasks]
  })
}

// the stamp under the hosts table: the snapshot's origin, the bridge's own listing (from the
// #vault store, read at every tick), and the sync loop's shared observation
function status_stamp(snapshot, bridge, now) {
  if (!snapshot) return 'no status yet: the bridge publishes one when it starts'
  const parts = [`snapshot from ${status_cell(snapshot.host)} at ${new Date(snapshot.entry.updated).toLocaleTimeString()} (${status_age(now - snapshot.entry.updated)} ago)`]
  if (typeof bridge?.updated == 'number') parts.push(`bridge on ${status_cell(bridge.host)} listed ${status_age(now - bridge.updated)} ago` + (typeof bridge.boot == 'number' ? `, up ${status_age(now - bridge.boot)}` : ''))
  const loop = snapshot.entry.sync_loop
  if (loop) {
    const last = loop.last_run ? `last run ${status_cell(loop.last_run.status)}` : 'no last result'
    const when = typeof loop.time == 'number' ? ` at ${new Date(loop.time).toLocaleTimeString()} (${status_age(now - loop.time)} ago)` : ''
    parts.push(`sync loop ${loop.paused ? 'paused, ' : ''}${last}${when}, ${loop.holds} holds, ${loop.pending} pending`)
  }
  if (snapshot.entry.unreadable) parts.push(`${snapshot.entry.unreadable} unreadable state files`)
  const vault = _item('#vault', { silent: true })
  if (vault) parts.push(`actions on ${status_item_link(vault.id)}`)
  return '_' + parts.join(' · ') + '_'
}

// the running rows of the snapshot: the state id, the agent or run name, the host, the elapsed
// since the start (a dead row's too), the cost, the status (`dead` for a state file whose pid is
// gone: an orphan clean.sh moves; `@host` for another host's file, unjudged), and the chat or
// task item the #vault listing names for the bridge's run id
function status_run_rows(snapshot, bridge, now) {
  return (snapshot?.entry.runs ?? []).map(r => {
    const status = r.alive === false ? status_warn('dead') : r.alive == null ? '@' + status_cell(r.host) : 'running'
    const item = r.run && bridge?.runs?.[r.run]?.item
    return [status_cell(r.state), status_name(r), status_cell(r.host), typeof r.started == 'number' ? status_age(now - r.started) : '·', status_cost(r), status, item ? status_item_link(item) : '·']
  })
}
// the agent and run names as list_agents.sh joins them
const status_name = r => status_cell([r.agent, r.name].filter(Boolean).join(' / '))
const status_cost = r => (typeof r.cost == 'number' ? '$' + r.cost.toFixed(4) : '·') + (r.subscription ? ' (sub)' : '')

// the finished rows of the day (the newest first as published): the finish age, or the last
// write's age for a file clean.sh moved (no finish fields, nothing invented), the elapsed, the
// status with the error's first line, the cost
function status_finished_rows(snapshot, now) {
  return (snapshot?.entry.finished ?? []).map(r => {
    const when = typeof r.finished == 'number' ? status_age(now - r.finished) + ' ago' : typeof r.modified == 'number' ? 'written ' + status_age(now - r.modified) + ' ago' : '·'
    const status = r.status == null ? '·' : r.status == 'ok' ? 'ok' : status_warn(r.status) + (r.error ? ' ' + status_cell(r.error) : '')
    return [status_cell(r.state), status_name(r), status_cell(r.host), when, typeof r.elapsed == 'number' ? status_age(r.elapsed * 1000) : '·', status, status_cost(r)]
  })
}

// the tasks of the snapshot: the location, the next run (`due` or the countdown), the last run
// (its age and host, with the host's suspension when any), in the order list_tasks.sh prints
function status_task_rows(snapshot, now) {
  const coordinator = snapshot?.entry.hosts ?? {}
  const suspended_all = snapshot?.entry.suspended_all ?? false
  return (snapshot?.entry.tasks ?? []).map(t => {
    const next = typeof t.next_run != 'number' ? '·' : t.next_run <= now ? 'due' : status_age(t.next_run - now)
    const last = typeof t.last_run == 'number' ? status_age(now - t.last_run) + ' ago' : '·'
    const suspended = suspended_all || coordinator[t.host]?.suspended ? ' ' + status_warn('suspended') : ''
    return [status_cell(t.task), next, last, status_cell(t.host) + suspended]
  })
}

function status_hosts_md(now) {
  const hosts = status_hosts()
  const snapshot = status_snapshot(hosts)
  const rows = status_host_rows(hosts, snapshot, now)
  const tbl = rows.length ? table(rows, { headers: ['host', 'listed', 'boot', 'role', 'status', 'heartbeat', 'tasks'] }) : '_none_'
  return tbl + '\n\n' + status_stamp(snapshot, vault_listing(), now)
}

function status_runs_html(now) {
  const snapshot = status_snapshot(status_hosts())
  const rows = status_run_rows(snapshot, vault_listing(), now)
  const running = rows.length ? marked.parse(table(rows, { headers: ['state', 'agent', 'host', 'elapsed', 'cost', 'status', 'item'] })) : marked.parse('_none_')
  const finished = status_finished_rows(snapshot, now)
  const omitted = snapshot?.entry.omitted
  const more = omitted ? ` (${keys(omitted).map(k => `${omitted[k]} ${k} omitted`).join(', ')})` : ''
  const body = finished.length ? marked.parse(table(finished, { headers: ['state', 'agent', 'host', 'finished', 'elapsed', 'status', 'cost'] })) : marked.parse('_none_')
  return running + `<details data-fold="finished"><summary onclick="event.stopPropagation()">finished (24 h): ${finished.length}${_.escape(more)}</summary>${body}</details>`
}

function status_tasks_md(now) {
  const rows = status_task_rows(status_snapshot(status_hosts()), now)
  return rows.length ? table(rows, { headers: ['task', 'next', 'last', 'host'] }) : '_none_'
}

// render into one of this item's own elements, skipping an unchanged rendering (the #vault
// item's idiom); a fold-out's open state is remembered by name in this tab's item state and
// re-applied after any replacement (an in-place rewrite, or the app's re-render of the item)
function status_render(selector, render) {
  const div = elem(selector)
  if (!div) return
  const html = render()
  if (div._status_html === html) return
  div._status_html = html
  div.innerHTML = html
  const open = (_this.store._status_open ??= {})
  for (const d of Array.from(div.querySelectorAll?.('details[data-fold]') ?? [])) {
    if (open[d.dataset.fold]) d.open = true
    d.addEventListener?.('toggle', () => (open[d.dataset.fold] = d.open))
  }
}

function update_vault_status() {
  const now = Date.now()
  status_render('.hosts', () => marked.parse(status_hosts_md(now)))
  status_render('.runs', () => status_runs_html(now))
  status_render('.tasks', () => marked.parse(status_tasks_md(now)))
}

// this store's changes (the bridge's entries; this tab's provisioning): the sections rewritten
// in place; true tells the app the change is rendered, so it skips the re-render it forces on
// a remote delivery (the #vault item's contract, design mind_vault_item 14)
function _on_global_store_change(id) {
  if (id != _this.id) return
  update_vault_status()
  return true
}

// provision the store at app startup (the bridge never creates it), once, without the
// re-render the app forces on a save
function _on_welcome() {
  if (_this._global_store._owner) return
  _this._global_store._owner = {}
  _this.save_global_store({ invalidate_elem_cache: false })
}
```
#_welcome #_util/core #_util/math
