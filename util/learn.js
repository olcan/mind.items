function _run() {
  const js = _this.read('js_input')
  if (js.match(/\b(?:learn|need|want)\(.*\)/s)) {
    log('run handled by #util/learn')
    // benchmark(() => eval(js))
    return eval(js)
  }
  return null // skip
}

// returns _learned_ value from `domain`
// `domain` can be a type string, e.g. `'boolean'`
// `domain` can be an array of possible values, e.g. `[1,5,10]`
// `domain` can be a comparison object `{eq, gte, lte, gt, lt, and, or, type}`
// requires feedback via `need(…)` or `want(…)`
// feedback can be delayed
function learn(domain = 'boolean', options = {}) {
  const { name = stringify(f) } = options
}

// declares preference for `cond` (to be true)
function want(cond, [penalty = -1]) {}

// declares requirement `≡ want(cond, -inf)`
const need = cond => want(cond, -inf)
