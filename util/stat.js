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
  if (sum_wj < 0) fatal(`sum_wj<0: ${sum_wj}`)
  if (sum_wj == 0) return discrete_uniform(wJ.length)
  // if (min(wJ) < 0) fatal(`wj<0: ${min(wJ)}`)
  let j = 0
  let w = 0
  let wt = Math.random() * sum_wj
  do {
    w += wJ[j++]
  } while (w < wt && j < wJ.length)
  return j - 1
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

// sample(J, [sampler=uniform])
// samples array of `J` values from `sampler`
function sample(J, sampler = Math.random) {
  if (J <= 0) return []
  const xJ = new Array(J)
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
      b * Math.log(1 - z),
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

const approx_equal = (x, y, ε = 0.000001) => Math.abs(y - x) <= ε

// TODO: implement ks, ks_cdf, and ks_test for both one-sided and two-sided tests above to be used above for continuous distribution tests

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
  if (!is_array(xJ)) fatal(`non-array first argument`)
  if (yK && !is_array(yK)) fatal(`non-array second argument`)
  if (!is_object(options)) fatal(`non-object options`)
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
    for (let r = 0; r < R - 1; r++) {
      if (xR(rR[r]) != xR(rR[r + 1])) {
        // index r is last-of-kind
        if (r_new < r) shuffle(rR, r_new, r + 1)
        r_new = r + 1 // index r+1 is new
      }
    }
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
  if (!is_array(xJ)) fatal('non-array argument')
  let { xj_sorted, wK, wk_sum } = options
  if (wK) fatal('invalid option wK superceded by cdf for ks1')
  if (wk_sum) fatal(`invalid option wk_sum superceded by cdf for ks1`)
  if (!xj_sorted) xJ.sort((a, b) => a - b)
  wK = array(xJ.length, k => cdf(xJ[k]))
  apply(wK, (wk, k) => wk - wK[k - 1], 1)
  return ks2(xJ, null, { ...options, xj_sorted: true, wK, wk_sum: 1 })
}

// `P(X<=x)` _lower-bound_ for two-sample [Kolmogorov-Smirnov](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic) statistic
// _pre-computed_ _lower-bound_ for quantiles from `1e-10` to `1-1e-10`
// [Kolmogorov distribution](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov_distribution) holds _asymptotically_ for continuous `X`, for two-sample statistic scaled by `Math.sqrt((2*J*K)/(J+K))`
// exact cdf is [`jacobiTheta`](https://github.com/paulmasson/math/blob/29146e1a18b52d709770d1cbe17d8f0ad6bbdfd0/src/functions/elliptic-functions.js#L2) `(4, 0, Math.exp(-x*x*2*(J*K)/(J+K))`
// good approx. lower-bound for small `J` and `K` for continuous `X`
// should not be used sequentially, e.g. as a stopping rule
// can be used to simulate sequential test statistics
// should not be used for discrete or mixed `X`
function ks2_cdf(x, J, K) {
  // scaling and constants are derived from Mathematica using definitions:
  //   KSDistanceCDF[n_,x_]:=EllipticTheta[4,0,Exp[-2*x*x*n/2]]
  //   KSDistanceCDF[n1_,n2_,x_]:=EllipticTheta[4,0,Exp[-2*x*x*n1*n2/(n1+n2)]]
  //   KSDistanceInverseCDF[n_,p_]:=Solve[KSDistanceCDF[n,x]==p,x]
  //   KSDistanceInverseCDF[n1_,n2_,p_]:=Solve[KSDistanceCDF[n1,n2,x]==p,x]
  //   SetPrecision[KSDistanceInverseCDF[n, p], 20]
  //   SetPrecision[KSDistanceInverseCDF[n1, n2, p], 20]
  // can be verified against exact cdf jacobiTheta(4, 0, Math.exp(-x*x*2*(J*K)/(J+K)) from https://github.com/paulmasson/math/blob/29146e1a18b52d709770d1cbe17d8f0ad6bbdfd0/src/functions/elliptic-functions.js#L2
  x *= Math.sqrt((2 * J * K) / (J + K))
  if (x >= 4.8702153984911591422) return 0.9999999999
  if (x >= 4.6277870570615453616) return 0.99999999
  if (x >= 4.3719364033014374016) return 0.99999999
  if (x >= 4.1001515620179533883) return 0.9999999
  if (x >= 3.8090232000506665244) return 0.999999
  if (x >= 3.4937190278455672043) return 0.99999
  if (x >= 3.1469807041886994625) return 0.9999
  if (x >= 2.7569734237777994146) return 0.999
  if (x >= 2.3018073858487770877) return 0.99
  if (x >= 1.9206415147703974622) return 0.95
  if (x >= 1.7307822563424253293) return 0.9
  if (x >= 1.4413448539461912734) return 0.75
  if (x >= 1.1703657456108866874) return 0.5
  if (x >= 0.95664149955925958935) return 0.25
  if (x >= 0.80776097797830959113) return 0.1
  if (x >= 0.73484004537009228741) return 0.05
  if (x >= 0.6237073526262482126) return 0.01
  if (x >= 0.5292265612986003509) return 0.001
  if (x >= 0.46865999313597900278) return 0.0001
  if (x >= 0.42542448391422971188) return 0.00001
  if (x >= 0.3924999185171096916) return 0.000001
  if (x >= 0.36631453933049173965) return 0.0000001
  if (x >= 0.3448270723840876073) return 0.00000001
  if (x >= 0.32677255071556365884) return 0.000000001
  if (x >= 0.3113186698052712309) return 0.0000000001
  return 0
}

// `P(X<=x)` _lower-bound_ for one-sample [Kolmogorov-Smirnov](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic) statistic
// [Kolmogorov distribution](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov_distribution) holds _asymptotically_ for continuous `X`, for one-sample statistic scaled by `Math.sqrt(2*J)`
// scaling can be derived by taking `K->∞` s.t. `2*J*K/(J+K)->2J`
// then `2*2J*2J/(2J+2J)=2J` implies `ks1_cdf(x,J) = ks2_cdf(x,2J,2J)`
// see `ks2_cdf` above for additional comments
function ks1_cdf(x, J) {
  // NOTE: 2*n*m/(n+m)->2n as m->∞ and 2*2n*2n/(2n+2n)=2n
  return ks2_cdf(x, 2 * J, 2 * J)
}

// adapted from https://github.com/jstat/jstat/blob/master/src/vector.js
function min(xJ) {
  if (!is_array(xJ)) return min(Array.from(arguments))
  let z = inf
  const J = xJ.length
  for (let j = 0; j < J; ++j) if (xJ[j] < z) z = xJ[j]
  return z
}
const min2 = (xJ, z = 0) => (each(xJ, x => x >= z || (z = x)), z) // reference
function max(xJ) {
  if (!is_array(xJ)) return max(Array.from(arguments))
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
