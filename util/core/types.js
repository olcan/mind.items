// `Infinity`
const inf = Infinity

// `x !== undefined`
// `typeof x !== 'undefined'` if `x` is passed as `"x"`
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
  benchmark(
    // compare these for function call + type check overhead
    () => x !== undefined,
    () => defined(x),
    () => defined(y),
    // compare these for eval() overhead
    () => typeof z != 'undefined',
    () => defined('z')
  )
}

// `Number.isInteger`
const is_integer = Number.isInteger

// `typeof x == 'number'`
const is_number = x => typeof x == 'number'

// if argument is number or [numeric string](https://stackoverflow.com/a/175787)
const is_numeric = x =>
  is_number(x) || (typeof x == 'string' && !isNaN(x) && !isNaN(parseFloat(x)))

// alias for `isNaN`
const is_nan = isNaN

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

function _benchmark_is_numeric() {
  benchmark(
    () => is_numeric(0),
    () => is_numeric('0'),
    () => !is_numeric('12px')
  )
}

const is_function = x => typeof x == 'function'
const is_boolean = x => typeof x == 'boolean'
const is_string = x => typeof x == 'string'
const is_object = x => x /*exclude null*/ && typeof x == 'object'
const is_set = x => x instanceof Set
const is_map = x => x instanceof Map
const is_array = Array.isArray

function is_indexed(x) {
  if (is_array(x)) return true // indexed even if empty
  if (!is_object(x)) return false // must be object if not array
  const keys = Object.keys(x)
  // we require at least one key ('0') to eliminate Set, Map, etc
  // we also disallow gaps, just like Array
  return keys.length > 0 && keys.every((k, j) => k == j)
}

function _test_is_indexed() {
  check(
    () => is_indexed([]),
    () => is_indexed(new Array(0)),
    () => !is_indexed({}), // empty object is not considered indexed
    () => is_indexed(['a', 'b']),
    () => is_indexed({ 0: 'a', 1: 'b' }),
    () => !is_indexed({ 1: 'b' }), // gaps not ok
    () => !is_indexed(),
    () => !is_indexed(null),
    () => !is_indexed({ 0: 'a', b: 'b' }),
    () => !is_indexed(new Set([0])),
    () => !is_indexed(new Map([[0, 'a']]))
  )
}

function _benchmark_is_indexed() {
  benchmark(
    () => is_indexed([]),
    () => is_indexed(new Array(0)),
    () => is_indexed({}),
    () => is_indexed({ 0: 'a', 1: 'b' }),
    () => !is_indexed({ 0: 'a', b: 'b' })
  )
}

const empty = _.isEmpty

function _benchmark_empty() {
  benchmark(
    () => Object.keys({}).length == 0, // much faster but not as robust
    () => empty({})
  )
}

const equal = _.isEqual
