function test_item(item) {
  if (!item.text.match(/\b_test_\w+/)) return 0 // no tests in item

  // serialize via item.store._tester/_benchmarker to avoid mixing up logs
  return (item.store._tester = Promise.allSettled([
    item.store._tester,
    item.store._benchmarker,
  ]).then(async () => {
    // evaluate any functions _test_*() defined on item
    const tests = item.text.match(/\b_test_\w+/g) ?? []
    let tests_done = 0
    for (const test of tests) {
      const name = test.replace(/^_test_/, '')
      let done, ms, e
      const start = Date.now()
      try {
        done = await item.eval(
          `typeof ${test} == 'function' ? (${test}() ?? true) : false`,
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
        tests_done++
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
    return tests_done
  }))
}

function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // dependencies should have own tests
  if (remote) return // remote changes should be tested locally
  if (deleted) return // no need to test deleted items
  test_item(_item(id))
}

// => /test [items]
// runs tests in items
// `items` can be specific `#label` or id
async function _on_command_test(label) {
  const items = _items(label)
  if (items.length == 0) {
    alert(`/test: ${label} not found`)
    return '/test ' + label
  }
  try {
    let num_tests = 0
    let num_items = 0 // items with tests
    for (const item of items) {
      if (!item.text.match(/\b_test_\w+/)) continue // no tests in item
      await _modal_close()
      _modal(`Running tests in ${item.name} ...`)
      const count = await test_item(item)
      num_tests += count
      if (count) num_items++
    }
    await _modal_close()
    await _modal({
      content: `Completed ${num_tests} test${
        num_tests > 1 ? 's' : ''
      } in ${num_items} item${num_items > 1 ? 's' : ''}.`,
      confirm: 'OK',
      background: 'confirm',
    })
  } finally {
    _modal_close()
  }
}
