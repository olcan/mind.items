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

// throws error if any argument return false
function check(...funcs) {
  _.flattenDeep([...funcs]).forEach(f => {
    if (!is_function(f)) throw new Error('check: argument must be function')
    if (!f()) {
      const stack = new Error().stack
        .split('\n')
        .map(s => s.replace(/@$/, ''))
        .filter(s => s)
        .join(' <- ')
      throw new Error(`FAILED CHECK: ${stringify(f)}; STACK: ${stack}`)
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
        def.comment = '`' + def.body + '`'
      }
      return def
    }
  )
  let lines = ['|||', '|-:|:-|']
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

    // put together name and args as label, removing all whitespace
    let label =
      `<span class="name">${def.name.replace(/\s+/, '')}</span>` +
      `<span class="args">${def.args.replace(/\s+/, '')}</span>`

    // restore expanded state from local store (triggers render on change)
    let expand = ''
    if (expandable) {
      const ls = _this.local_store
      const stored_toggle = ls._js_table?.[def._name]
      if (stored_toggle === true) expand = 'expand'
      else if (stored_toggle === false) expand = 'collapse'
    }

    // if tested indicate result as styling on label
    // also consider benchmark errors
    let ok = ''
    if (test) ok = test.ok ? 'ok' : 'error'
    if (benchmark && !benchmark.ok) ok = 'error'

    // if benchmarked also indicate as .benchmarked class
    let benchmarked = benchmark?.ok ? 'benchmarked' : ''

    lines.push(
      `|<div class="label-wrapper ${benchmarked}"><div class="label ${ok}">${label}</div></div>|` +
        `<div class="cell name_${def._name} ${expandable} ${expand}">${def.comment}</div>`
    )
  })
  return [
    '<span class="js_table">',
    lines.join('\n'),
    '</span>',
    '```_html',
    '<style>',
    '#item .js_table table thead { display: none }',
    '#item .js_table table { width:100%; margin:auto; font-size:90% }',
    '#item .js_table table + br { display: none }',
    '#item .js_table > table { margin-top: 5px }',
    '#item .js_table table.comment { margin-top: 3px }',
    '#item .js_table > table > tbody > tr > td { padding: 0.5px 0 }',
    '#item .js_table > table > tbody > tr > td:first-child { white-space:nowrap; text-align:left; width:1%; padding-right: 10px; }',
    '#item .js_table table.comment { font-size: 90% }',
    '#item .js_table table.comment td:first-child { white-space:nowrap; width:1%; text-align:right }',
    '#item .js_table > table { border-spacing: 0; border-collapse: collapsed }',
    '#item .js_table table.comment { border-spacing: 5px 1px; border-collapse: collapsed }',
    '#item .js_table :is(.label,.cell) { padding: 2px 0 }',
    '#item .js_table .label { padding-top: 3px }',
    '#item .js_table .label { display:block; height:100%; width:100%; max-width:200px; border-left: 4px solid #444; overflow:hidden; text-overflow: ellipsis; vertical-align: baseline; padding-left:10px; font-family:"jetbrains mono", monospace; font-size:90% }',
    '#item .js_table .label .args { color: #999; margin-left:2px }',
    '#item .js_table .label code { background: none }',
    '#item .js_table .label.ok { border-color: #8d8 }',
    '#item .js_table .label.error { border-color: #f55; background: #500; border-radius: 0 4px 4px 0 }',
    '#item .js_table .label-wrapper { border-left: 4px solid transparent; padding-left:1px; cursor: pointer }',
    '#item .js_table .label-wrapper.benchmarked { border-color: #4ae }',
    '#item .js_table .cell .more { display: none }',
    '#item .js_table .cell { padding-left:7px; border-radius:4px }',
    '#item .js_table .cell.expandable { cursor: pointer }',
    '#item .js_table .cell.expand { background: #171717; margin-bottom: 5px }',
    '#item .js_table .cell.expand .more { display: block }',
    '#item .js_table .cell.expand .less { display: none }',
    '.container.pushable #item .js_table .cell.expandable:not(.collapse) { background: #171717; margin-bottom: 5px }',
    '.container.pushable #item .js_table .cell.expandable:not(.collapse) .more { display: block }',
    '.container.pushable #item .js_table .cell.expandable:not(.collapse) .less { display: none }',
    '#item .js_table .cell.expand { background: #171717; margin-bottom: 5px }',
    '#item .js_table .cell.expand .more { display: block }',
    '#item .js_table .cell.expand .less { display: none }',

    '#item .js_table :is(.test,.benchmark) {',
    '  color:black; background: #f55; margin-right:5px;',
    '  font-weight:600; font-size:90%; line-height:150% }',
    '#item .js_table .test.ok { background: #7a7 }',
    '#item .js_table .benchmark.ok { background: #4ae }',
    '</style>',
    '<script _uncached>_js_table_install_click_handlers()</script>',
    '```',
  ].join('\n')
}

function _js_table_install_click_handlers() {
  _this.elem.querySelectorAll('.js_table .cell').forEach(cell => {
    const name = Array.from(cell.classList)
      .find(c => c.startsWith('name_'))
      .slice(5)
    const expandable = cell.classList.contains('expandable')
    cell.onclick = e => {
      e.stopPropagation()
      if (expandable) _js_table_toggle(name, e)
    }
    const label = cell.closest('tr').querySelector('.label-wrapper')
    const args = label.querySelector('.args').innerText
    label.onclick = e => {
      e.stopPropagation()
      _modal(
        [
          `<div class="title"><span class="name">${name}</span><span class="args">${args}</span></div>\n`,
          '```js',
          _this.eval(name),
          '```',
          '<style>',
          '.modal .title { font-family: "jetbrains mono", monospace; font-weight: 600; font-size: 90%; line-height: 120%; padding-bottom: 5px }',
          '.modal .title .args { color: #666; margin-left: 2px; font-size:90% }',
          '</style>',
        ]
          .flat()
          .join('\n')
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
    [
      '#### ' + `Test \`${name}\``,
      !test.ok ? ['```_log', ...test.log, '```'] : '',
      '```js',
      _this.eval(test.test || `_test_${name}`),
      '```',
      '<style>',
      '.modal pre { padding-top:5px }',
      '.modal :not(pre) > code { font-weight:600 }',
      '</style>',
    ]
      .flat()
      .join('\n')
  )
}

async function _js_table_run_benchmark(name, e) {
  const link = e.target
  const results = link.closest('.modal').querySelector('.results')
  const running = document.createTextNode('running...')
  link.replaceWith(running)
  results.style.opacity = 0.5
  // dynamically eval/invoke benchmark_item function from #benchmarker
  await _item('#benchmarker', false)?.eval('benchmark_item')(_this)
  results.style.opacity = 1
  running.replaceWith(link)
  await _modal_close()
  _js_table_show_benchmark(name)
}

function _js_table_show_benchmark(name) {
  const benchmark = _this.global_store._benchmarks[name]
  let log = [] // unparsed log lines
  let rows = [] // parsed benchmark log lines
  let elapsed
  for (const line of benchmark.log) {
    let [name, result] = line.match(/^(.+)\s*:\s*(\d.+?)\s*$/)?.slice(1) ?? []
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
  const rerun_link = !_exists('#benchmarker', false)
    ? ''
    : evallink(_this, `_js_table_run_benchmark('${name}',event)`, 'run')
  _modal(
    [
      `#### Benchmark \`${name}\`` +
        ` <span class="elapsed">${elapsed}ms ${rerun_link}</span>`,
      rows.length ? ['<div class="results">\n', table(rows), '\n</div>\n'] : [],
      log.length ? ['```_log', ...log, '```'] : [],
      '```js',
      _this.eval(benchmark.benchmark || `_benchmark_${name}`),
      '```',
      '<style>',
      '.modal pre { margin-top:10px }',
      '.modal :not(pre) > code { font-weight:600 }',
      '.modal .results {',
      [
        'margin-top:10px',
        'max-height: 300px; overflow:scroll',
        'background: #222; border-radius: 4px',
      ].join(';'),
      '}',
      '.modal table { color: #ccc; padding: 3px 0 }',
      '.modal table thead { display:none }',
      '.modal table td:first-child { padding-left:6px; padding-right:8px; text-align:right }',
      '.modal table td { vertical-align: top }',
      '.modal .elapsed { margin-left: 5px }',
      '.modal :is(table,.elapsed) { font-family:"jetbrains mono", monospace }',
      '.modal :is(table,.elapsed) { font-size:12px; line-height:19px }',
      '@media only screen and (max-width: 600px) {',
      '  .modal :is(table,.elapsed) { font-size:11px; line-height:18px } }',
      '@media only screen and (max-width: 400px) {',
      '  .modal :is(table,.elapsed) { font-size:10px; line-height:17px } }',
      '</style>',
    ]
      .flat()
      .join('\n')
  )
}

const _array = (J, f) => {
  const xJ = new Array(J)
  // NOTE: Array.from({length:J}, ...) was much slower
  if (typeof f == 'function') for (let j = 0; j < J; ++j) xJ[j] = f(j)
  else if (typeof f != 'undefined') xJ.fill(f)
  return xJ
}

const command_table = () => js_table(/^_on_command_/)
