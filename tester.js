async function test_item(item) {
  if (!item.text.match(/\b_test/)) return // no tests in item

  // serialize via item.store._tester/_benchmarker to avoid mixing up logs
  item.store._tester = Promise.allSettled([
    item.store._tester,
    item.store._benchmarker,
  ]).then(async () => {
    // evaluate any functions _test|_test_*() defined on item
    const tests = ['_test', ...(item.text.match(/\b_test_\w+/g) ?? [])]
    for (const test of tests) {
      const name = test.replace(/^_test_?/, '') || '(unnamed)'
      let done, ms, e
      const start = Date.now()
      try {
        done = await item.eval(
          `typeof ${test} == 'function' ? (${test}(),true) : false`,
          { trigger: 'test', async: item.deepasync, async_simple: true }
        )
        ms = Date.now() - start
        if (done) item.log(`test '${name}' passed in ${ms}ms`)
      } catch (_e) {
        done = true // since error thrown
        ms = Date.now() - start
        item.error(`test '${name}' FAILED in ${ms}ms`) //; ${_e}`)
        e = _e
      }
      // store test results in item's global store under _tests
      if (done) {
        const log = item.get_log({ since: 'eval' })
        const gs = item.global_store
        gs._tests = _.set(gs._tests || {}, name, { ms, ok: !e, log })
        // look up tested function names
        let names
        try {
          names = await item.eval(
            `typeof ${test}_functions == 'object' ? ` +
              `${test}_functions : null`
          )
        } catch (e) {}
        if (is_array(names) && names.every(is_string)) {
          names.forEach(name => {
            gs._tests = _.set(gs._tests || {}, name, {
              ms,
              ok: !e,
              log,
              test, // actual test name
            })
          })
        }
        await _delay(1) // ensure time-separation of test runs (and logs)
      }
    }
  })
}

function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // dependencies should have own tests
  if (remote) return // remote changes should be tested locally
  if (deleted) return // no need to test deleted items
  test_item(_item(id))
}

// command /test [label]
async function _on_command_test(label) {
  const items = _items(label)
  if (items.length == 0) {
    alert(`/test: ${label} not found`)
    return '/test ' + label
  }
  for (const item of items) await test_item(item)
}
