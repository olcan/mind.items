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
  const log_z = log(b - a) // z ⊥ x
  dom._log_p = x => (x <= a || x >= b ? -inf : -log_z)
  dom._posterior = _uniform_posterior(a, b, dom._prior)
  return dom
}

function _benchmark_uniform() {
  benchmark(() => uniform(0, 1))
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
  const log_z1 = log(b - a) + log(c - a) // - log(2) constant ⊥ (μ,σ) // z ⊥ x
  const log_z2 = log(b - a) + log(b - c) // - log(2) constant ⊥ (μ,σ) // z ⊥ x
  dom._log_p = x => {
    if (x <= a || x >= b) return -inf
    if (x <= c) return log(x - a) - log_z1
    return log(b - x) - log_z2 // x > c
  }
  dom._posterior = _uniform_posterior(a, b, dom._prior)
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
  const log_z =
    (ɑ + β - 1) * log(b - a) + // jacobian factor due to scaling by (b-a)
    _log_gamma(ɑ) +
    _log_gamma(β) -
    _log_gamma(ɑ + β)
  dom._log_p = x => {
    if (x <= a || x >= b) return -inf
    return (ɑ - 1) * log(x - a) + (β - 1) * log(b - x) - log_z
  }
  dom._posterior = _uniform_posterior(a, b, dom._prior)
  return dom
}

// [normal](https://en.wikipedia.org/wiki/Normal_distribution) on `(-∞,∞)` w/ mean `μ`, stdev `σ`
// `undefined` if `μ` non-number
// `undefined` if `σ` non-number or non-positive
function normal(μ, σ) {
  if (!is_number(μ)) return undefined
  if (!is_number(σ) || σ <= 0) return undefined
  const dom = { is: 'finite' } // all finite numbers
  dom._prior = f => f(μ + σ * random_normal())
  const inv_σ2 = 1 / (σ * σ)
  const log_z = log(σ) // + log(sqrt(2π) is constant ⊥ (μ,σ)
  dom._log_p = x => -0.5 * inv_σ2 * (x - μ) ** 2 - log_z
  // TODO: see #random/normal if this is too slow for prior far from data
  dom._posterior = (f, x, stdev) => f(x + (stdev || σ) * random_normal())
  return dom
}

// gamma log-density
function _gamma_log_p(x, ɑ, θ) {
  if (x <= 0) return -inf
  return (ɑ - 1) * log(x) - x / θ - _log_gamma(ɑ) - ɑ * log(θ)
}

function _gamma_mean_from_mode(c, σ) {
  if (!is_number(c) || c <= 0) return undefined
  if (!is_number(σ) || σ <= 0) return undefined
  // plug θ=(σ*σ)/μ and ɑ=(μ*μ)/(σ*σ) into c==(ɑ-1)*θ and solve for μ
  // note c>0 => μ>σ => ɑ>1 as expected from existence of mode c>0
  return 0.5 * (c + sqrt(c * c + 4 * σ * σ))
}

// [gamma](https://en.wikipedia.org/wiki/Gamma_distribution) on `(a,∞)` or `(-∞,a)` w/ mean `μ`, stdev `σ`
// domain is `(a,∞)` if `σ>0`, `(-∞,a)` if `σ<0`
// `undefined` if `a` non-number or infinite
// `undefined` if `μ` non-number or `μ==a`
// `undefined` if `σ` non-number or non-positive
function gamma(a, μ, σ) {
  if (!is_number(a) || is_inf(a)) return undefined
  if (!is_number(μ) || μ == a) return undefined
  if (!is_number(σ) || σ <= 0) return undefined
  const dom = μ > a ? { gt: a } : { lt: a }

  // shape-scale gamma((μ/σ)^2, σ^2/μ) has mean μ and stdev σ
  // here we take mean relative to a and reflect around a if μ<a
  const m = μ - a // signed mean relative to base a
  const s = (σ * σ) / m // signed gamma scale for mean m, stdev σ
  const ɑ = m / s // gamma shape for mean m, stdev σ (sign cancels)
  dom._prior = f => f(a + s * random_gamma(ɑ))
  dom._log_p = x => _gamma_log_p(abs(x - a), ɑ, abs(s))

  // posterior sampler has forced asymmetry due to half-bounded domain
  dom._posterior = (f, x, stdev) => {
    const σx = stdev ?? σ // posterior stdev, falling back to prior stdev
    const mx = x - a // signed mean x relative to base a
    const sx = (σx * σx) / mx // signed scale for mean mx, stdev σx
    const ɑx = mx / sx // shape for mean mx, stdev σx (sign cancels)
    const y = a + sx * random_gamma(ɑx) // new point y
    const σy = σx
    const my = y - a
    const sy = (σy * σy) / my
    const ɑy = my / sy
    const log_mw =
      _gamma_log_p(abs(mx), ɑy, abs(sy)) - // log(q(x|y))
      _gamma_log_p(abs(my), ɑx, abs(sx)) // log(q(y|x))
    return f(y, log_mw)
  }

  return dom
}
