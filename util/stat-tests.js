function _test_flip() {
  check(
    () => is_boolean(flip()),
    () => flip(0) === false,
    () => flip(1) === true,
    () => flip('a') === false, // …<p false for non-number p
  )
}

function _test_uniform() {
  check(
    () => uniform() >= 0,
    () => uniform() < 1,
    () => uniform(1) < 1,
    () => uniform(0.001) < 0.001,
    () => uniform(0.999, 1) >= 0.999,
    () => uniform(2, 3) >= 2,
    () => uniform(2, 3) < 3,
    // empty sets return NaN
    () => is_nan(uniform(0)),
    () => is_nan(uniform(0, 0)),
    () => is_nan(uniform(1, 1)),
    () => is_nan(uniform(2, 1)),
    () => is_nan(uniform(2, 2)),
    // invalid sets also return NaN
    () => is_nan(uniform('a')),
    () => is_nan(uniform(0, 'b')),
  )
}

// binomial test for occurrences of x in sample
// e.g. one-in-a-billion failure/rejection for n=1000, p=1/2 is k<=~400
// e.g. one-in-a-billion failure/rejection for n=1000, p=1/6 is k<=~100
const _binomial_test_sample = (sampler, x, p, n = 1000, ɑ = 10 ** -9) => [
  binomial_test(
    n,
    _.sumBy(sample(n, sampler), s => equal(s, x)),
    p,
  ),
  ɑ,
  _.gt, // i.e. can not reject null (correctness) at level ɑ
]

function _test_discrete_uniform() {
  check(
    () => discrete_uniform() >= 0,
    () => discrete_uniform() <= 1,
    () => discrete_uniform(1) === 0,
    () => discrete_uniform(2, 2) === 2,
    () => discrete_uniform(2, 3) >= 2,
    () => discrete_uniform(2, 3) <= 3,
    // empty sets return NaN
    () => is_nan(discrete_uniform(2, 1)),
    () => is_nan(discrete_uniform(0)),
    // invalid sets also return NaN
    () => is_nan(discrete_uniform('a')),
    () => is_nan(discrete_uniform(0, 'b')),
    () => _binomial_test_sample(() => discrete_uniform(0, 1), 0, 1 / 2),
    () => _binomial_test_sample(() => discrete_uniform(0, 1), 1, 1 / 2),
    () => _binomial_test_sample(() => discrete_uniform(1, 3), 1, 1 / 3),
    () => _binomial_test_sample(() => discrete_uniform(1, 3), 2, 1 / 3),
    () => _binomial_test_sample(() => discrete_uniform(1, 3), 3, 1 / 3),
  )
}

function _test_discrete() {
  check(
    () => throws(() => discrete(0)),
    () => throws(() => discrete([0], -1)),
    () => is_nan(discrete([], -1)),
    () => is_nan(discrete([])),
    () => [discrete([0]), 0],
    () => [discrete([1, 0]), 0],
    () => [discrete([0, 1]), 1],
    () => [discrete([0, 0, 1]), 2],
    () => _binomial_test_sample(() => discrete([1, 1]), 0, 1 / 2),
    () => _binomial_test_sample(() => discrete([1, 1]), 1, 1 / 2),
    () => _binomial_test_sample(() => discrete([1, 2]), 0, 1 / 3),
    () => _binomial_test_sample(() => discrete([1, 2]), 1, 2 / 3),
  )
}

function _test_triangular() {
  check(
    () => triangular() >= 0,
    () => triangular() <= 1,
    () => triangular(1) <= 1,
    () => triangular(0.001) <= 0.001,
    () => triangular(0.999, 1) >= 0.999,
    () => triangular(2, 3) >= 2,
    () => triangular(2, 3) <= 3,
    () => [triangular(0), 0],
    () => [triangular(1, 1), 1],
    () => [triangular(2, 2), 2],
    () => [triangular(1, 1, 1), 1],
    () => [triangular(2, 2, 2), 2],
    // empty sets return NaN
    () => is_nan(triangular(-1)),
    () => is_nan(triangular(1, 0)),
    () => is_nan(triangular(0, 1, 2)),
    () => is_nan(triangular(0, 1, -1)),
    // invalid sets also return NaN
    () => is_nan(triangular('a')),
    () => is_nan(triangular(0, 'b')),
    () => is_nan(triangular(0, 1, 'c')),
  )
}

function _test_sample() {
  check(
    () => [sample(-1), []],
    () => [sample(0), []],
    () => [sample(1, () => 1), [1]],
    () => [sample(2, () => 1), [1, 1]],
    () => [sample(2, j => j), [undefined, undefined]],
  )
}

function _test_shuffle() {
  check(
    () => [shuffle([0], 0, 1), [0]],
    () => [shuffle([0]), [0]],
    () => _binomial_test_sample(() => shuffle([0, 1]), [0, 1], 1 / 2),
    () => _binomial_test_sample(() => shuffle([0, 1]), [1, 0], 1 / 2),
    () => _binomial_test_sample(() => shuffle([0, 1, 2]), [0, 1, 2], 1 / 6),
    () => _binomial_test_sample(() => shuffle([0, 1, 2]), [0, 2, 1], 1 / 6),
    () => _binomial_test_sample(() => shuffle([0, 1, 2]), [1, 0, 2], 1 / 6),
    () => _binomial_test_sample(() => shuffle([0, 1, 2]), [1, 2, 0], 1 / 6),
    () => _binomial_test_sample(() => shuffle([0, 1, 2]), [2, 0, 1], 1 / 6),
    () => _binomial_test_sample(() => shuffle([0, 1, 2]), [2, 1, 0], 1 / 6),
  )
}

function _test_binomial_cdf() {
  check(
    () => [binomial_cdf(-1, 3, 0.5), 0],
    () => [binomial_cdf(4, 3, 0.5), 1],
    () => is_nan(binomial_cdf(2, -1, 0.5)),
    () => is_nan(binomial_cdf(2, 3, -0.1)),
    () => is_nan(binomial_cdf(2, 3, 1.1)),
    // reference values from Mathematica
    //   SetPrecision[CDF[BinomialDistribution[n,p],x],20]
    () => [binomial_cdf(2, 3, 0), 1],
    () => [binomial_cdf(2, 3, 1), 0],
    () => [binomial_cdf(1, 3, 0.5), 0.5],
    () => [binomial_cdf(2, 3, 0.5), 0.875],
    () => [binomial_cdf(5, 10, 0.5), 0.62304687499999866773, approx_equal],
    () => [binomial_cdf(5, 10, 0.1), 0.99985309739999994605, approx_equal],
    () => [binomial_cdf(5, 10, 0.9), 0.0016349374000000031076, approx_equal],
  )
}

function _test_binomial_test() {
  check(() => [binomial_test(2, 1, 0.5), 1])
  check(() => [
    binomial_test(3, 1, 0.5),
    binomial_cdf(1, 3, 0.5) + 1 - binomial_cdf(2, 3, 0.5),
  ]),
    check(() => [
      binomial_test(5, 2, 0.5),
      binomial_cdf(2, 5, 0.5) + 1 - binomial_cdf(3, 5, 0.5),
    ])
}

function _test_ks2() {
  const _discrete_ = { discrete: true }
  const xJ = array(100, () => uniform())
  const yK = array(200, () => uniform())
  const xJ_sorted = xJ.slice().sort((a, b) => a - b)
  const yK_sorted = yK.slice().sort((a, b) => a - b)
  check(
    () => [ks2([1], [0.9]), 1],
    () => [ks2([1], [1], _discrete_), 0],
    () => [ks2([1], [1.1]), 1],
    () => [ks2([1, 2], [0.9]), 1],
    () => [ks2([1, 2], [1], _discrete_), 1 / 2],
    () => [ks2([1, 2], [1.5]), 1 / 2],
    () => [ks2([1, 2], [2], _discrete_), 1 / 2],
    () => [ks2([1, 2], [2.1]), 1],
    () => [ks2([1, 2], [0.8, 0.9]), 1],
    () => [ks2([1, 2], [0.9, 1], _discrete_), 1 / 2],
    () => [ks2([1, 2], [1.1, 1.9]), 1 / 2],
    () => [ks2([1, 2], [2, 2.1], _discrete_), 1 / 2],
    () => [ks2([1, 2], [2.1, 2.2]), 1],
    () => [ks2([1, 2, 3], [0.9]), 1],
    () => [ks2([1, 2, 3], [1], _discrete_), 2 / 3],
    () => [ks2([1, 2, 3], [1.5]), 2 / 3],
    () => [ks2([1, 2, 3], [2], _discrete_), 1 / 3],
    () => [ks2([1, 2, 3], [2.5]), 2 / 3],
    () => [ks2([1, 2, 3], [3], _discrete_), 2 / 3],
    () => [ks2([1, 2, 3], [3.1]), 1],
    () => [ks2([1, 2, 3], [0.8, 0.9]), 1],
    () => [ks2([1, 2, 3], [0.8, 1], _discrete_), 2 / 3],
    () => [ks2([1, 2, 3], [0.8, 2], _discrete_), 1 / 2],
    () => [ks2([1, 2, 3], [0.8, 3]), 1 / 2],
    () => [ks2([1, 2, 3], [0.8, 3.1]), 1 / 2],
    () => [ks2([1, 2, 3], [1, 1.5]), 2 / 3],
    () => [ks2([1, 2, 3], [1, 2], _discrete_), 1 / 3],
    () => [ks2([1, 2, 3], [1, 3], _discrete_), 1 / 6],
    () => [ks2([1, 2, 3], [1, 3.1], _discrete_), 1 / 2],
    () => [ks2([1, 2, 3], [1.5, 2], _discrete_), 1 / 3],
    () => [ks2([1, 2, 3], [1.5, 3], _discrete_), 1 / 3],
    () => [ks2([1, 2, 3], [1.5, 3.1]), 1 / 2],
    () => [ks2([1, 2, 3], [2, 2.5], _discrete_), 1 / 3],
    () => [ks2([1, 2, 3], [2, 3], _discrete_), 1 / 3],
    () => [ks2([1, 2, 3], [2, 3.1], _discrete_), 1 / 2],
    () => [ks2([1, 2, 3], [2.5, 3], _discrete_), 2 / 3],
    () => [ks2([1, 2, 3], [2.5, 3.1]), 2 / 3],
    () => [ks2([1, 2, 3], [3, 3.1], _discrete_), 2 / 3],
    () => [ks2([1, 2, 3], [3.1, 3.2]), 1],
    // test that ordering does not matter
    () => [ks2([3, 2, 1], [0.8, 3.1]), 1 / 2],
    () => [ks2([3, 2, 1], [3.1, 0.8]), 1 / 2],
    // test extreme weights equivalent to dropping values
    () => [ks2([1, 2, 3], [1, 3], { wK: [1, 0], discrete: true }), 2 / 3],
    () => [ks2([1, 2, 3], [1, 3], { wK: [0, 1], discrete: true }), 2 / 3],
    () => [ks2([1, 2, 3], [1, 3], { wJ: [1, 0, 1], discrete: true }), 0],
    () => [ks2([1, 2, 3], [1, 3], { wJ: [1, 0, 1], discrete: true }), 0],
    () => [ks2([1, 2, 3], [2.5, 3.1], { wK: [0, 1] }), 1],
    () => [ks2([1, 2, 3], [2.5, 3.1], { wK: [1, 0] }), 2 / 3],
    // test that sorting can be skipped iff already sorted
    () =>
      ks2(xJ.slice(), yK.slice()) == ks2(xJ_sorted.slice(), yK_sorted.slice()),
    () =>
      ks2(xJ.slice(), yK.slice(), { xj_sorted: true }) !=
      ks2(xJ_sorted, yK_sorted),
    () =>
      ks2(xJ.slice(), yK.slice(), { yk_sorted: true }) !=
      ks2(xJ_sorted, yK_sorted),
    () =>
      ks2(xJ.slice(), yK.slice()) ==
      ks2(xJ_sorted, yK_sorted, { xj_sorted: true }),
    () =>
      ks2(xJ.slice(), yK.slice()) ==
      ks2(xJ_sorted, yK_sorted, { yk_sorted: true }),
    () =>
      ks2(xJ.slice(), yK.slice()) ==
      ks2(xJ_sorted, yK_sorted, { xj_sorted: true, yk_sorted: true }),
    // test unweighted one-sample case is always 0 (empirical against itself)
    () => [ks2([1]), 0],
    () => [ks2([1, 2]), 0],
    () => [ks2([1, 2, 2]), 0],
    () => [ks2([1, 2, 2], null, _discrete_), 0],
  )
}

// NOTE: ks1 is a wrapper over ks2 using weights and sorting options, already tested above for ks1

// TODO: test ks2_cdf against previously computed exact CDFs:
// check_eval_eq('ks_cdf_at(100, 100, .05)', '0.0003667078424175463')
// check_eval_eq('ks_cdf_at(100, 100, .1)', '0.30062580086898405')
// check_eval_eq('ks_cdf_at(100, 100, .2)', '0.9633689472928807')
// check_eval_eq('ks_cdf_at(100, 100, .3)', '0.9997531803918271')
// check_eval_eq('ks_cdf_at(100, 200, .1)', '0.4824493364181245')
// check_eval_eq('ks_cdf_at(200, 100, .1)', '0.4824493364181245')
