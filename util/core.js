// converts `x` to a string
// goals: short, readable, unique
// | string   | `x` (as is)
// | boolean  | `x.toString()`
// | integer  | `x.toString()`, [commas inserted](https://stackoverflow.com/a/2901298)
// | number   | `x.toString()`
// | function | `x.toString()`, `()=>` prefix dropped
// | array    | `[...]`, elements stringified recursively
// | object   | `{...}`, values stringified recursively
// |          | `x.toString()` if overloaded (e.g. Date)
function stringify(x) {
  if (!defined(x)) return 'undefined'
  if (x === null) return 'null'
  // string as is
  if (is_string(x)) return x
  // boolean toString
  if (is_boolean(x)) return x.toString()
  // integer toString w/ commas, from https://stackoverflow.com/a/2901298
  if (is_integer(x)) return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  // number toString
  if (is_number(x)) return x.toString()
  // function toString w/ ()=> prefix dropped
  if (is_function(x)) return x.toString().replace(/^\(\)\s+=>\s+/, '')
  // array elements stringified recursively
  if (is_array(x)) return '[' + x.map(stringify) + ']'
  // at this point
  if (!is_object(x)) throw new Error('stringify: cannot stringify ' + x)
  // object values stringified recursively
  // toString used if overloaded (e.g. Date)
  if (x.toString !== Object.prototype.toString) return x.toString()
  return '{' + Object.entries(x).map(([k, v]) => `${k}:${stringify(v)}`) + '}'
}

// throws error if any argument return falsy
// if array is returned, all elements must be `equal`
function check(...funcs) {
  _.flattenDeep([...funcs]).forEach(f => {
    if (!is_function(f)) throw new Error('check: argument must be function')
    const ret = f()
    if (is_array(ret)) {
      if (ret.length < 2)
        fatal(`FAILED CHECK: ${stringify(f)} → ${stringify(ret)}`)
      if (!ret.every(x => equal(x, ret[0])))
        fatal(`FAILED CHECK: ${stringify(f)} → ${stringify(ret)}`)
    } else if (!ret) {
      fatal(`FAILED CHECK: ${stringify(f)}`)
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
    check(isNumber(ret), 'must return number for unit ' + unit)
  } else if (units) {
    check(
      isObject(units) && !isArray(units),
      'benchmark units must be object of unit:function pairs'
    )
    check(isObject(ret), 'must return object for units ' + stringify(units))
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

// `[output, elapsed_ms]`
function timing(f) {
  const start = Date.now()
  const output = f()
  const elapsed = Date.now() - start
  return [output, elapsed]
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
  if (substr.length == 0) throw 'substr can not be empty'
  let count = 0
  let pos = 0
  while ((pos = str.indexOf(substr, pos)) >= 0) {
    if (str[pos - 1] != '\\') count++
    pos += substr.length
  }
  return count
}

// js_table([regex])
// table of `js` definitions
// can filter names using optional `regex`
function js_table(regex) {
  const defs = Array.from(
    _this
      .read('js', { keep_empty_lines: true })
      .matchAll(
        /(?:^|\n)(?<comment>(\/\/.*?\n)*)(?:async function|function|const|let) +(?<name>\w+) *(?:(?<args>\(.*?\))|= *(?<arrow_args>.+? *=>)? *\n?(?<body>[^\n]+))?/g
      ),
    m => {
      const def = _.merge({ args: '', comment: '' }, m.groups)
      if (def.arrow_args) {
        def.args = def.arrow_args.replace(/\s*=>$/, '')
        if (!def.args.startsWith('(')) def.args = '(' + def.args + ')'
      }
      def.args = def.args.replace(/\s+/g, '') // remove whitespace in args
      // escape special characters in args: `, \, and | (breaks table)
      def.args = def.args.replace(/([`\\|])/g, '\\$1')

      def._name = def.name // save original name (before possible modification)
      if (def.comment) {
        // clean up: drop // and insert <br> before \n
        def.comment = def.comment
          .replace(/ *\n(?:\/\/)? */g, '<br>\n')
          .replace(/^\/\/ */, '')
        // disallow cross-line backticks (causes ugly rendering issues)
        def.comment = def.comment
          .split('<br>')
          .map(s => (_count_unescaped(s, '`') % 2 == 0 ? s : s + '`'))
          .join('<br>')

        // displayed name/args can be modified via first line of comment:
        // <name>(...) modifies args, <name> removes args
        // => <display_name> or => <display_name>(...) modifies name/args
        if (
          def.comment.match(/^=> *\S+/) ||
          def.comment.match(new RegExp(`^${def.name} *(?:\\(.*?)?(?:$|<br>)`))
        ) {
          def.name = def.comment.match(/^[^(<]+/)[0].replace(/^=> */, '')
          def.args = def.comment.match(/^.+?(\(.*?)(?:$|<br>)/)?.pop() ?? ''
          def.comment = def.comment.replace(/^.+?(?:\(.*?)?(?:$|<br>)/, '')
          def.modified = true
        }
        def.comment = def.comment.replace(/\n/g, '')
      } else if (def.body && !def.body.startsWith('{')) {
        // take body as comment, escaping `, \, and | (breaks table)
        def.comment = '`' + def.body.replace(/([`\\|])/g, '\\$1') + '`'
      }
      return def
    }
  )
  let lines = ['|||', '|-|-|']
  defs.forEach(def => {
    // filter by regex (applied to original _name) if specified
    if (regex && !regex.test(def._name)) return
    // hide underscore-prefixed names as internal unless modified via comments
    if (def.name.startsWith('_') && !def.modified) return
    // process comment lines, converting pipe-prefixed/separated lines to tables
    // typically used to document function arguments or options
    let comment_lines = [] // processed comment
    let table = ''
    def.comment
      .replace(/^(?:<br>)+/g, '') // drop leading empty lines
      .replace(/(?:<br>)+$/g, '') // drop trailing empty lines
      .split('<br>')
      .forEach(line => {
        if (line.startsWith('|')) {
          let cells = line.split(/\s*\|\s*/).slice(1) // ignore leading |
          if (!table) table += '<table class="comment">'
          cells = cells.map(s => (s.startsWith('<td') ? s : `<td>${s}</td>`))
          table += '<tr>' + cells.join('') + '</tr>'
        } else {
          if (table) {
            comment_lines.push(table + '</table>')
            table = ''
          }
          comment_lines.push(line)
        }
      })
    if (table) comment_lines.push(table + '</table>')

    // trim empty lines
    while (comment_lines[0]?.length == 0) comment_lines.shift()
    while (_.last(comment_lines)?.length == 0) comment_lines.pop()

    // append test/benchmark results as the last comment line
    // also display a status indicator (hidden on expanded state)
    let status = ''
    const gs = _this.global_store
    let test, benchmark
    if (gs._tests && gs._tests[def._name]) {
      test = gs._tests[def._name]
      status += evallink(
        _this,
        `_js_table_show_test('${def._name}', event)`,
        test.ok ? 'test' : 'FAILED test',
        'test' + (test.ok ? ' ok' : '')
      )
    }
    if (gs._benchmarks && gs._benchmarks[def._name]) {
      benchmark = gs._benchmarks[def._name]
      status += evallink(
        _this,
        `_js_table_show_benchmark('${def._name}', event)`,
        benchmark.ok ? 'benchmark' : 'FAILED benchmark',
        'benchmark' + (benchmark.ok ? ' ok' : '')
      )
    }
    if (status) comment_lines.push(`<div class="status">${status}</div>`)

    // hide all non-first comment lines
    const expandable = comment_lines.length > 1 ? 'expandable' : ''
    if (comment_lines.length > 1) {
      def.comment =
        comment_lines[0] +
        '<span class="less"> …</span>' +
        '<div class="more">' +
        comment_lines.slice(1).join('<br>') +
        `</div>`
    } else {
      def.comment = comment_lines[0] || ''
    }

    // put together name and args as "usage"
    // trim name (can contain spaces for commands, e.g. "/push [items]")
    // remove all whitespace from args
    let usage =
      `<span class="name">${def.name.trim()}</span>` +
      `<span class="args">${def.args.replace(/\s+/, '')}</span>`

    // restore expanded state from local store (triggers render on change)
    let expand = ''
    if (expandable) {
      const ls = _this.local_store
      const stored_toggle = ls._js_table?.[def._name]
      if (stored_toggle === true) expand = 'expand'
      else if (stored_toggle === false) expand = 'collapse'
    }

    // if tested indicate result as styling on usage
    // also consider benchmark errors
    let ok = ''
    if (test) ok = test.ok ? 'ok' : 'error'
    if (benchmark && !benchmark.ok) ok = 'error'

    // if benchmarked also indicate as .benchmarked class
    let benchmarked = benchmark?.ok ? 'benchmarked' : ''

    lines.push(
      `|<div class="usage-wrapper ${benchmarked}">` +
        `<div class="usage ${ok}">${usage}</div></div>|` +
        `<div class="cell name_${def._name} ${expandable} ${expand}">` +
        `${def.comment}</div>`
    )
  })

  return [
    // wrap markdown table inside .core_js_table for styling (see core.css)
    '<div class="core_js_table">',
    ...lines,
    '</div>',
    // install click handlers at every render (via uncached script)
    '<script _uncached> _js_table_install_click_handlers() </script>',
  ].join('\n')
}

function _install_core_css() {
  // require local invocation with _this being lexical this
  if (_this.name != '#util/core') fatal('_install_core_css from non-core')
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
function _div(class_, content) {
  // new-lines allow interleaving w/ markdown
  return `<div class="${class_}">\n\n${content}\n</div>\n\n`
}

function _span(class_, content) {
  return `<span class="${class_}">${content}</span>`
}

function _js_table_install_click_handlers() {
  log('installing js_table click handlers', _this.deephash)
  // install click handlers!
  _this.elem.querySelectorAll('.core_js_table .cell').forEach(cell => {
    const name = Array.from(cell.classList)
      .find(c => c.startsWith('name_'))
      .slice(5)
    const expandable = cell.classList.contains('expandable')
    // onmousedown w/ cancelled click tends to be more robust
    // however onclick allows text selection so we use that for now
    //cell.onclick = e => (e.stopPropagation(), e.stopPropagation())
    //cell.onmousedown = e => {
    cell.onclick = e => {
      if (getSelection().type == 'Range') return // ignore click w/ text selected
      e.stopPropagation()
      e.preventDefault()
      if (expandable) _js_table_toggle(name, e)
    }
    const usage = cell.closest('tr').querySelector('.usage-wrapper')
    const args = usage.querySelector('.args').innerText
    // usage.onclick = e => (e.stopPropagation(), e.stopPropagation())
    // usage.onmousedown = e => {
    usage.onclick = e => {
      if (getSelection().type == 'Range') return // ignore click w/ text selected
      e.stopPropagation()
      e.preventDefault()
      _modal(
        _div(
          'core_js_table_modal', // style wrapper, see core.css
          _div('title', _span('name', name) + _span('args', args)) +
            block('js', _this.eval(name))
        )
      )
    }
  })
}

function _js_table_toggle(name, e) {
  e.preventDefault()
  e.stopPropagation()
  const cell = e.target.closest('.cell')
  const expand =
    (cell.classList.contains('expand') || !!cell.closest('.pushable')) &&
    !cell.classList.contains('collapse')
  // update dom immediately before re-render due to local store change
  cell.classList.toggle('expand', !expand)
  cell.classList.toggle('collapse', expand)
  // store expanded state in local store (triggers render on change)
  const ls = _this.local_store
  ls._js_table = _.set(ls._js_table || {}, name, !expand)
}

function _js_table_show_test(name) {
  const test = _this.global_store._tests[name]
  _modal(
    _div(
      'core_js_table_modal',
      [
        _div('title', `Test \`${name}\``),
        !test.ok ? block('_log', test.log.join('\n')) : '',
        block('js', _this.eval(test.test || `_test_${name}`)),
      ].join('\n')
    )
  )
}

async function _js_table_run_benchmark(name, e) {
  const link = e.target
  const modal = link.closest('.core_js_table_modal')
  modal.classList.add('running')
  // dynamically eval/invoke benchmark_item function from #benchmarker
  await _item('#benchmarker', false)?.eval('benchmark_item')(_this)
  modal.classList.remove('running')
  await _modal_close()
  _js_table_show_benchmark(name)
}

function _js_table_show_benchmark(name) {
  const benchmark = _this.global_store._benchmarks[name]
  let log = [] // unparsed log lines
  let rows = [] // parsed benchmark log lines
  let elapsed
  for (const line of benchmark.log) {
    let [name, result] =
      line.match(/^(.+)\s*: ([\d,]+ calls\/sec.*)$/)?.slice(1) ?? []
    let [ms] = line.match(/in (\d+)ms$/)?.slice(1) ?? []
    if (result) {
      result = result.replace(' calls/sec', '/s') // abbreviate calls/sec
      rows.push([result, name])
    } else if (ms) {
      elapsed = ms
    } else {
      log.push(line)
    }
  }
  rows = _.sortBy(rows, r => -parseInt(r[0].replace(/,/g, '')))
  const run_link = !_exists('#benchmarker', false)
    ? ''
    : evallink(_this, `_js_table_run_benchmark('${name}',event)`, 'run')

  _modal(
    _div(
      'core_js_table_modal',
      [
        _div(
          'title',
          `Benchmark \`${name}\`` +
            _span('run', run_link) +
            _span('elapsed', `${elapsed}ms`)
        ),
        rows.length ? _div('results', table(rows)) : '',
        log.length ? block('_log', log.join('\n')) : '',
        block('js', _this.eval(benchmark.benchmark || `_benchmark_${name}`)),
      ].join('\n')
    )
  )
}

// array(length,[value])
// array of `length` copies of `value`
// `value` can be function of index
const array = (J = 0, xj) => {
  const xJ = new Array(J)
  // NOTE: Array.from({length:J}, ...) was much slower
  if (typeof xj == 'function') for (let j = 0; j < J; ++j) xJ[j] = xj(j)
  else if (typeof xj != 'undefined') xJ.fill(xj)
  return xJ
}

function _test_array() {
  check(
    () => [array(), []],
    () => [array(1), [undefined]],
    () => [array(3), [undefined, undefined, undefined]],
    () => [array(3, 0), [0, 0, 0]],
    () => [array(3, j => j), [0, 1, 2]]
  )
}

function _benchmark_array() {
  benchmark(
    () => new Array(100),
    () => new Array(100).fill(0),
    () => array(100, j => j),
    () => Array.from({ length: 100 }, j => j)
  )
}

const command_table = () => js_table(/^_on_command_/)
