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

// uniform([a],[b])
// [uniform](https://en.wikipedia.org/wiki/Continuous_uniform_distribution) on `[0,1)`,`[0,a)`, or `[a,b)`
// | `[0,1)` | if `a` and `b` omitted
// | `[0,a)` | if `b` omitted
// | `[a,b)` | otherwise
function uniform(a, b) {
  if (a === undefined) return uniform(0, 1)
  if (b === undefined) return uniform(0, a)
  assert(is_number(a) && is_number(b) && a < b, 'invalid args')
  const dom = { gte: a, lt: b }
  dom._prior = dom._posterior = f => f(random_uniform(a, b))
  return dom
}

function _benchmark_uniform() {
  benchmark(
    () => uniform(),
    () => uniform(1),
    () => uniform(0, 1)
  )
}

// sample(domain, [options])
// sample value `x` from `domain`
// random variable is denoted `X ∈ dom(X)`
// _prior model_ `P(X)` is defined or implied by `domain`
// can be _conditioned_ as `P(X|c)` using `condition(c)`
// can be _weighted_ as `∝ P(X) × W(X)` using `weight(…)`
// sampler function `domain` is passed new _sampler `context`_
// non-function `domain` requires outer `sample(context=>{ … })`
// conditions/weights are scoped by outer `sample(context=>{ … })`
// samples are tied to _lexical context_, e.g. are constant in loops
// `options` for all domains:
// | `name`        | name of sampled value
// |               | default inferred from lexical context
// |               | e.g. `let x = sample(…) ≡ sample(…,{name:'x'})`
// | `prior`       | prior sampler `f => f(x,[log_pw=0])`
// |               | `x~S(X), log_pw=log(∝p(x)/s(x))`
// |               | _default_: inferred from `domain`
// | `posterior`   | posterior (chain) sampler `(f,x) => f(x,y,[log_mw=0])`
// |               | `y~Q(Y|x), log_mw=log(∝q(x|y)/q(y|x))`
// |               | _default_: inferred from `domain`
// `options` for sampler function domains `context=>{ … }`:
// | `size`        | sample size `J`, _default_: `10000`
// |               | ≡ _independent_ runs of `context=>{ … }`
// |               | ≡ posterior update chains (dependent runs)
// | `reweight_if` | reweight predicate `context => …`
// |               | called once per update step `context.u = 0,1,…`
// |               | _default_: `()=>true` (reweight every update step)
// |               | default allows minimal reweights w/o skipped steps
// |               | does not apply to last update step w/ reweight required
// | `weight_exp`  | weight exponent function `context => …` `∈[0,1]`
// |               | multiplied into `log_w` and `log_wu(u)` during reweight
// |               | does not affect `-inf` weights, e.g. due to conditioning
// |               | _default_: `({u})=> min(1, u/10)`
// | `resample_if` | resample predicate `context => …`
// |               | called once per update step `context.u = 0,1,…`
// |               | _default_: `({ess,essu,J}) => ess/essu < clip(essu/J,.5,1)`
// |               | default allows `ess→essu→J` w/ effective moves for `essu→J`
// | `move_while`  | move predicate `context => …`
// |               | called _until false_ every update step `context.u = 0,1,…`
// |               | `context.m = 0,1,…` is move step (within update step)
// |               | `context.a` is accepted move count (in samples)
// |               | _default_: `({essu,J,a}) => essu<J/2 || a<J`
// |               | default allows `essu→J` w/ up to `J/2` slow-moving samples
// | `max_time`    | maximum time (ms) for sampling, _default_: `1000` ms
// | `min_time`    | minimum time (ms) for sampling, _default_: `0` ms
// |               | useful for testing additional update steps
// | `min_ess`     | minimum `ess` desired (within `max_time`), _default_: `J/2`
// | `max_mks`     | maximum `mks` desired (within `max_time`), _default_: `3`
// |               | `mks` is _move KS_ `-log2(ks2_test(xM_from, xM_to))`
// | `mks_steps`   | (minimum) update steps w/ `mks ≤ max_mks`, _default_: `3`
function sample(domain, options) {
  // decline non-function domain which requires sampler context that would have replaced calls to sample(…)
  if (!is_function(domain))
    fatal(`invalid sample(…) call outside of sample(context=>{ … })`)
  return new _Sampler(domain, options).sample()
}

// condition(c, [log_wu])
// condition samples on `c`
// scoped by outer `sample(context=>{ … })`
// conditions models `P(X) → P(X|c)` for all `X` in context
// corresponds to _indicator weights_ `𝟙(c|X) = (c ? 1 : 0)`
// `≡ weight(c ? 0 : -inf)`, see more general `weight(…)` below
// requires `O(1/P(c))` samples; ___can fail for rare conditions___
// _weight sequence_ `log_wu(u)=0↘-∞, u=0,1,…` can help, see #/weight
// _likelihood weights_ `∝ P(c|X) = E[𝟙(c|X)]` can help, see `weight(…)`
function condition(c, log_wu) {
  fatal(`unexpected call to condition(…)`)
}

// weight(log_w, [log_wu])
// weight samples by `log_w`
// scoped by outer `sample(context=>{ … })`
// normalized weights can be denoted as prob. dist. `W(X)`
// augments models `P(X) -> ∝ P(X) × W(X)` for all `X` in context
// _likelihood weights_ `∝ P(c|X)` condition models `P(X) → P(X|c)`
// effective sample size (ess) becomes `1/E[W²]`; ___can fail for extreme weights___
// _weight sequence_ `log_wu(u)=0→log_w, u=0,1,…` can help
// see #/weight for technical details
function weight(log_w, guide) {
  fatal(`unexpected call to weight(…)`)
}

// is `wJ` uniform?
function _uniform(wJ, wj_sum = sum(wJ), ε = 1e-6) {
  const w_mean = wj_sum / wJ.length
  const [w_min, w_max] = [(1 - ε) * w_mean, (1 + ε) * w_mean]
  return wJ.every(w => w >= w_min && w <= w_max)
}

class _Sampler {
  constructor(func, options) {
    // merge in default options
    this.options = options = _.merge(
      {
        size: 10000,
        reweight_if: () => true,
        resample_if: ({ ess, essu, J }) => ess / essu < clip(essu / J, 0.5, 1),
        move_while: ({ essu, J, a }) => essu < J / 2 || a < J,
        weight_exp: ({ u }) => min(1, (u + 1) / 10),
        max_time: 1000,
        min_time: 0,
        min_ess: (options?.size ?? 10000) / 2,
        max_mks: 3,
        mks_steps: 3,
      },
      options
    )

    // set up default prior/posterior sampler functions
    this._prior = f => f(this.sample({ prior: true }))
    this._posterior = f => f(this.sample())

    // replace sample|condition|weight calls
    window.__sampler = this // for use in replacements instead of `this`
    const js = func.toString()
    const lines = js.split('\n')
    this.values = []
    this.js = js.replace(
      /(?:(?:^|\n|;) *(?:const|let|var) *(\w+) *= *|\b)(sample|condition|weight) *\(/g,
      (m, name, method, offset) => {
        // extract lexical context
        if (js[offset] == '\n') offset++ // skip leading \n if matched
        const prefix = js.slice(0, offset)
        const suffix = js.slice(offset)
        const line_prefix = prefix.match(/.*$/)[0]
        const line_suffix = suffix.match(/^.*/)[0]
        const line_index = _count_unescaped(prefix, '\n')
        const line = lines[line_index]
        check(() => [line_prefix + line_suffix, line]) // sanity check

        // skip matches inside comments
        if (line_prefix.match(/\/\/.*$/)) return m

        // skip matches inside strings
        if (
          _count_unescaped(line_prefix, '`') % 2 ||
          _count_unescaped(line_suffix, '`') % 2 ||
          _count_unescaped(line_prefix, "'") % 2 ||
          _count_unescaped(line_suffix, "'") % 2 ||
          _count_unescaped(line_prefix, '"') % 2 ||
          _count_unescaped(line_suffix, '"') % 2
        )
          return m

        // skip method calls
        if (line_prefix.match(/\.$/)) return m

        // skip function definitions (e.g. from imported #util/sample)
        if (line_prefix.match(/function *$/)) return m
        if (line_suffix.match(/{ *$/)) return m

        // uncomment to debug replacement issues ...
        // console.log(offset, line_prefix + line_suffix)

        // replace condition|weight call
        if (method == 'condition' || method == 'weight')
          return `__sampler._${method}(`

        // parse args, allowing nested parentheses
        // this is naive about strings, comments, escaping, etc
        // but it should work as long as parentheses are balanced
        let args = ''
        let depth = 0
        for (let i = 0; i < suffix.length; i++) {
          const c = suffix[i]
          if (c == ')' && --depth == 0) break
          if (depth) args += c
          if (c == '(') depth++
        }

        // replace sample call
        const k = this.values.length
        this.values.push({ js, index: k, offset, name, args, line_index, line })
        return m.replace(/sample *\($/, `__sampler._sample(${k},`)
      }
    )
    // evaluate new function w/ replacements
    // wrapping in parentheses is required for named functions
    this.func = eval('(' + this.js + ')')
    // console.log(this.js)

    // initialize run state
    const J = (this.J = options.size)
    assert(J > 0, `invalid sample size ${J}`)
    this.K = this.values.length
    this.xJK = matrix(J, this.K) // samples per run/value
    this.xJk = array(J) // tmp array for sampling columns of xJK
    this.pxJK = matrix(J, this.K) // prior samples per run/value
    this.yJK = matrix(J, this.K) // posterior (chain) samples per run/value
    this.yJk = array(J) // tmp array for sampling columns of yJK
    this.log_pwJ = array(J) // prior log-weights per run
    this.log_wJ = array(J) // posterior log-weights
    this.log_rwJ = array(J) // posterior/sample ratio log-weights
    this.log_mwJ = array(J) // posterior move log-weights
    this.log_cwJ = array(J) // posterior candidate log-weights
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
    // stats
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
    }

    // define cached properties
    // prior weights pwJ
    cache(this, 'pwJ', [])
    cache(this, 'pwj_sum', ['pwJ'], () => sum(this.pwJ))
    cache(this, 'pwj_ess', ['pwJ'], () => ess(this.pwJ, this.pwj_sum))
    cache(this, 'pwj_uniform', ['pwJ'], () => _uniform(this.pwJ, this.pwj_sum))
    // sample counts and essu
    cache(this, 'counts', [])
    cache(this, 'essu', ['counts'], () => ess(this.counts, J))
    // posterior ratio weights rwJ (for current sample)
    cache(this, 'rwJ', [])
    cache(this, 'rwJ_agg', ['rwJ', 'counts'])
    cache(this, 'rwj_sum', ['rwJ'], () => sum(this.rwJ))
    cache(this, 'rwj_ess', ['rwJ_agg'], () => ess(this.rwJ_agg, this.rwj_sum))
    cache(this, 'rwj_uniform', ['rwJ'], () => _uniform(this.rwJ, this.rwj_sum))

    // sample prior (along w/ u=0 posterior)
    let start = Date.now()
    this._sample_prior()
    const ms = Date.now() - start
    log(`sampled ${J} prior runs (ess ${this.pwj_ess}) in ${ms}ms`)
    log(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=0`)

    // update sample to posterior
    start = Date.now()
    this._update()
    log(`applied ${this.u} updates in ${Date.now() - start}ms`)
    log(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=${this.u}`)
    log(stringify(this.stats))
  }

  // scales weights by weight_exp and clips infinities to enable subtraction
  _clip_scaled_weights(log_wJ) {
    const w_exp = this.options.weight_exp(this)
    apply(log_wJ, log_w => {
      assert(!is_nan(log_w), 'nan log_w')
      return Math.max(log_w * w_exp, -Number.MAX_VALUE)
    })
  }

  _sample_prior() {
    const start = Date.now()
    const { func, xJ, pxJ, pxJK, xJK, jJ } = this
    const { log_pwJ, log_wJ, log_rwJ, stats } = this
    this.u = 0 // first update step
    fill(log_pwJ, 0)
    fill(log_wJ, 0)
    fill(xJ, j => ((this.j = j), func(this)))
    this.u_wj = 0 // update step (u=0) for posterior weights
    // we can not clip/scale prior since log_pwJ is computed incrementally
    // log_pwJ should be coordinated carefully w/ prior sampler anyway
    this._clip_scaled_weights(log_wJ)
    // init log_rwJ = log_pwJ + log_wJ (u=0 posterior/sample ratio)
    fill(log_rwJ, j => log_wJ[j] + log_pwJ[j])
    fill(jJ, j => j) // init sample indices
    // copy prior samples for sample_prior()
    each(pxJK, (pxjK, j) => copy(pxjK, xJK[j]))
    copy(pxJ, xJ)
    stats.sample_time += Date.now() - start
  }

  // reweight step
  // multiply rwJ by wJ@u/wJ@u' where u' is last update for wJ
  _reweight() {
    const start = Date.now()
    const { u, func, xJ, log_wJ, log_rwJ, stats } = this
    assert(u > this.u_wj, '_reweight requires u > u_wj')
    map(log_rwJ, log_wJ, (a, b) => a - b)
    fill(log_wJ, 0)
    fill(xJ, j => ((this.j = j), func(this)))
    this._clip_scaled_weights(log_wJ)
    map(log_rwJ, log_wJ, (a, b) => a + b)
    this.u_wj = u // update step for last posterior reweight
    this.rwJ = null // reset cached posterior ratio weights and dependents
    // check ess>0 to precompute (cache) & force weight consistency check
    assert(this.ess > 0, 'invalid ess after _reweight')
    stats.reweights++
    stats.reweight_time += Date.now() - start
  }

  // swap arrays w/ temporary buffers prefixed w/ _
  _swap(...names) {
    each(names, n => (this[n] = swap(this[`_${n}`], (this[`_${n}`] = this[n]))))
  }

  // resample step
  // resample based on rwJ, reset rwJ=1
  _resample() {
    const start = Date.now()
    const { J, jjJ, rwj_uniform, rwJ, rwj_sum, log_rwJ, stats } = this
    const { _jJ, jJ, _xJ, xJ, _xJK, xJK, _log_wJ, log_wJ } = this
    if (rwj_uniform) random_discrete_uniform_array(jjJ, J)
    else random_discrete_array(jjJ, rwJ, rwj_sum) // note: sorted indices
    scan(jjJ, (j, jj) => {
      _jJ[j] = jJ[jj]
      _xJ[j] = xJ[jj]
      _xJK[j] = xJK[jj]
      _log_wJ[j] = log_wJ[jj]
    })
    this._swap('jJ', 'xJ', 'xJK', 'log_wJ')
    fill(log_rwJ, 0) // reset weights now "baked into" sample
    this.rwJ = null // reset cached posterior ratio weights and dependents
    this.counts = null // also reset counts/essu due to change in jJ
    stats.resamples++
    stats.resample_time += Date.now() - start
  }

  // move step
  // take metropolis-hastings steps along posterior chain
  _move() {
    const start = Date.now()
    const { J, func, yJ, yJK, xJ, xJK, jJ, jjJ } = this
    const { log_mwJ, log_cwJ, log_wJ, stats } = this
    fill(log_mwJ, 0) // reset move log-weights log(∝q(x|y)/q(y|x))
    fill(log_cwJ, 0) // reset candidate posterior log-weights
    each(yJK, yjK => fill(yjK, undefined))
    this.moving = true // enable posterior chain sampling into yJK in _sample
    const tmp = log_wJ // to be restored below
    this.log_wJ = log_cwJ // redirect log_wJ -> log_cwJ temporarily
    fill(yJ, j => ((this.j = j), func(this)))
    this._clip_scaled_weights(log_mwJ)
    this._clip_scaled_weights(log_cwJ)
    this.log_wJ = tmp // restore log_wJ
    this.moving = false // back to using xJK

    // accept/reject proposed moves
    this.move_accepts = 0
    this.move_log_w = 0
    repeat(J, j => {
      const log_dwj = log_cwJ[j] - log_wJ[j]
      if (Math.random() < Math.exp(log_mwJ[j] + log_dwj)) {
        xJ[j] = yJ[j]
        xJK[j] = yJK[j] // can't copy since rows can share arrays
        yJK[j] = array(this.K) // replace array since moved into xJK
        log_wJ[j] = log_cwJ[j]
        // log_dwj is already reflected in sample so log_rwJ is invariant
        // was confirmed (but not quite understood) in earlier implementations
        // log_rwJ[j] += log_dwj
        jJ[j] = J + j // new index remapped below
        this.move_log_w += log_dwj
        this.move_accepts++
      }
    })

    // reassign indices and reset state if any moves were accepted
    if (this.move_accepts > 0) {
      fill(jjJ, -1)
      let jj = 0 // new indices
      apply(jJ, j => (j >= J ? jj++ : jjJ[j] >= 0 ? jjJ[j] : (jjJ[j] = jj++)))
      this.rwJ = null // reset cached posterior ratio weights and dependents
      this.counts = null // also reset counts/essu due to change in jJ
    }

    stats.moves++
    stats.proposals += J
    stats.accepts += this.move_accepts
    stats.move_time += Date.now() - start
  }

  _update() {
    // TODO: implement _update() loop w/ history tracking, charting, etc
    // TODO: next step, apply rules (esp. resample) and make sure ess improves
    const U = 10
    repeat(U, () => {
      this.u++
      if (this.options.resample_if(this)) this._resample()
      this.m = 0 // move step (within update step)
      this.a = 0 // accepted move count
      while (this.options.move_while(this)) {
        this._move()
        this.a += this.move_accepts
        this.m++
      }
      // always reweight after last update for accurate ess
      if (this.u == U || this.options.reweight_if(this)) this._reweight()
    })
  }

  __pwJ() {
    const { J, log_pwJ } = this
    const max_log_pwj = max(log_pwJ)
    const pwJ = (this.___pwJ ??= array(J))
    return copy(pwJ, log_pwJ, log_pwj => Math.exp(log_pwj - max_log_pwj))
  }

  __rwJ() {
    const { J, log_rwJ } = this
    const max_log_rwj = max(log_rwJ)
    const rwJ = (this.___rwJ ??= array(J))
    return copy(rwJ, log_rwJ, log_rwj => Math.exp(log_rwj - max_log_rwj))
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
    return map(rwJ_agg, this.counts, (w, n) => w * n)
  }

  __counts() {
    const { J, jJ } = this
    const counts = (this.___counts ??= array(J))
    fill(counts, 0)
    each(jJ, jj => counts[jj]++)
    return counts
  }

  get ess() {
    return this.rwj_ess
  }

  sample_index(options) {
    if (options?.prior) {
      const { J, pwj_uniform, pwJ, pwj_sum } = this
      const j = pwj_uniform
        ? random_discrete_uniform(J)
        : random_discrete(pwJ, pwj_sum)
      return j
    }
    const { J, rwj_uniform, rwJ, rwj_sum } = this
    const j = rwj_uniform
      ? random_discrete_uniform(J)
      : random_discrete(rwJ, rwj_sum)
    return j
  }

  sample_values(options) {
    const j = this.sample_index(options)
    const xJK = options?.prior ? this.pxJK : this.xJK
    switch (options?.format) {
      case 'array':
        return xJK[j]
      case 'object':
      default:
        return _.set(
          _.zipObject(
            this.values.map(c => c.name || c.index),
            xJK[j]
          ),
          '_index',
          j
        )
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
          return _.assign(this.sample_values(options), {
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
    // if sampler not yet set, indicate initialization
    if (!value.sampler) {
      value.sampler = this
      const { index, name, args } = value
      log(`[${index}] ${name ? name + ' = ' : ''}sample(${args})`)
    }

    // if moving, sample posterior chain into yJK
    if (this.moving) {
      const { j, yJK, log_mwJ } = this
      if (yJK[j][k] === undefined) {
        const posterior = options?.posterior ?? domain._posterior
        assert(posterior, 'missing posterior (chain) sampler')
        posterior((y, log_mw = 0) => {
          yJK[j][k] = y
          log_mwJ[j] += log_mw
        })
      }
      return yJK[j][k]
    }

    const { j, xJK, log_pwJ } = this
    if (xJK[j][k] === undefined) {
      const prior = options?.prior ?? domain._prior
      assert(prior, 'missing prior sampler')
      prior((x, log_pw = 0) => {
        xJK[j][k] = x
        log_pwJ[j] += log_pw
      })
    }
    return xJK[j][k]
  }

  _condition(c, log_wu) {
    // log_wu is invoked regardless of c
    if (log_wu) this.log_wJ[this.j] += log_wu(this.u)
    else if (!c) this.log_wJ[this.j] = -inf // indicates hard condition
  }

  _weight(log_w, log_wu) {
    this.log_wJ[this.j] += log_wu ? log_wu(this.u) : log_w
  }
}
