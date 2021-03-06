// posterior sampler that samples uniformly in (x-r,x+r) w/ r=stdev
// can be used for any bounded domain or prior sampler
const _uniform_posterior = (a, b, prior) => (f, x, stdev) => {
  if (!stdev) return prior(f) // degenerate sample
  const r = min((b - a) / 2, stdev) // chosen based on aps in examples
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
// `undefined` if `a` or `b` non-finite
// `null` (empty) if `a>=b`
function uniform(a, b) {
  // undefined if a or b non-finite
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  // return new Uniform(a, b)
  const dom = { gt: a, lt: b }
  dom._prior = f => f(a + (b - a) * random())
  const log_z = -log(b - a) // z ⊥ x
  // note _log_p can assume x inside domain, sampled via _prior or _posterior
  // density(x, domain) can be used to ensure -inf outside domain
  // dom._log_p = x => (x <= a || x >= b ? -inf : log_z)
  dom._log_p = x => log_z
  dom._posterior = _uniform_posterior(a, b, dom._prior)
  return dom
}

// Uniform class for testing alternate implementation for domains/samplers
class Uniform {
  constructor(a, b) {
    this.gt = a
    this.lt = b
  }
  _log_p(x) {
    const a = this.gt
    const b = this.lt
    // note _log_p can assume x inside domain, sampled via _prior or _posterior
    // density(x, domain) can be used to ensure -inf outside domain
    // otherwise we need x => (x <= a || x >= b ? -inf : log_z)
    return this.__log_p ?? define_value(this, '__log_p', -log(b - a))
  }
  _prior(f) {
    const a = this.gt
    const b = this.lt
    return f(a + (b - a) * random())
  }
  _posterior(f, x, stdev) {
    if (!stdev) return this._prior(f) // degenerate sample
    const a = this.gt
    const b = this.lt
    const r = min((b - a) / 2, stdev) // chosen based on aps in examples
    const xa = max(x - r, a)
    const xb = min(x + r, b)
    const y = xa + (xb - xa) * random()
    const ya = max(y - r, a)
    const yb = min(y + r, b)
    // log(q(x|y)) - log(q(y|x))
    const log_mw = -log(yb - ya) - -log(xb - xa)
    return f(y, log_mw)
  }
}

function _log_p_normalized(sampler, a, b) {
  const J = 1000000 // bit slow (20-150ms) but more strict
  const xJ = array(J)
  random_uniform_array(xJ, a, b)
  const pJ = apply(xJ, x => (b - a) * exp(density(x, sampler)))
  const σ = sqrt(variance(pJ) / J)
  return [
    mean(pJ),
    1,
    // we tolerate 6.10941σ error (~one-in-a-billion test failure)
    (a, b) => approx_equal(a, b, 6.10941 * σ),
  ]
}

function _test_uniform() {
  check(() => _log_p_normalized(uniform(2, 5), 2, 5))
}

function _benchmark_uniform() {
  benchmark(() => uniform(0, 1))
}

// [triangular](https://en.wikipedia.org/wiki/Triangular_distribution) on `(a,b)` w/ mode `c`
// `undefined` if `a` or `b` non-finite
// `undefined` if `c` non-number or `c∉[a,b]`
// `null` (empty) if `a>=b`
function triangular(a, b, c) {
  // undefined if a or b non-finite
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (!is_finite(c) || c < a || c > b) return undefined
  if (a >= b) return null // empty (null) if a >= b
  const dom = { gt: a, lt: b }
  dom._prior = f => f(random_triangular(a, b, c))
  const log_z1 = log(2) - log(b - a) - log(c - a) // z ⊥ x
  const log_z2 = log(2) - log(b - a) - log(b - c) // z ⊥ x
  dom._log_p = x => {
    // if (x <= a || x >= b) return -inf
    if (x <= c) return log(x - a) + log_z1
    return log(b - x) + log_z2 // x > c
  }
  dom._posterior = _uniform_posterior(a, b, dom._prior)
  return dom
}

function _test_triangular() {
  check(() => _log_p_normalized(triangular(2, 5, 3), 2, 5))
}

function _beta_mean_from_mode(a, b, c, σ) {
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (!is_finite(c) || c <= a || c >= b) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  if (a >= b) return null // empty (null) if a >= b

  // beta mean from mode requires solving a cubic
  // see e.g. https://stats.stackexchange.com/q/259149
  // we derive the cubic from Wikipedia expressions for (c, μ, v=σ^2) in Mathematica as Solve[{Eliminate[{c==(α-1)/(α+β-2),μ==α/(α+β),v==α*β/((α+β)^2*(1+α+β))},{α,β}]},μ,Reals], which gives cubic coefficients {1, -c-1, c+v, v-3*c*v} ...

  // map {c,σ} into (0,1)
  c = (c - a) / (b - a)
  σ = σ / (b - a)
  // solve cubic for μ, filter for (α>1,β>1), validate c, map back into (a,b)
  const v = σ * σ
  const μR = solve_cubic(1, -c - 1, c + v, v - 3 * c * v)
  for (const μ of μR) {
    const z = (μ * (1 - μ)) / v - 1
    const α = μ * z
    const β = (1 - μ) * z
    // c is mode in (0,1) iff α>1 and β>1
    // if α==1 and β==1, then ALL points (0,1) are modes
    // if α<1 and β<1, then c is anti-mode against modes 0,1
    // if α<1 and β>=1, mode is 0
    // if α>=1 and β<1, mode is 1
    const cc = (μ * z - 1) / (z - 2) // test for c just in case
    if (α > 1 && β > 1 && abs(cc - c) < 1e-6) return a + (b - a) * μ
  }
  return null
}

// [beta](https://en.wikipedia.org/wiki/Beta_distribution) on `(a,b)` w/ mean `μ`, stdev `σ`
// `undefined` if `a` or `b` non-finite
// `undefined` if `μ` non-number or `μ∉(a,b)`
// `undefined` if `σ` non-number or non-positive or too large
// `null` (empty) if `a>=b`
function beta(a, b, μ, σ) {
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (!is_finite(μ) || μ <= a || μ >= b) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  if (a >= b) return null // empty (null) if a >= b
  // transform (a,b,μ,σ) to (α,β) for standard Beta(α,β) on (0,1)
  // see https://en.wikipedia.org/wiki/Beta_distribution#Four_parameters
  // (μ,σ) -> (α,β) is also easily Solve'd in Mathematica
  const v = σ * σ
  const z = (a * b - a * μ - b * μ + μ * μ + v) / (v * (b - a))
  const α = (a - μ) * z
  const β = -(b - μ) * z
  if (α <= 0 || β <= 0) return undefined // implies μ∉(a,b) or σ too large
  return _beta_αβ(a, b, α, β)
}

// [beta](https://en.wikipedia.org/wiki/Beta_distribution) on `(a,b)`
// `undefined` if `a` or `b` non-finite
// `undefined` if `α` or `β` non-number or non-positive
// `null` (empty) if `a>=b`
function beta_αβ(a, b, α, β) {
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  if (!is_finite(a) || α <= 0) return undefined
  if (!is_finite(β) || β <= 0) return undefined
  return _beta_αβ(a, b, α, β)
}

function _beta_αβ(a, b, α, β) {
  const dom = { gt: a, lt: b }
  dom._prior = f => f(a + (b - a) * random_beta(α, β))
  const log_z =
    _log_gamma(α + β) -
    (α + β - 1) * log(b - a) - // jacobian factor due to scaling by (b-a)
    _log_gamma(α) -
    _log_gamma(β)
  dom._log_p = x => {
    // if (x <= a || x >= b) return -inf
    return (α - 1) * log(x - a) + (β - 1) * log(b - x) + log_z
  }
  dom._posterior = _uniform_posterior(a, b, dom._prior)
  return dom
}

function _test_beta() {
  check(() => _log_p_normalized(beta(2, 5, 3, 1), 2, 5))
}

// [normal](https://en.wikipedia.org/wiki/Normal_distribution) on `(-∞,∞)` w/ mean `μ`, stdev `σ`
// `undefined` if `μ` non-finite
// `undefined` if `σ` non-finite or `σ≤0`
function normal(μ, σ) {
  if (!is_finite(μ)) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  // return new Normal(μ, σ)
  const dom = { is: 'finite' } // all finite numbers
  dom._prior = f => f(μ + σ * random_normal())
  const inv_σ2 = 1 / (σ * σ)
  const log_z = -log(σ) - log(sqrt(2 * pi)) // z ⊥ x
  dom._log_p = x => -0.5 * inv_σ2 * (x - μ) ** 2 + log_z
  // TODO: see #random/normal if this is too slow for prior far from data
  dom._posterior = (f, x, stdev) => f(x + (stdev || σ) * random_normal())
  return dom
}

// Normal class for testing alternate implementation for domains/samplers
class Normal {
  constructor(μ, σ) {
    this.is = 'finite'
    this._μ = μ
    this._σ = σ
  }
  _log_p(x) {
    this._inv_σ2 ??= 1 / (this._σ * this._σ)
    this._log_z ??= -log(this._σ) - log(sqrt(2 * pi)) // z ⊥ x
    return -0.5 * this._inv_σ2 * (x - this._μ) ** 2 + this._log_z
  }
  _prior(f) {
    return f(this._μ + this._σ * random_normal())
  }
  _posterior(f, x, stdev) {
    return f(x + (stdev || this._σ) * random_normal())
  }
}

function _test_normal() {
  check(() => _log_p_normalized(normal(0, 1), -100, 100))
}

// gamma log-density
function _gamma_log_p(x, α, θ) {
  if (x <= 0) return -inf
  return (α - 1) * log(x) - x / θ - _log_gamma(α) - α * log(θ)
}

function _gamma_mean_from_mode(c, σ) {
  if (!is_finite(c) || c <= 0) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  // plug θ=(σ*σ)/μ and α=(μ*μ)/(σ*σ) into c==(α-1)*θ and solve for μ
  // note c>0 => μ>σ => α>1 as expected from existence of mode c>0
  return 0.5 * (c + sqrt(c * c + 4 * σ * σ))
}

// [gamma](https://en.wikipedia.org/wiki/Gamma_distribution) on `(a,∞)` or `(-∞,a)` w/ mean `μ`, stdev `σ`
// domain is `(a,∞)` if `μ>a`, `(-∞,a)` if `μ<a`
// [exponential](https://en.wikipedia.org/wiki/Exponential_distribution) iff `σ==abs(μ-a)`
// `undefined` if `a` non-finite
// `undefined` if `μ` non-finite or `μ==a`
// `undefined` if `σ` non-finite or `σ≤0`
function gamma(a, μ, σ) {
  if (!is_finite(a)) return undefined
  if (!is_finite(μ) || μ == a) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  const dom = μ > a ? { gt: a } : { lt: a }

  // shape-scale gamma((μ/σ)^2, σ^2/μ) has mean μ and stdev σ
  // here we take mean relative to a and reflect around a if μ<a
  const m = μ - a // signed mean relative to base a
  const s = (σ * σ) / m // signed gamma scale for mean m, stdev σ
  const α = m / s // gamma shape for mean m, stdev σ (sign cancels)
  dom._prior = f => f(a + s * random_gamma(α))
  dom._log_p = x => _gamma_log_p(abs(x - a), α, abs(s))

  // posterior sampler has forced asymmetry due to half-bounded domain
  dom._posterior = (f, x, stdev) => {
    const σx = stdev ?? σ // posterior stdev, falling back to prior stdev
    const mx = x - a // signed mean x relative to base a
    const sx = (σx * σx) / mx // signed scale for mean mx, stdev σx
    const αx = mx / sx // shape for mean mx, stdev σx (sign cancels)
    const y = a + sx * random_gamma(αx) // new point y
    const σy = σx
    const my = y - a
    const sy = (σy * σy) / my
    const αy = my / sy
    const log_mw =
      _gamma_log_p(abs(mx), αy, abs(sy)) - // log(q(x|y))
      _gamma_log_p(abs(my), αx, abs(sx)) // log(q(y|x))
    return f(y, log_mw)
  }

  return dom
}

function _test_gamma() {
  check(() => _log_p_normalized(gamma(2, 5, 1), 2, 100))
}

// [exponential](https://en.wikipedia.org/wiki/Exponential_distribution) on `(a,∞)` or `(-∞,a)` w/ mean `μ`
// domain is `(a,∞)` if `μ>a`, `(-∞,a)` if `μ<a`
// `undefined` if `a` non-finite
// `undefined` if `μ` non-finite or `μ==a`
const exponential = (a, μ) => gamma(a, μ, abs(μ - a))

// [constant](https://en.wikipedia.org/wiki/Degenerate_distribution#Constant_random_variable) at `x`
// `undefined` if `x` is undefined
function constant(x) {
  if (!defined(x) || is_nan(x)) return undefined
  const dom = { equal: x }
  dom._prior = f => f(x)
  dom._log_p = x => 0
  // posterior can be omitted for constant w/ log_p(x)==0
  // dom._posterior = f => f(x)
  return dom
}

// [uniform](https://en.wikipedia.org/wiki/Discrete_uniform_distribution) on arguments `xK`
// `undefined` if `xK` is empty
function uniform_discrete(...xK) {
  if (xK.length == 1 && is_array(xK[0])) xK = xK[0]
  const K = xK.length
  const dom = { in_equal: xK }
  dom._prior = f => f(random_element(xK))
  const log_z = -log(K) // z ⊥ x
  dom._log_p = x => log_z
  dom._posterior = f => f(random_element(xK))
  return dom
}

function _discrete_log_p_normalized(sampler, xK) {
  const pJ = xK.map(x => exp(density(x, sampler)))
  return [sum(pJ), 1, approx_equal]
}

function _test_uniform_discrete() {
  const xK = range(5, 10)
  check(() => _discrete_log_p_normalized(uniform_discrete(...xK), xK))
}

// [uniform](https://en.wikipedia.org/wiki/Discrete_uniform_distribution) on integers `{a,…,b}`
// `undefined` if `a` or `b` non-integer
// `null` (empty) if `a>b`
function uniform_integer(a, b) {
  if (!is_integer(a) || !is_integer(b)) return undefined
  if (a > b) return null // empty (null) if a > b
  const dom = { gte: a, lte: b, is: 'integer' }
  const K = b - a + 1
  dom._prior = f => f(a + ~~(random() * K))
  const log_z = -log(K) // z ⊥ x
  dom._log_p = x => log_z
  dom._posterior = f => f(a + ~~(random() * K))
  return dom
}

function _test_uniform_integer() {
  check(() => _discrete_log_p_normalized(uniform_integer(5, 10), range(5, 11)))
}

// log-binomial-coefficient in terms of gamma functions
// see https://en.wikipedia.org/wiki/Binomial_coefficient#Two_real_or_complex_valued_arguments
const _log_binomial = (n, k) =>
  _log_gamma(n + 1) - _log_gamma(k + 1) - _log_gamma(n - k + 1)

// [binomial](https://en.wikipedia.org/wiki/Binomial_distribution) on integers `{a,…,b}`
// `undefined` if `a` or `b` non-integer
// `undefined` if `μ` non-number or `μ∉[a,b]`
// `null` (empty) if `a>b`
function binomial(a, b, μ) {
  if (!is_integer(a) || !is_integer(b)) return undefined
  if (!is_finite(μ) || μ < a || μ > b) return undefined
  if (a > b) return null // empty (null) if a > b
  if (a == b) return uniform_integer(a, b)
  const dom = { gte: a, lte: b, is: 'integer' }
  const n = b - a
  const p = clip((μ - a) / (b - a))
  dom._prior = f => f(a + random_binomial(n, p))
  const lp = log(p)
  const l1p = log1p(-p)
  dom._log_p = x => ((x -= a), (n - x) * l1p + x * lp + _log_binomial(n, x))
  dom._posterior = f => f(a + random_binomial(n, p))
  return dom
}

function _test_binomial() {
  check(() => _discrete_log_p_normalized(binomial(5, 10, 7), range(5, 11)))
}

// [uniform](https://en.wikipedia.org/wiki/Discrete_uniform_distribution) on booleans `{false,true}`
function uniform_boolean() {
  const dom = { is: 'boolean' }
  dom._prior = f => f(random() < 0.5)
  const log_z = -log(2) // z ⊥ x
  dom._log_p = x => log_z
  dom._posterior = f => f(random() < 0.5)
  return dom
}

function _test_uniform_boolean() {
  check(() => _discrete_log_p_normalized(uniform_boolean(), [false, true]))
}

// [uniform](https://en.wikipedia.org/wiki/Discrete_uniform_distribution) on `{0,1}`
function uniform_binary() {
  const dom = { is: 'binary' }
  dom._prior = f => f(random() < 0.5 ? 1 : 0)
  const log_z = -log(2) // z ⊥ x
  dom._log_p = x => log_z
  dom._posterior = f => f(random() < 0.5 ? 1 : 0)
  return dom
}

function _test_uniform_binary() {
  check(() => _discrete_log_p_normalized(uniform_binary(), [0, 1]))
}

// mixture(...samplers)
// [mixture](https://en.wikipedia.org/wiki/Mixture_distribution) on union domain `{or:samplers}`
function mixture(...sK) {
  if (sK.length == 1 && is_array(sK[0])) sK = sK[0]
  if (sK.length == 1) return sK[0]
  const dom = { or: sK }
  // return plain {or} domain if all domains are non-samplers
  const num_samplers = sum_of(sK, s => !!s?._prior)
  if (num_samplers == 0) return dom
  // disallow mixing non-samplers w/ samplers
  if (!(num_samplers == sK.length))
    fatal('invalid mixture contains non-samplers')
  const log_pK = array(sK.length)
  dom._prior = f => random_element(sK)._prior(f)
  dom._log_p = x => {
    fill(log_pK, k => density(x, sK[k]))
    const max_log_p = max_in(log_pK)
    return max_log_p + log(mean(log_pK, log_p => exp(log_p - max_log_p)))
  }
  // TODO: properly handle (or disallow) overlapping domains & per-domain σ
  dom._posterior = (f, x, σ) => sK.find(s => from(x, s))._posterior(f, x, σ)
  return dom
}

function _test_mixture() {
  check(() =>
    _log_p_normalized(
      mixture(
        uniform(2, 5),
        triangular(2, 5, 3),
        beta(2, 5, 3, 1),
        gamma(2, 5, 1)
      ),
      2,
      100
    )
  )
}

// tuple(...samplers)
// independent samplers on product domain
function tuple(...args) {
  // handle special case tuple(K, sk) as tuple(...array(K, sk))
  if (args.length == 2 && is_integer(args[0])) return tuple(array(...args))
  // handle single array argument
  if (args.length == 1 && is_array(args[0])) args = args[0]
  const sK = args
  // if any argument is undefined, return undefined array of same size
  if (!sK.every(defined)) return array(sK.length)
  // check that all arguments are valid samplers w/ _prior defined
  if (sK.some(s => !s._prior)) fatal('invalid arguments for tuple')
  sK._prior = f => f(copy(sK, s => s._prior(x => x)))
  sK._log_p = xK => sum(sK, (s, k) => s._log_p(xK[k]))
  sK._posterior = (f, xK, σK) =>
    f(copy(sK, (s, k) => s._posterior(y => y, xK[k], σK[k])))
  return sK
}
