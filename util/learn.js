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

// is `x` from `domain`?
// | string         | type string, `≡{is:type}`
// | array          | value array, `≡{in:[…]}`
// | object         | domain spec ...
// | `is:type`      | `≡ is(x,type)`, see [types](#util/core/types)
// | `in|in_eq:[…]` | values `x==y`
// | `in_eqq:[…]`   | values `x===y`
// | `in_equal:[…]` | values `equal(x,y)`
// | `eq:y`         | equality `x==y`
// | `eqq:y`        | strict equality `x===y`
// | `equal:y`      | equality via `equal(x,y)`
// | `gte|lte:y`    | inequality `x≥y`, `x≤y`
// | `gt|lt:y`      | strict inequality `x>y`, `x<y`
// | `and|or:[…]`   | composite domain
function from(x, domain) {}

// preference for `cond` (`==true`)
function want(cond, penalty = -1) {}

// requirement for `cond` (`==true`)
// `≡ want(cond, -inf)`
const need = cond => want(cond, -inf)
