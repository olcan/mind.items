// => /log [text]
// log `text` into today's [log](https://mindbox.io/#features/log) item
// daily log items are named `#YYYY/MM/DD`
// log entry is prefixed w/ current time as `HH:MM …`
// `text` can specify custom time of day as `HH:MM …`
// if custom time is in future for today, `text` is logged for yesterday
// today's log item is _touched_ (moved up w/ its time updated) if modified
function _on_command_log(text) {
  const now = new Date()
  const today = '#' + date_string(now) // from #util/sim
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
      text: `${name} #_log #_logger \<<_log_header()>>`,
      edit: false,
      init: item => append(item, text),
    }
}

// header macro for daily [log](https://mindbox.io/#features/log) items
function _log_header() {
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

const _logger = _item('$id')

// initialize [highlight.js](https://highlightjs.org) plugin for `log` blocks
function _init_log_highlight() {
  const keywords = _event_log_keywords_for_regex()
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
            begin: [/^| |\(/, /#[^#\s<>&,.;:!"'`(){}\[\]]+/],
            beginScope: { 2: 'tag.hashtag._highlight' },
          },
          // urls (regexp)
          {
            begin: [/^| |\(/, /https?:\/\/[^\s)<]*/],
            beginScope: { 2: 'tag.link._highlight' },
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
  // register `event_log` and `elog` as alias
  hljs.registerAliases(['event-log', 'elog'], { languageName: 'log' })

  // // register `event` as alias for `javascript`
  // // note this covers all suffixes e.g. event_*
  // hljs.registerAliases(['event'], { languageName: 'javascript' })
  // // register simple highlighting for event keywords
  // hljs.registerLanguage('keywords', () => ({
  //   contains: [{ scope: 'keyword', match: /\S+/ }],
  // }))
}

function _init() {
  // initialize highlight.js plugin
  _init_log_highlight()

  // set up css (see css_removed block below) for styling highlights
  // in particular to truncate long lines with ellipsis
  document.head.insertAdjacentHTML(
    'beforeend',
    '<style>' + _this.read('css') + '</style>'
  ) // see logger.css

  // set up _highlight callback to make dates/times, types, tags clickable
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
      // attempt lookup of "source item" for keyword in global store
      // TODO: this map was populated automatically in elog_keywords
      // (in #elog/highlight) as it read 'keywords' block from #events/...
      source = _logger._global_store.keyword_items?.[text]
    } else if (elem.classList.contains('hashtag_')) {
      source = text
    } else if (elem.classList.contains('link_')) {
      source = text
      // set url as title (tooltip)
      elem.title = elem.innerText
      // trim out any path/query/fragment
      elem.innerText = elem.innerText.replace(/(:\/\/.+)\/(.+)/, '$1/…')
    } else if (elem.classList.contains('line_')) {
      // look for date/time prefix in log line
      if (text.match(/^(?:\d\d\d\d\/)?(?:\d\d\/\d\d )?\d\d:\d\d/))
        source = sourceFromDateTime(text.replace(/(\d\d:\d\d).*$/, '$1'))
      else elem.style.background = 'none' // remove background from line
    }
    if (!source) return // could not determine source
    elem.style.cursor = 'pointer'
    elem.onclick = e => {
      e.stopPropagation()
      e.preventDefault()
      if (source.match(/^http/)) {
        // open link in new tab
        window.open(source, '_blank')
        return
      }
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
      document.querySelector('textarea').focus()
      setTimeout(edit_target)
    }
  }
}

// detect change to keywords (i.e. global store)
// re-init highlight.js plugin, invalidate cache & highlights
function _on_global_store_change(id) {
  if (id != _this.id) return // listen to self only
  _this.invalidate_cache() // must be done first to invalidate keywords
  _init_log_highlight()
  _invalidate_highlights()
}

// event_log([selector],[mapper],[options])
// event log entries, newest first
// returns array of parsed objects w/ properties:
// | `date`     | event date string as `YYYY/MM/DD`
// | `time`     | event time string as `HH:MM`
// | `body`     | event body text string
// | `keyword`  | event keyword (if any)
// | `numbers`  | numbers is event, via `parse_numbers(body)`
// | `t_date`   | event time as `Date`, see `event_date` in #util/sim
// | `t`        | event time, see `event_time` in #util/sim
// | `d`        | event day (integer part of `t`)
// | `h`        | event hour of day (fractional part of `t`, times `24`)
// `selector` can be function used to filter events
// `selector` can be keyword string/regex, converted via `match_keyword`
// `mapper` can be function `(e,j,eJ)=>…` or property name (see above)
// other `options`:
// | `reverse` | return oldest entries first, _default_: `false`
// | `filter`  | remove entries mapped to `undefined`, _default_: `true`
// cached on `#logger` under key `log` and `log.hash(arguments)`
// returned array should not be mutated
function event_log(selector, mapper, options) {
  // parse (and cache) log entries before any selector/mapper/options
  let eJ = _logger.cached('log', () => {
    let log = []
    const keywords = _event_log_keywords_for_regex()
    const keyword_regex = new RegExp('^(?:' + keywords + ')(?=\\W|$)')
    event_log_items().forEach(name => {
      const item = _item(name)
      const date = name.substring(1)
      const events = item.read('e?log') // include depracated 'elog' blocks
      if (!events) return // no events in item
      let last_time
      events.split('\n').forEach(line => {
        line = line.trim()
        if (!line) return // ignore empty line
        const [_, time, body] = line.match(/^(\d\d:\d\d)\s+(\S.+)$/) || []
        // note comments (//...) are allowed in highlighting, but not in log items
        if (!time || !body) {
          // time and non-empty body are required
          console.warn(`invalid event '${line}' in ${name}`)
          return
        }
        if (last_time && time > last_time)
          console.warn(`unordered event '${line}' in ${name}`)
        last_time = time
        const t_date = parse_date_time(date, time)
        let [keyword] = body.toLowerCase().match(keyword_regex) || []
        const t = event_time(t_date)
        const d = ~~t
        const h = (t - d) * 24
        log.push({
          line,
          date,
          time,
          body,
          keyword,
          numbers: parse_numbers(body),
          t_date,
          t,
          d,
          h,
        })
      })
    })
    // console.log(`cached ${log.length} events`)
    return log
  })
  if (arguments.length == 0) return eJ // return entries as parsed
  return _logger.cached(`log.${hash(arguments)}`, () => {
    const { reverse = false, filter = true } = options ?? {}
    if (is_string(selector)) selector = match_keyword(selector)
    if (selector) eJ = eJ.filter(selector)
    if (mapper) {
      if (is_string(mapper)) {
        const prop = mapper
        mapper = e => e[prop]
      }
      if (reverse) {
        const _mapper = mapper
        mapper = (e, j, eJ) => ((j = eJ.length - 1 - j), _mapper(eJ[j], j, eJ))
      }
      const xJ = eJ.map(mapper)
      if (filter) remove(xJ, undefined)
      return xJ
    }
    if (reverse) eJ = eJ.slice().reverse()
    return eJ
  })
}

// event log item names, newest first
// array of strings of the form `#YYYY/MM/DD`
// cached on `#logger` under key `log_items`
function event_log_items() {
  return _logger.cached('log_items', () =>
    _labels(l => l.match(/#\d\d\d\d\/\d\d\/\d\d/)).sort((a, b) => compare(b, a))
  )
}

// event log keyword strings
// stored in `_item('#logger').global_store.keywords`
// sorted by decreasing length, then alphabetically
// cached on `#logger` under key `log_keywords`
const event_log_keywords = () =>
  _logger.cached('log_keywords', () => _.uniq(_logger._global_store.keywords))

function _event_log_keywords_for_regex() {
  return _logger.cached('log_keywords_for_regex', () => {
    const keywords = _.uniq(_logger._global_store.keywords)
    keywords.sort((a, b) => b.length - a.length || b.localeCompare(a))
    return keywords.join('|')
  })
}

// index of newest event by time `t`
// returns `event_log().length` if no events by time `t`
// equal to lowest insertion index for event at time `t`
// uses binary search w/ logarithmic scaling ~⟘i,t
const event_log_index = t => sorted_index_by(event_log(), { t }, e => -e.t)

// event log as text, one line per event
// generates text from parsed objects (see `event_log` above)
// cached on `#logger` under key `log_text.hash(arguments)`
// | `limit`    | max number of events (lines)
// | `selector` | selector function or string/regex
// | `summary`  | include summary line? _default_: `true`
function event_log_text(options = undefined) {
  return _logger.cached(`log_text.${hash(arguments)}`, () => {
    let { limit = 5, selector, summary = true } = options ?? {}
    if (is_string(selector)) selector = match_keyword(selector)
    const K = limit
    const eJ = event_log()
    const eR = selector ? eJ.filter(selector) : eJ
    let sK = eR.slice(0, K).map(e => `${e.date} ${e.time} ${e.body}`)
    // drop current YYYY/ and MM/DD/ if all lines share prefix
    const date = date_string() + ' '
    const [year] = date.match(/^\d\d\d\d\//)
    if (sK.every(s => s.startsWith(date))) sK = sK.map(s => s.slice(11))
    else if (sK.every(s => s.startsWith(year))) sK = sK.map(s => s.slice(5))
    if (eR.length == sK.length) return sK.join('\n')
    if (!summary) return sK.join('\n') // drop summary line
    return (
      sK.join('\n') +
      `\n+${eR.length - sK.length} of ` +
      (!selector
        ? `${eJ.length} events`
        : `${eR.length}/${eJ.length} matching events`)
    )
  })
}

const event_log_block = (...args) => block('log', event_log_text(...args))

// event log times, oldest first
// `prop` can be `t` (_default_), `d` (day), `h` (hour of day)
// `≡ event_log(selector, prop, {reverse:true})
const event_log_times = (selector = undefined, prop = 't') =>
  event_log(selector, prop, { reverse: true })

// event log stats
// hour-of-day is ordered in [-12,12]
function event_log_stats(selector = undefined, max_days = inf) {
  const te = ~~now() // exclude today
  const ts = te - max_days
  let eJ = event_log(selector).filter(e => e.t >= ts && e.t < te)
  const days = eJ.length == 0 ? 0 : eJ[0].d - last(eJ).d + 1
  const _12h = h => (h > 12 ? h - 24 : h)
  const _24h = h => (h < 0 ? h + 24 : h)
  const _hm = h => (
    (h = _24h(h)), is_finite(h) ? _02d(~~h) + ':' + _02d((h - ~~h) * 60) : '?'
  )
  const hJ = eJ.map(e => e.h).map(_12h) // hour of day in [-12,12)
  const dJ = eJ.map(e => e.d % 7) // day of week in [0,7)
  const pday = uniq(eJ.map(e => e.d)).length / days
  return [
    hJ.length,
    ...[
      min_in(dJ) + '…' + max_in(dJ),
      ~~(100 * pday),
      _hm(min_in(hJ)) + '…' + _hm(max_in(hJ)),
      //_time(mean(hJ))+'±'+_2f(stdev(hJ)),
      _hm(circular_mean(hJ, 12)) + '±' + _hm(circular_stdev(hJ, 12)),
      _hm(median(hJ)),
    ],
  ]
}

// event log stats as markdown table
function event_log_stats_table(selectors, max_days = inf) {
  return flat(
    _event_log_stats_headers,
    _event_log_stats_headers.replace(/[^|]+/g, '-:'),
    flat(selectors).map(
      selector =>
        '|' +
        (!defined(selector)
          ? 'undefined (all)'
          : selector === ''
          ? "'' (no keyword)"
          : str(selector)) +
        '|' +
        event_log_stats(selector, max_days)
          .join('|')
          .replace(/Infinity/g, '∞')
          .replace(/-?∞/g, '?')
          .replace(/NaN/g, '?')
    ),
    '',
    _event_log_stats_style
  ).join('\n')
}

const _event_log_stats_headers = '|selector|#|days|%|hours|mean±stdev|median|'
const _event_log_stats_style = `<style> #item table { font-size:80%; line-height:140%; white-space:nowrap; color:gray; font-family:'jetbrains mono', monospace } </style>`

function _invalidate_highlights() {
  each(_this.dependents, id => {
    const item = _item(id)
    // for dependents that do not have any 'log' blocks outside of widget, update widget dynamically instead of invalidating entire item
    const widget_only = array(item.elem?.querySelectorAll('.log')).every(log =>
      log.closest('.logger-widget')
    )
    if (widget_only) _render_logger_widget(item)
    else item.invalidate_elem_cache(true)
  })
}

// detect any changes to daily log items
// invalidate logger cache & dependents
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // ignore dependency changes
  const relevant = l => l.match(/^#\d\d\d\d\/\d\d\/\d\d$/)
  if (!relevant(label) && !relevant(prev_label)) return
  _this.invalidate_cache()
  _invalidate_highlights()
}

// event selector by keyword `regex`
// `regex` can be string or `RegExp` object
// empty string matches events w/ _missing_ keyword
// `RegExp` (if used) is attached to selector as `regex`
// optional `fallback` selector is attached as `fallback`
function match_keyword(regex, fallback) {
  let selector
  if (regex === '') selector = e => !e.keyword || fallback?.(e)
  else {
    if (is_string(regex)) regex = new RegExp(`^(?:${regex})$`)
    if (!(regex instanceof RegExp)) fatal(`invalid regex`)
    selector = e => regex.test(e.keyword) || fallback?.(e)
  }
  return assign(selector, { regex, fallback })
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

function _test_parse_numbers() {
  check(() => [
    parse_numbers(',ok,test, 2h 30m 2m 5s, 400cal, ok <30m, 2p'),
    [
      { number: 2.5347222222222223, name: 'ok,test', unit: 'h' },
      { number: 400, unit: 'c' },
      { number: 0.5, name: 'ok', comparison: '<', unit: 'h' },
      { number: 2, unit: 'p' },
    ],
  ])
}

function _extract_template_options(options = {}) {
  const props = ['height', 'style', 'styles', 'classes']
  let {
    height = 'auto',
    style = '',
    styles = '',
    classes = '',
  } = pick(options, props)
  options = omit(options, props) // remove props from options
  if (is_number(height)) height += 'px'
  style = `height:${height};${style}`
  style = `style="${style}"`
  styles = flat(styles).join('\n')
  return { style, styles, classes, options }
}

// event log widget macro
function event_log_widget(options = undefined) {
  // note this macro structure follows that of _plot in #util/plot
  const { style, styles, classes, widget_options } =
    _extract_template_options(options)
  // pass along options via item store keyed by macro cid
  // macro cid is also passed to html via template string __cid__
  // macro cid is preferred to html script cid for consistency
  _this.store['logger-widget-$cid'] = { options: widget_options }
  return block(
    '_html',
    _logger
      .read('html_widget')
      .replace(/__classes__/g, classes)
      .replace(/__style__/g, style)
      .replace(/\/\* *__styles__ *\*\//g, styles)
      .replace(/#widget\b/g, `#logger-widget-__cid__`)
      .replace(/__cid__/g, '$cid')
  )
}

// create menu item w/ widget
function create_menu_item() {
  const item = _create()
  item.write_lines(
    `#_menu #_pin/0 [#log](#log) \\`,
    `\<<link_js('MindBox.focus("/log ")','/log')>> \\`,
    `\<<event_log_widget({style:'margin-left:7px;margin-top:3px'})>>`,
    `#_logger`
  )
  MindBox.create('/log hello world!')
}

// on-demand highlighter used by widget
function _highlight_log(div, text) {
  div.innerHTML = hljs.highlight(text, { language: 'log' }).value
  // invoke window._highlight (see _init) for clickable elements
  div
    .querySelectorAll('._highlight,._highlight_,._highlight__')
    .forEach(elem => _highlight(elem, _this.id))
}

// detect changes to MindBox and update all widgets
function _on_change(text, elem = document) {
  elem?.querySelectorAll('.logger-widget .suggest').forEach(suggest => {
    text = text.toLowerCase()
    // text = text.replace(/^\/done(?:\s|$)/, '/log done ')
    // text = text.replace(/^\/idea(?:\s|$)/, '/log idea ')
    // TODO: filter based on rest of command acting as search terms?
    // TODO: use value/unit based filtering logic from event items?
    let keyword = text.match(/^\/log\s+(?:\d\d?:\d\d\s+)?(\S+)/)?.pop()
    // workaround for :empty style (see css above) not being applied on android chrome when there is matching text in item (must be due to some interaction between highlighting and css rules for :empty)
    suggest.style.display = keyword ? 'block' : 'none'
    if (!keyword) {
      suggest.innerHTML = ''
      return
    }
    let matches
    try {
      matches = event_log_text({ limit: 5, selector: keyword })
    } catch {} // ignore errors, e.g. in keyword regex parsing
    matches ??= ''
    const prefix = matches
      ? `recent events for keyword '${keyword}': \n`
      : `no events found for keyword '${keyword}'`
    _highlight_log(suggest, prefix + matches)
  })
}

// render/update widgets in item
function _render_logger_widget(item = _this) {
  if (!item.elem) return // item not visible, e.g. being edited
  item.elem.querySelectorAll('.logger-widget .recent').forEach(recent => {
    // const options = item.store[recent.id].options
    _highlight_log(recent, event_log_text({ limit: 3, summary: false }))
  })
  // update .suggest via _on_change
  _on_change(MindBox.get(), item.elem)
}
