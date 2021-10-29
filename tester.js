function test_item(item) {
  if (!item.text.includes('_test')) return // no tests in item

  // evaluate any functions _test|_test_*() defined on item
  const tests = ['_test', ...(item.text.match(/_test_\w+/g) ?? [])]
  tests.forEach(test => {
    try {
      const start = Date.now()
      const tested = item.eval(
        `typeof ${test} == 'function' ? (${test}(),true) : false`,
        { trigger: 'test', async: item.deepasync, async_simple: true }
      )
      if (tested) item.log(`${test} passed in ${Date.now() - start}ms`)
    } catch (e) {
      item.error(`${test} failed: ${e}`)
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
function _on_command_test(label) {
  const items = _items(label)
  if (items.length == 0) {
    alert(`/test: ${label} not found`)
    return '/test ' + label
  }
  items.forEach(test_item)
}
