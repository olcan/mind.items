function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // dependencies should have own benchmarks
  if (remote) return // remote changes should be benchmarked locally
  if (deleted) return // no need to benchmark deleted items
  const item = _item(id)
  if (!item.text.includes('_benchmark')) return // no benchmarks in item

  // evaluate any functions _benchmark|_benchmark_*() defined on item
  const benchmarks = [
    '_benchmark',
    ...(item.text.match(/_benchmark_\w+/g) ?? []),
  ]
  benchmarks.forEach(benchmark => {
    try {
      const start = Date.now()
      const benchmarked = item.eval(
        `typeof ${benchmark} == 'function' ? (${benchmark}(),true) : false`
      )
      if (benchmarked)
        item.log(`${benchmark} completed in ${Date.now() - start}ms`)
    } catch (e) {
      item.error(`${benchmark} failed: ${e}`)
    }
  })
}
