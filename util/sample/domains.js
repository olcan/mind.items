// interval domain `(a,b)`
// can be _unbounded_ (`±inf`) on either sider
// sampler depends on (may require) additional `options`:
// | `mean` (`μ`)  | prior mean
// | `mode` (`c`)  | prior mode (alternative to `mean`)
// | `stdev` (`σ`) | prior standard deviation
// undefined if `a` or `b` non-number
// null (empty) if `a>=b`
// | **interval** | **options** | **sampler**
// | `(a,b)`      |             | `transform(uniform(a,b), x=>x>a?x:undefined)`
// | `(a,b)`      | `c|μ`       | `transform(triangular(a,b,c), x=>x>a&&x<b?x:undefined)`
// | `(a,+∞)`     | `μ|c`, `σ`  | `transform(gamma(μ,σ), x=> a+x)`
// | `(-∞,b)`     | `μ|c`, `σ`  | `transform(gamma(μ,σ), x=> b-x)`
// | `(-∞,+∞)`    | `μ|c`, `σ`  | `normal(μ,σ)`
const interval = (a, b, options = undefined) => {
  // undefined for non-number args
  if (!is_number(a) || !is_number(b)) return undefined
  // TODO: fix these, checking and converting options as needed
  const finite_a = is_finite(a)
  const finite_b = is_finite(b)
  if (finite_a && finite_b) return uniform(a, b)
  if (finite_a) return transform(x => a + x, { x: gamma(μ, σ) })
  if (finite_b) return transform(x => b - x, { x: gamma(μ, σ) })
  return normal(μ, σ)
}
