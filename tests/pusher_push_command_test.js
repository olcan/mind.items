#!/usr/bin/env node
// plain-node table for the /push command (pusher.js: _on_command_push): no argument pushes the
// items marked pushable and, with none marked, says so and pushes nothing (2026-09-27: the
// former fallback swept every item); `pushables` is the same selection (it used to throw: the
// list was filtered before it was assigned); `all` sweeps every item; a `#label` or id pushes
// those items whatever their marks; an unknown label alerts and pushes nothing. Each pushed
// item's mark is cleared and pushed as a MANUAL push; last_push moves once after a push.
// run: node external/mind.items/tests/pusher_push_command_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const src = fs.readFileSync(path.join(__dirname, '..', 'pusher.js'), 'utf8')
const fn = src.match(/\nasync function _on_command_push\([^\n]*\) \{[\s\S]*?\n\}\n/)
if (!fn) throw new Error('pusher.js lacks _on_command_push')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// a page of items by name, some marked pushable; the command's effects recorded
const page = marked => {
  const items = ['#a', '#b', '#c'].map(name => ({ name, pushable: marked.includes(name) }))
  const log = { alerts: [], pushes: [], branch: [], modals: 0 }
  const env = {
    _items: label => (label ? items.filter(i => i.name === label) : items),
    alert: msg => log.alerts.push(msg),
    _modal: () => log.modals++,
    _modal_close: async () => {},
    push_item: async (item, manual) => log.pushes.push([item.name, manual]),
    update_branch: async name => log.branch.push(name),
    _this: { warn: () => {} },
  }
  const ctx = vm.createContext(env)
  vm.runInContext(fn[0], ctx)
  const run = label => vm.runInContext('_on_command_push', ctx)(label)
  return { run, log, items }
}

;(async () => {
  const notice = '/push: nothing is marked pushable; `/push all` pushes every item'
  let p = page([])
  check('no argument, nothing marked: the notice, no push, no modal, no branch', [await p.run(''), p.log.alerts, p.log.pushes, p.log.modals, p.log.branch], ['/push ', [notice], [], 0, []])
  p = page(['#b', '#c'])
  check('no argument: the marked items only, manual, marks cleared, a modal each, last_push moved once', [await p.run(''), p.log.pushes, p.items.map(i => i.pushable), p.log.modals, p.log.branch], [undefined, [['#b', true], ['#c', true]], [false, false, false], 2, ['last_push']])
  p = page(['#a'])
  check('pushables: the marked items (it used to throw)', [await p.run('pushables'), p.log.pushes], [undefined, [['#a', true]]])
  p = page([])
  check('pushables, nothing marked: the notice, no modal, no branch', [await p.run('pushables'), p.log.alerts, p.log.modals, p.log.branch], ['/push pushables', [notice], 0, []])
  p = page([])
  check('all: every item, marked or not', [await p.run('all'), p.log.pushes.map(x => x[0])], [undefined, ['#a', '#b', '#c']])
  p = page(['#a'])
  check('a label: that item whatever its mark', [await p.run('#b'), p.log.pushes], [undefined, [['#b', true]]])
  p = page([])
  check('an unknown label: alert, no push, no branch', [await p.run('#zzz'), p.log.alerts, p.log.pushes, p.log.branch], ['/push #zzz', ['/push: #zzz not found'], [], []])
  console.log(failures ? `${failures} FAILED` : 'all ok')
  process.exit(failures ? 1 : 0)
})()
