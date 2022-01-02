// posterior sampler that samples uniformly in (x-r,x+r) w/ r=stdev
// clips and shifts region inside (a,b) to avoid asymmetry
// can be used for any bounded domain or prior sampler
const _uniform_posterior = (a, b) => (f, x, stdev) => {
  if (stdev == 0) return f(a + (b - a) * random()) // degenerate sample
  const r = min((b - a) / 2, stdev)
  let ya = x - r
  let yb = x + r
  if (ya < a) (yb += a - ya), (ya = a)
  else if (yb > b) (ya -= yb - b), (yb = b)
  return f(ya + (yb - ya) * random())
}

// uniform(a,b)
// uniform sampler on `(a,b)`
// undefined if `a` or `b` non-number or infinite
// null (empty) if `a>=b`
function uniform(a, b) {
  // undefined if a or b non-number or infinite
  if (!is_number(a) || is_inf(a)) return undefined
  if (!is_number(b) || is_inf(b)) return undefined
  // empty (null) if a >= b
  if (a >= b) return null
  return {
    gt: a,
    lt: b,
    _log_p: x => (x > a && x < b ? -log(b - a) : -inf),
    _prior: f => f(a + (b - a) * random()),
    _posterior: _uniform_posterior(a, b),
  }
}

// triangular(a,b,c)
// triangular sampler on `(a,b)` w/ mode `c`
// undefined if `a` or `b` non-number or infinite
// undefined if `c` non-number or `c∉[a,b]`
// null (empty) if `a>=b`
function triangular(a, b, c) {
  // undefined if a or b non-number or infinite
  if (!is_number(a) || is_inf(a)) return undefined
  if (!is_number(b) || is_inf(b)) return undefined
  if (!is_number(c) || c < a || c > b) return undefined
  // empty (null) if a >= b
  if (a >= b) return null
  return {
    gt: a,
    lt: b,
    _log_p: x => {
      if (x <= a) return -inf
      if (x < c) return log(2) + log(x - a) - log(b - a) - log(c - a)
      if (x == c) return log(2) - log(b - a)
      if (x < b) return log(2) + log(b - x) - log(b - a) - log(b - c)
      return -inf
    },
    _prior: f => {
      const u = random()
      if (u < (c - a) / (b - a)) return f(a + Math.sqrt(u * (b - a) * (c - a)))
      return f(b - Math.sqrt((1 - u) * (b - a) * (b - c)))
    },
    _posterior: _uniform_posterior(a, b),
  }
}

function _benchmark_uniform() {
  benchmark(() => uniform(0, 1))
}
