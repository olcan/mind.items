// interval domain `(a,b)`
// can be _unbounded_ (`±inf`) on either side
// sampler depends on (may require) additional `options`:
// | `mode` or `c`  | prior mode
// | `mean` or `μ`  | prior mean
// | `stdev` or `σ` | prior standard deviation
// \
// | **domain** | **options** | **sampler**
// | `(a,b)`      |             | `uniform(a,b)`
// | `(a,b)`      | `c`         | `triangular(a,b,c)`
// | `(a,b)`      | `μ`,`σ`     | `beta(a,b,μ,σ)`
// | `(a,∞)`      | `μ|c > a`, `σ`  | `gamma(a,μ,σ)`
// | `(-∞,b)`     | `μ|c < b`, `σ`  | `gamma(b,μ,σ)`
// | `(-∞,∞)`     | `μ|c`, `σ`  | `normal(μ,σ)`
// `undefined` if `a` or `b` non-number
// `null` (empty) if `a>=b`
const interval = (a, b, options = undefined) => {
  // undefined if a or b non-number
  if (!is_number(a) || !is_number(b)) return undefined
  // empty (null) if a >= b
  if (a >= b) return null
  // bounded interval is uniform or triangular if mode (c) specified
  if (is_finite(a) && is_finite(b)) {
    let c
    if (options) c = options.mode ?? options.c
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
    assert(defined(μ), 'missing mean or mode for unbounded interval')
    assert(defined(σ), 'missing stdev for unbounded interval')
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
  assert(defined(μ ?? c), 'missing mean or mode for half-bounded interval')
  assert(defined(σ), 'missing stdev for half-bounded interval')
  μ ??= a + sign(c - a) * _gamma_mean_from_mode(abs(c - a), σ)
  return gamma(a, μ, σ)
}
