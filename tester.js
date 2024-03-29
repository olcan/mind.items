function test_item(item, selector) {
  if (!item.text.match(/\b_test_\w+/)) {
    if (!selector && item._global_store._tests) delete item.global_store._tests
    return 0 // no tests in item
  }
  if (is_string(selector)) {
    const name = selector
    selector = n => n == name
  }
  if (selector && !is_function(selector)) fatal('invalid selector')

  // serialize via item.store._tester/_benchmarker to avoid mixing up logs
  return (item.store._tester = Promise.allSettled([
    item.store._tester,
    item.store._benchmarker,
  ]).then(async () => {
    const gs = item._global_store // changes saved manually below
    if (!selector) delete gs._tests // clear any previous tests
    // evaluate any functions _test_*() defined on item
    const tests = item.text.match(/\b_test_\w+/g) ?? []
    let tests_done = 0
    for (const test of tests) {
      const name = test.replace(/^_test_/, '')
      if (selector && !selector(name)) continue // skip test
      let done, ms, e
      const start = Date.now()
      try {
        done = await item.eval(
          `typeof ${test} == 'function' ? (${test}() ?? true) : false`,
          {
            trigger: 'test',
            async: item.deepasync,
            async_simple: true,
            remove_tests_and_benchmarks: false,
            type: 'js|js_tests?',
          }
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
        gs._tests = set(gs._tests || {}, name, { ms, ok: !e, log })
        // look up tested function names
        let names
        try {
          names = await item.eval(
            `typeof ${test}_functions == 'object' ? ` +
              `${test}_functions : null`,
            { remove_tests_and_benchmarks: false, type: 'js|js_tests?' }
          )
        } catch (e) {}
        if (is_array(names) && names.every(is_string)) {
          names.forEach(name => {
            gs._tests = set(gs._tests || {}, name, {
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
    // save global store after all pending tests/benchmarks are done on item
    Promise.allSettled([item.store._benchmarker, item.store._tester]).then(() =>
      item.save_global_store()
    )
    return tests_done
  }))
}

function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  // NOTE: we auto-retest dependents when dependencies change
  //       (another reason why tests need to be FAST)
  // if (dependency) return // dependencies should have own tests
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
