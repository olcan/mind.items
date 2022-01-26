// create transition event `x → fx(x,…)`
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
const event = (fx, ft = midnight, fc = undefined, fθ = undefined) => ({
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

// do_(fx, [ft=midnight], [fc], [fθ])
// transition-first shorthand (alias)
const do_ = event

// schedule-first shorthand
const at_ = (ft, fx, fc = undefined, fθ = undefined) => event(fx, ft, fc, fθ)

// condition-schedule-first shorthand
const if_ = (fc, ft, fx, fθ = undefined) => event(fx, ft, fc, fθ)

// advance state `x` to time `x.t + δt`
// `eJ` can be array of events or object of named events
// if `strict` (default), excludes any events at `t > x.t+δt`
// includes any boundary events at `t == x.t+δt`
function advance(x, eJ, δt = 1, strict = true) {
  if (!is_array(eJ)) eJ = entries(eJ).map(([n, e]) => ((e._name = n), e))
  const t = x.t + δt
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

// basic state-independent (⊥x) scheduling functions

// next midnight
const midnight = (x, t) => (t > x.t && t < inf ? t : ~~x.t /*d*/ + 1) // >x.t

// next occurrence of hour h ∈ [0,24] (skips days for h>24)
const hour = h => (x, t) =>
  ok(x, t) ? t : ((t = dx(x) + h * _1h), t > x.t ? t : t + 1)

// next occurrence of random hour h ∈ [ha,hb]
// if already inside/past range same day, samples from next day
// default random sampler is uniform(a,b) but can be customized
// optional modifier(a,b,x,t) can modify range pre-sampling
// condition wrapper can control sampling time for modifier
function hours(ha, hb, sampler = uniform, modifier) {
  return (x, t) => {
    if (ok(x, t)) return t // either ⊥x or modifier disallowed
    const [a, b] = modifier ? modifier(ha, hb, x, t) : [ha, hb]
    const [d, h] = dhx(x)
    if (h >= a) return modifier ? inf : d + 1 + sampler(a, b) * _1h // >x.t
    return max(d + sampler(a, b) * _1h, x.t + _1m) // >x.t
  }
}

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

// time intervals (<1d) in days
const _1ms = 1 / (24 * 60 * 60 * 1000)
const _1s = 1 / (24 * 60 * 60)
const _1m = 1 / (24 * 60)
const _1h = 1 / 24

const clean_state = x => omit_by(x, (v, k) => k && k[0] == '_')

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

const toggle = (name, bool = true, ft = midnight) =>
  at_(
    ft,
    x => (x[name] = bool),
    x => x[name] == !bool
  )
