// => /log [text]
// log `text` into daily #log items
// daily log items are named `#YYYY/MM/DD`
// log entry is prefixed with time as `HH:MM`
// current time is used unless `text` starts with `HH:MM`
function _on_command_log(text) {
  const now = new Date()
  const today = '#' + date_string(now) // from #events/util
  let name = today // add to today's log item by default
  // attempt to parse time from command, otherwise use current time
  // if time is in the future for today, switch to yesterday's log item
  const [h, m, b] = text.match(/^(\d\d?):(\d\d)\s+(.+)$/)?.slice(1) || []
  if (h > now.getHours() || (h == now.getHours() && m > now.getMinutes())) {
    let date = new Date()
    date.setDate(date.getDate() - 1)
    name = '#' + date_string(date)
  }
  const max_visible_lines = 10
  const append = (item, text) => {
    let lines = item
      .read('log')
      .split('\n')
      .filter(l => l)
    if (h) lines.unshift(`${_02d(h)}:${_02d(m)} ${b}`)
    else lines.unshift(`${time_string(now)} ${text}`)
    sort_by(lines, l => -parse_time(l))
    item.write(lines.slice(0, max_visible_lines).join('\n'), 'log')
    if (lines.length > max_visible_lines)
      item.write(lines.slice(max_visible_lines).join('\n'), 'log_removed')
    else item.remove('log_removed')
    // touch item to move it above other #log items in same day
    if (name == today) item.touch() // touching same-day log item is ok
  }
  if (_exists(name)) append(_item(name), text)
  else
    return {
      text: `${name} #_log #_logger \<<log_header()>>`,
      edit: false,
      init: item => append(item, text),
    }
}

// header macro for daily #log items
function log_header() {
  const visible = _that
    .read('log')
    .split('\n')
    .filter(l => l)
  const hidden = _that
    .read('log_removed')
    .split('\n')
    .filter(l => l)
  let header = `${visible.length} events`
  if (hidden.length)
    header += ` <font style="color:#666;font-size:80%">(${hidden.length} hidden)</font>`
  return header
}

// highlight log `text` into `div` element
function log_highlight(text, div, item = _this) {
  div.innerHTML = hljs.highlight(text, { language: 'log' }).value
  // invoke window._highlight (see _init) for clickable elements
  div
    .querySelectorAll('._highlight,._highlight_,._highlight__')
    .forEach(elem => _highlight(elem, item.id))
}

// initialize [highlight.js](https://highlightjs.org) plugin for `log` blocks
function init_log_highlights() {
  const keywords = uniq(_item('#logger')._global_store.keywords)
    .sort((a, b) => b.length - a.length || b.localeCompare(a))
    .join('|')
  const keyword_regex = new RegExp(' (?:(?:' + keywords + ')(?=\\W|$))|(?= )')

  // register highlighting language for 'log' blocks
  // https://highlightjs.readthedocs.io/en/latest/language-guide.html
  // https://highlightjs.readthedocs.io/en/latest/mode-reference.html
  // https://highlightjs.readthedocs.io/en/latest/css-classes-reference.html
  hljs.registerLanguage('log', () => ({
    case_insensitive: true,
    keywords: '', // no keywords in global scope
    contains: [
      {
        scope: 'line.line._highlight',
        begin: /(^|\n)(?=.)/,
        end: /\n|$/,
        contains: [
          // date/time prefix ([YYYY/MM/DD] 00:00) as comment
          // following space is required but excluded from match/scope
          {
            scope: 'comment', //.date_time._highlight',
            match: /^(?:\d\d\d\d\/)?(?:\d\d\/\d\d )?\d\d:\d\d(?= )/,
            // time may be followed immediately by a keyword: ...
            starts: {
              scope: 'keyword', //.type._highlight',
              end: keyword_regex,
            },
          },
          // /* inline (or multi-line) comments */
          // hljs.COMMENT(/\/\*/, /\*\//),
          // single-line suffix (//...) comments
          { scope: 'comment', match: /\/\/.*?$/ },
          // non-date/time-prefixed lines as comments
          {
            scope: 'comment',
            match: /^(?!(?:\d\d\d\d\/)?(?:\d\d\/\d\d )?\d\d:\d\d(?= )).*?$/,
          },
          // #tags (regexp copied from util.js in mind.page repo)
          {
            scope: 'tag.hashtag._highlight',
            match: /(?:^| |\()(#[^#\s<>&,.;:!"'`(){}\[\]]+)/,
          },
          // numbers+units (regexp copied from #values)
          // we exclude name and comparison and allow $ in place of +/-
          {
            scope: 'number',
            match:
              /(?:^|[ ;]) *([+\-\$]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))) *(p|pts?|points?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|c|cals?|calories?|lbs?|pounds?|kgs?|kilos?|kilograms?|\$|dollars?|usd)?(?=[ ,;\.:]|$)/,
          },
          // "strings"
          // { scope: 'string', begin: '"', end: '"' },
        ],
      },
    ],
  }))
  // // register `event` as alias for `javascript`
  // // note this covers all suffixes e.g. event_*
  // hljs.registerAliases(['event'], { languageName: 'javascript' })
  // // register simple highlighting for event keywords
  // hljs.registerLanguage('keywords', () => ({
  //   contains: [{ scope: 'keyword', match: /\S+/ }],
  // }))
}

function _init() {
  init_log_highlights()
  // set up css (see css_removed block below) for styling highlights
  // in particular to truncate long lines with ellipsis
  document.head.insertAdjacentHTML(
    'beforeend',
    '<style>' + _this.read('css') + '</style>'
  ) // see below
  // set up _highlight callback to make dates/times, types, tags clickable
  // also removes background from non-clickable lines
  // we set attributes to avoid capturing references
  const prev_highlight = window._highlight // for chaining
  window._highlight = (elem, id) => {
    if (prev_highlight) prev_highlight(elem, id)
    if (!elem.className.startsWith('hljs-')) return // not relevant
    let text = elem.textContent.trim()
    let source // determined below
    // helper function to determine source from date/time text
    function sourceFromDateTime(text) {
      const now = new Date()
      const _02d = d3.format('02d')
      if (text.match(/^\d\d:\d\d$/)) {
        // no date
        if (_item(id).name.match(/^#\d\d\d\d\/\d\d\/\d\d$/))
          return _item(id).name
        // assume date is today
        else
          return (
            '#' +
            now.getFullYear() +
            '/' +
            _02d(now.getMonth() + 1) +
            '/' +
            _02d(now.getDate())
          )
      } else if (text.match(/^\d\d\/\d\d \d\d:\d\d$/))
        // no year
        return '#' + now.getFullYear() + '/' + text.substring(0, 5)
      else if (text.match(/^\d\d\d\d\/\d\d\/\d\d \d\d:\d\d$/))
        return '#' + text.substring(0, 10)
      else {
        console.warn(`invalid date/time '${text}' in ${_item(id).name}`)
        return // could not parse date/time
      }
    }
    if (elem.classList.contains('date_time_')) {
      source = sourceFromDateTime(text)
    } else if (elem.classList.contains('type_')) {
      // source = '#logger/user/' + text
      source = _item('#logger').cache.keyword_items[text]
    } else if (elem.classList.contains('hashtag_')) {
      source = text
    } else if (elem.classList.contains('line_')) {
      // look for date/time prefix in log line
      if (text.match(/^(?:\d\d\d\d\/)?(?:\d\d\/\d\d )?\d\d:\d\d/))
        source = sourceFromDateTime(text.replace(/(\d\d:\d\d).*$/, '$1'))
    }
    if (!source) {
      // elem is not clickable
      elem.closest('.hljs-line').style.background = 'none'
      return // could not determine source
    }
    elem.style.cursor = 'pointer'
    // elem.setAttribute('title', source)
    // elem.setAttribute("_clickable", "")
    // elem._clickable = (e) => true
    // elem.setAttribute('onclick',
    // `event.stopPropagation();MindBox.toggle('${source}')`)
    elem.onclick = e => {
      e.stopPropagation()
      e.preventDefault()
      MindBox.set(source)
      // edit specific line if clicking on whole line or date/time prefix
      if (!text.match(/^(?:\d\d\d\d\/)?(?:\d\d\/\d\d )?\d\d:\d\d/)) return
      const edit_target = () => {
        const target = document.querySelector('.container.target')
        if (!target) return null
        if (_item(target.getAttribute('item-id')).label != source) return null // target mismatch
        target.dispatchEvent(new Event('mousedown'))
        target.dispatchEvent(new Event('click'))
        setTimeout(() => {
          const textarea = target.querySelector('textarea')
          if (!textarea) {
            console.warn('missing textarea in target')
            return
          }
          // drop any date prefix from text before searching
          text = text.replace(/^(?:\d\d\d\d\/)?\d\d\/\d\d /, '')
          const pos = textarea.value.indexOf(text)
          if (pos < 0) console.error('could not find text: ' + text)
          else {
            // NOTE: dispatched refocus after blur is more robust on ios
            textarea.setSelectionRange(0, 0)
            textarea.blur()
            textarea.focus()
            textarea.setSelectionRange(pos, pos + text.length)
            setTimeout(() => {
              textarea.focus()
              textarea.setSelectionRange(pos, pos + text.length)
            })
          }
        })
        return target
      }
      // NOTE: immediate edit can fail during/after init and can focus on wrong target, and dispatched edit can fail to focus on iphones, which we attempt to work around by focusing on the top textarea first
      //      if (!edit_target()) {
      document.querySelector('textarea').focus()
      setTimeout(edit_target)
      // _update_dom().then(edit_target)
      //      }
    }
  }
}
// TODO: move #elog into #logger/elog
// TODO: switch over from #elog to #logger/elog

// on change to keywords (i.e. global store), re-init highlight.js plugin
function _on_global_store_change() {
  init_log_highlights()
  // force-render dependents (since html cache keys exclude external css/js)
  each(_this.dependents, id =>
    _item(id).invalidate_elem_cache(true /* force render */)
  )
  // TODO: re-parse all log entries
}

// parse numbers from `text`
// returns array of objects w/ properties:
// | `number`     | parsed number, e.g. `191.95`
// | `unit`       | _optional_ unit string, e.g. `kg`
// | `name`       | _optional_ name string, e.g. `weight`
// | `comparison` | _optional_ comparison string,g e.g. `<`,`<=`,`=`, etc
// syntax is `[name] [comparison] number [unit]`
// `;` is allowed as pre/post-delimiter
// `.` `,` `:` are allowed as post-delimiter only
// `,` `|` `"` `'` are allowed in `name`
// `$` is allowed in `name`, treated as `unit` if last character
function parse_numbers(text) {
  text = text.toLowerCase()
  const regex =
    /(?:^|[\s;])([a-zA-Z\s\$,'’"“”|]*)\s*([<>]?=?)\s*([+-]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+)))\s*(p|pts?|points?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|c|cals?|calories?|lbs?|pounds?|kgs?|kilos?|kilograms?|\$|dollars?|usd)?(?=[\s,;\.:]|$)/g
  let values = Array.from(text.matchAll(regex), m => {
    let [match, name, comparison, number, unit] = m
    name = _.trim(name, ' ,') // trim spaces|commas around name
    if (name.endsWith('$')) {
      // allow $ unit as prefix
      name = name.substring(0, -1)
      unit = '$'
    }
    number = parseFloat(number)
    // standardize units
    if (unit) {
      if (unit.match(/^(?:p|pts?|points?)$/)) {
        unit = 'p'
      } else if (unit.match(/^(?:s|secs?|seconds?)$/)) {
        unit = 'h' // standard time unit
        number /= 60 * 60
      } else if (unit.match(/^(?:m|mins?|minutes?)$/)) {
        unit = 'h'
        number /= 60
      } else if (unit.match(/^(?:h|hrs?|hours?)$/)) {
        unit = 'h'
      } else if (unit.match(/^(?:d|days?)$/)) {
        unit = 'h'
        number *= 24
      } else if (unit.match(/^(?:c|cals?|calories?)$/)) {
        unit = 'c'
      } else if (unit.match(/^(?:lbs?|pounds?)$/)) {
        unit = 'lb'
      } else if (unit.match(/^(?:kgs?|kilos?|kilograms?)$/)) {
        unit = 'kg'
      } else if (unit.match(/^(?:\$|dollars?|usd)$/)) {
        unit = '$'
      }
    }
    const value = {}
    value.number = number
    if (name) value.name = name
    if (comparison) value.comparison = comparison
    if (unit) value.unit = unit
    return value
  })
  // aggregate values by unit (for unnamed non-comparison values)
  values = values.reduce((a, v) => {
    if (v.name || v.comparison || v.unit != _.last(a)?.unit) a.push(v)
    else if (a.length > 0) _.last(a).number += v.number
    return a
  }, [])
  // inherit missing names from prior named value
  // for (let i=1; i<values.length; ++i)
  // values[i].name = values[i].name || values[i-1].name
  return values
}
