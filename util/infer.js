// TODO: rename this as "util/learn" and implement learn() together w/ need/want, w/ 'need' being equivalent to want(..., -inf)
function _run() {
  const js = _this.read('js_input')
  if (js.match(/\binfer\(.*\)/s)) {
    log('run handled by util/infer')
    // TODO:
    // benchmark(() => eval(js))
    return eval(js)
  }
  return null // skip
}

// _inferred_ output of function `f`
// `f()` should be variable, e.g. `uniform()`
// requires subsequent observations via `observe(…)`
function infer(f, name = stringify(f)) {}

function observe() {}
