// create transition event
// transition `x→fx(x,…)` happens at scheduled time `ft(x,…)`
// schedule can depend on state, can be _never_ (`inf`)
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
    const ret = this.fx(x, θ) // use e.fx in case fx modified
    check(x.t == t, 'e.fx should not change x.t')
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
