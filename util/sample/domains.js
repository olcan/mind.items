// interval domain `(a,b)`
// can be _unbounded_ (`±inf`) on either sider
// sampler depends on (may require) additional `options`:
// | `mean` (`μ`)  | prior mean
// | `mode` (`c`)  | prior mode (alternative to `mean`)
// | `stdev` (`σ`) | prior standard deviation
// \
// | **domain** | **options** | **sampler**
// | `(a,b)`      |             | `uniform(a,b)`
// | `(a,b)`      | `c`         | `triangular(a,b,c)`
// | `(a,b)`      | `μ`,`σ`     | `beta(a,b,μ,σ)`
// | `(a,+∞)`     | `μ|c`, `σ`  | `transform(gamma(μ,σ), x=> a+x)`
// | `(-∞,b)`     | `μ|c`, `σ`  | `transform(gamma(μ,σ), x=> b-x)`
// | `(-∞,+∞)`    | `μ|c`, `σ`  | `normal(μ,σ)`
// undefined if `a` or `b` non-number
// null (empty) if `a>=b`
const interval = (a, b, options = undefined) => {
  // undefined if a or b non-number
  if (!is_number(a) || !is_number(b)) return undefined
  // empty (null) if a >= b
  if (a >= b) return null
  // handle bounded interval: uniform or triangular if mode (c) specified
  if (is_finite(a) && is_finite(b)) {
    if (defined(options?.mode)) return triangular(a, b, options.mode)
    return uniform(a, b)
  }
  fatal('not yet implemented')
}
