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
  // `array(J, j => this.value)`
  values(J = this.size) {
    return array(J, j => this.value)
  }

  // random index into `samples`
  // can be set to fixed index or `undefined` to reset
  set index(j) {
    assert(j >= 0 && j < this.J, 'invalid index')
    this.j = j
  }
  get index() {
    const τ = this
    assert(τ.J > 0, 'missing samples')
    if (τ.J == 1) return 0
    if (τ.j >= 0) return τ.j // fixed index
    if (!τ.wJ) return uniform_int(τ.J)
    return discrete(τ.wJ, τ.wj_sum)
  }
  // `array(J, j => this.index)`
  indices(J = this.size) {
    return array(J, j => this.index)
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

  // sample unique values
  get unique_values() {
    return this.cached('unique_values', τ => _.uniq(τ.xJ))
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
        wJ: τ.weighted() ? τ.weights : undefined,
        wj_sum: τ.weighted() ? τ.weight_sum : undefined,
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
  // cache object tied to instance
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

  // infer([size],[options])
  // computes ("infers") target sample
  infer(size, options) {
    return this.sample(size).update(options).assume()
  }

  // designates random variable as target
  // weighted sample is extracted from target variable
  // TODO: document types, better understand 'median' type
  assume(target = this, type = 'sample') {
    check(['sample', 'median'].includes(type), `invalid target type '${type}'`)
    let t = target
    t = this.instance_cache.target = {
      type,
      ess: t.ess /*≤t.size*/,
      samples: clone(t.samples),
      weights: t.weighted() ? clone(t.weights) : undefined,
      weight_sum: t.weighted() ? t.weight_sum : undefined,
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

  // observe([xJ|X])
  // designates random variable as _observed_
  // can also set `samples` from given array `xJ` or variable `X`
  observe(xJ) {
    if (xJ) {
      if (!is_array(xJ) && !is_random(xJ)) xJ = arguments
      this.sample(xJ)
    }
    this.observed = true
    return this
  }

  _update_options(options = {}) {
    return {
      // function options take in (this,options) as arguments
      // update step is passed along as o.step or o.n
      weight_exponent: (τ, o) => 1, // exponent>=0, 0=unweighted, >>1≈full-weighted
      weight_rule: (τ, o) => true, // weighting rule (default: always)
      // resampling rule (default: when essr < ~essu/J)
      // default rule allows ess→J as sample converges to target
      // once target is stable, essr stays ~1 after reweights
      // effective moves s.t. essu→J will then allow ess→essu→J
      sample_rule: (τ, o) => τ.essr < clip(τ.essu / τ.J, 0.5, 1),
      // move rule (default: _while_ essu<J/2 OR accepts<J)
      // essu slack ~J/2 allows up to ~J/2 slow-moving samples
      // non-moving ("stuck") samples can still prevent mixing
      // invoked repeatedly until returns false
      // move step is passed as o.move_step or o.m
      // move accepts are passed as o.move_accepts or o.a
      move_rule: (τ, { m, a }) => τ.essu < τ.J / 2 || a < τ.J,
      max_time: 1000, // max time (ms) until no improvement (Δφ<0)
      min_ess: this.J / 2, // minimum ess desired (within max_time)
      max_mks: 3, // maximum mks desired (within max_time)
      max_mks_steps: 3, // min recent steps that must satisfy max_mks
      min_time: 0, // minimum time (to test additional steps)
      ...options,
    }
  }

  // updates `samples` towards posterior
  // sequence of `weight()`, `sample()`, and `move()` operations
  // [sequential monte carlo](https://en.m.wikipedia.org/wiki/Particle_filter) for  [approximate bayesian computation](https://en.wikipedia.org/wiki/Approximate_Bayesian_computation)
  // derived from [ABC Samplers](https://arxiv.org/abs/1802.09650) algorithm 8 (`ABC-SMC`)
  // detailed notes in #/update
  update(options = {}) {
    const τ = this,
      o = (options = τ._update_options(options))

    // wrap function options specified as constants
    // also check types while we are at it
    const wrap_function_option = (n, ...t) => {
      const tK = flatten([...t])
      if (tK.includes(typeof o[n])) {
        o['_' + n] = o[n]
        o[n] = (τ, o) => o['_' + n]
      }
      check(
        typeof o[n] == 'function',
        `invalid type ${typeof o[n]} for update option` +
          ` '${n}', must be function|${tK.join('|')}`
      )
    }

    wrap_function_option('weight_exponent', 'number')
    wrap_function_option('weight_rule', 'boolean')
    wrap_function_option('sample_rule', 'boolean')
    wrap_function_option('move_rule', 'boolean')
    const {
      weight_exponent,
      weight_rule,
      sample_rule,
      move_rule,
      max_time,
      min_ess,
      max_mks,
      min_time,
    } = o

    // convenience function to append to array stats
    const append_stats = (n, v) => {
      if (τ.stats) τ.stats[n] = (τ.stats[n] || []).concat(v)
    }

    // convenience function for tracking timing information
    let weight_time = 0,
      sample_time = 0,
      move_time = 0
    const time = f => {
      const start = Date.now()
      f()
      return Date.now() - start
    }

    const start = Date.now(),
      elapsed = () => Date.now() - start
    const external_steps = defined(o.step)
    let n = 0,
      Δφ = 0,
      mks = 0
    do {
      // while ... (see below)

      // pass current step (n) in options (unless done externally)
      if (!external_steps) {
        o.step = o.n = n++
      }

      // check time allowance
      if (elapsed() >= max_time) {
        console.warn(
          'update ran out of time',
          json(
            this.summarize_stats({
              n,
              Δφ,
              mks,
              ess: τ.ess,
              min_ess,
              weighted: τ.weighted(),
              weight_time,
              sample_time,
              move_time,
              stats: τ.stats,
            })
          )
        )
        break // ran out of time
      }

      // initialize array stats so index 0 is before first step
      if (o.step == 0 && τ.stats) {
        append_stats('essr', round(100 * τ.essr))
        append_stats('mar', 100) // start at 100
        append_stats('ess', round(τ.ess))
        append_stats('essu', round(τ.essu))
        append_stats('Δφ', 0)
        if (τ.M) append_stats('mks', 1024)
      }

      const w_exp = weight_exponent(τ, o)

      // adjust weights for next target relative to current target
      if (weight_rule(τ, o)) weight_time += timing(() => τ.weight(w_exp), '')
      append_stats('essr', round(100 * τ.essr))

      // resample to force uniform weights
      // can increase ess up to ~1/2 essu
      // _decreases_ essu by ~1/2, or ~k/(k+1)
      if (sample_rule(τ, o)) sample_time += timing(() => τ.sample(), '')

      // move particles toward current target via markov chain
      // multiple moves may be needed for mixing/convergence
      // move_rule is invoked multiple times until it returns false
      // move step is passed along as options.move_step and options.m
      // NOTE: if mixing is not achieved, may get harder in next step
      // NOTE: move_rule should typically check both #accepts and essu, which together provide an indication of ability to ability to move particles in a healthy manner
      // WARNING: if essu remains low/unchecked, this may lead to ess SPIRAL (ess→1) when weights are skewed, triggering frequent destructive (essu->essu/2) resampling between moves
      Δφ = 0 // total Δφ across multiple moves
      const prev_proposals = τ.stats?.proposals
      const prev_accepts = τ.stats?.accepts
      let m = (o.m = o.move_step = 0)
      τ._move_accepts = o.a = o.move_accepts = 0
      while (move_rule(τ, o) && elapsed() < max_time) {
        move_time += timing(() => τ.move(w_exp), '')
        Δφ += τ._φj_move
        o.m = o.move_step = ++m
        o.a = o.move_accepts = τ._move_accepts
      }
      if (τ.stats) {
        // report move accept rate ("mar")
        const accept_rate =
          (τ.stats.accepts - prev_accepts) /
          (τ.stats.proposals - prev_proposals)
        append_stats('mar', round(100 * accept_rate))
      }

      append_stats('ess', round(τ.ess))
      append_stats('essu', round(τ.essu))
      append_stats('Δφ', round(Δφ, 1))

      mks = 0 // disables mks
      if (τ.M) {
        mks = Infinity // enables mks checks
        if (τ.m < τ.M) append_stats('mks', 1024)
        else {
          append_stats('mks', Math.min(1024, round(τ.mks, 1)))
          if (τ.stats.mks.length >= o.max_mks_steps)
            mks = max(τ.stats.mks.slice(-o.max_mks_steps))
        }
      }

      if (external_steps) break // steps managed externally
    } while (
      mks > max_mks ||
      Δφ > 0 ||
      τ.ess < min_ess ||
      τ.weighted() ||
      elapsed() < min_time
    )

    return τ // for chaining
  }

  // sample([xJ|X|J])
  // sets, generates, or updates (_resamples_) `samples`
  // can set from array `xJ` or random variable `X`
  sample(J) {
    const τ = this
    if (J === undefined) return τ._resample() // see below
    if (isArray(J)) {
      τ.samples = J
      return τ
    }
    if (isRandom(J)) {
      // get samples/weights from another random process
      τ.samples = clone(J.samples)
      if (J.weighted()) τ.weights = clone(J.weights)
      return τ
    }
    check(J >= 1, 'invalid sample size')
    // if size is unchanged, reuse existing arrays
    if (J != τ.J) {
      τ.reset()
      τ.xJ = array(J)
      τ.J = J
    }
    if (τ._sample_weighted) {
      if (!τ.wJ) τ.wJ = array(J)
      τ._sample(τ.xJ, τ.wJ, τ.θ._sample())
      τ.wj_sum = sum(τ.wJ)
      check(τ.wj_sum > 0, 'invalid weights')
    } else {
      τ._sample(τ.xJ, undefined, τ.θ._sample())
      if (τ.wJ) {
        τ.wJ.fill(1)
        τ.wj_sum = τ.J
      }
    }
    // reset posterior to prior
    if (τ.φJ) {
      τ.φJ.fill(0)
      τ._prior(τ.xJ, τ.φJ, τ.θ._sample())
    }
    τ.j = undefined // reset fixed index
    τ.clear_cache()
    τ.observed = false // sample generated, not observed
    if (τ.M) τ.m = 0 // reset move tracking
    // reset indices and assume full ess if unweighted
    if (τ.jJ) fill(τ.jJ, j => j)
    if (τ.stats) τ.stats.samples++
    return τ // for chaining
  }

  _resample() {
    const τ = this
    check(τ.J > 0, 'missing samples to resample')
    check(τ.J > 1, 'resampling single sample')
    if (!τ._xJ) τ._xJ = array(τ.J) // for xJ
    if (!τ._jJ) τ._jJ = array(τ.J) // for jJ
    if (τ.φJ && !τ._wJ) τ._wJ = array(τ.J) // for φJ
    // initialize sample indices if needed (first resample)
    if (!τ.jJ) {
      τ.jJ = array(τ.J)
      fill(τ.jJ, j => j)
    }
    // resample/shuffle xJ, jJ, maybe φJ
    repeat(τ.J, j => {
      const jj = τ.index
      τ._xJ[j] = τ.xJ[jj]
      τ._jJ[j] = τ.jJ[jj]
      if (τ.φJ) τ._wJ[j] = τ.φJ[jj]
    })
    τ.xJ = swap(τ._xJ, (τ._xJ = τ.xJ))
    τ.jJ = swap(τ._jJ, (τ._jJ = τ.jJ))
    if (τ.φJ) τ.φJ = swap(τ._wJ, (τ._wJ = τ.φJ))
    // reset weights (now "baked into" sample)
    if (τ.wJ) {
      τ.wJ.fill(1)
      τ.wj_sum = τ.J
    }
    τ.clear_cache()
    if (τ.stats) τ.stats.resamples++
    return τ // for chaining
  }

  // weight([wJ|exponent=1])
  // sets or updates (_reweights_) `weights`
  // additional notes in #/weight
  weight(arg = 1 /*weight array or exponent>=0*/) {
    if (arg >= 0 && arg <= 1) this._reweight(arg)
    else if (isArray(arg)) this.weights = arg
    else throw new Error('invalid argument for weight')
    return this // for chaining
  }

  _reweight(weight_exponent = 1) {
    const τ = this
    check(τ.J > 0, 'missing samples to reweight')
    check(τ.J > 1, 'reweighting redundant for J=1')
    check(τ.children, 'missing children for reweight')
    const descendants = τ.observed_descendants()
    check(descendants.length, 'missing observed descendants for reweight')
    // update weights using log-sum-exp trick
    if (!τ._wJ) τ._wJ = array(τ.J)
    if (!τ.wJ) τ.wJ = array(τ.J).fill(1)
    // take log(wJ) minus log-posterior φJ (denominator)
    // if posterior is missing (first reweight), use prior
    if (!τ.φJ) {
      τ.φJ = zeroes(τ.J)
      τ._prior(τ.xJ, τ.φJ, τ.θ._sample())
    }
    log(τ.wJ)
    τ._wJ = swap(τ.wJ, (τ.wJ = τ._wJ))
    // NOTE: prior always cancels out here (see last page of ABC Samplers paper) but not in _move and splitting λJ would complicate too much
    // subtract previous posterior (may be just prior)
    sub(τ._wJ, τ.φJ)
    τ._posterior(τ.xJ, τ.φJ, descendants, weight_exponent)
    add(τ._wJ, τ.φJ)
    const w_max = max(τ._wJ) // to subtract in log space
    apply(τ._wJ, w => Math.exp(w - w_max))
    // exp(τ._wJ)
    τ.wJ = swap(τ._wJ, (τ._wJ = τ.wJ))
    τ.wj_sum = sum(τ.wJ)
    check(τ.wj_sum > 0, 'invalid weights')
    τ.clear_cache()
    if (τ.stats) τ.stats.reweights++
  }

  // _posterior(xJ, log_wJ, descendants, exponent) computes ~posterior
  // fills in log_wJ with log-posterior for samples xJ
  // used in both _weight and _move (for proposals)
  // clips small weights and applies optional exponent
  // does NOT normalize or otherwise rescale weights
  // also returns log_wJ (not intended for chaining)
  _posterior(xJ, log_wJ, descendants, exponent = 1) {
    const τ = this
    log_wJ.fill(0)
    τ._prior(xJ, log_wJ, τ.θ._sample())
    // TODO: summing _weight over descendants implies a conditional independence assumption which does not hold e.g. if descendants have other common parents
    each(descendants, c => {
      // set up θJ for _weight, which is just c.θ w/ _scan method
      const θJ = c.θ
      c.θ._scan = f => {
        scan(xJ, (j, x) => {
          θJ._set(this, x)
          f(j, θJ._sample())
        })
        θJ._reset(this)
      }
      // NOTE: we do not allow _weight to modify global exponent because there may be multiple descendants and in general we need models to be agnostic of any larger model or learning algorithm that uses them; the downside is that we may have two levels of smoothing driven by the exponent: once w/ kernel-smoothing or annealing (w/ bandwidth or temperature based on exponent), and another with the exponent applied globally across all descendants
      c._weight(θJ, log_wJ, exponent)
      θJ._scan = undefined
    })
    // check for NaNs, clip -infinities, apply exponent
    each(log_wJ, w => check(!isNaN(w), '_prior/_weight returned NaN'))
    // NOTE: clipping -inf helps avoid numerical issues, but clipping too much (even -1000) can cause ks misalignment when prior is far from posterior (see e.g. #random/normal/eval)
    apply(log_wJ, w => Math.max(-Number.MAX_VALUE, w))
    // NOTE: exponent=0 forces uniform weights, even for samples where _weight returned -inf due to clipping; if exponent was applied pre-clipping it would need to skip -infs to prevent NaN when exponent=0
    if (exponent != 1) scale(log_wJ, exponent)
    return log_wJ
  }

  // move([exponent=1])
  // moves `samples` towards posterior
  // takes [Metropolis-Hastings](https://en.wikipedia.org/wiki/Metropolis–Hastings_algorithm) steps along markov chains
  // stationary distribution is prior weighted by `_weight` hook
  // converges to posterior as `_weight → likelihood`
  // move proposals are defined in `_propose` hook
  move(weight_exponent = 1) {
    const τ = this
    check(τ.J > 0, 'missing samples to move')
    check(τ.children, 'missing children for move')
    const descendants = τ.observed_descendants()
    check(descendants.length, 'missing observed descendants for move')
    // reject 'prior moves' since unnecessary complication
    check(τ.φJ, 'can not move before (re)weight')
    if (!τ._xJ) τ._xJ = array(τ.J) // for proposals
    if (!τ._wJ) τ._wJ = array(τ.J) // for proposal ratios
    if (!τ._φJ) τ._φJ = array(τ.J) // for proposed posteriors
    τ._wJ.fill(0) // reset before adding in _propose
    τ._propose(
      τ.xJ,
      τ._xJ /*yJ*/,
      τ._wJ /*log(q(x|y)/q(y|x))*/,
      weight_exponent,
      τ.θ._sample()
    )
    τ._posterior(τ._xJ, τ._φJ, descendants, weight_exponent)
    // accept/reject proposals (∞-∞=NaN treated as 0)
    τ._φj_move = 0
    let accepts = 0
    // once defined, _move_accepts must be reset externally
    if (!defined(τ._move_accepts)) τ._move_accepts = 0
    for (let j = 0; j < τ.J; ++j) {
      if (τ.wJ[j] == 0) continue // skip 0-weight sample
      if (uniform() < Math.exp(τ._wJ[j] + τ._φJ[j] - τ.φJ[j])) {
        if (τ.M) {
          // track moves in buffer
          const m = τ.m++ % τ.M
          τ.xM[m] = τ.xJ[j]
          τ.yM[m] = τ._xJ[j]
        }
        τ.xJ[j] = τ._xJ[j]
        // τ.wJ[j] *= Math.exp(τ._φJ[j] - τ.φJ[j])
        τ._φj_move += τ._φJ[j] - τ.φJ[j]
        τ.φJ[j] = τ._φJ[j]
        if (τ.jJ) τ.jJ[j] = τ.J + j // new index for accepted sample
        τ._move_accepts++ // counter managed externally
        accepts++
      }
    }
    if (accepts > 0) {
      if (τ.jJ) {
        // reassign indices jJ using _jJ as map
        if (!τ._jJ) τ._jJ = array(τ.J)
        τ._jJ.fill(-1)
        let jjj = 0
        apply(τ.jJ, (jj, j) => {
          return jj >= τ.J
            ? jjj++
            : τ._jJ[jj] >= 0
            ? τ._jJ[jj]
            : (τ._jJ[jj] = jjj++)
        })
      }
      τ.clear_cache() // sample changed
    }
    if (τ.stats) {
      τ.stats.moves++
      τ.stats.proposals += τ.J
      τ.stats.accepts += accepts
    }
    return τ // for chaining
  }

  // for charting see #random/eval_chart
  _eval_options(options = {}) {
    return merge(
      {
        runs: 100, // number of eval runs (w/ fresh sample)
        steps: 10, // number of update steps
        size: 100, // sample size
        move_history_size: 100, // for mks diagnostic (0 to disable),
        target_size: options.size || 100,
      },
      this._update_options(options),
      options
    )
  }

  // evaluates inference performance
  // runs `update()` and tracks ks against predefined target
  // tracks various other statistics, e.g. `ess`, `essu`, `mks`, etc
  // additional notes in #/eval
  eval(options = {}) {
    const τ = this
    const { runs, steps, size } = (options = τ.eval_options(options))
    const qQ = [0, 0.1, 0.5, 0.9, 1],
      nQ = ['min', 'q10', 'median', 'q90', 'max']
    τ.enable_stats()
    τ.enable_move_tracking(
      Math.max(options.move_history_size, options.target_size, size)
    )
    // confirm eval target, generating internally if necessary
    const targeted_descendants = τ.targeted_descendants()
    if (targeted_descendants.length > 0) {
      check(
        targeted_descendants.length == 1 && !τ.target,
        'eval target ambiguous: must be parent or single descendant'
      )
    } else if (!τ.target) {
      // compute target internally using model
      const [_, target_time] = timing(
        () => τ.infer(options.target_size, options.target_options),
        'infer'
      )
      const target_stats = clone(τ.stats)
      τ.enable_stats() // reset stats after target
      τ.stats.target_stats = target_stats
      τ.stats.target_time = target_time
    }
    // τ.disable_move_tracking()
    τ.stats.ks_time = 0
    let essRN = [],
      essuRN = [],
      essrRN = [],
      ΔφRN = [],
      mksRN = [],
      marRN = []
    const [dQN] = timing(
      () =>
        transpose(
          apply(
            transpose(
              array(runs, r =>
                array(steps + 1, n => {
                  if (n == 0) τ.sample(size)
                  // sample-only iteration
                  else {
                    // update iteration
                    // note step 1 of eval is actually step 0 (first step) of update
                    // step 0 of eval is after sample generation but before update
                    options.step = options.n = n - 1
                    τ.update(options)
                  }
                  if (n == steps) {
                    essRN.push(τ.stats.ess)
                    delete τ.stats.ess
                    essuRN.push(τ.stats.essu)
                    delete τ.stats.essu
                    essrRN.push(τ.stats.essr)
                    delete τ.stats.essr
                    ΔφRN.push(τ.stats.Δφ)
                    delete τ.stats.Δφ
                    if (τ.stats.mks) {
                      mksRN.push(τ.stats.mks)
                      delete τ.stats.mks
                    }
                    marRN.push(τ.stats.mar)
                    delete τ.stats.mar
                  }
                  if (targeted_descendants.length > 0) {
                    const X = targeted_descendants[0]
                    const target = targeted_descendants[0].target
                    const xJ = array(target.samples.length)
                    const wJ = X._sample_weighted ? array(xJ.length) : undefined
                    const wj_sum = wJ ? sum(wJ) : undefined
                    // NOTE: we sample parameters once per step per run; we could also mix samples from multiple draws but we do not do that for now
                    X._sample(xJ, wJ, X.θ._sample())
                    const [d, ks_time] = timing(
                      () =>
                        -Math.log2(
                          ks_alpha(
                            xJ,
                            target.samples,
                            target.exact,
                            wJ,
                            wj_sum,
                            target.weights,
                            target.weight_sum
                          )
                        ),
                      ''
                    )
                    τ.stats.ks_time += ks_time
                    return d
                  }
                  const [d, ks_time] = timing(
                    () => -Math.log2(τ.ks_alpha()),
                    ''
                  )
                  τ.stats.ks_time += ks_time
                  return d
                })
              )
            ),
            dN => quantiles(dN, qQ)
          )
        ),
      'updates'
    )

    return {
      data: round(dQN, 3),
      names: nQ,
      stats: {
        ...τ.stats,
        size: τ.J /* for eval_chart */,
        ess: round(transpose(essRN).map(median)),
        essu: round(transpose(essuRN).map(median)),
        essr: round(transpose(essrRN).map(median)),
        Δφ: round(transpose(ΔφRN).map(median), 1),
        mks: round(transpose(mksRN).map(median), 1),
        mar: round(transpose(marRN).map(median)),
      },
      summary: this.summarize_stats({ ...τ.stats }),
    }
  }

  // posterior `pJ` for current `samples` (`xJ`)
  posterior(log_wJ = array(this.J)) {
    const obs = this.observed_descendants()
    assert(obs.length, 'missing observed descendants for posterior marginal')
    return normalize_exp(this._posterior(this.xJ, log_wJ, obs))
  }

  // posterior marginal over variables `YK`
  // marginalizes over all combinations of samples of `YK`
  posterior_marginal(...YK) {
    assert(YK.length, 'missing variables to marginalize over')
    const obs = this.observed_descendants()
    assert(obs.length, 'missing observed descendants for posterior marginal')
    const pJ = zeroes(this.J)
    const log_wJ = array(this.J) // buffer for posterior computations
    this._posterior_marginal(pJ, log_wJ, obs, ...YK)
    return normalize(pJ) // renormalize across combinations
  }

  // descendants that are `observed`
  observed_descendants() {
    if (!this.children) return []
    // NOTE: descendants can be duplicated in a DAG structure
    return uniq(
      flatten(
        this.children.map(c => {
          return c.observed ? c : c.observed_descendants()
        })
      )
    )
  }

  // descendants w/ `target` defined
  targeted_descendants() {
    if (!this.children) return []
    // NOTE: descendants can be duplicated in a DAG structure
    return uniq(
      flatten(
        this.children.map(c => {
          return c.target ? c : c.targeted_descendants()
        })
      )
    )
  }

  // is `A` an ancestor?
  // `A==this` counts as ancestor
  has_ancestor(A) {
    if (this == A) return true
    if (!this.parents) return false
    return this.parents.some(p => p.has_ancestor(A))
  }

  // random `value` for ancestor `A==a`
  // temporarily sets fixed value `a` for `A`
  value_for_ancestor(A, a) {
    A.v = a
    const x = this.value
    A.v = undefined
    return x
  }

  // distance (nodes) from ancestor `A`
  // distance is 0 if `A==this`, ∞ if `A` is not an ancestor
  distance_from_ancestor(A) {
    if (this == A) return 0
    if (!this.parents) return Infinity
    return 1 + min(this.parents.map(p => p.distance_from_ancestor(A)))
  }

  _posterior_marginal(pJ, log_wJ, obs, Y, ...YK) {
    // add to pJ
    if (!Y) add(pJ, normalize_exp(this._posterior(this.xJ, log_wJ, obs)))
    // enumerate combinations of samples of variables YK recursively
    repeat(Y.J, j => {
      Y.j = j
      this._posterior_marginal(pJ, log_wJ, obs, YK)
    })
    Y.j = undefined
  }

  // enable_stats([stats])
  // enables statistics
  // |`samples`  | number of initial `samples` set
  // |`weights`  | number of initial `weights` set
  // |`reweights`| number of reweights
  // |`resamples`| number of resamples
  // |`moves`    | number of moves
  // |`proposals`| number of proposed values
  // |`accepts`  | number of accepted proposals
  // can start/resume from given `stats`
  // disables stats if `stats` is falsy
  enable_stats(stats) {
    if (defined(stats) && !stats) this.stats = undefined
    else
      this.stats = {
        samples: 0,
        weights: 0,
        reweights: 0,
        resamples: 0,
        moves: 0,
        proposals: 0,
        accepts: 0,
        ...stats,
      }
    return this
  }

  // disables statistics
  disable_stats() {
    this.stats = undefined
    return this
  }

  // summarizes stats
  // TODO: this should just be a recursive rounding utility
  summarize_stats(stats = this.stats, digits = 3) {
    if (!stats) return stats
    return mapValues(stats, v => {
      if (isArray(v) && isNumber(_.last(v))) return round(_.last(v), digits)
      if (typeof v == 'object') return this.summarize_stats(v)
      return isNumber(v) ? round(v, digits) : v
    })
  }

  // enables move tracking for last `M` moves
  // from/to value pair is recorded for last `M` moves
  // useful for detecting convergence in `update()`
  // disables move tracking if `M==0`
  enable_move_tracking(M) {
    check(M >= 0, 'invalid move tracking history size')
    if (M == 0) {
      // M=0 means disable
      this.M = this.m = this.xM = this.yM = undefined
      return
    }
    if (M == this.M) return
    this.M = M
    this.xM = array(M).fill(undefined)
    this.yM = array(M).fill(undefined)
    this.m = 0 // next move index
    return this
  }

  // disables move tracking
  disable_move_tracking() {
    this.enable_move_tracking(0)
    return this
  }

  // name([name])
  // name of random variable
  // can set name to `name`
  name(name) {
    if (name) {
      this._name = name
      return this
    }

    // TODO: think about this more ... is there a better way to structure init or subclasses? these functions that take/return objects... are they some kind of special initializer?
    Random(
      { A, B, C },
      ({ A, B }) => ({ C: `${A}->${B}` }),
      ({ A, C }) => ({ D: `${A}->${C}` })
    )

    return name
  }

  _missing(method) {
    fatal(`${this.type}.${method} missing`)
  }
  // static version for static properties/methods
  static _missing(method) {
    fatal(`${this.type}.${method} (static) missing`)
  }

  //   #random/hooks for subclasses are:
  // - #/_init initializes process state & parameters.
  // - #/_domain returns domain of random process.
  // - #/_value and #/_sample return random values from prior.
  // - #/_prior computes prior density for process at sample points.
  //   - _Enables inference_ of values via #random/methods/update (after #random/methods/sample).
  // - #/_weight computes ancestor weights, ideally ∝likelihood.
  //   - _Enables observation_ of values for _inference on ancestors_ via [update](#random/methods/update).
  // - #/_propose computes proposals for sampling from _weighted_ prior.
  //   - _Enables inference_ of values via #random/methods/update.
  // #_/_init #_/_domain #_/_prior #_/_value #_/_sample #_/_propose #_/_weight

  // _init(params) initializes process state & parameters
  // must return params object or undefined (no params)
  _init(params) {
    return params
  }

  // optional static and instance methods that describe domain
  // instances can invoke static members as this.constructor.member
  // these are type-dependent with no standard yet
  static _domain() {
    this._missing('_domain')
  }
  _domain(params) {
    this._missing('_domain')
  }

  // _value(θ) returns random value from prior
  _value(θ) {
    this._missing('_value')
  }

  // _sample(xJ, wJ, θ) computes samples from prior
  // must fill xJ with samples, wJ with weights (if weighted)
  // must marginalize over any random parameters (parents)
  // can use θ._sample for additional samples from parents
  // can ignore wJ if this._sample_weighted is false
  // must ignore wJ if undefined (e.g. when J==1)
  // ideal weights are p(x)/π(x) if p≠π (p sampling)
  // default implementation uses _value(θ._sample())
  _sample(xJ, wJ, θ) {
    if (wJ) this._missing('_sample (weighted)')
    fill(xJ, j => this._value(θ._sample()))
  }

  // _prior(xJ, log_wJ, θ) computes prior density
  // must _add_ to log_wJ the log-prior for samples xJ
  // must marginalize over any random parameters (parents)
  // can use θ._sample for additional samples from parents
  // can add arbitrary constant, e.g. to shift log(c) to 0
  // default implementation (no-op) is equivalent to uniform prior
  _prior(xJ, log_wJ, θ) {}

  // _weight(θK, log_wK, exponent) computes weights for params θK
  // must _add_ to log_wK from inside θK._scan((k,θ)=>{ ... })
  // can use destructuring, e.g. θK._scan((k,{a,b})=>{ ... })
  // must marginalize over any random (intermediate) parents
  // can use θ._sample for additional samples for parents
  // can use exponent∈[0,1] as bandwidth or temperature
  // exponent is always multiplied into returned log_wJ
  // can use this.cache to cache computations
  // ideal weights are ∝likelihood
  _weight(θK, log_wK, exponent) {
    this._missing('_weight')
  }

  // _propose(xJ, yJ, log_wJ, exponent, θ) computes proposals
  // must fill yJ with proposals, _add_ weights to log_wJ
  // must marginalize over any random parameters (parents)
  // can use θ._sample for additional samples from parents
  // may depend on weight_exponent ∈ [0,1] (see _weight)
  // proposal weights are ratios log(q(x|y)/q(y|x))
  _propose(xJ, yJ, log_wJ, weight_exponent, θ) {
    this._missing('_propose')
  }

  // TODO: #random/graph, and #random/eval_chart
  // TODO: tests, benchmarks
  // TODO: processes, tests, benchmarks, evals
  // TODO: generic "program" wrapper?
}
