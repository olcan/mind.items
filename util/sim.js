class _State {
  constructor(state, _path, _root) {
    if (_root) define_value(this, '_root', _root)
    if (_path) define_value(this, '_path', _path)
    if (state) this.merge(state)
  }

  _init() {
    if (this._sim) return // already initialized

    if (!this._path) {
      // define root-only properties used by simulate(…) and _Event constructor
      define(this, '_t', { writable: true })
      define(this, '_mutator', { writable: true })
      define(this, '_scheduler', { writable: true })
      define(this, '_dependents', { writable: true })
      define(this, '_sim_events', { writable: true })
      if (this.t === undefined) this.merge({ t: 0 }) // merge default x.t=0
      if (this._states?.length == 0) this._states.push(clone_deep(this))
      // define x.__t w/ getter bypass for use during tracing
      define(this, '__t', {
        get: () => {
          this._sim = false // disable _on_get
          const t = this.t
          this._sim = true
          return t
        },
      })
    } else {
      // redirect non-root t to root (fails if t was merged into non-root)
      define(this, 't', { get: () => this._root.t })
    }

    for (const [k, v] of entries(this)) {
      let desc = Object.getOwnPropertyDescriptor(this, k)
      if (!desc.configurable)
        fatal(`invalid state '${k}' (expected configurable)`)
      // note params can be writeable but must be defined before _init
      const parameter = desc.value !== undefined
      const variable = !!(desc.get && desc.set)
      if (!parameter && !variable) fatal(`invalid state '${k}'`)
      // make writable properties (params) non-writable
      // note all properties are made non-configurable in seal() below
      if (desc.writable) define(this, k, { writeable: false })
      if (is_state(v)) v._init() // init nested state
    }

    define_value(this, '_sim', true, { writable: true }) // enable _on_get/_set
    seal(this) // prevent new properties, make existing ones non-configurable
  }

  _check_args(f, path) {
    let fstr = f.toString()
    let [, args] =
      fstr.match(/(?:function)?\s*\(\s*\{(.*)\}\s*\)\s*(?:=>|\{)/) ?? []
    if (!args) fatal(`invalid function '${path}', must have form ({…})=>`)
    const names = args.match(/[_\p{L}][_\p{L}\d]*/gu)
    if (!names) return
    global_eval(
      `(({${args}})=>(` +
        names
          .map(
            name =>
              `${name} ?? ` +
              `fatal("undefined argument '${name}' ` +
              `for function '${path}'")`
          )
          .join(',') +
        '))'
    )(this)
  }

  merge(obj, params = false) {
    if (this._sim) fatal(`can't merge after sim`)
    if (is_nullish(obj)) return // ignore nullish merge
    if (!is_plain_object(obj)) fatal(`can't merge non-plain-object into state`)
    if (is_array(obj)) define_value(this, 'length', obj.length)
    const base = this._path ? this._path + '.' : ''
    for (let [k, v] of entries(obj)) {
      const path = base ? base + k : k
      if (is_function(v)) {
        this._check_args(v, path) // ensure all arguments are defined
        v = v(this) // invoke function w/ current state
      }
      // handle _params
      if (k == '_params') {
        if (!is_object(v)) fatal(`invalid non-object _params '${path}'`)
        this.merge(v, true /*params*/) // drop _params:{…} wrapper
        continue
      }
      // handle _log_w
      if (k == '_log_w') {
        if (!is_number(v)) fatal(`invalid non-number _log_w '${path}'`)
        this.weight(v)
        continue
      }
      // handle _events, _states, or _trace arrays
      if (k == '_events' || k == '_states' || k == '_trace') {
        if (!is_array(v)) fatal(`invalid non-array state '${path}'`)
        define_value(this, k, v)
        continue
      }
      const v_to = this[k]
      if (is_object(v)) {
        // allow state v to be "attached" to nullish property
        if (is_state(v)) {
          if (!is_nullish(v_to))
            fatal(`can't merge state object into existing value '${path}' `)
          define_value(v, '_path', path)
          define_value(v, '_root', root(this))
          if (v._log_w) {
            this.weight(v._log_w) // transfer pre-attach _log_w
            v._log_w = 0 // no longer used at non-root
          }
          this[k] = v // note merge does NOT clone
          continue
        }
        // if already defined (as object), merge into it
        if (v_to !== undefined) {
          if (!is_object(v_to))
            fatal(`can't merge object into non-object '${path}'`)
          if (v_to._merge) v_to.merge(v, params) // merge as state object
          else merge(v_to, v) // merge as external/untraced object
          continue
        }
        // replace nested object value with "traced" state object
        // requires v._traced flag except for plain objects
        // params are never traced (assumed fixed)
        // see setter below for similar logic
        // note merge does NOT clone
        if (v._traced ?? (is_plain_object(v) && !params)) {
          if (params) fatal(`tracing not supported (& unnecessary) for params`)
          v = new _State(params ? { _params: v } : v, path, root(this))
        } // else if (!params) v = clone_deep(v) // always clone variables
      } else if (is_object(v_to))
        fatal(`can't merge non-object into object '${path}'`)
      // if already defined (as non-object), write into it
      // note both params & vars allow writes until _init
      if (v_to !== undefined) {
        this[k] = v
        continue
      }
      if (params)
        define_value(this, k, v, {
          enumerable: true, // required for state properties
          configurable: true, // allow merges until _init
          writable: true, // allow writes until _init
        })
      else
        define(this, k, {
          enumerable: true, // required for state properties
          configurable: true, // allow merges until _init
          get: () => (root(this)._on_get(path, v), v),
          set: v_new => {
            const v_old = v
            // see condition on v._traced above for comments on tracing
            if (is_object(v_new)) {
              if (v_new._traced ?? is_plain_object(v_new))
                v_new = new _State(v_new, path, root(this))
              // else v_new = clone_deep(v_new) // always clone variables
            }
            root(this)._on_set(path, (v = v_new), v_old)
          },
        })
    }
    return this // for chaining
  }

  merge_params(obj) {
    return this.merge(obj, true /*params*/)
  }

  weight(log_w) {
    const x = root(this) // to accumulate _log_w globally at root level
    if (is_function(log_w)) log_w = log_w(x) // invoke function (on root state)
    if (!is_number(log_w)) fatal(`invalid non-number weight log_w=${log_w}`)
    if (is_nan(log_w)) log_w = -inf // take nan as -inf
    if (defined(x._log_w)) x._log_w += log_w
    else define_value(x, '_log_w', log_w, { writable: true })
    return this // for chaining
  }

  enable(e) {
    const x = root(this)
    if (e._t >= 0) fatal(`event '${e._name}' already enabled (_t=${e._t})`)
    x._sim_events.add(e)
    e._t = 0 // enable & reset (same as in non-resuming sim)
    return this // for chaining
  }

  disable(e) {
    const x = root(this)
    if (e._t === undefined) fatal(`event '${e._name}' already disabled`)
    if (!x._sim_events.delete(e)) fatal(`missing event '${e._name}' to disable`)
    e._t = undefined // disable (same as in _Event constructor)
    return this // for chaining
  }

  // _cancel(e) {
  //   if (!this._dependents) return
  //   for (const deps of values(this._dependents)) deps.delete(e)
  // }

  _update_deps(e) {
    if (!e._deps_tmp && !e._deps) return // no dependencies
    // add new dependencies
    if (e._deps_tmp) {
      this._dependents ??= {}
      for (const k of e._deps_tmp) {
        if (e._deps?.has(k)) continue
        this._dependents[k] ??= new Set()
        this._dependents[k].add(e)
      }
    }
    // remove old dependencies
    if (e._deps) {
      for (const k of e._deps) {
        if (e._deps_tmp?.has(k)) continue
        this._dependents[k].delete(e)
      }
    }
    // reuse objects by swap+clear instead of setting _deps_tmp to undefined
    e._deps_tmp = swap(e._deps, (e._deps = e._deps_tmp))
    e._deps_tmp?.clear()
  }

  _on_get(k, v) {
    if (!this._sim) return // ignore non-sim access
    // track scheduler access as a "dependency", except for x.t
    //   x.t is managed by simulation and can not be "mutated" (see _on_set)
    // scheduler must invoke _update_deps when done accessing state
    // dependency continues until explicit removal via _update_deps
    // untraced nested dependencies are detected via _on_get for ancestor
    if (this._scheduler) {
      if (k == 't') return // ignore dependency on x.t
      if (is_object(v) && !is_state(v))
        fatal(`scheduler access to untraced nested state '${k}'`)
      this._scheduler._deps_tmp ??= new Set()
      this._scheduler._deps_tmp.add(k)
      // this._dependents ??= {}
      // this._dependents[k] ??= new Set()
      // this._dependents[k].add(this._scheduler)
    } else if (!this._mutator) return // ignore non-mutator/scheduler access
    this._trace?.push({
      type: this._mutator ? 'fx_get' : 'ft_get',
      k,
      v,
      t: k == 't' ? v : this.__t,
      e: this._mutator ?? this._scheduler,
    })
  }

  _on_set(k, v_new, v_old) {
    if (!this._sim) return // ignore non-sim access
    if (this._scheduler) fatal(`state set in scheduler`)
    if (!this._mutator) {
      if (k == 't') return // ignore non-mutator changes to x.t
      fatal(`state '${k}' set outside of mutator`)
    }
    if (k == 't') fatal('x.t set in mutator') // disallow mutation on x.t
    // notify dependent schedulers
    const deps = this._dependents?.[k]
    if (deps) for (const e of deps) e._on_change(this)
    this._trace?.push({
      type: 'fx_set',
      k,
      v_new,
      v_old,
      t: this.__t,
      e: this._mutator,
    })
  }
}

// _state(obj)
// create state from `obj`
// functions are invoked in [property order](https://stackoverflow.com/a/38218582)
const _state = obj => new _State(obj)

// is `x` a state object?
const is_state = x => x instanceof _State

// merge `obj` into state `x`
const merge_state = (x, obj) => x.merge(obj)

// merge `obj` into `x` as _parameters_
// parameters are treated as _constants_ during simulation
const merge_params = (x, obj) => x.merge_params(obj)

// path for (nested) state `x`
// path is `undefined` for root state
// optional `path` relative to `x` can be specified
const path = (x, path = undefined) =>
  path ? (x._path ? x._path + '.' + path : path) : x._path

// root state for (nested) state `x`
const root = x => x._root ?? x

// enable tracing for nested state
// enables access (dependency) from schedulers
// certain nested state (e.g. plain objects) are traced by default
const trace = obj => define_value(obj, '_traced', true)

// weight state `x` as `log_w`
// `log_w` can be a function `x=>…`
// weights are accumulated at `root(x)._log_w`
// simulation is terminated early when `_log_w==-inf`
const weight_state = (x, log_w) => x.weight(log_w)

// simulate `events` from state `x` to time `t`
// includes all events at times `(x.t,t], t>x.t`
// may include events `>t` given option `allow_next`
// events at same time are invoked in order of `events`
// can be invoked again to _resume_ simulation w/o resampling
// `events` can be object of events to be named as `name_events(events)`
// `x` can be object to be _cloned_ into state as `_state(clone_deep(x))`
// `x` can be function that returns state or object (to be cloned)
// cancelled if state is assigned zero weight, i.e. `x._log_w==-inf`
function simulate(x, t, events, options = undefined) {
  if (is_function(x)) x = x()
  if (is_plain_object(x)) x = _state(clone_deep(x))
  if (!is_state(x)) fatal('invalid state object')
  if (is_plain_object(events)) events = name_events(events)
  if (!is_array(events)) fatal(`invalid events, must be array`)
  x._init() // init state (if needed) for first simulation
  x._t ??= 0 // non-resuming sim starts at x._t=0 (to be advanced to t>x.t>0)
  if (!(x.t >= 0)) fatal(`invalid x.t=${x.t}, must be >=0`)
  if (!(t > x.t)) fatal(`invalid t=${t}, must be >x.t=${x.t}`)
  // fast forward to t if next event already scheduled at _t > t
  if (x._t > t) {
    x.t = t
    return x
  }
  // apply any events already scheduled at _t == t
  if (x._t == t) {
    x.t = x._t // advance x.t to previously scheduled _t
    for (const e of events) if (e.t == x.t) e.fx(x)
    return x
  }
  x._sim_events = events = new Set(events) // event set for x.enable/disable
  for (const e of events) {
    if (!is_event(e)) fatal('invalid event')
    if (x._t && (!e.t || !defined(e._t)))
      fatal(`invalid events/state for resume`, x._t, e.t, e._t)
    if (!x._t) e._reset() // reset for non-resuming sim
  }
  // schedule and apply events as needed until x._t >= t
  const allow_next = options?.allow_next // allow events >t ?
  while (x._t < t) {
    if (x._log_w == -inf) break // cancel if state assigned 0 weight
    // schedule events for times >x.t
    // valid times >x.t are cached inside _Event and reset by _State as needed
    // can be inf (never), e.g. if all events fail conditions (= frozen state)
    // store next scheduled event time as x._t for persistence across calls
    x._t = inf
    for (const e of events) if ((e.t = e.ft(x)) < x._t) x._t = e.t
    if (!(x._t > x.t)) fatal('invalid e.ft(x) <= x.t')
    // stop at t if next events are >t and !allow_next
    // these events will be applied at next call to simulate
    if (x._t > t && !allow_next) {
      x.t = t
      break
    }
    // apply events scheduled at _t
    x.t = x._t // advance x.t first
    for (const e of events) if (x.t == e.t) e.fx(x)
  }
  x._sim_events = null // dissociate state from event set
  return x
}

// create _named_ events from functions `fE`
// creates events as `set(e(), '_name', str(e))`
// allows object arguments that specify names as keys
const name_events = (...fE) =>
  flat(
    apply(flat(fE), e => {
      if (is_object(e))
        return entries(e).map(([n, e]) => {
          if (!is_string(n)) fatal(`invalid event name ${str(n)}`)
          if (!is_event(e)) fatal(`invalid event ${str(e)}`)
          return set(e, '_name', n)
        })
      if (!is_function(e)) fatal('invalid argument')
      e = set(e(), '_name', str(e))
      if (!is_event(e)) fatal('function returned non-event')
      return e
    })
  )

// name `event` as `name`
// attaches `name` string to `event` as `_name`
const name_event = (name, event) => set(event, '_name', name)

// attach events `eJ` to (nested) state `x`
// event functions will be invoked on `x` instead of `root(x)`
const attach_events = (x, ...eJ) => each(flat(eJ), e => (e._x = x))

// convert non-function fc to domain check for x.state
const _convert_fc = f => (is_function(f) ? f : x => from(x.state, f))

// _event(fx, [ft=daily(0)], [fc], [x], [name])
// create mutation event `x → fx(x,…)`
// state `x` _mutates_ to `fx(x)` at time `ft(x)`
// | `fx`      | _mutator function_ `fx(x)`
// |           | must modify (i.e. _mutate_) state `x`
// |           | can return `null` to indicate cancelled (or hidden) mutation
// |           | can return mutation parameters to be recorded in `x._events`
// |           | can be object to be merged into x (w/ functions invoked)
// |           | can be identifier primitive (e.g. integer or string)
// | `ft`      | _scheduler function_ `ft(x)`
// |           | must return future time `t > x.t`, can be `inf` (never)
// |           | state variables accessed in `ft` are considered _dependencies_
// |           | schedule is considered valid while dependencies are unchanged
// |           | default scheduler triggers daily at midnight (`t=0,1,2,…`)
// | `fc`      | optional _conditioner function_ `fc(x)`
// |           | wraps `ft(x)` to return `inf` for `!fc(x)` state
// |           | state variables accessed in `fc` are considered _dependencies_
// |           | can be non-function treated as _domain_ for `x`
// |           | can be identifier primitive (as domain)
// | `x`       | optional (nested) state object, attached to event as `_x`
// |           | all functions will be invoked on `x` instead of `root(x)`
// | `name`    | optional event name string, attached as `_name`
// |           | extended as `path(x,name)` if `x` is also specified
const _event = (...args) => new _Event(...args)
class _Event {
  constructor(fx, ft = daily(0), fc = undefined, x, name) {
    if (x) this._x = x // pre-attached state
    if (name) this._name = x ? path(x, name) : name
    if (fx === undefined) {
      // no-op event
      this.fx = x => {
        x._events?.push({ t: x.t, ...θ, _source: this })
        x._states?.push(clone_deep(x))
      }
    } else {
      // convert object fx into assignment function
      // convert other non-function fx into assignment to x.state
      if (is_object(fx)) {
        const _fx = fx
        // merge into state, invoke functions w/ (old_value, x)
        // note _set_obj can be much faster than merge_with, see inc benchmarks
        // fx = x => merge_with(x, _fx, (a, b) => (is_function(b) ? b(a, x) : b))
        fx = x => {
          _set_obj(x, _fx)
        }
      } else if (!is_function(fx)) {
        const _fx = fx
        fx = x => {
          x.state = _fx
        }
      }
      this.fx = x => {
        x._mutator = this // track event as mutator
        const θ = fx(this._x ?? x)
        x._mutator = null
        if (θ === null) return null // event (mutation) skipped
        x._events?.push({ t: x.t, ...θ, _source: this })
        x._states?.push(clone_deep(x))
      }
    }

    if (fc) {
      fc = _convert_fc(fc) // convert non-function fc (see above)
      // set up custom (faster) _on_change for conditioner dependencies
      fc._on_change = x => fc(this._x ?? x) == this._c || this._on_change()
      this.fc = fc // for _reset below
    }

    // wrap ft w/ cache wrapper and optional conditioner fc
    // note this._t is set externally, e.g. in simulate(…) or x.enable
    this._t = undefined // cached scheduled time (undefined = event disabled)
    this.ft = x => {
      if (this._t > x.t) return this._t
      if (fc) {
        x._scheduler = fc // for custom _on_change (see above)
        // x._cancel(fc)
        this._c = fc(this._x ?? x)
        x._scheduler = null
        x._update_deps(fc)
      }
      x._scheduler = this
      // x._cancel(this)
      this._t = fc && !this._c ? inf : ft(this._x ?? x)
      x._scheduler = null
      x._update_deps(this)
      return this._t
    }
  }

  // handle dependency change in _State._on_set
  _on_change() {
    if (!this._t) return // keep undefined if event disabled/reset/unsched
    this._t = 0
  }

  // reset event for new state (non-resuming sim)
  _reset() {
    this.t = 0
    this._t = 0
    this._deps?.clear()
    this.fc?._deps?.clear()
  }
}

// _do(fx, [ft=daily(0)], [fc], [x], [name])
// alias for `_event(…)`, mutator (`fx`) first
const _do = _event

// _at(ft, [fx], [fc], [x], [name])
// alias for `_event(…)`, scheduler (`ft`) first
const _at = (ft, fx, fc, x, name) => _event(fx, ft, fc, x, name)

// _if(fc, [ft=daily(0)], [fx], [x], [name])
// alias for `_event(…)`, conditioner (`fc`) first
const _if = (fc, ft, fx, x, name) => _event(fx, ft, fc, x, name)

// is `e` an event object?
const is_event = e => e instanceof _Event

// logical _and_ conditioner
const and = (...fJ) => (apply(fJ, _convert_fc), x => fJ.every(f => f(x)))

// logical _or_ conditioner
const or = (...fJ) => (apply(fJ, _convert_fc), x => fJ.some(f => f(x)))

// logical _not_ conditioner
const not = f => ((f = _convert_fc(f)), x => !f(x))

// generic mutator
// handles args `...yJ` in order, by type:
// | function `f`  | invoke as `r = f(x,r)`, `r` last returned value
// |               | if last arg, handle `r` as arg (by type), return `r`
// |               | else if `r==null`, return `null`, else continue
// | `undefined`   | skipped
// | `null`        | returned (cancels event)
// | `p∈[0,1]`     | continue mutations w/ probability `p`
// |               | otherwise (w/ prob. `1-p`) cancel, return `null`
// |  primitive    | mutate state identifier primitive (x.state)
// |  array        | mutate recursively, passing array as args
// |  object       | merge object into state, invoke functions as f(old_val,x)
// returns last returned value from last function arg, if any
const mut = (...yJ) => x => _mut(x, ...yJ) // prettier-ignore
const _mut = (x, ...yJ) => {
  let ret // set below if there are function args
  let J = yJ.length
  while (!defined(yJ[J - 1])) J-- // drop undefined suffix
  for (let j = 0; j < J; ++j) {
    let y = yJ[j]
    if (is_function(y)) {
      if (j < J - 1) {
        ret = y(x, ret)
        if (ret === null) return null // cancel event
        continue
      } else ret = y = y(x, ret) // process as mutation below
    }
    if (y === undefined) continue // skip mutation
    if (y === null) return null // cancel event
    if (is_number(y) && y >= 0 && y <= 1) {
      // continue mutations with prob. y
      if (random_boolean(y)) continue
      return null
    }
    if (is_primitive(y)) x.state = y
    else if (is_array(y)) _mut(x, ...y)
    else if (is_object(y)) _set_obj(x, y)
    else throw `invalid argument '${y}' for _mut`
  }
  return ret
}

// increment mutator
// handles args `...yJ` in order, by type:
// | function `f`  | invoke as `r = f(x,r)`, `r` last returned value
// |               | if last arg, handle `r` as arg (by type), return `r`
// |               | else if `r==null`, return `null`, else continue
// | `undefined`   | skipped
// | `null`        | returned (cancels event)
// | `p∈[0,1]`     | continue increments w/ probability `p`
// |               | otherwise (w/ prob. `1-p`) cancel, return `null`
// |  string       | increment property or path (e.g. `x.a.b.c`) in `x`
// |  array        | increment recursively, passing array as args
// |  object       | increment all properties or paths in object
// |               | objects can be nested, e.g. `{a:{b:{c:1}}}`
// |               | functions are invoked as f(old_val,x)
// |               | non-numbers are set (no coercion)
// returns last returned value from last function arg, if any
const inc = (...yJ) => x => _inc(x, ...apply(yJ, _pathify)) // prettier-ignore
const _inc = (x, ...yJ) => {
  let ret // set below if there are function args
  let J = yJ.length
  while (!defined(yJ[J - 1])) J-- // drop undefined suffix
  for (let j = 0; j < J; ++j) {
    let y = yJ[j]
    if (is_function(y)) {
      if (j < J - 1) {
        ret = y(x, ret)
        if (ret === null) return null // cancel event
        continue
      } else ret = y = _pathify(y(x, ret)) // process as increment below
    }
    if (y === undefined) continue // skip increment
    if (y === null) return null // cancel event
    if (is_number(y) && y >= 0 && y <= 1) {
      // continue increments with prob. y
      if (random_boolean(y)) continue
      return null
    }
    if (_is_path(y)) _inc_path(x, y)
    else if (is_array(y)) _inc(x, ...y)
    else if (is_object(y)) _inc_obj(x, y)
    else if (is_string(y)) throw `invalid string argument '${y}' for _inc`
    else throw `invalid argument '${y}' for _inc`
  }
  return ret
}
// ~10x faster string path increment function
// supports only array.# (via _Path), not array[#]
const _find_dot = str => {
  for (let i = 0; i < str.length; ++i) if (str[i] == '.') return i
  return -1
}
class _Path {
  constructor(str, dot = _find_dot(str)) {
    this.head = dot < 0 ? str : str.slice(0, dot)
    this.tail = dot < 0 ? null : _pathify(str.slice(dot + 1))
  }
}
const _is_path = x => x.constructor.name == '_Path'
self._path_cache ??= new Map()
const _path = (...args) => new _Path(...args)
const _pathify = x => {
  if (!is_string(x)) return x
  const dot = _find_dot(x)
  if (dot < 0) return _path(x, dot) // do not cache non-dot keys
  let path = _path_cache.get(x)
  if (!path) _path_cache.set(x, (path = _path(x, dot)))
  return path
}
const _inc_path = (x, y) => {
  if (!y.tail) x[y.head] = (x[y.head] || 0) + 1
  else _inc_path((x[y.head] ??= {}), y.tail)
}
const _inc_obj = (x, y) => {
  for (const k of keys(y)) {
    const v = y[k]
    if (is_number(v)) x[k] = (x[k] || 0) + v
    else if (is_object(v)) _inc_obj(x[k] || (x[k] = {}), v)
    else if (is_function(v)) x[k] = v(x[k], x) // invoke func. as (old_value, x)
    else x[k] = v // set to new non-number value (no coercion)
  }
}
const _get_path = (x, y) => {
  if (!y.tail) return x[y.head]
  return _get_path((x[y.head] ??= {}), y.tail)
}
const _set_path = (x, y, z) => {
  if (!y.tail) x[y.head] = z
  else _set_path((x[y.head] ??= {}), y.tail, z)
}
const _set_obj = (x, y) => {
  for (const k of keys(y)) {
    const v = y[k]
    if (is_object(v)) _set_obj(x[k] || (x[k] = {}), v)
    else if (is_function(v)) x[k] = v(x[k], x) // invoke func. as (old_value, x)
    else x[k] = v // set to new value
  }
}

function _benchmark_inc() {
  const x = { count: 0, nested: { count: 0 } }
  // proxy object for benchmarking proxy overhead
  const proxy = new Proxy(x, {
    get(...args) {
      return Reflect.get(...args)
    },
    set(...args) {
      return Reflect.set(...args)
    },
  })
  const proxy2 = new Proxy(x, {
    get(obj, prop) {
      return obj[prop]
    },
    set(obj, prop, value) {
      obj[prop] = value
      return true
    },
  })
  // regular object for benchmarking getter/setter overhead
  const obj = {}
  let count = 0
  define(obj, 'count', {
    get() {
      return count
    },
    set(v) {
      count = v
    },
  })
  // a 'tracked' property to assess additional overhead of tracking calls
  let getters = new Set()
  let setters = new Set()
  let sets = new Set()
  let gets = new Set()
  define(obj, 'count_tracked', {
    get() {
      getters.add(count % 10) // emulate a set of object pointers
      getters.delete((count * 7) % 10) // emulate some deletion
      gets.add('count')
      return count
    },
    set(v) {
      setters.add(v % 10) // emulate a set of object pointers
      setters.delete((v * 7) % 10) // emulate some deletion
      sets.add('count')
      count = v
    },
  })
  seal(obj) // no more properties
  // increment mutator functions
  const inc_count = inc('count')
  const inc_nested_count = inc('nested.count')
  benchmark(
    () => x.count++,
    () => (x.count = (x.count || 0) + 1),
    () => x.nested.count++,
    () => x['count']++,
    () => x['nested']['count']++,
    () => set(x, 'count', get(x, 'count') + 1),
    () => update(x, 'count', a => (a || 0) + 1),
    () => _inc_path(x, _path('count')),
    () => _inc_path(x, _pathify('count')),
    () => inc_count(x),
    () => update(x, 'nested.count', a => (a || 0) + 1),
    () => _inc_path(x, _path('nested.count')),
    () => _inc_path(x, _pathify('nested.count')),
    () => inc_nested_count(x),
    () => merge_with(x, { count: 1 }, (a, b) => (a || 0) + b),
    () => _inc_obj(x, { count: 1 }),
    () =>
      merge_with(x, { nested: { count: 1 } }, (a, b) => {
        if (is_number(b)) return (a || 0) + b
      }),
    () => _inc_obj(x, { nested: { count: 1 } }),
    () => proxy.count++,
    () => proxy['count']++,
    () => proxy2.count++,
    () => proxy2['count']++,
    () => obj.count++,
    () => obj['count']++,
    () => obj.count_tracked++,
    () => obj['count_tracked']++
  )
}

// wrapper to convert sampler|function arguments for schedulers below
function _scheduler(v, f) {
  if (v === undefined) return x => inf // never
  if (v._prior) return x => v._prior(v => f(v)(x))
  if (is_function(v))
    return x => {
      const _v = v(x)
      if (_v._prior) return _v._prior(v => f(v)(x))
      return f(_v)(x)
    }
  return f(v)
}

// daily scheduler
// triggers daily at hour-of-day `h∈[0,24)`
// `h` can be number, sampler, or function `x=>…`
// `h∉[0,24)` is mapped into `[0,24)` as `mod(h,24)`
const daily = h =>
  _scheduler(h, h => {
    if (!is_number(h)) fatal(`daily: invalid hour ${h}`)
    if (h == 0) return x => ~~x.t + 1
    h = mod(h, 24)
    const ht = h * _1h
    return x => {
      const xt = x.t // call x.t once
      const xd = ~~xt
      const xh = (xt - xd) * 24
      return xd + (xh >= h) + ht
    }
  })

// interval scheduler
// triggers _after_ `h>0` hours (from `x.t`)
// `h` can be positive number, sampler, or function `x=>…`
// often used w/ conditioner `fc` to trigger `h` hours _after_ `fc(x)` state
// cancelled by `!fc(x)` states, especially for larger intervals `h`
// triggers repeatedly _every_ `h` hours unless cancelled
// _memoryless_ iff exponential, see `randomly` below
const after = h =>
  _scheduler(h, h => {
    if (!(h > 0)) fatal(`after: invalid hours ${h}`)
    const ht = h * _1h
    return x => x.t + ht
  })

// random interval scheduler
// triggers randomly every `h>0` hours _on average_
// `h` can be positive number, sampler, or function `x=>…`
// consistent under rescheduling, _memoryless_: `P(T>s+t|T>s) = P(T>t)`
// corresponds _uniquely_ to transitions of _continuous-time markov chain_
// can be used w/ conditioner `fc` to trigger only in `fc(x)` states
// `h==r*log(1/(1-p))` triggers within `r` hours w/ prob. `p`
// `≡ after(exponential(0, h))` (but more efficient)
const randomly = h =>
  _scheduler(h, h => {
    if (!(h > 0)) fatal(`randomly: invalid hours ${h}`)
    const ht = h * _1h
    return x => x.t + ht * random_exponential()
  })

// specific time scheduler
// triggers _at_ specific times `tJ`
// `tJ` must be sorted (oldest first), in `event_time` units (see below)
const at = (...tJ) => {
  tJ = flat(tJ) //.sort((a, b) => a - b)
  const J = tJ.length
  tJ.push(inf) // tJ[J]=inf simplifies logic below
  let j = -1 // outside storage to remember last index
  return x => {
    while (true) {
      if (++j == J) return inf
      if (tJ[j] > x.t) return tJ[j]
    }
  }
}

// time intervals (<1d) in days
const _ms_per_day = 24 * 60 * 60 * 1000
const _1ms = 1 / _ms_per_day
const _1s = 1 / (24 * 60 * 60)
const _1m = 1 / (24 * 60)
const _1h = 1 / 24

// convert `date` to _event time_
// `date` must be a `Date` or valid argument for `new Date(…)`
// `date` can be omitted (or `undefined`) to use current date/time
// event times are _days_ since `_t0_monday_midnight` (see below)
// integer part is _midnights_ since `_t0_monday_midnight`
// fractional part times 24 is _hours since last midnight_
// days are assumed 24 hours, ignoring daylight savings
// one hour (2am in US) is effectively skipped or repeated
// e.g. Mar 13 2022 (PST->PDT) is 23 hours (2am dropped)
// e.g. Nov 6 2022 (PDT->PST) is 25 hours (2am repeated)
const event_time = date => {
  // allow override of current event_time() by sampler (via sampler.__now)
  if (date === undefined && self.__sampler?.__now !== undefined)
    return self.__sampler.__now
  date = date ? (date instanceof Date ? date : new Date(date)) : new Date()
  const midnight = (d => (d.setHours(0, 0, 0, 0), d))(new Date(date))
  const days = Math.round(_1ms * (midnight - _t0_monday_midnight))
  return days + _1ms * (date.getTime() - midnight)
}

const now = () => event_time()

// _t0_monday_midnight
// `new Date(2021, 0, 4)`
// `Mon Jan 04 2021 00:00:00 GMT-0800 (PST)`
let _t0_monday_midnight = new Date(2021, 0, 4)

// time of last hour-of-day `h`
// event time for last occurrence of `h` before `t`
// `t` is current time by default, but can be any event time
const last_hour = (h, t = event_time()) => {
  const s = ~~t + h * _1h
  return s < t ? s : s - 1 // today or yesterday
}

// convert event time to `Date`
const event_date = (t = event_time()) => {
  const date = new Date(_t0_monday_midnight),
    midnights = ~~t
  date.setDate(_t0_monday_midnight.getDate() + midnights)
  date.setTime(date.getTime() + (t - midnights) * _ms_per_day)
  return date
}

const _02d = x => (~~x).toString().padStart(2, '0')

// event date string `YYYY/MM/DD`
// | `drop_year` | drop year prefix `YYYY/`
// | `drop_current_year` | drop year prefix if current year
const date_string = (d = new Date(), options = undefined) =>
  options?.drop_year ||
  (options?.drop_current_year && d.getFullYear() == new Date().getFullYear())
    ? _02d(d.getMonth() + 1) + '/' + _02d(d.getDate())
    : d.getFullYear() + '/' + _02d(d.getMonth() + 1) + '/' + _02d(d.getDate())

// event time string `HH:MM`
const time_string = (d = new Date()) =>
  _02d(d.getHours()) + ':' + _02d(d.getMinutes())

// event date-time string `YYYY/MM/DD HH:MM`
// `options` same as `date_string` (see above)
const date_time_string = (d = new Date(), options = undefined) =>
  date_string(d, options) + ' ' + time_string(d)

// parse event date-time `YYYY/MM/DD HH:MM`
// returns `Date`
const parse_date_time = (date, time) => {
  if (date.includes(' ')) [date, time] = date.split(' ')
  const [year, month, day] = date.split('/').map(parseFloat)
  const [hour, minute] = time.split(':').map(parseFloat)
  return new Date(year, month - 1, day, hour, minute)
}

// parse event date `YYYY/MM/DD`
// returns `Date`
const parse_date = date => {
  const [year, month, day] = date.split('/').map(parseFloat)
  return new Date(year, month - 1, day, 0, 0)
}

// parse event time `HH:MM ...`
// returns as event time or `undefined` if invalid
const parse_time = text => {
  const [h, m] = text.match(/^(\d\d?):(\d\d)(?:\s|$)/)?.slice(1) || []
  if (h) return h * _1h + m * _1m // else undefined
}

function _test_event_time() {
  const now = new Date()
  const now_minutes = new Date(now) // current time in resolution of minutes
  now_minutes.setSeconds(0)
  now_minutes.setMilliseconds(0)
  function add_days(date, days) {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
  }
  check(
    () => [event_time(_t0_monday_midnight), 0],
    () => array(365, event_date).every(d => d.getHours() == 0),
    () => [event_time(add_days(_t0_monday_midnight, 1)), 1],
    () => [event_time(add_days(_t0_monday_midnight, 7)), 7],
    () => [event_time(add_days(_t0_monday_midnight, 30)), 30],
    () => [event_time(add_days(_t0_monday_midnight, 365)), 365],
    () => [~~((event_time() + 1) % 7), new Date().getDay()],
    () => [now.getTime(), event_date(event_time(now)).getTime()],
    () => [
      now_minutes.getTime(), // date_time_string truncates at minutes
      event_date(event_time(now_minutes)).getTime(),
      parse_date_time(date_time_string(now)).getTime(),
    ]
  )
}

// print event
const print_event = e => {
  const tstr = date_time_string(event_date(e.t))
  const name =
    e._name || e._source._name || str(e._source.fx).replace(/\S+\s*=>\s*/g, '')
  const omit_props = ['t', '_t', '_source', '_name']
  const attachments = entries(omit(e, omit_props)).map(
    ([k, v]) => k + ':' + (v?._name || str(v))
  )
  print(tstr, name, ...attachments)
}

// print state
const print_state = x => print(str(x))

// print trace
const print_trace = m => {
  const tstr = date_time_string(event_date(m.t))
  const e_name = m.e._name || str(m.e.fx).replace(/\S+\s*=>\s*/g, '')
  print(tstr, m.type, m.k, e_name)
}
