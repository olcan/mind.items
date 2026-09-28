#!/usr/bin/env node
// plain-node table for the #chat item's header click (chat.js: _delete_agent_messages_below):
// a click on a role header removes every message below it and reruns the chat from the kept
// last user message, a destructive rewrite the owner CONFIRMS first (2026-09-27): Cancel writes
// nothing, OK writes the truncation through the app's grammar seam, a header with nothing
// below it only alerts (no confirm), and a page without the grammar seam asks for a reload.
// run: node external/mind.items/tests/chat_truncate_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const src = fs.readFileSync(path.join(__dirname, '..', 'chat.js'), 'utf8')
const pick = (pattern) => {
  const found = src.match(pattern)
  if (!found) throw new Error(`chat.js lacks ${pattern}`)
  return found[0]
}
const truncate_src = pick(/\nasync function _delete_agent_messages_below\([^\n]*\) \{[\s\S]*?\n\}\n/)
const regex_src = pick(/\nconst _message_regex =\n[^\n]*\n/)
const parse_src = pick(/\nfunction parse_messages\([^\n]*\) \{[\s\S]*?\n\}\n/)
const direct_src = pick(/\nconst is_direct_chat_dep = [\s\S]*?\n\n/)
const descendants_src = pick(/\nfunction inheriting_chats\([^\n]*\) \{[\s\S]*?\n\}\n/)
const count_src = pick(/\nconst own_message_count = [^\n]*\n/)

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

const TEXT = '#chat/vault/1 #_agent/vault\n<<user>> first\n<<agent>>\nreply\n<<user>> second\n<<agent>>\nlater\n'

// a page: the item's text, the rendered message divs, the modals answered by script (an answer
// may be a function of the environment: a deferred confirmation that mutates the live item
// first), the writes
const page = ({ text = TEXT, answers = [], grammar = { version: 2, edit: (text, fn) => fn(text) } } = {}) => {
  const log = { confirms: [], alerts: [], writes: [] }
  const messages = Array.from(text.matchAll(/(?:^|\n) *<< *(system|user|_?agent|tool)/g), (m, i) => ({ index: i }))
  messages.forEach(m => (m.isSameNode = other => other === m))
  const content = { querySelectorAll: () => messages }
  // the chat's dependents: chat items (continuations by the direct rule: a label prefix or a
  // hidden tag naming the parent; a chat depending some other way) and a plain item; each
  // with its own text; deletions recorded
  const kids = {}
  const kid = (id, label, chat, deps, own = '<<user>> deeper\n', hidden = []) =>
    (kids[id] = { id, name: label, label, dependencies: deps, tags_hidden: hidden, text: own, read() { return this.text }, delete: confirm => log.deletes.push([id, confirm]), chat })
  log.deletes = []
  const env = {
    console, JSON,
    _this: { id: 'self', label: '#chat/vault/1', text, dependents: [], tags_hidden: [] },
    _item: (id, _opts) => (id === 'self' ? env._this : kids[id] ?? null),
    is_chat_item: item => !!item?.chat,
    kid,
    read: () => text,
    write: (out, ...rest) => log.writes.push([out, ...rest]),
    fatal: (...m) => { throw new Error(m.join(' ')) },
    find_index: (xs, f) => xs.findIndex(f),
    defined: x => x !== undefined, is_string: x => typeof x === 'string', is_item: () => false,
    lower: x => x.toLowerCase(), each: (a, f) => { a.forEach((x, i) => f(x, i, a)); return a },
    is_plain_object: x => x !== null && typeof x === 'object', equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    __eval: x => x,
    _modal_alert: msg => log.alerts.push(msg),
    _modal_confirm: async msg => {
      log.confirms.push(msg)
      const answer = answers.shift()
      return typeof answer === 'function' ? answer(env) : (answer ?? false)
    },
    window: { _grammar: grammar },
  }
  const ctx = vm.createContext(env)
  vm.runInContext(regex_src + parse_src + direct_src + descendants_src + count_src + truncate_src, ctx)
  const click = index => {
    const message = messages[index]
    const event = {
      preventDefault() {}, stopPropagation() {},
      target: { closest: sel => (sel === '.message' ? message : content) },
    }
    return vm.runInContext('_delete_agent_messages_below', ctx)(event)
  }
  return { click, log, env }
}

;(async () => {
  // Cancel on the first agent header (index 1): the confirm names the count and the kept role, nothing is written
  let p = page({ answers: [false] })
  await p.click(1)
  check('cancel: one confirm, no write', [p.log.confirms, p.log.writes, p.log.alerts], [
    ['Remove 3 messages below this user message? The chat continues from there.'], [], [],
  ])
  // OK: the truncation is written through the grammar seam, the text ending at the kept message
  p = page({ answers: [true] })
  await p.click(1)
  check('ok: the write after the confirm', p.log.writes, [['#chat/vault/1 #_agent/vault\n<<user>> first', '']])
  // a user header (index 2, "second"): everything BELOW it goes (its reply), the header itself stays
  p = page({ answers: [true] })
  await p.click(2)
  check('a user header keeps itself', [p.log.confirms, p.log.writes], [
    ['Remove 1 message below this user message? The chat continues from there.'],
    [['#chat/vault/1 #_agent/vault\n<<user>> first\n<<agent>>\nreply\n<<user>> second', '']],
  ])
  // the last header (index 3, a reply): the reply itself is removed after a confirm naming the user message kept above it
  p = page({ answers: [true] })
  await p.click(3)
  check('the last reply removed', [p.log.confirms, p.log.writes.length], [
    ['Remove 1 message below this user message? The chat continues from there.'], 1,
  ])
  // nothing below the last user message: an alert, no confirm, no write
  p = page({ text: '#chat/vault/1 #_agent/vault\n<<user>> first', answers: [true] })
  await p.click(0)
  check('nothing below: alert only', [p.log.alerts, p.log.confirms, p.log.writes], [['nothing to remove below this message'], [], []])
  // no grammar seam (a stale tab): the reload alert before any dialog, nothing written
  p = page({ answers: [true], grammar: null })
  await p.click(1)
  check('no grammar seam: reload asked, no confirm, no write', [p.log.confirms.length, p.log.alerts, p.log.writes], [
    0, ['please reload to delete messages (app update required)'], [],
  ])
  // the dialog is an await boundary (review 0 P1): the chat changed meanwhile (a message
  // inserted by another tab, a reply removed, a same-count edit inside a message) -> the
  // write is refused with an alert, the owner clicks again; the index was decided over the
  // text the dialog asked about, never applied to a different text
  const changed = 'the chat changed while the dialog was open; click the header again'
  const mutations = {
    'inserted': env => { env._this.text = '#chat/vault/1 #_agent/vault\n<<system>> rules\n' + TEXT.split('\n').slice(1).join('\n'); return true },
    'removed': env => { env._this.text = TEXT.replace('<<agent>>\nlater\n', ''); return true },
    'same count': env => { env._this.text = TEXT.replace('reply', 'reply edited'); return true },
  }
  for (const [name, mutate] of Object.entries(mutations)) {
    p = page({ answers: [mutate] })
    await p.click(2)
    check(`deferred confirm, ${name}: refused, no write`, [p.log.confirms.length, p.log.alerts, p.log.writes], [1, [changed], []])
  }
  p = page({ answers: [env => { env._this.text = TEXT; return true }] }) // rewritten to the same text: unchanged, written
  await p.click(2)
  check('deferred confirm, the same text: written', p.log.writes.length, 1)
  // the item deleted while the dialog is open (review 1): its id no longer resolves and its
  // text getter throws, as the app's does; a deletion notice, no write, no throw
  p = page({ answers: [env => {
    env._item = id => (id === 'self' ? null : null)
    Object.defineProperty(env._this, 'text', { get() { throw new Error('item self not found') } })
    return true
  }] })
  await p.click(2)
  check('deleted meanwhile: notice, no write', [p.log.alerts, p.log.writes], [['the chat was deleted while the dialog was open'], []])
  // the inheriting chats (the owner, 2026-09-27): the descendant chat items carrying this
  // transcript, the removed messages included, as their prefix, transitively (deleted after
  // the parent's accepted write, in the deepest-first order fixed before it) (a child by label prefix, a grandchild, a child by a hidden tag from
  // another label), each with its own message count and the total, deleted deepest first
  // after the parent's write; a plain item and a chat depending some other way (through a note) are
  // left alone
  p = page({ answers: [true] })
  p.env.kid('c1', '#chat/vault/1/0', true, ['x', 'self'], '<<user>> deeper\n<<agent>>\nreply\n')
  p.env.kid('c2', '#chat/vault/1/0/0', true, ['x', 'self', 'c1'], '<<user>> deepest\n')
  p.env.kid('e1', '#elsewhere', true, ['x', 'self'], '<<user>> from elsewhere\n', ['#chat/vault/1'])
  p.env.kid('n1', '#note', false, ['x', 'self'])
  p.env.kid('o1', '#chat/other', true, ['x', 'self', 'n1'], '<<user>> other\n', ['#note'])
  p.env._this.dependents = ['o1', 'c1', 'n1', 'c2', 'e1']
  await p.click(1)
  check('continuations named with their counts and deleted deepest first', [p.log.confirms, p.log.deletes, p.log.writes.length], [
    ['Remove 3 messages below this user message, and the 3 chats below it inheriting them (#chat/vault/1/0 with 2 messages, #chat/vault/1/0/0 with 1 message, #elsewhere with 1 message)? 7 messages in total. The chat continues from there.'],
    [['c2', false], ['c1', false], ['e1', false]],
    1,
  ])
  p = page({ answers: [true] })
  p.env.kid('c1', '#chat/vault/1/0', true, ['x', 'self'])
  p.env._this.dependents = ['c1']
  await p.click(3)
  check('one continuation: singular wording and the total', p.log.confirms, ['Remove 1 message below this user message, and the chat below it inheriting them (#chat/vault/1/0 with 1 message)? 2 messages in total. The chat continues from there.'])
  // a continuation created while the dialog is open: refused, nothing deleted or written
  const changed_below = 'the chats below this one changed while the dialog was open; click the header again'
  p = page({ answers: [env => { env.kid('c9', '#chat/vault/1/1', true, ['x', 'self']); env._this.dependents = ['c9']; return true }] })
  await p.click(1)
  check('a continuation appeared meanwhile: refused', [p.log.alerts, p.log.deletes, p.log.writes], [[changed_below], [], []])
  // the continuations' CONTENTS are what the owner confirmed (review 2 P1): a reply arriving in
  // a child, or a same-count edit in it, while the dialog is open refuses everything
  for (const [name, mutate] of Object.entries({
    'a reply appended to a child': env => { env._item('c1').text += '<<agent>>\nlate reply\n'; return true },
    'a same-count edit in a child': env => { env._item('c1').text = '<<user>> deeper, edited\n'; return true },
  })) {
    p = page({ answers: [mutate] })
    p.env.kid('c1', '#chat/vault/1/0', true, ['x', 'self'])
    p.env._this.dependents = ['c1']
    await p.click(1)
    check(`${name} meanwhile: refused`, [p.log.alerts, p.log.deletes, p.log.writes], [[changed_below], [], []])
  }
  // the parent's write comes FIRST (review 2 P1): declined (the app's own large-write prompt,
  // read-only mode), nothing is deleted; a failing transformation deletes nothing either
  p = page({ answers: [true] })
  p.env.kid('c1', '#chat/vault/1/0', true, ['x', 'self'])
  p.env._this.dependents = ['c1']
  p.env.write = (out, ...rest) => { p.log.writes.push([out, ...rest]); return false }
  await p.click(1)
  check('a declined parent write: no deletion', [p.log.writes.length, p.log.deletes], [1, []])
  p = page({ answers: [true], grammar: { version: 2, edit: () => { throw new Error('transform failed') } } })
  p.env.kid('c1', '#chat/vault/1/0', true, ['x', 'self'])
  p.env._this.dependents = ['c1']
  let thrown = null
  try { await p.click(1) } catch (e) { thrown = e.message }
  check('a failing transformation: no side effect', [thrown, p.log.writes, p.log.deletes], ['transform failed', [], []])
  // labels resolve case-insensitively (review 2 P2): both kinds of continuation under a
  // mixed-case parent; and a grandchild listed before its parent among the candidates
  p = page({ answers: [true] })
  p.env._this.label = '#Chat/Vault/1'
  p.env.kid('c1', '#chat/vault/1/0', true, ['x', 'self'])
  p.env.kid('e1', '#Elsewhere', true, ['x', 'self'], '<<user>> from elsewhere\n', ['#chat/vault/1'])
  p.env.kid('c2', '#CHAT/vault/1/0/0', true, ['x', 'self', 'c1'])
  p.env._this.dependents = ['c2', 'e1', 'c1'] // the grandchild first
  await p.click(1)
  check('mixed-case labels and a grandchild first: all three inherit, the grandchild deleted first', [p.log.deletes[0], p.log.deletes.map(d => d[0]).sort(), p.log.writes.length], [['c2', false], ['c1', 'c2', 'e1'], 1])
  console.log(failures ? `${failures} FAILED` : 'all ok')
  process.exit(failures ? 1 : 0)
})()
