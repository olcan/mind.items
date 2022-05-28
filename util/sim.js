class _State {
  constructor(state, _path, _root) {
    if (_root) define_value(this, '_root', _root)
    if (_path) define_value(this, '_path', _path)
    if (state) this.merge(state)
  }

  _init() {
    if (this._initialized) return // already initialized

    if (!this._path) {
      // define root-only properties used by simulate(…) and _Event constructor
      define(this, '_t', { writable: true })
      define(this, '_mutator', { writable: true })
      define(this, '_scheduler', { writable: true })
      define(this, '_dependents', { writable: true })
      define(this, '_sim_events', { writable: true })
      if (this.t === undefined) this.merge({ t: 0 }) // merge default x.t=0
      if (this._states?.length == 0) this._states.push(clone_deep(this))
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
      if (is_state(v)) v._init() // initialized nested state
    }

    define_value(this, '_initialized', true)
    seal(this) // prevent new properties, make existing ones non-configurable
  }

  // define convenience temporal properties d & h at ALL levels (via prototype)
  // these use root(x).t, always defined on root on/before _init
  // non-root t is also redirected to root(x).t at _init
  get d() {
    return ~~root(this).t
  }
  get h() {
    const t = root(this).t
    return (t - ~~t) * 24
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
    if (this._initialized) fatal(`can't merge after sim (init)`)
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
          this[k] = v
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
        // not supported for params (assumed fixed)
        // see setter below for similar logic
        if (v._traced ?? (is_plain_object(v) && !params)) {
          if (params) fatal(`tracing not supported (& unnecessary) for params`)
          v = new _State(params ? { _params: v } : v, path, root(this))
        }
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
            if (is_object(v_new) && (v_new._traced ?? is_plain_object(v_new)))
              v_new = new _State(v_new, path, root(this))
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
    x._cancel(e) // cancel any dependencies
    e._t = undefined // disable (same as in _Event constructor)
    return this // for chaining
  }

  _cancel(e) {
    if (this._dependents)
      for (const deps of values(this._dependents)) deps.delete(e)
  }

  _on_get(k, v) {
    if (!this._initialized) return // ignore access until _init
    // track scheduler access as a "dependency"
    // dependency continues until mutation or _cancel
    // untraced nested dependencies are detected via _on_get for ancestor
    if (this._scheduler) {
      if (is_object(v) && !is_state(v))
        fatal(`scheduler access to untraced nested state '${k}'`)
      this._dependents ??= {}
      this._dependents[k] ??= new Set()
      this._dependents[k].add(this._scheduler)
    } else if (!this._mutator) return // ignore non-mutator/scheduler access
    this._trace?.push({
      type: this._mutator ? 'fx_get' : 'ft_get',
      k,
      v,
      t: k == 't' ? v : this.t,
      e: this._mutator ?? this._scheduler,
    })
  }

  _on_set(k, v_new, v_old) {
    if (!this._initialized) return // ignore mutation until _init
    if (this._scheduler) fatal(`state set in scheduler`)
    if (!this._mutator) {
      if (k == 't') return // ignore non-mutator changes to x.t
      fatal(`state '${k}' set outside of mutator`)
    }
    if (k == 't') fatal('x.t set in mutator')
    this._trace?.push({
      type: 'fx_set',
      k,
      v_new,
      v_old,
      t: this.t,
      e: this._mutator,
    })
    // reset and clear any dependent schedulers
    if (this._dependents?.[k]?.size > 0) {
      for (const e of this._dependents[k]) e._t = 0
      this._dependents[k].clear()
    }
  }
}

// create state from `obj`
// functions are invoked in [property order](https://stackoverflow.com/a/38218582)
const state = obj => new _State(obj)

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
const trace = obj => (define_value(obj, '_traced', true), obj)

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
// cancelled if state is assigned zero weight, i.e. `x._log_w==-inf`
function simulate(x, t, events, options = undefined) {
  if (!is_state(x)) fatal('invalid state object')
  if (!is_array(events)) fatal(`invalid events, must be array`)
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
  x._init() // init state (if needed) for first simulation
  x._sim_events = events = new Set(events) // event set for x.enable/disable
  for (const e of events) {
    if (!is_event(e)) fatal('invalid event')
    if (x._t && (!e.t || !defined(e._t)))
      fatal(`invalid events/state for resume`, x._t, e.t, e._t)
    if (!x._t) e.t = e._t = 0 // reset events since we are not resuming
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

// attach events `eJ` to (nested) state `x`
// event functions will be invoked on `x` instead of `root(x)`
const attach_events = (x, ...eJ) => each(flat(eJ), e => (e._x = x))

// _event(fx, [ft=daily(0)], [fc], [x])
// create mutation event `x → fx(x,…)`
// state `x` _mutates_ to `fx(x)` at time `ft(x)`
// | `fx`      | _mutator function_ `fx(x)`
// |           | must modify (i.e. _mutate_) state `x`
// |           | can return `null` to indicate _skipped_ mutation
// |           | can return mutation parameters to be recorded in `x._events`
// | `ft`      | _scheduler function_ `ft(x)`
// |           | must return future time `t > x.t`, can be `inf` (never)
// |           | state variables accessed in `ft` are considered _dependencies_
// |           | schedule is considered valid while dependencies are unchanged
// |           | default scheduler triggers daily at midnight (`t=0,1,2,…`)
// | `fc`      | optional _condition function_ `fc(x)`
// |           | wraps `ft(x)` to return `inf` for `!fc(x)` state
// |           | state variables accessed in `fc` are also dependencies (see above)
// | `x`       | optional (nested) state object, attached to event as `_x`
// |           | all functions will be invoked on `x` instead of `root(x)`
// | `name`    | optional event name string, attached as `_name`
// |           | extended as `path(x,name)` if `x` is also specified
const _event = (...args) => new _Event(...args)
class _Event {
  constructor(fx, ft = daily(0), fc = undefined, x, name) {
    if (x) this._x = x // pre-attached state
    if (name) this._name = x ? path(x, name) : name
    this.fx = x => {
      x._mutator = this // track event as mutator
      const θ = fx(this._x ?? x)
      x._mutator = null
      if (θ === null) return null // event (mutation) skipped
      x._events?.push({ t: x.t, ...θ, _source: this })
      x._states?.push(clone_deep(x))
    }

    // wrap ft w/ cache wrapper and optional condition function fc
    // note this._t is set externally, e.g. in simulate(…) or x.enable
    this._t = undefined // cached scheduled time (undefined = event disabled)
    this.ft = x => {
      if (this._t > x.t) return this._t
      x._cancel(this) // cancel dependencies for any previous _t
      x._scheduler = this // track event as dependent scheduler
      const _x = this._x ?? x
      this._t = fc && !fc(_x) ? inf : ft(_x)
      x._scheduler = null
      return this._t
    }
  }
}

// _do(fx, [ft=daily(0)], [fc], [x], [name])
// alias for `_event(…)`, mutator (`fx`) first
const _do = _event

// _at(ft, fx, [fc], [x], [name])
// alias for `_event(…)`, scheduler (`ft`) first
const _at = (ft, fx, fc, x, name) => _event(fx, ft, fc, x, name)

// _if(fc, ft, fx, [x], [name])
// alias for `_event(…)`, condition (`fc`) first
const _if = (fc, ft, fx, x, name) => _event(fx, ft, fc, x, name)

// is `e` an event object?
const is_event = e => e instanceof _Event

// increment mutator
// handles args `...yJ` in order, by type:
// | function `f`  | invoke as `r = f(x,r)`, `r` last returned value
// |               | if last arg, handle `r` as arg (by type), return `r`
// |               | else if `r` falsy (excl. `undefined`), cancel, return `null`
// | `undefined`   | skipped
// | `p∈[0,1]`     | continue increments w/ probability `p`
// |               | otherwise (w/ prob. `1-p`) cancel, return `null`
// |  string       | increment property or path (e.g. `x.a.b.c`) in `x`
// |  array        | increment recursively, passing array as args
// |  object       | increment all properties or paths in object
// |               | can be nested, e.g. `{a:{b:{c:1}}}`
// returns last returned value from last function arg, if any
const inc = (...yJ) => (apply(yJ, _pathify), x => _inc(x, ...yJ))
const _inc = (x, ...yJ) => {
  let ret // set below if there are function args
  let J = yJ.length
  while (!defined(yJ[J - 1])) J-- // drop undefined suffix
  for (let j = 0; j < J; ++j) {
    let y = yJ[j]
    if (is_function(y)) {
      if (j < J - 1) {
        ret = y(x, ret)
        if (defined(ret) && !ret) return null // cancel on defined falsy
        continue
      } else ret = y = _pathify(y(x, ret)) // process as increment below
    }
    if (!defined(y)) continue // skip increment
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
    if (is_object(v)) _inc_obj(x[k] || (x[k] = {}), v)
    // non-numbers are _set_ instead of incremented (w/ coercion)
    else if (is_number(v)) x[k] = (x[k] || 0) + v
    else x[k] = v
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

// daily scheduler
// triggers daily at hour-of-day `h∈[0,24)`
// `h` can be any sampler, e.g. `within(9,1)`
// `h` can be function `x=>…` that returns sampler per `x`
// state variables accessed in `h(x)` are considered dependencies
// sampled `h` is mapped into `[0,24)` as `mod(h,24)`
function daily(h) {
  if (h === undefined) return x => inf // never
  if (h == 0) return x => x.d + 1
  if (h > 0 && h < 24) return x => x.d + (x.h >= h) + h * _1h
  const sampler = is_function(h) ? h : () => h
  return x =>
    sampler(x)?._prior(h => ((h = mod(h, 24)), x.d + (x.h >= h) + h * _1h)) ??
    inf
}

// interval scheduler
// triggers _after_ `h>0` hours (from `x.t`)
// `h` can be any sampler on `[0,∞)`, e.g. `between(0,10)`
// `h` can be function `x=>…` that returns sampler per `x`
// state variables accessed in `h(x)` are considered dependencies
// often used w/ condition `fc` to trigger `h` hours _after_ `fc(x)` state
// cancelled by `!fc(x)` states, especially for larger intervals `h`
// triggers repeatedly _every_ `h` hours unless cancelled
// _memoryless_ iff exponential, see `randomly` below
function after(h) {
  if (h === undefined) return x => inf // never
  if (h > 0) return x => x.t + h * _1h
  const sampler = is_function(h) ? h : () => h
  return x =>
    sampler(x)?._prior(
      h => (h > 0 || fatal('negative hours'), x.t + h * _1h)
    ) ?? inf
}

// random interval scheduler
// `≡ after(exponential(0, h))`
// _memoryless_: `P(T>s+t|T>s) = P(T>t)`
const randomly = h => after(exponential(0, h))

// absolute time scheduler
// triggers at specific absolute times `tJ`
// `tJ` must be sorted (oldest first), in `event_time` units (see below)
const times = (...tJ) => {
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

// convert `Date` to _event time_
// event times are in _days_ since `_t0_monday_midnight` (see below)
// _days_ are defined as DST-adjusted _midnights + hours in local time_
// local times are generally subject to DST (unlike UTC times)
const event_time = (date = new Date()) => {
  const midnight = (d => (d.setHours(0, 0, 0, 0), d))(new Date(date))
  const days = Math.round(_1ms * (midnight - _t0_monday_midnight))
  return days + _1ms * (date.getTime() - midnight)
}

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

// _6am
// time of last 6 AM (local time)
const _6am = last_hour(6)

const now = () => event_time()

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
const date_string = (d = new Date()) =>
  d.getFullYear() + '/' + _02d(d.getMonth() + 1) + '/' + _02d(d.getDate())

// event time string `HH:MM`
const time_string = (d = new Date()) =>
  _02d(d.getHours()) + ':' + _02d(d.getMinutes())

// event date-time string `YYYY/MM/DD HH:MM`
const date_time_string = (d = new Date()) =>
  date_string(d) + ' ' + time_string(d)

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
  const sfx = e._sfx || e._source?._sfx || e._source?.fx._sfx
  const omit_props = ['t', '_t', '_source', '_name', '_sfx']
  const attachments = entries(omit(e, omit_props)).map(
    ([k, v]) => k + ':' + (v?._name || str(v))
  )
  print(tstr, name, sfx, ...attachments)
}

// print state
const print_state = x => print(str(x))

// print trace
const print_trace = m => {
  const tstr = date_time_string(event_date(m.t))
  const e_name = m.e._name || str(m.e.fx).replace(/\S+\s*=>\s*/g, '')
  print(tstr, m.type, m.k, e_name)
}
