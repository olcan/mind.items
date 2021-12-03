// converts `x` to a string
// goals: short, readable, unique
// | string   | `x` wrapped in single quotes
// | boolean  | `x.toString()`
// | integer  | `x.toString()`, [commas inserted](https://stackoverflow.com/a/2901298)
// | number   | `x.toString()`
// | function | `x.toString()`, `()=>` prefix dropped
// |          | any enumerable properties appended as `{...}`
// | array    | `[...]`, elements stringified recursively
// | object   | `{...}`, values stringified recursively
// |          | `x.toString()` if overloaded (e.g. Date)
function stringify(x) {
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
      (Object.keys(x).length ? _stringify_object(x) : '')
    )
  // array elements stringified recursively
  if (is_array(x)) return '[' + x.map(stringify) + ']'
  // at this point
  assert(is_object(x), 'cannot stringify ' + x)
  // object values stringified recursively
  // toString used if overloaded (e.g. Date)
  if (x.toString !== Object.prototype.toString) return x.toString()
  return _stringify_object(x)
}

function _stringify_object(x) {
  return '{' + Object.entries(x).map(([k, v]) => `${k}:${stringify(v)}`) + '}'
}

function _test_stringify() {
  check(
    () => [stringify(), 'undefined'],
    () => [stringify(undefined), 'undefined'],
    () => [stringify('test'), `'test'`],
    () => [stringify(true), 'true'],
    () => [stringify(10000), '10,000'],
    () => [stringify(1.01), '1.01'],
    () => [stringify(() => 1), '1'],
    () => [stringify(() => (1, 2)), '(1, 2)'],
    () => [stringify(() => {}), '{}'],
    () => [stringify(_.set(() => {}, 'test', 1)), '{}{test:1}'],
    () => [
      stringify(_.assign(() => {}, { a: 10000, b: '1', c: 1, d: 1.1 })),
      `{}{a:10,000,b:'1',c:1,d:1.1}`,
    ],
    () => [
      stringify(() => {
        return 1
      }),
      `{
        return 1
      }`,
    ], // whitespace is maintained in function body
    () => [stringify([10000, '1', 1, 1.1]), `[10,000,'1',1,1.1]`],
    () => [
      stringify({ a: 10000, b: '1', c: 1, d: 1.1 }),
      `{a:10,000,b:'1',c:1,d:1.1}`,
    ]
  )
}

// rounds `x` to `d` decimal places
// `d` can be negative for digits _before_ decimal point
// `d` can be restricted to at most `s` significant (non-zero) digits
// `mode` string can be `round`, `floor`, or `ceil`
const round = (x, d = 0, s = inf, mode = 'round') => {
  // determine d automatically if s<inf
  if (s < inf) {
    const sd = _significant_digits(x)
    if (s < sd) d = Math.min(d, _decimals(x) - (sd - s))
  }
  // from https://stackoverflow.com/a/19794305
  if (d === undefined || +d === 0) return Math[mode](x)
  x = +x
  d = -d // negation more intuitive externally
  if (!isFinite(x)) return x
  if (isNaN(x) || !Number.isInteger(d)) return NaN
  if (x < 0) return -_adjust_decimal(mode, -x, d)
  x = x.toString().split('e')
  x = Math[mode](+(x[0] + 'e' + (x[1] ? +x[1] - d : -d)))
  x = x.toString().split('e')
  return +(x[0] + 'e' + (x[1] ? +x[1] + d : d))
}

function _test_round() {
  check(
    () => [round(1.2345), 1],
    () => [round(1.2345, -1), 0],
    () => [round(1.2345, -2), 0],
    () => [round(1.2345, 1), 1.2],
    () => [round(1.2345, 2), 1.23],
    () => [round(1.2345, 3), 1.235],
    () => [round(1.2345, 4), 1.2345],
    () => [round(1.2345, 5), 1.2345],
    () => [round(1.2345, 10), 1.2345],
    () => [round(1.2345, 100), 1.2345],
    () => [round(1.2345, 308), 1.2345],
    () => [round(1.2345, 309), NaN], // > Number.MAX_VALUE

    () => [round(1.2345e4), 12345],
    () => [round(1.2345e4, -1), round(1.2345e4, 0, 4), 12350],
    () => [round(1.2345e4, -2), round(1.2345e4, 0, 3), 12300],
    () => [round(1.2345e4, -3), round(1.2345e4, 0, 2), 12000],
    () => [round(1.2345e4, -4), round(1.2345e4, 0, 1), 10000],
    () => [round(1.2345e4, -5), round(1.2345e4, 0, 0), 0],
    () => [round(1.2345e4, -6), round(1.2345e4, 0, -1), 0],
    () => [round(1.2345e4, 1), 12345],
    () => [round(1.2345e4, 304), 12345],
    () => [round(1.2345e4, 305), NaN], // > Number.MAX_VALUE

    () => [round(1.2345e-2), 0],
    () => [round(1.2345e-2, 1), 0],
    () => [round(1.2345e-2, 2), 0.01],
    () => [round(1.2345e-2, 3), 0.012],
    () => [round(1.2345e-2, 4), 0.0123],
    () => [round(1.2345e-2, 5), 0.01235],
    () => [round(1.2345e-2, 10), 0.012345],
    () => [round(1.2345e-2, 10, 5), 0.012345],
    () => [round(1.2345e-2, 10, 4), 0.01235], // fails for naive d=s-_digits(x)
    () => [round(1.2345e-2, 10, 3), 0.0123],

    () => [round(1.2345, 5, 0), 0],
    () => [round(1.2345, 5, -1), 0],
    () => [round(1.2345, 5, -2), 0],
    () => [round(1.2345, 5, 1), 1],
    () => [round(1.2345, 5, 2), 1.2],
    () => [round(1.2345, 5, 3), 1.23],
    () => [round(1.2345, 5, 4), 1.235],
    () => [round(1.2345, 5, 5), 1.2345],
    () => [round(1.2345, 5, 6), 1.2345],
    () => [round(1.2345, 5, 1000), 1.2345],
    () => [round(1.2345, 308, 1000), 1.2345],
    () => [round(1.2345, 309, 1000), NaN],
    () => [round(1.2345, 309, 5), NaN],
    () => [round(1.2345, 309, 4), 1.235] // s only kicks in if < sig. digits
  )
}

function _digits(x) {
  // from https://stackoverflow.com/a/28203456
  return Math.max(Math.floor(Math.log10(Math.abs(x))), 0) + 1
}
function _decimals(x) {
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
  _.flattenDeep([...funcs]).forEach(f => {
    assert(is_function(f), 'non-function argument')
    const ret = f()
    if (is_array(ret)) {
      const xJ = ret // interpret returned array as values to be compared
      // if last element of returned array is a function, it will be used as the comparison function fcomp(x0,x) in place of equal(x0,x)
      let fcomp = equal
      if (is_function(_.last(xJ))) fcomp = xJ.pop()
      assert(xJ.length >= 2, `FAILED CHECK: ${stringify(f)} → ${stringify(xJ)}`)
      assert(
        xJ.every((x, j) => j == 0 || fcomp(xJ[0], x)),
        `FAILED CHECK: ${stringify(f)} → ${stringify(xJ)}`
      )
    }
    assert(ret, `FAILED CHECK: ${stringify(f)}`)
  })
}

// measures calls/sec for each of `funcs`
// typically used in benchmark functions `_benchmark_*()`
function benchmark(...funcs) {
  _.flattenDeep([...funcs]).forEach(f => {
    assert(is_function(f), 'non-function argument')
    _run_benchmark(f)
  })
}

let _benchmark_options = {}
function _run_benchmark(
  f,
  {
    name = stringify(f),
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
    assert(is_number(ret), 'must return number for unit ' + unit)
  } else if (units) {
    assert(
      is_object(units) && !is_array(units),
      'benchmark units must be object of unit:function pairs'
    )
    assert(is_object(ret), 'must return object for units ' + stringify(units))
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
  const cps = stringify(Math.floor((calls / time) * 1000))
  const base = `${name}: ${cps} calls/sec`
  if (unit) {
    const ups = stringify(Math.floor((count / time) * 1000))
    log(base + ` (${ups} ${unit})`)
  } else if (units) {
    log(
      base +
        ' (' +
        units.map((u, k) => stringify(counts[k]) + ' ' + u).join(', ') +
        ')'
    )
  } else log(base)
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
  assert(f || obj['__' + prop], `missing method '__${prop}' for cached prop`)
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
      if (obj['_' + prop] === null) return // already null
      // set dependents to null using setter (to set their dependents also)
      each(obj.__deps[prop], dependent => (obj[dependent] = null))
      obj['_' + prop] = null
    },
    ...options,
  })
  obj['_' + prop] = null // init as null
}

// table(cells,[headers])
// markdown table for `cells`
// |`cells`   | 2D array | `[['a',1],['b',2]]`
// |`headers` | array    | `['a','b']`
function table(cells, headers) {
  let lines = []
  if (headers) lines.push('|' + headers.join('|') + '|')
  else lines.push(array(cells[0].length + 1, k => '|').join(''))
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
  const defs = _.compact(
    Array.from(
      _this
        .read('js', { keep_empty_lines: true })
        // NOTE: currently automated parsing of args works only if arguments are listed on the same line, since multi-line parsing is tricky w/ default values that may also contain parentheses, strings that contain parentheses, etc; if args are wrapped due to automated code formatting, a workaround is to define args in first line of comment, which are rarely wrapped by formatters or can be shortened toa void wrapping
        .matchAll(
          /(?:^|\n)(?<comment>( *\/\/.*?\n)*)(?<indent> *)(?<type>(?:(?:async|static) +)*(?:(?:function|const|let|var|class|get|set) +)?)(?<name>\w+) *(?:(?<args>\(.*\))|= *(?<arrow_args>.+? *=>)? *\n?(?<body>[^\n]+))?/g
        ),
      m => {
        const def = _.merge({ args: '', comment: '' }, m.groups)
        def.type = def.type.trim() // trim trailing space
        // skip certain types if indented
        if (def.indent && def.type?.match(/(?:const|let|var|class|function)$/))
          return
        // clear args if getter/setter
        if (def.type.match(/(?:get|set)$/)) def.args = ''
        // process arrow args
        if (def.arrow_args) {
          def.args = def.arrow_args.replace(/\s*=>$/, '')
          if (!def.args.startsWith('(')) def.args = '(' + def.args + ')'
        }
        // remove whitespace in args
        def.args = def.args.replace(/\s+/g, '')
        // escape special characters in args: `, \, and | (breaks table)
        def.args = def.args.replace(/([`\\|])/g, '\\$1')

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
        if (!def.comment && def.body && !def.body.startsWith('{')) {
          // take body as comment, escaping `, \
          def.comment = '`' + def.body.replace(/([`\\])/g, '\\$1') + '`'
        }
        return def
      }
    )
  )
  let lines = []
  defs.forEach(def => {
    // filter by regex (applied to original _name) if specified
    if (regex && !regex.test(def._name)) return
    // hide underscore-prefixed or indented definitions unless modified
    if ((def._name.match(/^_/) || def.indent) && !def.modified) return
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
    while (_.last(comment_lines)?.length == 0) comment_lines.pop()

    // hide all non-first comment lines
    const has_more = comment_lines.length > 1 ? 'has_more' : ''
    if (comment_lines.length > 1) {
      def.comment =
        comment_lines[0] +
        _span('less', _span('more-indicator', '')) +
        _div('more', '\n' + comment_lines.slice(1).join('\n'))
    } else {
      def.comment = comment_lines[0] || ''
    }

    // put together name and args as "usage"
    // trim name (can contain spaces for commands, e.g. "/push [items]")
    // remove all whitespace from args except after commas & around equals
    // auto-wrap default-valued optionals in brackets
    const name = def.name.trim()
    let args = def.args
      .replace(/\s+/g, '')
      .replace(/^\(|\)$/g, '')
      .split(',')
      .map(s => (s[0] != '[' && s.includes('=') ? '[' + s + ']' : s))
      .join(',')
    if (def.args) args = '(' + args + ')'
    let args_expanded = args.replace(/,/g, ', ').replace(/=/g, ' = ')
    const has_defaults = args.match(/\[(.+?)=.+?\]/) ? 'has_defaults' : ''
    // NOTE: this simple regex does not work for {arg=default} but does for arg={}
    args = args.replace(/\[(.+?)=.+?\]/g, '[$1]') // hide defaults unless expanded
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
}

// re-install core.css on any changes to core (or dependencies)
function _on_item_change() {
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
  ls._js_table = _.set(ls._js_table || {}, name, !expand)
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
    .innerText.replace(/,/g, ', ')
    .replace(/=/g, ' = ')
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
  try {
    // try custom _function_<name>() first
    // should return either a function or a property descriptor object (w/ .get or .set or both)
    def = _this.eval(
      `typeof _function_${name} == 'function' ? _function_${name}() : null`
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
          def = unindent(_this.eval(ref))
        } else {
          const [class_name, prop] = name.split('__')
          ref = `Object.getOwnPropertyDescriptor(${class_name}.prototype, '${prop}') ?? Object.getOwnPropertyDescriptor(${class_name}, '${prop}')`
          def = _this.eval(ref)
          if (def) def = `get: ${unindent(def.get)}\nset: ${unindent(def.set)}`
        }
      } else {
        ref = name
        def = _this.eval(ref)
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
            exclude_tests_and_benchmarks: false,
            type: 'js|js_tests?',
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
  await _item('#benchmarker', false)?.eval('benchmark_item')(_this)
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
  await _item('#tester', false)?.eval('test_item')(_this)
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
  rows = _.sortBy(rows, r => -parseInt(r[0].replace(/,/g, '')))
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
            exclude_tests_and_benchmarks: false,
            type: 'js|js_benchmarks?',
          })
        ),
        '\n',
      ].join('\n')
    )
  )
}

const command_table = () => js_table(/^_on_command_/)
