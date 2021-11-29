// is `x` from `domain`?
// | model string   | `≡{via:model}`
// | type string    | `≡{is:type}`
// | array          | value array, `≡{in:array}`
// | object         | domain spec ...
// | `is:type`      | `≡ is(x, type)` see [types](#util/core/types)
// | `in:[…]`       | `≡ […].includes(x)`, see [sameValueZero](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness)
// | `in_eq:[…]`    | values `x==y`
// | `in_eqq:[…]`   | values `x===y`
// | `in_equal:[…]` | values `equal(x,y)`, see [isEqual](https://lodash.com/docs/4.17.15#isEqual)
// | `eq:y`         | equality `x==y`
// | `eqq:y`        | strict equality `x===y`
// | `equal:y`      | equality via `equal(x,y)`
// | `gte|lte:y`    | inequality `x≥y`, `x≤y`
// | `gt|lt:y`      | strict inequality `x>y`, `x<y`
// | `and|or:[…]`   | composite domain
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
        return from(x, _domain(domain.via))
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
  if (
    is_object(domain) &&
    Object.keys(domain).length == 2 && // gte and lt
    is_number(domain.gte) &&
    is_number(domain.lt) &&
    domain.gte < domain.lt
  )
    return 'uniform'
}

// sample value from `domain`
// model `x ～ P(X)` is defined or implied by `domain`
// can be _conditioned_ as `P(X|…)` using `condition(…)`
// can be _weighted_ as `∝ P(X) × W(X)` using `weight(…)`
// samples are identified by lexical context, e.g. are constant in loops
// | `name`      | name of sampled value
// |             | default inferred from lexical context
// |             | e.g. `let x = sample(…) ≡ sample(…,{name:'x'})`
// | `prior`     | prior sampler `(xJ, log_pwJ) => …`
// |             | `fill(xJ, x~S(X)), add(log_pwJ, log(∝p(x)/s(x)))`
// |             | default inferred from `domain`
// | `posterior` | posterior chain sampler `(xJ, yJ, log_wJ) => …`
// |             | `fill(yJ, y~Q(Y|x), add(log_wJ, log(∝q(x|y)/q(y|x)))`
// |             | default inferred from `domain`
function sample(domain, options = {}) {
  fatal(`unexpected (unparsed) call to sample(…)`)
}

// default options for context
function _defaults(context) {
  switch (context.model) {
    case 'uniform':
      return {
        prior: xJ => sample_array(xJ, uniform),
        posterior: (xJ, yJ) => sample_array(yJ, uniform),
      }
  }
}

// condition samples on `boolean`
// conditioning is at run level, i.e. applies to _all_ `sample(…)` calls
// _discards_ (or _rejects_) inconsistent runs, a.k.a. [rejection sampling](https://en.wikipedia.org/wiki/Rejection_sampling)
// corresponds to _extreme weights_ `1` (`log_w=0`) or `0` (`log_w=-∞`)
function condition(boolean) {
  fatal(`unexpected (unparsed) call to condition(…)`)
}

// weight samples by `log_w`
// weighting is at run level, i.e. applies to _all_ `sample(…)` calls
// adjusts sampling rates/probabilities by factor `× exp(log_w)`
// TODO: interpret as final desired weight, handle annealing internally!
// see #random/methods/weight for interpretations
// see #random/methods/update/notes for notes about updating
// discuss ideal weights for inference, optimization ...
// if `w ∝ p(obs|run) = likelihood(obs)`, then `sample(…)` samples from posterior `P(value|obs)`
function weight(log_w) {
  fatal(`unexpected (unparsed) call to weight(…)`)
}

// is `wJ` uniform?
function _uniform(wJ, wj_sum = sum(wJ), ε = 1e-6) {
  const w_mean = wj_sum / wJ.length
  const [w_min, w_max] = [(1 - ε) * w_mean, (1 + ε) * w_mean]
  return wJ.every(w => w >= w_min && w <= w_max)
}

// sample an evaluation of `code`
// `code` may use `sample(…)`, `condition(…)`, or `weight(…)`
// can run item as `sample_eval(item.read('js_input'))`
// performance (evals per second) depends on code size
// unused code (e.g. via `read_deep`) should be avoided
// TODO: can sampling be done more efficiently w/o repeated eval?
function sample_eval(code, options = {}) {
  return new _Eval(code, 10000).sample(options)
}

function _run() {
  const js = _this.read('js_input')
  if (!js.match(/\b(?:sample|condition|weight)\(.*\)/s)) return null // skip
  log('run handled by #util/sample')
  return sample_eval(js)
}

class _Eval {
  constructor(js, J) {
    // replace condition|weight calls
    window.__run = this // for use in replacements instead of `this`
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
          return `__run._${method}(`

        // replace sample call
        const k = this.contexts.length
        this.contexts.push({ js, index: k, offset, name, line_index, line })
        return m.replace(/sample *\($/, `__run._sample(${k},`)
      }
    )

    // initialize run state
    this.J = J
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
    // posterior (want-adjusted prior) weights wJ
    cache(this, 'wJ', [])
    cache(this, 'wj_sum', ['wJ'], () => sum(this.wJ))
    cache(this, 'wj_ess', ['wJ'], () => ess(this.wJ))
    cache(this, 'wj_uniform', ['wJ'], () => _uniform(this.wJ, this.wj_sum))

    // sample prior runs
    const start = Date.now()
    this.eval()
    const ms = Date.now() - start
    log(`sampled ${J} prior runs in ${ms}ms`)
    log(`ess ${this.pwj_ess} prior, ${this.wj_ess} posterior`)
  }

  eval() {
    // wrap in function to clear scope except __run and __j (==__run.j)
    // ~50% faster than pushing wrapper inside for 100K calls to js='1'
    ;(function () {
      repeat(__run.J, __j => {
        __run.j = __j
        __run.log_wJ_adj[__j] = 0
        __run.xJ[__j] = eval(__run.js)
      })
    })()
  }

  __wJ() {
    const { log_wJ, log_wJ_adj } = this
    const wJ = copy(log_wJ, (log_wj, j) => log_wj + log_wJ_adj[j])
    const max_log_wj = max(wJ)
    return apply(wJ, log_wj => Math.exp(log_wj - max_log_wj))
  }

  __pwJ() {
    const { log_wJ } = this
    const max_log_wj = max(log_wJ)
    return copy(log_wJ, log_wj => Math.exp(log_wj - max_log_wj))
  }

  sample_index(options = {}) {
    if (options.prior) {
      const { pwj_uniform, J, pwJ, pwj_sum, xJ } = this
      const j = pwj_uniform ? discrete_uniform(J) : discrete(pwJ, pwj_sum)
      return j
    }
    const { wj_uniform, J, wJ, wj_sum, xJ } = this
    const j = wj_uniform ? discrete_uniform(J) : discrete(wJ, wj_sum)
    return j
  }

  sample_values(options = {}) {
    const j = this.sample_index(options)
    switch (options.format) {
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

  sample(options = {}) {
    const j = this.sample_index(options)
    if (options.values) {
      switch (options.format) {
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
    } else if (options.index) {
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
    if (!context.prior) {
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

  _condition(cond) {
    if (!cond) this._weight(-inf) // -inf is reserved for conditioning
  }

  _weight(log_w) {
    this.log_wJ_adj[this.j] += log_w
  }
}
