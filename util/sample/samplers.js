// posterior sampler that samples uniformly in (x-r,x+r) w/ r=stdev
// can be used for any bounded domain or prior sampler
const _uniform_posterior =
  (a, b, prior) =>
  (f, x, { stdev }) => {
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
// `undefined` if `a` or `b` non-finite, `null` (empty) if `a>=b`
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
    return this.__log_p ?? define_value(this, '__log_p', -log(b - a)).__log_p
  }
  _prior(f) {
    const a = this.gt
    const b = this.lt
    return f(a + (b - a) * random())
  }
  _posterior(f, x, { stdev }) {
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
// `undefined` if `μ` or `σ` non-finite, or `σ≤0`
function normal(μ, σ) {
  if (!is_finite(μ)) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  // return new Normal(μ, σ)
  const dom = { is: 'finite' } // all finite numbers
  dom._prior = f => f(μ + σ * random_normal())
  const inv_σ2 = 1 / (σ * σ)
  const log_z = -log(σ) - log(sqrt(2 * pi)) // z ⊥ x
  // note constant factors are optimized away by js interpreter
  dom._log_p = x => -0.5 * inv_σ2 * (x - μ) ** 2 + log_z
  // TODO: see #random/normal if this is too slow for prior far from data
  // TODO: should we do something else using custom _stats for multimodal samples?
  dom._posterior = (f, x, { stdev }) => f(x + (stdev || σ) * random_normal())
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
  _posterior(f, x, { stdev }) {
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
// `undefined` if `a` or `μ` or `σ` non-finite, `μ==a`, or `σ≤0`
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
  dom._posterior = (f, x, { stdev }) => {
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
// `undefined` if `a` or `μ` non-finite, or `μ==a`
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
// `null` (empty) if `a>=b`
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
  sK._posterior = (f, xK, { stdev }) =>
    f(copy(sK, (s, k) => s._posterior(y => y, xK[k], { stdev: stdev[k] })))
  return sK
}

// create tensor of `shape` from `data`
// can be `Number` (scalar), `TypedArray` (1d), or `Array` (2d+)
// has properties `_tensor`, `_data`, `_shape`, `_sorted`, `_blocks`
function tensor(
  shape,
  data,
  sorted = false,
  blocks = null,
  level = 0,
  offset = 0
) {
  let obj
  if (shape.length == 0) {
    if (data.length != 1) throw new Error('tensor (scalar) data/shape mismatch')
    obj = new Number(data[0]) // scalar
  } else if (level == shape.length - 1) {
    if (shape.length == 1 && shape[0] != data.length)
      throw new Error('tensor (1d) data/shape mismatch')
    obj = data.subarray(offset, offset + _.last(shape)) // 1d array
  } else {
    // 2+ dimensional tensor
    obj = new Array(shape[level])
    if (!blocks) {
      blocks = shape.slice(1) // top-level block is implicit as data.length
      for (let d = blocks.length - 2; d >= 0; --d) blocks[d] *= blocks[d + 1]
      if (shape[0] * blocks[0] != data.length)
        throw new Error(`tensor (${shape.length}d) data/shape mismatch`)
    }
    for (let i = 0; i < shape[level]; ++i)
      obj[i] = tensor(
        shape,
        data,
        sorted,
        blocks,
        level + 1,
        offset + i * blocks[level]
      )
  }
  if (level == 0) {
    assign(obj, {
      _tensor: true,
      _shape: shape,
      _data: data,
      _sorted: sorted,
      _blocks: blocks,
    })
    if (!is_boolean(sorted) && !(is_array(sorted) && sorted.every(is_integer)))
      throw new Error('invalid sort spec, must be boolean or array of integers')
    if (sorted) _sort_tensor(obj, is_array(sorted) ? sorted : [0])
  }
  return obj
}

const is_tensor = x => x?._tensor

// sorts tensor at specified levels, comparing from left to right (to break ties)
function _sort_tensor(tensor, levels = [0], level = 0) {
  if (!is_array(tensor)) return tensor // can not sort scalar
  each(tensor, child => _sort_tensor(child, levels, level + 1))
  if (!levels.includes(level)) return tensor // skip this level
  return sort(tensor, _compare_tensors)
}

// comparator function for _sort_tensor
function _compare_tensors(a, b) {
  if (is_typed_array(a)) {
    // typed array, compare elements numerically
    for (let i = 0; i < a.length; ++i) {
      const d = a[i] - b[i]
      if (d) return d
    }
  } else {
    // untyped array, compare elements using _compare_tensors
    for (let i = 0; i < a.length; ++i) {
      const d = _compare_tensors(a[i], b[i])
      if (d) return d
    }
  }
  return 0
}

// [normal](https://en.wikipedia.org/wiki/Normal_distribution) tensor on `(-∞,∞)^…^…`
// independent scalars on `(-∞,∞)` w/ mean `μ`, stdev `σ`
// `undefined` if `shape` is invalid, `μ` or `σ` non-finite, or `σ≤0`
// can be `sorted` to force deterministic ordering at top level (`0`)
// `sorted` can be an array of integers to sort multiple levels (`0,1,2,…`)
// sorting avoids pitfalls due to non-identifiable orderings or (index) assignments
// non-identifiable orderings/assignments are indistinguishable wrt observed weights
// see #//examples/15 for detailed discussion & other solutions (e.g. conditioning)
function normal_tensor(shape = [], μ = 0, σ = 1, sorted = false) {
  if (!shape.every?.(is_integer)) return undefined
  if (!is_finite(μ)) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined

  const dom = {}
  dom._from = x =>
    is_tensor(x) && equal(x._shape, shape) && x._data instanceof Float32Array
  const D = shape.reduce((a, b) => a * b, 1) // size from shape
  const prior_transform = μ == 0 && σ == 1 ? null : x => μ + x * σ
  dom._prior = f => f(_random_normal_tensor(shape, D, prior_transform, sorted))

  const inv_σ2 = 1 / (σ * σ)
  const log_z = (-log(σ) - log(sqrt(2 * pi))) * D // z ⊥ x
  dom._log_p = x => -0.5 * inv_σ2 * sum(x._data, x => (x - μ) ** 2) + log_z

  // custom _stats that can be faster as it can assume all values are defined
  // it can also precompute "scaled" stdev for random walk in R dimensions
  // prevents prob. jump towards mode (point) tending to zero for large R
  // cancels out R in exponent ∝ R * (x-μ)^2 for spherical normal jumps
  // see https://www.wolframcloud.com/env/olcans/HypersphereIntersection.nb
  // TODO: should we do something else here to handle multimodal samples?
  dom._stats = (k, value, { xJK, rwJ }) => {
    const J = rwJ.length
    const W_inv = 1 / sum(rwJ)
    const sD = new Float32Array(D)
    const ssD = new Float32Array(D)
    for (let j = 0; j < J; ++j) {
      const xD = xJK[j][k]._data
      const w = rwJ[j] * W_inv
      for (let d = 0; d < D; ++d) {
        sD[d] += xD[d] * w
        ssD[d] += xD[d] * xD[d] * w
      }
    }
    const stdevD = apply(sub(ssD, mul(sD, sD)), v => (v >= 1e-12 ? sqrt(v) : σ))
    return { scaled_stdev: scale(stdevD, 1 / sqrt(D)) }
  }

  dom._posterior = (f, x, { scaled_stdev }) =>
    f(
      _random_normal_tensor(
        shape,
        D,
        (y, d) => x._data[d] + y * scaled_stdev[d],
        sorted
      )
    )
  return dom
}

let __random_normal_data
const _random_normal_tensor = (shape, size, f, sorted) => {
  // const data = random_array(new Float32Array(size), random_normal)
  if (!__random_normal_data || __random_normal_data.length < size * 2)
    __random_normal_data = random_array(
      new Float32Array(size * 10),
      random_normal
    )
  const offset = random_discrete_uniform(__random_normal_data.length - size)
  const data = __random_normal_data.subarray(offset, offset + size)
  return tensor(shape, f ? data.map(f) : data, sorted)
}

// [uniform](https://en.wikipedia.org/wiki/Discrete_uniform_distribution) tensor on `{a,…,b}^…^…`
// `undefined` if `shape` is invalid or `a` or `b` non-integer, `null` (empty) if `a>=b`
// can be `sorted` to force deterministic ordering at top level (`0`)
// `sorted` can be an array of integers to sort multiple levels (`0,1,2,…`)
function uniform_integer_tensor(shape = [], a = 0, b = 1, sorted = false) {
  if (!shape.every?.(is_integer)) return undefined
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (a >= b) return null

  const dom = {}
  // TODO: do you want to allow Float32Array if it is more efficient to work with?
  //       (if so, you should make type an argument for all tensor samplers)
  const Type = a >= 0 ? Uint32Array : Int32Array
  dom._from = x =>
    is_tensor(x) &&
    equal(x._shape, shape) &&
    x._data instanceof Type &&
    x.every(v => v >= a && v <= b)

  const D = shape.reduce((a, b) => a * b, 1) // size from shape
  const I = b - a + 1 // to be multiplied into continuous uniform on [0,1)
  dom._prior = f =>
    f(_random_uniform_tensor(shape, D, u => a + ~~(u * I), Type, sorted))

  const log_z = -log(I) * D // z ⊥ x
  dom._log_p = x => log_z

  // custom _stats that can be faster as it can assume all values are defined
  const wi_base = 1 / I // uniform base weight for posterior sampler
  dom._stats = (k, value, { xJK, rwJ, rwj_sum }) => {
    const J = rwJ.length
    const wDI = array(D, () => new Float32Array(I).fill(wi_base))
    for (let j = 0; j < J; ++j) {
      const xD = xJK[j][k]._data
      const w = rwJ[j]
      for (let d = 0; d < D; ++d) wDI[d][xD[d] - a] += w
    }
    return { wDI, wi_sum: rwj_sum }
  }

  const p_stay = 0.5 // p(stay)
  dom._posterior = (f, x, { wDI, wi_sum }) =>
    f(
      _random_uniform_tensor(
        shape,
        D,
        (u, d) => {
          if (random_boolean(p_stay)) return x._data[d]
          // logic from random_discrete in #util/stat
          // return random_discrete(wDI[d], wi_sum)
          const wI = wDI[d]
          let i = 0
          let w = 0
          let wt = u * wi_sum
          do {
            w += wI[i++]
          } while (w < wt && i < I)
          return i - 1
        },
        Type,
        sorted
      )
    )
  return dom
}

let __random_uniform_data
const _random_uniform_tensor = (shape, size, transform, Type, sorted) => {
  if (!__random_uniform_data || __random_uniform_data.length < size * 2)
    __random_uniform_data = random_array(new Float32Array(size * 10))
  const offset = random_discrete_uniform(__random_uniform_data.length - size)
  let data = __random_uniform_data.subarray(offset, offset + size)
  if (transform || !(data instanceof Type))
    data = copy(new Type(size), data, transform)
  return tensor(shape, data, sorted)
}
