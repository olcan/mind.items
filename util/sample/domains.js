// interval domain `(a,b)`
// can be _unbounded_ (`±inf`) on either side
// sampler depends on (may require) additional `options`:
// | `mean` (`μ`)  | prior mean
// | `mode` (`c`)  | prior mode (alternative to `mean`)
// | `stdev` (`σ`) | prior standard deviation
// undefined if `a` or `b` non-number
// empty (`null`) if `a>=b`
// | **interval** | **options** | **sampler**
// | `(a,b)`      |             | `filter(x=>x>a, {x:uniform(a,b)})`
// | `(a,b)`      | `c|μ`       | `filter(x=>x>a&&x<b, {x:triangular(a,b,c)})`
// | `(a,+∞)`     | `μ|c`, `σ`  | `transform(x=> a+x, {x:gamma(μ,σ)})`
// | `(-∞,b)`     | `μ|c`, `σ`  | `transform(x=> b-x, {x:gamma(μ,σ)})`
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
