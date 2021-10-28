function _test() {}
function _test_something() {}
function _benchmark() {}
function _benchmark_something() {}

// TODO: redefine all using lowercase notation and start
//       testing/benchmarking/documenting!

const inf = Infinity
const defined = x =>
  isString(x) ? eval('typeof ' + x) !== 'undefined' : x !== undefined

const is_integer = Number.isInteger
const is_number = x => typeof x == 'number'
const is_numeric = x =>
  is_number(x) ||
  // from https://stackoverflow.com/a/175787 ...
  (typeof x == 'string' && !isNaN(x) && !isNaN(parseFloat(x)))
const is_nan = isNaN

const is_function = x => typeof x == 'function'
const is_boolean = x => typeof x == 'boolean'
const is_string = x => typeof x == 'string'
const is_object = x => typeof x == 'object'
const is_set = x => x instanceof Set
const is_map = x => x instanceof Map
const is_array = Array.isArray
const is_indexed = x =>
  is_array(x) || (is_object(x) && Object.keys(o).every((k, j) => k == j))

const empty = x => (is_object(x) ? Object.keys(x).length == 0 : _.isEmpty(x))
const equal = _.isEqual
const approx_equal = (x, y, ε = 0.000001) => Math.abs(y - x) < ε
