// posterior sampler that samples uniformly in (x-r,x+r) w/ r=stdev
// can be used for any bounded domain or prior sampler
const _uniform_posterior = (a, b, prior) => (f, x, stdev) => {
  if (!stdev) return prior(f) // degenerate sample
  const r = min((b - a) / 2, stdev)
  const xa = max(x - r, a)
  const xb = min(x + r, b)
  const y = xa + (xb - xa) * random()
  const ya = max(y - r, a)
  const yb = min(y + r, b)
  // log(q(x|y)) - log(q(y|x))
  const log_mw = -log(yb - ya) - -log(xb - xa)
  return f(y, log_mw)
}

// [uniform](https://en.wikipedia.org/wiki/Continuous_uniform_distribution) on `(a,b)`
// `undefined` if `a` or `b` non-number or infinite
// `null` (empty) if `a>=b`
function uniform(a, b) {
  // undefined if a or b non-number or infinite
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  const dom = { gt: a, lt: b }
  dom._prior = f => f(a + (b - a) * random())
  const log_z = log(b - a) // z ⊥ x
  dom._log_p = x => (x <= a || x >= b ? -inf : -log_z)
  dom._posterior = _uniform_posterior(a, b, dom._prior)
  return dom
}

function _check_log_p_normalized(sampler, a, b) {
  const J = 1000000 // bit slow (20-150ms) but more strict
  const xJ = array(J)
  random_uniform_array(xJ, a, b)
  const pJ = apply(xJ, x => (b - a) * exp(sampler._log_p(x)))
  const σ = sqrt(variance(pJ) / J)
  // we tolerate 6.10941σ error (~one-in-a-billion test failure)
  check(() => [mean(pJ), 1, (a, b) => approx_equal(a, b, 6.10941 * σ)])
}

function _test_uniform() {
  _check_log_p_normalized(uniform(2, 5), 2, 5)
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
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  if (!is_finite(c) || c < a || c > b) return undefined
  const dom = { gt: a, lt: b }
  dom._prior = f => f(random_triangular(a, b, c))
  const log_z1 = log(b - a) + log(c - a) - log(2) // z ⊥ x
  const log_z2 = log(b - a) + log(b - c) - log(2) // z ⊥ x
  dom._log_p = x => {
    if (x <= a || x >= b) return -inf
    if (x <= c) return log(x - a) - log_z1
    return log(b - x) - log_z2 // x > c
  }
  dom._posterior = _uniform_posterior(a, b, dom._prior)
  return dom
}

function _test_triangular() {
  _check_log_p_normalized(triangular(2, 5, 3), 2, 5)
}

function _beta_mean_from_mode(a, b, c, σ) {
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  if (!is_finite(c) || c <= a || c >= b) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined

  // beta mean from mode requires solving a cubic
  // see e.g. https://stats.stackexchange.com/q/259149
  // we derive the cubic from Wikipedia expressions for (c, μ, v=σ^2) in Mathematica as Solve[{Eliminate[{c==(ɑ-1)/(ɑ+β-2),μ==ɑ/(ɑ+β),v==ɑ*β/((ɑ+β)^2*(1+ɑ+β))},{ɑ,β}]},μ,Reals], which gives cubic coefficients {1, -c-1, c+v, v-3*c*v} ...

  // map {c,σ} into (0,1)
  c = (c - a) / (b - a)
  σ = σ / (b - a)
  // solve cubic for μ, filter for (ɑ>1,β>1), validate c, map back into (a,b)
  const v = σ * σ
  const μR = solve_cubic(1, -c - 1, c + v, v - 3 * c * v)
  for (const μ of μR) {
    const z = (μ * (1 - μ)) / v - 1
    const ɑ = μ * z
    const β = (1 - μ) * z
    // c is mode in (0,1) iff ɑ>1 and β>1
    // if ɑ==1 and β==1, then ALL points (0,1) are modes
    // if ɑ<1 and β<1, then c is anti-mode against modes 0,1
    // if ɑ<1 and β>=1, mode is 0
    // if ɑ>=1 and β<1, mode is 1
    const cc = (μ * z - 1) / (z - 2) // test for c just in case
    if (ɑ > 1 && β > 1 && abs(cc - c) < 1e-6) return a + (b - a) * μ
  }
  return null
}

// [beta](https://en.wikipedia.org/wiki/Beta_distribution) on `(a,b)` w/ mean `μ`, stdev `σ`
// `undefined` if `a` or `b` non-number or infinite
// `undefined` if `μ` non-number or `μ∉(a,b)`
// `undefined` if `σ` non-number or non-positive or too large
function beta(a, b, μ, σ) {
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  if (!is_finite(μ) || μ <= a || μ >= b) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
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

function _test_beta() {
  _check_log_p_normalized(beta(2, 5, 3, 1), 2, 5)
}

// [normal](https://en.wikipedia.org/wiki/Normal_distribution) on `(-∞,∞)` w/ mean `μ`, stdev `σ`
// `undefined` if `μ` non-number or infinite
// `undefined` if `σ` non-number or infinite or `σ≤0`
function normal(μ, σ) {
  if (!is_finite(μ)) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  const dom = { is: 'finite' } // all finite numbers
  dom._prior = f => f(μ + σ * random_normal())
  const inv_σ2 = 1 / (σ * σ)
  const log_z = log(σ) + log(sqrt(2 * pi)) // z ⊥ x
  dom._log_p = x => -0.5 * inv_σ2 * (x - μ) ** 2 - log_z
  // TODO: see #random/normal if this is too slow for prior far from data
  dom._posterior = (f, x, stdev) => f(x + (stdev || σ) * random_normal())
  return dom
}

function _test_normal() {
  _check_log_p_normalized(normal(0, 1), -100, 100)
}

// gamma log-density
function _gamma_log_p(x, ɑ, θ) {
  if (x <= 0) return -inf
  return (ɑ - 1) * log(x) - x / θ - _log_gamma(ɑ) - ɑ * log(θ)
}

function _gamma_mean_from_mode(c, σ) {
  if (!is_finite(c) || c <= 0) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  // plug θ=(σ*σ)/μ and ɑ=(μ*μ)/(σ*σ) into c==(ɑ-1)*θ and solve for μ
  // note c>0 => μ>σ => ɑ>1 as expected from existence of mode c>0
  return 0.5 * (c + sqrt(c * c + 4 * σ * σ))
}

// [gamma](https://en.wikipedia.org/wiki/Gamma_distribution) on `(a,∞)` or `(-∞,a)` w/ mean `μ`, stdev `σ`
// domain is `(a,∞)` if `σ>0`, `(-∞,a)` if `σ<0`
// `undefined` if `a` non-number or infinite
// `undefined` if `μ` non-number or infinite or `μ==a`
// `undefined` if `σ` non-number or infinite or `σ≤0`
function gamma(a, μ, σ) {
  if (!is_finite(a)) return undefined
  if (!is_finite(μ) || μ == a) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
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

function _test_gamma() {
  _check_log_p_normalized(gamma(2, 5, 1), 2, 100)
}

// mixture(...samplers)
// [mixture](https://en.wikipedia.org/wiki/Mixture_distribution) on union domain `{or:samplers}`
function mixture(...sK) {
  if (!sK.length || !sK.every(s => s?._prior)) return undefined
  const dom = { or: sK }
  const log_pK = array(sK.length)
  dom._prior = f => random_element(sK)._prior(f)
  dom._log_p = x => {
    fill(log_pK, k => sK[k]._log_p(x))
    const max_log_p = max_in(log_pK)
    return max_log_p + log(mean(log_pK, log_p => exp(log_p - max_log_p)))
  }
  dom._posterior = (f, x, σ) => random_element(sK)._posterior(f, x, σ)
  return dom
}

function _test_mixture() {
  _check_log_p_normalized(
    mixture(
      uniform(2, 5),
      triangular(2, 5, 3),
      beta(2, 5, 3, 1),
      gamma(2, 5, 1)
    ),
    2,
    100
  )
}

// tuple(...samplers)
// independent samplers on product domain
function tuple(...args) {
  // handle special case of tuple(K, sk) as tuple(...array(K, sk))
  if (args.length == 2 && is_integer(args[0])) return tuple(...array(...args))
  const sK = args
  if (!sK.every(s => s?._prior)) return array(sK.length)
  sK._prior = f => f(copy(sK, s => s._prior(x => x)))
  sK._log_p = xK => sum(sK, (s, k) => s._log_p(xK[k]))
  sK._posterior = (f, xK, σK) =>
    f(copy(sK, (s, k) => s._posterior(y => y, xK[k], σK[k])))
  return sK
}

// [discrete uniform](https://en.wikipedia.org/wiki/Discrete_uniform_distribution) on arguments `xK`
// `undefined` if `xK` is empty
function uniform_discrete(...xK) {
  if (!xK.length) return undefined
  const K = xJ.length
  const dom = { in: xK }
  dom._prior = f => f(random_element(xK))
  const log_z = log(K) // z ⊥ x
  const xK_set = new Set(xK)
  dom._log_p = x => (!xK_set.has(x) ? -inf : -log_z)
  dom._posterior = f => f(random_element(xK))
  return dom
}
