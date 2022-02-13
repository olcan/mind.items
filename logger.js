// TODO: move #values into #logger/values
// TODO: move #elog into #logger/elog
// TODO: move #commands/log here
// TODO: switch over from #elog to #logger/elog
// TODO: store keywords under #logger/...

const _self = _item('$id') // lexical self (vs eval-stack _this)

// reserved keywords that have special uses
// e.g. in block names such as event_observe_<keyword>
const reserved_keywords = new Set(['event', 'observe', 'config'])

// returns keywords read from (and cached on) specified item
// used for both highlighting (below) and for parsing in #logger/elog
const read_keywords = (item = _this, options = {}) =>
  item.cached(`keywords.${JSON.stringify(options)}`, () =>
    _.uniq(item.read('keywords', options)?.toLowerCase().match(/\S+/g))
  )

const read_keywords_deep = (item = _this, options = {}) =>
  read_keywords(item, _.merge({ include_deps: true }, options))
// returns RegExp for matching against keywords
const read_keywords_regex = (item = _this, options = {}) =>
  item.cached(
    `keywords_regex.${JSON.stringify(options)}`,
    () =>
      new RegExp(
        '^(?:' +
          read_keywords(item, options)
            .slice()
            .sort((a, b) => b.length - a.length || b.localeCompare(a))
            .join('|') +
          ')$'
      )
  )

// returns length-sorted keyword regex abc|ab|bc|...
const elog_keywords = () =>
  _self.cached('elog_keywords', () => {
    const items = _labels(l => l.match(/^#logger\/.+$/)).map(l => _item(l))
    let keywords = []
    _self.cache.keyword_items = {} // for lookups in _highlight
    items.forEach(item => {
      const item_keywords = read_keywords(item)
      item_keywords.forEach(
        keyword => (_self.cache.keyword_items[keyword] = item.label)
      )
      keywords = keywords.concat(item_keywords)
    })
    // filter out reserved keywords
    keywords = keywords.filter(keyword => {
      if (!reserved_keywords.has(keyword)) return true
      console.warn(`ignoring reserved keyword '${keyword}'`)
      return false
    })
    return _.uniq(keywords)
      .sort((a, b) => b.length - a.length || b.localeCompare(a))
      .join('|')
  })

// registers highlight.js plugin ("language") for elog blocks
function register_elog_highlight_plugin() {
  // register highlighting language for 'elog' blocks
  // https://highlightjs.readthedocs.io/en/latest/language-guide.html
  // https://highlightjs.readthedocs.io/en/latest/mode-reference.html
  // https://highlightjs.readthedocs.io/en/latest/css-classes-reference.html
  const keywords = elog_keywords()
  const keyword_regex = new RegExp(' (?:(?:' + keywords + ')(?=\\W|$))|(?= )')
  hljs.registerLanguage('elog', () => ({
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
  // register `event` as alias for `javascript`
  // note this covers all suffixes e.g. event_*
  hljs.registerAliases(['event'], { languageName: 'javascript' })
  // register simple highlighting for event keywords
  hljs.registerLanguage('keywords', () => ({
    contains: [{ scope: 'keyword', match: /\S+/ }],
  }))
}

function elog_highlight(div, text) {
  div.innerHTML = hljs.highlight(text, { language: 'elog' }).value
  // invoke window._highlight (see _init below) for clickable elements
  div
    .querySelectorAll('._highlight,._highlight_,._highlight__')
    .forEach(elem => {
      _highlight(elem, _this.id)
    })
}

function _init() {
  return // TODO: enable once you are ready to switch over
  register_elog_highlight_plugin()
  // set up css (see css_removed block below) for styling highlights
  // in particular to truncate long lines with ellipsis
  document.head.insertAdjacentHTML(
    'beforeend',
    '<style>' + _this.read('css') + '</style>'
  ) // see below
  // set up _highlight callback to make dates/times, types, tags clickable
  // also removed background from non-clickable lines
  // NOTE: we set attributes to avoid capturing references
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
      source = _self.cache.keyword_items[text]
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

// update hash comment in #logger on changes to #logger/...
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // ignore dependency changes
  // if this item has changed, this could be due to new keyword hash, so we update the highlight plugin after invalidating html caches (since html cache keys do not reflect highlighting rules); note that this is ok if keywords are unchanged, and this should work for remote changes also assuming keyword changes have also been synced
  if (id == '$id') {
    if (window._html_cache)
      _self.dependents.forEach(id => (window._html_cache[id] = {}))
    register_elog_highlight_plugin()
    return
  }
  const relevant = l => l.match(/^#logger\/.+$/)
  if (!relevant(label) && !relevant(prev_label)) return
  // for remote changes to relevant items, we do NOT write a new hash comment since that should also happen remotely (and get synced locally), and if there is an inconsistency in keywords it could cause the hash to flip back and forth
  if (remote) {
    /*console.warn(`remote change to ${label}`);*/ return
  }
  const items = _labels(relevant).map(l => _item(l))
  // NOTE: we store keyword hash instead of events hash
  let keywords = items.map(read_keywords).flat()
  keywords = _.uniq(keywords)
    .sort((a, b) => b.length - a.length || b.localeCompare(a))
    .join('|')
  // TODO: refactor this logic, also used in #logger/elog (to be moved here)
  const hash_comment = `<!-- ${_hash(keywords)} -->`
  // console.log(hash_comment, keywords)
  const text = _self.read()
  if (!text.match(/<!-- [0-9a-fA-F]+ -->/))
    console.error('#logger missing hash comment')
  else if (!text.includes(hash_comment)) {
    console.log(
      'keywords changed',
      hash_comment,
      text.match(/<!-- [0-9a-fA-F]+ -->/)[0]
    )
    _self.write(
      text.replace(/<!-- [0-9a-fA-F]+ -->/, hash_comment),
      '' /* whole item */,
      { keep_time: true } /* do not bring up */
    )
  }
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
