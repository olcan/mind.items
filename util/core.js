// TODO: split core into even smaller items, starting w/ types.
//       this allows container items that can document w/ examples.

// TODO: actually test/benchmark stuff below ...
function _test() {}
function _test_something() {}
function _benchmark() {}
function _benchmark_something() {}

const stack = (offset = 1) =>
  new Error().stack.split('\n').slice(offset).join(' <- ')

function check(...fJ) {
  _.flattenDeep([...fJ]).forEach(f => {
    if (!is_function(f)) throw new Error('check: argument must be function')
    if (!f()) throw new Error(`FAILED check(${f}) <- ${stack(2)}`)
  })
}

const log = (...args) => _this.log(...args)
const info = (...args) => _this.info(...args)
const debug = (...args) => _this.debug(...args)
const error = (...args) => _this.error(...args)
const fatal = (...args) => _this.fatal(...args)
// TODO: bring more _Item functions to global scope using standard mechanism?

function str(x) {
  if (!defined(x)) return 'undefined'
  if (defined(x._name)) return x._name
  // insert commas to integers, from https://stackoverflow.com/a/2901298
  if (is_integer(x)) return ('' + x).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (is_number(x)) return '' + x
  if (is_function(x)) return ('' + x).replace('()=>', '')
  if (is_string(x)) return `'${x}'`
  if (is_array(x)) return '[' + x.map(str) + ']'
  // use x.toString if it is overloaded, e.g. for Date
  if (is_object(x)) {
    if (x.toString !== Object.prototype.toString) return x.toString()
    return '{' + Object.entries(x).map(([k, v]) => `${k}:${str(v)}`) + '}'
  }
  return JSON.stringify(x)
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
