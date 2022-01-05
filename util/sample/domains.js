// interval `(a,b)`
// can be _unbounded_ (`±inf`) on either side
// sampler depends on (may require) additional `options`:
// | `mean` or `μ`  | prior mean
// | `mode` or `c`  | prior mode (supersedes `mean`)
// | `stdev` or `σ` | prior standard deviation
// \
// | **interval** | **options**     | **sampler**
// | `(a,b)`      |                 | `uniform(a,b)`
// | `(a,b)`      | `c`             | `triangular(a,b,c)`
// | `(a,b)`      | `σ`, `μ|c`      | `beta(a,b,μ,σ)`
// | `(a,∞)`      | `σ`, `μ|c > a`  | `gamma(a,μ,σ)`
// | `(-∞,b)`     | `σ`, `μ|c < b`  | `gamma(b,μ,σ)`
// | `(-∞,∞)`     | `σ`, `μ|c`      | `normal(μ,σ)`
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
    // assert(defined(μ), 'missing mean or mode for unbounded interval')
    // assert(defined(σ), 'missing stdev for unbounded interval')
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
  // assert(defined(μ ?? c), 'missing mean or mode for half-bounded interval')
  // assert(defined(σ), 'missing stdev for half-bounded interval')
  // mode supercedes mean if both are specified
  if (defined(c)) μ = a + sign(c - a) * _gamma_mean_from_mode(abs(c - a), σ)
  return gamma(a, μ, σ)
}

// bounded interval `(a,b)`
// `undefined` if `a` or `b` non-number or infinite
// `null` (empty) if `a>=b`
function between(a, b, options = undefined) {
  if (!is_finite(a) || !is_finite(b)) return undefined
  if (a >= b) return null // empty (null) if a >= b
  return interval(a, b, options)
}

const within = (x, ε, options = undefined) => between(x - ε, x + ε, options)

// above(a, μ|c, σ, [mode = false])
// lower-bounded interval `(a,∞)`
// if `mode`, `μ|c` is taken as mode `c`
// `undefined` if `a` non-number or infinite
// `undefined` if `μ|c` non-number or infinite or `μ|c <= a`
// `undefined` if `σ` non-number or infinite or `σ <= 0`
function above(a, μ, σ, mode = false) {
  if (!is_finite(a)) return undefined
  if (!is_finite(μ) || μ <= a) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  if (mode) return interval(a, inf, { c: μ, σ })
  return interval(a, inf, { μ, σ })
}

// below(b, μ|c, σ, [mode = false])
// upper-bounded interval `(-∞,b)`
// if `mode`, `μ|c` is taken as mode `c`
// `undefined` if `b` non-number or infinite
// `undefined` if `μ|c` non-number or infinite or `μ|c >= b`
// `undefined` if `σ` non-number or infinite or `σ <= 0`
function below(b, μ, σ, mode = false) {
  if (!is_finite(b)) return undefined
  if (!is_finite(μ) || μ >= b) return undefined
  if (!is_finite(σ) || σ <= 0) return undefined
  if (mode) return interval(-inf, b, { c: μ, σ })
  return interval(-inf, b, { μ, σ })
}

const around = (x, σ) => normal(x, σ)
