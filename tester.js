function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // dependencies should have own tests
  if (remote) return // remote changes should be tested locally
  if (deleted) return // no need to test deleted items
  const item = _item(id)
  if (!item.text.includes('_test')) return // no tests in item

  // evaluate any functions _test|_test_*() defined on item
  const tests = ['_test', ...(item.text.match(/_test_\w+/g) ?? [])]
  tests.forEach(test => {
    start = Date.now()
    try {
      item.eval(`if (typeof ${test} == 'function') _test()`)
      _this.log(`${test} passed on ${item.name} in ${Date.now() - start}ms`)
    } catch (e) {
      _this.error(`${test} failed on ${item.name}: ${e}`)
    }
  })
}
