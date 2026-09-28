#!/usr/bin/env node
// plain-node table for the #agent framework's reaction to a local item change (agent.js:
// _on_item_change): the LAST agent dependency of a directly modified non-agent item is started
// (or continued when active); an agent item WITHOUT a js_input block is passive and never
// started that way (2026-09-27: #agent/vault, the doc item of the vault provider, surfaced
// under every saved vault chat), with no fallback to an earlier (parent) agent dependency; a
// passive provider ahead of an ordinary last one leaves the ordinary one started; a block with
// content is an ordinary provider; a remote change and a dependency-propagated change start
// nothing.
// run: node external/mind.items/tests/agent_policy_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const src = fs.readFileSync(path.join(__dirname, '..', 'agent.js'), 'utf8')
const fn_src = src.match(/\nfunction _on_item_change\([^\n]*\) \{[\s\S]*?\n\}\n/)
if (!fn_src) throw new Error('agent.js lacks _on_item_change')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// the page: items by id with their dependency closure, whether each is an agent item and the
// js_input block it reads; the framework's calls recorded
const page = ({ items, active = [] }) => {
  const log = { starts: [], stops: [], debug: [], warn: [], error: [] }
  const env = {
    _item: (id, _options) => items[id] ?? null,
    __item: id => (items[id] ? { id, tasks: {} } : null),
    __agent: { _global_store: { agents: Object.fromEntries(active.map(name => [name, 'a1'])) } },
    __items: [],
    _primary: true,
    is_agent_item: item => !!item?.agent,
    agent_active: name => active.includes(name),
    start_agent: (name, id) => log.starts.push([name, id ?? null]),
    stop_agent: name => log.stops.push(name),
    debug: m => log.debug.push(m),
    warn: m => log.warn.push(m),
    error: m => log.error.push(m),
  }
  const ctx = vm.createContext(env)
  vm.runInContext(fn_src[0], ctx)
  const change = (id, { remote = false, dependency = false, deleted = false } = {}) =>
    vm.runInContext('_on_item_change', ctx)(id, items[id]?.name ?? null, null, deleted, remote, dependency)
  return { change, log }
}
const agent = (name, js = 'run()', extra = {}) => ({ name, agent: true, dependencies: [], read: type => (type === 'js_input' ? js : ''), store: {}, ...extra })
const item = (name, deps) => ({ name, agent: false, dependencies: deps, read: () => '' })

const PASSIVE = '' // no js_input block

// an ordinary provider as the last agent dependency: started (continued when active)
let p = page({ items: { root: agent('#agent'), prov: agent('#agent/x'), chat: item('#chat/x/0', ['root', 'prov']) } })
p.change('chat')
check('ordinary last provider: started', p.log.starts, [['#agent/x', null]])
p = page({ items: { root: agent('#agent'), prov: agent('#agent/x', 'run()', { store: { agent: { id: 'a1' } } }), chat: item('#chat/x/0', ['root', 'prov']) }, active: ['#agent/x'] })
p.change('chat')
check('active last provider: continued with its id', p.log.starts, [['#agent/x', 'a1']])
// the passive provider last: suppressed, and NO fallback to the earlier #agent dependency
p = page({ items: { root: agent('#agent'), vault: agent('#agent/vault', PASSIVE), chat: item('#chat/vault/0', ['root', 'vault']) } })
p.change('chat')
check('passive last provider: nothing started', p.log.starts, [])
check('passive last provider: said once', p.log.debug, ['not starting agent #agent/vault for modified dependent #chat/vault/0 (no js_input block)'])
// a passive provider AHEAD of an ordinary last one: the last one starts
p = page({ items: { root: agent('#agent'), vault: agent('#agent/vault', PASSIVE), prov: agent('#agent/x'), chat: item('#chat/y', ['root', 'vault', 'prov']) } })
p.change('chat')
check('passive then ordinary: the ordinary last one starts, nothing suppressed', [p.log.starts, p.log.debug.filter(m => /not starting/.test(m))], [[['#agent/x', null]], []])
// a block with content, a comment included, is an ordinary provider
p = page({ items: { root: agent('#agent'), vault: agent('#agent/vault', '// a comment only\n'), chat: item('#chat/vault/0', ['root', 'vault']) } })
p.change('chat')
check('a block with content starts', p.log.starts, [['#agent/vault', null]])
// a whitespace-only block is no block (the framework's own .trim())
p = page({ items: { root: agent('#agent'), vault: agent('#agent/vault', '  \n\t\n'), chat: item('#chat/vault/0', ['root', 'vault']) } })
p.change('chat')
check('a whitespace-only block: passive', p.log.starts, [])
// a remote change, and a change propagated as a dependency: nothing started
p = page({ items: { root: agent('#agent'), prov: agent('#agent/x'), chat: item('#chat/x/0', ['root', 'prov']) } })
p.change('chat', { remote: true })
p.change('chat', { dependency: true })
check('remote or dependency-propagated: nothing', p.log.starts, [])
console.log(failures ? `${failures} FAILED` : 'all ok')
process.exit(failures ? 1 : 0)
