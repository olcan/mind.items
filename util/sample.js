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
  if (is_nullish(domain)) return false
  if (is_function(domain)) return from(x, { via: domain })
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
// | `posterior`   | posterior (chain) sampler `(f,x,…) => f(y,[log_mw=0])`
// |               | `y~Q(Y|x), log_mw=log(∝q(x|y)/q(y|x))`
// |               | _default_: `domain._posterior`
// | `target`      | target cdf, sample, or sampler domain for `tks` metric
// |               | `tks` is _target KS_ `-log2(ks1|2_test(sample, target))`
// |               | for sampler domain, sample `size` can be specified
// |               | default `size` is inherited from context (see below)
// |               | also see `targets` and `max_tks` options below
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
// |               | `context.p` is proposed moves (current update step)
// |               | `context.a` is accepted moves (current update step)
// |               | `context.aK` is accepted moves per posterior "pivot" value
// |               | `context.aaK` is accepted moves per prior "jump" value
// |               | `context.m` is total move count (all update steps)
// |               | _default_: `({essu,J,K,a,aK,aaK}) => essu<.9*J || a < J || min_in(aK)<J/K || min_in(aaK)<J/K`
// |               | default allows `essu→J` w/ up to `J/10` slow-moving samples
// | `move_weights`| move weight function `(context, awK) => …`
// |               | _default_: `({aK,aaK},awK,aawK) => { fill(awK,k=>max(0,J/K-aK[k])); fill(aawK,k=>max(0,J/K-aaK[k])) }`
// |               | default concentrates on deficiencies w.r.t. `move_while`
// | `weight_exp`  | weight exponent function `u => …` `∈[0,1]`
// |               | multiplied into `log_w` _unless_ `log_wu(u)` is defined
// |               | acts as _default weight sequence_, see `weight(…)` below
// |               | triggers warning if sampling is stopped at `weight_exp<1`
// |               | does not affect `-inf` weights, e.g. due to conditioning
// |               | _default_: `u => min(1, (u+1)/3)`
// | `max_updates` | maximum number of update steps, _default_: `inf`
// | `min_updates` | minimum number of update steps, _default_: `0`
// | `min_stable_updates` | minimum stable update steps, _default_: `1`
// | `min_unweighted_updates` | minimum unweighted update steps, _default_: `3`
// | `max_time`    | maximum time (ms) for sampling, _default_: `100` ms
// | `min_time`    | minimum time (ms) for sampling, _default_: `0` ms
// | `min_ess`     | minimum `ess` desired (within `max_time`), _default_: `J/2`
// | `max_mks`     | maximum `mks` desired (within `max_time`)
// |               | `mks` is _move KS_ `-log2(ks2_test(from, to))`
// |               | _default_: `1` ≡ failure to reject same-dist at `ɑ<1/2`
// | `mks_tail`    | ratio (<1) of recent updates for `mks`, _default_: `1/2`
// | `mks_period`  | minimum update steps for `mks`, _default_: `1`
// | `updates`     | target number of update steps, _default_: auto
// |               | _warning_: can cause pre-posterior sampling w/o warning
// | `time`        | target time (ms) for sampling, _default_: auto
// |               | _warning_: can cause pre-posterior sampling w/o warning
// | `targets`     | object of targets for named values sampled in this context
// |               | see `target` option above for possible targets
// | `max_tks`     | maximum `tks` desired once updates are complete
// |               | `tks` is _target KS_ `-log2(ks1|2_test(sample, target))`
// |               | ignored if no targets specified via `target(s)` option
// |               | used only as diagnostic test, not as stopping condition
// |               | _default_: `5` ≡ failure to reject same-dist at `ɑ<1/32`
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
    () => sample(() => sample(uniform(0, 1)), { size: 100, updates: 10 }),
    () =>
      sample(
        () => {
          let a = sample(uniform(0, 1))
          let b = sample(uniform(a, 1))
          condition(b > 0.9)
        },
        { size: 100, updates: 20 }
      )
  )
}

// condition samples on `cond`
// scoped by outer `sample(context=>{ … })`
// conditions models `P(X) → P(X|c)` for all `X` in context
// corresponds to _indicator weights_ `𝟙(c|X) = (c ? 1 : 0)`
// `≡ weight(c ? 0 : -inf) ≡ weight(log(c))`, see `weight(…)`
// requires `O(1/P(c))` samples; ___can fail for rare conditions___
// _weight sequence_ `log_wu(u)=0↘-∞, u=0,1,…` can help, see #/weight
// _likelihood weights_ `∝ P(c|X) = E[𝟙(c|X)]` can help, see `weight(…)`
// _default weight sequence_ is `cond._log_wu` (if defined)
function condition(cond, log_wu = cond._log_wu) {
  fatal(`unexpected (unparsed) call to condition(…)`)
}

// weight samples by `log_w`
// scoped by outer `sample(context=>{ … })`
// normalized weights can be denoted as prob. dist. `W(X)`
// augments models `P(X) -> ∝ P(X) × W(X)` for all `X` in context
// _likelihood weights_ `∝ P(c|X)` _fork-condition_ models `P(X) → P(X|c')`
// effective sample size (ess) becomes `1/E[W²]`; ___can fail for extreme weights___
// _weight sequence_ `log_wu(u)=0→log_w, u=0,1,…` can help
// _default weight sequence_ is `log_w._log_wu` (if defined)
// also see `weight_exp` option of `sample(…)` above
// see #/weight for technical details
function weight(log_w, log_wu = log_w._log_wu) {
  fatal(`unexpected (unparsed) call to weight(…)`)
}

// is `wJ` uniform?
function _uniform(wJ, wj_sum = sum(wJ), ε = 1e-6) {
  const w_mean = wj_sum / wJ.length
  const [w_min, w_max] = [(1 - ε) * w_mean, (1 + ε) * w_mean]
  return wJ.every(w => w >= w_min && w <= w_max)
}

class _Timer {
  constructor() {
    this.start = Date.now()
  }
  toString() {
    return Date.now() - this.start + 'ms'
  }
  get t() {
    return Date.now() - this.start
  }
}
function _timer() {
  return new _Timer()
}
function _timer_if(c) {
  if (c) return new _Timer()
}

class _Sampler {
  constructor(func, options = {}) {
    this.options = options
    this.domain = func // save sampler function as domain
    this.start_time = Date.now()

    // parse sampled values and determine K
    assign(this, this._parse_func(func))
    const K = (this.K = this.values.length)
    if (options.log) print(`parsed ${K} sampled values in ${this.func}`)

    // merge in default options
    const J = (this.J = options?.size ?? 1000)
    assert(J > 0, `invalid sample size ${J}`)
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
        move_while: ({ essu, J, K, a, aK, aaK }) =>
          essu < 0.9 * J ||
          a < J ||
          min_in(aK) < J / K ||
          min_in(aaK) < 1.0 * (J / K),
        move_weights: ({ aK, aaK }, awK, aawK) => {
          fill(awK, k => max(0, J / K - aK[k]))
          fill(aawK, k => max(0, 1.0 * (J / K) - aaK[k]))
        },
        weight_exp: u => min(1, (u + 1) / 3),
        max_updates: inf,
        min_updates: 0,
        min_stable_updates: 1,
        min_unweighted_updates: 3,
        max_time: 250,
        min_time: 0,
        min_ess: J / 2,
        max_mks: 1,
        mks_tail: 1 / 2,
        mks_period: 1,
        max_tks: 5,
      },
      options
    )

    // set up default prior/posterior sampler functions
    // note posterior here refers to posterior in parent context
    // for posterior, we need to consider weights for log(∝q(x|y)/q(y|x))
    // for efficiency, we require parent to ensure ess≈J s.t. weights≈0
    const sampler = f => f(this.sample())
    this._prior = this._posterior = sampler

    // initialize run state
    this.xJK = matrix(J, K) // samples per run/value
    this.pxJK = matrix(J, K) // prior samples per run/value
    this.yJK = matrix(J, K) // posterior samples per run/value
    this.log_p_xJK = matrix(J, K) // sample (prior) log-densities
    this.log_p_yJK = matrix(J, K) // posterior sample (prior) log-densities

    this.kJ = array(J) // array of (posterior) pivot values in _move
    this.upJK = matrix(J, K) // last jump proposal step
    this.uaJK = matrix(J, K, 0) // last jump accept step
    this.upwK = array(K) // jump proposal weights (computed at pivot value)
    this.awK = array(K) // array of move weights by pivot value
    this.aawK = array(K) // array of move weights by jump value

    this.m = 0 // move count
    this.xBJK = [] // buffered samples for mks
    this.log_p_xBJK = [] // buffered sample log-densities for mks
    this.rwBJ = [] // buffered sample weights for mks
    this.rwBj_sum = [] // buffered sample weight sums for mks
    this.uB = [] // buffer sample update steps
    this.pK = array(K) // move proposals per pivot value
    this.aK = array(K) // move accepts per pivot value
    this.aaK = array(K) // move accepts per jump value
    this.log_pwJ = array(J) // prior log-weights per run
    this.log_wJ = array(J) // posterior log-weights
    this.log_wufJ = array(J) // posterior log-weight sequences
    this.log_wuJ = array(J) // posterior log-weights for step u
    this.log_rwJ = array(J) // posterior/sample ratio log-weights
    this.log_mwJ = array(J) // posterior move log-weights
    this.log_mpJ = array(J) // posterior move log-densities
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
    this._uaJK = array(J)
    this._log_p_xJK = array(J)
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
    cache(this, 'wusum', [], () => sum(this.log_wuJ, exp))
    cache(this, 'rwX', ['rwJ_agg'])
    cache(this, 'elw', ['rwJ'])
    cache(this, 'elp', ['rwJ'])
    cache(this, 'tks', ['rwJ'])
    cache(this, 'stdevK', ['rwJ'])
    cache(this, 'mks', ['rwJ'])

    // initialize stats
    this._init_stats()

    // sample prior (along w/ u=0 posterior)
    let timer = _timer_if(options.log)
    this._sample_prior()
    // require wsum>0 for ess to be meaningful
    assert(this.wusum > 0, 'prior sampling failed w/ wusum==0')
    if (options.log) {
      print(
        `sampled ${J} prior runs (ess ${this.pwj_ess}, ` +
          `wsum ${this.wsum}) in ${timer}`
      )
      print(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=0`)
    }

    // update sample to posterior
    timer = _timer_if(options.log)
    this._update()
    if (options.log) {
      print(`applied ${this.u} updates in ${timer}`)
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
      /(?:(?:^|\n|;) *(?:const|let|var) *(\w+) *= *|\b)(sample|condition|weight) *\(((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\([^()]*?\)|.*?)*?\)|.*?)*?\)|.*?)*?\)|.*?)*?\)|.*?)*?)\)/gs
    this.js = js.replace(__sampler_regex, (m, name, method, args, offset) => {
      if (name) {
        assert(
          !names.has(name),
          `invalid duplicate name '${name}' for sampled value`
        )
        assert(
          !name.match(/^\d/),
          `invalid numeric name '${name}' for sampled value`
        )
      }
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
      names.add(name || k) // aligned w/ values & unique since name non-numeric
      return m.replace(/sample *\(.+\)$/s, `__sampler._sample(${k},${args})`)
    })

    // evaluate new function w/ replacements
    // use wrapper to pass along variables from calling scope/context
    const __sampler = this // since 'this' is overloaded in function(){...}
    // this.func = eval('(' + this.js + ')')
    const params = this.options.params
    if (!params) func = eval('(' + this.js + ')')
    else {
      const wrapper = `(function({${_.keys(params)}}) { return ${this.js} })`
      func = eval(wrapper)(params)
    }
    return { func, values, names, nK: array(names) }
  }

  _init_stats() {
    const options = this.options
    if (!options.stats) return // stats disabled
    // enable ALL stats for stats == true
    const known_keys = flat(
      'ess essu essr elw elp wsum mar mlw mlp mks tks gap p a m t'.split(/\W+/),
      this.nK.map(n => `mar.${n}`),
      this.nK.map(n => `p.${n}`),
      this.nK.map(n => `pp.${n}`)
    )
    if (options.stats == true) options.stats = known_keys
    // convert string to array of keys
    if (is_string(options.stats))
      options.stats = options.stats.split(/[^\.\w]+/)
    // convert array of string keys to object of booleans (true)
    if (is_array(options.stats)) {
      assert(every(options.stats, is_string), 'invalid option stats')
      options.stats = from_entries(options.stats.map(k => [k, true]))
    }
    assert(
      is_object(options.stats) && every(values(options.stats), is_boolean),
      'invalid option stats'
    )
    const unknown_keys = diff(keys(options.stats), known_keys)
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
    if (spec.elw) update.elw = round_to(this.elw, 3)
    if (spec.elp) update.elp = round_to(this.elp, 3)
    if (spec.wsum) update.wsum = round_to(this.wsum, 1)
    if (spec.mar)
      update.mar = this.u == 0 ? 100 : round_to(100 * (this.a / this.p), 3, 3)
    each(this.nK, (n, k) => {
      if (spec[`mar.${n}`])
        update[`mar.${n}`] =
          this.u == 0 ? 100 : round_to(100 * (this.aK[k] / this.pK[k]), 3, 3)
    })
    if (spec.mlw) update.mlw = this.u == 0 ? 0 : round_to(this.mlw, 1)
    if (spec.mlp) update.mlp = this.u == 0 ? 0 : round_to(this.mlp, 1)
    if (spec.mks) update.mks = round_to(this.mks, 3)
    if (spec.tks) update.tks = round_to(this.tks, 1)
    if (spec.gap)
      update.gap =
        this.u == 0
          ? round_to(this.log_wuj_gap, 1)
          : round_to(this.log_wuj_gap_before_reweight, 1)
    if (spec.p) update.p = this.u == 0 ? 0 : this.p
    each(this.nK, (n, k) => {
      if (spec[`p.${n}`]) update[`p.${n}`] = this.u == 0 ? 0 : this.pK[k]
      if (spec[`pp.${n}`])
        update[`pp.${n}`] = round(
          this.u == 0 ? 100 / this.K : 100 * (this.pK[k] / this.p)
        )
    })
    if (spec.a) update.a = this.u == 0 ? 0 : this.a
    if (spec.m) update.m = this.m
    if (spec.t) update.t = this.t

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
    const timer = _timer_if(this.stats)
    const { func, xJ, pxJ, pxJK, xJK, jJ, log_p_xJK } = this
    const { log_pwJ, log_wJ, log_wufJ, log_wuJ, log_rwJ, stats } = this
    this.u = 0 // prior is zero'th update step
    fill(log_pwJ, 0)
    fill(log_wJ, 0)
    fill(log_wufJ, undefined)
    each(log_p_xJK, log_p_xjK => fill(log_p_xjK, 0))
    fill(xJ, j => ((this.j = j), func(this)))
    this._fill_log_wuj(log_wuJ)
    // init log_rwJ = log_pwJ + log_wuJ
    fill(log_rwJ, j => log_pwJ[j] + log_wuJ[j])
    fill(jJ, j => j) // init sample indices
    // copy prior samples for sample_prior()
    each(pxJK, (pxjK, j) => copy(pxjK, xJK[j]))
    copy(pxJ, xJ)
    if (stats) stats.sample_time += timer.t
  }

  // reweight for next step (u+1)
  // multiply rwJ by wJ@u+1/wJ@u (could be 1)
  // stop once wJ@u -> ~wJ; difference is called "gap" (max norm)
  _reweight() {
    if (this.log_wuj_gap == 0) return // no longer needed
    const timer = _timer_if(this.stats)
    const { u } = this
    // print(`reweighting ${u}->${u + 1}, gap ${this.log_wuj_gap}`)
    this._swap('log_wuJ') // store weights for last step (u) in _log_wuJ
    this._fill_log_wuj(this.log_wuJ, u + 1) // compute weights for u+1
    const { log_wuJ, _log_wuJ, log_rwJ, stats } = this
    apply(log_rwJ, (lw, j) => lw + log_wuJ[j] - _log_wuJ[j])
    this.rwJ = null // reset cached posterior ratio weights and dependents
    if (stats) {
      stats.reweights++
      stats.reweight_time += timer.t
    }
  }

  // swap arrays w/ temporary buffers prefixed w/ _
  _swap(...names) {
    each(names, n => (this[n] = swap(this[`_${n}`], (this[`_${n}`] = this[n]))))
  }

  // resample step
  // resample based on rwJ, reset rwJ=1
  _resample() {
    const timer = _timer_if(this.stats)
    const { J, jjJ, rwj_uniform, rwJ, rwj_sum, log_rwJ, stats, _jJ, jJ } = this
    const { _xJ, xJ, _xJK, xJK, _log_wJ, log_wJ, _log_wufJ, log_wufJ } = this
    const { _uaJK, uaJK, _log_wuJ, log_wuJ, log_p_xJK, _log_p_xJK } = this
    if (rwj_uniform) random_discrete_uniform_array(jjJ, J)
    else random_discrete_array(jjJ, rwJ, rwj_sum) // note: sorted indices
    scan(jjJ, (j, jj) => {
      _jJ[j] = jJ[jj]
      _xJ[j] = xJ[jj]
      _xJK[j] = xJK[jj]
      _uaJK[j] = uaJK[jj]
      _log_p_xJK[j] = log_p_xJK[jj]
      _log_wJ[j] = log_wJ[jj]
      _log_wufJ[j] = log_wufJ[jj]
      _log_wuJ[j] = log_wuJ[jj]
    })
    this._swap(
      'jJ',
      'xJ',
      'xJK',
      'uaJK',
      'log_p_xJK',
      'log_wJ',
      'log_wufJ',
      'log_wuJ'
    )
    fill(log_rwJ, 0) // reset weights now "baked into" sample
    this.rwJ = null // reset cached posterior ratio weights and dependents
    this.counts = null // since jJ changed
    this.wsum = null // since log_wJ changed
    if (stats) {
      stats.resamples++
      stats.resample_time += timer.t
    }
  }

  // move step
  // take metropolis-hastings steps along posterior chain
  _move() {
    const timer = _timer_if(this.stats)
    const { J, K, func, yJ, yJK, kJ, upJK, uaJK, xJ, xJK, jJ, jjJ } = this
    const { log_cwJ, log_cwufJ, log_wJ, log_wufJ, log_wuJ, stats } = this
    const { awK, aawK, log_mwJ, log_mpJ, log_p_xJK, log_p_yJK } = this
    fill(log_mwJ, 0) // reset move log-weights log(∝q(x|y)/q(y|x))
    fill(log_mpJ, 0) // reset move log-densities log(∝p(y)/p(x))
    fill(log_cwJ, 0) // reset posterior candidate log-weights
    fill(log_cwufJ, undefined) // reset posterior candidate future log-weights
    each(yJK, yjK => fill(yjK, undefined))
    each(log_p_yJK, log_p_yjK => fill(log_p_yjK, 0))
    each(upJK, upjK => fill(upjK, 0))
    // choose random pivot based on uaJK (least-recently prior-jumped)

    // choose random pivot based on uaJK, awK, and aawK
    // random_discrete_uniform_array(kJ, K)
    const wK = (this._move_wK ??= array(K))
    each(uaJK, (uajK, j) => {
      fill(wK, k => this.u - uajK[k] || awK[k] || aawK[k])
      kJ[j] = random_discrete(wK)
    })

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
    let accepts = 0
    this.move_log_w = 0
    this.move_log_p = 0
    const w_exp = this.options.weight_exp(this.u)
    repeat(J, j => {
      const k_pivot = kJ[j]
      this.p++
      this.pK[k_pivot]++
      let log_cwuj = log_cwufJ[j] ? log_cwufJ[j](this.u) : w_exp * log_cwJ[j]
      log_cwuj = clip(log_cwuj, -Number.MAX_VALUE, Number.MAX_VALUE)
      const log_dwj = log_cwuj - log_wuJ[j]
      if (random() < exp(log_mwJ[j] + log_mpJ[j] + log_dwj)) {
        // update state to reflect move
        xJ[j] = yJ[j]
        xJK[j] = yJK[j] // can't copy since rows can share arrays
        yJK[j] = array(K) // replace array since moved into xJK
        log_p_xJK[j] = log_p_yJK[j]
        log_p_yJK[j] = array(K)
        log_wJ[j] = log_cwJ[j]
        log_wufJ[j] = log_cwufJ[j]
        log_wuJ[j] = log_cwuj
        // log_dwj and any other factors in p(accept) are already reflected in
        // post-accept sample so log_rwJ is invariant; this was confirmed
        // (but not quite understood) in earlier implementations
        // log_rwJ[j] += log_dwj
        // log_rwJ[j] += log_mpJ[j]
        jJ[j] = J + j // new index remapped below
        this.move_log_w += log_dwj
        this.move_log_p += log_mpJ[j]
        this.aK[k_pivot]++
        each(upJK[j], (u, k) => {
          if (u != this.u) return
          uaJK[j][k] = u // accepted jump
          this.aaK[k]++
        })
        this.a++
        accepts++
      }
    })

    // reassign indices and reset state if any moves were accepted
    if (accepts > 0) {
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
      stats.accepts += accepts
      stats.move_time += timer.t
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
      min_stable_updates,
      min_unweighted_updates,
      max_mks,
      max_tks,
      min_ess,
      resample_if,
      move_while,
      move_weights,
    } = this.options

    assert(this.u == 0, '_update requires u=0')

    // update stats for u=0
    this._update_stats()

    // skip updates if target updates=0 or time=0
    if (updates == 0 || time == 0) return

    let stable_updates = 0
    let unweighted_updates = 0

    do {
      // save gap before reweight (recorded in stats for this step)
      this.log_wuj_gap_before_reweight = this.log_wuj_gap
      this._reweight() // reweight for step u+1

      // buffer samples at u=0 and then every mks_period updates
      if (this.u % this.options.mks_period == 0) {
        this.uB.push(this.u)
        this.xBJK.push(clone_deep(this.xJK))
        this.log_p_xBJK.push(clone_deep(this.log_p_xJK))
        if (this.rwj_uniform) {
          this.rwBJ.push(undefined)
          this.rwBj_sum.push(undefined)
        } else {
          this.rwBJ.push(clone_deep(this.rwJ))
          this.rwBj_sum.push(this.rwj_sum)
        }
      }

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

          // check gap=0 and target ess, mks, and
          if (
            this.log_wuj_gap == 0 &&
            this.ess >= min_ess &&
            this.mks <= max_mks
          )
            stable_updates++
          else stable_updates = 0
          if (this.log_wuj_gap == 0) unweighted_updates++
          if (
            stable_updates >= min_stable_updates &&
            unweighted_updates >= min_unweighted_updates
          ) {
            const { t, u, ess, mks } = this
            if (this.options.log)
              print(
                `reached target ess=${round(ess)}≥${min_ess}, ` +
                  `gap=0, mks=${round_to(mks, 3)}≤${max_mks} ` +
                  `@ u=${u}, t=${t}ms, stable_updates=${stable_updates}, ` +
                  `unweighted_updates=${unweighted_updates}`
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
      fill(this.pK, 0) // proposed moves by pivot value
      fill(this.aK, 0) // accepted moves by pivot value
      fill(this.aaK, 0) // accepted moves by jump value
      this.mlw = 0 // log_w improvement
      this.mlp = 0 // log_p improvement
      while (move_while(this)) {
        move_weights(this, this.awK, this.aawK)
        this._move()
        this.mlw += this.move_log_w
        this.mlp += this.move_log_p
      }
    } while (true)

    // check wuj gap and target tks if warnings enabled
    if (this.options.warn) {
      // warn about pre-posterior sample w/ log_wuj_gap>0
      if (this.log_wuj_gap > 0)
        warn(`pre-posterior sample w/ log_wuj_gap=${this.log_wuj_gap}>0`)
      if (this.tks > max_tks) {
        warn(`failed to achieve target tks=${this.tks}≤${max_tks}`)
        print(str(zip_object(this.nK, round_to(this.___tks_pK, 3))))
      }
    }
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
        values.push(updates.map(su => f(get(su, prop))))
        options.label ??= prop
        options.axis ??= 'y'
        if (options.formatter) formatters[prop] = options.formatter
        if (options.formatter_context)
          merge(formatter_context, options.formatter_context)
        series.push(omit(options, ['mapper', 'formatter']))
      }
      // function for adding a "rescaled" line to y2 axis of plot
      const add_rescaled_line = (n, range, d = 1, s = inf) => {
        if (quantiles && !quantiles.includes(prop)) {
          // push quantile series instead, rescaling across all quantiles
          const [a, b] = range ?? min_max_in(flat(updates.map(_.values)))
          each(quantiles, k => add_rescaled_line(k, [a, b]))
          return
        }
        const [a, b] = range ?? min_max_in(map(updates, n))
        const _n = n.replace(/\./g, '_') // periods don't work well w/ context
        add_line(n, {
          axis: 'y2',
          mapper: x => round_to((100 * (x - a)) / max(b - a, 1e-6), d, s),
          formatter: eval(
            `(x => round_to((x / 100) * (${_n}_b - ${_n}_a) + ${_n}_a, ${d}, ${s}))`
          ),
          formatter_context: { [`${_n}_a`]: a, [`${_n}_b`]: b },
        })
      }

      if (spec.mks)
        add_line('mks', {
          formatter: x =>
            (2 ** x < 1000 ? round_to(2 ** x, 2) : '>10^' + ~~log10(2 ** x)) +
            ` (${x})`,
        })
      if (spec.tks) add_line('tks')
      if (spec.gap) add_line('gap')
      if (spec.ess)
        add_line('ess', {
          axis: 'y2',
          mapper: x => round_to((100 * x) / this.J, 1),
          formatter: x => `${x}%`,
        })
      if (spec.essu)
        add_line('essu', {
          axis: 'y2',
          mapper: x => round_to((100 * x) / this.J, 1),
          formatter: x => `${x}%`,
        })
      if (spec.essr) add_line('essr', { axis: 'y2', formatter: x => `${x}%` })
      if (spec.mar) add_line('mar', { axis: 'y2', formatter: x => `${x}%` })

      each(this.nK, n => {
        if (spec[`mar.${n}`])
          add_line(`mar.${n}`, { axis: 'y2', formatter: x => `${x}%` })
        if (spec[`pp.${n}`])
          add_line(`pp.${n}`, { axis: 'y2', formatter: x => `${x}%` })
      })

      if (spec.wsum) add_rescaled_line('wsum')
      if (spec.elw) add_rescaled_line('elw', null, 3)
      if (spec.elp) {
        const [a, b] = min_max_in(map(updates, 'elp'))
        add_rescaled_line('elp', [a, b], 3)
      }
      let mlw_0_on_y // for grid line to indicate 0 level for mlw on y axis
      if (spec.mlw) {
        const [a, b] = min_max_in(map(updates, 'mlw'))
        add_rescaled_line('mlw', [a, b])
        mlw_0_on_y = (-a / max(b - a, 1e-6)) * last(y_ticks)
      }
      let mlp_0_on_y // for grid line to indicate 0 level for mlp on y axis
      if (spec.mlp) {
        const [a, b] = min_max_in(map(updates, 'mlp'))
        add_rescaled_line('mlp', [a, b])
        mlp_0_on_y = (-a / max(b - a, 1e-6)) * last(y_ticks)
      }
      if (spec.p) add_rescaled_line('p')
      if (spec.a) add_rescaled_line('a')
      if (spec.m) add_rescaled_line('m')
      if (spec.t) add_rescaled_line('t')

      each(this.nK, n => {
        if (spec[`p.${n}`]) add_rescaled_line(`p.${n}`, null, 0)
      })

      plot({
        name: 'updates',
        title: `\`${this.u}\` updates in \`${this.t}ms\``,
        data: { values },
        renderer: 'lines',
        renderer_options: {
          series,
          data: {
            colors: {
              // weight-related stats are gray
              // elw/elp/wsum closely related, mlw/mlp is dashed to distinguish
              mlw: '#666',
              mlp: '#666',
              elw: '#666',
              elp: '#666',
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
                mlp_0_on_y
                  ? { value: round_to(mlp_0_on_y, 2), class: 'mlp' }
                  : null,
              ]),
            },
          },
          // point: { show: false },
          padding: { right: 50, left: 35 },
          styles: [
            `#plot .c3-ygrid-line line { opacity: 1 !important }`,
            `#plot .c3-ygrid-line.accept line { opacity: .1 !important; stroke:#0f0; stroke-width:5px }`,
            `#plot .c3-ygrid-line.strong line { opacity: .25 !important }`,
            `#plot .c3-ygrid-line.weak line { opacity: .05 !important }`,
            `#plot .c3-target path { stroke-width:2px }`,
            `#plot .c3-target { opacity:1 !important }`,
            // dashed line, grid line legend, and tooltip for mlw/mlp
            `#plot :is(.c3-target-mlw,.c3-target-mlp) path { stroke-dasharray:5,3; }`,
            `#plot :is(.c3-ygrid-line.mlw,.c3-ygrid-line.mlp) line { opacity: 1 !important; stroke-dasharray:5,3;}`,
            `#plot :is(.c3-legend-item-mlw,.c3-legend-item-mlp) line { stroke-dasharray:2,2; }`,
            `#plot :is(.c3-tooltip-name--mlw, c3-tooltip-name--mlp) span { background: repeating-linear-gradient(90deg, #666, #666 2px, transparent 2px, transparent 4px) !important }`,
          ],
        },
        dependencies: ['#_c3'],
      })
    }

    // plot posteriors (vs priors and targets if specified)
    const { J, rwJ, rwj_sum, xJK, pxJK, pwj_sum } = this
    each(this.values, (value, k) => {
      const name = value.name

      // get prior w/ weights that sum to J
      const pxJ = array(J, j => pxJK[j][k])
      const pwJ = scale(copy(this.pwJ), J / pwj_sum)

      // include any undefined values for now
      const xJ = array(J, j => xJK[j][k])
      const wJ = scale(copy(rwJ), J / rwj_sum) // rescale to sum to J

      if (!value.target) {
        hist([pxJ, xJ], { weights: [pwJ, rwJ] }).hbars({
          name,
          series: [
            { label: 'prior', color: '#555' },
            { label: 'posterior', color: '#d61' },
          ],
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

      hist([pxJ, xJ, yR], { weights: [pwJ, wJ, wR] }).hbars({
        name,
        series: [
          { label: 'prior', color: '#555' },
          { label: 'posterior', color: '#d61' },
          { label: 'target', color: '#6a6' },
        ],
        delta: true, // append delta series
      })
    })
  }

  get t() {
    return Date.now() - this.start_time
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

  __stdevK() {
    const { J, K, xJK, rwJ } = this
    const stdevK = (this.___stdevK ??= array(K))
    return fill(stdevK, k => {
      const value = this.values[k]
      if (!value.sampler) return 1 // value not sampled
      let w = 0
      let s = 0
      let ss = 0
      for (let j = 0; j < J; ++j) {
        const wj = rwJ[j]
        if (wj == 0) continue // skip run
        const xjk = xJK[j][k]
        if (xjk === undefined) continue // skip run
        if (w == 0 && typeof xjk != 'number') return inf // skip value
        w += wj
        s += wj * xjk
        ss += wj * xjk * xjk
      }
      if (w == 0) return inf // not enough samples/weight
      const m = s / w
      const stdev = sqrt(ss / w - m * m)
      assert(!is_nan(stdev), 'nan stdev')
      assert(!is_inf(stdev), 'inf stdev')
      if (stdev < 1e-6) return 0 // stdev too small, return 0 to be dealt with
      return stdev
    })
  }

  get ess() {
    return this.rwj_ess
  }

  __elw() {
    const { rwJ, rwj_sum, log_wJ } = this
    const z = 1 / rwj_sum
    return sum(log_wJ, (log_wj, j) => {
      // NOTE: elw==0 when conditioning (log_wj 0 or -inf for all j)
      if (rwJ[j] == 0) return 0 // take 0 * -inf == 0 instead of NaN
      return log_wj * rwJ[j] * z
    })
  }

  __elp() {
    const { rwJ, rwj_sum, log_p_xJK } = this
    const z = 1 / rwj_sum
    return sum(log_p_xJK, (log_p_xjK, j) => {
      if (rwJ[j] == 0) return 0 // take 0 * -inf == 0 instead of NaN
      return sum(log_p_xjK) * rwJ[j] * z
    })
  }

  __tks() {
    const timer = _timer_if(this.stats)
    const { J, K, xJK, rwJ, rwj_uniform, values, stats } = this
    // compute ks1_test or ks2_test for each (numeric) value w/ target
    const pK = (this.___tks_pK ??= array(K))
    fill(pK, k => {
      const value = values[k]
      if (!value.target) return undefined // no target
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
      if (r == 0 || wr_sum == 0) return 0 // not enough samples/weight
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
    const pR = pK.filter(defined)
    if (stats) stats.tks_time += timer.t
    // minimum p-value ~ Beta(1,R) so we transform as beta_cdf(p,1,R)
    return -log2(beta_cdf(min_in(pR), 1, pR.length))
  }

  __mks() {
    const timer = _timer_if(this.stats)
    const { u, J, K, uB, xBJK, log_p_xBJK, rwBJ, rwBj_sum, xJK, uaJK } = this
    const { log_p_xJK, rwJ, rwj_sum, rwj_uniform, stats } = this
    const { mks_tail, mks_period } = this.options

    // trim mks sample buffer to cover desired tail of updates
    if (xBJK.length < 2) return inf // not enough updates yet
    const B = min(xBJK.length, max(2, 1 + ceil((u * mks_tail) / mks_period)))
    while (xBJK.length > B) {
      uB.shift()
      xBJK.shift()
      log_p_xBJK.shift()
      rwBJ.shift()
      rwBj_sum.shift()
    }

    const xJ = (this.___mks_xJ ??= array(J))
    const wJ = (this.___mks_wJ ??= array(J))
    const yJ = (this.___mks_yJ ??= array(J))
    const log_p_xJ = (this.___mks_log_p_xJ ??= array(J))
    const log_p_yJ = (this.___mks_log_p_yJ ??= array(J))

    // include only samples fully updated since buffered update
    copy(wJ, rwJ, (w, j) => (min_in(uaJK[j]) > uB[0] ? w : 0))
    const wj_sum = sum(wJ)
    if (wj_sum < 0.5 * rwj_sum) return inf // not enough samples/weight

    const pR2 = array(K, k => {
      const value = this.values[k]
      if (!value.sampler) return // value not sampled
      if (!is_number(xJK[0][k])) return // value not numeric
      copy(xJ, xJK, xjK => xjK[k])
      copy(yJ, xBJK[0], yjK => yjK[k])
      copy(log_p_xJ, log_p_xJK, log_p_xjK => log_p_xjK[k])
      copy(log_p_yJ, log_p_xBJK[0], log_p_yjK => log_p_yjK[k])
      return [
        ks2_test(xJ, yJ, {
          wJ,
          wj_sum,
          wK: rwBJ[0],
          wk_sum: rwBj_sum[0],
        }),
        ks2_test(log_p_xJ, log_p_yJ, {
          wJ,
          wj_sum,
          wK: rwBJ[0],
          wk_sum: rwBj_sum[0],
        }),
      ]
    }).filter(defined)

    if (stats) stats.mks_time += timer.t
    const R = pR2.length
    if (R == 0) return inf
    // note there are many dependencies in the statistics, especially between x and log_p for same value (k), so we process take min across post-beta adjustment
    return -log2(min_in(transpose(pR2).map(pR => beta_cdf(min_in(pR), 1, R))))
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
        return set(zip_object(this.nK, xJK[j]), '_index', j)
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
    const { j, xJK, log_pwJ, yJK, log_mwJ, log_mpJ, log_wJ, moving } = this
    const { upJK, uaJK, aawK, upwK, log_p_xJK, log_p_yJK } = this

    // reject run (-∞ weight) on nullish (null=empty or undefined) domain
    if (is_nullish(domain)) this._weight(-inf)

    // return undefined on (effectively) rejected run
    if (log_wJ[j] == -inf) return undefined
    if (moving && min(log_mwJ[j], log_mpJ[j]) == -inf) return undefined

    // initialize on first call
    if (!value.sampler) {
      value.sampler = this

      // process name if specified
      if (options?.name) {
        assert(
          !this.names.has(options.name),
          `invalid duplicate name '${options.name}' for sampled value`
        )
        assert(
          !options.match(/^\d/),
          `invalid numeric name '${options.name}' for sampled value`
        )
        value.name = options.name
        this.names.add(value.name)
        this.nK[k] = value.name
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
        const timer = _timer_if(this.options.log)
        value.target = target
        // sample from sampler domain (_prior)
        if (value.target?._prior) {
          const T = options?.size ?? this.J
          const xT = array(T)
          let log_wT // weight array allocated below if needed
          const prior = value.target._prior
          fill(xT, t =>
            prior((x, log_pw = 0) => {
              if (log_pw) {
                log_wT ??= array(T, 0)
                log_wT[t] += log_pw
              }
              return x
            })
          )
          value.target = xT
          if (log_wT) {
            value.target_weights = apply(log_wT, exp)
            value.target_weight_sum = sum(value.target_weights)
          }
          if (this.options.log) print(`sampled ${T} target values in ${timer}`)
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

    const log_p = domain._log_p
    assert(log_p, 'missing prior density (_log_p)')
    const prior = options?.prior ?? domain._prior
    assert(prior, 'missing prior sampler (_prior)')

    // if not moving, sample from prior into xJK
    // prior sample weights (if any) are stored in log_pwJ
    // prior sampling density (if available) is stored in log_p_xJK
    if (!moving) {
      return prior((x, log_pw = 0) => {
        log_pwJ[j] += log_pw
        if (log_p) log_p_xJK[j][k] = log_p(x)
        return (xJK[j][k] = x)
      })
    }

    // if moving, sample into yJK by resampling from existing runs xJK
    // run "y" is resampled from run "x" starting at "pivot" value
    // pivot value is either posterior "pivoted" or prior "jumped"
    // once past pivot, values can be "reused" or "jumped"
    const xjk = xJK[j][k]
    const yjK = yJK[j]
    const log_p_yjK = log_p_yJK[j]
    const log_p_xjk = log_p_xJK[j][k]
    const k_pivot = this.kJ[j]

    // if before pivot value, stay at xjk
    // before pivot means "not at pivot and pivot is unsampled"
    // condition k<=k_pivot is NOT reliable since sampling order can vary
    if (k != k_pivot && yjK[k_pivot] === undefined) {
      assert(xjk !== undefined, 'unexpected missing prior value')
      log_p_yjK[k] = log_p_xjk
      return (yjK[k] = xjk)
    }

    // if at pivot, compute jump weights for unsampled values based on uaJK
    // unsampled values are pivot + past-pivot values
    if (k == k_pivot) {
      // copy(upwK, aawK, (w, k) => (yjK[k] === undefined ? w : 0))
      copy(upwK, uaJK[j], (u, k) =>
        yjK[k] === undefined ? this.u - u || aawK[k] : 0
      )
      const s = sum(upwK)
      if (s) scale(upwK, 1 / s)
    }

    // if at or past pivot, resample "jump" value from prior
    // always resample if xjk is missing (can only happen past pivot)
    if (xjk === undefined || random_boolean(upwK[k])) {
      // if (xjk === undefined || k != k_pivot) {
      // if (xjk === undefined || k != k_pivot || random_boolean(0.5)) {
      // if (xjk === undefined || true) {
      upJK[j][k] = this.u // jump proposed (not yet accepted)
      return prior(y => {
        if (log_p) log_p_yjK[k] = log_p(y)
        // sampling from prior is equivalent to weighting by prior likelihood
        // log_mpJ[j] += log_p_yjK[k] - log_p_xjk
        return (yjK[k] = y)
      })
    }

    // if past pivot, stay at xjk but still add prior density ratio to log_mpJ
    // reject and return undefined for out-of-domain xjk
    // skip if log_p not available
    if (k != k_pivot && log_p) {
      if (!from(xjk, domain)) {
        log_mpJ[j] = -inf
        return undefined
      }
      log_p_yjK[k] = log_p(xjk) // new log_p under pivot
      log_mpJ[j] += log_p_yjK[k] - log_p_xjk
      return (yjK[k] = xjk)
    }

    // if at k_pivot, move from xjk along posterior chain
    const posterior = options?.posterior ?? domain._posterior
    assert(posterior, 'missing posterior sampler (_posterior)')
    return posterior(
      (y, log_mw = 0) => {
        log_mwJ[j] += log_mw
        log_p_yjK[k] = log_p(y)
        log_mpJ[j] += log_p_yjK[k] - log_p_xjk
        return (yjK[k] = y)
      },
      xjk,
      this.stdevK[k]
    )
  }

  _condition(cond, log_wu = cond._log_wu) {
    this._weight(cond ? 0 : -inf, log_wu)
  }

  _weight(log_w, log_wu = log_w._log_wu) {
    this.log_wJ[this.j] += log_w
    if (log_wu) {
      const prev_log_wu = this.log_wufJ[this.j]
      if (prev_log_wu) this.log_wufJ[this.j] = u => log_wu(u) + prev_log_wu(u)
      else this.log_wufJ[this.j] = log_wu
    }
  }
}

function _run() {
  const js = _this.read('js_input').trim()
  if (js.match(/^sample *\(/)) return null
  if (!js.match(/\bsample *\(/)) return null
  const func = eval(flat('(context=>{', js, '})').join('\n'))
  const options = {}
  if (typeof _sample_options == 'object') merge(options, _sample_options)
  return sample(func, options)
}
