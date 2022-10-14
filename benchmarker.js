function benchmark_item(item, selector) {
  if (!item.text.match(/\b_benchmark_\w+/)) {
    if (!selector && item._global_store._benchmarks)
      delete item.global_store._benchmarks
    return 0 // no benchmarks in item
  }
  if (is_string(selector)) {
    const name = selector
    selector = n => n == name
  }
  if (selector && !is_function(selector)) fatal('invalid selector')

  // serialize via item.store._benchmarker/_tester to avoid mixing up logs
  return (item.store._benchmarker = Promise.allSettled([
    item.store._benchmarker,
    item.store._tester,
  ]).then(async () => {
    const gs = item._global_store // changes saved manually below
    if (!selector) delete gs._benchmarks // clear any previous benchmarks
    // evaluate any functions _benchmark|_benchmark_*() defined on item
    const benchmarks = item.text.match(/\b_benchmark_\w+/g) ?? []
    let benchmarks_done = 0
    for (const benchmark of benchmarks) {
      const name = benchmark.replace(/^_benchmark_/, '')
      if (selector && !selector(name)) continue // skip benchmark
      let done, ms, e
      const start = Date.now()
      try {
        done = await item.eval(
          `typeof ${benchmark} == 'function' ? (${benchmark}() ?? true) : false`,
          {
            trigger: 'benchmark',
            async: item.deepasync,
            async_simple: true,
            remove_tests_and_benchmarks: false,
            type: 'js|js_benchmarks?',
          }
        )
        ms = Date.now() - start
        if (done) item.log(`benchmark '${name}' completed in ${ms}ms`)
      } catch (_e) {
        done = true // since error thrown
        ms = Date.now() - start
        item.error(`benchmark '${name}' FAILED in ${ms}ms`) //; ${_e}`)
        e = _e
      }
      // store benchmark results in item's global store under _benchmarks
      if (done) {
        benchmarks_done++
        const log = item.get_log({ since: 'eval' })
        gs._benchmarks = set(gs._benchmarks || {}, name, { ms, ok: !e, log })
        // look up benchmarked function names
        let names
        try {
          names = await item.eval(
            `typeof ${benchmark}_functions == 'object' ? ` +
              `${benchmark}_functions : null`,
            { remove_tests_and_benchmarks: false, type: 'js|js_benchmarks?' }
          )
        } catch (e) {}
        if (is_array(names) && names.every(is_string)) {
          names.forEach(name => {
            gs._benchmarks = set(gs._benchmarks || {}, name, {
              ms,
              ok: !e,
              log,
              // TODO: why was this missing on an error'ed benchmark?
              benchmark, // actual benchmark name
            })
          })
        }
        await _delay(1) // ensure time-separation of benchmark runs (and logs)
      }
    }
    // save global store after all pending tests/benchmarks are done on item
    Promise.allSettled([item.store._benchmarker, item.store._tester]).then(() =>
      item.save_global_store()
    )
    return benchmarks_done
  }))
}

function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // dependencies should have own benchmarks
  if (remote) return // remote changes should be benchmarked locally
  if (deleted) return // no need to benchmark deleted items
  benchmark_item(_item(id))
}

// => /benchmark [items]
// runs benchmarks in items
// `items` can be specific `#label` or id
async function _on_command_benchmark(label) {
  const items = _items(label)
  if (items.length == 0) {
    alert(`/benchmark: ${label} not found`)
    return '/benchmark ' + label
  }
  try {
    let num_benchmarks = 0
    let num_items = 0 // items with benchmarks
    for (const item of items) {
      if (!item.text.match(/\b_benchmark_\w+/)) continue // no tests in item
      await _modal_close()
      _modal(`Running benchmarks in ${item.name} ...`)
      const count = await benchmark_item(item)
      num_benchmarks += count
      if (count) num_items++
    }
    await _modal_close()
    await _modal({
      content: `Completed ${num_benchmarks} benchmark${
        num_benchmarks > 1 ? 's' : ''
      } in ${num_items} item${num_items > 1 ? 's' : ''}.`,
      confirm: 'OK',
      background: 'confirm',
    })
  } finally {
    _modal_close()
  }
}
