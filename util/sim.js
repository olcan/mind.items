// simulate state `x` to time `t`
// `events` must be object `{name:event, …}`
// includes events scheduled at exact time `t`
// events at same time are invoked in order of `events`
// can be invoked again to _resume_ simulation w/o resampling
// events must be `reset` (see below) for new (not resumed) sim
function simulate(x, t, events) {
  assert(x.t >= 0, `invalid x.t=${x.t}, must be >=0`)
  assert(t > x.t, `invalid t=${t}, must be >x.t=${x.t}`)
  assert(is_object(events), 'events must be object of named events')
  // convert events object into array w/ _names attached
  const eJ = apply(entries(events), ([n, e]) => set(e, '_name', n))
  // fast-forward to time t if no events <=t (from previous call)
  if (x._t > t) return set(x, 't', t)
  do {
    // get time of next scheduled event > x.t, ensuring caching of valid times
    // caching of valid times is handled in _Event to allow condition wrapper
    // can be inf (never), e.g. if all events fail conditions (= frozen state)
    // store next scheduled event time as x._t for persistence across calls
    // precompute day x.td and hour-of-day x.th to help schedulers
    x.td = ~~x.t
    x.th = (x.t - x.td) * 24
    each(eJ, e => (e.t = e.ft(x))) // caching is handled in _Event
    x._t = min_of(eJ, e => e.t)
    assert(x._t > x.t, 'invalid e.ft(x) <= x.t')
    // stop at time t if next event is past t
    if (x._t > t) return set(x, 't', t)
    // advance to x.t=_t & trigger transitions
    x.t = x._t
    each(eJ, e => x.t != e.t || e.fx(x))
  } while (x._t < t) // continue until next scheduled time is past t
  return x
}

// _event(fx, [ft=daily(0)], [fc], [fθ])
// create transition event `x → fx(x,…)`
// state `x` transitions to `fx(x,…)` at time `ft(x)`
// scheduler `ft` can depend on state `x`, can be _never_ (`inf`)
// transition may depend on _parameters_ `θ`
// | `fx`      | _transition function_ `fx(x,θ)`
// |           | must modify state `x` to apply transition
// |           | can return `null` to indicate _skipped_ transition
// |           | can return any parameters `θ` that affected transition
// |           | can use given parameters `θ` or generate own
// |           | must be robust to undefined `θ` or `θ.*`
// | `ft`      | _scheduler function_ `ft(x)`
// |           | must return future time `t > x.t`, can be `inf` (never)
// |           | default scheduler triggers daily at midnight (`t=0,1,2,…`)
// | `fc`      | optional _condition function_ `fc(x)`
// |           | wraps `ft(x)` to return `inf` while `!fc(x)`
// |           | cancels any future time scheduled before `!fc(x)`
// | `fθ`      | optional _default parameter function_ `fθ(x)`
// |           | invoked for each call to `fx` where `θ` is omitted
const _event = (...args) => new _Event(...args)
class _Event {
  constructor(fx, ft = daily(0), fc = undefined, fθ = undefined) {
    // note wrapping ft (see below) is more efficient skipping calls to fx
    // if (fc && !fc(x)) return null // skip silently if condition is false
    this._fx = fx // original fx passed to constructor, can be modified
    this.fx = (x, θ) => {
      if (fθ && !defined(θ)) θ = fθ(x) // use fθ(x) as default θ
      const _θ = this._fx(x, θ) // use this._fx to allow modification
      // count transitions and skips (if defined) for benchmarking
      if (defined(x._transitions)) x._transitions++ // includes skipped
      if (_θ === null) {
        if (defined(x._skips)) x._skips++
        return null
      }
      if (defined(_θ)) θ = _θ
      x._states?.push(clean_state(x))
      x._events?.push({ t: x.t, ...θ, _source: this })
      if (window._sim_print_states) print_state(x)
      if (window._sim_print_events) print_event({ t: x.t, ...θ, _source: this })
    }
    this._ft = ft // original ft passed to constructor, can be modified
    let _t = 0 // cached scheduled time, stored here for condition wrapper
    this.ft = ft = x => (_t > x.t ? _t : (_t = this._ft(x)))
    // condition wrapper that returns inf while !fc(x)
    // also cancels any future time scheduled (and cached) before `!fc(x)`
    if (fc) this.ft = x => (!fc(x) ? ((_t = 0), inf) : ft(x))
  }
}

// _do(fx, [ft=daily(0)], [fc], [fθ])
// alias for `_event(…)`, transition (`fx`) first
const _do = _event

// _at(ft, fx, [fc], [fθ])
// alias for `_event(…)`, scheduler (`ft`) first
const _at = (ft, fx, fc, fθ) => _event(fx, ft, fc, fθ)

// _if(fc, ft, fx, [fθ])
// alias for `_event(…)`, condition (`fc`) first
const _if = (fc, ft, fx, fθ) => _event(fx, ft, fc, fθ)

// reset `events` for new sim
// new sim must also start from new state
const reset = events => each(values(events), e => delete e.t)

// create state with `props` at time `t`
// `props` can be any [cloneable](https://lodash.com/docs/4.17.15#clone) object
// `history` can be `0` (none), `1` (events), or `2` (events & states)
const state = (props, t = 0, history = 0) => {
  assert(is_finite(t), `invalid state time ${t}`)
  switch (history) {
    case 0:
      return { t, ...props }
    case 1:
      return { t, ...props, _events: [] }
    case 2:
      return { t, ...props, _events: [], _states: [] }
    default:
      fatal(`invalid state history mode ${history}`)
  }
}

// increment transition
// function `(x,θ) => …` applies `θ` as _increment_ to `x`
// handles combined args `[...yJ, θ]` in order, by type:
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
const inc = (...yJ) => (apply(yJ, _pathify), (x, θ) => _inc(x, ...yJ, θ))
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
  each(keys(y), k => {
    const v = y[k]
    if (is_object(v)) _inc_obj(x[k] || (x[k] = {}), v)
    else x[k] = (x[k] || 0) + v // can be number, boolean, etc
  })
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
    () => _inc_obj(x, { nested: { count: 1 } })
  )
}

// daily scheduler
// triggers daily at hour-of-day `h∈[0,24)`
// `h` can be any sampler, e.g. `within(9,1)`
// sampled `h` is mapped into `[0,24)` as `mod(h,24)`
function daily(h) {
  if (h === undefined) return x => inf // never
  if (h == 0) return x => x.td + 1
  if (h > 0 && h < 24) return x => x.td + (x.th >= h) + h * _1h
  if (!h._prior) fatal(`invalid hour '${str(h)}'`)
  return x => h._prior(h => ((h = mod(h, 24)), x.td + (x.th >= h) + h * _1h))
}

// delay-based scheduler
// triggers `h>0` hours after current time `x.t`
// `h` can be any sampler on `[0,∞)`, e.g. `between(0,10)`
// typically used w/ condition function to prevent repeated triggering
function after(h) {
  if (h === undefined) return x => inf // never
  if (h > 0) return x => x.t + h * _1h
  if (!h._prior) fatal(`invalid hours '${str(h)}'`)
  return x => h._prior(h => (assert(h > 0, 'negative hours'), x.t + h * _1h))
}

// absolute time scheduler
// triggers at specific times `tJ`
// times are in event time units: days since `_t0_monday_midnight`
const times = (...tJ) => {
  tJ = flat(tJ).sort((a, b) => a - b)
  const J = tJ.length
  tJ.push(inf) // tJ[J]=inf simplifies logic below
  let j = -1 // outside storage to remember last index
  return (x, t) => {
    if (j >= 0 && tJ[j] != t) j = -1 // reset if (t,j) inconsistent
    if (j++ == J) return inf // done
    while (tJ[j] <= x.t) j++
    return tJ[j]
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

// time of most recent hour-of-day `h`
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
    () => [~~(event_time() % 7) + 1, new Date().getDay()],
    () => [now.getTime(), event_date(event_time(now)).getTime()],
    () => [
      now_minutes.getTime(), // date_time_string truncates at minutes
      event_date(event_time(now_minutes)).getTime(),
      parse_date_time(date_time_string(now)).getTime(),
    ]
  )
}

// clone state
// shallow-copies underscore-prefixed keys, e.g. `_states`, `_events`, etc
const clone_state = x =>
  clone_deep_with(x, (v, k) => (k && k[0] == '_' ? v : undefined))

// clean state
// omits underscore-prefixed keys plus `td` and `th`
const clean_state = x =>
  omit_by(x, (v, k) => k && (k[0] == '_' || k == 'td' || k == 'th'))

// print event
const print_event = e => {
  const tstr = date_time_string(event_date(e.t))
  const is_now = tstr == date_time_string()
  const name =
    e._name || e._source._name || str(e._source._fx).replace(/\S+\s*=>\s*/g, '')
  const sfx = e._sfx || e._source?._sfx || e._source?._fx._sfx
  const is_observe = name.startsWith('observe_')
  // NOTE: search for 'box drawings' in character viewer
  const pfx = is_now ? '╋━▶︎' : is_observe ? '╋━▶︎' : '│──'
  const omit_props = [
    't',
    'td',
    'th',
    '_t',
    '_source',
    '_elog',
    '_name',
    '_sfx',
  ]
  const attachments = entries(omit(e, omit_props)).map(
    ([k, v]) => k + ':' + (v?._name || str(v))
  )
  print(pfx, tstr, name, sfx, ...attachments)
}

// print events
// most recent first, since time `tb`
const print_events = (x, tb = 0) => {
  assert(x._events, 'no _events to print')
  each(x._events.reverse(), e => e.t < tb || print_event(e))
}

// print state
const print_state = x => print(str(clean_state(x)))

// print states
// most recent first, since time `tb`
const print_states = (x, tb = 0) => {
  assert(x._states, 'no _states to print')
  each(x._states.reverse(), x => x.t < tb || print_state(x))
}

// print history (events & states)
const print_history = (x, tb = 0) => {
  const { _events, _states } = x
  assert(_events || _states, 'no history (_events|_states) to print')
  if (_events) print_events(x, tb)
  if (_states) print_states(x, tb)
}
