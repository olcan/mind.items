function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // dependencies should have own tests
  if (remote) return // remote changes should be tested locally
  if (deleted) return // no need to test deleted items
  const item = _item(id)
  if (!item.text.includes('_test')) return // _test undefined
  // evaluate _test() on item if defined as function
  const start = Date.now()
  try {
    item.eval(`if (typeof _test == 'function') _test()`)
    _this.log(`tested ${item.name} in ${Date.now() - start}ms`)
  } catch (e) {
    _this.error(`failed _test on ${item.name}: ${e}`)
  }
}
