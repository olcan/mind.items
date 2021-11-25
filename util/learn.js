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
// | `name`         | name of learned value
// | `sampler`      | `(xJ)=>…` fills `x~P`→`xJ`
// | `weighter`     | `(xJ,wJ)=>…` adds `log(∝p(x))`→`wJ`
// | `proposer`     | `(xJ,yJ)=>…` fills `y~Q(·|x)`→`yJ`
// | `balancer`     | `(xJ,yJ,wJ)=>…` adds `log(∝q(x|y)/q(y|x))`→`wJ`
function learn(domain, options, context) {
  if (!domain) fatal(`missing domain required for learn(…)`)
  // context should be auto-generated in _run below
  if (!context)
    fatal(
      `missing auto-generated context in undetected/unparsed call` +
        ` learn(${stringify(domain)}, ${stringify(options)})`
    )
  const line = `line[${context.line}]: ${context.line_js}`
  // if (!context.name && !options?.name)
  //   fatal(`missing name for learned value @ ${line}`)
  context.name ||= options?.name || '·'
  const id = `${context.name}@${context.pos}`
  const args = stringify(domain) + (options ? ', ' + stringify(options) : '')
  const canonical_domain = _domain(domain) ?? domain
  const model = _model(canonical_domain) // canonical model
  if (!model) fatal(`missing model for domain ${stringify(domain)} @ ${line}`)
  const { sampler, weighter, proposer, balancer } = _.merge(
    _defaults(canonical_domain, model, context),
    options
  )
  log(`[${id}] learn(${args}) ${model} on ${stringify(canonical_domain)}`)
}

// default options for canonical domain, model, context
function _defaults(domain, model, context) {
  switch (model) {
    case 'uniform':
      return {
        sampler: xJ => sample(xJ, uniform),
      }
  }
}

// preference for `cond` (`==true`)
function want(cond, penalty = -1) {}

// requirement for `cond` (`==true`)
// `≡ want(cond, -inf)`
const need = cond => want(cond, -inf)

let __run_eval_config // eval js shared w/ __learn

function _run() {
  let js = _this.read('js_input')
  const orig_js = js
  if (js.match(/\b(?:learn|need|want)\(.*\)/s)) {
    log('run handled by #util/learn')
    // parse learned values for name & context
    js = js.replace(
      /(?:(?:^|\n|;) *(?:const|let|var) *(\w+) *= *|\b)learn *\(/g,
      (m, name, pos) => {
        const args = name ? `{name:'${name}',pos:${pos}}` : `{pos:${pos}}`
        return m.replace(/learn *\($/, `__learn(${args},`)
      }
    )
    // benchmark(() => eval(js))
    __run_eval_config = { js, orig_js } // for __learn
    return eval(js)
  }
  return null // skip
}

// internal wrapper for context
function __learn(context, domain, options) {
  context.js = __run_eval_config.orig_js // from _run
  context.line = _count_unescaped(context.js.slice(0, context.pos), '\n') + 1
  context.line_js =
    context.js.slice(context.pos).match(/^[^\n]*/) +
    context.js.slice(0, context.pos).match(/[^\n]*$/)
  learn(domain, options, context)
}
