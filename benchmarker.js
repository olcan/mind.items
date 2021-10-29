async function benchmark_item(item) {
  if (!item.text.match(/\b_benchmark/)) return // no tests in item

  // evaluate any functions _benchmark|_benchmark_*() defined on item
  const benchmarks = [
    '_benchmark',
    ...(item.text.match(/_benchmark_\w+/g) ?? []),
  ]
  for (const benchmark of benchmarks) {
    try {
      const start = Date.now()
      const benchmarked = await item.eval(
        `typeof ${benchmark} == 'function' ? (${benchmark}(),true) : false`,
        { trigger: 'benchmark', async: item.deepasync, async_simple: true }
      )
      if (benchmarked)
        item.log(`${benchmark} completed in ${Date.now() - start}ms`)
    } catch (e) {
      item.error(`${benchmark} failed: ${e}`)
    }
  }
}

function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // dependencies should have own benchmarks
  if (remote) return // remote changes should be benchmarked locally
  if (deleted) return // no need to benchmark deleted items
  benchmark_item(_item(id))
}

// command /benchmark [label]
async function _on_command_benchmark(label) {
  const items = _items(label)
  if (items.length == 0) {
    alert(`/benchmark: ${label} not found`)
    return '/benchmark ' + label
  }
  for (const item of items) await benchmark_item(item)
}
