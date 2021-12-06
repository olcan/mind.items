function _test_random_boolean() {
  check(
    () => is_boolean(random_boolean()),
    () => random_boolean(0) === false,
    () => random_boolean(1) === true,
    () => random_boolean('a') === false // …<p false for non-number p
  )
}

function _test_random_uniform() {
  check(
    () => random_uniform() >= 0,
    () => random_uniform() < 1,
    () => random_uniform(1) < 1,
    () => random_uniform(0.001) < 0.001,
    () => random_uniform(0.999, 1) >= 0.999,
    () => random_uniform(2, 3) >= 2,
    () => random_uniform(2, 3) < 3,
    // empty sets return NaN
    () => is_nan(random_uniform(0)),
    () => is_nan(random_uniform(0, 0)),
    () => is_nan(random_uniform(1, 1)),
    () => is_nan(random_uniform(2, 1)),
    () => is_nan(random_uniform(2, 2)),
    // invalid sets also return NaN
    () => is_nan(random_uniform('a')),
    () => is_nan(random_uniform(0, 'b')),
    // ks test against uniform cdf
    () => [ks1_test(random_array(1000), x => x), 1e-9, _.gt]
  )
}

// binomial test for occurrences of x in sample
// e.g. one-in-a-billion failure/rejection for n=1000, p=1/2 is k<=~400
// e.g. one-in-a-billion failure/rejection for n=1000, p=1/6 is k<=~100
// e.g. one-in-a-billion failure/rejection for n=300, p=1/2 is k<=~100
// e.g. one-in-a-billion failure/rejection for n=100, p=1/2 is k<=~20
const _binomial_test_sample = (sampler, x, p, n = 1000, ɑ = 1e-9) => [
  binomial_test(
    n,
    _.sumBy(random_array(n, sampler), s => equal(s, x)),
    p
  ),
  ɑ,
  _.gt, // i.e. can not reject null (correctness) at level ɑ
]

function _test_random_discrete_uniform() {
  check(
    () => random_discrete_uniform() >= 0,
    () => random_discrete_uniform() <= 1,
    () => random_discrete_uniform(1) === 0,
    () => random_discrete_uniform(2, 2) === 2,
    () => random_discrete_uniform(2, 3) >= 2,
    () => random_discrete_uniform(2, 3) <= 3,
    // empty sets return NaN
    () => is_nan(random_discrete_uniform(2, 1)),
    () => is_nan(random_discrete_uniform(0)),
    // invalid sets also return NaN
    () => is_nan(random_discrete_uniform('a')),
    () => is_nan(random_discrete_uniform(0, 'b')),
    () => _binomial_test_sample(() => random_discrete_uniform(0, 1), 0, 1 / 2),
    () => _binomial_test_sample(() => random_discrete_uniform(0, 1), 1, 1 / 2),
    () => _binomial_test_sample(() => random_discrete_uniform(1, 3), 1, 1 / 3),
    () => _binomial_test_sample(() => random_discrete_uniform(1, 3), 2, 1 / 3),
    () => _binomial_test_sample(() => random_discrete_uniform(1, 3), 3, 1 / 3)
  )
}

function _test_random_discrete() {
  check(
    () => throws(() => random_discrete(0)),
    () => throws(() => random_discrete([-1])),
    () => throws(() => random_discrete([0], -1)),
    () => is_nan(random_discrete([], -1)),
    () => is_nan(random_discrete([])),
    () => [random_discrete([0]), 0],
    () => [random_discrete([1, 0]), 0],
    () => [random_discrete([0, 1]), 1],
    () => [random_discrete([0, 0, 1]), 2],
    () => _binomial_test_sample(() => random_discrete([1, 1]), 0, 1 / 2),
    () => _binomial_test_sample(() => random_discrete([1, 1]), 1, 1 / 2),
    () => _binomial_test_sample(() => random_discrete([1, 2]), 0, 1 / 3),
    () => _binomial_test_sample(() => random_discrete([1, 2]), 1, 2 / 3)
  )
}

function _test_random_discrete_array() {
  check(
    () => throws(() => random_discrete_array(0)),
    () => throws(() => random_discrete_array([0], [-1])),
    () => throws(() => random_discrete_array([0], [0], -1)),
    () => throws(() => random_discrete_array(0, [0], 1)),
    () => throws(() => random_discrete_array([0], 0, 1)),
    () => [random_discrete_array([], [], -1), []],
    () => [random_discrete_array([0], [], -1), [NaN]],
    () => [random_discrete_array([0], [0]), [0]],
    () => [random_discrete_array([0, 0], [0]), [0, 0]],
    () => [random_discrete_array([0, 0], [1, 0]), [0, 0]],
    () => [random_discrete_array([0, 0], [0, 1]), [1, 1]],
    () => [random_discrete_array([0, 0, 0], [0, 0, 1]), [2, 2, 2]],
    () => [random_discrete_array([0, 0, 0], [0, 1, 0]), [1, 1, 1]],
    () => [random_discrete_array([0, 0, 0], [1, 0, 0]), [0, 0, 0]]
  )
}

function _test_random_triangular() {
  // triangular cdf from https://en.wikipedia.org/wiki/Triangular_distribution
  function triangular_cdf(x) {
    if (x <= 0.5) return 2 * x * x
    else return 1 - 2 * (1 - x) * (1 - x)
  }
  check(
    () => random_triangular() >= 0,
    () => random_triangular() <= 1,
    () => random_triangular(1) <= 1,
    () => random_triangular(0.001) <= 0.001,
    () => random_triangular(0.999, 1) >= 0.999,
    () => random_triangular(2, 3) >= 2,
    () => random_triangular(2, 3) <= 3,
    () => [random_triangular(0), 0],
    () => [random_triangular(1, 1), 1],
    () => [random_triangular(2, 2), 2],
    () => [random_triangular(1, 1, 1), 1],
    () => [random_triangular(2, 2, 2), 2],
    // empty sets return NaN
    () => is_nan(random_triangular(-1)),
    () => is_nan(random_triangular(1, 0)),
    () => is_nan(random_triangular(0, 1, 2)),
    () => is_nan(random_triangular(0, 1, -1)),
    // invalid sets also return NaN
    () => is_nan(random_triangular('a')),
    () => is_nan(random_triangular(0, 'b')),
    () => is_nan(random_triangular(0, 1, 'c')),
    // ks test against triangular cdf
    () => [
      ks1_test(random_array(1000, random_triangular), triangular_cdf),
      1e-9,
      _.gt,
    ]
  )
}

function _test_random_array() {
  check(
    () => [random_array(-1), []],
    () => [random_array(0), []],
    () => [random_array(1, () => 1), [1]],
    () => [random_array(2, () => 1), [1, 1]],
    () => [random_array(2, j => j), [undefined, undefined]], // no args passed
    () => [random_array([], () => 1), []],
    () => [random_array([0], () => 1), [1]],
    () => [random_array([0, 0], () => 1), [1, 1]],
    () => mina(random_array(2, random, x => x > 0.5)) > 0.5
  )
}

function _test_random_shuffle() {
  check(
    () => [random_shuffle([0], 0, 1), [0]],
    () => [random_shuffle([0]), [0]],
    () => _binomial_test_sample(() => random_shuffle([0, 1]), [0, 1], 1 / 2),
    () => _binomial_test_sample(() => random_shuffle([0, 1]), [1, 0], 1 / 2),
    () =>
      _binomial_test_sample(() => random_shuffle([0, 1, 2]), [0, 1, 2], 1 / 6),
    () =>
      _binomial_test_sample(() => random_shuffle([0, 1, 2]), [0, 2, 1], 1 / 6),
    () =>
      _binomial_test_sample(() => random_shuffle([0, 1, 2]), [1, 0, 2], 1 / 6),
    () =>
      _binomial_test_sample(() => random_shuffle([0, 1, 2]), [1, 2, 0], 1 / 6),
    () =>
      _binomial_test_sample(() => random_shuffle([0, 1, 2]), [2, 0, 1], 1 / 6),
    () =>
      _binomial_test_sample(() => random_shuffle([0, 1, 2]), [2, 1, 0], 1 / 6)
  )
}

function _test_approx_equal() {
  check(
    () => approx_equal(0, 0),
    () => !approx_equal(0, 1e-10),
    () => !approx_equal(1e-10, 0),
    () => !approx_equal(1e-10, 0, 0, 1e-11),
    () => approx_equal(1e-10, 0, 0, 1e-10), // allows sufficient abs error
    () => !approx_equal(1e-10, 1e-10 + 1e-15, 1e-6),
    () => !approx_equal(1e-10 + 1e-15, 1e-10, 1e-6),
    () => !approx_equal(-1e-10, -1e-10 + 1e-15, 1e-6),
    () => !approx_equal(-1e-10 + 1e-15, -1e-10, 1e-6),
    () => approx_equal(1e-10, 1e-10 + 1e-16, 1e-6),
    () => !approx_equal(1e-10, 1e-10 - 1e-16, 1e-6),
    () => approx_equal(1e-10, 1e-10 - 1e-17, 1e-6),
    () => approx_equal(-1e-10, -1e-10 - 1e-16, 1e-6),
    () => !approx_equal(-1e-10, -1e-10 + 1e-16, 1e-6),
    () => approx_equal(-1e-10, -1e-10 + 1e-17, 1e-6),
    () => approx_equal(-1e-10 + 1e-17, -1e-10, 1e-6)
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
    () => [binomial_cdf(5, 10, 0.9), 0.0016349374000000031076, approx_equal]
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
  const xJ = random_array(100)
  const yK = random_array(200)
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
    () => [ks2([1, 2, 2], null, _discrete_), 0]
  )
}

// NOTE: ks1 wraps ks2 using weights and sorting options tested above
const _test_ks2_functions = ['ks1', 'ks2']

function _test_kolmogorov_cdf() {
  // reference values from EllipticTheta[4,0,Exp[-2*x*x]] in Mathematica
  const eq3 = (a, b) => approx_equal(a, b, 1e-3) // tightest that passes
  check(
    () => [kolmogorov_cdf(1 / 4), 0.0000000268, eq3],
    () => [kolmogorov_cdf(1 / 2), 0.0360547563, eq3],
    () => [kolmogorov_cdf(1), 0.7300003283, eq3],
    () => [kolmogorov_cdf(2), 0.9993290747, eq3],
    () => [kolmogorov_cdf(3), 0.9999999695, eq3]
  )
}

function _test_ks1_cdf() {
  // reference values from tables in "Computing the Two-Sided Kolmogorov-Smirnov Distribution" using various algorithms (see tables for details)
  const eq3 = (a, b) => approx_equal(a, b, 1e-3) // tightest that passes
  check(
    // table 6
    () => [ks1_cdf(0.6, 50), 1 - 9.63407045614234e-18, eq3],
    // table 7
    () => [ks1_cdf(0.44721359549996, 20), 1 - 0.000362739697817367, eq3],
    () => [ks1_cdf(0.2, 100), 1 - 0.00055519273280281, eq3],
    // table 8
    () => [ks1_cdf(0.0856348838577675, 300), 1 - 0.0230986730185827, eq3],
    () => [ks1_cdf(0.0469041575982343, 1000), 1 - 0.0237703399363784, eq3],
    // table 9
    () => [ks1_cdf(0.020976176963403, 5000), 1 - 0.0242079291327157, eq3],
    // table 10
    () => [ks1_cdf(0.0042799499222603, 5000), 1.42355083146456e-5, eq3],
    // table 11
    () => [ks1_cdf(0.00269619949977585, 10000), 4.83345410767114e-7, eq3],
    // table 12
    () => [ks1_cdf(0.000790565462224666, 100001), 2.90707424915525e-8, eq3],
    () => [ks1_cdf(0.00632452369779733, 100001), 0.999331933307205, eq3]
  )
}

function _test_ks2_cdf() {
  // rough test against commonly used critical values specified on Wikipedia at https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Two-sample_Kolmogorov–Smirnov_test
  const scaling = (J, K = J) => Math.sqrt((J + K) / (J * K))
  const within = (x, a, b) => x >= a && x <= b
  check(
    () => within(ks2_cdf(1.073 * scaling(100), 100), 0.8, 0.85),
    () => within(ks2_cdf(1.138 * scaling(100), 100), 0.85, 0.9),
    () => within(ks2_cdf(1.224 * scaling(100), 100), 0.9, 0.95),
    () => within(ks2_cdf(1.358 * scaling(100), 100), 0.95, 0.975),
    () => within(ks2_cdf(1.48 * scaling(100), 100), 0.975, 0.99),
    () => within(ks2_cdf(1.628 * scaling(100), 100), 0.99, 0.995),
    () => within(ks2_cdf(1.731 * scaling(100), 100), 0.995, 0.999),
    () => ks2_cdf(1.949 * scaling(100), 100) >= 0.999,
    () => within(ks2_cdf(1.073 * scaling(100, 10), 100, 10), 0.8, 0.85),
    () => within(ks2_cdf(1.138 * scaling(100, 10), 100, 10), 0.85, 0.9),
    () => within(ks2_cdf(1.224 * scaling(100, 10), 100, 10), 0.9, 0.95),
    () => within(ks2_cdf(1.358 * scaling(100, 10), 100, 10), 0.95, 0.975),
    () => within(ks2_cdf(1.48 * scaling(100, 10), 100, 10), 0.975, 0.99),
    () => within(ks2_cdf(1.628 * scaling(100, 10), 100, 10), 0.99, 0.995),
    () => within(ks2_cdf(1.731 * scaling(100, 10), 100, 10), 0.995, 0.999),
    () => ks2_cdf(1.949 * scaling(100, 10), 100, 10) >= 0.999
  )
}

function _test_ks1_test() {
  // test uniformity of ks1_test (p-value) using both _itself_ and binomial test
  // this is an end-to-end test of ks1, ks1_cdf, and ks1_test
  // we use smaller sample sizes to manage running time
  const sample_ks1_test = () => ks1_test(random_array(500), x => x)
  const sample_ks1_test_sign = () => (sample_ks1_test() > 0.5 ? 1 : 0)
  check(
    () => ks1_test(random_array(100, sample_ks1_test), x => x) > 1e-9,
    // e.g. one-in-a-billion failure for n=100, p=1/2 is k<=~20
    () => _binomial_test_sample(sample_ks1_test_sign, 0, 1 / 2, 100)
  )
}

function _test_ks2_test() {
  // test uniformity of ks2_test (p-value) using both _itself_ and binomial test
  // this is an end-to-end test of ks2, ks2_cdf, and ks2_test
  // we use smaller sample sizes to manage running time
  const sample_ks2_test = () => ks2_test(random_array(500), random_array(500))
  const sample_ks2_test_sign = () => (sample_ks2_test() > 0.5 ? 1 : 0)
  check(
    () =>
      ks2_test(
        random_array(100, sample_ks2_test),
        random_array(100, sample_ks2_test)
      ) > 1e-9,
    // e.g. one-in-a-billion failure for n=100, p=1/2 is k<=~20
    () => _binomial_test_sample(sample_ks2_test_sign, 0, 1 / 2, 100)
  )
}

function _test_mina() {
  check(
    () => throws(() => mina()),
    () => throws(() => mina(0)),
    () => [mina([]), inf],
    () => [mina([0]), 0],
    () => [mina([0, -1]), -1],
    () => [mina([0, -1, -2]), -2],
    () => [mina([0, -1, -2, 'a']), -2] // elements that fail < are ignored
  )
}

function _test_minf() {
  check(
    () => throws(() => minf()),
    () => throws(() => minf(0)),
    () => [minf([]), inf],
    () => [minf([0, -1, -2], x => 2 * x), -4],
    () => [minf([0, -1, -2, 'a'], x => 2 * x), -4] // elements that fail < are ignored
  )
}

function _test_maxa() {
  check(
    () => throws(() => maxa()),
    () => throws(() => maxa(0)),
    () => [maxa([]), -inf],
    () => [maxa([0]), 0],
    () => [maxa([0, 1]), 1],
    () => [maxa([0, 1, 2]), 2],
    () => [maxa([0, 1, 2, 'a']), 2] // elements that fail > are ignored
  )
}

function _test_maxf() {
  check(
    () => throws(() => maxf()),
    () => throws(() => maxf(0)),
    () => [maxf([]), -inf],
    () => [maxf([0, 1, 2], x => 2 * x), 4],
    () => [maxf([0, 1, 2, 'a'], x => 2 * x), 4] // elements that fail > are ignored
  )
}

function _test_sum() {
  check(
    () => [sum(), 0],
    () => [sum(0), 0],
    () => [sum(0, 1), 1],
    () => [sum(0, 1, 2), 3],
    () => [sum([0, 1, 2]), 3],
    () => [sum([0, 1, 2, 'a']), '3a'] // invalid for non-numbers
  )
}

function _test_sumf() {
  check(
    () => throws(() => sumf()),
    () => throws(() => sumf(0)),
    () => [sumf([0, 1, 2], x => 2 * x), 6],
    () => [sumf([0, 1, 2, 'a'], x => 2 * x), NaN] // invalid for non-numbers
  )
}
