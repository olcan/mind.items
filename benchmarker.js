async function benchmark_item(item) {
  if (!item.text.match(/\b_benchmark/)) return [] // no benchmarks in item

  // evaluate any functions _benchmark|_benchmark_*() defined on item
  const benchmarks = [
    '_benchmark',
    ...(item.text.match(/\b_benchmark_\w+/g) ?? []),
  ]
  let lines = []
  for (const benchmark of benchmarks) {
    const name = benchmark.replace(/^_benchmark_?/, '') || '(unnamed)'
    try {
      const start = Date.now()
      const benchmarked = await item.eval(
        `typeof ${benchmark} == 'function' ? (${benchmark}(),true) : false`,
        { trigger: 'benchmark', async: item.deepasync, async_simple: true }
      )
      if (benchmarked) {
        item.log(`BENCHMARK ${name} completed in ${Date.now() - start}ms`)
        lines = lines.concat(item.get_log({ since: 'eval' }))
        await _delay(1) // ensure time-separation of benchmark runs (and logs)
      }
    } catch (e) {
      item.error(`BENCHMARK ${name} failed: ${e}`)
    }
  }
  return lines
}

function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // dependencies should have own benchmarks
  if (remote) return // remote changes should be benchmarked locally
  if (deleted) return // no need to benchmark deleted items
  benchmark_item(_item(id))
}

const style_footer = `
\`\`\`_html
<style> 
  #item table { 
    font-size:80%; 
    line-height:140%; 
    white-space:nowrap; color:gray; 
    font-family:'jetbrains mono', monospace 
} 
</style>
\`\`\`
`
// command /benchmark [label]
async function _on_command_benchmark(label) {
  const items = _items(label)
  if (items.length == 0) {
    alert(`/benchmark: ${label} not found`)
    return '/benchmark ' + label
  }
  let text = ''
  let lines = []
  for (const item of items) lines = lines.concat(await benchmark_item(item))
  // process lines, formatting benchmark lines as interleaved markdown tables
  let rows = []
  for (const line of lines) {
    if (line.match(/:\s*\d/)) {
      const [name, result] = line.match(/^(.+)\s*:\s*(\d.+?)\s*$/).slice(1)
      rows.push([name, result])
    } else {
      if (line.match(/^BENCHMARK/)) {
        // append as benchmark header
        const [name, time] = line
          .match(/BENCHMARK (\S+?) completed in (\S+)/)
          .slice(1)
        text += `\`${name} (${time})\`\n`
      } else {
        // append generic line as is
        text += line + '\n'
      }
      if (rows.length) {
        text += '```_md\n' + table(rows) + '\n```\n\n'
        rows = []
      }
    }
  }
  return { text: (text + style_footer).trim(), edit: false }
}
