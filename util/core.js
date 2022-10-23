const keys = Object.keys
const values = Object.values
const entries = Object.entries // _.entries uses Map.entries
const assign = Object.assign
const from_entries = Object.fromEntries
const from_pairs = _.fromPairs
const to_pairs = _.toPairs
const define = Object.defineProperty
const seal = Object.seal
const freeze = Object.freeze

// invoke `f` on all objects in `obj`
const invoke_deep = (obj, f) => {
  if (is_object(obj)) {
    if (is_array(obj)) each(obj, o => invoke_deep(o, f))
    else each(values(obj), o => invoke_deep(o, f))
    f(obj)
  }
  return obj
}

// seal all objects in `obj`
const seal_deep = obj => invoke_deep(obj, seal)

// freeze all objects in `obj`
const freeze_deep = obj => invoke_deep(obj, freeze)

// extract all non-object values in `obj`
const values_deep = obj => {
  if (!is_object(obj)) return [obj]
  if (is_array(obj)) return flatten(obj.map(values_deep))
  return flatten(values(obj).map(values_deep))
}

const args = values_deep

// define `value` for property
// does not modify existing properties
// returns defined value (vs object as in `define`)
const define_value = (obj, prop, value, options = undefined) => (
  define(obj, prop, { value, ...options }), value
)

const get = _.get
const set = _.set
const unset = _.unset
const update = _.update
const merge = _.merge
const merge_with = _.mergeWith
const clone = _.clone
const clone_deep = _.cloneDeep
const clone_deep_with = _.cloneDeepWith
const zip = _.zip
const zip_with = _.zipWith
const zip_object = _.zipObject
const unzip = _.unzip

// benchmark to illustrate clone/clone_deep overhead
// structuredClone is slightly faster in Safari, slower in Chrome
function _benchmark_clone() {
  benchmark(
    () => ({}),
    () => clone({}),
    () => ({ a: 1, b: 1, c: 1 }),
    () => clone({ a: 1, b: 1, c: 1 }),
    () => structuredClone({ a: 1, b: 1, c: 1 }),
    () => ({ a: 1, b: [1, 2, 3], c: { a: 1, b: 1, c: 1 } }),
    () => clone_deep({ a: 1, b: [1, 2, 3], c: { a: 1, b: 1, c: 1 } }),
    () => structuredClone({ a: 1, b: [1, 2, 3], c: { a: 1, b: 1, c: 1 } })
  )
}

const first = _.first
const last = _.last
const take = _.take
const take_while = _.takeWhile
const pick = _.pick
const pick_by = _.pickBy
const omit = _.omit
const omit_by = _.omitBy
const trim = _.trim
const truncate = _.truncate
const size = _.size

const uniq = _.uniq
const uniq_by = _.uniqBy
const diff = _.difference
const compact = _.compact
const without = _.without
const flatten = _.flattenDepth
const flatten_deep = _.flattenDeep
const flat = (...args) => _.flattenDeep(args)

const range = _.range
const group = _.groupBy
const count = _.countBy
const sum_by = _.sumBy
const map = _.map
const map_keys = _.mapKeys
const map_values = _.mapValues

// numeric in-place sort/rank functions
// use _.sort or _.sortBy for alphanumeric sort

const sort = (xJ, ...fJ) => xJ.sort(_f_sort(fJ))
const sort_by = (xJ, ...fJ) => xJ.sort(_f_sort_by(fJ))
const rank = (xJ, ...fJ) => xJ.sort(_f_rank(fJ))
const rank_by = (xJ, ...fJ) => xJ.sort(_f_rank_by(fJ))

function _f_sort(fJ) {
  if (fJ.length == 0) return (a, b) => a - b
  if (fJ.length == 1) return fJ[0]
  return (a, b) => {
    for (const f of fJ) {
      const d = f(a, b)
      if (d) return d
    }
    return 0
  }
}
function _f_rank(fJ) {
  const f = _f_sort(fJ)
  return (a, b) => f(b, a)
}
function _f_sort_by(fJ) {
  apply(fJ, f => (is_string(f) ? x => x[f] : f))
  return _f_sort(fJ.map(f => (a, b) => f(a) - f(b)))
}
function _f_rank_by(fJ) {
  apply(fJ, f => (is_string(f) ? x => x[f] : f))
  return _f_rank(fJ.map(f => (a, b) => f(a) - f(b)))
}

// other useful comparator functions

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const compare_locale = (a, b, ...args) => a.localeCompare(b, ...args)

const sorted_index = _.sortedIndex
const sorted_index_by = _.sortedIndexBy
const sorted_index_of = _.sortedIndexOf
const sorted_last_index = _.sortedLastIndex
const sorted_last_index_by = _.sortedLastIndexBy
const sorted_last_index_of = _.sortedLastIndexOf
const index_of = _.indexOf
const last_index_of = _.lastIndexOf
const includes = _.includes
const find = _.find
const find_last = _.findLast
const find_index = _.findIndex
const find_last_index = _.findLastIndex
const find_key = _.findKey
const find_last_key = _.findLastKey
const filter = _.filter

const lower = x => x.toLowerCase()
const upper = x => x.toUpperCase()

const lookup = (obj, keys, missing = undefined) =>
  keys.map(k => obj[k] ?? missing)

// look up values by type
// returns array for multiple values of same type
function lookup_types(values, ...types) {
  return apply(
    lookup(
      group(values, x => typeof x),
      flat(types)
    ),
    x => (x?.length == 1 ? x[0] : x)
  )
}

// => tranpose_objects(xJN|xNJ)
// tranpose array of objects or vice versa
function transpose_objects(z) {
  if (is_array(z)) {
    const xJN = z
    if (xJN.length == 0) return {}
    if (!is_object(xJN[0])) fatal('invalid first element')
    const nK = keys(xJN[0])
    if (!xJN.every(xjN => equal(keys(xjN), nK)))
      fatal('non-rectangular transpose')
    return zip_object(
      nK,
      nK.map(n => map(xJN, n))
    )
  } else if (is_object(z)) {
    const xNJ = z
    if (empty(xNJ)) return []
    const nK = keys(xNJ)
    const xKJ = values(xNJ)
    if (!is_array(xKJ[0])) fatal('invalid first value')
    const J = xKJ[0].length
    if (!xKJ.every(xkJ => xkJ.length == J)) fatal('non-rectangular transpose')
    return array(J, j =>
      zip_object(
        nK,
        nK.map(n => xNJ[n][j])
      )
    )
  } else fatal('invalid argument')
}

function _test_transpose_objects() {
  check(
    () => throws(() => transpose_objects()),
    () => throws(() => transpose_objects([0])),
    () => throws(() => transpose_objects([{ a: 0 }, {}])),
    () => throws(() => transpose_objects({ a: 0 })),
    () => throws(() => transpose_objects({ a: [0], b: [] })),
    () => [transpose_objects({}), []],
    () => [transpose_objects({ a: [0], b: [0] }), [{ a: 0, b: 0 }]],
    () => [
      transpose_objects({ a: [0, 1], b: [0, 1] }),
      [
        { a: 0, b: 0 },
        { a: 1, b: 1 },
      ],
    ],
    () => [transpose_objects([]), {}],
    () => [transpose_objects([{ a: 0, b: 0 }]), { a: [0], b: [0] }],
    () => [
      transpose_objects([
        { a: 0, b: 0 },
        { a: 1, b: 1 },
      ]),
      { a: [0, 1], b: [0, 1] },
    ]
  )
}

// pack function(s)
// enables cloning & stringification
// applies recursively through objects/arrays
// preserves (and packs) properties on functions
// property `__context` can store external references
// property `__bindings` can store fixed (_bound_) arguments
// function must be _packable_, w/o external references outside `__context`
function pack(f) {
  if (is_array(f)) return f.map(pack)
  if (is_object(f)) return map_values(f, pack)
  if (!is_function(f)) return f // nothing to pack
  const o = map_values(f, pack) // preserve properties
  // store (compact) string form as __function
  // reuse __function if already set (e.g. via bind or unpack)
  o.__function ??= f
    .toString()
    // collapse all leading spaces not inside backticks
    .replace(/`.*`|\n\s+/gs, m => (m[0] == '`' ? m : '\n '))
  return o
}

// unpack function(s)
// object can be packed again
// applies recursively through objects/arrays
// modifies objects/arrays _in place_ (clone before unpack if needed)
function unpack(o) {
  if (!is_object(o)) return o // nothing to unpack for non-objects
  // avoid redundant unpacking (e.g. in parse) via non-enumerable flag
  // if (o.__unpacked) return o // already unpacked
  // define_value(o, '__unpacked', true)

  if (is_array(o)) return apply(o, unpack)
  // handle object, which may be packed function
  for (const k in o) o[k] = unpack(o[k])
  if (!is_string(o.__function)) return o // nothing (else) to unpack
  const js = o.__function
  let f

  // apply captured context (already unpacked recursively above)
  if (o.__context) {
    if (!is_object(o.__context))
      fatal(`invalid non-object __context in object {__function:...}`)
    f = global_eval(`(({${keys(o.__context)}})=>(${js}))`)(o.__context)
  }
  f ??= global_eval(`(${js})`) // parentheses required for function(){...}

  // apply bindings (already unpacked recursively above)
  if (o.__bindings) {
    if (!is_array(o.__bindings))
      fatal(`invalid non-array __bindings in object {__function:...}`)
    const _f = f
    f = (...args) => _f(...o.__bindings, ...args) // faster in Safari
    // f = f.bind(null, ...o.__bindings)
    // f = _.bind(f, null, ...o.__bindings) // SLOWEST
  }

  // preserve properties (already unpacked recursively above)
  // include __function/__context/__bindings for possible re-packing
  // note __function remains original function (w/o context or bindings)
  return assign(f, o)
}

// bind arguments for function
// attaches arguments to function as `__bindings`
// preserves any properties on original function
// preserves string form of underlying function as `__function`
const bind = (f, ...args) => {
  if (f.__bindings) fatal(`function already bound`)
  const g = f.bind(null, ...args)
  for (const k in f) g[k] = f[k] // preserve properties
  // preserve (compact) string form
  g.__function ??= f
    .toString()
    // collapse all leading spaces not inside backticks
    .replace(/`.*`|\n\s+/gs, m => (m[0] == '`' ? m : '\n '))
  g.__bindings = args
  return g
}

// capture `context` for function
// attaches `context` object to function as `__context`
// can be used to `pack` functions w/ external references
const capture = (f, context) => set(f, '__context', context)

// designate function packable as `str`
// attaches string to function as `__function`
// overrides default string form based on `toString`
// can be used to `pack` global functions by reference
const packable = (f, str) => set(f, '__function', str)

// [JSON.stringify](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) w/ function support
// all functions must be _packable_ (see `pack` above)
function stringify(value, replacer, space) {
  if (value?.constructor.name == 'ArrayBuffer' || ArrayBuffer.isView(value))
    return str(value) + ` (${value.byteLength} bytes)`
  return JSON.stringify(
    value,
    function (k, v) {
      if (replacer) v = replacer(k, v)
      return is_function(v) ? pack(v) : v
    },
    space
  )
}

// [JSON.parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) w/ function support
// all functions must be _packable_ (see `pack` above)
function parse(text) {
  return JSON.parse(text, function (k, v) {
    if (is_object(v) && is_string(v.__function)) return unpack(v)
    return v
  })
}

function _test_parse() {
  check(
    () => [
      parse(
        stringify({
          f: assign(() => a, { __context: { a: 1 }, b: 2, c: { d: 3 } }),
        })
      ).f(),
      1,
    ],
    () => [
      str(
        parse(
          stringify({
            f: assign(() => a, { __context: { a: 1 }, b: 2, c: { d: 3 } }),
          })
        )
      ),
      "{ f:a [function Function] { __context:{ a:1 } b:2 c:{ d:3 } __function:'() => a' } }",
    ]
  )
}

// convert `x` to a simple string
// mainly intended for logging, output, etc
// not intended for parsing, unlike e.g. `JSON.stringify`
// | string   | `x` wrapped in single quotes
// | boolean  | `x.toString()`
// | integer  | `x.toString()`, [commas inserted](https://stackoverflow.com/a/2901298)
// | number   | `x.toString()`
// | function | `x.toString()`, `()=>` prefix dropped
// |          | any enumerable properties appended as `{...}`
// | array    | `[...]`, elements stringified recursively
// | object   | `{...}`, values stringified recursively
// |          | `x.toString()` if overloaded (e.g. Date)
function str(x) {
  if (x === undefined) return 'undefined'
  if (x === null) return 'null'
  // string as is
  if (is_string(x)) return `'${x}'`
  // boolean toString
  if (is_boolean(x)) return x.toString()
  // integer toString w/ commas, from https://stackoverflow.com/a/2901298
  if (is_integer(x)) return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  // number toString
  if (is_number(x)) return x.toString()
  // function toString w/ ()=> prefix dropped
  if (is_function(x))
    return (
      x.toString().replace(/^\(\)\s*=>\s*/, '') +
      (keys(x).length ? ' ' + _str_object(x) : '')
    )
  // array elements stringified recursively
  if (is_array(x)) return '[ ' + x.map(str).join(' ') + ' ]'
  // at this point
  if (!is_object(x)) fatal('str: unexpected type ' + typeof x)
  // object values stringified recursively
  // toString used if overloaded (e.g. Date)
  if (x.toString !== Object.prototype.toString) return x.toString()
  return _str_object(x)
}

function _str_object(x) {
  return [
    x.constructor.name != 'Object' ? `[${typeof x} ${x.constructor.name}]` : '',
    '{',
    // _.entries uses .entries() for maps
    _.entries(x)
      .map(([k, v]) => `${k}:${str(v)}`)
      .join(' '),
    '}',
  ]
    .join(' ')
    .replace('{  }', '')
    .trim()
}

function _test_str() {
  check(
    () => [str(), 'undefined'],
    () => [str(undefined), 'undefined'],
    () => [str('test'), `'test'`],
    () => [str(true), 'true'],
    () => [str(10000), '10,000'],
    () => [str(1.01), '1.01'],
    () => [str(() => 1), '1'],
    () => [str(() => (1, 2)), '(1, 2)'],
    () => [str(() => {}), '{}'],
    () => [str(set(() => {}, 'test', 1)), '{} [function Function] { test:1 }'],
    () => [
      str(assign(() => {}, { a: 10000, b: '1', c: 1, d: 1.1 })),
      `{} [function Function] { a:10,000 b:'1' c:1 d:1.1 }`,
    ],
    () => [
      str(() => {
        return 1
      }),
      `{
        return 1
      }`,
    ], // whitespace is maintained in function body
    () => [str([10000, '1', 1, 1.1]), `[ 10,000 '1' 1 1.1 ]`],
    () => [
      str({ a: 10000, b: '1', c: 1, d: 1.1 }),
      `{ a:10,000 b:'1' c:1 d:1.1 }`,
    ]
  )
}

// round `x` to `d` decimal places
// `d` can be negative for digits _before_ decimal point
// `d` can be restricted to at most `s` significant (non-zero) digits
// `d` can be a string (e.g. `'3'`) to fix digits after decimal point
// `mode` string can be `round`, `floor`, or `ceil`
// rounds arrays recursively by copying
const round_to = (x, d = 0, s = inf, mode = 'round') => {
  if (is_array(x)) return x.map(xj => round_to(xj, d, s, mode))
  if (is_object(x)) return map_values(x, v => round_to(v, d, s, mode))
  if (is_string(x)) {
    // attempt to convert string to (finite) number
    const num = Number(x)
    if (isNaN(num)) return x // return non-number as is
    x = num // continue w/ number
  } else if (!is_finite(x)) return x // return non-finite (incl. non-number) as is
  if (d == 0 && s == inf) return Math[mode](x) // just use Math.*
  if (is_string(d)) return round_to(x, parseInt(d), s, mode).toFixed(d)
  // determine d automatically if s<inf
  if (s < inf) {
    if (!(s > 0)) fatal(`invalid significant digits ${s}`)
    const sd = _significant_digits(x)
    if (s < sd) d = Math.min(d, _decimal_places(x) - (sd - s))
  }
  // from https://stackoverflow.com/a/19794305
  if (d === undefined || +d === 0) return Math[mode](x)
  x = +x
  d = -d // negation more intuitive externally
  if (!isFinite(x)) return x
  if (isNaN(x) || !Number.isInteger(d)) return NaN
  let negate = false
  if (x < 0) {
    x = -x
    negate = true
    if (mode == 'floor') mode = 'ceil'
    else if (mode == 'ceil') mode = 'floor'
  }
  x = x.toString().split('e')
  x = Math[mode](+(x[0] + 'e' + (x[1] ? +x[1] - d : -d)))
  x = x.toString().split('e')
  x = +(x[0] + 'e' + (x[1] ? +x[1] + d : d))
  return negate ? -x : x
}

function _test_round_to() {
  check(
    () => [round_to(1.2345), 1],
    () => [round_to(1.2345, -1), 0],
    () => [round_to(1.2345, -2), 0],
    () => [round_to(1.2345, 1), 1.2],
    () => [round_to(1.2345, 2), 1.23],
    () => [round_to(1.2345, 3), 1.235],
    () => [round_to(1.2345, 4), 1.2345],
    () => [round_to(1.2345, 5), 1.2345],
    () => [round_to(1.2345, 10), 1.2345],
    () => [round_to(1.2345, 100), 1.2345],
    () => [round_to(1.2345, 308), 1.2345],
    () => [round_to(1.2345, 309), NaN], // > Number.MAX_VALUE

    () => [round_to(1.2345e4), 12345],
    () => [round_to(1.2345e4, -1), round_to(1.2345e4, 0, 4), 12350],
    () => [round_to(1.2345e4, -2), round_to(1.2345e4, 0, 3), 12300],
    () => [round_to(1.2345e4, -3), round_to(1.2345e4, 0, 2), 12000],
    () => [round_to(1.2345e4, -4), round_to(1.2345e4, 0, 1), 10000],
    () => [round_to(1.2345e4, 1), 12345],
    () => [round_to(1.2345e4, 304), 12345],
    () => [round_to(1.2345e4, 305), NaN], // > Number.MAX_VALUE

    () => [round_to(1.2345e-2), 0],
    () => [round_to(1.2345e-2, 1), 0],
    () => [round_to(1.2345e-2, 2), 0.01],
    () => [round_to(1.2345e-2, 3), 0.012],
    () => [round_to(1.2345e-2, 4), 0.0123],
    () => [round_to(1.2345e-2, 5), 0.01235],
    () => [round_to(1.2345e-2, 10), 0.012345],
    () => [round_to(1.2345e-2, 10, 5), 0.012345],
    () => [round_to(1.2345e-2, 10, 4), 0.01235], // fails for naive d=s-_digits(x)
    () => [round_to(1.2345e-2, 10, 3), 0.0123],

    () => throws(() => round_to(1.2345, 5, 0)),
    () => throws(() => round_to(1.2345, 5, -1)),
    () => throws(() => round_to(1.2345, 5, -2)),
    () => [round_to(1.2345, 5, 1), 1],
    () => [round_to(1.2345, 5, 2), 1.2],
    () => [round_to(1.2345, 5, 3), 1.23],
    () => [round_to(1.2345, 5, 4), 1.235],
    () => [round_to(1.2345, 5, 5), 1.2345],
    () => [round_to(1.2345, 5, 6), 1.2345],
    () => [round_to(1.2345, 5, 1000), 1.2345],
    () => [round_to(1.2345, 308, 1000), 1.2345],
    () => [round_to(1.2345, 309, 1000), NaN],
    () => [round_to(1.2345, 309, 5), NaN],
    () => [round_to(1.2345, 309, 4), 1.235], // s only kicks in if < sig. digits

    // basic tests for floor/ceil modes
    () => [round_to(1.2345, 5, 3, 'ceil'), 1.24],
    () => [round_to(1.2345, 5, 3, 'floor'), 1.23],
    () => [round_to(-1.2345, 5, 3, 'ceil'), -1.23],
    () => [round_to(-1.2345, 5, 3, 'floor'), -1.24],

    // basic tests for invalid type handling
    () => [round_to(inf), inf],
    () => [round_to(-inf), -inf],
    () => [round_to('1.2345f'), '1.2345f'],
    () => [round_to('1.2345'), 1],

    // basic tests for array and object handling
    () => [round_to([1.2345, '1.2345', inf]), [1, 1, inf]],
    () => [round_to({ a: 1.2345, b: '1.2345', c: inf }), { a: 1, b: 1, c: inf }]
  )
}

function _digits(x) {
  // from https://stackoverflow.com/a/28203456
  return Math.max(Math.floor(Math.log10(Math.abs(x))), 0) + 1
}
function _decimal_places(x) {
  // from https://stackoverflow.com/a/17369384
  if (x % 1 == 0) return 0
  return x.toString().split('.')[1].length
}
function _significant_digits(x) {
  // from https://stackoverflow.com/a/30017843
  if (x === 0) return 0
  const t1 = '' + Math.abs(x)
  const t2 = t1.replace('.', '')
  // for scientific notation, we just need position of 'e'
  //"-234.3e+50" -> "2343e+50" -> indexOf("e") === 4
  const i = t2.indexOf('e')
  if (i > -1) return i
  // w/ decimal point, trailing zeroes are already removed
  // 0.001230000.toString() -> "0.00123" -> "000123"
  if (t2.length < t1.length) return t2.replace(/^0+/, '').length
  // w/o decimal point, leading zeroes are already removed
  // 000123000.toString() -> "123000"
  return t2.replace(/0+$/, '').length
}

// throw error if any of `funcs` returns falsy
// if array is returned, all elements must be `equal`
// typically used in test functions `_test_*()`
function check(...funcs) {
  flat(funcs).forEach(f => {
    if (!is_function(f)) fatal('non-function argument')
    const ret = f()
    if (is_array(ret)) {
      const xJ = ret // interpret returned array as values to be compared
      // if last element of returned array is a function, it will be used as the comparison function fcomp(x0,x) in place of equal(x0,x)
      let fcomp = equal
      if (is_function(last(xJ))) fcomp = xJ.pop()
      if (!(xJ.length >= 2)) fatal(`FAILED CHECK: ${str(f)} → ${str(xJ)}`)
      if (!xJ.every((x, j) => j == 0 || fcomp(xJ[0], x)))
        fatal(`FAILED CHECK: ${str(f)} → ${str(xJ)}`)
    }
    if (!ret) fatal(`FAILED CHECK: ${str(f)}`)
  })
}

// measure calls/sec for each of `funcs`
// typically used in benchmark functions `_benchmark_*()`
// uses shuffle & silent pass to reduce & randomize ordering bias
function benchmark(...funcs) {
  funcs = _.shuffle(flat(funcs))
  funcs.forEach(f =>
    _run_benchmark(f, {
      ..._benchmark_options,
      silent: true,
      N: _benchmark_options.N / 2,
      T: _benchmark_options.T / 2,
    })
  )
  funcs.forEach(f => {
    if (!is_function(f)) fatal('non-function argument')
    _run_benchmark(f)
  })
}

let _benchmark_options = {}
function _run_benchmark(
  f,
  {
    name = str(f),
    // note Date.now itself benchmarks at 10-30M calls/sec
    // so roughly (and naively) we can hope to measure Nx that
    // depends how much of Date.now overhead is before/after returned 'now'
    N = 100, // minimum calls between Date.now
    T = 20, // maximum time (after minimum N calls)
    unit,
    units,
    silent, // can be used for warmups
  } = _benchmark_options
) {
  let time = 0,
    calls = 0,
    count = 0,
    counts,
    unit_funcs
  const ret = f() // return value for custom units
  if (unit) {
    if (!is_number(ret)) fatal('must return number for unit ' + unit)
  } else if (units) {
    if (!(is_object(units) && !is_array(units)))
      fatal('benchmark units must be object of unit:function pairs')
    if (!is_object(ret)) fatal('must return object for units ' + str(units))
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
  } while (time < T)
  if (silent) return
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

function _benchmark_benchmark() {
  benchmark(
    () => Date.now(),
    () => performance.now()
  )
}

// throws(f, [error])
// does function `f` throw an error?
// `error` can be specific error, type, or predicate
function throws(f, error) {
  if (!is_function(f)) fatal('non-function argument')
  try {
    window._testing_throws = true // can be used to disable some logging
    f()
  } catch (e) {
    if (error === undefined) return true
    else if (is_function(error)) return error(e) || e instanceof error
    else return equal(e, error)
  } finally {
    window._testing_throws = false
  }
  return false
}

function _test_throws() {
  check(
    () => !throws(() => {}),
    () => throws(() => throws('a')),
    () => throws(() => throws('a'), EvalError)
  )
}

// `[output, elapsed_ms]`
function timing(f) {
  if (!is_function(f)) fatal('non-function argument')
  const start = Date.now()
  const output = f()
  const elapsed = Date.now() - start
  return [output, elapsed]
}

// cache property `prop` on object `obj`
// defines `obj.prop`, cached in `obj._prop`, computed as `obj.__prop()`
// dependencies must be specified explicitly in array `deps`
// setting to `obj.prop=null` also sets all dependents to `null`
// `obj.__prop` method can be specified as argument `f`
// `options` are passed to `define` as descriptor
function cache(obj, prop, deps, f, options = {}) {
  if (!(is_string(prop) && prop.match(/^\w+$/))) fatal(`invalid prop '${prop}'`)
  if (!is_array(deps)) fatal(`invalid/missing deps for cached '${prop}'`)
  if (!(!f || is_function(f))) fatal(`invalid function for cached '${prop}'`)
  if (!(f || is_function(obj['__' + prop])))
    fatal(`missing/invalid  method '__${prop}' for cached prop`)
  if (f) {
    if (obj['__' + prop])
      fatal(
        `specified function conflicts w/ method '__${prop}' for cached prop`
      )
    obj['__' + prop] = function () {
      return f(this)
    }.bind(obj)
  }
  if (obj.__deps?.[prop]) fatal(`cached prop '${prop} already defined`)
  obj.__deps ??= {}
  obj.__deps[prop] = []
  each(deps, dep => {
    if (!is_array(obj.__deps[dep])) fatal(`unknown dep '${dep}' for '${prop}'`)
    obj.__deps[dep].push(prop)
  })
  define(obj, prop, {
    get: () => (obj['_' + prop] ??= obj['__' + prop].call(obj)),
    set: v => {
      if (!(v === null))
        fatal(`cached property '${prop}' can only be set to null`)
      // NOTE: we can not do this since dependents can be non-null even if all intermediate dependents are null (e.g. if its function does not always access its dependencies)
      // if (obj['_' + prop] === null) return // already null
      // set dependents to null using setter (to set their dependents also)
      each(obj.__deps[prop], dependent => (obj[dependent] = null))
      obj['_' + prop] = null
    },
    ...options,
  })
  obj['_' + prop] = null // init as null
}

// => global_eval(js, [options])
// `eval` in global context
// `js` may not refer to local context (where `global_eval` is invoked)
// `js` may still refer to global context (where `global_eval` is defined)
// `strict` option forces absolute global (`self`) context via [indirect eval](http://perfectionkills.com/global-eval-what-are-the-options/#indirect_eval_call_theory)
// `cached` option (_default_:`true`) caches eval results in `cache` object
// `cache` option (_default_:`_global_eval_cache`) specifies cache object
function global_eval(__js, __options = _global_eval_options) {
  if (__options.cached)
    return (__options.cache[__js] ??= __options.strict
      ? eval.call(self, __js)
      : eval(__js))
  return __options.strict ? eval.call(self, __js) : eval(__js)
}

let _global_eval_cache = {}
let _global_eval_options = {
  strict: false,
  cached: true,
  cache: _global_eval_cache,
}

// markdown table for `cells`
// `cells` is 2D array, e.g. `[['a',1],['b',2]]`
// allows optional header row `options.headers`
function table(cells, options = {}) {
  if (is_array(cells.values)) cells = cells.values // fetch .values if given object
  if (!is_array(cells[0])) cells = [cells] // matrixify if needed
  if (!is_array(cells)) fatal('invalid non-array argument')
  if (cells.length == 0) return ''
  let { headers, alignments = '' } = options
  if (!is_string(alignments)) fatal('invalid alignments, must be string')
  if (!alignments.match(/^[lcr]*$/)) fatal(`invalid alignments '${alignments}'`)
  let lines = []
  const cols = _.maxBy(cells, 'length').length
  const reps = array(cols, k => cells.find(r => r[k])[k]) // first value in each col
  alignments = array(
    cols,
    k => alignments[k] ?? (is_numeric(reps[k][0]) ? 'r' : 'l')
  )
  apply(alignments, a => (a == 'l' ? ':-' : a == 'r' ? '-:' : ':-:'))
  if (headers) {
    apply(headers, h => (is_string(h) ? h : str(h)))
    // if header row is short, extend last column using repeated pipes
    // see https://github.com/calculuschild/marked-extended-tables#readme
    lines.push(
      '| ' + headers.join(' | ') + ' |' + '|'.repeat(cols - headers.length)
    )
  } else lines.push('| '.repeat(cols + 1))
  apply(cells, r => apply(r, c => (is_string(c) ? c : str(c))))
  lines.push('| ' + alignments.join(' | ') + ' |')
  lines = lines.concat(
    cells.map(row => {
      // if any row is short, extend last column using repeated pipes
      // see https://github.com/calculuschild/marked-extended-tables#readme
      return '| ' + row.join(' | ') + ' |' + '|'.repeat(cols - row.length)
    })
  )
  return lines.join('\n')
}

function _count_unescaped(str, substr) {
  if (substr.length == 0) return 0
  let count = 0
  let pos = 0
  while ((pos = str.indexOf(substr, pos)) >= 0) {
    if (str[pos - 1] != '\\') count++
    pos += substr.length
  }
  return count
}

function _js_table_function_status(name) {
  let status = ''
  let test, benchmark
  const gs = _this._global_store
  if (gs._tests && gs._tests[name]) {
    test = gs._tests[name]
    status += link_eval(
      _this,
      `_js_table_show_test('${name}', event)`,
      test.ok ? 'test' : 'FAILED test',
      'test' + (test.ok ? ' ok' : '')
    )
  }
  if (gs._benchmarks && gs._benchmarks[name]) {
    benchmark = gs._benchmarks[name]
    status += link_eval(
      _this,
      `_js_table_show_benchmark('${name}', event)`,
      benchmark.ok ? 'benchmark' : 'FAILED benchmark',
      'benchmark' + (benchmark.ok ? ' ok' : '')
    )
  }
  return [status, test, benchmark]
}

// js_table([regex])
// table of `js` definitions
// can filter names using optional `regex`
function js_table(regex) {
  let scope // class name if inside class scope
  let scope_indent = {}
  let names = new Set()

  // NOTE: parsing nested parentheses w/ regex (e.g. for default function-valued arguments), while avoiding matching inside strings, is quite tricky and can be slow or even hang in some browsers (esp. on chrome/android); the following pattern avoids the most common issues (e.g. catastrophic backtracking, see https://stackoverflow.com/a/17116720) and (for now) allows only a single level of nesting, but can be extended as needed in the future; also note that javascript engine should cache compiled regexes (can be benchmarked easily if needed):
  //
  // (?:`.*?`|'[^\n]*?'|"[^\n]*?"|=[^(){}]*?\([^()]*?\)|[^()])*? <-- key part for nesting is \(...\)
  //
  const js_table_regex =
    /(?:^|\n)(?<comment>( *\/\/[^\n]*\n)*)(?<type>(?:(?:async|static) +)?(?:(?:function|class| *get| *set| +) +))(?<name>[_\p{L}][_\p{L}\d]*) *(?<args>\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\([^()]*?\)|[^()])*?\))/gsu

  const js_table_regex_arrow =
    /(?:^|\n)(?<comment>( *\/\/[^\n]*\n)*)(?<type>(?:const|let|var) +)(?<name>[_\p{L}][_\p{L}\d]*) *(?:= *(?:async +)?(?<arrow_args>(?:\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\([^()]*?\)|[^()])*?\)|[^()\n]*?) *=>)?\s*(?<body>[^\n]+))/gsu

  const js = _this.read('js', { remove_tests_and_benchmarks: true })
  const matches = [
    ...js.matchAll(js_table_regex),
    ...js.matchAll(js_table_regex_arrow),
  ]

  const defs = compact(
    apply(matches, m => {
      const def = merge({ args: '', comment: '' }, m.groups)
      // skip imbalanced args (due to occasional regex failure)
      if (_count_unescaped(def.args, '(') != _count_unescaped(def.args, ')'))
        return

      // store index for sorting
      def.index = m.index

      // extract any indentation from type
      def.indent = def.type.match(/^ */)[0]
      def.type = def.type.trim()

      // clear args if getter/setter
      if (def.type.match(/(?:get|set)$/)) def.args = ''
      // process arrow args
      if (def.arrow_args) {
        def.args = def.arrow_args.replace(/\s*=>$/, '')
        if (!def.args.startsWith('(')) def.args = '(' + def.args + ')'
      }

      // args or body are required unless class
      if (def.type != 'class' && !def.args && !def.body) return

      // remove whitespace in args
      def.args = def.args.replace(/\s+/g, '')

      // start new scope if class type, end last scope if unindented
      if (def.type == 'class') scope = def.name
      else if (!def.indent) scope = null

      // skip indented definitions w/o scope
      if (def.indent && !scope) return

      // assign indented definition to last scope
      // also record indent level or ensure match to existing level
      if (
        (def.indent && scope && !scope_indent[scope]) ||
        scope_indent[scope] == def.indent
      ) {
        def.scope = scope
        scope_indent[scope] = def.indent
      }

      // skip constructor unless commented
      if (!def.type && def.name == 'constructor' && !def.comment) return

      // skip duplicate names unless commented
      if (names.has(def.name) && !def.comment) return
      names.add(def.name)

      // save original name (before possible modification via comments)
      // prefix scoped definitions as <scope>__<name>
      // otherwise Class.func can conflict with global func
      // tests/benchmarks must also use name <scope>__<name>
      def._name = (def.scope ? def.scope + '__' : '') + def.name

      if (def.comment) {
        // clean up: drop //
        def.comment = def.comment
          .replace(/ *\n *(?:\/\/)? ?/g, '\n')
          .replace(/^ *\/\/ */, '')
        // disallow cross-line backticks (causes ugly rendering issues)
        def.comment = def.comment
          .split('\n')
          .map(s => (_count_unescaped(s, '`') % 2 == 0 ? s : s + '`'))
          .join('\n')

        // displayed name/args can be modified via first line of comment:
        // <name>(...) modifies args, <name> removes args
        // => <display_name> or => <display_name>(...) modifies name/args
        if (
          def.comment.match(/^=> *\S+/) ||
          def.comment.match(new RegExp(`^${def.name} *(?:\\(.*\\))?(?:$|\n)`))
        ) {
          def.name = def.comment.match(/^[^(<\n]+/)[0].replace(/^=> */, '')
          def.args = def.comment.match(/^.+?(\(.*)(?:$|\n)/)?.pop() ?? ''
          def.comment = def.comment.replace(/^.+?(?:\(.*)?(?:$|\n)/, '')
          def.modified = true
        }
      }

      // filter by regex (applied to original _name) if specified
      if (regex && !regex.test(def._name)) return

      // skip underscore-prefixed definitions unless modified or regex-matched
      if (def._name.match(/^_/) && !def.modified && !regex) return

      // skip commands unless regex-matched
      if (def._name.match(/^_on_command_/) && !regex) return

      // skip indented definitions unless modified by comments
      // NOTE: this means class methods/properties must be modified, w/ attention paid to arguments (used to distinguish method from properties) for proper rendering/linking
      if (def.indent && !def.modified) return

      if (!def.comment && def.body && !def.body.startsWith('{')) {
        // take body as comment
        def.comment = '`` ' + def.body + ' ``'
        // if body is a lodash function, link to docs
        // note docs are only available for certain versions
        if (def.body.match(/^_\.\w+$/)) {
          def.comment =
            `[${def.comment}](https://lodash.com/docs/` +
            `4.17.15#${def.body.substring(2)})`
        }
        // if body is a static function on a global object, link to docs
        if (def.body.match(/^[A-Z]\w+\.\w+$/))
          def.comment =
            `[${def.comment}](https://developer.mozilla.org/en-US/docs/Web/` +
            `JavaScript/Reference/Global_Objects/` +
            def.body.replace('.', '/') +
            ')'
      }
      return def
    })
  )
  sort_by(defs, d => d.index)

  let lines = []
  defs.forEach(def => {
    // process comment lines, converting pipe-prefixed/separated lines to tables
    // typically used to document function arguments or options
    let comment_lines = [] // processed comment
    let comment_table_cells = []
    def.comment
      .replace(/^\n+/g, '') // drop leading empty lines
      .replace(/\n+$/g, '') // drop trailing empty lines
      .split('\n')
      .forEach(line => {
        if (line.startsWith('|')) {
          // escape | inside backticks to avoid breaking table
          line = line.replace(/`.+?`/g, m => m.replace(/\|/g, '%_pipe_%'))
          let cells = line.split(/\s*\|\s*/).slice(1) // ignore leading |
          apply(cells, s => s.replace(/%_pipe_%/g, '\\|'))
          comment_table_cells.push(cells)
        } else {
          if (comment_table_cells.length) {
            comment_lines.push(table(comment_table_cells))
            comment_table_cells = []
          }
          comment_lines.push(line)
        }
      })
    // add final table w/ new line (unlike inner tables)
    if (comment_table_cells.length)
      comment_lines.push(table(comment_table_cells))

    // trim blank lines
    while (comment_lines[0]?.length == 0) comment_lines.shift()
    while (last(comment_lines)?.length == 0) comment_lines.pop()

    // hide all non-first comment lines
    const has_more = comment_lines.length > 1 ? 'has_more' : ''
    if (comment_lines.length > 1) {
      def.comment =
        comment_lines[0] +
        _span('less', _span('more-indicator', '')) +
        _div('more', '\n' + comment_lines.slice(1).join('\n') + '\n')
    } else {
      def.comment = comment_lines[0] || ''
    }

    // put together name and args as "usage"
    // trim name (can contain spaces for commands, e.g. "/push [items]")
    // remove all whitespace from args except after commas & around equals
    // auto-wrap default-valued optionals in brackets
    const name = def.name.trim()
    const wrap_defaults = args =>
      args
        .replace(/\s+/g, '')
        .replace(/^\(|\)$/g, '')
        .split(/\,(?![^(]*\)|[^\[]*\]|[^{]*\})/) // matches commas NOT inside parens (single level), see https://stackoverflow.com/a/41071568; TODO: refactor this, used in three places
        .map(s => {
          // for object destructuring, just recursively parse inside braces
          if (s.match(/^\{.*\}$/))
            return '{' + wrap_defaults(s.slice(1, -1)) + '}'
          // avoid initial [ since thatcan be used to wrap/indicate defaults in hand-typed comments, but unfortunately this also prohibits array destructuring syntax (e.g. [a=1,b=2]=[]) for now
          if (s[0] != '[' && s.match(/=(?!>|[^{]*\})/)) s = '[' + s + ']'
          // drop =undefined as that can be used to indicate optionals
          return s.replace(/=undefined]$/, ']')
        })
        .join(',')

    let args = wrap_defaults(def.args)
    if (def.args) args = '(' + args + ')'
    let args_expanded = args
      .replace(/\,(?![^(]*\)|[^\[]*\]|[^{]*\})/g, ', ')
      .replace(/=(?!>)/g, ' = ')
    const has_defaults = args.match(/\[(.+?)=.+?\]/) ? 'has_defaults' : ''
    // NOTE: this simple regex does not work for {arg=default} but does for arg={}
    args = args.replace(/\[(.+?)=(?!>).+?\]/g, '[$1]') // hide defaults unless expanded
    args = args.replace(/[(\[{}\])]/g, p => _span('parens', p))
    args_expanded = args_expanded.replace(/[(\[{}\])]/g, p =>
      _span('parens', p)
    )
    let usage =
      `<span class="name">${name}</span>` +
      `<span class="args">${args}</span><span class="args expanded">${args_expanded}</span>`

    // restore toggled state from local store (triggers render on change)
    let toggled = ''
    const ls = _this._local_store
    const stored_toggle = ls._js_table?.[def._name]
    if (stored_toggle === true) toggled = 'expanded'
    else if (stored_toggle === false) toggled = 'collapsed'

    // if tested indicate result as styling on usage
    // also consider benchmark errors
    const [status, test, benchmark] = _js_table_function_status(def._name)
    let ok = ''
    if (test) ok = test.ok ? 'ok' : 'error'
    if (benchmark && !benchmark.ok) ok = 'error'

    const bullets =
      _span('bullet' + (test ? ` test ${test.ok ? ' ok' : ''}` : '')) +
      _span(
        'bullet' + (benchmark ? ` benchmark ${benchmark.ok ? ' ok' : ''}` : '')
      )

    def.scope ??= '' // used in class name below
    const scoped = def.scope ? 'scoped' : ''

    // NOTE: we prefer returning markdown-inside-table instead of returning a pure _html block, because _html is mostly unparsed whereas markdown is parsed just like other content on item, e.g. for math blocks
    lines.push(
      _div(
        `function name_${def._name} scope_${def.scope} ${scoped} ${has_more} ${has_defaults} ${toggled} ${ok}`,
        _span('usage', bullets + usage) + _span('desc', '\n' + def.comment)
      )
    )
  })

  return [
    _div(
      'core_js_table',
      lines.join('\n')
      // `onclick='event.stopPropagation()'`
    ), // style wrapper, see core.css
    // install click handlers at every render (via uncached script)
    '<script _uncached> _js_table_install_click_handlers() </script>',
  ].join('\n')
}

function _install_core_css() {
  // require local invocation with _this being lexical this
  if (!(_this.name == '#util/core')) fatal('_install_core_css from non-core')
  // use core deephash as a quick check before reading/hashing css
  if (_this.store.css_core_hash == _this.deephash) return // no change to core
  _this.store.css_core_hash = _this.deephash
  const css = _this.read('css')
  const css_hash = _hash(css)
  if (_this.store.css_hash == css_hash) return // no change to core css
  const style = document.createElement('style')
  style.className = 'core-css'
  style.innerHTML = css
  const existing_style = document.querySelector('.core-css')
  if (!existing_style) document.head.appendChild(style)
  else existing_style.replaceWith(style)
  _this.store.css_hash = css_hash
}

// install core.css and set up globals (attached to window) on init
function _init() {
  if (typeof window === 'undefined') return // non-window context
  _install_core_css()

  // delete window.print to prevent ambiguity w/ print() in #/item
  delete window.print

  // attach MindBox to window for easy access from HTML and non-dependents
  // importing #util/core is optional, enables auto-updates
  window.MindBox = MindBox

  // attach global "macros" to window
  // importing #util/core is optional, enables auto-updates
  // importing #util/core also ensures _this refers to invoking item
  // _this shold generally be avoided in global macros to avoid this ambiguity
  window.block = block
  window.link_js = link_js
  window.link_eval = link_eval
  window.link_command = link_command
}

// re-install core.css on any changes to core (or dependencies)
// only invoked for #core since it is not a listener
function _on_item_change() {
  if (_this.name != '#util/core') fatal(`unexpected _on_item_change`)
  _install_core_css()
}

// TODO: refactor these into util/html?
function _div(class_, content = '', attrs = '') {
  return `<div class="${class_}" ${attrs}>${content}</div>`
}

function _span(class_, content = '', attrs = '') {
  return `<span class="${class_}" ${attrs}>${content}</span>`
}

function _js_table_install_click_handlers() {
  if (!_this.elem) return // element not on page, cancel
  // install click handlers!
  _this.elem.querySelectorAll('.core_js_table .function').forEach(func => {
    const usage = func.querySelector('.usage')
    const name = Array.from(func.classList)
      .find(c => c.startsWith('name_'))
      .slice(5)
    // toggle truncated class based on truncation on func or usage
    // NOTE: we separate 'truncated' class from 'has_more' so we can use it only for non-height-changing styles (e.g. cursor) to avoid flicker as this class is toggled during script execution
    const truncated =
      func.offsetWidth < func.scrollWidth ||
      usage.offsetWidth < usage.scrollWidth
    func.classList.toggle('truncated', truncated)
    const expanded = func.classList.contains('expanded')
    const has_more = func.classList.contains('has_more')
    const has_defaults = func.classList.contains('has_defaults')
    // onmousedown w/ cancelled click tends to be more robust
    // however onclick allows text selection so we use that for now
    //func.onclick = e => (e.stopPropagation(), e.stopPropagation())
    //func.onmousedown = e => {
    func.onclick = e => {
      if (getSelection().type == 'Range') return // ignore click w/ text selected
      e.stopPropagation()
      e.preventDefault()
      if (has_more || has_defaults || expanded || truncated)
        _js_table_toggle(name, e)
    }
    const args = usage.querySelector('.args').innerText
    // usage.onclick = e => (e.stopPropagation(), e.stopPropagation())
    // usage.onmousedown = e => {
    usage.onclick = e => {
      if (getSelection().type == 'Range') return // ignore click w/ text selected
      e.stopPropagation()
      e.preventDefault()
      _js_table_show_function(name)
    }
  })
  // wait for dom update, then indicate that tables are "ready"
  // use "almost_ready" class to confirm after dispatch
  _this.elem.querySelectorAll('.core_js_table').forEach(table => {
    table.classList.add('almost_ready')
  })
  _update_dom().then(() => {
    if (!_this.elem) return // element no longer on page, cancel
    _this.elem
      .querySelectorAll('.core_js_table.almost_ready')
      .forEach(table => {
        table.classList.remove('almost_ready')
        table.classList.add('ready')
      })
  })
}

function _js_table_toggle(name, e) {
  e.preventDefault()
  e.stopPropagation()
  const func = e.target.closest('.function')
  const expand =
    func.classList.contains('expanded') && !func.classList.contains('collapsed')
  // update dom immediately before re-render due to local store change
  func.classList.toggle('expanded', !expand)
  func.classList.toggle('collapsed', expand)
  // store toggle state in local store (triggers render on change)
  const ls = _this.local_store
  ls._js_table = set(ls._js_table || {}, name, !expand)
}

function _js_table_show_function(name) {
  if (!_this.elem) return // element not on page, cancel
  const func = _this.elem.querySelector(`.function.name_${name}`)
  const usage = func.querySelector('.usage')
  const display_args = func.querySelector('.args').innerText
  let display_name = func.querySelector('.name').innerText
  const scope = Array.from(func.classList)
    .find(c => c.startsWith('scope_'))
    .slice(6)
  if (scope) display_name = scope + '.' + display_name
  // remove all whitespace from args except before commas & around equals
  const args = usage
    .querySelector('.args.expanded')
    .innerText.replace(/\,(?![^(]*\)|[^\[]*\]|[^{]*\})/g, ', ')
    .replace(/=(?!>)/g, ' = ')
    .replace(/[(\[{}\])]/g, p => _span('parens', p))
  // look up function using _this.eval
  let ref, def
  const unindent = fstr => {
    if (!fstr) return fstr
    fstr = fstr.toString()
    const indent = fstr.match(/\n( +)\} *$/)?.pop()
    if (indent) fstr = fstr.replace(new RegExp(`^${indent}`, 'gm'), '')
    return fstr
  }
  const eval_options = {
    trigger: 'js_table',
    remove_empty_lines: false,
    remove_comment_lines: false,
  }
  try {
    // try custom _function_<name>() first
    // should return either a function or a property descriptor object (w/ .get or .set or both)
    def = _this.eval(
      `typeof _function_${name} == 'function' ? _function_${name}() : null`,
      eval_options
    )
    if (def) {
      if (typeof def == 'function') def = unindent(def.toString())
      else if (typeof def == 'object' && (def.get || def.set))
        // assume property descriptor
        def = `get: ${unindent(def.get)}\nset: ${unindent(def.set)}`
      else throw new Error(`invalid return '${def}' from _function_${name}()`)
    } else {
      // assume class member name has double-underscore in middle
      if (name.match(/^\w+__\w+$/)) {
        // assume function if has args, otherwise property
        if (display_args) {
          const instance_ref = name.replace('__', '.prototype.')
          const static_ref = name.replace('__', '.')
          ref = `${instance_ref} ?? ${static_ref}`
          def = unindent(_this.eval(ref, eval_options))
        } else {
          const [class_name, prop] = name.split('__')
          ref = `Object.getOwnPropertyDescriptor(${class_name}.prototype, '${prop}') ?? Object.getOwnPropertyDescriptor(${class_name}, '${prop}')`
          def = _this.eval(ref, eval_options)
          if (def) def = `get: ${unindent(def.get)}\nset: ${unindent(def.set)}`
        }
      } else {
        ref = name
        def = _this.eval(ref, eval_options)
      }
    }
  } catch (e) {
    alert(`failed to get function '${name}' as '${ref}': ${e}`)
  }
  const [status] = _js_table_function_status(name)
  _modal_close() // in case invoked from existing modal
  _modal(
    _div(
      'core_js_table_modal', // style wrapper, see core.css
      (status ? _div('buttons', status) : '') +
        _div('title', `<code>${display_name}</code>` + _span('args', args)) +
        '\n\n' +
        block('js', def) +
        '\n'
    )
  )
}

function _js_table_show_test(name) {
  if (!_this.elem) return // element not on page, cancel
  const test = _this._global_store._tests[name]
  const run_link = link_eval(
    _this,
    `_js_table_run_test('${name}',event)`,
    'run',
    'run test' + (test.ok ? ' ok' : '')
  )
  const def_link = link_eval(
    _this,
    `_js_table_show_function('${name}', event)`,
    '⬅︎',
    'function'
  )
  const func = _this.elem.querySelector(`.function.name_${name}`)
  let display_name = func.querySelector('.name').innerText
  const scope = Array.from(func.classList)
    .find(c => c.startsWith('scope_'))
    .slice(6)
  if (scope) display_name = scope + '.' + display_name

  _modal_close() // in case invoked from existing modal
  _modal(
    _div(
      'core_js_table_modal', // style wrapper, see core.css
      [
        _div('buttons', def_link + run_link),
        _div(
          `title test ${test.ok ? 'ok' : ''}`,
          `<code>${display_name}</code>` +
            (test.ok
              ? _span('summary ok', `test passed in ${test.ms}ms`)
              : _span('summary', `test FAILED in ${test.ms}ms`))
        ),
        '\n',
        !test.ok ? block('_log', test.log.join('\n')) : '',
        '\n',
        block(
          'js',
          _this.eval(test.test || `_test_${name}`, {
            trigger: 'js_table',
            remove_tests_and_benchmarks: false,
            type: 'js|js_tests?',
            remove_empty_lines: false,
            remove_comment_lines: false,
          })
        ),
        '\n',
      ].join('\n')
    )
  )
}

async function _js_table_run_benchmark(name, e) {
  if (!_exists('#benchmarker', false)) {
    alert('missing #benchmarker')
    return
  }
  const link = e.target
  const modal = link.closest('.core_js_table_modal')
  modal.classList.add('running')
  // dynamically eval/invoke benchmark_item function from #benchmarker
  const benchmark = _this._global_store._benchmarks[name]
  const fname = benchmark.benchmark?.replace(/^_benchmark_/, '') ?? name
  await _item('#benchmarker', { silent: true })?.eval('benchmark_item')(
    _this,
    fname
  )
  modal.classList.remove('running')
  _js_table_show_benchmark(name)
}

async function _js_table_run_test(name, e) {
  if (!_exists('#tester', false)) {
    alert('missing #tester')
    return
  }
  const link = e.target
  const modal = link.closest('.core_js_table_modal')
  modal.classList.add('running')
  // dynamically eval/invoke benchmark_item function from #benchmarker
  const test = _this._global_store._tests[name]
  const fname = test.test?.replace(/^_test_/, '') ?? name
  await _item('#tester', { silent: true })?.eval('test_item')(_this, fname)
  modal.classList.remove('running')
  _js_table_show_test(name)
}

function _js_table_show_benchmark(name) {
  if (!_this.elem) return // element not on page, cancel
  const benchmark = _this._global_store._benchmarks[name]
  let log = [] // unparsed log lines
  let rows = [] // parsed benchmark log lines
  for (const line of benchmark.log) {
    let [name, result] =
      line.match(/^(.+)\s*: ([\d,]+ calls\/sec.*)$/)?.slice(1) ?? []
    if (result) {
      result = result.replace(' calls/sec', '/s') // abbreviate calls/sec
      // escape special characters in name: `, \, and | (breaks table)
      name = name.replace(/([`\\|])/g, '\\$1')
      rows.push([result, name])
    } else if (!line.match(/in (\d+)ms$/)) log.push(line)
  }
  sort_by(rows, r => -parseInt(r[0].replace(/,/g, '')))
  const run_link = link_eval(
    _this,
    `_js_table_run_benchmark('${name}',event)`,
    'run',
    'run benchmark' + (benchmark.ok ? ' ok' : '')
  )
  const def_link = link_eval(
    _this,
    `_js_table_show_function('${name}', event)`,
    '⬅︎',
    'function'
  )
  const func = _this.elem.querySelector(`.function.name_${name}`)
  let display_name = func.querySelector('.name').innerText
  const scope = Array.from(func.classList)
    .find(c => c.startsWith('scope_'))
    .slice(6)
  if (scope) display_name = scope + '.' + display_name

  _modal_close() // in case invoked from existing modal
  _modal(
    _div(
      'core_js_table_modal', // style wrapper, see core.css
      [
        _div('buttons', def_link + run_link),
        _div(
          `title benchmark ${benchmark.ok ? 'ok' : ''}`,
          `<code>${display_name}</code>` +
            (benchmark.ok
              ? _span('summary ok', `benchmark done in ${benchmark.ms}ms`)
              : _span('summary', `benchmark FAILED in ${benchmark.ms}ms`))
        ),
        rows.length ? _div('results', '\n\n' + table(rows) + '\n') : '',
        '\n',
        log.length ? block('_log', log.join('\n')) : '',
        '\n',
        block(
          'js',
          _this.eval(benchmark.benchmark || `_benchmark_${name}`, {
            trigger: 'js_table',
            remove_tests_and_benchmarks: false,
            type: 'js|js_benchmarks?',
            remove_empty_lines: false,
            remove_comment_lines: false,
          })
        ),
        '\n',
      ].join('\n')
    )
  )
}

const fetch_text = (...args) => fetch(...args).then(r => r.text())
const fetch_json = (...args) => fetch(...args).then(r => r.json())
const fetch_blob = (...args) => fetch(...args).then(r => r.blob())
const fetch_form = (...args) => fetch(...args).then(r => r.formData())
const fetch_buffer = (...args) => fetch(...args).then(r => r.arrayBuffer())
const fetch_auto = (...args) =>
  fetch(...args).then(r => {
    const length = r.headers.get('content-length')
    if (!length) return undefined // empty or missing body
    const type = r.headers.get('content-type')
    if (!type) return r.arrayBuffer() // unknown type, return as buffer
    if (type.startsWith('application/json')) return r.json()
    if (type.startsWith('text/')) return r.text()
    if (type.startsWith('image/')) return r.blob()
    if (type.startsWith('application/x-www-form-urlencoded'))
      return r.formData()
    return r.arrayBuffer()
  })

const command_table = () => js_table(/^_on_command_/)

// wrap `content` in block `type`
const block = (type, content) => '```' + type + '\n' + content + '\n```'

// link html (`<a>…</a>`) to eval `js`
// sets up `js` as `onmousedown` handler
const link_js = (js, text = js, classes = '', style = '', title = js) =>
  `<a href="#" onmousedown="` +
  _.escape(js) +
  `;event.preventDefault();event.stopPropagation()" ` +
  `onclick="event.preventDefault();event.stopPropagation()" ` +
  `class="${classes}" style="${style}" title="${_.escape(title)}">${text}</a>`
// NOTE: using onmousedown + cancelled onclick maintains keyboard focus and is generally more robust, especially on mobile devices w/ virtual keyboards

// link to eval `js` in context of `item`
const link_eval = (item, js, text = js, classes = '', style = '', title = js) =>
  link_js(
    `_item('${item.id}')` + '.eval(`' + js.replace(/([`\\$])/g, '\\$1') + '`)',
    text,
    classes,
    style,
    title
  )
// NOTE: mouse 'event' is still available in context of eval

// link to run `command`
const link_command = (
  command,
  text = cmd,
  options = '',
  classes = '',
  style = '',
  title = cmd
) =>
  link_js(
    `MindBox.create(\`${command}\`,{${options}})`,
    text,
    classes,
    style,
    title
  )

// MindBox static class/object
class MindBox {
  static get() {
    return MindBox.elem.value
  }
  static set(text, options) {
    MindBox.elem.value = text
    // also shift selection to the end
    // on Safari, setting the selection can auto-focus so we have to blur
    const wasFocused = document.activeElement.isSameNode(MindBox.elem)
    MindBox.elem.selectionStart = MindBox.elem.value.length
    if (!wasFocused) MindBox.elem.blur()
    // trigger input event for handling of change
    MindBox.elem.dispatchEvent(new Event('input'))
    // scroll to target if requested
    if (options?.scroll) MindBox.scroll_to_target()
    // select text in target if requested
    if (options?.select) MindBox.select_in_target(options.select)
    // edit target if requested
    if (options?.edit)
      MindBox.edit_target(typeof options.edit == 'string' ? options.edit : '')
  }
  static clear() {
    MindBox.set('')
  }
  static toggle(text) {
    if (MindBox.get().trim() == text.trim()) MindBox.clear()
    else MindBox.set(text)
  }
  static focus(text) {
    if (typeof text == 'string') MindBox.set(text)
    MindBox.elem.selectionStart = MindBox.elem.value.length
    MindBox.elem.focus()
    MindBox.scroll_to_header()
  }
  // MindBox.create emulates 'create' button
  static create(text, options) {
    text ??= MindBox.get() // default text is from MindBox
    options = merge({ emulate_button: true }, options)
    return window._create(text, options)
  }
  // scroll to header if necessary
  static scroll_to_header() {
    const header = document.querySelector('.header')
    if (document.body.scrollTop > header.offsetTop) _scroll_to(header.offsetTop)
  }
  // scroll to target if necessary
  // waits for dom update in case target is changing, e.g. due to MindBox.set
  static scroll_to_target() {
    _update_dom().then(() => {
      const target = document.querySelector('.super-container.target')
      if (!target) return // no target (missing or modified during dispatch)
      const header = document.querySelector('.header')
      if (
        target.offsetTop < document.body.scrollTop ||
        target.offsetTop > document.body.scrollTop + visualViewport.height - 200
      )
        _scroll_to(
          Math.max(
            header.offsetTop,
            target.offsetTop - visualViewport.height / 4
          )
        )
    })
  }
  // select text in target
  // waits for dom update in case target is changing, e.g. due to MindBox.set
  static select_in_target(text) {
    _update_dom().then(() => {
      const target = document.querySelector('.container.target')
      if (!target) return // no target (missing or modified during dispatch)
      const pos = _item(target.getAttribute('data-item-id')).text.indexOf(text)
      const textarea = target.querySelector('textarea') // already editing?
      if (pos < 0) console.error('could not find text: ' + text)
      else {
        if (textarea) {
          textarea.focus()
          textarea.setSelectionRange(pos, pos + text.length)
        } else
          target.setAttribute('data-selection', `${pos},${pos + text.length}`)
      }
    })
  }
  // edit target & select text (if any given)
  // waits for dom update in case target is changing, e.g. due to MindBox.set
  // should also trigger a scroll as needed (so no need to scroll_to_target)
  static edit_target(text) {
    // NOTE: dispatched edit can fail to focus (i.e. bring up keyboard) on touch devices (esp. iphones) without a preceding user interaction, which we can usually work around by focusing on another textarea (mindbox) now (presumably after a user interaction), even if another item is already in focus
    if (navigator.maxTouchPoints) MindBox.elem.focus()
    _update_dom().then(() => {
      let target = document.querySelector('.container.target')
      if (!target) return // no target (missing or modified during dispatch)
      const textarea = target.querySelector('textarea') // already editing?
      if (text) {
        const pos = _item(target.getAttribute('data-item-id')).text.indexOf(
          text
        )
        if (pos < 0) console.error('could not find text: ' + text)
        else {
          if (textarea) {
            textarea.focus()
            textarea.setSelectionRange(pos, pos + text.length)
          } else
            target.setAttribute('data-selection', `${pos},${pos + text.length}`)
        }
      }
      if (textarea) {
        // already editing, just scroll, but dispatch to allow time to focus (just in case)
        setTimeout(() => {
          const header = document.querySelector('.header')
          target = target.closest('.super-container') // for correct offsetTop
          if (
            target.offsetTop < document.body.scrollTop ||
            target.offsetTop >
              document.body.scrollTop + visualViewport.height - 200
          )
            _scroll_to(
              Math.max(
                header.offsetTop,
                target.offsetTop - visualViewport.height / 4
              )
            )
        }, 100)
      } else {
        // dispatch click to edit
        target.dispatchEvent(new Event('mousedown'))
        target.dispatchEvent(new Event('click'))
      }
    })
  }
  // MindBox.elem property
  static get elem() {
    return document.getElementById('textarea-mindbox')
  }
}
