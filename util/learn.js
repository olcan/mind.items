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
// | `{eq|gte|lte|gt|lt:value}` | numeric set
// | `{is:type}` | type, e.g. `{is:'number'}`
// | `{in:[v0,v1,…]}` | possible values
// | `{and|or:[{…},…]}` | composite domain
// requires feedback via `need(…)` or `want(…)`
function learn(domain = { type: 'boolean' }, options = {}) {
  const { name } = options
}

// preference for `cond` (`==true`)
function want(cond, penalty = -1) {}

// requirement for `cond` (`==true`)
// `≡ want(cond, -inf)`
const need = cond => want(cond, -inf)
