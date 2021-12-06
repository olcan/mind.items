function _benchmark_random_boolean() {
  benchmark(
    () => random_boolean(),
    () => random()
  )
}

function _benchmark_random_uniform() {
  benchmark(
    () => random_uniform(),
    () => random_uniform(1),
    () => random_uniform(0, 1),
    () => random()
  )
}

function _benchmark_random_uniform_array() {
  const xJ = array(100)
  benchmark(
    () => random_uniform_array(xJ, 1, 2),
    () => random_array(xJ, () => random_uniform(1, 2))
  )
}

function _benchmark_random_discrete_uniform() {
  benchmark(
    () => random_discrete_uniform(),
    () => random_discrete_uniform(2),
    () => random_discrete_uniform(0, 1),
    () => ~~(2 * random()),
    () => Math.floor(2 * random()),
    () => random()
  )
}

function _benchmark_random_discrete_uniform_array() {
  const xJ = array(100)
  benchmark(
    () => random_discrete_uniform_array(xJ, 100),
    () => random_array(xJ, () => random_discrete_uniform(100))
  )
}

function _benchmark_random_discrete() {
  const wJ = random_array(100)
  const wJ_sorted = random_array(100).sort((a, b) => b - a)
  const sum_wj = sum(wJ)
  benchmark(
    () => random_discrete([1, 2]),
    () => random_discrete([1, 2], 3),
    () => random_discrete(wJ),
    () => random_discrete(wJ, sum_wj),
    () => random_discrete(wJ_sorted, sum_wj)
  )
}

function _benchmark_random_discrete_array() {
  // difference is much more dramatic for 1000+, but benchmark gets slow
  const wJ = random_array(100)
  const xJ = array(100)
  const sum_wj = sum(wJ)
  benchmark(
    () => random_discrete_array(xJ, wJ, sum_wj),
    () => random_array(xJ, () => random_discrete(wJ, sum_wj))
  )
}

function _benchmark_random_triangular() {
  benchmark(
    () => random_triangular(),
    () => random_triangular(1),
    () => random_triangular(0, 1, 0.5),
    () => random_uniform(0, 1),
    () => random()
  )
}

function _benchmark_random_array() {
  benchmark(
    () => random_array(100),
    () => random_array(array(100)),
    () => random_array(100, random, x => x > 0.5),
    () => random_array(array(100), random, x => x > 0.5),
    () => array(100, j => random()),
    () => array(100, random) // unsafe since args are passed through
  )
}

function _benchmark_random_shuffle() {
  const range10 = _.range(10)
  const range100 = _.range(100)
  const range1000 = _.range(1000)
  const range10000 = _.range(10000)
  benchmark(
    () => random_shuffle([0, 1]),
    () => random_shuffle([0, 1, 2]),
    () => random_shuffle(range10),
    () => random_shuffle(range100),
    () => random_shuffle(range1000),
    () => random_shuffle(range10000)
  )
}

function _benchmark_binomial_cdf() {
  benchmark(
    () => binomial_cdf(5, 10, 0.5),
    () => binomial_cdf(50, 100, 0.5),
    () => binomial_cdf(500, 1000, 0.5),
    () => binomial_cdf(5000, 10000, 0.5),
    () => binomial_cdf(500000, 1000000, 0.5),
    () => binomial_cdf(500000, 1000000, 0.001),
    () => binomial_cdf(500000, 1000000, 0.999)
  )
}

function _benchmark_ks2() {
  const xJ_100 = array(100, () => random_uniform())
  const yJ_100 = array(100, () => random_uniform())
  const xJ_1000 = array(1000, () => random_uniform())
  const yJ_1000 = array(1000, () => random_uniform())
  benchmark(() => ks2(xJ_100, yJ_100))
  benchmark(() => ks2(xJ_1000, yJ_1000))
}

function _benchmark_ks1() {
  const xJ_100 = array(100, () => random_uniform())
  const xJ_1000 = array(1000, () => random_uniform())
  benchmark(() => ks1(xJ_100, x => x))
  benchmark(() => ks1(xJ_1000, x => x))
}

function _benchmark_mina() {
  const x10 = random_array(10)
  const x100 = random_array(100)
  // for reference, we compare to an implementation that uses each(...)
  function _min_each(xJ) {
    if (!is_array(xJ)) xJ = arguments // allow mina(a,b,...)
    let z = inf
    each(xJ, x => {
      if (x < z) z = x
    })
    return z
  }
  benchmark(
    () => mina([0]),
    () => Math.min(0, -1, -2),
    () => mina([0, -1, -2]),
    () => _min_each([0, -1, -2]),
    () => Math.min(...x10),
    () => Math.min.apply(null, x10),
    () => mina(x10),
    () => Math.min(...x100),
    () => Math.min.apply(null, x100),
    () => mina(x100),
    () => _min_each(x100)
  )
}

function _benchmark_maxa() {
  const x10 = random_array(10)
  const x100 = random_array(100)
  benchmark(
    () => maxa([0]),
    () => Math.max(0, 1, 2),
    () => maxa([0, 1, 2]),
    () => Math.max(...x10),
    () => Math.max.apply(null, x10),
    () => maxa(x10),
    () => Math.max(...x100),
    () => Math.max.apply(null, x100),
    () => maxa(x100)
  )
}

function _benchmark_sum() {
  const x10 = random_array(10)
  const x100 = random_array(100)
  benchmark(
    () => sum(0),
    () => sum([0]),
    () => sum(0, 1, 2),
    () => sum([0, 1, 2]),
    () => sum(...x10),
    () => sum(x10),
    () => sum(...x100),
    () => sum(x100)
  )
}
