function _benchmark_from() {
  benchmark(
    () => from(0, [0]),
    () => from(0, { in: [0] }),
    () => [0].includes(0),
    () => 0 >= 0,
    () => from(0, { gte: 0 })
  )
}
