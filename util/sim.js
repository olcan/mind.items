// simulate `events` to time `t` from state `x`
// `events` must be object of form `{name:event, …}`
// includes any events scheduled at exact time `t`
// may include events _just after_ `t` unless `strict`
function sim(x, t = 1, events, strict = false) {
  assert(is_object(events), 'events must be object of named events')
  assert(t > x.t, `invalid sim time t=${t}<=x.t=${x.t}`)
  const eJ = apply(entries(events), ([n, e]) => set(e, '_name', n))
  while (x.t < t) {
    each(eJ, e => (e.t = e.ft(x, e.t)))
    let min_ft = min_of(eJ, e => e.t)
    assert(min_ft > x.t, 'invalid e.ft(x,e.t) < x.t')
    if (min_ft > t && strict) {
      x.t = t
      break
    }
    x.t = min_ft
    each(eJ, e => x.t != e.t || e.fx(x))
  }
  each(eJ, e => delete e.t) // reset times stored in eJ
  return x
}

// define transition event `x → fx(x,…)`
// state `x` transitions to `fx(x,…)` at scheduled time `ft(x,…)`
// schedule can depend on state `x`, can be _never_ (`inf`)
// transition may depend on _parameters_ `θ`
// | `fx`      | _transition function_ `fx(x,θ)`
// |           | must modify state `x` to apply transition
// |           | can return `null` to indicate _skipped_ transition
// |           | can return any parameters `θ` that affected transition
// |           | can use given parameters `θ` or generate own
// |           | must be robust to undefined `θ` or `θ.*`
// | `ft`      | _scheduling function_ `ft(x,t)`
// |           | must return _next scheduled time_ `t' > x.t`
// |           | can depend on state `x` and/or _last scheduled time_ `t`
// |           | must return `t' = t` if `t` still valid for `x`
// |           | default schedule is (every) `midnight`
// | `fc`      | optional _condition (predicate) function_ `fc(x)`
// |           | wraps `ft = cond(ft, fc)` (see below)
// | `fθ`      | optional _parameter function_ `fθ(x)`
// |           | wraps `fx = param(fx, fθ)` (see below)
// |           | affects _default `θ` only_, as in `fx(x, θ = fθ(x))`
const do_ = (fx, ft = midnight, fc = undefined, fθ = undefined) => ({
  fx: function (x, θ) {
    const t = x.t
    if (!θ && fθ) θ = fθ(x) // analogous to wrapper fx=param(fx,fθ)
    const ret = this._fx(x, θ) // use e.fx in case fx modified
    assert(x.t == t, 'e.fx should not change x.t')
    if (defined(x._jumps)) x._jumps++ // includes skipped events
    if (ret === null) {
      if (defined(x._skips)) x._skips++
    } else {
      if (defined(ret)) θ = ret
      x._states?.push(clean_state(x))
      x._events?.push({ t, ...θ, _source: this })
    }
  },
  ft: !fc ? ft : cond(ft, fc),
  _fx: fx, // original fx passed to event(…)
  _ft: ft, // original ft passed to event(…)
})

// define event, schedule (`ft`) first
const at_ = (ft, fx, fc = undefined, fθ = undefined) => do_(fx, ft, fc, fθ)

// define event, condition (`fc`) first
const if_ = (fc, ft, fx, fθ = undefined) => do_(fx, ft, fc, fθ)

// wrap `ft(x,t)` for condition `fc(x)`
// ensures `ft(x,t)==inf` if `!fc(x)`
// assumes `ft(x,t)` can return new `t'>x.t` given `t=inf`
// otherwise `ft` must define `_disallow_condition_wrapper`
function cond(ft, fc) {
  assert(
    !ft._disallow_condition_wrapper,
    `scheduling function '${ft._name || str(ft)}' ` +
      `does not allow condition wrapper`
  )
  return (x, t) => (fc(x) ? ft(x, t) : inf)
}

// wrap `fx(x,θ)` for default params `θ=fθ(x)`
const param = (fx, fθ) =>
  set((x, θ = fθ(x)) => (fx(x, θ), θ), '_name', fx._name || fx.name || str(fx))

// TODO: clean up everything below and also port tests/benchmarks where possible!

// basic state-independent (⊥x) scheduling functions

// next midnight
const midnight = (x, t) => (t > x.t && t < inf ? t : ~~x.t /*d*/ + 1) // >x.t

// next occurrence of hour h ∈ [0,24] (skips days for h>24)
const hour = h => (x, t) =>
  ok(x, t) ? t : ((t = dx(x) + h * _1h), t > x.t ? t : t + 1)

// next occurrence of random hour h ∈ [ha,hb]
// if already inside/past range same day, samples from next day
// default random sampler is random_uniform(a,b) but can be customized
// optional modifier(a,b,x,t) can modify range pre-sampling
// condition wrapper can control sampling time for modifier
function hours(ha, hb, sampler = random_uniform, modifier) {
  return (x, t) => {
    if (ok(x, t)) return t // either ⊥x or modifier disallowed
    const [a, b] = modifier ? modifier(ha, hb, x, t) : [ha, hb]
    const [d, h] = dhx(x)
    if (h >= a) return modifier ? inf : d + 1 + sampler(a, b) * _1h // >x.t
    return max(d + sampler(a, b) * _1h, x.t + _1m) // >x.t
  }
}

// within h hours of current time (x.t)
const within_hours = h => (x, t) => ok(x, t) ? t : x.t + h * uniform() * _1h

// at absolute time s, or in r days if already past time s
const after =
  s =>
  (x, t, r = 1) =>
    ok(x, t) ? t : s > x.t ? s : x.t + r

// at absolute times tJ
// may never fire if wrapped with condition false at trigger times
const times = (...tJ) => {
  tJ = flat(tJ).sort((a, b) => a - b)
  const J = tJ.length
  tJ.push(inf) // tJ[J]=inf simplifies logic below
  let j = -1 // outside storage to remember last index
  return (x, t) => {
    if (ok(x, t)) return t // otherwise either t==inf or t<=x.t
    if (j >= 0 && tJ[j] != t) j = -1 // reset if (t,j) inconsistent
    if (j == J) return inf // done
    j++
    while (tJ[j] <= x.t) j++
    return tJ[j]
  }
}

// at absolute times tJ offset by fixed hours h
const offset_times = (h, tJ) => times(tJ.map(t => t + h * _1h))

// generic macro for event that triggers "now" unconditionally
const do_now = (fx = x => {}, t = now()) =>
  do_(name(fx, fx._name ?? 'now'), times(t))

// auxiliary constants and functions (used above)
const ok = (x, t) => t > x.t && t < inf // is time ok?
const dx = x => ~~x.t
const hx = x => (x.t - dx(x)) * 24
const mx = x => {
  const h = hx(x)
  return (h - ~~h) * 60
}
const dhx = x => {
  const d = dx(x)
  return [d, (x.t - d) * 24]
}

// basic "increment" transition function
// probability args trigger coin flips to cancel event (return null)
// θ-based increment applied _last_ after other args (incl. flips)
// θ can be given as final function fθ(x) invoked only as needed
// non-last function returns are passed to subsequent functions fx(x,θ)
// returns last return value from last function arg (if any)
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
        if (ret === false || ret === null) return null // cancel on false|null
        continue
      } else ret = y = _pathify(y(x, ret)) // process as increment below
    }
    if (!defined(y)) continue // skip increment
    if (is_number(y) && y >= 0 && y <= 1) {
      // continue increments with prob. y
      if (flip(y)) continue
      return null
    }
    if (is_path(y)) _inc_path(x, y)
    else if (is_array(y)) _inc(x, ...y)
    else if (is_object(y)) _inc_obj(x, y)
    else if (is_string(y)) throw `invalid string argument '${y}' for _inc`
    else throw `invalid argument '${y}' for _inc`
  }
  return ret
}
// ~10x faster string path increment function
// supports only array.# (via _Path), not array[#]
const find_dot = str => {
  for (let i = 0; i < str.length; ++i) if (str[i] == '.') return i
  return -1
}
class _Path {
  constructor(str, dot = find_dot(str)) {
    this.head = dot < 0 ? str : str.slice(0, dot)
    this.tail = dot < 0 ? null : _pathify(str.slice(dot + 1))
  }
}
const is_path = x => x.constructor.name == '_Path'
const Path = (str, dot = find_dot(str)) => new _Path(str, dot)
window._path_cache ??= new Map()

const _pathify = x => {
  if (!is_string(x)) return x
  const dot = find_dot(x)
  if (dot < 0) return Path(x) // do not cache non-dot keys
  let path = _path_cache.get(x)
  if (!path) _path_cache.set(x, (path = Path(x, dot)))
  return path
}
const _inc_path = (x, y) => {
  if (!y.tail) x[y.head] = (x[y.head] || 0) + 1
  else _inc_path(x[y.head] || (x[y.head] = {}), y.tail)
}
const _inc_obj = (x, y) => {
  // each(entries(y), ([k,v])=>{
  // if (is_number(v)) x[k] = (x[k]||0) + v
  // else _inc_obj(x[k] || (x[k]={}), v)
  // })
  // enumerating keys(y) is faster ...
  each(keys(y), k => {
    const v = y[k]
    if (is_object(v)) _inc_obj(x[k] || (x[k] = {}), v)
    else x[k] = (x[k] || 0) + v // can be number, boolean, etc
  })
}

const toggle = (name, bool = true) =>
  inc(
    x => x[name] == !bool,
    x => {
      x[name] = bool
    }
  )

// time intervals (<1d) in days
const _1ms = 1 / (24 * 60 * 60 * 1000)
const _1s = 1 / (24 * 60 * 60)
const _1m = 1 / (24 * 60)
const _1h = 1 / 24

// event times are in "days" since reference date t0_monday_midnight
// we define "days" as (DST adjusted) _midnights_ + hours in local time
// NOTE: UTC times are not subject to DST but local times generally are
let t0_monday_midnight = new Date(2021, 0, 4)
// converts "date" object to event time, e.g. to initialize x.t
const event_time = (date = new Date()) => {
  const midnight = (d => (d.setHours(0, 0, 0, 0), d))(new Date(date))
  const days = Math.round(_1ms * (midnight - t0_monday_midnight))
  return days + _1ms * (date.getTime() - midnight)
}

// current time (in event time)
const now = () => event_time()

// last occurrence of specified hour before another time (or now)
const last_hour = (h, t = now()) => {
  const s = ~~t + h * _1h
  return s < t ? s : s - 1 // today or yesterday
}

// converts event time to date, e.g. to print events e or states x
const event_date = (t = now()) => {
  const date = new Date(t0_monday_midnight),
    midnights = ~~t
  date.setDate(t0_monday_midnight.getDate() + midnights)
  date.setTime(date.getTime() + (t - midnights) * 24 * 60 * 60 * 1000)
  return date
}

// date/time printing/parsing functions
const _02d = d3.format('02d')
const date_string = (d = new Date()) =>
  d.getFullYear() + '/' + _02d(d.getMonth() + 1) + '/' + _02d(d.getDate())
const time_string = (d = new Date()) =>
  _02d(d.getHours()) + ':' + _02d(d.getMinutes())
const date_time_string = (d = new Date()) =>
  date_string(d) + ' ' + time_string(d)
const parse_date_time = (date, time) => {
  if (date.includes(' ')) [date, time] = date.split(' ')
  const [year, month, day] = date.split('/').map(parseFloat)
  const [hour, minute] = time.split(':').map(parseFloat)
  return new Date(year, month - 1, day, hour, minute)
}
const parse_date = date => {
  const [year, month, day] = date.split('/').map(parseFloat)
  return new Date(year, month - 1, day, 0, 0)
}
// parses time prefix in text into numeric value
// returns in event time units (days since midnight) or undefined if invalid
const parse_time = text => {
  const [h, m] = text.match(/^(\d\d?):(\d\d)(?:\s|$)/)?.slice(1) || []
  if (h) return h * _1h + m * _1m // else undefined
}

// state clone/clean functions (to handle auxiliary state)
const clone_state = x =>
  clone_deep_with(x, (v, k) => (k && k[0] == '_' ? v : undefined))
const clean_state = x => omit_by(x, (v, k) => k && k[0] == '_')

// printing functions
const print_event = e => {
  const tstr = date_time_string(event_date(e.t))
  const is_now = tstr == date_time_string()
  const name =
    e._name || e._source._name || str(e._source._fx).replace(/\S+\s*=>\s*/g, '')
  const sfx = e._sfx || e._source?._sfx || e._source?._fx._sfx
  const is_observe = name.startsWith('observe_')
  // NOTE: search for 'box drawings' in character viewer
  const pfx = is_now ? '╋━▶︎' : is_observe ? '╋━▶︎' : '│──'
  const omit_props = ['t', '_source', '_elog', '_name', '_sfx']
  const attachments = entries(omit(e, omit_props)).map(
    ([k, v]) => k + ':' + (v?._name || str(v))
  )
  print(pfx, tstr, name, sfx, ...attachments)
}
const print_events = (x, tb = 0) => {
  assert(x._events, 'no _events to print')
  each(x._events.reverse(), e => e.t < tb || print_event(e))
}

const print_state = x => print(str(clean_state(x)))
const print_states = (x, tb = 0) => {
  assert(x._states, 'no _states to print')
  each(x._states.reverse(), x => x.t < tb || print_state(x))
}

const print_history = (x, tb = 0) => {
  const { _events, _states } = x
  assert(_events || _states, 'no history (_events|_states) to print')
  if (_events) print_events(x, tb)
  if (_states) print_states(x, tb)
}
