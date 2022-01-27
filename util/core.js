const keys = Object.keys
const values = Object.values
const entries = Object.entries
const assign = Object.assign
const from_entries = Object.fromEntries
const from_pairs = _.fromPairs
const to_pairs = _.toPairs

const get = _.get
const set = _.set
const unset = _.unset
const update = _.update
const merge = _.merge
const clone = _.clone
const clone_deep = _.cloneDeep
const clone_deep_with = _.cloneDeepWith
const zip = _.zip
const zip_with = _.zipWith
const zip_object = _.zipObject
const unzip = _.unzip

const remove = _.remove
const pull = _.pull
const first = _.first
const last = _.last
const take = _.take
const take_while = _.takeWhile
const pick = _.pick
const pick_by = _.pickBy
const omit = _.omit
const omit_by = _.omitBy

const every = _.every
const some = _.some
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

const sort = (xJ, f = (a, b) => a - b) => xJ.sort(f)
const sort_by = (xJ, f = x => x) => xJ.sort((a, b) => f(a) - f(b))
const rank = (xJ, f = (a, b) => a - b) => xJ.sort((a, b) => f(b, a))
const rank_by = (xJ, f = x => x) => xJ.sort((a, b) => f(b) - f(a))

const sorted_index = _.sortedIndex
const sorted_last_index = _.sortedLastIndex

const lower = x => x.toLowerCase()
const upper = x => x.toUpperCase()

const lookup = (obj, keys, missing = undefined) =>
  keys.map(k => obj[k] ?? missing)

// look up values by type
// returns last value of each type
function lookup_types(values, ...types) {
  return lookup(
    zip_object(
      values.map(x => typeof x),
      values
    ),
    flat(types)
  )
}

// => tranpose_objects(xJN|xNJ)
// tranpose array of objects or vice versa
function transpose_objects(z) {
  if (is_array(z)) {
    const xJN = z
    if (xJN.length == 0) return {}
    assert(is_object(xJN[0]), 'invalid first element')
    const nK = keys(xJN[0])
    assert(
      xJN.every(xjN => equal(keys(xjN), nK)),
      'non-rectangular transpose'
    )
    return zip_object(
      nK,
      nK.map(n => map(xJN, n))
    )
  } else if (is_object(z)) {
    const xNJ = z
    if (empty(xNJ)) return []
    const nK = keys(xNJ)
    const xKJ = values(xNJ)
    assert(is_array(xKJ[0]), 'invalid first value')
    const J = xKJ[0].length
    assert(
      xKJ.every(xkJ => xkJ.length == J),
      'non-rectangular transpose'
    )
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

// [JSON.stringify](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) w/ function support
function stringify(value) {
  return JSON.stringify(value, function (k, v) {
    if (is_function(v)) {
      v = v.toString()
      // collapse all leading spaces not inside backticks
      v = v.replace(/`.*`|\n\s+/gs, m => (m[0] == '`' ? m : '\n '))
      return `__function:${v}`
    }
    return v
  })
}

// [JSON.parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) w/ function support
function parse(text) {
  return JSON.parse(text, function (k, v) {
    if (is_string(v) && v.match(/^__function:/)) {
      v = v.replace(/^__function:/, '')
      if (!this.__function_context) return eval(v)
      const context = this.__function_context
      // we use a wrapper to emulate original function context/scope
      const wrapper = `(function({${keys(context)}}) { return ${v} })`
      return eval(wrapper)(context)
    }
    return v
  })
}

// converts `x` to a simple string
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
  if (!defined(x)) return 'undefined'
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
      (_.keys(x).length ? ' ' + _str_object(x) : '')
    )
  // array elements stringified recursively
  if (is_array(x)) return '[ ' + x.map(str).join(' ') + ' ]'
  // at this point
  assert(is_object(x), 'str: unexpected type ' + typeof x)
  // object values stringified recursively
  // toString used if overloaded (e.g. Date)
  if (x.toString !== Object.prototype.toString) return x.toString()
  return _str_object(x)
}

function _str_object(x) {
  // _.entries uses .entries() for maps
  return (
    (x.constructor.name != 'Object'
      ? `[${typeof x} ${x.constructor.name}] `
      : '') +
    '{ ' +
    _.entries(x)
      .map(([k, v]) => `${k}:${str(v)}`)
      .join(' ') +
    ' }'
  )
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
      str(_.assign(() => {}, { a: 10000, b: '1', c: 1, d: 1.1 })),
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

// rounds `x` to `d` decimal places
// `d` can be negative for digits _before_ decimal point
// `d` can be restricted to at most `s` significant (non-zero) digits
// `mode` string can be `round`, `floor`, or `ceil`
// rounds arrays recursively by copying
const round_to = (x, d = 0, s = inf, mode = 'round') => {
  if (is_array(x)) return x.map(xj => round_to(xj, d, s, mode))
  if (!is_finite(x)) return x // return non-finite (incl. non-number) as is
  if (d == 0 && s == inf) return Math[mode](x) // just use Math.*
  // determine d automatically if s<inf
  if (s < inf) {
    assert(s > 0, `invalid significant digits ${s}`)
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
    () => [round_to(-1.2345, 5, 3, 'floor'), -1.24]
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

const assert = (cond, ...args) => cond || fatal(...args)

// throws error if any of `funcs` returns falsy
// if array is returned, all elements must be `equal`
// typically used in test functions `_test_*()`
function check(...funcs) {
  flat(funcs).forEach(f => {
    assert(is_function(f), 'non-function argument')
    const ret = f()
    if (is_array(ret)) {
      const xJ = ret // interpret returned array as values to be compared
      // if last element of returned array is a function, it will be used as the comparison function fcomp(x0,x) in place of equal(x0,x)
      let fcomp = equal
      if (is_function(last(xJ))) fcomp = xJ.pop()
      assert(xJ.length >= 2, `FAILED CHECK: ${str(f)} → ${str(xJ)}`)
      assert(
        xJ.every((x, j) => j == 0 || fcomp(xJ[0], x)),
        `FAILED CHECK: ${str(f)} → ${str(xJ)}`
      )
    }
    assert(ret, `FAILED CHECK: ${str(f)}`)
  })
}

// measures calls/sec for each of `funcs`
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
    assert(is_function(f), 'non-function argument')
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
    assert(is_number(ret), 'must return number for unit ' + unit)
  } else if (units) {
    assert(
      is_object(units) && !is_array(units),
      'benchmark units must be object of unit:function pairs'
    )
    assert(is_object(ret), 'must return object for units ' + str(units))
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
  assert(is_function(f), 'non-function argument')
  try {
    f()
  } catch (e) {
    if (error === undefined) return true
    else if (is_function(error)) return error(e) || e instanceof error
    else return equal(e, error)
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
  assert(is_function(f), 'non-function argument')
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
// `options` are passed to `Object.defineProperty` in descriptor argument
function cache(obj, prop, deps, f, options = {}) {
  assert(is_string(prop) && prop.match(/^\w+$/), `invalid prop '${prop}'`)
  assert(is_array(deps), `invalid/missing deps for cached '${prop}'`)
  assert(!f || is_function(f), `invalid function for cached '${prop}'`)
  assert(
    f || is_function(obj['__' + prop]),
    `missing/invalid  method '__${prop}' for cached prop`
  )
  if (f) {
    assert(
      !obj['__' + prop],
      `specified function conflicts w/ method '__${prop}' for cached prop`
    )
    obj['__' + prop] = function () {
      return f(this)
    }.bind(obj)
  }
  assert(!obj.__deps?.[prop], `cached prop '${prop} already defined`)
  obj.__deps ??= {}
  obj.__deps[prop] = []
  each(deps, dep => {
    assert(is_array(obj.__deps[dep]), `unknown dep '${dep}' for '${prop}'`)
    obj.__deps[dep].push(prop)
  })
  Object.defineProperty(obj, prop, {
    get: () => (obj['_' + prop] ??= obj['__' + prop].call(obj)),
    set: v => {
      assert(v === null, `cached property '${prop}' can only be set to null`)
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

// markdown table for `cells`
// `cells` is 2D array, e.g. `[['a',1],['b',2]]`
// allows optional header row `options.headers`
function table(cells, options = {}) {
  const { headers } = options
  let lines = []
  if (headers) {
    apply(headers, h => (is_string(h) ? h : str(h)))
    lines.push('|' + headers.join('|') + '|')
  } else lines.push(array(cells[0].length + 1, k => '|').join(''))
  apply(cells, r => apply(r, c => (is_string(c) ? c : str(c))))
  lines.push(
    '|' +
      array(cells[0].length, k =>
        is_numeric(cells[0][k].replaceAll(',', '')) ? '-:' : '-'
      ).join('|') +
      '|'
  )
  lines = lines.concat(cells.map(row => '|' + row.join('|')))
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
    status += evallink(
      _this,
      `_js_table_show_test('${name}', event)`,
      test.ok ? 'test' : 'FAILED test',
      'test' + (test.ok ? ' ok' : '')
    )
  }
  if (gs._benchmarks && gs._benchmarks[name]) {
    benchmark = gs._benchmarks[name]
    status += evallink(
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

  // NOTE: parsing nested parentheses w/ regex, e.g. for default function arguments, is quite tricky and can be slow or cause infinite loops depending on browser (esp. on android); we use a very specific pattern that allows a single level of nesting for optional arguments only (i.e. only after an equals sign) and can ignore (potentially unmatched) parentheses inside strings, but even this pattern is likely to fail in some cases so we have to keep an eye on it
  //
  // key pattern for nested parentheses w/o strings:
  // (?:`.*?`|'[^\n]*?'|"[^\n]*?"|\([^()]*?\)|[^()]*?)*? <-- requires sufficient nesting, can hang on android
  // (?:`.*?`|'[^\n]*?'|"[^\n]*?"|\([^()]*?\)|.*?)*? <-- allows insufficient nesting (w/ imperfect parsing that may require balance checks), does not hang on android
  // the |=[^(){}]*?\(... prefix restricts pattern to optional arguments and seems to be necessary (including the {} exclusion) for robust parsing
  //
  // also note javascript engine _should_ cache the compiled regex
  const __js_table_regex =
    /(?:^|\n)(?<comment>( *\/\/[^\n]*\n)*)(?<type>(?:(?:async|static) +)*(?:(?:function|const|let|var|class| *get| *set) +)?)(?<name> *\w+) *(?:(?<args>\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|=[^(){}]*?\([^()]*?\)|.*?)*?\))|= *(?<arrow_args>(?:\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|=[^(){}]*?\([^()]*?\)|.*?)*?\)|[^()\n]*?) *=>)?\s*(?<body>[^\n]+))?/gs

  const defs = _.compact(
    Array.from(
      _this
        .read('js', { keep_empty_lines: true, keep_comment_lines: true })
        .matchAll(__js_table_regex),
      m => {
        const def = _.merge({ args: '', comment: '' }, m.groups)
        // skip imbalanced args (due to occasional regex failure)
        if (_count_unescaped(def.args, '(') != _count_unescaped(def.args, ')'))
          return
        // extract any indentation from type (allowed for some types only)
        def.indent = def.type.match(/^ */)[0]
        def.type = def.type.trim()

        // extract any indentation from name if type is missing
        if (!def.type) {
          def.indent = def.name.match(/^ */)[0]
          def.name = def.name.trim()
        }
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

        // skip underscore-prefixed definitions unless modified
        if (def._name.match(/^_/) && !def.modified) return

        // skip indented definitions unless modified by comments
        // NOTE: this means class methods/properties must be modified, w/ attention paid to arguments (used to distinguish method from properties) for proper rendering/linking
        if (def.indent && !def.modified) return

        if (!def.comment && def.body && !def.body.startsWith('{')) {
          // take body as comment, escaping `
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
      }
    )
  )
  let lines = []
  defs.forEach(def => {
    // filter by regex (applied to original _name) if specified
    if (regex && !regex.test(def._name)) return
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
      comment_lines.push(table(comment_table_cells) + '\n')

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
    _div('core_js_table', lines.join('\n')), // style wrapper, see core.css
    // install click handlers at every render (via uncached script)
    '<script _uncached> _js_table_install_click_handlers() </script>',
  ].join('\n')
}

function _install_core_css() {
  // require local invocation with _this being lexical this
  assert(_this.name == '#util/core', '_install_core_css from non-core')
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

// install core.css on init
function _init() {
  _install_core_css()
  delete window.print // prevent any ambiguity w/ print() in #/item
}

// re-install core.css on any changes to core (or dependencies)
function _on_item_change() {
  if (_this.name != '#util/core') return // invoked from dependent
  _install_core_css()
}

// TODO: refactor these into util/html?
function _div(class_, content = '') {
  return `<div class="${class_}">${content}</div>`
}

function _span(class_, content = '') {
  return `<span class="${class_}">${content}</span>`
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
    keep_empty_lines: true,
    keep_comment_lines: true,
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
  const run_link = evallink(
    _this,
    `_js_table_run_test('${name}',event)`,
    'run',
    'run test' + (test.ok ? ' ok' : '')
  )
  const def_link = evallink(
    _this,
    `_js_table_show_function('${name}', event)`,
    '<-',
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
            exclude_tests_and_benchmarks: false,
            type: 'js|js_tests?',
            keep_empty_lines: true,
            keep_comment_lines: true,
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
  await _item('#benchmarker', false)?.eval('benchmark_item')(_this, name)
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
  await _item('#tester', false)?.eval('test_item')(_this, name)
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
  const run_link = evallink(
    _this,
    `_js_table_run_benchmark('${name}',event)`,
    'run',
    'run benchmark' + (benchmark.ok ? ' ok' : '')
  )
  const def_link = evallink(
    _this,
    `_js_table_show_function('${name}', event)`,
    '<-',
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
            exclude_tests_and_benchmarks: false,
            type: 'js|js_benchmarks?',
            keep_empty_lines: true,
            keep_comment_lines: true,
          })
        ),
        '\n',
      ].join('\n')
    )
  )
}

const command_table = () => js_table(/^_on_command_/)
