#!/usr/bin/env node
// plain-node table for the web chat responder's vault fences (agent/chat.js): the item-aware
// ownership decision `vault_routed_item` (the app's direct-chat dependency rule, hidden references
// included) and the responder boundaries run through the REAL run_on_dependents/run_on_chat_item
// over stubs of the app's items and a fake provider: a chained item under a vault-routed chat, by
// name or by a hidden chat reference, is never answered by a web provider; an inherited route that
// appears during an outstanding provider call fences the reply and the error log (vault design
// mind_vault_item section 13). run: node external/mind.items/tests/agent_chat_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const source = fs.readFileSync(path.join(__dirname, '..', 'agent', 'chat.js'), 'utf8')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// the app's items: id, name (= label), text, dependencies (ids, the closure the app resolves,
// with the chat config item first for chat items), hidden tags, dependents; the responder's
// item surface (running, status, eval of the provider, writes, logs)
const items = {}
const log = { provider: [], writes: [], errors: [], debug: [], warn: [] }
let provider_gate = null // when set, the fake provider awaits it (a call outstanding)
const add = (id, name, text, { deps = [], hidden = [], dependents = [] } = {}) =>
  (items[id] = {
    id,
    name,
    label: name,
    text,
    dependencies: deps,
    tags_hidden: hidden,
    dependents,
    running: false,
    status: '',
    editing: false,
    read_deep: () => null,
    eval: async name => {
      if (name !== 'run_chat_agent') throw new Error('unexpected eval ' + name)
      return async (messages, config) => {
        log.provider.push({ item: id, n: messages.length })
        if (provider_gate) await provider_gate
        return `\<<agent('web')>> web answer`
      }
    },
    eval_macros: text => text,
    write: (text, _sel) => log.writes.push({ item: id, text }),
    save: async () => {},
    error: e => log.errors.push({ item: id, message: String(e) }),
    write_log: () => {},
  })
// chat items: the closure begins with the #chat item (the app's is_chat_item rule, stubbed by
// a `chat` marker at the head of the dependencies)
const chat = 'chat-id'
add('agent-id', '#agent/gpt', '#agent/gpt', { dependents: [] })
add('cmd-id', '#chat/vault', '#chat/vault #_agent/vault\ncommand item', { deps: [chat] })
add('vault0-id', '#chat/vault/0', '#chat/vault/0\n<<user>> first', { deps: [chat, 'cmd-id'] })
add('vault00-id', '#chat/vault/0/0', '#chat/vault/0/0\n<<user>> chained', { deps: [chat, 'cmd-id', 'vault0-id'] })
add('gpt3-id', '#chat/gpt/3', '#chat/gpt/3 #_agent/vault\n<<user>> migrated to the vault', { deps: [chat, 'agent-id'] })
add('gpt30-id', '#chat/gpt/3/0', '#chat/gpt/3/0\n<<user>> chained by name', { deps: [chat, 'agent-id', 'gpt3-id'] })
add('work-id', '#work', '#work #_chat/gpt/3\n<<user>> continued by a hidden reference', { deps: [chat, 'agent-id', 'gpt3-id'], hidden: ['#chat/gpt/3'] })
add('gpt4-id', '#chat/gpt/4', '#chat/gpt/4\n<<user>> a plain web chat', { deps: [chat, 'agent-id'] })
add('gpt40-id', '#chat/gpt/4/0', '#chat/gpt/4/0\n<<user>> chained under it', { deps: [chat, 'agent-id', 'gpt4-id'] })
// label casing: the app's item.label is case-preserving while hidden tags are lowercase and the
// bridge resolves lowercase labels; the fence compares normalized identities
add('GPT6-id', '#chat/GPT/6', '#chat/GPT/6 #_agent/vault\n<<user>> migrated, uppercase label', { deps: [chat, 'agent-id'] })
add('work6-id', '#work6', '#work6 #_chat/gpt/6\n<<user>> continued by a lowercase hidden reference', { deps: [chat, 'agent-id', 'GPT6-id'], hidden: ['#chat/gpt/6'] })
add('gpt7-id', '#chat/gpt/7', '#chat/gpt/7 #_agent/vault\n<<user>> migrated, lowercase label', { deps: [chat, 'agent-id'] })
add('GpT70-id', '#chat/GpT/7/0', '#chat/GpT/7/0\n<<user>> chained with a differently cased prefix', { deps: [chat, 'agent-id', 'gpt7-id'] })
add('amb-id', '#chat/gpt/5', '#chat/gpt/5 #_chat/gpt/3 #_chat/gpt/4\n<<user>> two chat parents', { deps: [chat, 'agent-id', 'gpt3-id', 'gpt4-id'], hidden: ['#chat/gpt/3', '#chat/gpt/4'] })
items['agent-id'].dependents = ['gpt3-id', 'gpt30-id', 'work-id', 'gpt4-id', 'gpt40-id', 'amb-id', 'GPT6-id', 'work6-id', 'gpt7-id', 'GpT70-id']
const env = {
  window: { _grammar: { version: 2, routed: text => /#_?agent\/(vault|native)(\/|\b)/i.test(text) } },
  _item: (key, _opts) => items[key] ?? Object.values(items).find(i => i.name === key) ?? null,
  is_chat_item: item => !!item && item.dependencies[0] === chat,
  parse_messages: item => [{ role: 'user', content: item.text.split('\n').pop().replace(/^<<user>> ?/, '') }],
  fatal: msg => { throw new Error('fatal: ' + msg) },
  debug: msg => log.debug.push(msg),
  warn: msg => log.warn.push(msg),
  is_string: v => typeof v === 'string',
  last: a => a[a.length - 1],
  empty: v => !v || (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0),
  each: (a, f) => a.forEach(f),
  merge: (o, v) => Object.assign(o, v ?? {}),
  remove: (a, f) => { for (let i = a.length - 1; i >= 0; i--) if (f(a[i])) a.splice(i, 1) },
  attach: p => p, // the app's task attachment: the promise (or the wrapped function) as is
  _delay: async () => {},
  _update_dom: async () => {},
  block: (t, s) => s,
  stringify: v => JSON.stringify(v),
  _name: '#agent/gpt',
  _this: null,
  console,
}
env._this = items['agent-id']
const ctx = vm.createContext(env)
vm.runInContext(source, ctx)
const routed = id => vm.runInContext(`vault_routed_item(_item(${JSON.stringify(id)}))`, ctx)
check('the tagged command item routes by its own text', routed('cmd-id'), true)
check('an untagged first item under the command inherits (immediate label prefix)', routed('vault0-id'), true)
check('a chained item two levels down inherits', routed('vault00-id'), true)
check('a migrated /gpt chat with the vault tag routes', routed('gpt3-id'), true)
check('its chained child inherits by name', routed('gpt30-id'), true)
check('a continuation by a HIDDEN chat reference (#work #_chat/gpt/3) inherits', routed('work-id'), true)
check('a plain web chat does not route', routed('gpt4-id'), false)
check('nor does its chained child', routed('gpt40-id'), false)
check('two direct chat dependencies: ambiguous, fails closed toward the vault', routed('amb-id'), true)
check('an uppercase parent label with a lowercase hidden reference inherits (normalized identity)', routed('work6-id'), true)
check('a child whose label prefix is cased differently from its parent inherits', routed('GpT70-id'), true)

;(async () => {
  // the dispatch boundary: run_on_dependents over the web agent's dependents answers only the
  // web-owned chats; the vault-owned ones (own tag, chained by name, by hidden reference) and the
  // ambiguous one get no provider call
  await vm.runInContext('run_on_dependents(_this)', ctx)
  check('the web provider answered the plain chat and its child only', log.provider.map(c => c.item).sort(), ['gpt4-id', 'gpt40-id'])
  check('the vault-owned dependents were skipped with a debug line each (the casing variants included)', log.debug.length, 8)
  check('the replies were written to the web-owned chats only', log.writes.map(w => w.item).sort(), ['gpt4-id', 'gpt40-id'])
  check('nothing marked running afterwards', Object.values(items).some(i => i.running), false)
  // the completion boundary: a call outstanding when the route appears through the parent
  log.provider.length = log.writes.length = log.warn.length = 0
  let release
  provider_gate = new Promise(r => (release = r))
  const run = vm.runInContext("run_on_chat_item(_item('gpt40-id'))", ctx)
  await new Promise(r => setTimeout(r, 0))
  check('the provider call is outstanding', log.provider.length, 1)
  items['gpt4-id'].text = '#chat/gpt/4 #_agent/vault\n<<user>> a plain web chat' // the owner routes the parent to the vault
  release()
  await run
  check('the reply of a now-vault-routed (inherited) item is dropped, with a warning', [log.writes.length, log.warn.some(w => w.includes('dropping web reply'))], [0, true])
  // the error boundary: the provider fails after the route appeared through the parent
  // during its outstanding call
  items['gpt4-id'].text = '#chat/gpt/4\n<<user>> a plain web chat' // web-owned again
  provider_gate = new Promise(r => (release = r))
  items['gpt40-id'].eval = async () => async () => {
    log.provider.push({ item: 'gpt40-id', n: 1 })
    await provider_gate
    throw new Error('provider down')
  }
  const failing = vm.runInContext("run_on_chat_item(_item('gpt40-id'))", ctx)
  await new Promise(r => setTimeout(r, 0))
  items['gpt4-id'].text = '#chat/gpt/4 #_agent/vault\n<<user>> a plain web chat' // routed meanwhile
  release()
  await failing
  check('the error log of a now-vault-routed item is dropped, not written', [log.errors.length, log.warn.some(w => w.includes('dropping web error log'))], [0, true])
  // the same failure on a web-owned item is logged (the fence is specific)
  items['gpt4-id'].text = '#chat/gpt/4\n<<user>> a plain web chat'
  provider_gate = null
  await vm.runInContext("run_on_chat_item(_item('gpt40-id'))", ctx)
  check('a web-owned item still gets its error log', log.errors.length, 1)
  if (failures) {
    console.log(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log('all checks passed')
})()
