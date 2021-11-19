// creates new random variable
const Random = (...args) => _Random.init(...args)

// is `X` random?
const is_random = X => X instanceof _Random

// value of (random) variable
// returns non-random `x` as is
// resolves nested random variables recursively
const value = X => (is_random(X) ? value(X.value) : X)

// => class _Random
// base class for all random variables
// defines common properties, methods, and hooks
// underscore-prefixed to reserve name for global initializer
class _Random {
  constructor() {
    // TODO: define and document properties ...
  }

  // creates new random variable
  // can be invoked on any subclass as `_Type.init`
  // seals created object; use `new _Type` for unsealed
  static init(...args) {
    return Object.seal(new this.prototype.constructor(...args))
  }

  // type of random variable
  // defined on both class (static) and instances
  static get type() {
    return this.prototype.constructor.name
  }
  get type() {
    return this.constructor.type
  }

  // domain of random variable
  // defined on both class (static) and instances
  // domain representation/encoding depends on type
  static get domain() {
    return this._domain() // see hook below
  }
  get domain() {
    return this._domain(this.params)
  }

  // resets to initial state
  reset() {
    const τ = this
    τ.J = 0
    τ.xJ = undefined
    τ.jJ = undefined
    // reset buffers, cache, weights, posterior, index
    τ._xJ = τ._wJ = τ._jJ = τ._φJ = τ._cache = undefined
    τ.wJ = τ.wj_sum = undefined
    τ.φJ = undefined
    τ.j = undefined
    τ.observed = undefined // since J=0
    if (τ.M) τ.m = 0 // reset move tracking
  }

  // sampled values `xJ`
  // can be set to observed or assumed values for inference
  // can be optionally weighted by also setting `weights`
  // can be set as `samples=xJ` or `sample(xJ)`
  // setting triggers `reset()` to initial state
  // getter is alias for `xJ`
  get samples() {
    return this.xJ
  }
  set samples(xJ) {
    const τ = this
    τ.reset()
    τ.xJ = xJ
    τ.J = xJ?.length || 0
    if (τ.stats) τ.stats.samples++
  }

  // sample size `J ≡ xJ.length`
  get size() {
    return this.J
  }

  // sample weights `wJ`
  // can be interpreted as $`∝ q(x)/p(x)`$, $`p`$ = sampling distribution
  // enables sample to behave as $`q(x)≠p(x)`$ _with reduced efficiency_
  // can be set as `weights=wJ` or `weight(wJ,[wj_sum])` (TODO)
  // setting resets `cache` since dependent on weights
  // getter is alias for `wJ`
  get weights() {
    return this.wJ
  }
  set weights(wJ) {
    const τ = this
    assert(τ.xJ, 'weights set before samples')
    assert(wJ.length == τ.J, 'weights wrong size')
    τ.wJ = wJ
    τ.wj_sum = wJ._wj_sum ?? sum(wJ)
    assert(τ.wj_sum > 0, 'invalid weights')
    τ._cache = undefined
    if (τ.stats) τ.stats.weights++
  }

  // total weight `wj_sum ≡ sum(wJ)`
  get weight_sum() {
    return this.wj_sum
  }

  // random value
  // (re)sampled from `samples` (via `index`) if set
  // otherwise generated internally via `_value(θ)`
  // can be set to fixed value or `undefined` to reset
  // set to `null` to store next random value as fixed value
  set value(v) {
    this.v = v
  }
  get value() {
    // weighted-random value
    const τ = this
    // τ.v==null means "cached value" for joint sampling
    if (τ.v === null) {
      τ.v = undefined
      return (τ.v = τ.value)
    }
    if (τ.v !== undefined) return τ.v // fixed value
    if (τ.J) return τ.xJ[τ.index] // pre-sampled value
    return τ._value(τ.θ._sample()) // random value
  }

  // random index into `samples`
  // can be set to fixed index or `undefined` to reset
  set index(j) {
    assert(j >= 0 && j < this.J, 'invalid index')
    this.j = j
  }
  get index() {
    const τ = this
    assert(τ.J > 0, 'no samples')
    if (τ.J == 1) return 0
    if (τ.j >= 0) return τ.j // fixed index
    if (!τ.wJ) return uniform_int(τ.J)
    return discrete(τ.wJ, τ.wj_sum)
  }

  // cache object tied to (weighted) sample
  // initialized on first access (may be indirect)
  // cleared when `samples` or `weights` are set
  // can be cleared manually via `clear_cache()`
  get cache() {
    return this._cache ?? (this._cache = {})
  }
  // cached value under `key` of `f(this)`
  // `this.cache[key] ?? (this.cache[key] = f(this))`
  cached(key, f) {
    return this.cache[k] ?? (this.cache[key] = f(this))
  }
  // clears cache
  clear_cache() {
    this._cache = undefined
  }

  // is sample weighted?
  // ignores weight deviations within `(1±ε)⨉` mean weight
  weighted(ε = 1e-6) {
    return this.cached('weighted_ε=' + ε, τ => {
      if (!τ.wJ || !τ.wj_sum || τ.J == 0) return false
      const w_mean = τ.wj_sum / τ.J
      const [w_min, w_max] = [(1 - ε) * w_mean, (1 + ε) * w_mean]
      return !every(τ.wJ, w => w > w_min && w < w_max)
    })
  }
  // sample minimum
  get min() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('min', τ => min(τ.xJ))
  }
  // sample maximum
  get max() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('max', τ => max(τ.xJ))
  }
  // sample range `[min,max]`
  get min_max() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('min_max', τ => [τ.min, τ.max])
  }
  // sample mean
  get mean() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('mean', τ => mean(τ.xJ))
  }
  // sample stdev
  get stdev() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('stdev', τ => stdev(τ.xJ))
  }
  // sample median
  get median() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('median', τ => median(τ.xJ))
  }
  // sample quartiles
  get quartiles() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.quantiles([0.25, 0.5, 0.75])
  }
  // sample quantiles
  quantiles(qK) {
    assert(!this.weighted(), 'weighted sample not supported')
    if (!is_array(qK)) qK = arguments
    return this.cached('quantiles_' + qK, τ => quantiles(τ.xJ, qK))
  }
  // sample circular mean on `[-r,r]`
  circular_mean(r = pi) {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('circular_mean.r=' + r, τ => circular_mean(τ.xJ, r))
  }
  // sample circular stdev on `[-r,r]`
  circular_stdev(r = pi) {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('circular_stdev.r=' + r, τ => circular_stdev(τ.xJ, r))
  }

  // sample values (unique)
  get values() {
    return this.cached('values', τ => _.uniq(τ.xJ))
  }

  // sample counts by value
  get value_counts() {
    return this.cached('value_counts', τ => _.countBy(τ.xJ))
  }

  // sample weights by value
  get value_weights() {
    return this.cached('value_weights', τ => {
      if (!τ.wJ) return τ.value_counts // treat counts as weights
      const wX = {}
      each(τ.xJ, (x, j) => (wX[x] = (wX[x] ?? 0) + τ.wJ[j]))
      return wX
    })
  }

  // sample probabilities by value
  // probabilities are normalized weights
  get value_probs() {
    return this.cached('value_probs', τ => {
      const wX = τ.value_weights
      const z = 1 / (τ.wj_sum ?? τ.J)
      return _.mapValues(wX, w => w * z)
    })
  }

  // posterior weights by value
  // based on last (re)weight w/ _observed descendants_
  // _not true posterior_ if `weight_exponent<1` on last (re)weight
  // _not true posterior_ in general unless `_weight ∝ likelihood`
  // _not aggregated_ since may already be reflected in samples/weights
  get value_post_weights() {
    return this.cached('value_post_weights', τ => {
      assert(τ.φJ, 'not available before (re)weight')
      // posterior log-weights φJ should NOT be aggregated since it is already baked into the sample (at least prior but also posterior if resampled after reweighting) and any weights (for likelihood but also prior if weighted)
      const φX = {}
      each(τ.xJ, (x, j) => (φX[x] = φX[x] ?? Math.exp(τ.φJ[j])))
      return φX
    })
  }

  // posterior probabilities by value
  // probabilities are normalized weights
  // based on last (re)weight w/ _observed descendants_
  // see `value_post_weights` above for caveats
  get value_post_probs() {
    return this.cached('value_post_probs', τ => normalize(τ.value_post_weights))
  }

  // weighted sample mode
  get mode() {
    return this.cached('mode', τ => τ._mode(τ.value_weights, max))
  }
  // weighted sample anti-mode
  get antimode() {
    return this.cached('antimode', τ => τ._mode(τ.value_weights, min))
  }
  // posterior-weighted mode
  // can be used for robust step sizes for local move proposals
  // see `value_post_weights` above for caveats
  get post_mode() {
    return this.cached('post_mode', τ => τ._mode(τ.value_post_weights, max))
  }
  // posterior-weighted anti-mode
  // can be used for robust step sizes for local move proposals
  // see `value_post_weights` above for caveats
  get post_antimode() {
    return this.cached('post_antimode', τ => τ._mode(τ.value_post_weights, min))
  }
  _mode(wX, fw_mode = max) {
    const [xK, wK] = [keys(wX), values(wX)]
    const w_mode = fw_mode(wK)
    const r = uniform_int(count(wK, w => w == w_mode))
    for (let k = 0, n = 0; k < wK.length; ++k)
      if (wK[k] == w_mode && r == n++) return xK[k]
  }

  // effective sample size
  // approximates ideal value `J*Var(target)/MSE(sample)`
  // equivalent sample size _if we could sample from target_
  // see [Rethinking the Effective Sample Size](https://arxiv.org/abs/1809.04129) for derivation
  // esp. section 3.2 "Summary of assumptions and approximations"
  // used as sample size for `ks1_cdf` and `ks2_cdf`
  get ess() {
    return this.cached('ess', τ => {
      if (!τ.wJ) return τ.essu // no weights so ess=essu
      if (!τ.jJ) return ess(τ.wJ) // no duplication
      // aggregate over indices jJ using _wJ as buffer
      if (!τ._wJ) τ._wJ = array(τ.J)
      τ._wJ.fill(0)
      each(τ.jJ, (jj, j) => (τ._wJ[jj] += τ.wJ[j]))
      return ess(τ._wJ)
    })
  }

  // _unweighted_ effective sample size
  // ignores weights but not duplication
  // resampling can improve ess only up to ≲1/2 essu
  // resampling _hurts_ essu by ~1/2 or ~k/(k+1), k=1,2,…
  // resampling guarantees `ess=essu` or `essr=1` (see below)
  get essu() {
    return this.cached('essu', τ => {
      if (!τ.jJ) return τ.J
      if (!τ._wJ) τ._wJ = array(τ.J) // used to count jJ
      τ._wJ.fill(0)
      each(τ.jJ, jj => τ._wJ[jj]++)
      return ess(τ._wJ)
    })
  }

  // `ess/essu` ratio
  // natural measure of weight skew (decoupled from duplication)
  // natural indicator of when resampling is likely to improve `ess`
  // resampling should be avoided when `essr>1/2` (likely to hurt `ess`)
  // resampling rule `essr < essu/J` is good if move rule ensures `essu>J/2`
  // resampling rule `essr < clip(essu/J, .5, 1)` is recommended in general
  // TODO: point at a new place for #random/methods/update/notes
  // TODO: also see good justification in #random/methods/update
  get essr() {
    return this.ess / this.essu
  }

  // ks statistic against target sample
  // ess is used as sample size for weighted samples
  // weighted ks is used to avoid resampling (and resulting bias)
  ks() {
    return this.cached('ks', τ => {
      const t = τ.target
      return ks2(τ.samples, t.samples, {
        wJ: τ.weighted ? τ.weights : undefined,
        wj_sum: τ.weighted ? τ.weight_sum : undefined,
        wK: t.weights,
        wk_sum: t.weight_sum,
      })
    })
  }

  // p-value for ks test against target sample
  ks_test() {
    return this.cached('ks_test', τ =>
      clip(1 - ks2_cdf(τ.ks(), τ.ess, τ.target.ess))
    )
  }

  // p-value for ks before-vs-after recent moves
  // used as a convergence/mixing indicator
  // negative log is tracked by convention
  get mks() {
    return this.cached('mks', τ => {
      if (!(τ.m >= τ.M)) return inf
      // rotate history so m=0 and we can split in half at M/2
      const _xM = array(τ.M)
      const _yM = array(τ.M)
      const m = τ.m % τ.M
      copy_at(_xM, τ.xM, 0, m)
      copy_at(_xM, τ.xM, τ.M - m, 0, m)
      copy_at(_yM, τ.yM, 0, m)
      copy_at(_yM, τ.yM, τ.M - m, 0, m)
      return -Math.log2(ks_test(_xM.slice(0, τ.M / 2), _yM.slice(-τ.M / 2)))
    })
  }
  // cache object tied to random variable (instance)
  // used to store `target` sample for evaluation purposes
  // must be cleared manually via `clear_instance_cache()`
  get instance_cache() {
    return this._instance_cache ?? (this._instance_cache = {})
  }

  // clears instance cache
  clear_instance_cache() {
    if (this._instance_cache) this._instance_cache = {}
  }

  // target sample if defined
  // can be inferred or assumed
  get target() {
    return this.instance_cache.target?.adjust(this)
  }

  // computes ("infers") target sample
  infer(size, options) {
    return this.sample(size).update(options).assume()
  }

  // sets ("assumes") current (or given) target
  assume(target = this, type = 'sample') {
    check(['sample', 'median'].includes(type), `invalid target type '${type}'`)
    let t = target
    t = this.instance_cache.target = {
      type,
      ess: t.ess /*≤t.size*/,
      samples: clone(t.samples),
      weights: t.weighted ? clone(t.weights) : undefined,
      weight_sum: t.weighted ? t.weight_sum : undefined,
    }
    // set up convenience functions for random (re)sampling
    const size = t.samples.length
    t.values = (J = size) => Random_(t.samples, t.weights).values(J)
    t.sample = (J = size, allow_resampling = false) => {
      if (J == size && !t.weights) return t.samples
      check(
        allow_resampling,
        'size mismatch and/or weighting requires resampling but allow_resampling==false'
      )
      return t.values(J)
    }
    // set up "adjustment" function for "dynamic" target types
    if (type == 'median') {
      check(size == 1 && !t.weights, 'invalid target')
      // adjust to match median on a random sample ...
      const t_median = t.samples[0]
      t.adjust = X => {
        if (X.size != t.samples.length) t.samples = array(X.size)
        // NOTE: we resample to allow weights while matching median
        const xK = X.values()
        const x_median = median(xK)
        fill(t.samples, k => xK[k] + 2 * (t_median - x_median) * uniform())
        t.ess = X.ess
        return t
      }
    } else {
      t.adjust = () => t
    }
    return this // for chaining
  }
}
