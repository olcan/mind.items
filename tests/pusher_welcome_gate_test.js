// welcome gating of the pusher's verification (see _welcome_gate/_welcome_poll in pusher.js):
// the app's `_server_confirmed` flag holds verification until a current server revision has
// been applied; an app without the flag verifies at once. run: node tests/pusher_welcome_gate_test.js
const assert = require('assert')
const fs = require('fs')
const src = fs.readFileSync(__dirname + '/../pusher.js', 'utf8')
const pick = name => {
  const start = src.indexOf(`const ${name} = `)
  const end = src.indexOf('\n', src.indexOf('\n', start) + 1) // two-line arrow functions at most
  return src.slice(start, end)
}
const { _welcome_gate, _welcome_poll } = new Function(
  `${pick('_welcome_gate')}\n${pick('_welcome_poll')}\nreturn { _welcome_gate, _welcome_poll }`
)()

assert.equal(_welcome_gate(undefined), 'init', 'an app without the flag verifies at once')
assert.equal(_welcome_gate(false), 'wait', 'unconfirmed corpus waits')
assert.equal(_welcome_gate(true), 'init', 'confirmed corpus verifies')

// cold start: the poll retries while unconfirmed and verifies EXACTLY ONCE when confirmed,
// finishing the task (null) with the verification's completion
;(async () => {
  let inits = 0
  const init = async () => void inits++
  assert.equal(_welcome_poll(false, init), 250)
  assert.equal(_welcome_poll(false, init), 250)
  assert.equal(inits, 0, 'no verification while waiting')
  assert.equal(await _welcome_poll(true, init), null)
  assert.equal(inits, 1, 'verified once when confirmed')
  // a rejected verification propagates through the returned completion (task error handling)
  await assert.rejects(_welcome_poll(true, async () => { throw new Error('boom') }), /boom/)
  console.log('pusher_welcome_gate_test: ok')
})()
