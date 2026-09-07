#!/usr/bin/env node
// plain-node table for when_server_confirmed (util/core.js, extracted by name): the welcome gate
// shared by the pusher, the updater and the sharer. an app without the flag (undefined) runs at
// once; a confirmed corpus (true) runs at once; an unconfirmed one (false) polls as an item task,
// retrying every 250ms and running exactly once when the flag flips, finishing the task (null)
// with the run's completion so a rejection propagates. run: node tests/core_server_confirmed_test.js
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const core = fs.readFileSync(path.join(__dirname, '..', 'util', 'core.js'), 'utf8')
const src = core.match(/\nfunction when_server_confirmed\(item, name, f\) \{[\s\S]*?\n\}\n/)
if (!src) throw new Error('when_server_confirmed not found in util/core.js')

const fake = server_confirmed => {
  const window = { _server_confirmed: server_confirmed }
  const item = { logs: [], tasks: {}, log: msg => item.logs.push(msg) }
  item.dispatch_task = (name, fn, delay) => (item.tasks[name] = { fn, delay })
  const when_server_confirmed = new Function('window', `${src[0]}\nreturn when_server_confirmed`)(window)
  return { window, item, when_server_confirmed }
}

;(async () => {
  // an app without the flag, and a confirmed corpus: run at once, returning f's completion
  for (const flag of [undefined, true]) {
    const { item, when_server_confirmed } = fake(flag)
    let runs = 0
    assert.equal(await when_server_confirmed(item, 't', async () => ++runs), 1, `flag ${flag}: f's result returned`)
    assert.equal(runs, 1)
    assert.deepEqual(item.tasks, {}, `flag ${flag}: no task dispatched`)
  }

  // an unconfirmed corpus: a task polls; f runs exactly once when the flag flips
  const { window, item, when_server_confirmed } = fake(false)
  let runs = 0
  assert.equal(when_server_confirmed(item, 't', async () => void runs++), undefined)
  assert.equal(item.logs.length, 1, 'the wait is logged once')
  const task = item.tasks['t']
  assert.equal(task.delay, 250)
  assert.equal(task.fn(), 250, 'retries while unconfirmed')
  assert.equal(task.fn(), 250)
  assert.equal(runs, 0, 'no run while unconfirmed')
  window._server_confirmed = true
  assert.equal(await task.fn(), null, 'runs and finishes the task when confirmed')
  assert.equal(runs, 1, 'ran exactly once')

  // a rejected run propagates through the returned completion (task error handling)
  window._server_confirmed = false
  when_server_confirmed(item, 'u', async () => {
    throw new Error('boom')
  })
  window._server_confirmed = true
  await assert.rejects(item.tasks['u'].fn(), /boom/)

  // the three CALL SITES (extracted by name): each welcome hook routes through the gate — the
  // pusher's and updater's async initializers, the sharer's synchronous pass — running at once
  // for an absent or true flag and exactly once after a false flag flips (nine schedules)
  const hook = file => {
    const m = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').match(/\nfunction _on_welcome\(\) \{[\s\S]*?\n\}\n/)
    if (!m) throw new Error(`_on_welcome not found in ${file}`)
    return m[0]
  }
  for (const [file, callee] of [
    ['pusher.js', 'init_pusher'],
    ['updater.js', 'init_updater'],
    ['sharer.js', null],
  ]) {
    for (const flag of [undefined, true, false]) {
      const { window, item, when_server_confirmed } = fake(flag)
      let runs = 0
      const run = () => void runs++
      const deps = {
        when_server_confirmed,
        _this: item,
        init_pusher: async () => run(),
        init_updater: async () => run(),
        each: (xs, f) => xs.forEach(f),
        _items: () => [{}],
        _update_shared: () => run(),
        _update_shared_deps: () => {},
      }
      const _on_welcome = new Function(...Object.keys(deps), `${hook(file)}\nreturn _on_welcome`)(...Object.values(deps))
      const out = _on_welcome()
      if (flag === false) {
        assert.equal(runs, 0, `${file} flag false: held`)
        assert.equal(item.tasks[Object.keys(item.tasks)[0]].fn(), 250, `${file}: retries while unconfirmed`)
        window._server_confirmed = true
        assert.equal(await item.tasks[Object.keys(item.tasks)[0]].fn(), null, `${file}: finishes when confirmed`)
      } else {
        await out
        assert.deepEqual(item.tasks, {}, `${file} flag ${flag}: no task`)
      }
      assert.equal(runs, 1, `${file} flag ${flag}: ran exactly once${callee ? ` (${callee})` : ''}`)
    }
  }
  console.log('core_server_confirmed_test: ok')
})()
