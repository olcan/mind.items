const __agent = _item('$id') // __agent to reserve _?agent in global namespace

// start agent on item `name`
// starts `agent` task on all instances
// stops/cancels existing agent/run/task if already running
// agent will _pause_ (i.e. skip runs) on non-primary instances
// any changes to agent item (or dependencies) will stop agent globally
// triggers `eval('_run()')` on item; see comments below for `_run()`
const start_agent = (name, id = undefined) => {
  // do not start agent with _log/_output on item
  // these sections are not intended for agentic runs
  if (_item(name)?.read_deep('_log|_output'))
    fatal('can not start agent on item w/ _log|_output')
  _item(name)?.eval(`_run('${id ?? ''}')`, {
    async: true, // enable async _run
    async_simple: true, // do not log/output into item
  })
}

// stop agent on item `name`
// cancels `agent` task on all instances
const stop_agent = name => {
  const agent_id = __agent._global_store.agents?.[name]
  // note this ordering matters to prevent infinite recursion via task._on_cancel
  if (agent_id) delete __agent.global_store.agents[fname] // stop globally
  _item(name)?.cancel_task('agent') // stop locally
  debug(`stopped agent ${name} (${agent_id})`)
}

// is agent active on item `name`?
const agent_active = name => !!__agent._global_store.agents?.[name]

// array of item names for active agents
const active_agents = () => keys(__agent._global_store.agents ?? {})

// is `item` an agent item?
// agent items have `#agent` as their first dependency
const is_agent_item = item =>
  item &&
  equal(item.dependencies.slice(0, __agent.dependencies.length + 1), [
    ...__agent.dependencies,
    __agent.id,
  ])

// array of _all_ agent items
const agent_items = () =>
  __agent.dependents.map(id => _item(id)).filter(is_agent_item)

// Agent class for `agent` instance (see below)
class Agent {
  #id
  #cancelled = false
  #continued = -1 // >=0 interpreted as delay (secs) before continuation
  #on_cancel
  #on_error
  #on_done

  constructor(id) {
    this.#id = id
  }

  // id
  // agent (run) id
  // shared across MindPage instances
  // changes when agent is stopped & restarted
  get id() {
    return this.#id
  }

  // state
  // agent state as plain object
  // state is all _enumerable_ properties set/defined on agent object
  // getter shallow-copies all state (enumerable) properties on agent object
  // setter deletes all state properties then reassigns to agent object
  get state() {
    return to_plain_object(this)
  }
  set state(obj) {
    each(keys(this), k => delete agent[k])
    assign(this, obj)
  }

  // cancel()
  // cancel agent task & stop agent _on return_
  // stopping agent will cancel agent task on all instances
  // should be called immediately before return (implicit on last line)
  cancel() {
    this.#cancelled = true
  }

  // continue(secs)
  // continue agent task after `secs` _on return_
  // should be called immediately before return (implicit on last line)
  continue(secs) {
    if (!(secs >= 0))
      fatal(`invalid continuation delay secs '${secs}' (must be >=0)`)
    if (this.#cancelled)
      fatal('cannot continue task already set to cancel on return')
    this.#continued = secs
  }

  // accessors for return options, mainly for internal use
  get cancelled() {
    return this.#cancelled
  }
  get continued() {
    return this.#continued
  }

  // resets agent object before eval, mainly for internal use
  // resets return options but not event handlers on_*
  reset() {
    this.#cancelled = false
    this.#continued = -1
  }

  // stopped
  // is agent stopped?
  // via `stop_agent(name)`, `agent_item.cancel_task('agent')`, or `agent.cancel()`
  // agents can be stopped locally (same instance) or remotely (via `global_store`)
  get stopped() {
    return __agent._global_store.agents?.[_name] != this.#id
  }

  // paused
  // is agent paused?
  // means agent will skip runs
  // can be due to instance (page) losing focus
  get paused() {
    return !_primary
  }

  // on_cancel
  // cancel handler
  // invoked as `on_cancel()` if agent task is cancelled
  // via `stop_agent(name)`, `agent_item.cancel_task('agent')`, or `agent.cancel()`
  get on_cancel() {
    return this.#on_cancel
  }
  set on_cancel(f) {
    this.#on_cancel = f
  }

  // on_error
  // error handler
  // invoked as `on_error(e)` if agent task throws error
  get on_error() {
    return this.#on_error
  }
  set on_error(f) {
    this.#on_error = f
  }

  // on_done
  // done handler
  // invoked as `on_done()` when agent task is completed
  get on_done() {
    return this.#on_done
  }
  set on_done(f) {
    this.#on_done = f
  }
} // _Agent

// => agent
// agent instance for running task
// instance of `Agent` class (see above)
// initialized by `_run()` on agent item
// shorthand for `_this.store.agent` on agent item
// not to be confused with `_agent` which is the '#agent' item
const __agent__ = null // placeholder for js_table to display `agent`

// force async_simple even when run using run button (vs start_agent)
// this prevents logging/output to item and simplifies item.running
// (item.running can get reset w/o a way to await item.start promise)
const _run_options = { async_simple: true }

// _run()
// run agent on `_this`
// starts `agent` task on `_this` on all instances
// invoke via `run` button or `start_agent()`, _not directly_
// agent task evals `js_input` block on agent item (`_this`)
// stops/cancels existing agent/run/task if already running
// stops agent if eval (`js_input` block) throws error
// stops agent if item or dependencies are modified
// pauses agent on non-primary (`!window._primary`) instances (does _not_ stop runs)
// ___must be robust to concurrent runs___ due to unstopped runs on pause/stop
// functions `_paused` and `_stopped` can help manage concurrent runs
async function _run(agent_id) {
  if (!is_agent_item(_this)) return null // skip non-agent item
  if (agent instanceof Agent) fatal('_run() called by agent')
  if (!_this.name.startsWith('#')) fatal('unlabeled agent item') // label required
  const js = read('js_input').trim()
  if (!js) fatal('agent item missing js_input block')
  _this.log_options.source = 'self' // restrict logging to item
  _this.running = true

  // store name & id in #agent global_store and create agent object
  // note we may reuse existing agent object when "continuing" agent w/ new task
  if (!agent_id) {
    if (agent_active(_name)) stop_agent(_name)
    __agent.global_store.agents ??= {}
    agent_id = __agent.global_store.agents[_name] = hash(Math.random())
    debug(`starting agent ${_name} (${agent_id}) ...`)
    _this.store.agent = new Agent(agent_id)
  } else if (agent_id != _this.store.agent?.id) {
    debug(`starting remote agent ${_name} (${agent_id}) ...`)
    _this.store.agent = new Agent(agent_id)
  } else {
    // continue existing agent
    if (__this.tasks.agent) __this.tasks.agent._continue = true
    debug(`continuing agent ${_name} (${agent_id}) ...`)
  }

  // wait until dispatched task is finished
  const start_time = Date.now()
  await promise((resolve, reject) => {
    // dispatch agent task
    const task = dispatch_task('agent', async () => {
      if (!_primary) return 1000 // agent paused (non-primary instance)
      if (!navigator.onLine) return 1000 // agent paused (browser offline)
      if (!_this.saved_id) return 1000 // agent not saved yet (e.g. new install)

      if (__agent._global_store.agents[_name] != agent_id) return null // agent stopped, cancel task
      const agent = _this.store.agent // for convenience below

      // note we generally catch/retry any exceptions outside of js_input block
      // uncaught exceptions _inside_ js_input block will stop agent on all instances

      // download agent state if (remote-)modified
      _this.global_store.agent_hash ??= hash(agent)
      if (hash(agent) != _this._global_store.agent_hash) {
        debug('downloading remote-modified agent state ...')
        try {
          agent.state = await download(_this.saved_id + '/agent', {
            force: true,
          })
        } catch {
          console.error('download failed:', e)
          return 1000
        }
        // if downloaded state has does not match global_store hash, replace it
        if (hash(agent) != _this._global_store.agent_hash) {
          warn(
            `replacing invalid agent_hash in global_store using downloaded state`
          )
          _this.global_store.agent_hash = hash(agent)
        }
      }

      agent.reset() // reset agent state before eval
      const out = await _this.eval('const agent = _this.store.agent;\n' + js, {
        async: true, // enable await and async import (e.g. from #agent)
        async_simple: true, // enable direct call/return (vs output/log into item)
      })
      if (defined(out)) fatal('unexpected return value from agent task')

      // cancel task & stop agent if cancelled internally via `agent.cancel()`
      if (agent.cancelled) return null

      // upload agent state if modified, also update agent_hash in global store
      // if there is an error, we just skip upload (and drop last run)
      // if agent was modified, it will get re-downloaded on next run
      // if agent gets big, parts should be uploaded separately
      if (hash(agent) != _this._global_store.agent_hash) {
        debug(
          `uploading modified agent state (@ ${Date.now() - start_time} ms)...`
        )
        try {
          await upload(agent.state, {
            path: _this.saved_id + '/agent',
            force: true,
          })
        } catch (e) {
          console.error('upload failed:', e)
          return 1000
        }
        _this.global_store.agent_hash = hash(agent)
      }

      // continue task after period if specified as >=0
      if (agent.continued >= 0) return agent.continued * 1000 // convert to ms
    })

    // set up task finish handlers
    // invoke agent handler (if any)
    // stop agent if not already stopped (e.g. on rerun)
    // resolve/reject _run promise to finish running item
    task._on_cancel = () => {
      agent.on_cancel?.()
      if (!task._continue) {
        if (__agent._global_store.agents[_name] == agent_id) {
          delete __agent.global_store.agents[_name]
          console.warn(
            `stopped agent ${_name} (${agent_id}) due to cancelled task`
          )
        }
      }
      resolve() // we resolve on cancellation, e.g. due to explicit stop_agent
    }
    task._on_error = e => {
      agent.on_error?.(e)
      if (__agent._global_store.agents[_name] == agent_id) {
        delete __agent.global_store.agents[_name]
        console.warn(
          `stopped agent ${_name} (${agent_id}) due to task error: ${e}`
        )
      }
      reject(e)
    }
    task._on_done = () => {
      agent.on_done?.()
      if (__agent._global_store.agents[_name] == agent_id) {
        delete __agent.global_store.agents[_name]
        console.debug(`stopped agent ${_name} (${agent_id}) due to task done`)
      }
      resolve()
    }
  }).finally(() => {
    _this.running = false
  })
}

// check consistency of agent tasks w/ global store
// note this has been a useful sanity check in the past!
function _check_agents() {
  // check missing tasks for active agents
  for (const name of keys(__agent._global_store.agents ?? {}))
    if (!__item(_item(name)?.id)?.tasks?.agent)
      warn(`missing task (or item) for active agent ${name}`)
  // check rogue tasks for inactive agents
  // note this can happen due to global_store sync delays
  for (const __item of __items)
    if (__item.tasks?.agent && !agent_active(__item.name))
      warn(`rogue task for inactive agent ${__item.name}`)
}

// start active agents on welcome, then check_agents every 10s
function _on_welcome() {
  for (const [name, id] of entries(__agent._global_store.agents ?? {}))
    start_agent(name, id)
  dispatch_task('check_agents', _check_agents, 0, 10000)
}

// start/stop agents on remote changes to global store
function _on_global_store_change(id, remote) {
  if (id != __agent.id) return // ignore changes to other items
  if (!remote) return // ignore local change
  // start missing tasks for active agents
  for (const [name, id] of entries(__agent._global_store.agents ?? {}))
    if (!__item(_item(name)?.id).tasks?.agent) {
      debug(`agent ${name} (${id}) started remotely`)
      start_agent(name, id)
    }
  // stop rogue tasks for inactive agents
  for (const __item of __items)
    if (__item.tasks?.agent && !agent_active(__item.name)) {
      error(`agent ${__item.name} stopped remotely`)
      stop_agent(__item.name)
    }
}

// stop agent task on any changes to agent item or dependencies
// continue/start agent dependencies of directly modified non-agent items
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (remote) return // let remote change/stop propagate via global_store
  const item = _item(id, { silent: true }) // can be null if deleted

  // display error (and alert) on local change on non-primary instance
  // (suspected to happen when editing across instances on slow connections)
  if (!_primary) {
    const name = item?.name || prev_label || id
    error(`local change to ${name} on non-primary instance (slow sync?)`)
    // _modal_alert(`detected local change to ${name} on non-primary instance`)
    return
  }

  // continue/start agent dependency of directly modified non-agent item
  // only take _last_ agent dependency to avoid going to parent agent items
  // skip item if it has _log|_output that may indicate errors
  if (
    item &&
    !dependency &&
    !is_agent_item(item) &&
    !item.read('_log|_output')
  ) {
    let agent_dep
    for (const id of item.dependencies) {
      const dep = _item(id)
      if (is_agent_item(dep)) agent_dep = dep
    }
    if (agent_dep) {
      const name = agent_dep.name // agent name
      if (agent_active(name)) {
        // continue active (and unstopped) agent
        debug(
          `continuing agent ${name} (${id}) for modified dependent ${item.name}`
        )
        start_agent(name, agent_dep.store.agent?.id)
      } else {
        debug(
          `starting agent ${name} (${id}) for modified dependent ${item.name}`
        )
        start_agent(name)
      }
    }
  }

  // return if item is not an agent item
  if (!is_agent_item(item)) return

  // also return if there is no associated agent task/state (incl. pre-rename)
  if (
    !__item(item?.id)?.tasks?.agent &&
    !__agent._global_store.agents?.[item?.name] &&
    !__agent._global_store.agents?.[prev_label]
  )
    return

  if (item?.name) stop_agent(item?.name)
  if (prev_label && prev_label != item?.name) stop_agent(prev_label)
  item?.cancel_task('agent') // already cancelled if deleted, or via stop_agent

  const name = item?.name || prev_label || id
  warn(`stopped agent ${name} due to change to item or dependencies`)
}

// common logic for command init
async function _parse_name(name, usage) {
  if (!name) {
    await _modal_alert(`usage: ${usage}`)
    return null
  }
  // if name does not start w/ #, assume relative to #agent/...
  if (name[0] != '#') name = '#agent' + (name[0] == '/' ? '' : '/') + name
  if (!is_agent_item(_item(name))) {
    await _modal_alert(`'${name}' is not an agent item`)
    return null
  }
  return name
}

// => /start name
// start agent on item `name`
async function _on_command_start(args, name) {
  name = await _parse_name(name, '/start name')
  if (!name) return '/start '
  start_agent(name)
  await _modal_alert(`started ${name}`)
}

// => /stop name
// stop agent on item `name`
async function _on_command_stop(args, name) {
  name = await _parse_name(name, '/stop name')
  if (!name) return '/stop '
  stop_agent(name)
  await _modal_alert(`stopped ${name}`)
}

// => /inspect name
// inspect agent on item `name`
async function _on_command_inspect(args, name) {
  name = await _parse_name(name, '/inspect name')
  if (!name) return '/inspect '
  const _02d = x => (~~x).toString().padStart(2, '0')
  const _03d = x => (~~x).toString().padStart(3, '0')
  const d = new Date()
  const timestamp = [
    d.getFullYear(),
    _02d(d.getMonth() + 1),
    _02d(d.getDate()),
    '_',
    _02d(d.getHours()),
    _02d(d.getMinutes()),
    _02d(d.getSeconds()),
    '_',
    _03d(d.getMilliseconds()),
  ].join('')
  const snapshot = name + '/' + timestamp
  return {
    mindbox_text: snapshot, // select new item
    text: [
      snapshot,
      block(
        'json',
        stringify(_item(name).store.agent?.state, null, 2).replace(
          /<</g,
          '\\<<'
        )
      ),
    ].join('\n'),
  }
}

// TODO: command to remove all snapshots, i.e. inspect items
