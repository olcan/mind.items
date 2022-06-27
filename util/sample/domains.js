// `x∈(a,b)`
// can be _unbounded_ (`±inf`) on either side
// sampler depends on (may require) additional `options`:
// | `mean` or `μ`  | prior mean
// | `mode` or `c`  | prior mode (supersedes `mean`)
// | `stdev` or `σ` | prior standard deviation
// \
// | **interval** | **options**      | **sampler**
// | `(a,b)`      |                  | `uniform(a,b)`
// | `(a,b)`      | `c`              | `triangular(a,b,c)`
// | `(a,b)`      | `σ`, `μ|c`       | `beta(a,b,μ,σ)`
// | `(a,∞)`      | `μ|c > a`, `[σ]` | `gamma(a,μ,σ)`
// | `(-∞,b)`     | `μ|c < b`, `[σ]` | `gamma(b,μ,σ)`
// | `(-∞,∞)`     | `μ|c`, `σ`       | `normal(μ,σ)`
// default `σ` for half-bounded interval is distance to bound
// gamma sampler w/ default `σ` is exponential special case
// `undefined` if `a` or `b` non-number
// `null` (empty) if `a>=b`
const interval = (a, b, options = undefined) => {
  // undefined if a or b non-number
  if (!is_number(a) || !is_number(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  // bounded interval is uniform or triangular if mode (c) specified
  if (is_finite(a) && is_finite(b)) {
    let c, μ, σ
    if (options) {
      c = options.mode ?? options.c
      μ = options.mean ?? options.μ
      σ = options.stdev ?? options.σ
    }
    if (defined(σ)) {
      // mode supercedes mean if both are specified
      if (defined(c)) μ = _beta_mean_from_mode(a, b, c, σ) // can be null
      return beta(a, b, μ, σ)
    }
    if (defined(c)) return triangular(a, b, c)
    return uniform(a, b)
  }
  // unbounded interval is normal w/ `μ|c` and `σ` required
  if (is_inf(a) && is_inf(b)) {
    let μ, σ
    if (options) {
      μ = options.mean ?? options.μ ?? options.mode ?? options.c
      σ = options.stdev ?? options.σ
    }
    // note we disable assertions in favor of returning undefined domains
    // if (!(defined(μ))) fatal( 'missing mean or mode for unbounded interval')
    // if (!(defined(σ))) fatal( 'missing stdev for unbounded interval')
    return normal(μ, σ)
  }
  // half-bounded interval is gamma w/ `μ|c` and `σ` required
  let c, μ, σ
  if (options) {
    c = options.mode ?? options.c
    μ = options.mean ?? options.μ
    σ = options.stdev ?? options.σ
  }
  a = is_finite(a) ? a : b // gamma base
  // if (!(defined(μ ?? c))) fatal( 'missing mean or mode for half-bounded interval')
  // if (!(defined(σ))) fatal( 'missing stdev for half-bounded interval')
  // mode supercedes mean if both are specified
  if (defined(c)) {
    σ ??= abs(c - a) // default sigma is distance to bound
    μ = a + sign(c - a) * _gamma_mean_from_mode(abs(c - a), σ)
  }
  σ ??= abs(μ - a) // default sigma is distance to bound
  return gamma(a, μ, σ)
}

// `x∈(a,b)`, `a`,`b` finite
// `options` same as in `interval` (see above)
// `undefined` if `a` or `b` non-finite
// `null` (empty) if `a>=b`
function between(a, b, options = undefined) {
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  return interval(a, b, options)
}

// `x∈(y-ε,y+ε)`
// `options` same as in `interval` (see above)
// `undefined` if `y` non-finite
// `undefined` if `ε` non-finite or `ε <= 0`
function within(y, ε, options = undefined) {
  // if (is_array(y)) return tuple(...y.map(yk => within(yk, ε, options)))
  if (!is_finite(y)) return undefined
  if (!is_finite(ε) || ε <= 0) return undefined
  return between(y - ε, y + ε, options)
}

// `x>a`, `x≈μ±σ`
// `μ` is mean, or mode if passed as `{mode:μ}` or `{c:μ}`
// `σ` is optional standard deviation w/ default `μ-a`
// `undefined` if `a` non-finite
// `undefined` if `μ` non-finite or `μ <= a`
// `undefined` if `σ` non-finite or `σ <= 0`
// `≡ {gt:a}` if `μ` omitted
function above(a, μ = undefined, σ = μ - a) {
  if (!is_finite(a)) return undefined
  if (!defined(μ)) return { gt: a } // plain domain for conditioning
  const mode = is_object(μ)
  if (mode) μ = μ.mode ?? μ.c
  if (!is_finite(μ) || μ <= a) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  if (mode) return interval(a, inf, { c: μ, σ })
  return interval(a, inf, { μ, σ })
}

// `x<b`, `x≈μ±σ`
// `μ` is mean, or mode if passed as `{mode:μ}` or `{c:μ}`
// `σ` is optional standard deviation w/ default `b-μ`
// `undefined` if `b` non-finite
// `undefined` if `μ` non-finite or `μ >= b`
// `undefined` if `σ` non-finite or `σ <= 0`
// `≡ {lt:b}` if `μ` omitted
function below(b, μ = undefined, σ = b - μ) {
  if (!is_finite(b)) return undefined
  if (!defined(μ)) return { lt: b } // plain domain for conditioning
  const mode = is_object(μ)
  if (mode) μ = μ.mode ?? μ.c
  if (!is_finite(μ) || μ >= b) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  if (mode) return interval(-inf, b, { c: μ, σ })
  return interval(-inf, b, { μ, σ })
}

// `x≈μ±σ`
function around(μ, σ) {
  // if (is_array(μ)) return tuple(...μ.map(μk => normal(μk, σ)))
  return normal(μ, σ)
}

// among(...xK)
// `x∈xK`
const among = uniform_discrete

// `x∈{true,false}`
const boolean = uniform_boolean()

// `x∈{0,1}`
const binary = uniform_binary()

// `x∈{a,a+1,…,b}`,`a`,`b` integer
const integer = (a, b) => uniform_integer(a, b)

// `x∈{0,1,…,K-1}`,`K≥1` integer
const index = K => uniform_integer(0, K - 1)

// union(...domains)
// `x` in union of `domains`
const union = mixture

// `xJ` distributed like `yK`
// modifies `yK` to sort
function dist(...yK) {
  if (yK.length == 1 && is_array(yK[0])) yK = yK[0]
  const dom = { is: 'array' }
  sort(yK) // pre-sort to save time in _log_p
  dom._log_p = capture(
    xJ => (xJ.length == 0 ? -inf : ks2_density(xJ, yK, { yk_sorted: true })),
    { yK }
  )
  return dom
}

// `x∈(0,S)` in sum to `S>0`
// `undefined` if `S` non-finite or non-positive
// returns function `(j,J,s)=>…` to be passed to `sample_array(J, …)`
function summand(S) {
  if (!is_finite(S) || S <= 0) return undefined
  return (j, J, s) => {
    if (!defined(s)) return undefined
    if (j == J - 1) return constant(S - s)
    // return between(0,S-s,{μ:(S-s)/(J-j), σ:sqrt(1-2/(J-j+1))/(J-j)})
    return beta_αβ(0, S - s, 1, J - j - 1)
  }
}

// `x∈{0,…,S}` in sum to integer `S>0`
// `undefined` if `S` non-integer or non-positive
// returns function `(j,J,s)=>…` to be passed to `sample_array(J, …)`
function integer_summand(S) {
  if (!is_integer(S) || S <= 0) return undefined
  return (j, J, s) => {
    if (!defined(s)) return undefined
    if (j == J - 1) return constant(S - s)
    return binomial(0, S - s, (S - s) / (J - j))
  }
}

function _sum(J, S, fs = summand) {
  let s = 0
  const domain_fj = fs(S)
  const xJ = array(J, j => {
    const xj = domain_fj(j, J, s)._prior(x => x)
    if (!defined(xj)) return (s = undefined) // also affects remaining terms
    if (!(xj >= 0)) fatal('invalid prior sample for summand')
    s += xj
    return xj
  })
  return [s, S, approx_equal]
}

const _integer_sum = (J, S) => _sum(J, S, integer_summand)

function _test_summand() {
  check(
    () => _sum(1, 1),
    () => _sum(2, 1),
    () => _sum(3, 1),
    () => _sum(10, 1),
    () => _sum(100, 1),
    () => _sum(1, 0.5),
    () => _sum(2, 0.5),
    () => _sum(3, 0.5),
    () => _sum(10, 0.5),
    () => _sum(100, 0.5),
    () => _sum(1, 100),
    () => _sum(2, 100),
    () => _sum(3, 100),
    () => _sum(10, 100),
    () => _sum(100, 100)
  )
}

function _test_integer_summand() {
  check(
    () => _integer_sum(1, 1),
    () => _integer_sum(3, 1),
    () => _integer_sum(10, 1),
    () => _integer_sum(100, 1),
    () => _integer_sum(1, 10),
    () => _integer_sum(3, 10),
    () => _integer_sum(10, 10),
    () => _integer_sum(100, 10),
    () => _integer_sum(1, 100),
    () => _integer_sum(3, 100),
    () => _integer_sum(10, 100),
    () => _integer_sum(100, 100)
  )
}

function _benchmark_summand() {
  benchmark(
    () => _sum(1, 100),
    () => _sum(3, 100),
    () => _sum(10, 100),
    () => _sum(100, 100),
    () => _integer_sum(1, 100),
    () => _integer_sum(3, 100),
    () => _integer_sum(10, 100),
    () => _integer_sum(100, 100)
  )
}

const _benchmark_summand_functions = ['summand', 'integer_summand']
