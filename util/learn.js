// is `x` from `domain`?
// | string         | type string, `≡{is:domain}`
// | array          | value array, `≡{in:domain}`
// | object         | domain spec ...
// | `is:type`      | `≡ is(x, type)`, see [types](#util/core/types)
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
function from(x, domain) {
  if (is_string(domain)) return is(x, domain) // ≡ {is:domain}
  if (is_array(domain)) return domain.includes(x) // ≡{in:domain}
  if (!is_object(domain)) fatal(`invalid domain '${domain}'`)
  return Object.keys(domain).every(key => {
    switch (key) {
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

// learn(domain, [options = defaults(domain)])
// learned value from `domain`
// value satisfies `from(value, domain)`
// requires feedback via `need(…)` or `want(…)`
// default `options` are inferred via `defaults(domain)`
// default `name` may be inferred from code context
// | `name`         | name of learned value
// | `sampler`      | `(xJ)=>…` fills `x~P`→`xJ`
// | `weighter`     | `(xJ,wJ)=>…` adds `log(∝p(x))`→`wJ`
// | `proposer`     | `(xJ,yJ)=>…` fills `y~Q(·|x)`→`yJ`
// | `balancer`     | `(xJ,yJ,wJ)=>…` adds `log(∝q(x|y)/q(y|x))`→`wJ`
function learn(domain, options) {
  log(`learn(${stringify(domain)}, …)`)
  options = _.merge(defaults(domain), options)
  const { context, name, sampler, weighter, proposer, balancer } = options
  if (!context)
    fatal(
      `missing context for learned value (domain ${stringify(
        domain
      )}) due to unexpected call syntax`
    )
  if (!name)
    fatal(
      `missing name for learned value in line ${context.line}: ${context.line_js}`
    )
}

// default options for `learn(domain)`
function defaults(domain) {
  const defaults = { sampler: xJ => sample(xJ, uniform) }
  log(`defaults(${stringify(domain)}): ${stringify(defaults)}`)
  return defaults
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
    // parse named learned values for name and position/context
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

// internal wrappers for options inferred from context in _run
function __learn(inferred, domain, options) {
  const pos = inferred.pos
  const js = __run_eval_config.orig_js
  const line = _count_unescaped(js.slice(0, pos), '\n') + 1
  const line_js =
    js.slice(pos).match(/^[^\n]*/) + js.slice(0, pos).match(/[^\n]*$/)
  learn(domain, _.merge(inferred, { context: { line, line_js } }, options))
}
