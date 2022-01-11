function _benchmark_from() {
  benchmark(
    () => from(0, [0]),
    () => from(0, { in: [0] }),
    () => [0].includes(0),
    () => 0 >= 0,
    () => from(0, { gte: 0 })
  )
}

function _benchmark_sample() {
  _benchmark_options.N = 10
  benchmark(
    () => sample(() => {}, { size: 10000, updates: 0 }),
    () => sample(() => {}, { size: 10000, updates: 1 }),
    () => sample(() => {}, { size: 1000, updates: 10 }),
    () => sample(() => {}, { size: 100, updates: 10 }),
    () => sample(() => sample(uniform(0, 1)), { size: 100, updates: 10 }),
    () =>
      sample(
        () => {
          let a = sample(uniform(0, 1))
          let b = sample(uniform(a, 1))
          condition(b > 0.9)
        },
        { size: 100, updates: 20 }
      )
  )
}
