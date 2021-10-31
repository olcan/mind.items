const eval = (...args) => _this.eval(...args)
const read = (...args) => _this.read(...args)
const read_deep = (...args) => _this.read_deep(...args)
const write = (...args) => _this.write(...args)
const clear = (...args) => _this.clear(...args)
const remove = (...args) => _this.remove(...args)
// const delete = (...args) => _this.delete(...args)

const get_log = (...args) => _this.get_log(...args)
const write_log = (...args) => _this.write_log(...args)
const write_log_any = (...args) => _this.write_log_any(...args)
const show_logs = (...args) => _this.show_logs(...args)
const touch = (...args) => _this.touch(...args)
const save = (...args) => _this.save(...args)

const start = (...args) => _this.start(...args)
const invoke = (...args) => _this.invoke(...args)
const attach = (...args) => _this.attach(...args)
const dispatch = (...args) => _this.dispatch(...args)
const dispatch_task = (...args) => _this.dispatch_task(...args)
const cancel_task = (...args) => _this.cancel_task(...args)
const promise = (...args) => _this.promise(...args)
const resolve = (...args) => _this.resolve(...args)

const debug = (...args) => _this.debug(...args)
const log = (...args) => _this.log(...args)
const info = (...args) => _this.info(...args)
const warn = (...args) => _this.warn(...args)
const error = (...args) => _this.error(...args)
const fatal = (...args) => _this.fatal(...args)

const delay = (...args) => _this.delay(...args)
const images = (...args) => _this.images(...args)
const cached = (...args) => _this.cached(...args)
const validate_cache = (...args) => _this.validate_cache(...args)
const invalidate_cache = (...args) => _this.invalidate_cache(...args)
const invalidate_elem_cache = (...args) => _this.invalidate_elem_cache(...args)
const save_local_store = (...args) => _this.save_local_store(...args)
const save_global_store = (...args) => _this.save_global_store(...args)

// returns string representation for `x`
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

// throws error if any argument return false
function check(...funcs) {
  _.flattenDeep([...funcs]).forEach(f => {
    if (!is_function(f)) throw new Error('check: argument must be function')
    if (!f()) {
      const stack = new Error().stack.split('\n').join(' <- ')
      throw new Error(`FAILED CHECK: ${str(f)} @ ${stack}`)
    }
  })
}

// measures calls/sec for each argument
function benchmark(...funcs) {
  _.flattenDeep([...funcs]).forEach(f => {
    if (!is_function(f)) throw new Error('benchmark: argument must be function')
    _run_benchmark(f)
  })
}

let _benchmark_options = {}
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

// returns `[output, elapsed_ms]`
function timing(f) {
  const start = Date.now()
  const output = f()
  const elapsed = Date.now() - start
  return [output, elapsed]
}

// returns markdown table documenting utility constants & functions
function jsdoc() {
  const defs = Array.from(
    _this
      .read('js', { keep_empty_lines: true })
      .matchAll(
        /(?:^|\n)(?<comment>(\/\/.*?\n)*)(?:function|const|let) +(?<name>[a-zA-Z]\w+) *(?:(?<args>\(.*?\))|= *(?<arrow_args>.+? *=>)? *\n?(?<body>[^\n]+))?/g
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
          .replace(/^\/\/\s*/, '')
        // replace name from comments if first line matches <name>(...)
        if (
          def.comment.startsWith(def.name) &&
          def.comment.match(/\(.*?\)(?:$|<br>)/)
        ) {
          def.name = def.comment.match(/^[^(]+/).pop()
          def.args = def.comment.match(/^.+?(\(.*?\))(?:$|<br>)/).pop()
          def.comment = def.comment.replace(/^.+?\(.*?\)(?:$|<br>)/, '')
        }
      } else if (def.body && !def.body.startsWith('{')) {
        def.comment = '`' + def.body + '`'
      }
      return def
    }
  )
  let lines = ['|||', '|-:|:-|']
  defs.forEach(def => {
    lines.push(`|\`${def.name + def.args}\`|${def.comment}`)
  })
  return [
    '<span class="jsdoc">',
    lines.join('\n'),
    '</span>',
    '```_html',
    '<style>',
    '#item .jsdoc table code { white-space: nowrap }',
    '#item .jsdoc table { line-height: 150%; border-spacing: 10px }',
    '</style>',
    '```',
  ].join('\n')
}

const _array = (J, f) => {
  const xJ = new Array(J)
  // NOTE: Array.from({length:J}, ...) was much slower
  if (typeof f == 'function') for (let j = 0; j < J; ++j) xJ[j] = f(j)
  else if (typeof f != 'undefined') xJ.fill(f)
  return xJ
}

// table(cells, [headers])
// returns markdown table
// `cells` is 2D array, e.g. `[['a',1],['b',2]]`
// `headers` is array, e.g. `['a','b']`
function table(cells, headers) {
  let lines = []
  if (headers) lines.push('|' + headers.join('|') + '|')
  else lines.push(_array(cells[0].length + 1, k => '|').join(''))
  lines.push(
    '|' +
      _array(cells[0].length, k =>
        is_numeric(cells[0][k].replaceAll(',', '')) ? '-:' : '-'
      ).join('|') +
      '|'
  )
  lines = lines.concat(cells.map(row => '|' + row.join('|')))
  return lines.join('\n')
}
