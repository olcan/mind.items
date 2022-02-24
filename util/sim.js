class _State {
  _schedulers = {}
  constructor(vars, params) {
    // define variable properties, subject to mutation tracking
    vars.t ??= 0 // defined required time variable if missing
    each(entries(vars), ([k, v]) => {
      // TODO: handle arrays, can be fixed size (example 13) or dynamic
      if (is_object(v) && !is_array(v))
        fatal(`invalid nested object variable '${k}'`)
      Object.defineProperty(this, k, {
        enumerable: true, // variables (unlike parameters) can be enumerated
        get() {
          // track scheduler access to any non-t state as a dependency
          // note dependency continues until mutation or remove_dependent
          if (this._scheduler && k != 't')
            (this._schedulers[k] ??= new Set()).add(this._scheduler)
          return vars[k]
        },
        set(v) {
          // reset and clear any dependent schedulers
          if (this._schedulers[k]?.size > 0) {
            for (const e of this._schedulers[k]) e._t = 0
            this._schedulers[k].clear()
          }
          vars[k] = v
        },
      })
    })

    // define (constant) parameter properties
    each(entries(params), ([k, v]) => {
      if (is_object(v)) Object.freeze(v) // freeze nested parameters
      Object.defineProperty(this, k, {
        value: v,
      })
    })

    // define auxiliary state properties _t, _events, _states, _scheduler
    Object.defineProperty(this, '_t', { writable: true })
    Object.defineProperty(this, '_events', { writable: true })
    Object.defineProperty(this, '_states', { writable: true })
    Object.defineProperty(this, '_scheduler', { writable: true })

    // seal state object to prevent untracked mutations
    Object.seal(this)
  }

  get d() {
    return ~~this.t
  }
  get h() {
    return (this.t - this.d) * 24
  }

  remove_dependent(e) {
    for (const deps of values(this._schedulers)) deps.delete(e)
  }
}

// create state object
const state = (vars, params = undefined) => new _State(vars, params)

// is `x` a state object?
const is_state = x => x instanceof _State

// simulate `events` from state `x` to time `t`
// `events` must be a flat array of event objects
// includes all events at times `(x.t,t], t>x.t`
// events at same time are invoked in order of `events`
// can be invoked again to _resume_ simulation w/o resampling
function simulate(x, t, events) {
  if (!is_state(x)) fatal('invalid state object')
  x._t ??= 0 // non-resuming sim starts at x._t=0 to be advanced x.t>t>0
  if (!(x.t >= 0)) fatal(`invalid x.t=${x.t}, must be >=0`)
  if (!(t > x.t)) fatal(`invalid t=${t}, must be >x.t=${x.t}`)
  if (!is_array(events)) fatal(`invalid events, must be array`)
  apply(events, e => {
    if (!is_event(e)) fatal('invalid event')
    if (x._t && (!e.t || !defined(e._t)))
      fatal(`invalid events/state for resume`, x._t, e.t, e._t)
    if (!x._t) e.t = e._t = 0 // reset events since we are not resuming
    return e
  })
  while (x._t <= t) {
    // get time of next scheduled event > x.t, ensuring caching of valid times
    // caching of valid times is handled in _Event to allow condition wrapper
    // can be inf (never), e.g. if all events fail conditions (= frozen state)
    // store next scheduled event time as x._t for persistence across calls
    for (const e of events) {
      x._scheduler = e // track event as dependent scheduler
      e.t = e.ft(x)
      x._scheduler = null
    }
    x._t = min_of(events, e => e.t) // can be inf
    if (!(x._t > x.t)) fatal('invalid e.ft(x) <= x.t')
    // stop at t if next event is >t
    if (x._t > t) break
    // advance to x.t=_t & trigger mutations
    x.t = x._t
    for (const e of events) if (x.t == e.t) e.fx(x)
  }
  x.t = t
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

// _event(fx, [ft=daily(0)], [fc])
// create mutation event `x → fx(x,…)`
// state `x` _mutates_ to `fx(x)` at time `ft(x)`
// | `fx`      | _mutation function_ `fx(x)`
// |           | must modify (i.e. _mutate_) state `x`
// |           | can return `null` to indicate _skipped_ mutation
// |           | can return (part of) state that affected mutation
// | `ft`      | _scheduler function_ `ft(x)`
// |           | must return future time `t > x.t`, can be `inf` (never)
// |           | state variables accessed in `ft` are considered _dependencies_
// |           | schedule is considered valid while dependencies are unchanged
// |           | default scheduler triggers daily at midnight (`t=0,1,2,…`)
// | `fc`      | optional _condition function_ `fc(x)`
// |           | wraps `ft(x)` to return `inf` for `!fc(x)` state
// |           | state variables accessed in `fc` are also dependencies (see above)
const _event = (...args) => new _Event(...args)
class _Event {
  constructor(fx, ft = daily(0), fc = undefined) {
    this.fx = x => {
      const θ = fx(x)
      // count mutations and skips (if defined) for benchmarking
      if (defined(x._mutations)) x._mutations++ // includes skipped
      if (θ === null) {
        if (defined(x._skips)) x._skips++
        return null
      }
      x._events?.push({ t: x.t, ...θ, _source: this })
      x._states?.push(clone_deep(x))
    }

    // wrap ft w/ cache wrapper and optional condition function fc
    this._t = 0 // cached scheduled time, can be reset via dependencies
    this.ft = x => {
      if (this._t > x.t) return this._t
      x.remove_dependent(this) // remove dependencies for previous _t
      if (fc && !fc(x)) return (this._t = inf)
      return (this._t = ft(x))
    }
  }
}

// _do(fx, [ft=daily(0)], [fc])
// alias for `_event(…)`, mutation (`fx`) first
const _do = _event

// _at(ft, fx, [fc])
// alias for `_event(…)`, scheduler (`ft`) first
const _at = (ft, fx, fc) => _event(fx, ft, fc)

// _if(fc, ft, fx)
// alias for `_event(…)`, condition (`fc`) first
const _if = (fc, ft, fx) => _event(fx, ft, fc)

// is `e` an event object?
const is_event = e => e instanceof _Event

// increment mutation
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
window._path_cache ??= new Map()
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
    if (k[0] == '_' && k[1] == '_') continue // skip double-underscore key
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
    get(obj, prop, receiver) {
      return Reflect.get(...arguments)
    },
    set(obj, prop, value) {
      return Reflect.set(...arguments)
    },
  })
  // regular object for benchmarking getter/setter overhead
  const obj = {}
  let count = 0
  Object.defineProperty(obj, 'count', {
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
  Object.defineProperty(obj, 'count_tracked', {
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
  Object.seal(obj) // no more properties
  // increment mutation functions
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
  const sampler = is_function(h) ? x => h(x) : () => h
  return x =>
    sampler(x)._prior(h => ((h = mod(h, 24)), x.d + (x.h >= h) + h * _1h))
}

// relative time scheduler
// triggers after `h>0` hours (from `x.t`)
// `h` can be any sampler on `[0,∞)`, e.g. `between(0,10)`
// `h` can be function `x=>…` that returns sampler per `x`
// state variables accessed in `h(x)` are considered dependencies
// often used w/ condition `fc` to trigger `h` hours after `fc(x)` state
// `h` should be short enough to avoid cancellation by `!fc(x)` state
function after(h) {
  if (h === undefined) return x => inf // never
  if (h > 0) return x => x.t + h * _1h
  const sampler = is_function(h) ? x => h(x) : () => h
  return x =>
    sampler(x)._prior(h => (h > 0 || fatal('negative hours'), x.t + h * _1h))
}

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
const _1ms = 1 / (24 * 60 * 60 * 1000)
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
  date.setTime(date.getTime() + (t - midnights) * 24 * 60 * 60 * 1000)
  return date
}

const _02d = d3.format('02d')

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
  const is_now = tstr == date_time_string()
  const name =
    e._name || e._source._name || str(e._source.fx).replace(/\S+\s*=>\s*/g, '')
  const sfx = e._sfx || e._source?._sfx || e._source?.fx._sfx
  const is_observe = name.startsWith('observe_')
  // NOTE: search for 'box drawings' in character viewer
  const pfx = is_now ? '╋━▶︎' : is_observe ? '╋━▶︎' : '│──'
  const omit_props = [
    't',
    '_t', // time cached in _Event
    '_source',
    '_name',
    '_sfx',
  ]
  const attachments = entries(omit(e, omit_props)).map(
    ([k, v]) => k + ':' + (v?._name || str(v))
  )
  print(pfx, tstr, name, sfx, ...attachments)
}

// print state
const print_state = x => print(str(x))
