function _benchmark_flip() {
  benchmark(
    () => flip(),
    () => Math.random(),
  )
}

function _benchmark_uniform() {
  benchmark(
    () => uniform(),
    () => uniform(1),
    () => uniform(0, 1),
    () => Math.random(),
  )
}

function _benchmark_discrete_uniform() {
  benchmark(
    () => discrete_uniform(),
    () => discrete_uniform(2),
    () => discrete_uniform(0, 1),
    () => ~~(2 * Math.random()),
    () => Math.floor(2 * Math.random()),
    () => Math.random(),
  )
}

function _benchmark_discrete() {
  const wJ = sample(100)
  const wJ_sorted = sample(100).sort((a, b) => b - a)
  const sum_wj = sum(wJ)
  benchmark(
    () => discrete([1, 2]),
    () => discrete([1, 2], 3),
    () => discrete(wJ),
    () => discrete(wJ, sum_wj),
    () => discrete(wJ_sorted, sum_wj),
  )
}

function _benchmark_triangular() {
  benchmark(
    () => triangular(),
    () => triangular(1),
    () => triangular(0, 1, 0.5),
    () => uniform(0, 1),
    () => Math.random(),
  )
}

function _benchmark_sample() {
  benchmark(
    () => sample(100),
    () => array(100, j => Math.random()),
    () => array(100, Math.random), // unsafe since args are passed through
  )
}

function _benchmark_shuffle() {
  const range10 = _.range(10)
  const range100 = _.range(100)
  const range1000 = _.range(1000)
  const range10000 = _.range(10000)
  benchmark(
    () => shuffle([0, 1]),
    () => shuffle([0, 1, 2]),
    () => shuffle(range10),
    () => shuffle(range100),
    () => shuffle(range1000),
    () => shuffle(range10000),
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
    () => binomial_cdf(500000, 1000000, 0.999),
  )
}

function _benchmark_ks2() {
  const xJ_100 = array(100, () => uniform())
  const yJ_100 = array(100, () => uniform())
  const xJ_1000 = array(1000, () => uniform())
  const yJ_1000 = array(1000, () => uniform())
  benchmark(() => ks2(xJ_100, yJ_100))
  benchmark(() => ks2(xJ_1000, yJ_1000))
}

function _benchmark_ks1() {
  const xJ_100 = array(100, () => uniform())
  const xJ_1000 = array(1000, () => uniform())
  benchmark(() => ks1(xJ_100, x => x))
  benchmark(() => ks1(xJ_1000, x => x))
}

function _benchmark_min() {
  const x10 = sample(10, uniform)
  const x100 = sample(100, uniform)
  // for reference, we compare to an implementation that uses each(...)
  function _min_each(xJ) {
    if (!is_array(xJ)) xJ = arguments // allow min(a,b,...)
    let z = inf
    each(xJ, x => {
      if (x < z) z = x
    })
    return z
  }
  benchmark(
    () => min(0),
    () => min([0]),
    () => min(0, -1, -2),
    () => min([0, -1, -2]),
    () => _min_each([0, -1, -2]),
    () => min(...x10),
    () => min(x10),
    () => min(...x100),
    () => min(x100),
    () => _min_each(x100),
  )
}

function _benchmark_max() {
  const x10 = sample(10, uniform)
  const x100 = sample(100, uniform)
  benchmark(
    () => max(0),
    () => max([0]),
    () => max(0, 1, 2),
    () => max([0, 1, 2]),
    () => max(...x10),
    () => max(x10),
    () => max(...x100),
    () => max(x100),
  )
}

function _benchmark_sum() {
  const x10 = sample(10, uniform)
  const x100 = sample(100, uniform)
  benchmark(
    () => sum(0),
    () => sum([0]),
    () => sum(0, 1, 2),
    () => sum([0, 1, 2]),
    () => sum(...x10),
    () => sum(x10),
    () => sum(...x100),
    () => sum(x100),
  )
}
