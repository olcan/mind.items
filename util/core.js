// TODO: actually test/benchmark stuff below ...
function _test() {}
function _test_something() {}
function _benchmark() {}
function _benchmark_something() {}

// types
const inf = Infinity
const defined = x => x !== undefined
// NOTE: for null/undefined together, use ?? ("nullish coalescing")
const if_defined = (x, y) => (x !== undefined ? x : y)
const if_finite = (x, y) => (isFinite(x) ? x : y)

const { isArray } = Array
const { isInteger } = Number
const isNumber = x => typeof x == 'number'
const isNumeric = x =>
  isNumber(x) ||
  // from https://stackoverflow.com/a/175787 ...
  (typeof x == 'string' && !isNaN(x) && !isNaN(parseFloat(x)))
const isString = x => typeof x == 'string'
const isArrayLike = o => every(keys(o), (k, j) => k == j)
const isObject = x => typeof x == 'object'
const isFunction = x => typeof x == 'function'
let isRandom = x => false // to be redefined later
const isBoolean = x => typeof x == 'boolean'
// simple Enum that extends Array w/ properties
const Enum = (...nK) =>
  Object.freeze((a => each(a, (n, k) => (a[n] = k)))([...nK].flat()))

// NOTE: keys(_).length can be MUCH faster than isEmpty
const isEmpty = x => keys(x).length == 0
const { /*isEmpty,*/ isEqual } = _
const approx_equal = (x, y, ε = 0.000001) => Math.abs(y - x) < ε

// eval
const stack = () => new Error().stack.split('\n').join()
const print = (...args) => console.log(...args)
const debug = (...args) => console.debug(...args)
const error = (...args) => console.error(...args)
const fatal = (...args) => {
  throw new Error(args.join(' ') + '; STACK: ' + stack())
}
const check = (x, msg) => {
  if (!msg) msg = 'check failed; STACK: ' + stack()
  if (!x) throw new Error(msg + '; STACK: ' + stack())
}
let _eval = eval
const check_eval = (x, msg = x) => {
  if (!_eval(x)) throw new Error(msg + '; STACK: ' + stack())
}
const check_eval_eq = (x, y, feq = isEqual) => {
  const _x = _eval(x),
    _y = _eval(y)
  if (!feq(_x, _y)) throw new Error(`${x} != ${y} (${str(_x)} != ${str(_y)})`)
}
// NOTE: second argument should be x=>eval(x) to capture scope
const scoped_eval = (f, e) => {
  _eval = e
  f()
  _eval = eval
}

// timing
function timing(f, name = str(f)) {
  const start = Date.now()
  const output = f()
  const elapsed = Date.now() - start
  if (name) print(`${name}: ${elapsed}ms`)
  return [output, elapsed]
}
let _benchmark_unit
let _benchmark_units
const set_benchmark_unit = unit => (_benchmark_units = unit)
const set_benchmark_units = units => (_benchmark_units = units)
function benchmark(
  f,
  {
    name = str(f),
    T = 100,
    T_max = 250,
    N = 1000,
    unit = _benchmark_unit,
    units = _benchmark_units,
  } = {}
) {
  let time = 0,
    calls = 0,
    count = 0,
    counts,
    unit_funcs
  const ret = f() // return value for custom units
  if (unit) {
    check(isNumber(ret), 'must return number for unit ' + unit)
  } else if (units) {
    check(
      isObject(units) && !isArray(units),
      'benchmark units must be object of unit:function pairs'
    )
    check(isObject(ret), 'must return object for units ' + str(units))
    unit_funcs = values(units)
    units = keys(units)
    counts = zeroes(units.length)
  }
  do {
    const start = Date.now()
    if (unit) for (let n = 0; n < N; ++n) count += f()
    else if (units) {
      for (let n = 0; n < N; ++n) {
        const x = f()
        each(unit_funcs, (fu, k) => (counts[k] += fu(x)))
      }
    } else for (let n = 0; n < N; ++n) f()
    time += Date.now() - start
    calls += N
  } while (time < T && time < T_max)
  const cps = str(Math.floor((calls / time) * 1000))
  const base = `${name}: ${cps} calls/sec`
  if (unit) {
    const ups = str(Math.floor((count / time) * 1000))
    print(base + ` (${ups} ${unit})`)
  } else if (units) {
    print(
      base +
        ' (' +
        units.map((u, k) => str(counts[k]) + ' ' + u).join(', ') +
        ')'
    )
  } else print(base)
}
