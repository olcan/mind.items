function _run() {
  const js = _this.read('js_input')
  if (js.match(/\b(?:learn|need|want)\(.*\)/s)) {
    log('run handled by #util/learn')
    // TODO:
    // benchmark(() => eval(js))
    return eval(js)
  }
  return null // skip
}

// learned value out of `domain`
// `domain` can be an array of possible values
// `domain` can be a comparison object `{eq, gte, gt, lt, lte}`
// `domain` can be an array of comparison objects
// requires feedback via `need(…)` or `want(…)`
// feedback can be provided in the future
function learn(domain, options = {}) {
  const { name = stringify(f) } = options
}

// todo
function need() {}

// todo
function want() {}
