function _run() {
  const js = _this.read('js_input')
  if (js.match(/\b(?:learn|need|want)\(.*\)/s)) {
    log('run handled by #util/learn')
    // benchmark(() => eval(js))
    return eval(js)
  }
  return null // skip
}

// _learned_ value from `domain`
// | string | type string, `≡{is:'type'}`
// | array  | value array, `≡{in:[v0,v1,…]}`
// | object | domain spec w/ fields:
// | `is:type` | type string, e.g. `'boolean'`, `'number'`, …
// | `in:[v0,v1,…]` | possible values `x==v0`, `x==v1`, …
// | `gte|lte:value` | inequality `x≥value`, `x≤value`
// | `gt|lt:value`   | strict inequality `x>value`, `x<value`
// | `and|or:[{…},…]` | composite domain
// requires feedback via `need(…)` or `want(…)`
function learn(domain = { type: 'boolean' }, options = {}) {
  const { name } = options
}

// preference for `cond` (`==true`)
function want(cond, penalty = -1) {}

// requirement for `cond` (`==true`)
// `≡ want(cond, -inf)`
const need = cond => want(cond, -inf)
