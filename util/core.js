const debug = (...args) => _this.debug(...args)
const log = (...args) => _this.log(...args)
const info = (...args) => _this.info(...args)
const warn = (...args) => _this.warn(...args)
const error = (...args) => _this.error(...args)
const fatal = (...args) => _this.fatal(...args)
// TODO: bring more _Item functions to global scope using standard mechanism?

function str(x) {
  if (!defined(x)) return 'undefined'
  if (defined(x._name)) return x._name
  // insert commas to integers, from https://stackoverflow.com/a/2901298
  if (is_integer(x)) return ('' + x).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (is_number(x)) return '' + x
  if (is_function(x)) return ('' + x).replace(/^\(\)\s+=>\s+/, '')
  if (is_string(x)) return `'${x}'`
  if (is_array(x)) return '[' + x.map(str) + ']'
  // use x.toString if it is overloaded, e.g. for Date
  if (is_object(x)) {
    if (x.toString !== Object.prototype.toString) return x.toString()
    return '{' + Object.entries(x).map(([k, v]) => `${k}:${str(v)}`) + '}'
  }
  return JSON.stringify(x)
}

// TODO: find a better place for these ...
const array = (J, f) => {
  const xJ = new Array(J)
  // NOTE: Array.from({length:J}, ...) was much slower
  if (typeof f == 'function') for (let j = 0; j < J; ++j) xJ[j] = f(j)
  else if (typeof f != 'undefined') xJ.fill(f)
  return xJ
}
// generates markdown for table, for writing into _markdown|_md blocks
function table(xJK, headers = null) {
  let lines = []
  if (headers) lines.push('|' + headers.join('|') + '|')
  else lines.push(array(xJK[0].length + 1, k => '|').join(''))
  lines.push(
    '|' +
      array(xJK[0].length, k =>
        is_numeric(xJK[0][k].replaceAll(',', '')) ? '-:' : '-'
      ).join('|') +
      '|'
  )
  lines = lines.concat(xJK.map(xK => '|' + xK.join('|')))
  return lines.join('\n')
}

// timing
function timing(f, name = str(f)) {
  const start = Date.now()
  const output = f()
  const elapsed = Date.now() - start
  if (name) log(`${name}: ${elapsed}ms`)
  return [output, elapsed]
}

// returns stack trace
// use `offset` to exclude frames
const stack = (offset = 1) =>
  new Error().stack.split('\n').slice(offset).join(' <- ')

function check(...funcs) {
  _.flattenDeep([...funcs]).forEach(f => {
    if (!is_function(f)) throw new Error('check: argument must be function')
    if (!f()) throw new Error(`FAILED CHECK: ${str(f)} @ ${stack(2)}`)
  })
}

let _benchmark_options = {}

const set_benchmark_options = options => (_benchmark_options = options)

function benchmark(...funcs) {
  _.flattenDeep([...funcs]).forEach(f => {
    if (!is_function(f)) throw new Error('benchmark: argument must be function')
    _run_benchmark(f)
  })
}

function _run_benchmark(
  f,
  {
    name = str(f),
    T = 10, // fast > accurate
    T_max = 50,
    N = 1000,
    unit,
    units,
  } = _benchmark_options
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
    log(base + ` (${ups} ${unit})`)
  } else if (units) {
    log(
      base +
        ' (' +
        units.map((u, k) => str(counts[k]) + ' ' + u).join(', ') +
        ')'
    )
  } else log(base)
}

// documents utility constants & functions
// reads js from current item as `_this.read('js')`
// this table is an example output
function jsdoc() {
  const defs = Array.from(
    _this
      .read('js')
      .matchAll(
        /(?:^|\n)(?<comment>(\/\/.*?\n)*)(?:function|const|let) +(?<name>\w+) *(?:(?<args>\(.*?\))|= *(?<arrow_args>.+? *=>)? *\n?(?<body>[^\n]+))?/gs
      ),
    m => {
      const def = _.merge({ args: '', comment: '' }, m.groups)
      if (def.arrow_args) {
        def.args = def.arrow_args.replace(/\s*=>$/, '')
        if (!def.args.startsWith('(')) def.args = '(' + def.args + ')'
      }
      def.args = def.args.replace(/\s*\n\s*/g, ' ') // remove newlines in args
      if (def.comment) {
        def.comment = def.comment
          .replace(/\s*(?:\n(?:\/\/)?)\s*/g, '<br>')
          .replace(/^\/\//, '')
      } else if (def.body && !def.body.startsWith('{')) {
        def.comment = '`' + def.body + '`'
      }
      return def
    }
  )
  let lines = ['|||', '|-:|:-|']
  defs.forEach(def => {
    if (def.name.match(/^_/)) return // exclude internal defs
    lines.push(`|\`${def.name + def.args}\`|${def.comment}`)
  })
  return lines.join('\n')
}
