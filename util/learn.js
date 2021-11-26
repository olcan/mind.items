// is `x` from `domain`?
// | model string   | `≡{via:model}`
// | type string    | `≡{is:type}`
// | array          | value array, `≡{in:array}`
// | object         | domain spec ...
// | `via:model`    | `≡ from(x, _domain(model))`
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

// learned value from `domain`
// value satisfies `from(value, domain)`
// requires feedback via `need(…)` or `want(…)`
// default `options` are inferred from `domain`
// default `name` may be inferred from code context
// | `name`      | name of learned value
// | `prior`     | prior sampler `(xJ, log_wJ) => …`
// |             | `fill(xJ, x~S), add(log_wJ, log(∝p(x)/s(x)))`
// | `posterior` | posterior sampler `(xJ, yJ, log_wJ) => …`
// |             | `fill(yJ, y~Q(·|x), add(log_wJ, log(∝q(x|y)/q(y|x)))`
function learn(domain, options = {}) {
  fatal(`unexpected (unparsed) call to learn(…)`)
}

// default options for context
function _defaults(context) {
  switch (context.model) {
    case 'uniform':
      return {
        prior: xJ => sample(xJ, uniform),
        posterior: (xJ, yJ) => sample(yJ, uniform),
      }
  }
}

// is `wJ` weighted?
function _weighted(wJ, wj_sum = sum(wJ), ε = 1e-6) {
  const w_mean = wj_sum / wJ.length
  const [w_min, w_max] = [(1 - ε) * w_mean, (1 + ε) * w_mean]
  return wJ.some(w => w < w_min || w > w_max)
}

// preference for `cond` (`==true`)
// negative log-weight `penalty` is applied if `!cond`
function want(cond, penalty = -1) {
  fatal(`unexpected (unparsed) call to want(…)`)
}

// requirement for `cond` (`==true`)
// `≡ want(cond, -inf)`
function need(cond) {
  fatal(`unexpected (unparsed) call to need(…)`)
}

function _run() {
  const js = _this.read('js_input')
  if (!js.match(/\b(?:learn|need|want)\(.*\)/s)) return null // skip
  log('run handled by #util/learn')
  const J = 10000
  const _state = new _State(js, J)

  // TODO: what does a "reweight" mean at this point? normally it would incorporate the log_w as we do above ... the basic idea seems to be to be able to track _changes_ in the posterior weight log_w, which can be done by ensuring that the "old" weight is tracked and subtracted before new one is applied

  return _state.rJ[discrete(_state.wJ, _state.wj_sum)]
}

class _State {
  constructor(js, J) {
    const lines = js.split('\n')
    this.contexts = [] // filled during js.replace(…) below
    this.js = js
      .replace(/\b(want|need) *\(/g, 'this._$1(')
      .replace(
        /(?:(?:^|\n|;) *(?:const|let|var) *(\w+) *= *|\b)learn *\(/g,
        (m, name, offset) => {
          const k = this.contexts.length
          const context = { js, index: k, offset, name }
          context.line = _count_unescaped(js.slice(0, offset), '\n') + 1
          context.line_js = lines[context.line - 1]
          this.contexts.push(context)
          return m.replace(/learn *\($/, `this._learn(${k},`)
        }
      )
    this.J = J
    this.K = this.contexts.length
    this.xKJ = matrix(this.K, J) // prior samples per context/run
    this.rJ = array(J) // return value per run
    this.log_wJ = array(J, 0) // posterior log-weight per run
    this.log_wJ_penalty = array(J, 0) // observed penalty per run
    this.wJ = array(J) // sampled run weights
    // sample prior runs
    const start = Date.now()
    repeat(this.J, j => {
      this.j = j
      this.log_wJ_penalty[j] = 0
      this.rJ[j] = eval(this.js)
    })
    this._update_run_weights()
    const ms = Date.now() - start
    log(`sampled ${J} prior runs (ess ${ess(this.wJ)}) in ${ms}ms`)
  }

  _update_run_weights() {
    const { wJ, log_wJ, log_wJ_penalty } = this
    copy(wJ, log_wJ, (log_wj, j) => log_wj + log_wJ_penalty[j])
    const max_log_wj = max(wJ)
    apply(wJ, log_wj => Math.exp(log_wj - max_log_wj))
    this.wj_sum = sum(wJ)
  }

  _learn(k, domain, options) {
    const context = this.contexts[k]
    const { j, xKJ, log_wJ, xkJ = xKJ[k] } = this
    if (!context.prior) {
      if (!domain) fatal(`missing domain required for learn(…)`)
      const line = `line[${context.line}]: ${context.line_js}`
      // if (!context.name && !options?.name)
      //   fatal(`missing name for learned value @ ${line}`)
      context.name ||= options?.name || '·'
      const index = context.index
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
        `[${index}] learn(${args}) → ` +
          `${context.model}${stringify(context.domain)}`
      )
      context.prior(xkJ, log_wJ)
    }
    return xkJ[j]
  }
  _want(cond, penalty = -1) {
    const { j, log_wJ_penalty } = this
    if (!cond) log_wJ_penalty[j] += penalty
  }
  _need(cond) {
    const { j, log_wJ_penalty } = this
    if (!cond) log_wJ_penalty[j] += -inf
  }
}
