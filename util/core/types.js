// `x !== undefined`
// for known variable `x` only
// use `typeof x != 'undefined'` for unknown `x`
const defined = x => x !== undefined
function _test_defined() {
  let x = 1
  let y
  let a = { x: 1 }
  check(
    () => defined(x),
    () => !defined(y),
    () => defined(a.x),
    () => !defined(a.y)
  )
}
function _benchmark_defined() {
  let x = 1
  let y
  let a = { x: 1 }
  let nx = 'x'
  benchmark(
    // compare these for function call + type check overhead
    () => x !== undefined,
    () => (0, x !== undefined), // usually faster due to caching of x
    () => typeof x != 'undefined',
    () => defined(x),
    () => defined(y),
    () => defined(a.x),
    () => defined(a['x']),
    () => defined(a['' + 'x']),
    () => defined(a[nx]),
    () => defined(a[`${nx}`]),
    () => defined(a.y),
    () => 'x' in a,
    () => 'y' in a
  )
}

// is `x` of `type`?
// `≡ is_<type>(x)` for known `type`
// `false` for unknown `type`
function is(x, type) {
  switch (type) {
    case 'undefined':
      return typeof x == 'undefined'
    case 'null':
      return x === null
    case 'nullish':
      return x === null || x === undefined
    case 'finite':
      return Number.isFinite(x)
    case 'infinite':
      return !Number.isFinite(x)
    case 'inf':
      return !Number.isFinite(x)
    case 'nan':
      return Number.isNaN(x)
    case 'integer':
      return Number.isInteger(x)
    case 'probability':
    case 'prob':
      return typeof x == 'number' && x >= 0 && x <= 1
    case 'number':
      return typeof x == 'number'
    case 'numeric':
      return is_numeric(x)
    case 'boolean':
      return typeof x == 'boolean'
    case 'binary':
      return x === 0 || x === 1
    case 'string':
      return typeof x == 'string'
    case 'function':
      return typeof x == 'function'
    case 'object':
      return typeof x == 'object' && x !== null
    case 'plain_object':
      return Object.getPrototypeOf(x) == Object.prototype
    case 'primitive':
      return (typeof x != 'object' && typeof x != 'function') || x === null
    case 'set':
      return x instanceof Set
    case 'map':
      return x instanceof Map
    case 'array':
      return Array.isArray(x) || x instanceof TypedArray // defined below
    case 'indexed':
      return is_indexed(x)
    default:
      return false
  }
}

function _test_is() {
  check(
    () => !is(0), // type missing
    () => !is(0, 'unknown_type'), // type unknown
    () => is(undefined, 'undefined'),
    () => is(null, 'null'),
    () => is(null, 'nullish'),
    () => is(0, 'finite'),
    () => is(inf, 'infinite'),
    () => is(inf, 'inf'),
    () => is(NaN, 'nan'),
    () => is(0, 'integer'),
    () => is(0, 'prob'),
    () => is(0, 'number'),
    () => is('0', 'numeric'),
    () => is(true, 'boolean'),
    () => is(1, 'binary'),
    () => is('true', 'string'),
    () => is(() => 0, 'function'),
    () => is({}, 'object'),
    () => is({}, 'plain_object'),
    () => is(0, 'primitive'),
    () => is('0', 'primitive'),
    () => !is({}, 'primitive'),
    () => !is([], 'primitive'),
    () => !is(() => 0, 'primitive'),
    () => is(new Set(), 'set'),
    () => is(new Map(), 'map'),
    () => is([], 'array'),
    () => is(new Int32Array(), 'array'),
    () => is({ 0: '0' }, 'indexed')
  )
}

const is_defined = defined
const is_null = x => x === null
const is_nullish = x => x === null || x === undefined

// NOTE: Number.isFinite, isNan, etc are more robust than global versions that coerce to number; see e.g. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite

const is_finite = Number.isFinite
const is_infinite = x => !Number.isFinite(x)
const is_inf = is_infinite
const inf = Infinity
const is_nan = Number.isNaN
const is_integer = Number.isInteger
const is_probability = x => typeof x == 'number' && x >= 0 && x <= 1
const is_prob = is_probability
const is_number = x => typeof x == 'number'
// NOTE: is_number includes infinities; use is_finite to exclude

// is `x` number or [numeric string](https://stackoverflow.com/a/175787)?
const is_numeric = x =>
  is_number(x) ||
  (typeof x == 'string' && !isNaN(x) && !Number.isNaN(parseFloat(x)))
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
const is_binary = x => x === 0 || x === 1
const is_string = x => typeof x == 'string'
const is_function = x => typeof x == 'function'

const is_object = x => typeof x == 'object' && x !== null
// NOTE: is_object is not same as POJO
//       (Object.getPrototypeOf(x) == Object.prototype)
//       https://masteringjs.io/tutorials/fundamentals/pojo
const is_plain_object = x => Object.getPrototypeOf(x) == Object.prototype
// NOTE: is_object is not same as instanceof Object, e.g. excludes functions
//       instanceof could even be customized using Symbol.hasInstance
//       https://www.30secondsofcode.org/articles/s/javascript-primitive-instanceof

// NOTE: is_array implies is_object; should always be tested first
// see https://stackoverflow.com/a/52453477

// const is_primitive = x => !(x instanceof Object)
const is_primitive = x =>
  (typeof x != 'object' && typeof x != 'function') || x === null

function _benchmark_is_object() {
  const obj = {}
  const prim = 0
  benchmark(
    () => is_object(obj),
    () => is_object(prim),
    () => is_primitive(obj),
    () => is_primitive(prim),
    () => obj instanceof Object,
    () => prim instanceof Object
  )
}
const _benchmark_is_object_functions = ['is_object', 'is_primitive']

const is_set = x => x instanceof Set
const is_map = x => x instanceof Map
// NOTE: is_array allows typed arrays, e.g. Int32Array
// can also be detected as: ArrayBuffer.isView(x) && !(x instanceof DataView)
const TypedArray = Int32Array.prototype.__proto__.constructor
const is_array = x => Array.isArray(x) || x instanceof TypedArray

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

const empty = _.isEmpty

function _benchmark_empty() {
  benchmark(
    () => Object.keys({}).length == 0, // much faster but not as robust
    () => empty({})
  )
}

const equal = _.isEqual
