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
      const stack = new Error().stack.split('\n').join(' <- ')
      throw new Error(`FAILED CHECK: ${stringify(f)} @ ${stack}`)
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

// returns `[output, elapsed_ms]`
function timing(f) {
  const start = Date.now()
  const output = f()
  const elapsed = Date.now() - start
  return [output, elapsed]
}

// table(cells,[headers])
// returns markdown table for `cells`
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

// js_table([regex])
// returns table of `js` definitions
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
      def.args = def.args.replace(/\s*\n\s*/g, ' ') // remove newlines in args
      def._name = def.name // save original name (before possible modification)
      if (def.comment) {
        def.comment = def.comment
          .replace(/ *\n(?:\/\/)? */g, '<br>\n')
          .replace(/^\/\/ */, '')
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
          if (!table) table += '<table>'
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

    // hide all comment lines but first
    const button = evallink(
      _this,
      '_js_table_expand(event)',
      '', // content set via .button:before
      'button'
    )
    if (comment_lines.length > 1) {
      def.comment =
        comment_lines[0] +
        button +
        '<div class="more">' +
        comment_lines.slice(1).join('<br>') +
        `</div>`
    } else {
      def.comment = comment_lines[0] || ''
    }

    // append test results
    const gs = _this.global_store
    let status = ''
    if (gs._tests && gs._tests[def._name]) {
      const test = gs._benchmarks[def._name]
      status += evallink(
        _this,
        `_js_table_show_test('${def._name}', event)`,
        'tested',
        'tested' + (test.ok ? ' ok' : '')
      )
    }
    // append benchmark results
    if (gs._benchmarks && gs._benchmarks[def._name]) {
      const benchmark = gs._benchmarks[def._name]
      status += evallink(
        _this,
        `_js_table_show_benchmark('${def._name}', event)`,
        'benchmarked',
        'benchmarked' + (benchmark.ok ? ' ok' : '')
      )
    }
    if (status) def.comment += `<div class="status">${status}</div>`

    // wrap label in backticks, allowing multiple lines
    const label = (def.name + def.args)
      .replace(/\\n/g, '<br>')
      .split('<br>')
      .map(s => '`' + s + '`')
      .join('<br>')
    lines.push(`|${label}|${def.comment}`)
  })
  return [
    '<span class="js_table">',
    lines.join('\n'),
    '</span>',
    '```_html',
    '<style>',
    '#item .js_table table code { white-space: nowrap }',
    '#item .js_table table td:first-child { white-space: nowrap; text-align:right }',
    '#item .js_table table + br { display: none }',
    '#item .js_table > table { line-height: 150%; border-spacing: 10px }',
    '#item .js_table > table table code { font-size:90% }',
    '#item .js_table > table table { font-size:80%; border-spacing: 10px 0 }',
    '#item .js_table table td .button { margin-left:5px }',
    '#item .js_table table td .button:before { content:"⋯" }',
    '#item .js_table table td.expand .button:before { content:"◀︎" }',
    '#item .js_table table td :is(.tested,.benchmarked) { color:black; background: #f55; margin-right:5px; font-weight:600; font-size:80% }',
    '#item .js_table table td .tested.ok { background: #7a7 }',
    '#item .js_table table td .benchmarked.ok { background: #4ae }',
    // if item is pushable, expand all for easy preview and editing
    '.container:not(.pushable) #item .js_table table td:not(.expand) .more { display: none }',
    '.container.pushable #item .js_table table td .button { display: none }',
    '</style>',
    '```',
  ].join('\n')
}

function _js_table_expand(e) {
  e.target.closest('td').classList.toggle('expand')
}

function _js_table_show_test(name) {
  const test = _this.global_store._tests[name]
  alert(test.log.join('\n'))
}

function _js_table_show_benchmark(name) {
  const benchmark = _this.global_store._benchmarks[name]
  alert(benchmark.log.join('\n'))
}

const _array = (J, f) => {
  const xJ = new Array(J)
  // NOTE: Array.from({length:J}, ...) was much slower
  if (typeof f == 'function') for (let j = 0; j < J; ++j) xJ[j] = f(j)
  else if (typeof f != 'undefined') xJ.fill(f)
  return xJ
}

const command_table = () => js_table(/^_on_command_/)

// const style_footer = `
// \`\`\`_html
// <style>
// #item table {
//   color:gray;
//   font-size:80%;
//   line-height:140%;
//   white-space:nowrap;
//   font-family:'jetbrains mono', monospace;
// }
// #item .elapsed {
//   color:#666;
//   font-size:70%;
//   font-family:'jetbrains mono', monospace;
//   margin-left: 10px;
// }
// </style>
// \`\`\`
// `
// // command /benchmark [label]
// async function _on_command_benchmark(label) {
//   const items = _items(label)
//   if (items.length == 0) {
//     alert(`/benchmark: ${label} not found`)
//     return '/benchmark ' + label
//   }
//   for (const item of items) {
//     const lines = await benchmark_item(item)
//     if (lines.length == 0) continue
//     const output_item_name =
//       '#benchmarks/' +
//       (item.name.startsWith('#') ? item.name.slice(1) : item.id)
//     let text = `${output_item_name}\n`
//     // process lines, formatting benchmark lines as interleaved markdown tables
//     let rows = []
//     for (const line of lines) {
//       if (line.match(/:\s*\d/)) {
//         let [name, result] = line.match(/^(.+)\s*:\s*(\d.+?)\s*$/).slice(1)
//         result = result.replace('calls/sec', '') // drop calls/sec as default unit
//         rows.push([result, name])
//       } else {
//         if (line.match(/^BENCHMARK/)) {
//           // append as benchmark header
//           const [name, time] = line
//             .match(/BENCHMARK (\S+?) completed in (\S+)/)
//             .slice(1)
//           text += `\`${name}\`<span class=elapsed>${time}</span>\n`
//         } else {
//           // append generic line as is
//           text += line + '\n'
//         }
//         if (rows.length) {
//           text += '```_md\n' + table(rows) + '\n```\n\n'
//           rows = []
//         }
//       }
//     }
//     text += style_footer
//     text = text.trim()

//     // if benchmark item exists, write into it, otherwise create new item
//     const output_item = _item(output_item_name, false /*log_errors*/)
//     if (output_item) output_item.write(text, '' /*whole item*/)
//     else _create(text)
//   }
// }
