// `x !== undefined`
// for known variable `x` only
// use `typeof x != 'undefined'` for unknown `x`
const defined = x => x !== undefined
function _test_defined() {
  let x = 1
  let y
  check(
    () => defined(x),
    () => !defined(y)
  )
}
function _benchmark_defined() {
  let x = 1
  let y
  benchmark(
    // compare these for function call + type check overhead
    () => x !== undefined,
    () => typeof x != 'undefined',
    () => defined(x),
    () => defined(y)
  )
}

// is `x` of `type`? `≡ is_<type>(x)`
function is(x, type) {
  switch (type) {
    case 'undefined':
      return typeof x == 'undefined'
    case 'null':
      return x === null
    case 'nullish':
      return x === null || x === undefined
    case 'finite':
      return isFinite(x)
    case 'infinite':
      return !isFinite(x)
    case 'inf':
      return !isFinite(x)
    case 'nan':
      return isNaN(x)
    case 'integer':
      return Number.isInteger(x)
    case 'number':
      return typeof x == 'number'
    case 'numeric':
      return is_numeric(x)
    case 'boolean':
      return typeof x == 'boolean'
    case 'string':
      return typeof x == 'string'
    case 'function':
      return typeof x == 'function'
    case 'object':
      return typeof x == 'object' && x !== null
    case 'set':
      return x instanceof Set
    case 'map':
      return x instanceof Map
    case 'array':
      return Array.isArray(x)
    case 'indexed':
      return is_indexed(x)
  }
}

function _test_is() {
  check(
    () => is(undefined, 'undefined'),
    () => is(null, 'null'),
    () => is(null, 'nullish'),
    () => is(0, 'finite'),
    () => is(inf, 'infinite'),
    () => is(inf, 'inf'),
    () => is(NaN, 'nan'),
    () => is(0, 'integer'),
    () => is(0, 'number'),
    () => is('0', 'numeric'),
    () => is(true, 'boolean'),
    () => is('true', 'string'),
    () => is(() => 0, 'function'),
    () => is({}, 'object'),
    () => is(new Set(), 'set'),
    () => is(new Map(), 'map'),
    () => is([], 'array'),
    () => is({ 0: '0' }, 'indexed')
  )
}

const is_defined = defined
const is_null = x => x === null
const is_nullish = x => x === null || x === undefined

const is_finite = isFinite
const is_infinite = x => !isFinite(x)
const is_inf = is_infinite
const inf = Infinity
const is_nan = isNaN
const is_integer = Number.isInteger
const is_number = x => typeof x == 'number'

// is `x` number or [numeric string](https://stackoverflow.com/a/175787)?
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
function _benchmark_is_numeric() {
  benchmark(
    () => is_numeric(0),
    () => is_numeric('0'),
    () => !is_numeric('12px')
  )
}

const is_boolean = x => typeof x == 'boolean'
const is_string = x => typeof x == 'string'
const is_function = x => typeof x == 'function'
const is_object = x => typeof x == 'object' && x !== null
const is_set = x => x instanceof Set
const is_map = x => x instanceof Map
const is_array = Array.isArray

// is `x` array or object w/ keys `0,1,2...`?
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

// [`_.isEmpty`](https://lodash.com/docs/4.17.15#isEmpty)
const empty = _.isEmpty

function _benchmark_empty() {
  benchmark(
    () => Object.keys({}).length == 0, // much faster but not as robust
    () => empty({})
  )
}

// [`_.isEqual`](https://lodash.com/docs/4.17.15#isEqual)
const equal = _.isEqual
