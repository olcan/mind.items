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

// learned value from `domain`
// value satisfies `from(value, domain)`
// requires feedback via `need(…)` or `want(…)`
// | __option__    | __default__           | __description__
// | `name`        | via context           | name of value
// | `sample`      | `(xJ)=>…` via domain  | fill `x~P`→`xJ`
// | `weight`      | `(xJ,wJ)=>{}`         | add `log(p(x))+c`→`wJ`
// | `propose`     | `(xJ,yJ)=>sample(yJ)` | fill `y~Q(·|x)`→`yJ`
// | `prop_weight` | `(xJ,yJ,wJ)=>{}`  | add `log(q(x|y)/q(y|x))+c`→`wJ`
function learn(domain, options = {}) {
  const { name } = options
}

// preference for `cond` (`==true`)
function want(cond, penalty = -1) {}

// requirement for `cond` (`==true`)
// `≡ want(cond, -inf)`
const need = cond => want(cond, -inf)

function _run() {
  const js = _this.read('js_input')
  if (js.match(/\b(?:learn|need|want)\(.*\)/s)) {
    log('run handled by #util/learn')
    // TODO: rewrite some expressions, e.g. let x = learn(..., {name: 'x'})
    // benchmark(() => eval(js))
    return eval(js)
  }
  return null // skip
}
