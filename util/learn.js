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

// learn(domain, [options])
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
function learn(domain, options, context) {
  if (!domain) fatal(`missing domain required for learn(…)`)
  // context should be auto-generated in _run below
  if (!context)
    fatal(
      `missing auto-generated context in unparsed call` +
        ` learn(${stringify(domain)}, ${stringify(options)})`
    )
  // initialize context if necessary
  if (!context.domain) {
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
    // initialize prior sample & weights
    context.J = 10
    context.xJ = array(context.J)
    context.log_wJ = array(context.J, 0) // init log_wj=0 for uniform wJ
    context.prior(context.xJ, context.log_wJ)
    context.wJ = copy(context.log_wJ, Math.exp)
    context.wj_sum = sum(context.wJ)
    context.weighted = _weighted(context)
  }
  // return random value from weighted sample
  return context.weighted
    ? context.xJ[discrete(context.wJ, context.wj_sum)]
    : context.xJ[discrete_uniform(context.wJ.length)]
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

// is `context` is weighted?
function _weighted(context, ε = 1e-6) {
  const { J, wJ, wj_sum } = context
  const w_mean = wj_sum / J
  const [w_min, w_max] = [(1 - ε) * w_mean, (1 + ε) * w_mean]
  return wJ.some(w => w < w_min || w > w_max)
}

// want(cond, [penalty = -1])
// preference for `cond` (`==true`)
// negative log-weight `penalty` is applied if `!cond`
function want(cond, penalty = -1, run) {
  // run should be auto-generated in _run below
  if (!run) fatal(`missing run state in unparsed call want(…)`)
  if (!cond) run.log_w += penalty
}

// requirement for `cond` (`==true`)
// `≡ want(cond, -inf)`
function need(cond, run) {
  if (!run) fatal(`missing run state in unparsed call need(…)`)
  if (!cond) run.log_w += -inf
}

function _run() {
  let js = _this.read('js_input')
  if (!js.match(/\b(?:learn|need|want)\(.*\)/s)) return null // skip
  log('run handled by #util/learn')
  const _js = js // js before any replacements
  const _js_lines = _js.split('\n')
  // replace learn(…) to append context
  const _js_contexts = []
  const _learn = (i, d, o) => learn(d, o, _js_contexts[i])
  js = js.replace(
    /(?:(?:^|\n|;) *(?:const|let|var) *(\w+) *= *|\b)learn *\(/g,
    (m, name, offset) => {
      const index = _js_contexts.length
      // pre-compute context into _js_contexts[index]
      const context = { index, offset, name }
      context.js = _js
      const prefix = _js.slice(0, offset)
      const suffix = _js.slice(offset)
      context.line = _count_unescaped(prefix, '\n') + 1
      context.line_js = _js_lines[context.line - 1]
      _js_contexts.push(context)
      return m.replace(/learn *\($/, `_learn(${index},`)
    }
  )
  // replace want/need(…) to append run state
  let run // initialized before eval below
  const _want = (c, p) => want(c, p, run)
  const _need = (c, p) => need(c, run)
  js = js.replace(/\b(want|need) *\(/g, '_$1(')

  // benchmark(() => eval(js))

  // TODO: need to maintain joint samples/weights, presumably at run level, so need some restructuring
  for (let i = 0; i < 10; ++i) {
    run = { log_w: 0 }
    eval(js)
    log(run.log_w)
  }
  return eval(js)
}
