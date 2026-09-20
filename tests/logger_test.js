#!/usr/bin/env node
// plain-node table for the logger's `log` highlighting (logger.js): the url rule of the
// highlight.js language that `_init_log_highlight` registers, evaluated from the source under a
// stub `hljs` that keeps the registered definition (no browser; the rule's own regex as the item
// builds it, not a copy). The rule is a multi-class begin (`beginScope: { 2: ... }`), which
// highlight.js compiles by joining the parts as capture groups: the highlighted url is group 2.
// run: node external/mind.items/tests/logger_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const src = fs.readFileSync(path.join(__dirname, '..', 'logger.js'), 'utf8')
const picked = src.match(/\nfunction _init_log_highlight\([^\n]*\) \{[\s\S]*?\n\}\n/)
if (!picked) throw new Error('function _init_log_highlight not found in logger.js')

const languages = {}
const context = {
  hljs: { registerLanguage: (name, def) => (languages[name] = def()), registerAliases: () => {} },
  window: { _shortcut_hosts: [] },
  _: { escapeRegExp: s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
  _event_log_keywords_for_regex: () => 'keyword',
}
vm.createContext(context)
vm.runInContext(picked[0] + '\n_init_log_highlight()', context)

// the url rule: the `tag.url._highlight` scope among the line mode's rules
const rule = languages.log.contains[0].contains.find(r => r.beginScope?.[2] == 'tag.url._highlight')
if (!rule) throw new Error('url rule not found in the log language')
// the begin as highlight.js compiles a multi-class begin (each part a capture group, joined),
// under the language's case-insensitive flag; the highlighted url is group 2
const begin = new RegExp(rule.begin.map(re => `(${re.source})`).join(''), 'mi')
const url = line => begin.exec(line)?.[2] ?? null

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// the gmail-imported line that surfaced the bug (2026-09-20), as /log records it: the url ends
// at the tweet title's closing quote (an unencoded " is never part of a url, RFC 3986)
check(
  'the reported line: the url ends before the closing quote',
  url('19:32 Rafal Wilinski on X: "Jev is now in charge of this account\'s humor https://t.co/ojSOHeMFT2" / X'),
  'https://t.co/ojSOHeMFT2'
)
check('without the quote the url matches as before', url('19:32 humor https://t.co/ojSOHeMFT2 / X'), 'https://t.co/ojSOHeMFT2')
check('a quote inside the run ends the url too', url('19:32 see https://t.co/a"b'), 'https://t.co/a')
// the rule's own differences from the app's stay: < is allowed (no html in a log line), ; is not
check('the rule allows < and ends before ;', url('19:32 see https://x.y/a<b;'), 'https://x.y/a<b')

if (failures) { console.log(`${failures} failure(s)`); process.exit(1) }
