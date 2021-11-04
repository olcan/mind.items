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

// table(cells, [headers])
// returns markdown table for `cells`
// |`cells`   | 2D array, e.g. `[['a',1],['b',2]]`
// |`headers` | array, e.g. `['a','b']`
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

// jsdoc([regex])
// returns table of global definitions
// can filter names using optional `regex`
function jsdoc(regex) {
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
          .replace(/\s*(?:\n(?:\/\/)?)\s*/g, '<br>\n') // \n dropped below
          .replace(/^\/\/\s*/, '')
        // displayed name/args can be modified via first line of comment:
        // <name>(...) modifies args, <name> removes args
        // => <display_name> or => <display_name>(...) modifies name/args
        if (
          def.comment.match(/^=> *\S+/) ||
          def.comment.match(new RegExp(`^${def.name}(?:\\(.*?\\))?(?:$|<br>)`))
        ) {
          def.name = def.comment.match(/^[^(<]+/)[0].replace(/^=> */, '')
          def.args = def.comment.match(/^.+?(\(.*?\))(?:$|<br>)/)?.pop() ?? ''
          def.comment = def.comment.replace(/^.+?(?:\\(.*?\\))?(?:$|<br>)/, '')
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
      .split('<br>')
      .filter(l => l) //  drop empty lines
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
    const button = `<a class="button" onmousedown="event.target.closest('td').classList.toggle('expand');event.stopPropagation()" onmouseup="event.preventDefault();event.stopPropagation()" onclick="event.preventDefault();event.stopPropagation()"></a>`

    comment_lines
    if (comment_lines.length > 1) {
      def.comment =
        comment_lines[0] +
        '<span class="more"><br>' +
        comment_lines.slice(1).join('<br>') +
        `</span>` +
        button
    } else {
      def.comment = comment_lines[0] || ''
    }

    // wrap label in backticks, allowing multiple lines
    const label = (def.name + def.args)
      .replace(/\\n/g, '<br>')
      .split('<br>')
      .map(s => '`' + s + '`')
      .join('<br>')
    lines.push(`|${label}|${def.comment}`)
  })
  return [
    '<span class="jsdoc">',
    lines.join('\n'),
    '</span>',
    '```_html',
    '<style>',
    '#item .jsdoc table code { white-space: nowrap }',
    '#item .jsdoc table td:first-child { white-space: nowrap; text-align:right }',
    '#item .jsdoc table + br { display: none }',
    '#item .jsdoc > table { line-height: 150%; border-spacing: 10px }',
    '#item .jsdoc > table table code { font-size:90% }',
    '#item .jsdoc > table table { font-size:80%; border-spacing: 10px 0 }',
    '#item .jsdoc table td .button { cursor: pointer; vertical-align:middle }',
    '#item .jsdoc table td .button { user-select: none; -webkit-user-select:none }',
    '#item .jsdoc table td .button:before { content:"⋯" }',
    '#item .jsdoc table td.expand .button:before { content:"▲" }',
    '#item .jsdoc table td:not(.expand) .button { margin-left:5px }',
    '#item .jsdoc table td.expand .button { display:block; width:fit-content; margin-top:5px; margin-bottom:10px }',
    // if item is pushable, expand all for easy preview and editing
    '.container:not(.pushable) #item .jsdoc table td:not(.expand) .more { display: none }',
    '.container.pushable #item .jsdoc table td .button { display: none }',
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

const cmddoc = () => jsdoc(/^_on_command_/)
