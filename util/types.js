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
