#!/usr/bin/env node
// plain-node table for #chat's first-user-row hiding rule (chat.js: hide_first_user_row):
// the first user delimiter row is hidden ONLY when the item text begins with its name tag and
// nothing but whitespace stands between that tag and the first `<<user...>>` delimiter line.
//
// run: node external/mind.items/tests/chat_first_user_row_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const src = fs.readFileSync(path.join(__dirname, '..', 'chat.js'), 'utf8')
const pick = (pattern) => {
  const found = src.match(pattern)
  if (!found) throw new Error(`chat.js lacks ${pattern}`)
  return found[0]
}

const hide_src = pick(/\nfunction hide_first_user_row\([^\n]*\) \{[\s\S]*?\n\}\n/)
const delim_src = pick(/\nconst _delimiter = [\s\S]*?\n\}\n/)
const html_tmpl = fs.readFileSync(path.join(__dirname, '..', 'chat.html'), 'utf8')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

const ctx = {}
vm.createContext(ctx)
vm.runInContext(hide_src, ctx)

const hide = (text, name) => vm.runInContext('hide_first_user_row', ctx)(text, name)

// chat.js, chat.css and chat.html are embedded in the #chat item's own text, where the app
// expands every macro opener that no backslash escapes, also inside a code block (2026-11-23: an
// unescaped one in a comment broke the item's page on the owner's account): each file must hold none
for (const file of ['chat.js', 'chat.css', 'chat.html']) {
  const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  check(`${file} holds no unescaped macro opener`, (text.match(/(?<!\\)<</g) ?? []).length, 0)
}
check('name alone on line one, user delimiter on line two: hidden', hide('#chat/vault/1\n<<user>> hi\n', '#chat/vault/1'), true)
check('blank lines between name and delimiter: hidden', hide('#chat/vault/1\n\n  \n\t\n<<user>> hi\n', '#chat/vault/1'), true)
check('trailing spaces and CRLF before user delimiter: hidden', hide('#chat/vault/1   \r\n  << user >> hi\n', '#chat/vault/1'), true)
check('mixed-case label matches case-insensitively: hidden', hide('#chat/vault/Upper\n<<user>> hi\n', '#chat/vault/Upper'), true)
check('empty user message followed by agent row: hidden', hide("#chat/vault/1\n<<user>>\n<<agent('bot')>> reply\n", '#chat/vault/1'), true)
check('empty user message alone: hidden', hide('#chat/vault/1\n<<user>>', '#chat/vault/1'), true)
check('hidden tags after name on the name line (a chat the app starts): hidden', hide('#chat/vault/1 #_agent/vault\n<<user>> hi\n', '#chat/vault/1'), true)
check('two hidden tags after name (a task chat): hidden', hide('#todo/0 #_chat #_autodep\n<<user>> what now?\n', '#todo/0'), true)
check('a hidden tag on a line of its own between them (hidden tags count on the name line alone): stays', hide('#chat/vault/1\n#_agent/vault\n<<user>> hi\n', '#chat/vault/1'), false)
check('a visible tag after name on the name line: stays', hide('#chat/vault/1 #todo\n<<user>> hi\n', '#chat/vault/1'), false)
check('text after name on the name line: stays', hide('#chat/vault/1 quick note\n<<user>> hi\n', '#chat/vault/1'), false)
check('text glued to a hidden-looking tag (not a tag): stays', hide('#chat/vault/1 x#_agent/vault\n<<user>> hi\n', '#chat/vault/1'), false)
check('same-line user macro after name (not a delimiter line): stays', hide('#chat/vault/1 <<user>> hi\n', '#chat/vault/1'), false)
check('indented 4 spaces (markdown code block, not delimiter): stays', hide('#chat/vault/1\n    <<user>> hi\n', '#chat/vault/1'), false)
check('a line of text between name and delimiter: stays', hide('#chat/vault/1\nhello\n<<user>> hi\n', '#chat/vault/1'), false)
check('a style block after the label on the first line: stays', hide('#chat/vault/1 <style>h1{color:red}</style>\n<<user>> hi\n', '#chat/vault/1'), false)
check('an html comment between them: stays', hide('#chat/vault/1\n<!-- comment -->\n<<user>> hi\n', '#chat/vault/1'), false)
check('an inert block between them: stays', hide('#chat/vault/1\n<!--inert-->\nhi\n<!--/inert-->\n<<user>> hi\n', '#chat/vault/1'), false)
check('another role row before first user row: stays', hide("#chat/vault/1\n<<agent('bot')>> hi\n<<user>> later\n", '#chat/vault/1'), false)
check('uppercase USER macro before lowercase user: stays', hide('#chat/vault/1\n<<USER>> hi\n<<user>> later\n', '#chat/vault/1'), false)
check('text does not start with its name tag: stays', hide('intro\n#chat/vault/1\n<<user>> hi\n', '#chat/vault/1'), false)
check('name is a prefix of another tag token: stays', hide('#chat/vault/10\n<<user>> hi\n', '#chat/vault/1'), false)
check('unlabeled item (empty name): stays', hide('<<user>> hi\n', ''), false)
// what review 0 found: text that shows, taken for hidden tags or for the delimiter
check('a second tag glued to a hidden tag (the app draws the text as it stands): stays', hide('#chat/0\n\n#_chat#topic\n\n<<user>> hello\n', '#chat/0'), false)
check('a hidden tag indented into a code block: stays', hide('#chat/0\n\n    #_chat\n\n<<user>> hello\n', '#chat/0'), false)
check('a user macro with an argument draws no user row, text after it shows: stays', hide('#chat/0\n<<user("x)>>\ntopic\n<<user>> hello\n', '#chat/0'), false)
check('hidden tags and the delimiter on one later line: stays', hide('#chat/0\n#_agent/vault <<user>> hi\n', '#chat/0'), false)
check('hidden tags on the name line, then blank lines of spaces and a tab: hidden', hide('#chat/0 #_a #_b/c\n   \n\t\n<<user>> hi\n', '#chat/0'), true)
// what review 1 found: a tag the app draws as text after a line of four spaces, and a bar in a tag
check('a line of four spaces, then a hidden tag on a line of its own (the app draws it as text): stays', hide('#chat/0\n    \n#_chat\n\n<<user>> hello', '#chat/0'), false)
check('a line of three spaces, then a hidden tag on a line of its own: stays too', hide('#chat/0\n   \n#_chat\n\n<<user>> hello', '#chat/0'), false)
check('a line of four spaces alone between the name line and the delimiter: hidden', hide('#chat/0 #_chat\n    \n<<user>> hello', '#chat/0'), true)
check('a second tag glued to a hidden tag on the name line: stays', hide('#chat/0 #_chat#topic\n<<user>> hi\n', '#chat/0'), false)
check('a hidden tag holding a box-drawing bar on the name line (the app draws the bar): stays', hide('#chat/0 #_pin/a\u2502b\n<<user>> hi\n', '#chat/0'), false)
check('no line after the name line: stays', hide('#chat/0 #_chat', '#chat/0'), false)

// _delimiter integration: reads raw _this.text and _this.label (not _name / read()),
// and marks only the first macro (macro_0) as hideFirstUserRow
const render_delim = ({ role = 'user', text, label, name = label || 'id:1', trigger, read_val = text, arg }) => {
  const c = {
    is_string: x => typeof x === 'string',
    html: s => s,
    _item: () => ({ read: () => html_tmpl }),
    read: () => read_val,
    _name: name,
    _this: { text, label },
    ...(trigger !== undefined ? { __trigger: trigger } : {}),
  }
  vm.createContext(c)
  vm.runInContext(hide_src + '\n' + delim_src, c)
  return vm.runInContext(`_delimiter(${JSON.stringify(role)}${arg === undefined ? '' : ', ' + JSON.stringify(arg)})`, c)
}

check(
  '_delimiter: first macro marks hideFirstUserRow and uses _this.label even when _name is id:... (duplicate label)',
  render_delim({ text: '#chat/dup\n<<user>> hi', label: '#chat/dup', name: 'id:99', trigger: 'macro_0' }).includes(
    'class="message user hideFirstUserRow"'
  ),
  true
)
check(
  '_delimiter: later user macro (macro_2) is NOT marked hideFirstUserRow',
  render_delim({ text: '#chat/1\n<<user>> a\n<<agent>> b\n<<user>> c', label: '#chat/1', trigger: 'macro_2' }).includes(
    'class="message user"'
  ),
  true
)
check(
  '_delimiter: agent role at macro_0 is never marked hideFirstUserRow',
  render_delim({ role: 'agent', text: '#chat/1\n<<user>> a', label: '#chat/1', trigger: 'macro_0' }).includes(
    'class="message agent"'
  ),
  true
)
check(
  '_delimiter: reads raw _this.text rather than a modified read() grammar view',
  render_delim({
    text: '#chat/1\n<!-- comment -->\n<<user>> a',
    read_val: '#chat/1\n<<user>> a',
    label: '#chat/1',
    trigger: 'macro_0',
  }).includes('class="message user"'),
  true
)

check(
  '_delimiter: an evaluation without a trigger draws no row of the item: not marked',
  render_delim({ text: '#chat/1\n<<user>> a', label: '#chat/1' }).includes('class="message user"'),
  true
)
check(
  "_delimiter: a name that holds the template's state word keeps it, in the label and the tooltip",
  (
    render_delim({ role: 'agent', arg: 'build %state', text: '#chat/1\n<<user>> a', label: '#chat/1', trigger: 'macro_1' }).match(
      /build %state/g
    ) ?? []
  ).length,
  (html_tmpl.match(/%name/g) ?? []).length
)

// chat.css role-row rules in chats the bridge answers (2026-11-24): inside the trial look's scope
// `.dep_chat > .content:has(.vault-result)` and in no wider scope, role-row headers set `.label`
// font-size to 80% and `.message` margin-top to 5px
{
  const css = fs
    .readFileSync(path.join(__dirname, '..', 'chat.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const splitTopLevel = str => {
    const out = []
    let depth = 0
    let start = 0
    for (let i = 0; i < str.length; i++) {
      if (str[i] === '(') depth++
      else if (str[i] === ')') depth = Math.max(0, depth - 1)
      else if (str[i] === ',' && depth === 0) {
        out.push(str.slice(start, i))
        start = i + 1
      }
    }
    out.push(str.slice(start))
    return out
  }
  const rules = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = splitTopLevel(m[1])
      .map(s => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
    const decls = m[2]
      .split(';')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => {
        const i = d.indexOf(':')
        return i < 0 ? null : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim().replace(/\s+/g, ' ')]
      })
      .filter(Boolean)
    for (const sel of selectors) rules.push({ sel, decls })
  }
  const SCOPE = '.dep_chat > .content:has(.vault-result)'
  const inScope = sel => sel === SCOPE || sel.startsWith(`${SCOPE} `) || sel.startsWith(`${SCOPE}>`)
  const hasDecl = (r, prop, val) => r.decls.some(([p, v]) => p === prop && (val === undefined || v === val))
  const tailOf = sel => sel.split(/[\s>]+/).at(-1) ?? ''
  const targetsLabel = sel => /(?:^|\.)label(?=$|[:.[])/.test(tailOf(sel))
  const targetsMessageRow = sel => {
    const tail = tailOf(sel)
    return !tail.startsWith('code') && /(?:^|\.)message(?=$|[:.[])/.test(tail)
  }

  check(
    'chat.css: role row label font-size is 80% in inert-chat scope (.dep_chat > .content:has(.vault-result))',
    rules.some(r => r.sel === `${SCOPE} .message .label` && hasDecl(r, 'font-size', '80%')),
    true
  )
  check(
    'chat.css: role row top margin is 5px in inert-chat scope (.dep_chat > .content:has(.vault-result))',
    rules.some(r => r.sel === `${SCOPE} .message` && hasDecl(r, 'margin-top', '5px')),
    true
  )
  check(
    'chat.css: no wider-scope rule sets role row label font-size or role row top margin',
    {
      labelWider: rules
        .filter(r => targetsLabel(r.sel) && hasDecl(r, 'font-size') && !inScope(r.sel))
        .map(r => r.sel),
      rowMarginWider: rules
        .filter(r => targetsMessageRow(r.sel) && (hasDecl(r, 'margin-top') || hasDecl(r, 'margin')) && !inScope(r.sel))
        .map(r => r.sel),
    },
    { labelWider: [], rowMarginWider: [] }
  )
}

console.log(failures ? `${failures} failures` : 'all checks passed')
process.exit(failures ? 1 : 0)
