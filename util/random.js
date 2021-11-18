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

  // => _Random.init(...args)
  // creates new random variable
  // can be invoked on any subclass as `_Type.init`
  // seals created object; use `new _Type` for unsealed
  static init(...args) {
    return Object.seal(new this.prototype.constructor(...args))
  }

  // => _Random.type
  // type of random variable
  // defined on both class (static) and instances
  static get type() {
    return this.prototype.constructor.name
  }
  get type() {
    return this.constructor.type
  }

  // => _Random.domain
  // domain of random variable
  // defined on both class (static) and instances
  // domain representation/encoding depends on type
  static get domain() {
    return this._domain() // see hook below
  }
  get domain() {
    return this._domain(this.params)
  }

  // => _Random.samples
  // sampled values for random variable
  // can be set to observed or assumed values for inference
  // can be optionally weighted by also setting `weights`
  // can be set as `samples=xJ` or `sample(xJ)`
  // setting triggers `reset()` to initial state
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

  // => _Random.weights
  // optional sample weights
  // can be interpreted as $`∝ q(x)/p(x)`$, $`p`$ = sampling distribution
  // enables sample to behave as $`q(x)≠p(x)`$ _with reduced efficiency_
  // can be set as `weights=wJ` or `weight(wJ,[wj_sum])` (TODO)
  // setting resets `cache`
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

  // => _Random.reset()
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

  // => _Random.value
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

  // => _Random.index
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

  // => _Random.size
  // alias for `J`
  get size() {
    return this.J
  }

  // => _Random.weight_sum
  // alias for `wj_sum`
  get weight_sum() {
    return this.wj_sum
  }

  // => _Random.cache
  // cache object tied to (weighted) sample
  // initialized on first access (may be indirect)
  // cleared when `samples` or `weights` are set
  // can be cleared manually via `clear_cache()`
  get cache() {
    return this._cache ?? (this._cache = {})
  }
  // => _Random.cached(key, f)
  // cached value under `key` of `f(this)`
  // `this.cache[key] ?? (this.cache[key] = f(this))`
  cached(key, f) {
    return this.cache[k] ?? (this.cache[key] = f(this))
  }
  // => _Random.clear_cache()
  // clears cache
  clear_cache() {
    this._cache = undefined
  }

  //…/cached properties are those stored under cache, e.g. cache.expensive_reusable_result. Cache is cleared (={}) automatically whenever samples or weights are modified. Convenience method cached(key,func) can compute cached properties as needed. Convenient accessors are also provided for many built-in cached properties such as min, max, mean, ...

  // => _Random.weighted(ε=1e-6)
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
  // => _Random.min
  // sample minimum
  get min() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('min', τ => min(τ.xJ))
  }
  // => _Random.max
  // sample maximum
  get max() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('max', τ => max(τ.xJ))
  }
  // => _Random.min_max
  // sample range `[min,max]`
  get min_max() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('min_max', τ => [τ.min, τ.max])
  }
  // => _Random.mean
  // sample mean
  get mean() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('mean', τ => mean(τ.xJ))
  }
  // => _Random.stdev
  // sample stdev
  get stdev() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('stdev', τ => stdev(τ.xJ))
  }
  // => _Random.median
  // sample median
  get median() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('median', τ => median(τ.xJ))
  }
  // => _Random.quartiles
  // sample quartiles
  get quartiles() {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.quantiles([0.25, 0.5, 0.75])
  }
  // => _Random.quantiles(qK)
  // sample quantiles
  quantiles(qK) {
    assert(!this.weighted(), 'weighted sample not supported')
    if (!is_array(qK)) qK = arguments
    return this.cached('quantiles_' + qK, τ => quantiles(τ.xJ, qK))
  }
  // => _Random.circular_mean([r=pi])
  // sample circular mean on `[-r,r]`
  circular_mean(r = pi) {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('circular_mean.r=' + r, τ => circular_mean(τ.xJ, r))
  }
  // => _Random.circular_stdev([r=pi])
  // sample circular mean on `[-r,r]`
  circular_stdev(r = pi) {
    assert(!this.weighted(), 'weighted sample not supported')
    return this.cached('circular_stdev.r=' + r, τ => circular_stdev(τ.xJ, r))
  }

  // TODO: clarify concept of postX and maybe rename? or not

  // NOTE: properties/methods below work w/ weighted samples
  // mode and antimode w.r.t. posterior weights (φJ)

  get mode() {
    return this.cached('mode', τ => this.modef(w => w))
  }
  get antimode() {
    return this.cached('antimode', τ => this.modef(w => -w))
  }
  modef(f) {
    const wX = this.postX // counts if unweighted
    const xK = keys(wX),
      wK = values(wX)
    const w_mode = maxf(wK, f)
    const r = uniform_int(count(wK, w => f(w) == w_mode))
    for (let k = 0, n = 0; k < wK.length; ++k)
      if (f(wK[k]) == w_mode && r == n++) return xK[k]
  }
  get counts() {
    return this.cached('counts', τ => counts(τ.xJ))
  }
  // NOTE: weightsX aggregates by value so counts become weights
  get weightsX() {
    return this.cached('weightsX', τ => {
      if (!τ.wJ) return τ.counts // treat counts as weights
      const wX = {}
      each(τ.xJ, (x, j) => (wX[x] = (wX[x] || 0) + τ.wJ[j]))
      return wX
    })
  }
  // posterior (φJ) aggregated by value
  get postX() {
    return this.cached('postX', τ => {
      if (!τ.φJ) return τ.counts // treat counts as posterior weights
      const φX = {}
      each(τ.xJ, (x, j) => (φX[x] = (φX[x] || 0) + τ.φJ[j]))
      return φX
    })
  }
  get probs() {
    return this.cached('probs', τ => {
      if (!τ.wJ) return new Array(τ.J).fill(1 / τ.J)
      const z = 1 / τ.wj_sum
      return τ.wJ.map(w => w * z)
    })
  }
  probs_at(xJ) {
    const wX = this.weightsX // counts if unweighted
    const z = 1 / if_defined(this.wj_sum, this.J)
    return xJ.map(x => (wX[x] || 0) * z)
  }

  // negative log posterior probability (NLP) of _distinct_ samples
  get nlp() {
    return this.cached('nlp', τ => {
      if (τ.jJ) {
        // aggregate over indices jJ using _wJ as buffer
        if (!τ._wJ) τ._wJ = array(τ.J)
        τ._wJ.fill(0)
        each(τ.jJ, (jj, j) => (τ._wJ[jj] += τ.wJ[j]))
        return -sumf(τ.φJ, (φ, j) => (τ._wJ[j] ? φ * τ._wJ[j] : 0)) / sum(τ._wJ)
      }
      return -sumf(τ.φJ, (φ, j) => (τ.wJ[j] ? φ * τ.wJ[j] : 0)) / τ.wj_sum
    })
  }

  // ess gave excellent agreement with empirical cdf/quantiles
  // we distinguish (weighted) ess from essu and essr below
  get ess() {
    return this.cached('ess', τ => {
      if (!τ.wJ) return τ.essu // no weights so ess=essu
      if (τ.jJ) {
        // aggregate over indices jJ using _wJ as buffer
        if (!τ._wJ) τ._wJ = array(τ.J)
        τ._wJ.fill(0)
        each(τ.jJ, (jj, j) => (τ._wJ[jj] += τ.wJ[j]))
        return ess(τ._wJ)
      }
      return ess(τ.wJ)
    })
  }
  // essu ("unweighted" ess) ignores weights
  // adjusts sample size only for duplication in resampling
  // resampling can improve ess only up to <~1/2 essu
  // resampling _shrinks_ essu by ~1/2 or ~k/(k+1) toward ess=1
  get essu() {
    return this.cached('essu', τ => {
      if (!τ.jJ) return τ.J
      if (!τ._wJ) τ._wJ = array(τ.J) // used to count jJ
      τ._wJ.fill(0)
      each(τ.jJ, jj => τ._wJ[jj]++)
      return ess(τ._wJ)
    })
  }
  // essr is just ess/essu, a natural measure of weight skew
  get essr() {
    return this.ess / this.essu
  }

  // kolmogorov-smirnov statistic against (cached) target
  // collisions are resolved randomly (as is default for ks)
  // ess is used instead of length for weighted samples
  // weighted ks is used to avoid resampling bias
  // collisions are allowed for exact (⟹discrete) target
  // (otherwise ks cdf is inaccurate, esp. for small support)
  // (as can be seen from sensitivity of ks to support size)
  // (w/ collisions the ks cdf becomes lower-bound ⟹ alpha upper-bound ⟹ 1/alpha lower-bound that can often hit ~zero)
  ks() {
    return this.cached('ks', τ => {
      const t = τ.target
      return ks(
        τ.samples,
        t.samples,
        t.exact,
        τ.weighted ? τ.weights : undefined,
        τ.weighted ? τ.weight_sum : undefined,
        t.weights,
        t.weight_sum
      )
    })
  }
  // regular cdf (w/o small-sample correction) works well
  // exact case needs one-sided cdf, equivalent to size 2n on both sides since 2*n*m/(n+m)->2n as m->∞ and 2*2n*2n/(2n+2n)=2n
  ks_cdf() {
    return this.cached('ks_cdf', τ => {
      const t = τ.target
      if (t.exact)
        // need one-sided cdf w/ n=m->2n (see above)
        return ks_cdf_at(2 * τ.ess, 2 * τ.ess, τ.ks())
      return ks_cdf_at(τ.ess, t.ess, τ.ks())
    })
  }
  ks_alpha() {
    return clip(1 - this.ks_cdf())
  }

  // mks (move ks) metric used as a convergence/mixing indicator
  get mks() {
    return this.cached('mks', τ => {
      if (!(τ.m >= τ.M)) return inf
      // rotate history so m=0 and we can split in half at M/2
      const _xM = array(τ.M),
        _yM = array(τ.M),
        m = τ.m % τ.M
      copy_at(_xM, τ.xM, 0, m)
      copy_at(_xM, τ.xM, τ.M - m, 0, m)
      copy_at(_yM, τ.yM, 0, m)
      copy_at(_yM, τ.yM, τ.M - m, 0, m)
      return -Math.log2(ks_alpha(_xM.slice(0, τ.M / 2), _yM.slice(-τ.M / 2)))
    })
  }
  // => _Random.instance_cache
  // cache object tied to random variable (instance)
  // must be cleared manually via `clear_instance_cache()`
  get instance_cache() {
    return this._instance_cache ?? (this._instance_cache = {})
  }

  // => _Random.clear_instance_cache()
  // clears instance cache
  clear_instance_cache() {
    if (this._instance_cache) this._instance_cache = {}
  }

  // returns inferred or assumed target sample from cache
  // returns undefined if missing; can be used to test existence
  get target() {
    return this.instance_cache.target?.adjust(this)
  }

  // computes ("infers") target sample by updating w/ defaults
  // resulting target sample is cached on instance-level cache
  infer(size, options) {
    return this.sample(size).update(options).assume()
  }
  // sets ("assumes") current (or given) random sample as "target"
  // type should be 'exact' iff samples=support & weights∝posterior
  // typically used for inference performance evaluation purposes
  assume(target = this, type = 'sample') {
    check(
      ['sample', 'exact', 'median'].includes(type),
      `invalid target type '${type}'`
    )
    let t = target
    t = this.instance_cache.target = {
      type,
      ess: type == 'exact' ? t.size /*full ess*/ : t.ess /*≤t.size*/,
      exact: type == 'exact', // ⟺ samples=support & weights∝posterior
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
