async function benchmark_item(item) {
  if (!item.text.match(/\b_benchmark/)) return // no benchmarks in item

  // serialize via item.store._benchmarker/_tester to avoid mixing up logs
  item.store._benchmarker = Promise.allSettled([
    item.store._benchmarker,
    item.store._tester,
  ]).then(async () => {
    // evaluate any functions _benchmark|_benchmark_*() defined on item
    const benchmarks = [
      '_benchmark',
      ...(item.text.match(/\b_benchmark_\w+/g) ?? []),
    ]
    for (const benchmark of benchmarks) {
      const name = benchmark.replace(/^_benchmark_?/, '') || '(unnamed)'
      let done, ms, e
      const start = Date.now()
      try {
        done = await item.eval(
          `typeof ${benchmark} == 'function' ? (${benchmark}(),true) : false`,
          { trigger: 'benchmark', async: item.deepasync, async_simple: true }
        )
        ms = Date.now() - start
        if (done) item.log(`benchmark '${name}' completed in ${ms}ms`)
      } catch (_e) {
        done = true // since error thrown
        ms = Date.now() - start
        item.error(`benchmark '${name}' FAILED in ${ms}ms`) //; ${_e}`)
        e = _e
      }
      // store benchmark results in item's global store under _tests
      if (done) {
        const log = item.get_log({ since: 'eval' })
        const gs = item.global_store
        gs._benchmarks = _.set(gs._benchmarks || {}, name, { ms, ok: !e, log })
        // look up benchmarked function names
        let names
        try {
          names = await item.eval(
            `typeof ${benchmark}_functions == 'object' ? ` +
              `${benchmark}_functions : null`
          )
        } catch (e) {}
        if (is_array(names) && names.every(is_string)) {
          names.forEach(name => {
            gs._benchmarks = _.set(gs._benchmarks || {}, name, {
              ms,
              ok: !e,
              log,
              benchmark, // actual benchmark name
            })
          })
        }
        await _delay(1) // ensure time-separation of benchmark runs (and logs)
      }
    }
  })
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
