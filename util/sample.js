// is `x` from `domain`?
// | sampler function | function return domain, `≡{via:sampler}`
// | model string     | model definition domain, `≡{via:model}`
// | type string      | javascript type domain `≡{is:type}`
// | array            | value array, `≡{in:array}`
// | object           | custom domain as constraints ...
// | `{}`             | everything (no constraints)
// | `via:sampler`    | return domain `sampler._domain || {}`
// | `via:model`      | canonical domain for model
// | `is:type`        | `≡ is(x, type)` see [types](#util/core/types)
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
  if (is_string(domain)) {
    const dom = _domain(domain /*model*/)
    if (dom) return from(x, dom) // ≡{via:model}
    return is(x, domain) // ≡{is:type}
  }
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
        } else if (is_string(domain.via)) {
          return from(x, _domain(domain.via))
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
    }
  })
}

// canonical domain for `model`
// `undefined` for unknown `model`
function _domain(model) {
  if (!is_string(model)) return // model is always string
  // uniform(a,b)
  if (model.startsWith('uniform(')) {
    const args = model.match(/^uniform\((?<a>[^,]+),(?<b>[^,]+)\)$/)?.groups
    if (
      !args ||
      !is_numeric(args.a) ||
      !is_numeric(args.b) ||
      parseFloat(args.b) <= parseFloat(args.a)
    )
      fatal(`invalid arguments for uniform model: ${model}`)
    return { gte: parseFloat(args.a), lt: parseFloat(args.b) }
  }
  if (model.includes('(')) return // unknown model w/ args
  // look up canonical domain by model name only (i.e. no args)
  switch (model) {
    case 'standard_uniform':
    case 'uniform':
      return { gte: 0, lt: 1 }
  }
}

// canonical model for `domain`
// `undefined` for unknown `domain`
// `undefined` if no canonical model for `domain`
function _model(domain) {
  if (is_function(domain)) return 'sampler'
  if (
    is_object(domain) &&
    Object.keys(domain).length == 2 && // gte and lt
    is_number(domain.gte) &&
    is_number(domain.lt) &&
    domain.gte < domain.lt
  )
    return 'uniform'
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
// | `prior`       | prior sampler `(xJ, log_pwJ) => …`
// |               | `fill(xJ, x~S(X)), add(log_pwJ, log(∝p(x)/s(x)))`
// |               | _default_: inferred from `domain`
// | `posterior`   | posterior chain sampler `(xJ, yJ, log_wJ) => …`
// |               | `fill(yJ, y~Q(Y|x), add(log_wJ, log(∝q(x|y)/q(y|x)))`
// |               | _posterior_ in general sense of a _weighted prior_
// |               | _default_: inferred from `domain`
// `options` for sampler function domains `context=>{ … }`:
// | `size`        | sample size `J`, _default_: `10000`
// |               | ≡ _independent_ runs of `context=>{ … }`
// |               | ≡ posterior update chains (dependent runs)
// | `reweight_if` | reweight predicate `context => …`
// |               | called once per update step `context.u = 0,1,…`
// |               | _default_: `()=>true` (reweight every update step)
// |               | default allows smaller reweights w/o skipped steps
// | `weight_exp`  | weight exponent function `context => …` `∈[0,1]`
// |               | multiplied into `log_w` and `log_wu(u)` during reweight
// |               | _default_: `({u})=> Math.min(1, u/10)`
// | `log_w_range` | maximum log-weight range, _default_: `10`
// |               | clips minimum `log_w` within range of maximum
// |               | prevents extreme weights ~immune to `weight_exp`
// |               | _does not apply_ when `log_w==-inf` as in `condition(c)`
// | `resample_if` | resample predicate `context => …`
// |               | called once per update step `context.u = 0,1,…`
// |               | _default_: `({ess,essu,J}) => ess/essu < clip(essu/J,.5,1)`
// |               | default allows `ess→essu→J` w/ effective moves for `essu→J`
// | `move_while`  | move predicate `context => …`
// |               | called _until false_ every update step `context.u = 0,1,…`
// |               | `context.m = 0,1,…` is move step (within update step)
// |               | `context.a` is accepted move count (in samples)
// |               | _default_: `({essu,J,m,a}) => essu<J/2 || a<J`
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

  options = _.merge(
    {
      size: 10000,
      reweight_if: () => true,
      resample_if: ({ ess, essu, J }) => ess / essu < clip(essu / J, 0.5, 1),
      move_while: ({ essu, J, m, a }) => essu < J / 2 || a < J,
      weight_exp: ({ u }) => Math.min(1, (u + 1) / 10),
      log_w_range: 10,
      // TODO: other defaults
    },
    options
  )

  return new _Sampler(domain, options).sample()
}

// default options for context
function _defaults(context) {
  switch (context.model) {
    case 'sampler':
      return {
        prior: xJ => sample_array(xJ, () => context.sampler.sample_prior()),
        posterior: xJ => sample_array(xJ, () => context.sampler.sample()),
      }
    case 'uniform':
      return {
        prior: xJ => sample_array(xJ, uniform),
        posterior: (xJ, yJ) => sample_array(yJ, uniform),
      }
  }
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
    this.options = options
    // replace condition|weight calls
    window._sampler_context = this // for use in replacements instead of `this`
    const js = func.toString()
    const lines = js.split('\n')
    this.contexts = []
    this.js = js.replace(
      /(?:(?:^|\n|;) *(?:const|let|var) *(\w+) *= *|\b)(sample|condition|weight) *\(/g,
      (m, name, method, offset) => {
        // extract code context
        if (js[offset] == '\n') offset++ // skip leading \n if matched
        const prefix = js.slice(0, offset)
        const line_prefix = prefix.match(/.*$/)[0]
        const line_suffix = js.slice(offset).match(/^.*/)[0]
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
          return `_sampler_context._${method}(`

        // replace sample call
        const k = this.contexts.length
        this.contexts.push({ js, index: k, offset, name, line_index, line })
        return m.replace(/sample *\($/, `_sampler_context._sample(${k},`)
      }
    )
    // evaluate new function w/ replacements
    // wrapping in parentheses is required for named functions
    this.func = eval('(' + this.js + ')')
    // console.log(this.js)

    // initialize run state
    const J = (this.J = options.size)
    this.K = this.contexts.length
    this.xKJ = matrix(this.K, J) // prior samples per context/run
    this.log_wJ = array(J, 0) // prior log-weight per run
    this.log_wJ_adj = array(J, 0) // log-weight adjustments per run
    this.xJ = array(J) // eval output value per run

    // define cached properties
    // prior weights pwJ
    cache(this, 'pwJ', [])
    cache(this, 'pwj_sum', ['pwJ'], () => sum(this.pwJ))
    cache(this, 'pwj_ess', ['pwJ'], () => ess(this.pwJ))
    cache(this, 'pwj_uniform', ['pwJ'], () => _uniform(this.pwJ, this.pwj_sum))
    // posterior (conditioned/weighted prior) weights wJ
    cache(this, 'wJ', [])
    cache(this, 'wj_sum', ['wJ'], () => sum(this.wJ))
    cache(this, 'wj_ess', ['wJ'], () => ess(this.wJ))
    cache(this, 'wj_uniform', ['wJ'], () => _uniform(this.wJ, this.wj_sum))

    // update samples
    const start = Date.now()
    this.update()
    const ms = Date.now() - start
    log(`sampled ${J} runs in ${ms}ms`)
    log(`ess ${this.pwj_ess} prior, ${this.wj_ess} posterior`)
  }

  _scale_clipped_weights(log_wJ) {
    // clip weights and apply weight exponent
    // note we can not clip to any fixed absolute value
    // but we can clip to within specified range of maximum
    // we only clip -inf to -MAX_VALUE to enable subtraction
    // scaling (clipped) -inf can not create useful information
    const { weight_exp, log_w_range } = this.options
    const min_log_w = Math.max(max(log_wJ) - log_w_range, -Number.MAX_VALUE)
    apply(log_wJ, log_w => {
      assert(!is_nan(log_w), 'nan log_w')
      if (log_w < -Number.MAX_VALUE) return -Number.MAX_VALUE
      return Math.max(min_log_w, log_w) * weight_exp(this)
    })
  }

  update() {
    this.u = 0
    const { func, xJ, log_wJ_adj } = this
    this.wJ = null // reset (exponentiated) posterior weights
    repeat(this.J, j => {
      this.j = j
      log_wJ_adj[j] = 0
      xJ[j] = func(this)
    })
    // scale & clip posterior log-weight adjustments
    // note this could revert to prior if weight_exp(u=0) == 0
    // also we do not scale/clip prior log-weights for now
    //   they are persistent across update steps so scale/clip is tricky
    //   also they should be coordinated carefully w/ prior sampler
    this._scale_clipped_weights(this.log_wJ_adj)

    // TODO: additional update iterations!
  }

  __pwJ() {
    const { log_wJ } = this
    const max_log_wj = max(log_wJ)
    return copy(log_wJ, log_wj => Math.exp(log_wj - max_log_wj))
  }

  __wJ() {
    const { log_wJ, log_wJ_adj } = this
    const wJ = copy(log_wJ, (log_wj, j) => log_wj + log_wJ_adj[j])
    const max_log_wj = max(wJ)
    return apply(wJ, log_wj => Math.exp(log_wj - max_log_wj))
  }

  sample_index(options) {
    if (options?.prior) {
      const { pwj_uniform, J, pwJ, pwj_sum, xJ } = this
      const j = pwj_uniform ? discrete_uniform(J) : discrete(pwJ, pwj_sum)
      return j
    }
    const { wj_uniform, J, wJ, wj_sum, xJ } = this
    const j = wj_uniform ? discrete_uniform(J) : discrete(wJ, wj_sum)
    return j
  }

  sample_values(options) {
    const j = this.sample_index(options)
    switch (options?.format) {
      case 'array':
        return this.xKJ.map(xkJ => xkJ[j])
      case 'object':
      default:
        return _.set(
          _.zipObject(
            this.contexts.map(c => c.name || c.index),
            this.xKJ.map(xkJ => xkJ[j])
          ),
          '_index',
          j
        )
    }
  }

  sample_prior(options) {
    this.sample(Object.assign({ prior: true }, options))
  }

  sample(options) {
    const j = this.sample_index(options)
    if (options?.values) {
      switch (options?.format) {
        case 'array':
          return [...this.xKJ.map(xkJ => xkJ[j]), this.xJ[j]]
        case 'object':
        default:
          return _.assign(this.sample_values(options), {
            _output: this.xJ[j],
            _index: j,
          })
        // default:
        //   return [this.xJ[j], this.sample_values(options)]
      }
    } else if (options?.index) {
      return {
        _output: this.xJ[j],
        _index: j,
      }
    }
    return this.xJ[j]
  }

  _sample(k, domain, options) {
    const context = this.contexts[k]
    const { j, xKJ, log_wJ, xkJ = xKJ[k] } = this
    // initialize context on first call
    if (!context.sampler) {
      context.sampler = this
      if (!domain) fatal(`missing domain required for sample(…)`)
      const line = `line[${context.line_index}]: ${context.line}`
      // if (!context.name && !options?.name)
      //   fatal(`missing name for sampled value @ ${line}`)
      const { index, name } = context
      const args =
        stringify(domain) + (options ? ', ' + stringify(options) : '')
      context.domain = _domain(domain) ?? domain // canonical domain
      context.model = _model(context.domain) // canonical model
      if (!context.model)
        fatal(`missing model for domain ${stringify(domain)} @ ${line}`)
      const defaults = _defaults(context)
      context.prior = options?.prior ?? defaults.prior
      context.posterior = options?.posterior ?? defaults.posterior
      log(
        `[${index}] ${name ? name + ' = ' : ''}sample(${args}) ← ` +
          `${context.model}${stringify(context.domain)}`
      )
      context.prior(xkJ, log_wJ)
    }
    return xkJ[j]
  }

  _condition(c, log_wu) {
    // log_wu is invoked regardless of c
    if (log_wu) this.log_wJ_adj[this.j] += log_wu(this.u)
    else if (!c) this.log_wJ_adj[this.j] = -inf // indicates hard condition
  }

  _weight(log_w, log_wu) {
    this.log_wJ_adj[this.j] += log_wu ? log_wu(this.u) : log_w
  }
}
