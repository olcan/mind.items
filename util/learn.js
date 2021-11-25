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
function _learn(domain, options, context) {
  if (!domain) fatal(`missing domain required for learn(…)`)
  const line = `line[${context.line}]: ${context.line_js}`
  // if (!context.name && !options?.name)
  //   fatal(`missing name for learned value @ ${line}`)
  context.name ||= options?.name || '·'
  const index = context.index
  const args = stringify(domain) + (options ? ', ' + stringify(options) : '')
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
function _want(cond, penalty = -1, state) {
  if (!cond) state.log_w += penalty
}

// requirement for `cond` (`==true`)
// `≡ want(cond, -inf)`
function need(cond) {
  fatal(`unexpected (unparsed) call to need(…)`)
}
function _need(cond, state) {
  if (!cond) state.log_w += -inf
}

function _run() {
  let js = _this.read('js_input')
  if (!js.match(/\b(?:learn|need|want)\(.*\)/s)) return null // skip
  log('run handled by #util/learn')
  const start = Date.now()
  const _js = js // js before any replacements
  const _js_lines = _js.split('\n')
  const _js_contexts = [] // filled during js.replace(…) below
  let _state = {} // filled before each eval(js) below

  // replace js to insert proxies that append code context & eval state
  function __learn(k, d, o) {
    // initialize context and prior samples on first call
    const context = _js_contexts[k]
    if (!context.domain) {
      _learn(d, o, context) // for prior and posterior samplers
      if (!context.prior) fatal(`_learn failed to determine prior`)
      if (!context.posterior) fatal(`_learn failed to determine posterior`)
      context.prior(_state.xKJ[k], _state.log_wJ[k])
    }
    // return prior sample (k,j)
    return _state.xKJ[k][_state.j]
  }
  function __want(c, p) {
    _want(c, p, _state)
  }
  function __need(c, p) {
    _need(c, _state)
  }
  js = js.replace(
    /(?:(?:^|\n|;) *(?:const|let|var) *(\w+) *= *|\b)learn *\(/g,
    (m, name, offset) => {
      const k = _js_contexts.length
      // pre-compute context into _js_contexts[k]
      const context = { index: k, offset, name }
      context.js = _js
      context.line = _count_unescaped(_js.slice(0, offset), '\n') + 1
      context.line_js = _js_lines[context.line - 1]
      _js_contexts.push(context)
      return m.replace(/learn *\($/, `__learn(${k},`)
    }
  )
  js = js.replace(/\b(want|need) *\(/g, '__$1(')

  // initialize J prior runs in _state
  const J = 10000
  const K = _js_contexts.length
  _state.xKJ = matrix(K, J) // prior samples per context/run
  _state.rJ = array(J) // return value per run
  _state.log_wJ = array(J, 0) // log-weight per run
  repeat(J, j => {
    _state.j = j
    _state.log_w = 0
    _state.rJ[j] = eval(js)
    _state.log_wJ[j] += _state.log_w // add posterior log-weight
  })
  // weighted-sample return value
  // TODO: allow optimized "unweighted" state if learned _state is reused
  const max_log_wj = max(_state.log_wJ) // for numerical stability
  _state.wJ = copy(_state.log_wJ, log_wj => Math.exp(log_wj - max_log_wj))
  _state.wj_sum = sum(_state.wJ)
  const ms = Date.now() - start
  log(`sampled ${J} prior runs (ess ${ess(_state.wJ)}) in ${ms}ms`)
  return _state.rJ[discrete(_state.wJ, _state.wj_sum)]
}
