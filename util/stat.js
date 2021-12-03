// flip ([p=0.5])
const flip = (p = 0.5) => Math.random() < p

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

const discrete_uniform_array = (xJ, a, b) => {
  if (a === undefined) return fill(xJ, j => ~~(2 * Math.random()))
  if (b === undefined)
    return is_integer(a) && a > 0
      ? fill(xJ, j => ~~(Math.random() * a))
      : fill(xJ, NaN)
  return is_integer(a) && is_integer(b) && b >= a
    ? fill(xJ, j => ~~(a + Math.random() * (b + 1 - a)))
    : fill(xJ, NaN)
}

// discrete(wJ, [sum_wj])
// [discrete](https://en.wikipedia.org/wiki/Categorical_distribution) on `{0,…,J-1}` w/ prob. `P(j)∝wJ[j]`
// normalizer `sum_wj` can be passed if known
// faster if `wJ` is sorted by decreasing weight
// `≡ discrete_uniform(J)` if `sum_wj==0`
// assumes `wj>=0` and `sum_wj>=0`
const discrete = (wJ, sum_wj) => {
  assert(is_array(wJ), `non-array argument`)
  if (wJ.length == 0) return NaN
  sum_wj ??= sum(wJ)
  assert(sum_wj >= 0, `sum_wj<0: ${sum_wj}`)
  if (sum_wj == 0) return discrete_uniform(wJ.length)
  // assert(min(wJ) >= 0,`wj<0: ${min(wJ)}`)
  let j = 0
  let w = 0
  let wt = Math.random() * sum_wj
  do {
    w += wJ[j++]
  } while (w < wt && j < wJ.length)
  return j - 1
}

function discrete_array(jK, wJ, sum_wj) {
  assert(is_array(jK) && is_array(wJ), `non-array argument`)
  if (jK.length == 0) return jK
  if (wJ.length == 0) return fill(jK, NaN)
  sum_wj ??= sum(wJ)
  assert(sum_wj >= 0, `sum_wj<0: ${sum_wj}`)
  if (sum_wj == 0) return discrete_uniform_array(jK, wJ.length)
  // assert(min(wJ) >= 0,`wj<0: ${min(wJ)}`)
  // generate (exp) increments for K+1 uniform numbers in [0,sum_wj) w/o sorting
  let rK = apply(sample_array(jK), r => -Math.log(r))
  const z = sum_wj / (sum(rK) - Math.log(Math.random()))
  apply(rK, r => r * z) // rescale to [0,sum_wJ)
  let k = 0
  let j = 0
  let w = 0
  let wt = 0
  do {
    wt += rK[k]
    while (w < wt && j < wJ.length) w += wJ[j++]
    rK[k++] = j - 1
  } while (k < rK.length)
  return rK
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

// sample_array(J|xJ, [sampler=uniform])
// sample array of `J` values from `sampler`
function sample_array(a, sampler = Math.random) {
  const [J, xJ] = is_array(a)
    ? [a.length, a]
    : [~~a, new Array(Math.max(0, ~~a))]
  for (let j = 0; j < J; ++j) xJ[j] = sampler()
  return xJ
}

// shuffle(xJ, [js=0], [je=J])
// shuffles elements of array `xJ` _in place_
// returns array w/ elements shuffled in place
// can be restricted to indices `js,…,je-1`
// uses [Fisher-Yates-Durstenfeld algorithm](https://en.wikipedia.org/wiki/Fisher–Yates_shuffle#The_modern_algorithm)
function shuffle(xJ, js = 0, je = xJ.length) {
  js = Math.max(0, js)
  je = Math.min(je, xJ.length)
  for (let j = je - 1; j > js; j--) {
    const jr = js + ~~(Math.random() * (j - js + 1))
    const tmp = xJ[j]
    xJ[j] = xJ[jr]
    xJ[jr] = tmp
  }
  return xJ
}

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

// `x≈y ≡ |x-y|/max(|x|,|y|))≤ε OR |x-y|≤εa`
// default `εa=0` means `x==y` is required for small `x,y`
const approx_equal = (x, y, ε = 1e-6, εa = 0) =>
  Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y)) <= ε ||
  Math.abs(x - y) <= εa

// `P(X<=x)` for [binomial distribution](https://en.wikipedia.org/wiki/Binomial_distribution)
function binomial_cdf(x, n, p) {
  // from https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/distribution.js#L764
  let betacdf
  let eps = 1e-10
  if (p < 0 || p > 1 || n <= 0) return NaN
  if (x < 0) return 0
  if (x >= n) return 1
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
      b * Math.log(1 - z)
  )
  if (z < (a + 1) / (s + 2)) betacdf = bt * _betinc(z, a, b, eps)
  else betacdf = 1 - bt * _betinc(1 - z, b, a, eps)
  return Math.round((1 - betacdf) * (1 / eps)) / (1 / eps)
}

// p-value for two-tailed [binomial test](https://en.wikipedia.org/wiki/Binomial_test)
function binomial_test(n, k, p) {
  // take k < n * p by convention
  if (k > n * p) {
    k = n - k
    p = 1 - p
  }
  // one-tailed test p-value is simply P(x<=k) = cdf(k,n,p)
  // for two-tailed test, add upper tail P(x>r) for r = floor(np+(np-k))
  // note this is based on deviation from mean instead of density (slower)
  return binomial_cdf(k, n, p) + 1 - binomial_cdf(~~(2 * n * p - k), n, p)
}

// ks2(xJ, yK, [options])
// two-sample [Kolmogorov-Smirnov](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic) statistic
// sorts arrays `xJ` and `yK` _in place_
// | `wJ`        | `1,…,1` | weights for `xJ`
// | `wK`        | `1,…,1` | weights for `yK`
// | `wj_sum`    | `J` | sum of weights `wJ`
// | `wk_sum`    | `K` | sum of weights `wK`
// | `xj_sorted` | `false` | assume `xJ` already sorted
// | `yk_sorted` | `false` | assume `yK` already sorted
// | `discrete`  | `false` | allow identical (discrete) values?
function ks2(xJ, yK, options = {}) {
  assert(is_array(xJ), `non-array first argument`)
  if (yK) assert(is_array(yK), `non-array second argument`)
  assert(is_object(options), `non-object options`)
  const { xj_sorted, yk_sorted, wJ, wj_sum, wK, wk_sum, discrete } = options
  let J = xJ.length
  let K = yK?.length ?? 0 // if yK missing, K=0 for now, K=J later
  // sort xJ and yK as needed
  if (!xj_sorted) xJ.sort((a, b) => a - b)
  if (!yk_sorted) yK?.sort((a, b) => a - b)
  const R = J + K
  const xR = yK ? r => (r < J ? xJ[r] : yK[r - J]) : r => xJ[r]
  // generate globally sorted indices rR
  // these are replaced below by cdf differences
  const rR = array(J + K)
  if (yK) {
    let j = 0
    let k = 0
    fill(rR, r => (k == K || xJ[j] <= yK[k] ? j++ : J + k++))
  } else fill(rR, r => r)

  // generate collision mask (applied at the end) if allowed
  // otherwise shuffle collision indices (equivalent to random noise)
  let mR
  if (discrete) {
    mR = array(J + K)
    fill(mR, r => (xR(rR[r]) != xR(rR[r + 1]) ? 1 : 0), 0, R - 1)
    mR[R - 1] = 1
  } else {
    let r_new = 0
    each(rR, (rr, r) => {
      if (r == R - 1 || xR(rr) != xR(rR[r + 1])) {
        // index r is last-of-kind
        if (r_new < r) shuffle(rR, r_new, r + 1)
        r_new = r + 1 // index r+1 is new
      }
    })
  }

  // NOTE: beyond this point J and K are treated as normalization constants
  if (!yK) K = J // if yK is missing, we assume K=J unless wK is given
  if (!wJ && !wK) {
    // unweighted samples
    if (yK) apply(rR, rr => (rr < J ? K /*≡+1/J*/ : -J) /*≡-1/K*/)
    else apply(rR, rr => K /*≡+1/J*/ - J /*≡-1/K*/)
  } else if (wJ && wK) {
    // both sides (J and K) weighted
    const _J = J
    J = wj_sum ?? sum(wJ)
    K = wk_sum ?? sum(wK)
    if (yK) apply(rR, rr => (rr < _J ? wJ[rr] * K : -wK[rr - _J] * J))
    else apply(rR, rr => wJ[rr] * K - wK[rr - _J] * J)
  } else if (wJ) {
    // J side weighted
    const _J = J
    J = wj_sum ?? sum(wJ)
    if (yK) apply(rR, rr => (rr < _J ? wJ[rr] * K : -J))
    else apply(rR, rr => wJ[rr] * K - J)
  } else {
    // K side weighted
    K = wk_sum ?? sum(wK)
    if (yK) apply(rR, rr => (rr < J ? K : -wK[rr - J] * J))
    else apply(rR, rr => K - wK[rr] * J)
  }
  apply(rR, (rr, r) => rr + rR[r - 1], 1) // accumulate cdf differences
  if (mR) map(rR, mR, (r, m) => r * m) // mask collisions
  const ks = max(apply(rR, Math.abs)) / (J * K)
  if (is_nan(ks) || is_inf(ks)) {
    console.debug('ks nan/inf', {
      J,
      K,
      wj_sum,
      wk_sum,
      wJ,
      wK,
      rR,
      xj_sorted,
      yk_sorted,
      discrete,
    })
    fatal('ks nan/inf (see debug console for details)')
  }
  return ks
}

// ks1(xJ, cdf, [options])
// one-sample [Kolmogorov-Smirnov](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic) statistic
// sorts array `xJ` _in place_
// | `wJ`        | `1,…,1` | weights for `xJ`
// | `wj_sum`    | `J`     | sum of weights `wJ`
// | `xj_sorted` | `false` | assume `xJ` already sorted
// | `discrete`  | `false` | allow identical (discrete) values?
function ks1(xJ, cdf, options = {}) {
  assert(is_array(xJ), 'non-array argument')
  let { xj_sorted, wK, wk_sum } = options
  assert(!wK, 'invalid option wK superceded by cdf for ks1')
  assert(!wk_sum, `invalid option wk_sum superceded by cdf for ks1`)
  if (!xj_sorted) xJ.sort((a, b) => a - b)
  wK = array(xJ.length)
  wK[0] = cdf(xJ[0])
  fill(wK, k => cdf(xJ[k]) - cdf(xJ[k - 1]), 1)
  return ks2(xJ, null, { ...options, xj_sorted: true, wK, wk_sum: 1 })
}

// `P(X<=x)` for [Kolmogorov distribution](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov_distribution)
// `= jacobiTheta(4, 0, Math.exp(-2*x*x))` using algorithm at [math.js](https://github.com/paulmasson/math/blob/29146e1a18b52d709770d1cbe17d8f0ad6bbdfd0/src/functions/elliptic-functions.js#L2)
// `≡ EllipticTheta[4,0,Exp[-2*x*x]]` in Mathematica (used for testing)
function kolmogorov_cdf(x, ε = 1e-10) {
  const q = Math.exp(-2 * x * x)
  let s = 0
  let p = 1
  let i = 1
  while (Math.abs(p) > ε) {
    p = (-q) ** (i * i)
    s += p
    i++
  }
  return 1 + 2 * s
}

// `P(X<=x)` for two-sample [Kolmogorov-Smirnov](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic) statistic
// exact asymptotically (`J->∞,K->∞`) for continuous samples
// approximate (within `0.27%` for `J,K≥20`) for small `J,K`
// _invalid for discrete or mixed samples_
function ks2_cdf(x, J, K = J) {
  // asymptotic scaling (J*K)/(J+K) satisfies ->J for K->∞ and ->K for J->∞
  // also J=K=2n ⟹ (J*K)/(J+K)=n so ks2(J,K≥2n) comparable to ks1(J≥n)
  // see https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Two-sample_Kolmogorov–Smirnov_test
  return ks1_cdf(x, (J * K) / (J + K))
}

// `P(X<=x)` for one-sample [Kolmogorov-Smirnov](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic) statistic
// exact asymptotically (`J->∞`) for continuous samples
// approximate (within `0.27%` for `J≥10`) for small `J`
// _invalid for discrete or mixed samples_
function ks1_cdf(x, J) {
  x *= Math.sqrt(J)
  // small-sample correction from "Small-Sample Corrections to Kolmogorov–Smirnov Test Statistic" by Jan Vrbik, also mentioned in Wikipedia
  x += 1 / (6 * Math.sqrt(J)) + (x - 1) / (4 * J)
  return kolmogorov_cdf(x)
}

// p-value for two-sample [Kolmogorov-Smirnov test](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test)
function ks2_test(xJ, yK) {
  return 1 - ks2_cdf(ks2(xJ, yK), xJ.length, yK.length)
}

// p-value for one-sample [Kolmogorov-Smirnov test](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test)
function ks1_test(xJ, cdf) {
  return 1 - ks1_cdf(ks1(xJ, cdf), xJ.length)
}

// minimum element in `xJ`
function min(xJ) {
  if (!is_array(xJ)) xJ = arguments
  let z = inf
  for (let j = 0; j < xJ.length; ++j) if (xJ[j] < z) z = xJ[j]
  return z
}

// minimum of `f(x,j)` over `xJ`
function minf(xJ, f = x => x) {
  assert(is_array(xJ), 'non-array argument')
  let z = inf
  for (let j = 0; j < xJ.length; ++j) {
    const fxj = f(xJ[j], j)
    if (fxj < z) z = fxj
  }
  return z
}

// maximum element in `xJ`
function max(xJ) {
  if (!is_array(xJ)) xJ = arguments
  let z = -inf
  for (let j = 0; j < xJ.length; ++j) if (xJ[j] > z) z = xJ[j]
  return z
}

// maximum of `f(x,j)` over `xJ`
function maxf(xJ, f = x => x) {
  assert(is_array(xJ), 'non-array argument')
  let z = -inf
  for (let j = 0; j < xJ.length; ++j) {
    const fxj = f(xJ[j], j)
    if (fxj > z) z = fxj
  }
  return z
}

// sum of `xJ`
function sum(xJ) {
  if (!is_array(xJ)) xJ = arguments
  let z = 0
  for (let j = 0; j < xJ.length; ++j) z += xJ[j]
  return z
}

// sum of `f(x,j)` over `xJ`
function sumf(xJ, f = x => x) {
  assert(is_array(xJ), 'non-array argument')
  let z = 0
  for (let j = 0; j < xJ.length; ++j) z += f(xJ[j], j)
  return z
}

const mean = xJ => sum(xJ) / xJ.length

// variance of sample `xJ`
function variance(xJ) {
  let z = 0
  const J = xJ.length,
    m = mean(xJ)
  for (let j = 0; j < J; ++j) {
    const y = xJ[j] - m
    z += y * y
  }
  return z / (xJ.length - 1)
}
const stdev = xJ => Math.sqrt(variance(xJ))

// [circular mean](https://en.wikipedia.org/wiki/Circular_mean) of `xJ` on `[-r,r]`
function circular_mean(xJ, r = pi) {
  if (xJ.length == 0) return NaN
  const z = r == pi ? 1 : pi / r
  const θJ = z == 1 ? xJ : xJ.map(x => x * z)
  return Math.atan2(sumf(θJ, Math.sin), sumf(θJ, Math.cos)) / z
}

// [circular stdev](https://en.wikipedia.org/wiki/Directional_statistics#Dispersion) of `xJ` on `[-r,r]`
function circular_stdev(xJ, r = pi) {
  if (xJ.length == 0) return NaN
  const z = r == pi ? 1 : pi / r
  const θJ = z == 1 ? xJ : xJ.map(x => x * z)
  const R = Math.sqrt(meanf(θJ, Math.sin) ** 2 + meanf(θJ, Math.cos) ** 2)
  return Math.sqrt(-2 * Math.log(R)) / z
}

// median of sample `xJ`
// | `sorted` | `false` | assume `xJ` already sorted
// | `copy`   | `false` | copy `xJ` before sorting
function median(xJ, options = {}) {
  const { sorted, copy } = options
  const J = xJ.length
  if (!sorted) {
    if (copy) xJ = xJ.slice()
    xJ.sort((a, b) => a - b)
  }
  // NOTE: (x&1)=x%2 and (x|0)=~~x
  return !(J & 1) ? (xJ[J / 2 - 1] + xJ[J / 2]) / 2 : xJ[(J / 2) | 0]
}

function _benchmark_median() {
  const xJ = sample_array(100)
  const xJ_sorted = sample_array(100).sort((a, b) => a - b)
  benchmark(
    () => median(xJ),
    () => median(xJ, { copy: true }),
    () => median(xJ_sorted, { sorted: true })
  )
}

// sample quantiles `qK` for `xJ`
// | `sorted` | `false` | assume `xJ` already sorted
// | `copy`   | `false` | copy `xJ` before sorting
// | `ɑ`      | `.375`  | estimation/interpolation parameter `ɑ`
// | `β`      | `.375`  | estimation/interpolation parameter `β`
// default parameters `ɑ=β=.375` are ~unbiased for normal `X`
// see [scipy.stats docs](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mstats.mquantiles.html#scipy-stats-mstats-mquantiles) for details and alternatives
function quantiles(xJ, qK, options = {}) {
  // based on https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/vector.js#L303
  // originally from https://github.com/scipy/scipy/blob/47bb6febaa10658c72962b9615d5d5aa2513fa3a/scipy/stats/mstats_basic.py#L2659-L2784
  const { sorted, copy, ɑ = 0.375, β = 0.375 } = options
  const J = xJ.length
  if (J == 0) return array(qK.length, NaN)
  if (J <= 1) return array(qK.length, xJ[0])
  if (!sorted) {
    if (copy) xJ = xJ.slice()
    xJ.sort((a, b) => a - b)
  }
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

// effective sample size for weights `wJ`
// approximates ideal value `J*Var(target)/MSE(sample)`
// equivalent sample size _if we could sample from target_
// see [Rethinking the Effective Sample Size](https://arxiv.org/abs/1809.04129) for derivation
// esp. section 3.2 "Summary of assumptions and approximations"
// can be used as sample size for `ks1_cdf` or `ks2_cdf`
function ess(wJ) {
  let s = 0
  let ss = 0
  const J = wJ.length
  for (let j = 0; j < J; ++j) {
    const w = wJ[j]
    s += w
    ss += w * w
  }
  return (s * s) / ss
}

// clips `x` to `[a,b]`
function clip(x, a = 0, b = 1) {
  if (x < a) return a
  if (x > b) return b
  return x
}
