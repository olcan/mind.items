async function benchmark_item(item) {
  if (!item.text.match(/\b_benchmark/)) return [] // no benchmarks in item

  // evaluate any functions _benchmark|_benchmark_*() defined on item
  const benchmarks = [
    '_benchmark',
    ...(item.text.match(/_benchmark_\w+/g) ?? []),
  ]
  let lines = []
  for (const benchmark of benchmarks) {
    try {
      const start = Date.now()
      const benchmarked = await item.eval(
        `typeof ${benchmark} == 'function' ? (${benchmark}(),true) : false`,
        { trigger: 'benchmark', async: item.deepasync, async_simple: true }
      )
      if (benchmarked) {
        item.log(`${benchmark} completed in ${Date.now() - start}ms`)
        lines = lines.concat(item.get_log({ since: 'eval' }))
      }
    } catch (e) {
      item.error(`${benchmark} failed: ${e}`)
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

// TODO: move these into utils when ready
const array = (J, f) => {
  const xJ = new Array(J)
  // NOTE: Array.from({length:J}, ...) was much slower
  if (isFunction(f)) for (let j = 0; j < J; ++j) xJ[j] = f(j)
  else if (defined(f)) xJ.fill(f)
  return xJ
}
// generates markdown for table, for writing into _markdown|_md blocks
function table(xJK, headers = null) {
  let lines = []
  if (headers) lines.push('|' + headers.join('|') + '|')
  else lines.push(array(xJK[0].length + 1, k => '|').join(''))
  lines.push(
    '|' +
      array(xJK[0].length, k => (isNumeric(xJK[0][k]) ? '-:' : '-')).join('|') +
      '|'
  )
  lines = lines.concat(xJK.map(xK => '|' + xK.join('|')))
  return lines.join('\n')
}

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
      const [name, result] = line.split(':', 2).map(s => s.trim())
      rows.push([name, result])
    } else {
      text += line + '\n'
      if (rows.length) {
        text += '```_md\n' + table(rows) + '\n```\n'
        rows = []
      }
    }
  }
  return { text }
}
