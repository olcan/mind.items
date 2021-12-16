// is `x` from `domain`?
// | sampler function | `x` via function `≡{via:func}`
// | type string      | `x` is of type `≡{is:type}`
// | array            | `x` in array, `≡{in:array}`
// | object           | `x` matching constraints
// | `{}`             | everything (no constraints)
// | `via:func`       | `func._domain || {}`
// | `is:type`        | `≡ is(x,type)` see [types](#util/core/types)
// | `in:[…]`         | `≡ […].includes(x)`, see [sameValueZero](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness)
// | `in_eq:[…]`      | values `x==y`
// | `in_eqq:[…]`     | values `x===y`
// | `in_equal:[…]`   | values `equal(x,y)`, see [isEqual](https://lodash.com/docs/4.17.15#isEqual)
// | `eq:y`           | equality `x==y`
// | `eqq:y`          | strict equality `x===y`
// | `equal:y`        | equality via `equal(x,y)`
// | `gte|lte:y`      | inequality `x≥y`, `x≤y`
// | `gt|lt:y`        | strict inequality `x>y`, `x<y`
// | `and|or:[…]`     | composite domain
// `false` for unknown (or missing) `domain`
function from(x, domain) {
  if (!domain) return false
  if (is_function(domain)) return from({ via: domain })
  if (is_string(domain)) return is(x, domain) // ≡{is:type}
  if (is_array(domain)) return domain.includes(x) // ≡{in:array}
  if (!is_object(domain)) false
  return Object.keys(domain).every(key => {
    switch (key) {
      case 'via':
        if (is_function(domain.via)) {
          // function may optionally declare return domain as _domain
          // otherwise function is allowed to return anything
          if (domain.via._domain) return from(x, domain.via._domain)
          else return true // function can return anything
        } else return false // unknown "via" domain
      case 'is':
        return is(x, domain.is)
      case 'in':
        return domain.in.includes(x) // sameValueZero
      case 'in_eq':
        return domain.in_eq.some(y => x == y)
      case 'in_eqq':
        return domain.in_eqq.some(y => x === y)
      case 'in_equal':
        return domain.in_equal.some(y => equal(x, y))
      case 'eq':
        return x == domain.eq
      case 'eqq':
        return x === domain.eqq
      case 'equal':
        return equal(x, domain.equal)
      case 'gte':
        return x >= domain.gte
      case 'lte':
        return x <= domain.lte
      case 'gt':
        return x > domain.gt
      case 'lt':
        return x < domain.lt
      case 'and':
        return domain.and.every(dom => from(x, dom))
      case 'or':
        return domain.or.some(dom => from(x, dom))
      default:
        return key[0] == '_' // accept private _key only (for internal use)
    }
  })
}

// sample value `x` from `domain`
// random variable is denoted `X ∈ dom(X)`
// _prior model_ `P(X)` is defined or implied by `domain`
// can be _conditioned_ as `P(X|c)` using `condition(c)`
// can be _weighted_ as `∝ P(X) × W(X)` using `weight(…)`
// sampler function `domain` is passed new _sampler `context`_
// non-function `domain` requires outer `sample(context=>{ … })`
// special _sampler domain_ can specify `domain._prior`, `._posterior`
// conditions/weights are scoped by outer `sample(context=>{ … })`
// samples are tied to _lexical context_, e.g. are constant in loops
// `options` for all domains:
// | `name`        | name of sampled value
// |               | default inferred from lexical context
// |               | e.g. `let x = sample(…) ≡ sample(…,{name:'x'})`
// | `prior`       | prior sampler `f => f(x,[log_pw=0])`
// |               | `x~S(X), log_pw=log(∝p(x)/s(x))`
// |               | _default_: `domain._prior`
// | `posterior`   | posterior (chain) sampler `(f,x) => f(y,[log_mw=0])`
// |               | `y~Q(Y|x), log_mw=log(∝q(x|y)/q(y|x))`
// |               | _default_: `domain._posterior`
// | `target`      | target cdf, sample, or sampler domain for `tks` metric
// |               | `tks` is _target KS_ `-log2(ks1|2_test(sample, target))`
// |               | for sampler domain, sample `size` can be specified
// |               | default `size` is inherited from context (see below)
// |               | also see below `targets` option for context
// |               | _default_: no target (`tks=0`)
// `options` for sampler function (_context_) domains `context=>{ … }`:
// | `size`        | sample size `J`, _default_: `1000`
// |               | ≡ _independent_ runs of `context=>{ … }`
// |               | ≡ posterior update chains (dependent runs)
// | `resample_if` | resample predicate `context => …`
// |               | called once per update step `context.u = 0,1,…`
// |               | _default_: `({ess,essu,J}) => ess/essu < clip(essu/J,.5,1)`
// |               | default allows `ess→essu→J` w/ effective moves for `essu→J`
// | `move_while`  | move predicate `context => …`
// |               | called _until false_ every update step `context.u = 0,1,…`
// |               | `context.p` is proposed move count (current update step)
// |               | `context.a` is accepted move count (current update step)
// |               | `context.m` is total move count (all update steps)
// |               | _default_: `({essu,J,a}) => essu<J/2 || a<J`
// |               | default allows `essu→J` w/ up to `J/2` slow-moving samples
// | `weight_exp`  | weight exponent function `u => …` `∈[0,1]`
// |               | multiplied into `log_w` and `log_wu(u)` (if defined)
// |               | triggers warning if sampling is stopped at `weight_exp<1`
// |               | does not affect `-inf` weights, e.g. due to conditioning
// |               | _default_: `u => min(1, (u+1)/3)`
// | `max_updates` | maximum number of update steps, _default_: `inf`
// | `min_updates` | minimum number of update steps, _default_: `0`
// | `max_time`    | maximum time (ms) for sampling, _default_: `100` ms
// | `min_time`    | minimum time (ms) for sampling, _default_: `0` ms
// | `min_ess`     | minimum `ess` desired (within `max_time`), _default_: `J/2`
// | `max_mks`     | maximum `mks` desired (within `max_time`)
// |               | `mks` is _move KS_ `-log2(ks2_test(from, to))`
// |               | _default_: `3` ≡ failure to reject same-dist at `ɑ<1/8`
// | `mks_buffer`  | move buffer size `B` for `mks`, _default_: `1000`
// | `mks_period`  | move buffer period for `mks`, _default_: `ceil(3*J/M)`
// | `updates`     | target number of update steps, _default_: auto
// |               | _warning_: can cause pre-posterior sampling w/o warning
// | `time`        | target time (ms) for sampling, _default_: auto
// |               | _warning_: can cause pre-posterior sampling w/o warning
// | `targets`     | object of targets for named values sampled in this context
// |               | see `target` option above for possible targets
// | `params`      | object of parameters to be captured from parent context
function sample(domain, options = undefined) {
  // decline non-function domain which requires a parent sampler that would have replaced calls to sample(…)
  assert(
    is_function(domain),
    `invalid sample(…) call outside of sample(context=>{ … })`
  )
  // decline target for root sampler since that is no parent to track tks
  assert(!options?.target, `invalid target outside of sample(context=>{ … })`)
  return new _Sampler(domain, options).sample()
}

function _benchmark_sample() {
  _benchmark_options.N = 10
  benchmark(
    () => sample(() => {}, { size: 10000, updates: 0 }),
    () => sample(() => {}, { size: 10000, updates: 1 }),
    () => sample(() => {}, { size: 1000, updates: 10 }),
    () => sample(() => {}, { size: 100, updates: 10 }),
    () => sample(() => sample(uniform()), { size: 100, updates: 10 }),
    () =>
      sample(
        () => {
          let a = sample(uniform())
          let b = sample(uniform(a, 1))
          condition(b > 0.9)
        },
        { size: 100, updates: 20 }
      )
  )
}

// condition samples on `c`
// scoped by outer `sample(context=>{ … })`
// conditions models `P(X) → P(X|c)` for all `X` in context
// corresponds to _indicator weights_ `𝟙(c|X) = (c ? 1 : 0)`
// `≡ weight(c ? 0 : -inf)`, see more general `weight(…)` below
// requires `O(1/P(c))` samples; ___can fail for rare conditions___
// _weight sequence_ `log_wu(u)=0↘-∞, u=0,1,…` can help, see #/weight
// _likelihood weights_ `∝ P(c|X) = E[𝟙(c|X)]` can help, see `weight(…)`
function condition(c, log_wu = undefined) {
  fatal(`unexpected (unparsed) call to condition(…)`)
}

// weight samples by `log_w`
// scoped by outer `sample(context=>{ … })`
// normalized weights can be denoted as prob. dist. `W(X)`
// augments models `P(X) -> ∝ P(X) × W(X)` for all `X` in context
// _likelihood weights_ `∝ P(c|X)` _fork-condition_ models `P(X) → P(X|c')`
// effective sample size (ess) becomes `1/E[W²]`; ___can fail for extreme weights___
// _weight sequence_ `log_wu(u)=0→log_w, u=0,1,…` can help
// see #/weight for technical details
function weight(log_w, log_wu = undefined) {
  fatal(`unexpected (unparsed) call to weight(…)`)
}

// is `wJ` uniform?
function _uniform(wJ, wj_sum = sum(wJ), ε = 1e-6) {
  const w_mean = wj_sum / wJ.length
  const [w_min, w_max] = [(1 - ε) * w_mean, (1 + ε) * w_mean]
  return wJ.every(w => w >= w_min && w <= w_max)
}

class _Sampler {
  constructor(func, options) {
    this.domain = func // save sampler function as domain
    this.start_time = Date.now()
    // merge in default options
    const J = (this.J = options?.size ?? 1000)
    assert(J > 0, `invalid sample size ${J}`)
    const B = (this.B = options?.mks_buffer ?? 1000)
    assert(B > 0 && B % 2 == 0, `invalid move buffer size ${B}`)
    this.options = options = assign(
      {
        stats: false,
        quantiles: false,
        log: false, // silent by default
        warn: true,
        params: {},
        quantile_runs: 100,
        size: J,
        resample_if: ({ ess, essu, J }) => ess / essu < clip(essu / J, 0.5, 1),
        move_while: ({ essu, J, a }) => essu < J / 2 || a < J,
        weight_exp: u => min(1, (u + 1) / 3),
        max_updates: inf,
        min_updates: 0,
        max_time: 100,
        min_time: 0,
        min_ess: J / 2,
        max_mks: 3,
        mks_buffer: B,
        mks_period: ceil((3 * J) / B),
      },
      options
    )
    // set up default prior/posterior sampler functions
    // note posterior here refers to posterior in parent context
    // for posterior, we need to consider weights for log(∝q(x|y)/q(y|x))
    // for efficiency, we require parent to ensure ess≈J s.t. weights≈0
    const sampler = f => f(this.sample())
    this._prior = this._posterior = sampler

    assign(this, this._parse_func(func))
    this.K = this.values.length
    if (options.log) print(`parsed ${this.K} sampled values in ${this.func}`)

    // initialize run state
    this.xJK = matrix(J, this.K) // samples per run/value
    this.xJk = array(J) // tmp array for sampling columns of xJK
    this.pxJK = matrix(J, this.K) // prior samples per run/value
    this.yJK = matrix(J, this.K) // posterior (chain) samples per run/value
    this.yJk = array(J) // tmp array for sampling columns of yJK
    this.m = 0 // move count
    this.mb = 0 // moves since last buffered move (i.e. unbuffered moves)
    this.b = 0 // moves buffered, also index into move buffers xBK,yBK
    this.xBK = array(this.B)
    this.yBK = array(this.B)
    this.log_pwJ = array(J) // prior log-weights per run
    this.log_wJ = array(J) // posterior log-weights
    this.log_wufJ = array(J) // posterior log-weight sequences
    this.log_wuJ = array(J) // posterior log-weights for step u
    this.log_rwJ = array(J) // posterior/sample ratio log-weights
    this.log_mwJ = array(J) // posterior move log-weights
    this.log_cwJ = array(J) // posterior candidate log-weights
    this.log_cwufJ = array(J) // posterior candidate log-weight sequences
    this.xJ = array(J) // return values
    this.pxJ = array(J) // prior return values
    this.yJ = array(J) // proposed return values
    this.jJ = array(J) // sample indices
    this.jjJ = array(J) // shuffle indices
    // resample (shuffle) buffers
    this._jJ = array(J)
    this._xJ = array(J)
    this._xJK = array(J)
    this._log_wJ = array(J)
    this._log_wufJ = array(J)
    this._log_wuJ = array(J)

    // define cached properties
    cache(this, 'pwJ', [])
    cache(this, 'pwj_sum', ['pwJ'], () => sum(this.pwJ))
    cache(this, 'pwj_ess', ['pwJ'], () => ess(this.pwJ, this.pwj_sum))
    cache(this, 'pwj_uniform', ['pwJ'], () => _uniform(this.pwJ, this.pwj_sum))

    cache(this, 'counts', [])
    cache(this, 'essu', ['counts'], () => ess(this.counts, J))

    cache(this, 'rwJ', [])
    cache(this, 'rwJ_agg', ['rwJ', 'counts'])
    cache(this, 'rwj_sum', ['rwJ'], () => sum(this.rwJ))
    cache(this, 'rwj_ess', ['rwJ_agg'], () => ess(this.rwJ_agg, this.rwj_sum))
    cache(this, 'rwj_uniform', ['rwJ'], () => _uniform(this.rwJ, this.rwj_sum))
    cache(this, 'wsum', [], () => sum(this.log_wJ, exp))
    cache(this, 'rwX', ['rwJ_agg'])
    cache(this, 'elw', ['rwJ'])
    cache(this, 'tks', ['rwJ'])
    cache(this, 'mks', [])

    // initialize stats
    this._init_stats()

    // sample prior (along w/ u=0 posterior)
    this._start_timer()
    this._sample_prior()
    if (options.log) {
      print(`sampled ${J} prior runs (ess ${this.pwj_ess}) in ${this.timer}ms`)
      print(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=0`)
    }

    // update sample to posterior
    this._start_timer()
    this._update()
    if (options.log) {
      print(`applied ${this.u} updates in ${this.timer}ms`)
      print(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=${this.u}`)
      if (this.stats) print(str(omit(this.stats, 'updates')))
    }

    if (options.quantiles) this._quantiles()
    if (options.plot) this._plot()
  }

  _parse_func(func) {
    // replace sample|condition|weight|... calls
    const js = func.toString()
    const lines = js.split('\n')
    const values = []
    const names = new Set()
    // argument pattern allowing nested parentheses is derived from that in core.js
    // this particular pattern allows up to 5 levels of nesting for now
    // also note javascript engine _should_ cache the compiled regex
    const __sampler_regex =
      /(?:(?:^|\n|;) *(?:const|let|var) *(\w+) *= *|\b)(sample|condition|weight) *\(((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\([^()]*?\)|.+?)*?\)|.+?)*?\)|.+?)*?\)|.+?)*?\)|.+?)*?)\)/gs
    this.js = js.replace(__sampler_regex, (m, name, method, args, offset) => {
      assert(!names.has(name), `duplicate name '${name}' for sampled value`)
      // extract lexical context
      let mt = m
      if (js[offset] == '\n') {
        offset++ // skip leading \n if matched
        mt = m.slice(1)
      }
      const prefix = js.slice(0, offset)
      const suffix = js.slice(offset + mt.length)
      const line_prefix = prefix.match(/.*$/)[0]
      const line_suffix = suffix.match(/^.*/)[0]
      const line_index = _count_unescaped(prefix, '\n')
      const line = lines[line_index]
      check(() => [
        line_prefix + mt + line_suffix,
        line,
        (a, b) => a.startsWith(b),
      ]) // sanity check

      // skip matches inside comments or strings
      if (
        line_prefix.match(/\/\/.*$/) ||
        _count_unescaped(prefix, '/*') > _count_unescaped(prefix, '*/') ||
        _count_unescaped(prefix, '`') % 2 ||
        _count_unescaped(line_prefix, "'") % 2 ||
        _count_unescaped(line_prefix, '"') % 2
      )
        return m

      // skip method calls
      if (line_prefix.match(/\.$/)) return m

      // skip function definitions (e.g. from imported #util/sample)
      if (line_prefix.match(/function *$/)) return m
      if (line_suffix.match(/{ *$/)) return m

      // uncomment to debug replacement issues ...
      // console.log(offset, line_prefix + line_suffix)

      // replace non-sample function all
      if (method != 'sample') return `__sampler._${method}(${args})`

      // parse args, allowing nested parentheses
      // this is naive about strings, comments, escaping, etc
      // but it should work as long as parentheses are balanced
      // let args = ''
      // let depth = 0
      // for (let i = 0; i < suffix.length; i++) {
      //   const c = suffix[i]
      //   if (c == ')' && --depth == 0) break
      //   if (depth) args += c
      //   if (c == '(') depth++
      // }

      // replace sample call
      const k = values.length
      values.push({ js, index: k, offset, name, args, line_index, line })
      names.add(name || k)
      return m.replace(/sample *\(.+\)$/s, `__sampler._sample(${k},${args})`)
    })

    // evaluate new function w/ replacements
    // use wrapper to pass along variables from calling scope/context
    const __sampler = this // since 'this' is overloaded in function(){...}
    // this.func = eval('(' + this.js + ')')
    const params = this.options.params
    const wrapper = `(function({${keys(params)}}) { return ${this.js} })`
    func = eval(wrapper)(params)
    return { func, values, names }
  }

  static stats_keys =
    'ess essu essr elw wsum mar mlw mks tks gap p a m t'.split(/\W+/)

  _init_stats() {
    const options = this.options
    if (!options.stats) return // stats disabled
    // enable ALL stats for stats == true
    if (options.stats == true) options.stats = stats_keys
    // convert string to array of keys
    if (is_string(options.stats)) options.stats = options.stats.split(/\W+/)
    // convert array of string keys to object of booleans (true)
    if (is_array(options.stats)) {
      assert(every(options.stats, is_string), 'invalid option stats')
      options.stats = from_entries(options.stats.map(k => [k, true]))
    }
    assert(
      is_object(options.stats) && every(values(options.stats), is_boolean),
      'invalid option stats'
    )
    const unknown_keys = diff(keys(options.stats), _Sampler.stats_keys)
    assert(empty(unknown_keys), `unknown stats: ${unknown_keys}`)

    this.stats = {
      reweights: 0,
      resamples: 0,
      moves: 0,
      proposals: 0,
      accepts: 0,
      sample_time: 0,
      reweight_time: 0,
      resample_time: 0,
      move_time: 0,
      mks_time: 0,
      tks_time: 0,
    }
  }

  _update_stats() {
    const { stats } = this
    if (!stats) return // stats disabled
    const spec = this.options.stats
    if (empty(spec)) return // no update stats enabled

    const update = {}
    if (spec.ess) update.ess = round(this.ess)
    if (spec.essu) update.essu = round(this.essu)
    if (spec.essr) update.essr = round(100 * clip(this.ess / this.essu))
    if (spec.elw) update.elw = round_to(this.elw, 2)
    if (spec.wsum) update.wsum = round_to(this.wsum, 1)
    if (spec.mar)
      update.mar = this.u == 0 ? 100 : round(100 * (this.a / this.p))
    if (spec.mlw) update.mlw = this.u == 0 ? 0 : round_to(this.mlw, 1)
    if (spec.mks) update.mks = this.u == 0 ? inf : round_to(this.mks, 1)
    if (spec.tks) update.tks = round_to(this.tks, 1)
    if (spec.gap)
      update.gap =
        this.u == 0
          ? round_to(this.log_wuj_gap, 1)
          : round_to(this.log_wuj_gap_before_reweight, 1)
    if (spec.p) update.p = this.u == 0 ? 0 : this.p
    if (spec.a) update.a = this.u == 0 ? 0 : this.a
    if (spec.m) update.m = this.u == 0 ? 0 : this.m - last(stats.updates).m
    if (spec.t) update.t = this.u == 0 ? 0 : this.t - last(stats.updates).t

    if (this.u == 0) stats.updates = [update]
    else stats.updates.push(update)
  }

  _fill_log_wuj(log_wuJ, u = this.u) {
    const { log_wJ, log_wufJ } = this
    const w_exp = this.options.weight_exp(u)
    // note w_exp has no effect on infinities
    fill(log_wuJ, j => (log_wufJ[j] ? log_wufJ[j](u) : w_exp * log_wJ[j]))
    // compute gap allowing for infinities (w/o creating NaNs)
    const gap = (a, b) => (a == b ? 0 : abs(a - b))
    this.log_wuj_gap = max_of(this.log_wuJ, (lwuj, j) => gap(lwuj, log_wJ[j]))
    if (this.log_wuj_gap < 1e-6) this.log_wuj_gap = 0 // chop to 0 below 1e-6
    // clip infinities to enable subtraction in _reweight & _move
    clip_in(log_wuJ, -Number.MAX_VALUE, Number.MAX_VALUE)
  }

  _sample_prior() {
    this._start_timer()
    const { func, xJ, pxJ, pxJK, xJK, jJ } = this
    const { log_pwJ, log_wJ, log_wufJ, log_wuJ, log_rwJ, stats } = this
    this.u = 0 // prior is zero'th update step
    fill(log_pwJ, 0)
    fill(log_wJ, 0)
    fill(log_wufJ, undefined)
    fill(xJ, j => ((this.j = j), func(this)))
    this._fill_log_wuj(log_wuJ)
    // init log_rwJ = log_pwJ + log_wuJ
    fill(log_rwJ, j => log_pwJ[j] + log_wuJ[j])
    fill(jJ, j => j) // init sample indices
    // copy prior samples for sample_prior()
    each(pxJK, (pxjK, j) => copy(pxjK, xJK[j]))
    copy(pxJ, xJ)
    if (stats) stats.sample_time += this.timer
  }

  // reweight for next step (u+1)
  // multiply rwJ by wJ@u+1/wJ@u (could be 1)
  // stop once wJ@u -> ~wJ; difference is called "gap" (max norm)
  _reweight() {
    if (this.log_wuj_gap == 0) return // no longer needed
    this._start_timer()
    const { u, log_wJ } = this
    // print(`reweighting ${u}->${u + 1}, gap ${this.log_wuj_gap}`)
    this._swap('log_wuJ') // store weights for last step (u) in _log_wuJ
    this._fill_log_wuj(this.log_wuJ, u + 1) // compute weights for u+1
    const { log_wuJ, _log_wuJ, log_rwJ, stats } = this
    apply(log_rwJ, (lw, j) => lw + log_wuJ[j] - _log_wuJ[j])
    this.rwJ = null // reset cached posterior ratio weights and dependents
    if (stats) {
      stats.reweights++
      stats.reweight_time += this.timer
    }
  }

  // swap arrays w/ temporary buffers prefixed w/ _
  _swap(...names) {
    each(names, n => (this[n] = swap(this[`_${n}`], (this[`_${n}`] = this[n]))))
  }

  // resample step
  // resample based on rwJ, reset rwJ=1
  _resample() {
    this._start_timer()
    const { J, jjJ, rwj_uniform, rwJ, rwj_sum, log_rwJ, stats, _jJ, jJ } = this
    const { _xJ, xJ, _xJK, xJK, _log_wJ, log_wJ, _log_wufJ, log_wufJ } = this
    const { _log_wuJ, log_wuJ } = this
    if (rwj_uniform) random_discrete_uniform_array(jjJ, J)
    else random_discrete_array(jjJ, rwJ, rwj_sum) // note: sorted indices
    scan(jjJ, (j, jj) => {
      _jJ[j] = jJ[jj]
      _xJ[j] = xJ[jj]
      _xJK[j] = xJK[jj]
      _log_wJ[j] = log_wJ[jj]
      _log_wufJ[j] = log_wufJ[jj]
      _log_wuJ[j] = log_wuJ[jj]
    })
    this._swap('jJ', 'xJ', 'xJK', 'log_wJ', 'log_wufJ', 'log_wuJ')
    fill(log_rwJ, 0) // reset weights now "baked into" sample
    this.rwJ = null // reset cached posterior ratio weights and dependents
    this.counts = null // since jJ changed
    this.wsum = null // since log_wJ changed
    if (stats) {
      stats.resamples++
      stats.resample_time += this.timer
    }
  }

  // move step
  // take metropolis-hastings steps along posterior chain
  _move() {
    this._start_timer()
    const { J, u, func, yJ, yJK, xJ, xJK, jJ, jjJ, log_mwJ } = this
    const { log_cwJ, log_cwufJ, log_wJ, log_wufJ, log_wuJ, stats } = this
    fill(log_mwJ, 0) // reset move log-weights log(∝q(x|y)/q(y|x))
    fill(log_cwJ, 0) // reset posterior candidate log-weights
    fill(log_cwufJ, undefined) // reset posterior candidate future log-weights
    each(yJK, yjK => fill(yjK, undefined))
    this.moving = true // enable posterior chain sampling into yJK in _sample
    const tmp_log_wJ = log_wJ // to be restored below
    const tmp_log_wufJ = log_wufJ // to be restored below
    this.log_wJ = log_cwJ // redirect log_wJ -> log_cwJ temporarily
    this.log_wufJ = log_cwufJ // redirect log_wufJ -> log_cwufJ temporarily
    fill(yJ, j => ((this.j = j), func(this)))
    this.log_wJ = tmp_log_wJ // restore log_wJ
    this.log_wufJ = tmp_log_wufJ // restore log_wufJ
    this.moving = false // back to using xJK

    // accept/reject proposed moves
    this.move_proposals = 0
    this.move_accepts = 0
    this.move_log_w = 0
    const w_exp = this.options.weight_exp(u)
    repeat(J, j => {
      let log_cwuj = log_cwufJ[j] ? log_cwufJ[j](u) : w_exp * log_cwJ[j]
      log_cwuj = clip(log_cwuj, -Number.MAX_VALUE, Number.MAX_VALUE)
      const log_dwj = log_cwuj - log_wuJ[j]
      if (random() < exp(log_mwJ[j] + log_dwj)) {
        // update move buffer
        this.m++
        this.mb++
        if (this.mb == this.options.mks_period) {
          this.mb = 0 // now 0 moves since last buffered
          const b = this.b++ % this.B
          this.xBK[b] = xJK[j]
          this.yBK[b] = yJK[j]
          this.mks = null // reset mks since new move buffered
        }
        // update state to reflect move
        xJ[j] = yJ[j]
        xJK[j] = yJK[j] // can't copy since rows can share arrays
        yJK[j] = array(this.K) // replace array since moved into xJK
        log_wJ[j] = log_cwJ[j]
        log_wufJ[j] = log_cwufJ[j]
        log_wuJ[j] = log_cwuj
        // log_dwj is already reflected in sample so log_rwJ is invariant
        // was confirmed (but not quite understood) in earlier implementations
        // log_rwJ[j] += log_dwj
        jJ[j] = J + j // new index remapped below
        this.move_log_w += log_dwj
        this.move_accepts++
      }
    })
    this.move_proposals += J

    // reassign indices and reset state if any moves were accepted
    if (this.move_accepts > 0) {
      fill(jjJ, -1)
      let jj = 0 // new indices
      apply(jJ, j => (j >= J ? jj++ : jjJ[j] >= 0 ? jjJ[j] : (jjJ[j] = jj++)))
      this.rwJ = null // reset cached posterior ratio weights and dependents
      this.counts = null // since jJ changed
      this.wsum = null // since log_wJ changed
    }

    if (stats) {
      stats.moves++
      stats.proposals += J
      stats.accepts += this.move_accepts
      stats.move_time += this.timer
    }
  }

  _update() {
    const {
      time,
      updates,
      max_time,
      min_time,
      max_updates,
      min_updates,
      max_mks,
      min_ess,
      weight_exp,
      resample_if,
      move_while,
    } = this.options

    assert(this.u == 0, '_update requires u=0')

    // update stats for u=0
    this._update_stats()

    // skip updates if target updates=0 or time=0
    if (updates == 0 || time == 0) return

    do {
      // save gap before reweight (recorded in stats for this step)
      this.log_wuj_gap_before_reweight = this.log_wuj_gap
      this._reweight() // reweight for step u+1

      // stats updates and termination checks must be done at this point (after reewight, before resample & move) but not on first pass (u=0)
      if (this.u > 0) {
        // update stats for u=1,...
        this._update_stats()

        // continue based on min_time/updates
        // minimums supercede maximum and target settings
        if (this.t >= min_time && this.u >= min_updates) {
          // check target updates
          if (this.u >= updates) {
            const { t, u } = this
            if (this.options.log)
              print(`reached target updates u=${u}≥${updates} (t=${t}ms)`)
            break
          }

          // check target time
          if (this.t >= time) {
            const { t, u } = this
            if (this.options.log)
              print(`reached target time t=${t}≥${time}ms (u=${u})`)
            break
          }

          // check target ess/mks/mlw if min_time/updates satisfied
          if (this.ess >= min_ess && this.mks <= max_mks && this.mlw <= 0) {
            const { t, u, ess, mks, mlw } = this
            const rt = round_to
            if (this.options.log)
              print(
                `reached target ess=${round(ess)}≥${min_ess}, ` +
                  `mks=${rt(mks, 3)}≤${max_mks}, mlw=${rt(mlw, 3)}≤0 ` +
                  `@ u=${u}, t=${t}ms`
              )
            break
          }

          // check max_time/updates for potential early termination
          if (this.t > max_time || this.u > max_updates) {
            const { t, u, log_wuj_gap } = this
            if (this.options.warn) {
              // warn about running out of time or updates
              if (t > max_time)
                warn(`ran out of time t=${t}>${max_time}ms (u=${u})`)
              else warn(`ran out of updates u=${u}>${max_updates} (t=${t}ms)`)
              // warn about pre-posterior sample w/ log_wuj_gap>0
              if (log_wuj_gap > 0)
                warn(`pre-posterior sample w/ log_wuj_gap=${log_wuj_gap}>0`)
            }
            break
          }
        }
      }

      this.u++ // advance to next step

      // resample
      if (resample_if(this)) this._resample()

      // move
      // must be done after reweights (w/ same u) for accurate mlw
      this.p = 0 // proposed move count
      this.a = 0 // accepted move count
      this.mlw = 0 // log_w improvement
      while (move_while(this)) {
        this._move()
        this.p += this.move_proposals
        this.a += this.move_accepts
        this.mlw += this.move_log_w
      }
    } while (true)
  }

  _quantiles() {
    const options = this.options
    assert(size(options.stats) == 1, 'quantiles require single stats:<name>')
    // enable default quantiles for quantiles == true
    if (options.quantiles == true) options.quantiles = [0, 0.1, 0.5, 0.9, 1]

    // execute necessary runs
    const R = options.quantile_runs
    assert(is_integer(R) && R > 0, 'invalid option quantile_runs')
    const f = this.domain // sampler domain function
    const o = clone_deep(options)
    o.updates = o.min_updates = o.max_updates = this.u // fix update steps
    o.log = o.plot = o.warn = o.quantiles = false // disable quantiles, output
    const sR = [this.stats, ...array(R - 1, r => new _Sampler(f, o).stats)]
    if (options.log) print(`completed ${R} quantile runs in ${this.t}ms`)

    // compute quantiles of global stats
    const qQ = options.quantiles
    assert(is_array(qQ) && qQ.every(is_prob), 'invalid option quantiles')
    const qR = n => quantiles(map(sR, n), qQ)

    const s = omit(this.stats, 'updates')
    const stats = map_values(s, (v, k) =>
      round_to(quantiles(map(sR, k), qQ), 2)
    )
    if (options.log) print(str(stats))

    // compute quantiles of update stats
    const sn = keys(options.stats)[0]
    const sUQ = apply(
      matrixify(transpose(sR.map(sr => map(sr.updates, sn)))) /*sUR*/,
      suR => round_to(quantiles(suR, qQ), 2)
    )
    // print(str(sUQ))
    this.stats.updates = sUQ.map(suQ =>
      from_entries(qQ.map((qq, q) => ['q' + round(100 * qq), suQ[q]]))
    )
  }

  _plot() {
    const updates = this.stats?.updates
    if (updates) {
      const spec = this.options.stats
      let quantiles
      if (this.options.quantiles)
        quantiles = this.options.quantiles.map(q => 'q' + round(100 * q))

      // y is logarithmic ks p-value axis
      // y2 is linear percentage axis
      // stats that do not fit either are rescaled to 0-100 and plotted on y2
      const y_ticks = range(8).map(e => round_to(log2(`1e${e}`), 2))
      const y_labels = ['1', '10', '10²', '10³', '10⁴', '10⁵', '10⁶', '10⁷']

      const values = []
      const series = []
      const formatters = { __function_context: {} }
      const formatter_context = formatters.__function_context
      // function for adding line to plot
      const add_line = (prop, options = {}) => {
        if (quantiles && !quantiles.includes(prop)) {
          each(quantiles, k => add_line(k, omit(options, 'label')))
          return
        }
        const f = options.mapper ?? (x => x)
        values.push(updates.map(su => f(su[prop])))
        options.label ??= prop
        options.axis ??= 'y'
        if (options.formatter) formatters[prop] = options.formatter
        if (options.formatter_context)
          merge(formatter_context, options.formatter_context)
        series.push(omit(options, ['mapper', 'formatter']))
      }
      // function for adding a "rescaled" line to y2 axis of plot
      const add_rescaled_line = (n, range) => {
        if (quantiles && !quantiles.includes(prop)) {
          // push quantile series instead, rescaling across all quantiles
          const [a, b] = range ?? min_max_in(flat(updates.map(_.values)))
          each(quantiles, k => add_rescaled_line(k, [a, b]))
          return
        }
        const [a, b] = range ?? min_max_in(updates.map(u => u[n]))
        add_line(n, {
          axis: 'y2',
          mapper: x => round_to((100 * (x - a)) / max(b - a, 1e-6), 1),
          formatter: eval(
            `(x => round_to((x / 100) * (${n}_b - ${n}_a) + ${n}_a, 1))`
          ),
          formatter_context: { [`${n}_a`]: a, [`${n}_b`]: b },
        })
      }

      if (spec.mks)
        add_line('mks', {
          formatter: x =>
            2 ** x < 1000 ? round_to(2 ** x, 2) : '>10^' + ~~log10(2 ** x),
        })
      if (spec.tks) add_line('tks')
      if (spec.gap) add_line('gap')
      if (spec.ess)
        add_line('ess', {
          axis: 'y2',
          mapper: x => (100 * x) / this.J,
          formatter: x => `${x}%`,
        })
      if (spec.essu)
        add_line('essu', {
          axis: 'y2',
          mapper: x => (100 * x) / this.J,
          formatter: x => `${x}%`,
        })
      if (spec.essr) add_line('essr', { axis: 'y2', formatter: x => `${x}%` })
      if (spec.mar) add_line('mar', { axis: 'y2', formatter: x => `${x}%` })

      if (spec.wsum) add_rescaled_line('wsum')
      if (spec.elw) add_rescaled_line('elw')
      let mlw_0_on_y // for grid line to indicate 0 level for mlw on y axis
      if (spec.mlw) {
        add_rescaled_line('mlw')
        const [a, b] = min_max_in(updates.map(u => u.mlw))
        mlw_0_on_y = (-a / max(b - a, 1e-6)) * last(y_ticks)
      }
      if (spec.p) add_rescaled_line('p')
      if (spec.a) add_rescaled_line('a')
      if (spec.m) add_rescaled_line('m')
      if (spec.t) add_rescaled_line('t')

      plot({
        name: 'updates',
        data: { values },
        renderer: 'lines',
        renderer_options: {
          series,
          data: {
            colors: {
              // weight-related stats are gray
              // elw & wsum are closely related, mlw is dashed to distinguish
              mlw: '#666',
              elw: '#666',
              wsum: '#666',
              ...from_pairs(
                quantiles?.map(q => [
                  q,
                  q == 'q50'
                    ? '#ddd'
                    : q == 'q0' || q == 'q100'
                    ? '#444'
                    : '#777',
                ])
              ),
            },
          },
          axis: {
            y: {
              show: series.some(s => s.axis === 'y'),
              min: 0,
              max: last(y_ticks),
              tick: {
                values: y_ticks,
                format: y => y_labels[round(log10(2 ** y))] ?? '?',
                __function_context: { y_labels },
              },
            },
            y2: {
              show: series.some(s => s.axis === 'y2'),
              min: 0,
              tick: {
                values: [0, 20, 40, 60, 80, 100],
                format: y => y + '%',
              },
            },
          },
          tooltip: {
            format: {
              title: x => 'step ' + x,
              value: (v, _, n) => formatters[n]?.(v) ?? v,
              __function_context: { formatters },
            },
          },
          grid: {
            y: {
              lines: compact([
                { value: 1, class: 'accept strong' },
                { value: round_to(log2(10), 2), class: 'accept' },
                { value: round_to(log2(100), 2), class: 'accept weak' },
                mlw_0_on_y
                  ? { value: round_to(mlw_0_on_y, 2), class: 'mlw' }
                  : null,
              ]),
            },
          },
          // point: { show: false },
          padding: { right: 50, left: 35 },
          styles: [
            `#plot .c3-ygrid-line line { opacity: 1 !important }`,
            `#plot .c3-ygrid-line.mlw line { opacity: 1 !important; stroke-dasharray:5,3;}`,
            `#plot .c3-ygrid-line.accept line { opacity: .1 !important; stroke:#0f0; stroke-width:5px }`,
            `#plot .c3-ygrid-line.strong line { opacity: .25 !important }`,
            `#plot .c3-ygrid-line.weak line { opacity: .05 !important }`,
            `#plot .c3-target path { stroke-width:2px }`,
            `#plot .c3-target { opacity:1 !important }`,
            // dashed line, legend, and tooltip for mlw
            `#plot .c3-target-mlw path { stroke-dasharray:5,3; }`,
            `#plot .c3-legend-item-mlw line { stroke-dasharray:2,2; }`,
            `#plot .c3-tooltip-name--mlw span { background: repeating-linear-gradient(90deg, #666, #666 2px, transparent 2px, transparent 4px) !important }`,
          ],
        },
        dependencies: ['#_c3'],
      })
    }

    // plot posteriors (vs targets if specified)
    const { J, rwJ, rwj_sum } = this
    each(this.values, (value, k) => {
      const name = value.name

      // include any undefined values for now
      const xJ = array(J, j => this.xJK[j][k])
      const wJ = scale(copy(rwJ), J / rwj_sum) // rescale to sum to J

      if (!value.target) {
        hist(xJ, { weights: rwJ }).hbars({
          name,
          series: [{ label: 'posterior', color: '#d61' }],
        })
        return
      }

      if (is_function(value.target)) {
        warn(`cdf target not yet supported for value '${name}'`)
        return // cdf target not supported yet
      }

      // get target sample w/ weights that sum to J
      const yR = value.target
      const wR = array(value.target.length)
      if (value.target_weights) {
        copy(wR, value.target_weights)
        scale(wR, J / value.target_weight_sum) // rescale to sum to J
      } else {
        fill(wR, J / value.target.length) // rescale to sum to J
      }

      hist([xJ, yR], { weights: [wJ, wR] }).hbars({
        name,
        series: [
          { label: 'posterior', color: '#d61' },
          { label: 'target', color: 'gray' },
        ],
        delta: true, // append delta series
      })
    })
  }

  get t() {
    return Date.now() - this.start_time
  }

  _start_timer() {
    this.timer_start = Date.now()
  }

  get timer() {
    return Date.now() - this.timer_start
  }

  __pwJ() {
    const { J, log_pwJ } = this
    const max_log_pwj = max_in(log_pwJ)
    const pwJ = (this.___pwJ ??= array(J))
    return copy(pwJ, log_pwJ, log_pwj => exp(log_pwj - max_log_pwj))
  }

  __rwJ() {
    const { J, log_rwJ } = this
    const max_log_rwj = max_in(log_rwJ)
    const rwJ = (this.___rwJ ??= array(J))
    return copy(rwJ, log_rwJ, log_rwj => exp(log_rwj - max_log_rwj))
  }

  __rwJ_agg() {
    const { J, jJ, rwJ } = this
    // aggregate over duplicate indices jJ using _rwJ_agg as buffer
    // instead of adding weights, we check consistency and multiply by counts
    const rwJ_agg = (this.___rwJ_agg ??= array(J))
    fill(rwJ_agg, 0)
    each(jJ, (jj, j) => {
      if (rwJ_agg[jj] && rwJ_agg[jj] != rwJ[j])
        throw new Error(
          'inconsistent (random?) condition/weight for identical samples; ' +
            'please ensure sample(…) is used for all random values'
        )
      else rwJ_agg[jj] = rwJ[j]
    })
    return mul(rwJ_agg, this.counts)
  }

  __counts() {
    const { J, jJ } = this
    const counts = (this.___counts ??= array(J))
    fill(counts, 0)
    each(jJ, jj => counts[jj]++)
    return counts
  }

  __rwX() {
    const { jJ, xJ, rwJ_agg } = this
    const rwX = (this.___rwX ??= new Map())
    for (const k of rwX.keys()) rwX.set(k, 0)
    each(jJ, (jj, j) => rwJ_agg[jj] == 0 || rwX.set(xJ[j], rwJ_agg[jj]))
    for (const [k, v] of rwX.entries()) if (v == 0) rwX.delete(k)
    return rwX
  }

  get ess() {
    return this.rwj_ess
  }

  __elw() {
    const { rwJ, rwj_sum, log_wJ } = this
    const z = 1 / rwj_sum
    const elw = sum(log_wJ, (log_wj, j) => {
      // NOTE: when conditioning w/ log_wj either 0 or -inf, elw==0 always
      if (rwJ[j] == 0) return 0 // take 0 * -inf == 0 instead of NaN
      return log_wj * rwJ[j] * z
    })
    return elw
  }

  __tks() {
    this._start_timer()
    const { J, K, xJK, rwJ, rwj_uniform, values, stats } = this
    const pK = (this.___mks_pK ??= array(K)) // array of ks-test p-values
    // compute ks1_test or ks2_test for each (numeric) value w/ target
    fill(pK, k => {
      const value = values[k]
      if (!value.target) return 1 // no target
      const xR = (this.___tks_xR ??= array(J))
      const wR = (this.___tks_wR ??= array(J))
      let wr_sum = 0
      let r = 0
      repeat(J, j => {
        const x = xJK[j][k]
        const w = rwJ[j]
        if (x !== undefined) {
          xR[r] = x
          wR[r++] = w
          wr_sum += w
        }
      })
      if (r == 0 || wr_sum == 0) return 1 // not enough samples/weight
      xR.length = wR.length = r
      if (is_function(value.target)) {
        // use ks1_test for cdf target
        return ks1_test(xR, value.target, { wJ: wR, wj_sum: wr_sum })
      }
      // use ks2_test for sample target
      return ks2_test(xR, value.target, {
        wJ: rwj_uniform ? undefined : wR,
        wj_sum: rwj_uniform ? undefined : wr_sum,
        wK: value.target_weights,
        wk_sum: value.target_weight_sum,
      })
    })
    if (min_in(pK) == 1) return inf // no target or not enough samples/weight
    if (stats) stats.tks_time += this.timer
    // minimum p-value ~ Beta(1,K) so we transform as beta_cdf(p,1,K)
    return -log2(beta_cdf(min_in(pK), 1, K))
  }

  __mks() {
    this._start_timer()
    const { b, B, K, stats } = this
    if (b < B) return inf // not enough data yet
    // rotate buffer so b=0 and we can split in half at B/2
    const xBK = (this.___mks_xBK ??= array(B))
    const yBK = (this.___mks_yBK ??= array(B))
    const bb = b % B
    copy_at(xBK, this.xBK, 0, bb)
    copy_at(xBK, this.xBK, B - bb, 0, bb)
    copy_at(yBK, this.yBK, 0, bb)
    copy_at(yBK, this.yBK, B - bb, 0, bb)
    // initialize single-value buffers for ks2_test
    const R = B / 2
    assert(is_integer(R)) // B should be divisible by 2
    const xR = (this.___mks_xR ??= array(R))
    const yR = (this.___mks_yR ??= array(R))
    const pK = (this.___mks_pK ??= array(K)) // array of ks-test p-values
    // compute ks2_test for each numeric value
    // for now we simply test type of first sampled value
    fill(pK, k => {
      const value = this.values[k]
      if (!value.sampler) return 1 // value not sampled
      let rx = 0
      let ry = 0
      for (let b = 0; b < R; ++b) {
        const xbk = xBK[b][k]
        if (xbk !== undefined) {
          if (rx == 0 && typeof xbk != 'number') return 1 // not a number
          xR[rx++] = xbk
        }
        const ybk = yBK[R + b][k]
        if (ybk !== undefined) {
          if (ry == 0 && typeof ybk != 'number') return 1 // not a number
          yR[ry++] = ybk
        }
      }
      if (rx == 0 || ry == 0) return 1 // not enough samples
      xR.length = rx
      yR.length = ry
      return ks2_test(xR, yR)
    })
    if (stats) stats.mks_time += this.timer
    // minimum p-value ~ Beta(1,K) so we transform as beta_cdf(p,1,K)
    return -log2(beta_cdf(min_in(pK), 1, K))
  }

  sample_index(options) {
    if (options?.prior) {
      const { J, pwj_uniform, pwJ, pwj_sum } = this
      return pwj_uniform
        ? random_discrete_uniform(J)
        : random_discrete(pwJ, pwj_sum)
    }
    const { J, rwj_uniform, rwJ, rwj_sum } = this
    return rwj_uniform
      ? random_discrete_uniform(J)
      : random_discrete(rwJ, rwj_sum)
  }

  sample_indices(jR, options) {
    if (options?.prior) {
      const { J, pwj_uniform, pwJ, pwj_sum } = this
      return pwj_uniform
        ? random_discrete_uniform_array(jR, J)
        : random_discrete_array(jR, pwJ, pwj_sum)
    }
    const { J, rwj_uniform, rwJ, rwj_sum } = this
    return rwj_uniform
      ? random_discrete_uniform_array(jR, J)
      : random_discrete_array(jR, rwJ, rwj_sum)
  }

  sample_values(options) {
    const j = this.sample_index(options)
    const xJK = options?.prior ? this.pxJK : this.xJK
    switch (options?.format) {
      case 'array':
        return xJK[j]
      case 'object':
      default:
        return set(zip_object(values(this.names), xJK[j]), '_index', j)
    }
  }

  sample(options) {
    const j = this.sample_index(options)
    const [xJK, xJ] = options?.prior
      ? [this.pxJK, this.pxJ]
      : [this.xJK, this.xJ]
    if (options?.values) {
      switch (options?.format) {
        case 'array':
          return [...xJK[j], xJ[j]]
        case 'object':
        default:
          return assign(this.sample_values(options), {
            _output: xJ[j],
            _index: j,
          })
        // default:
        //   return [xJ[j], this.sample_values(options)]
      }
    } else if (options?.index) {
      return {
        _output: xJ[j],
        _index: j,
      }
    }
    return xJ[j]
  }

  _sample(k, domain, options) {
    const value = this.values[k]
    assert(domain, 'missing domain')
    const { j, xJK, log_pwJ, yJK, log_mwJ } = this

    // initialize on first call
    if (!value.sampler) {
      value.sampler = this

      // process name if specified
      if (options?.name) {
        assert(
          !this.names.has(options.name),
          `duplicate name '${options.name}' for sampled value`
        )
        value.name = options.name
        this.names.add(value.name)
      }

      // pre-process function domain if parameter-free
      // otherwise have to do it on every call before sampling (see below)
      value.sampler_domain = is_function(domain)
      if (value.sampler_domain && size(options?.params) == 0)
        value.domain = new _Sampler(domain, options)

      const { index, name, args } = value
      const line = `line ${value.line_index}: ${value.line.trim()}`

      // process target if specified
      const target = options?.target ?? this.options.targets?.[name]
      if (target) {
        this._start_timer()
        value.target = target
        // sample from sampler domain (_prior)
        if (value.target?._prior) {
          const T = options?.size ?? this.J
          const xT = array(T)
          let log_wT // weight array allocated below if needed
          const prior = value.target._prior
          repeat(T, t =>
            prior((x, log_pw = 0) => {
              xT[t] = x
              if (!log_pw) return
              log_wT ??= array(T, 0)
              log_wT[t] += log_pw
            })
          )
          value.target = xT
          if (log_wT) {
            value.target_weights = apply(log_wT, exp)
            value.target_weight_sum = sum(value.target_weights)
          }
          if (this.options.log)
            print(`sampled ${T} target values in ${this.timer}ms`)
        } else {
          if (!is_function(value.target) && !is_array(value.target))
            fatal(`invalid target @ ${line}`)
          assert(!defined(options?.size), `unexpected size option @ ${line}`)
        }
      } else {
        assert(!defined(options?.size), `unexpected size option @ ${line}`)
      }

      // log sampled value
      if (this.options.log) {
        let target = ''
        if (is_array(value.target))
          target =
            ` --> target sample size=${value.target.length}, ` +
            `mean=${round_to(mean(value.target), 3)}`
        else if (is_function(value.target))
          target = ` --> target cdf ${str(value.target)}`
        print(`[${index}] ${name ? name + ' = ' : ''}sample(${args})${target}`)
      }
    }

    // process sampler domain (unless pre-processed)
    // also ensure ~full ess since that is assumed by posterior sampler
    if (value.sampler_domain) {
      domain = value.domain ?? new _Sampler(domain, options)
      assert(
        approx_equal(domain.ess, domain.J, 1e-3),
        'sampler domain failed to achieve full ess'
      )
    }

    // sample from prior into xJK (if not yet sampled)
    const xjK = xJK[j]
    let xjk = xjK[k]
    if (xjk === undefined) {
      const prior = options?.prior ?? domain._prior
      assert(prior, 'missing prior sampler')
      prior((x, log_pw = 0) => {
        xjk = xjK[k] = x
        log_pwJ[j] += log_pw
      })
    }

    // if moving, sample from posterior chain into yJK
    if (this.moving) {
      const yjK = yJK[j]
      let yjk = yjK[k]
      if (yjk === undefined) {
        const posterior = options?.posterior ?? domain._posterior
        assert(posterior, 'missing posterior (chain) sampler')
        posterior((y, log_mw = 0) => {
          yjk = yjK[k] = y
          log_mwJ[j] += log_mw
        }, xjk)
      }
      return yjk
    }

    return xjk
  }

  _condition(c, log_wu) {
    this._weight(c ? 0 : -inf, log_wu)
  }

  _weight(log_w, log_wu) {
    this.log_wJ[this.j] += log_w
    if (log_wu) {
      const prev_log_wu = this.log_wufJ[this.j]
      if (prev_log_wu) this.log_wufJ[this.j] = u => log_wu(u) + prev_log_wu(u)
      else this.log_wufJ[this.j] = log_wu
    }
  }
}

// uniform([a],[b])
// uniform _sampler domain_
// range domain w/ uniform `_prior` & `_posterior` samplers
// range is `[0,1)`,`[0,a)`, or `[a,b)` depending on arguments
// see `random_uniform` in #//stat for details
function uniform(a, b) {
  if (a === undefined) return uniform(0, 1)
  if (b === undefined) return uniform(0, a)
  assert(is_number(a) && is_number(b) && a < b, 'invalid args')
  const sampler = f => f(a + random() * (b - a))
  return { gte: a, lt: b, _prior: sampler, _posterior: sampler }
}

function _benchmark_uniform() {
  benchmark(
    () => uniform(),
    () => uniform(1),
    () => uniform(0, 1)
  )
}
