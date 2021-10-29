const inf = Infinity

function defined(x) {
  if (is_string(x)) return eval('typeof ' + x) !== 'undefined'
  else return x !== undefined
}

function _test_defined() {
  let x = 1
  let y
  // let z
  check(
    () => defined(x),
    () => !defined(y),
    () => !defined('z')
  )
}

function _benchmark_defined() {
  let x = 1
  let y
  // let z
  benchmarks(
    // compare these for function call + type check overhead
    () => x !== undefined,
    () => defined(x),
    () => defined(y),
    // compare these for eval() overhead
    () => typeof z != 'undefined',
    () => defined('z')
  )
}

const is_integer = Number.isInteger
const is_nan = isNaN
const is_number = x => typeof x == 'number'

// returns true iff argument is a number or a numeric string
// from https://stackoverflow.com/a/175787
const is_numeric = x =>
  is_number(x) || (typeof x == 'string' && !isNaN(x) && !isNaN(parseFloat(x)))

function _test_is_numeric() {
  check(
    () => is_numeric(0),
    () => is_numeric('0'),
    () => is_numeric('.0'),
    () => is_numeric('0.'),
    () => !is_numeric(),
    () => !is_numeric(null),
    () => !is_numeric('..0'),
    () => !is_numeric('0..'),
    () => !is_numeric('foo'),
    () => !is_numeric('12px'),
    () => !is_numeric('$12'),
    () => !is_numeric(''),
    () => !is_numeric(' ')
  )
}

const is_function = x => typeof x == 'function'
const is_boolean = x => typeof x == 'boolean'
const is_string = x => typeof x == 'string'
const is_object = x => typeof x == 'object'
const is_set = x => x instanceof Set
const is_map = x => x instanceof Map
const is_array = Array.isArray

const is_indexed = x =>
  is_array(x) || (is_object(x) && Object.keys(o).every((k, j) => k == j))

function _test_is_indexed() {
  check(
    () => is_indexed([]),
    () => is_indexed(new Array(0)),
    () => is_indexed({}),
    () => is_indexed(['a', 'b']),
    () => is_indexed({ 0: 'a', 1: 'b' }),
    () => !is_indexed(),
    () => !is_indexed(null),
    () => !is_indexed({ 0: 'a', b: 'b' }),
    () => !is_indexed(new Set([0])),
    () => !is_indexed(new Map([[0, 'a']]))
  )
}

function _benchmark_is_indexed() {
  benchmarks(
    () => is_indexed([]),
    () => is_indexed(new Array(0)),
    () => is_indexed({}),
    () => is_indexed({ 0: 'a', 1: 'b' }),
    () => !is_indexed({ 0: 'a', b: 'b' })
  )
}

const empty = x => (is_object(x) ? Object.keys(x).length == 0 : _.isEmpty(x))

const equal = _.isEqual

const approx_equal = (x, y, ε = 0.000001) => Math.abs(y - x) < ε
