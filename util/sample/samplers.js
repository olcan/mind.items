// posterior sampler that samples uniformly in (x-r,x+r) w/ r=stdev
// clips and shifts region inside (a,b) to avoid asymmetry
// can be used for any bounded domain or prior sampler
const _uniform_posterior = (a, b, prior) => (f, x, stdev) => {
  if (stdev == 0) return prior(f) // degenerate sample
  const r = min((b - a) / 2, stdev)
  let ya = x - r
  let yb = x + r
  if (ya < a) (yb += a - ya), (ya = a)
  else if (yb > b) (ya -= yb - b), (yb = b)
  return f(ya + (yb - ya) * random())
}

// [uniform](https://en.wikipedia.org/wiki/Continuous_uniform_distribution) on `(a,b)`
// `undefined` if `a` or `b` non-number or infinite
// `null` (empty) if `a>=b`
function uniform(a, b) {
  // undefined if a or b non-number or infinite
  if (!is_number(a) || is_inf(a)) return undefined
  if (!is_number(b) || is_inf(b)) return undefined
  // empty (null) if a >= b
  if (a >= b) return null
  const dom = { gt: a, lt: b }
  dom._prior = f => f(a + (b - a) * random())
  dom._posterior = _uniform_posterior(a, b, dom._prior)
  dom._log_p = x => {
    if (x <= a || x >= b) return -inf
    return -log(b - a)
  }
  return dom
}

// [triangular](https://en.wikipedia.org/wiki/Triangular_distribution) on `(a,b)` w/ mode `c`
// `undefined` if `a` or `b` non-number or infinite
// `undefined` if `c` non-number or `c∉[a,b]`
// `null` (empty) if `a>=b`
function triangular(a, b, c) {
  // undefined if a or b non-number or infinite
  if (!is_number(a) || is_inf(a)) return undefined
  if (!is_number(b) || is_inf(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  if (!is_number(c) || c < a || c > b) return undefined
  const dom = { gt: a, lt: b }
  dom._prior = f => f(random_triangular(a, b, c))
  dom._posterior = _uniform_posterior(a, b, dom._prior)
  dom._log_p = x => {
    if (x <= a || x >= b) return -inf
    if (x < c) return log(2) + log(x - a) - log(b - a) - log(c - a)
    if (x == c) return log(2) - log(b - a)
    return log(2) + log(b - x) - log(b - a) - log(b - c)
  }
  return dom
}

// [beta](https://en.wikipedia.org/wiki/Beta_distribution) on `(a,b)` w/ mean `μ`, stdev `σ`
// `undefined` if `a` or `b` non-number or infinite
// `undefined` if `μ` non-number or `μ∉(a,b)`
// `undefined` if `σ` non-number or too large
function beta(a, b, μ, σ) {
  if (!is_number(a) || is_inf(a)) return undefined
  if (!is_number(b) || is_inf(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  if (!is_number(μ) || !is_number(σ)) return undefined
  // transform (a,b,μ,σ) to (ɑ,β) for standard Beta(ɑ,β) on (0,1)
  // see https://en.wikipedia.org/wiki/Beta_distribution#Four_parameters
  // (μ,σ) -> (ɑ,β) is also easily Solve'd in Mathematica
  const v = σ * σ
  const z = (a * b - a * μ - b * μ + μ * μ + v) / (v * (b - a))
  const ɑ = (a - μ) * z
  const β = -(b - μ) * z
  if (ɑ <= 0) return undefined // implies μ∉(a,b) or σ too large
  if (β <= 0) return undefined // implies μ∉(a,b) or σ too large
  const dom = { gt: a, lt: b }
  dom._prior = f => f(a + (b - a) * random_beta(ɑ, β))
  dom._posterior = _uniform_posterior(a, b, dom._prior)
  dom._log_p = x => {
    if (x <= a || x >= b) return -inf
    return (
      (ɑ - 1) * log(x - a) + // x -> x-a due to mapping into (a,b)
      (β - 1) * log(b - x) + // 1-x -> b-x due to mapping into (a,b)
      -(ɑ + β - 1) * log(b - a) + // jacobian factor due to scaling by (b-a)
      _log_gamma(ɑ + β) +
      -_log_gamma(ɑ) +
      -_log_gamma(β)
    )
  }
  return dom
}

function _benchmark_uniform() {
  benchmark(() => uniform(0, 1))
}
