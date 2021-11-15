// flip ([p=0.5])
const flip = (p = 0.5) => Math.random() < p

function _test_flip() {
  check(
    () => is_boolean(flip()),
    () => flip(0) === false,
    () => flip(1) === true,
    () => flip('a') === false, // …<p false for non-number p
  )
}

function _benchmark_flip() {
  benchmark(
    () => flip(),
    () => Math.random(),
  )
}

// uniform ([a],[b])
// [uniform](https://en.wikipedia.org/wiki/Continuous_uniform_distribution) on `[0,1)`,`[0,a)`, or `[a,b)`
// | `[0,1)` | if `a` and `b` omitted
// | `[0,a)` | if `b` omitted
// | `[a,b)` | otherwise
const uniform = (a, b) => {
  if (a === undefined) return Math.random() // shortcut
  if (b === undefined) return uniform(0, a)
  if (!is_number(a) || !is_number(b) || b <= a) return NaN
  return a + Math.random() * (b - a)
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

function _benchmark_uniform() {
  benchmark(
    () => uniform(),
    () => uniform(1),
    () => uniform(0, 1),
    () => Math.random(),
  )
}

// discrete_uniform ([a],[b])
// [uniform](https://en.wikipedia.org/wiki/Discrete_uniform_distribution) on `{0,1}`,`{0,…,a-1}`, or `{a,…,b}`
// | `{0,1}`     | if `a` and `b` omitted
// | `{0,…,a-1}` | if `b` omitted
// | `{a,…,b}`   | otherwise
const discrete_uniform = (a, b) => {
  const u = Math.random()
  if (a === undefined) return ~~(2 * u) // {0,1}
  if (b === undefined) return is_integer(a) && a > 0 ? ~~(u * a) : NaN // {0,…,a-1}
  return is_integer(a) && is_integer(b) && b >= a
    ? ~~(a + u * (b + 1 - a))
    : NaN // {0,…,b}
}

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

// discrete(wJ, [sum_wj])
// [discrete](https://en.wikipedia.org/wiki/Categorical_distribution) on `{0,…,J-1}` w/ prob. `P(j)∝wJ[j]`
// normalizer `sum_wj` can be passed if known
// faster if `wJ` is sorted by decreasing weight
// `≡ discrete_uniform(J)` if `sum_wj==0`
// assumes `wj>=0` and `sum_wj>=0`
const discrete = (wJ, sum_wj) => {
  if (!is_array(wJ)) fatal(`non-array argument`)
  if (wJ.length == 0) return NaN
  sum_wj ??= sum(wJ)
  if (sum_wj == 0) return discrete_uniform(wJ.length)
  if (sum_wj < 0) fatal(`sum_wj<0: ${sum_wj}`)
  // if (min(wJ) < 0) fatal(`wj<0: ${min(wJ)}`)
  let j = 0
  let w = 0
  let wt = Math.random() * sum_wj
  do {
    w += wJ[j++]
  } while (w < wt && j < wJ.length)
  return j - 1
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

// [triangular](https://en.wikipedia.org/wiki/Triangular_distribution) on `[0,1]`, `[0,a]`, or `[a,b]`
const triangular = (a, b, c) => {
  if (a === undefined) return triangular(0, 1, 0.5)
  if (b === undefined) return triangular(0, a, a / 2)
  if (c === undefined) return triangular(a, b, (a + b) / 2)
  if (!is_number(a) || !is_number(b) || !is_number(c)) return NaN
  if (a > b || c < a || c > b) return NaN
  // from https://github.com/jstat/jstat/blob/master/src/distribution.js
  const u = Math.random()
  if (u < (c - a) / (b - a)) return a + Math.sqrt(u * (b - a) * (c - a))
  return b - Math.sqrt((1 - u) * (b - a) * (b - c))
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

function _benchmark_triangular() {
  benchmark(
    () => triangular(),
    () => triangular(1),
    () => triangular(0, 1, 0.5),
    () => uniform(0, 1),
    () => Math.random(),
  )
}

// sample(J, [sampler=uniform])
// samples array of `J` values from `sampler`
function sample(J, sampler = Math.random) {
  if (J <= 0) return []
  const xJ = new Array(J)
  for (let j = 0; j < J; ++j) xJ[j] = sampler()
  return xJ
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

function _benchmark_sample() {
  benchmark(
    () => sample(100),
    () => array(100, j => Math.random()),
    () => array(100, Math.random), // unsafe since args are passed through
  )
}

// shuffle(xJ, [js], [je])
// shuffles elements of array `xJ` _in place_
// returns array w/ elements shuffled in place
// can be restricted to indices `js,…,je-1`
// uses [Fisher-Yates-Durstenfeld algorithm](https://en.wikipedia.org/wiki/Fisher–Yates_shuffle#The_modern_algorithm)
function shuffle(xJ, js, je) {
  if (!is_array(xJ)) fatal(`non-array argument`)
  js ??= 0
  je ??= xJ.length
  if (!is_integer(js) || !is_integer(je)) fatal(`non-integer indices`)
  if (js > je || js < 0 || je > xJ.length) fatal(`invalid indices ${js},${je}`)
  for (let j = je - 1; j > js; j--) {
    const jr = js + ~~(Math.random() * (j - js + 1))
    const tmp = xJ[j]
    xJ[j] = xJ[jr]
    xJ[jr] = tmp
  }
  return xJ
}

function _test_shuffle() {
  check(
    () => throws(() => shuffle()),
    () => throws(() => shuffle(0)),
    () => throws(() => shuffle([], 0, 1)),
    () => throws(() => shuffle([], 0, 1)),
    () => throws(() => shuffle([0], 1, 0)),
    () => throws(() => shuffle([0], 0, 2)),
    () => throws(() => shuffle([0], -1, 1)),
    () => [shuffle([0], 0, 1), [0]],
    () => [shuffle([0]), [0]],
    // TODO: perform chi-squared or binomial test on counts ...
    //() => [shuffle([0]), [0]],
  )
}

const approx_equal = (x, y, ε = 0.000001) => Math.abs(y - x) < ε

// from http://www.math.ucla.edu/~tom/distributions/binomial.html
// via https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/distribution.js#L727
function _betinc(x, a, b, eps) {
  let a0 = 0
  let b0 = 1
  let a1 = 1
  let b1 = 1
  let m9 = 0
  let a2 = 0
  let c9
  while (Math.abs((a1 - a2) / a1) > eps) {
    a2 = a1
    c9 = (-(a + m9) * (a + b + m9) * x) / (a + 2 * m9) / (a + 2 * m9 + 1)
    a0 = a1 + c9 * a0
    b0 = b1 + c9 * b0
    m9 = m9 + 1
    c9 = (m9 * (b - m9) * x) / (a + 2 * m9 - 1) / (a + 2 * m9)
    a1 = a0 + c9 * a1
    b1 = b0 + c9 * b1
    a0 = a0 / b1
    b0 = b0 / b1
    a1 = a1 / b1
    b1 = 1
  }
  return a1 / a
}

// from https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/special.js#L5
function _log_gamma(x) {
  var j = 0
  var cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ]
  var ser = 1.000000000190015
  var xx, y, tmp
  tmp = (y = xx = x) + 5.5
  tmp -= (xx + 0.5) * Math.log(tmp)
  for (; j < 6; j++) ser += cof[j] / ++y
  return Math.log((2.5066282746310005 * ser) / xx) - tmp
}

function binomial_cdf(x, n, p) {
  // from https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/distribution.js#L764
  let betacdf
  let eps = 1e-10
  if (x < 0) return 0
  if (x >= n) return 1
  if (p < 0 || p > 1 || n <= 0) return NaN
  x = Math.floor(x)
  let z = p
  let a = x + 1
  let b = n - x
  let s = a + b
  let bt = Math.exp(
    _log_gamma(s) -
      _log_gamma(b) -
      _log_gamma(a) +
      a * Math.log(z) +
      b * Math.log(1 - z),
  )
  if (z < (a + 1) / (s + 2)) betacdf = bt * _betinc(z, a, b, eps)
  else betacdf = 1 - bt * _betinc(1 - z, b, a, eps)
  return Math.round((1 - betacdf) * (1 / eps)) / (1 / eps)
}

function _test_binomial_cdf() {
  check(() => [binomial_cdf(5, 10, 0.5), 0.62304687499999866773, approx_equal])
}

// TODO: use throws() in tests above
// TODO: test sample and shuffle, then continue w/ array.js leading up to one-sided and two-sided ks tests

// adapted from https://github.com/jstat/jstat/blob/master/src/vector.js
function min(xJ) {
  if (!isArray(xJ)) return min(Array.from(arguments))
  let z = inf
  const J = xJ.length
  for (let j = 0; j < J; ++j) if (xJ[j] < z) z = xJ[j]
  return z
}
const min2 = (xJ, z = 0) => (each(xJ, x => x >= z || (z = x)), z) // reference
function max(xJ) {
  if (!isArray(xJ)) return max(Array.from(arguments))
  let z = -inf
  const J = xJ.length
  for (let j = 0; j < J; ++j) if (xJ[j] > z) z = xJ[j]
  return z
}
function sum(xJ) {
  if (!is_array(xJ)) return sum(Array.from(arguments))
  let z = 0
  const J = xJ.length
  for (let j = 0; j < J; ++j) z += xJ[j]
  return z
}
const mean = xJ => sum(xJ) / xJ.length

// from https://en.wikipedia.org/wiki/Circular_mean
function circular_mean(xJ, r = Math.PI) {
  // assumes xJ in [-r,r]
  if (xJ.length == 0) return NaN
  const z = r == Math.PI ? 1 : Math.PI / r
  const θJ = z == 1 ? xJ : xJ.map(x => x * z)
  return Math.atan2(sumf(θJ, Math.sin), sumf(θJ, Math.cos)) / z
}

// from https://en.wikipedia.org/wiki/Directional_statistics
function circular_stdev(xJ, r = Math.PI) {
  // assumes xJ in [-r,r]
  if (xJ.length == 0) return NaN
  const z = r == Math.PI ? 1 : Math.PI / r
  const θJ = z == 1 ? xJ : xJ.map(x => x * z)
  const R = Math.sqrt(meanf(θJ, Math.sin) ** 2 + meanf(θJ, Math.cos) ** 2)
  return Math.sqrt(-2 * Math.log(R)) / z
}

function sumsqrd(xJ) {
  let z = 0
  const J = xJ.length
  for (let j = 0; j < J; ++j) {
    const x = xJ[j]
    z += x * x
  }
  return z
}
const sumsqrd2 = xJ => sumf(xJ, x => x * x) // reference

function sumsqerr(xJ) {
  let z = 0
  const J = xJ.length,
    m = mean(xJ)
  for (let j = 0; j < J; ++j) {
    const y = xJ[j] - m
    z += y * y
  }
  return z
}
const variance = (xJ, sample) => sumsqerr(xJ) / (xJ.length - (sample ? 1 : 0))
const stdev = (xJ, sample) => Math.sqrt(variance(xJ, sample))

function median(xJ) {
  const J = xJ.length
  xJ = xJ.slice().sort((a, b) => a - b)
  // NOTE: (x&1)=x%2 and (x|0)=~~x
  return !(J & 1) ? (xJ[J / 2 - 1] + xJ[J / 2]) / 2 : xJ[(J / 2) | 0]
}
// same as jStat.quantiles but handles arr.length<=1 case
function quantiles(xJ, qK, ɑ = 0.375, β = 0.375) {
  const J = xJ.length
  if (J <= 1) return qK.map(q => xJ[0])
  xJ = xJ.slice().sort((a, b) => a - b)
  let zK = array(qK.length)
  each(qK, (q, k) => {
    const m = ɑ + q * (1 - ɑ - β)
    const a = J * q + m
    const r = ~~clip(a, 1, J - 1)
    const g = clip(a - r, 0, 1)
    zK[k] = (1 - g) * xJ[r - 1] + g * xJ[r]
  })
  return zK
}
// effective sample size (ESS) approximates Var(target)/MSE(sample)
// see "Rethinking the Effective Sample Size" for discussion
function ess(wJ) {
  // const [s,ss] = reduce(wJ, (y,x)=>[y[0]+x,y[1]+x*x], [0,0])
  let s = 0,
    ss = 0
  const J = wJ.length
  for (let j = 0; j < J; ++j) {
    const w = wJ[j]
    s += w
    ss += w * w
  }
  return (s * s) / ss
}
function essf(xJ, f = x => x) {
  let s = 0,
    ss = 0
  const J = xJ.length
  for (let j = 0; j < J; ++j) {
    const w = f(xJ[j])
    s += w
    ss += w * w
  }
  return (s * s) / ss
}
