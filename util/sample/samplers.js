// uniform(a,b)
// uniform sampler on `(a,b)`
// undefined if `a` or `b` non-number or infinite
// null (empty) if `a>=b`
function uniform(a, b) {
  // undefined if non-number or infinite args
  if (!is_number(a) || is_inf(a)) return undefined
  if (!is_number(b) || is_inf(b)) return undefined
  // empty (null) if a >= b
  if (a >= b) return null
  return {
    gte: a,
    lt: b,
    _log_p: x => (x >= a && x < b ? -log(b - a) : -inf),
    _prior: f => f(a + (b - a) * random()),
    _posterior: (f, x, stdev) => {
      const u = random()
      // stdev can be 0 w/ single positive-weight point
      if (stdev == 0) return f(a + (b - a) * u)
      // sample around x w/ random radius proportional to stdev
      // shift sampling region inside (a,b) to avoid asymmetry in x<->y
      const r = min((b - a) / 2, stdev)
      let ya = x - r
      let yb = x + r
      if (ya < a) (yb += a - ya), (ya = a)
      else if (yb > b) (ya -= yb - b), (yb = b)
      return f(ya + (yb - ya) * u)
    },
  }
}

// TODO: drop "transform" for now, instead make uniform and triangular open-domain and gamma w/ translation/negation support, and normal; implement and benchmark positive_random

// TODO: new samplers: transform, gamma, normal, ...

function _benchmark_uniform() {
  benchmark(() => uniform(0, 1))
}
