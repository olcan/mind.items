// [Math.random](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random) on `(0,1)`, excluding `0`
const random = () => Math.random() || Number.MIN_VALUE
const random_boolean = (p = 0.5) => random() < p
const random_binary = (p = 0.5) => (random() < p ? 1 : 0)

// random_uniform ([a],[b])
// [uniform](https://en.wikipedia.org/wiki/Continuous_uniform_distribution) on `(0,1)`,`(0,a)`, or `(a,b)`
// | `(0,1)` | if `a` and `b` omitted
// | `(0,a)` | if `b` omitted
// | `(a,b)` | otherwise
const random_uniform = (a, b) => {
  if (a === undefined) return random()
  if (b === undefined) return is_finite(a) && a > 0 ? a * random() : NaN
  if (!is_finite(a) || !is_finite(b) || b <= a) return NaN
  return a + random() * (b - a)
}

// random_uniform_array(xJ, [a], [b])
// fills `xJ` with `random_uniform(a,b)`
const random_uniform_array = (xJ, a, b) => {
  if (a === undefined) return random_array(xJ, random)
  if (b === undefined)
    return is_finite(a) && a > 0
      ? random_array(xJ, () => a * random())
      : random_array(xJ, NaN)
  if (!is_finite(a) || !is_finite(b) || b <= a) return random_array(xJ, NaN)
  return random_array(xJ, () => a + random() * (b - a))
}

// random_discrete_uniform ([a],[b])
// [uniform](https://en.wikipedia.org/wiki/Discrete_uniform_distribution) on `{0,1}`,`{0,…,a-1}`, or `{a,…,b}`
// | `{0,1}`     | if `a` and `b` omitted
// | `{0,…,a-1}` | if `b` omitted
// | `{a,…,b}`   | otherwise
const random_discrete_uniform = (a, b) => {
  const u = random()
  if (a === undefined) return ~~(2 * u) // {0,1}
  if (b === undefined) return is_integer(a) && a > 0 ? ~~(u * a) : NaN // {0,…,a-1}
  if (!is_integer(a) || !is_integer(b) || b < a) return NaN
  return ~~(a + u * (b + 1 - a)) // {a,…,b}
}

const random_element = xJ => xJ[random_discrete_uniform(xJ.length)]

// random_discrete_uniform_array(xJ, [a], [b])
// fills `xJ` with `random_discrete_uniform(a,b)`
const random_discrete_uniform_array = (xJ, a, b) => {
  if (a === undefined) return random_array(xJ, () => ~~(2 * random()))
  if (b === undefined)
    return is_integer(a) && a > 0
      ? random_array(xJ, () => ~~(random() * a))
      : array(xJ, NaN)
  return is_integer(a) && is_integer(b) && b >= a
    ? random_array(xJ, () => ~~(a + random() * (b + 1 - a)))
    : array(xJ, NaN)
}

// random_discrete(wJ, [sum_wj])
// [discrete](https://en.wikipedia.org/wiki/Categorical_distribution) on `{0,…,J-1}` w/ prob. `P(j)∝wJ[j]`
// faster if `wJ` is sorted by decreasing weight
// normalizer `sum_wj` can be passed if known
// `≡ random_discrete_uniform(J)` if `sum_wj==0`
// assumes `wj>=0` and `sum_wj>=0`
const random_discrete = (wJ, sum_wj) => {
  if (!is_array(wJ)) fatal(`non-array argument`)
  if (wJ.length == 0) return NaN
  sum_wj ??= sum(wJ)
  if (sum_wj < 0) fatal(`sum_wj<0: ${sum_wj}`)
  if (sum_wj == 0) return random_discrete_uniform(wJ.length)
  // if (!(min_in(wJ) >= 0)) fatal(`wj<0: ${min_in(wJ)}`)
  let j = 0
  let w = 0
  let wt = random() * sum_wj
  do {
    w += wJ[j++]
  } while (w < wt && j < wJ.length)
  return j - 1
}

// random_discrete_array(jK, wJ, [sum_wj])
// fills `jK` with `discrete(wJ, sum_wj)`
// faster if `wJ` is sorted by decreasing weight
// normalizer `sum_wj` can be passed if known
// `≡ random_discrete_uniform_array(jK, J)` if `sum_wj==0`
// indices `jK` are ordered due to sampling method
// use `random_shuffle(jK)` for random ordering
function random_discrete_array(jK, wJ, sum_wj) {
  if (!(is_array(jK) && is_array(wJ))) fatal(`non-array argument`)
  if (jK.length == 0) return jK
  if (wJ.length == 0) return fill(jK, NaN)
  sum_wj ??= sum(wJ)
  if (!(sum_wj >= 0)) fatal(`sum_wj<0: ${sum_wj}`)
  // treat zero sum as uniform
  if (sum_wj == 0) return random_discrete_uniform_array(jK, wJ.length)
  // if (!(min_in(wJ) >= 0)) fatal(`wj<0: ${min_in(wJ)}`)
  // generate (exp) increments for K+1 uniform numbers in (0,sum_wj) w/o sorting
  let rK = apply(random_array(jK), r => -Math.log(r))
  const z = sum_wj / (sum(rK) - Math.log(random()))
  apply(rK, r => r * z) // rescale to (0,sum_wJ)
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

// binomial sampler using "first waiting time method"
// ideal for n*p<10, see http://www.nrbook.com/devroye/ (page 525)
function _binomial_fwtm(n, p) {
  let x = 0
  let s = 0
  const z = 1 / log1p(-p) // multiplier reused inside loop
  while (true) {
    s += ceil(log(random()) * z)
    if (s > n) break
    x++
  }
  return x
}

function _stirling_approx_tail(k) {
  const stirling_approx_tailK = [
    0.0810614667953272, 0.0413406959554092, 0.0276779256849983,
    0.02079067210376509, 0.0166446911898211, 0.0138761288230707,
    0.0118967099458917, 0.010411265261972, 0.00925546218271273,
    0.00833056343336287,
  ]
  if (k <= 9) stirling_approx_tailK[k]
  const kp1sq = (k + 1) * (k + 1)
  return (1.0 / 12 - (1.0 / 360 - 1.0 / 1260 / kp1sq) / kp1sq) / (k + 1)
}

// binomial sampler using "transformed rejection w/ squeeze" method
// ideal for n*p>=10, see https://epub.wu.ac.at/1242/1/document.pdf
function _binomial_btrs(n, p) {
  const spq = sqrt(n * p * (1 - p))
  const b = 1.15 + 2.53 * spq
  const a = -0.0873 + 0.0248 * b + 0.01 * p
  const c = n * p + 0.5
  const v_r = 0.92 - 4.2 / b
  const r = p / (1 - p)
  while (true) {
    const u = random() - 0.5
    let v = random()
    const us = 0.5 - abs(u)
    const k = floor(((2 * a) / us + b) * u + c)
    // for (u,v) pairs inside box
    // acceptance rate is 24% -> ~79% for large np
    if (us >= 0.07 && v <= v_r) return k
    if (k < 0 || k > n) continue
    const α = (2.83 + 5.1 / b) * spq
    const m = floor((n + 1) * p)
    // for (u,v) pairs outside box
    // log() missing from original paper; compare to BTRD step 2
    v = log((v * α) / (a / (us * us) + b)) // transformed-reject ratio
    const v_bound =
      (m + 0.5) * log((m + 1) / (r * (n - m + 1))) +
      (n + 1) * log((n - m + 1) / (n - k + 1)) +
      (k + 0.5) * log((r * (n - k + 1)) / (k + 1)) +
      _stirling_approx_tail(m) +
      _stirling_approx_tail(n - m) -
      _stirling_approx_tail(k) -
      _stirling_approx_tail(n - k)
    if (v <= v_bound) return k
  }
}

// [geometric](https://en.wikipedia.org/wiki/Geometric_distribution) on `{0,1,2,…}`
function random_geometric(p) {
  if (p == 0) return inf
  if (!is_finite(p) || p < 0 || p > 1) return NaN
  return floor(log(random()) / log1p(-p))
}

// [binomial](https://en.wikipedia.org/wiki/Binomial_distribution) on `{0,1,2,…,n}`
function random_binomial(n, p) {
  // derived from https://github.com/copperwiring/tensorflow/blob/734f0589f381ef5fe046258848cbb51a13a6b25a/tensorflow/core/kernels/random_binomial_op.cc#L105
  // also comparable to http://jsoc.stanford.edu/doxygen_html/ident_2libs_2util_2rng_8c-source.html
  if (!is_integer(n) || n <= 0) return NaN
  if (!is_finite(p) || p < 0 || p > 1) return NaN
  if (n == 1) return random_binary(p)
  // based on benchmarks, bernoulli sum is _slightly_ faster for n<=5, p>=.3
  // if (n <= 5 && p >= .3) return sum(n, j => random_binary(p))
  if (p > 0.5) return n - random_binomial(n, 1 - p)
  if (p == 0) return 0
  if (n * p < 10) return _binomial_fwtm(n, p)
  return _binomial_btrs(n, p)
}

// random_triangular([a],[b],[c])
// [triangular](https://en.wikipedia.org/wiki/Triangular_distribution) on `(0,1)`, `(0,a)`, or `(a,b)`
const random_triangular = (a, b, c) => {
  if (a === undefined) return random_triangular(0, 1, 0.5)
  if (b === undefined) return random_triangular(0, a, a / 2)
  if (c === undefined) return random_triangular(a, b, (a + b) / 2)
  if (!is_finite(a) || !is_finite(b) || !is_finite(c)) return NaN
  if (a > b || c < a || c > b) return NaN
  // from https://github.com/jstat/jstat/blob/master/src/distribution.js
  const u = random()
  if (u < (c - a) / (b - a)) return a + sqrt(u * (b - a) * (c - a))
  return b - sqrt((1 - u) * (b - a) * (b - c))
}

// [normal](https://en.wikipedia.org/wiki/Normal_distribution) on `(-∞,∞)`
// scale by `σ>0` & shift by `μ` for location-scale family
function random_normal() {
  // from https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/special.js#L437
  let u, v, x, y, q
  do {
    u = random()
    v = 1.7156 * (random() - 0.5)
    x = u - 0.449871
    y = abs(v) + 0.386595
    q = x * x + y * (0.196 * y - 0.25472 * x)
  } while (q > 0.27597 && (q > 0.27846 || v * v > -4 * log(u) * u * u))
  return v / u
}

// [exponential](https://en.wikipedia.org/wiki/Exponential_distribution) on `(0,∞)`
// scale by `θ>0` for scale family
// scale by `1/λ>0` for rate (inverse scale) family
const random_exponential = () => -log(random())

// [gamma](https://en.wikipedia.org/wiki/Gamma_distribution) w/ shape `α` on `(0,∞)`
// scale by `θ>0` for shape-scale family
function random_gamma(α = 1) {
  if (α <= 0) return NaN
  if (α == 1) return random_exponential()
  // gamma deviate by method of Marsaglia and Tsang
  // from https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/special.js#L455
  const _α = α // original α (pre-increment below for α<1)
  let a1, a2, u, v, x
  if (α < 1) α += 1
  a1 = α - 1 / 3
  a2 = 1 / sqrt(9 * a1)
  do {
    do {
      x = random_normal()
      v = 1 + a2 * x
    } while (v <= 0)
    v = v * v * v
    u = random()
  } while (
    u > 1 - 0.331 * pow(x, 4) &&
    log(u) > 0.5 * x * x + a1 * (1 - v + log(v))
  )
  if (α == _α) return a1 * v // α >= 1
  u = random() // already truncated to (0,1)
  return pow(u, 1 / _α) * a1 * v
}

// [beta](https://en.wikipedia.org/wiki/Beta_distribution) on `(0,1)`
function random_beta(α, β) {
  if (α <= 0 || β <= 0) return NaN
  const g = random_gamma(α)
  return g / (g + random_gamma(β))
}

// random_array(J|xJ, [sampler=uniform], [filter])
// sample array of `J` values from `sampler`
// can skip values `x` s.t. `!filter(x)`, a.k.a. [rejection sampling](https://en.wikipedia.org/wiki/Rejection_sampling)
function random_array(a, sampler = random, filter) {
  if (!is_function(sampler)) fatal(`non-function sampler`)
  const [J, xJ] = is_array(a) ? [a.length, a] : [~~a, new Array(max(0, ~~a))]
  if (!filter) for (let j = 0; j < J; ++j) xJ[j] = sampler()
  else
    for (let j = 0; j < J; ++j) {
      xJ[j] = sampler()
      while (!filter(xJ[j])) xJ[j] = sampler()
    }
  return xJ
}

// random_shuffle(xJ, [js=0], [je=J])
// shuffles elements of array `xJ` _in place_
// returns array w/ elements shuffled in place
// can be restricted to indices `js,…,je-1`
// uses [Fisher-Yates-Durstenfeld algorithm](https://en.wikipedia.org/wiki/Fisher–Yates_shuffle#The_modern_algorithm)
function random_shuffle(xJ, js = 0, je = xJ.length) {
  js = max(0, js)
  je = min(je, xJ.length)
  for (let j = je - 1; j > js; j--) {
    const jr = js + ~~(random() * (j - js + 1))
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
  while (abs((a1 - a2) / a1) > eps) {
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
  let j = 0
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ]
  let ser = 1.000000000190015
  let xx, y, tmp
  tmp = (y = xx = x) + 5.5
  tmp -= (xx + 0.5) * log(tmp)
  for (; j < 6; j++) ser += cof[j] / ++y
  return log((2.5066282746310005 * ser) / xx) - tmp
}

// `x≈y ≡ |x-y|/max(|x|,|y|))≤ε OR |x-y|≤εa`
// default `εa=0` means `x==y` is required for small `x,y`
const approx_equal = (x, y, ε = 1e-6, εa = 0) =>
  abs(x - y) / max(abs(x), abs(y)) <= ε || abs(x - y) <= εa

// `P(X<=x)` for [binomial distribution](https://en.wikipedia.org/wiki/Binomial_distribution)
function binomial_cdf(x, n, p) {
  // from https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/distribution.js#L764
  let betacdf
  let eps = 1e-10
  if (p < 0 || p > 1 || n <= 0) return NaN
  if (x < 0) return 0
  if (x >= n) return 1
  x = floor(x)
  let a = x + 1
  let b = n - x
  let s = a + b
  let bt = exp(
    _log_gamma(s) - _log_gamma(b) - _log_gamma(a) + a * log(p) + b * log1p(-p)
  )
  if (p < (a + 1) / (s + 2)) betacdf = bt * _betinc(p, a, b, eps)
  else betacdf = 1 - bt * _betinc(1 - p, b, a, eps)
  return round((1 - betacdf) * (1 / eps)) / (1 / eps)
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

// continued fraction for incomplete beta function by modified Lentz's method
// from https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/special.js#L206
function _betacf(x, a, b) {
  const fpmin = 1e-30
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let m = 1
  let c = 1
  let d = 1 - (qab * x) / qap
  let m2, aa, del, h
  if (abs(d) < fpmin) d = fpmin
  d = 1 / d
  h = d
  for (; m <= 100; m++) {
    m2 = 2 * m
    aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (abs(d) < fpmin) d = fpmin
    c = 1 + aa / c
    if (abs(c) < fpmin) c = fpmin
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (abs(d) < fpmin) d = fpmin
    c = 1 + aa / c
    if (abs(c) < fpmin) c = fpmin
    d = 1 / d
    del = d * c
    h *= del
    if (abs(del - 1.0) < 3e-7) break
  }
  return h
}

// incomplete beta function I_x(a,b)
// from https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/special.js#L419
function _ibeta(x, a, b) {
  const bt =
    x === 0 || x === 1
      ? 0
      : exp(
          _log_gamma(a + b) -
            _log_gamma(a) -
            _log_gamma(b) +
            a * log(x) +
            b * log1p(-x)
        )
  if (x < 0 || x > 1) return false
  if (x < (a + 1) / (a + b + 2)) return (bt * _betacf(x, a, b)) / a
  return 1 - (bt * _betacf(1 - x, b, a)) / b
}

// `P(X<=x)` for [beta distribution](https://en.wikipedia.org/wiki/Beta_distribution)
function beta_cdf(x, a, b) {
  // from https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/distribution.js#L88
  if (x <= 0) return 0
  if (x >= 1) return 1
  return _ibeta(x, a, b)
}

function _filter_undefined(J, xJ, wJ, wj_sum) {
  let jj = -1
  for (let j = 0; j < J; ++j) {
    if (xJ[j] === undefined) continue
    if (++jj == j) continue // no undefined yet
    xJ[jj] = xJ[j]
    if (wJ) wJ[jj] = wJ[j]
  }
  if (++jj < J) {
    xJ.length = J = jj
    if (wJ) {
      wJ.length = J
      wj_sum = sum(wJ)
    }
  }
  return [J, xJ, wJ, wj_sum]
}

// arrays reused below in ks2
let _ks2_rR, _ks2_jJ, _ks2_kK, _ks2__xJ, _ks2__yK, _ks2__wJ, _ks2__wK

// ks2(xJ, yK, [options])
// two-sample [Kolmogorov-Smirnov](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic) statistic
// can modify arrays `xJ`,`yK`,`wJ`,`wK`, to sort, filter, or map
// | `wJ`        | `1,…,1` | weights for `xJ`
// | `wK`        | `1,…,1` | weights for `yK`
// | `wj_sum`    | `J` | sum of weights `wJ`
// | `wk_sum`    | `K` | sum of weights `wK`
// | `xj_sorted` | `false` | assume `xJ` already sorted
// | `yk_sorted` | `false` | assume `yK` already sorted
// | `discrete`  | `false` | allow identical (discrete) values?
// | `filter`    | `false` | filter `undefined` values?
// | `numberize` | `false` | map values to random numbers?
function ks2(xJ, yK, options = {}) {
  if (!is_array(xJ)) fatal(`non-array first argument`)
  if (yK) if (!is_array(yK)) fatal(`non-array second argument`)
  if (!is_object(options)) fatal(`non-object options`)
  let J = xJ.length
  let K = yK ? yK.length : 0 // if yK missing, K=0 for now, K=J later
  if (!(J > 0)) fatal(`empty first array for ks2`)
  if (yK) if (!(K > 0)) fatal('empty second array for ks2')
  const { xj_sorted, yk_sorted, discrete, numberize, filter } = options
  let { wJ, wj_sum, wK, wk_sum } = options
  if (filter) {
    // filter undefined values
    ;[J, xJ, wJ, wj_sum] = _filter_undefined(J, xJ, wJ, wj_sum)
    if (!(J > 0)) fatal(`empty first array for ks2 after removing undefined`)
    if (yK) {
      ;[K, yK, wK, wk_sum] = _filter_undefined(K, yK, wK, wk_sum)
      if (!(K > 0)) fatal(`empty second array for ks2 after removing undefined`)
    }
  }
  const R = J + K
  if (wJ) if (wJ.length != J) fatal('wJ size mismatch', J, wJ.length)
  if (wK) if (wK.length != (K || J)) fatal('wK size mismatch', K, J, wK.length)

  if (numberize) {
    // numberize, i.e. map values to random numbers
    if (!(!xj_sorted && !yk_sorted)) fatal('unnecessary pre-sorting')
    const uX = new Map() // value -> uniform random number map
    let u // tmp var reused inside apply
    apply(xJ, x => uX.get(x) ?? (uX.set(x, (u = random())), u))
    if (yK) apply(yK, x => uX.get(x) ?? (uX.set(x, (u = random())), u))
  }
  // check values are finite numbers (first values only)
  if (!is_finite(xJ[0])) fatal('non-finite value for ks2')
  if (yK) if (!is_finite(yK[0])) fatal('non-finite value for ks2')

  // sort xJ and yK as needed
  if (!xj_sorted) {
    if (!wJ) sort(xJ)
    else {
      // sort xJ and wJ together by sorting indices
      const jJ = set((_ks2_jJ ??= array(J)), 'length', J)
      const _xJ = set((_ks2__xJ ??= array(J)), 'length', J)
      const _wJ = set((_ks2__wJ ??= array(J)), 'length', J)
      fill(jJ, j => j)
      sort_by(jJ, j => xJ[j])
      fill(_xJ, j => xJ[jJ[j]])
      fill(_wJ, j => wJ[jJ[j]])
      xJ = _xJ
      wJ = _wJ
    }
  }
  if (yK && !yk_sorted) {
    if (!wK) sort(yK)
    else {
      // sort xJ and wJ together by sorting indices
      const kK = set((_ks2_kK ??= array(K)), 'length', K)
      const _yK = set((_ks2__yK ??= array(K)), 'length', K)
      const _wK = set((_ks2__wK ??= array(K)), 'length', K)
      fill(kK, k => k)
      sort_by(kK, k => yK[k])
      fill(_yK, k => yK[kK[k]])
      fill(_wK, k => wK[kK[k]])
      yK = _yK
      wK = _wK
    }
  }
  const xR = yK ? r => (r < J ? xJ[r] : yK[r - J]) : r => xJ[r]
  // generate globally sorted indices rR
  // these are replaced below by cdf differences
  const rR = set((_ks2_rR ??= array(R)), 'length', R)
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
        if (r_new < r) random_shuffle(rR, r_new, r + 1)
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
  if (mR) map2(rR, mR, (r, m) => r * m) // mask collisions
  const ks = max_in(apply(rR, abs)) / (J * K)
  if (is_nan(ks) || is_inf(ks)) {
    console.debug('ks nan/inf', {
      discrete,
      filter,
      numberize,
      xj_sorted,
      yk_sorted,
      J,
      K,
      R,
      wj_sum,
      wk_sum,
      wJ,
      wK,
      rR,
      mR,
      ks,
    })
    fatal('ks nan/inf (see debug console for details)')
  }
  return ks
}

// ks1(xJ, cdf, [options])
// one-sample [Kolmogorov-Smirnov](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic) statistic
// can modify arrays `xJ`,`wJ`, to sort or filter
// | `wJ`        | `1,…,1` | weights for `xJ`
// | `wj_sum`    | `J`     | sum of weights `wJ`
// | `xj_sorted` | `false` | assume `xJ` already sorted
// | `discrete`  | `false` | allow identical (discrete) values?
// | `filter`    | `false` | filter `undefined` values?
function ks1(xJ, cdf, options = {}) {
  if (!is_array(xJ)) fatal('non-array argument')
  let { xj_sorted, wK, wk_sum, numberize, filter } = options
  if (wK) fatal('invalid option wK superceded by cdf for ks1')
  if (wk_sum) fatal(`invalid option wk_sum superceded by cdf for ks1`)
  if (numberize) fatal(`invalid option numberize for ks1`)
  if (filter) remove(xJ, undefined)
  if (!xj_sorted) sort(xJ)
  wK = array(xJ.length)
  wK[0] = cdf(xJ[0])
  fill(wK, k => cdf(xJ[k]) - cdf(xJ[k - 1]), 1)
  return ks2(xJ, null, { ...options, xj_sorted: true, wK, wk_sum: 1 })
}

// `P(X<=x)` for [Kolmogorov distribution](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov_distribution)
// `= jacobiTheta(4, 0, exp(-2*x*x))` using algorithm at [math.js](https://github.com/paulmasson/math/blob/29146e1a18b52d709770d1cbe17d8f0ad6bbdfd0/src/functions/elliptic-functions.js#L2)
// `≡ EllipticTheta[4, 0, Exp[-2*x*x]]` in Mathematica (used for testing)
function kolmogorov_cdf(x, ε = 1e-10) {
  const q = exp(-2 * x * x)
  let s = 0
  let p = 1
  let i = 1
  while (abs(p) > ε) {
    p = (-q) ** (i * i)
    s += p
    i++
  }
  return 1 + 2 * s
}

// `P(X<=x)` for two-sample [Kolmogorov-Smirnov statistic](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic)
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
  const s = sqrt(J)
  x *= s
  // small-sample correction from "Small-Sample Corrections to Kolmogorov–Smirnov Test Statistic" by Jan Vrbik, also mentioned in Wikipedia
  x += 1 / (6 * s) + (x - 1) / (4 * J)
  return kolmogorov_cdf(x)
}

// p-value for two-sample [Kolmogorov-Smirnov test](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test)
function ks2_test(xJ, yK, options = {}) {
  const { wJ, wj_sum, wK, wk_sum } = options
  return (
    1 -
    ks2_cdf(
      ks2(xJ, yK, options),
      wJ ? ess(wJ, wj_sum) : xJ.length,
      wK ? ess(wK, wk_sum) : yK.length
    )
  )
}

// p-value for one-sample [Kolmogorov-Smirnov test](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test)
function ks1_test(xJ, cdf, options = {}) {
  const { wJ, wj_sum } = options
  return 1 - ks1_cdf(ks1(xJ, cdf, options), wJ ? ess(wJ, wj_sum) : xJ.length)
}

// (Log) density for [Kolmogorov distribution](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov_distribution)
// `≡ Log[D[EllipticTheta[4, 0, Exp[-2*x*x]], x]]` in Mathematica
function kolmogorov_density(x) {
  // pieceise linear interpolation/fit below x<5
  // keypoints: FindMaximum[…,{x,.5}], FindRoot[…,{x,.177}], FindRoot[…, {x, 1}]
  // additional points added manually via inspection
  // expected absolute error is ~0.01 (~.015 w/o normalizer)
  const z = 0.0153762 // normalizer: Log@NIntegrate[Exp[g@x], {x, 0, 100}]
  if (x < 0.25) return z - 74.8823 + 249.939 * x
  if (x < 0.3) return z - 38.8508 + 105.813 * x
  if (x < 0.4) return z - 21.5566 + 48.1654 * x
  if (x < 0.45) return z - 11.3189 + 22.5711 * x
  if (x < 0.5) return z - 7.59603 + 14.2982 * x
  if (x < 0.54939) return z - 4.97152 + 9.04916 * x // log-density = 0
  if (x < 0.6) return z - 3.04766 + 5.54734 * x
  if (x < 0.65) return z - 1.59926 + 3.13336 * x
  if (x < 0.735468) return z - 0.212356 + 0.999653 * x // log-density = max
  if (x < 0.85) return z + 1.19502 - 0.913928 * x
  if (x < 0.92) return z + 2.11995 - 2.00208 * x
  if (x < 1.02353) return z + 2.74881 - 2.68563 * x // log-density = 0
  if (x < 1.2) return z + 3.58984 - 3.50732 * x
  if (x < 1.4) return z + 4.69209 - 4.42586 * x
  if (x < 1.6) return z + 5.96095 - 5.33219 * x
  if (x < 2.5) return z + 9.75604 - 7.70412 * x
  if (x < 3.5) return z + 19.6546 - 11.6635 * x
  if (x < 5) return z + 37.5 - 16.7622 * x
  // quadratic fit above x>5 (log-density < -46.3111)
  // Normal@NonlinearModelFit[Table[{x,SetPrecision[f@x,10]},{x,1,100}],a+b*x+c*x^2,{a,b,c},x]
  // relative error is <=.003 for x>=5, <=.001 for x>=10
  return z + 3.5008256 + 0.07386344 * x - 2.0004475 * x * x
}

// (Log) density for two-sample [Kolmogorov-Smirnov statistic](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic)
function _ks2_density(x, J, K = J) {
  return _ks1_density(x, (J * K) / (J + K))
}

// (Log) density for one-sample [Kolmogorov-Smirnov statistic](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic)
function _ks1_density(x, J) {
  const s = sqrt(J)
  x *= s
  x += 1 / (6 * s) + (x - 1) / (4 * J) // same as in ks1_cdf above
  return kolmogorov_density(x)
}

// (Log) density for two-sample [Kolmogorov-Smirnov statistic](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic)
function ks2_density(xJ, yK, options = {}) {
  const { wJ, wj_sum, wK, wk_sum } = options
  return _ks2_density(
    ks2(xJ, yK, options),
    wJ ? ess(wJ, wj_sum) : xJ.length,
    wK ? ess(wK, wk_sum) : yK.length
  )
}

// (Log) density for one-sample [Kolmogorov-Smirnov statistic](https://en.wikipedia.org/wiki/Kolmogorov–Smirnov_test#Kolmogorov–Smirnov_statistic)
function ks1_density(xJ, cdf, options = {}) {
  const { wJ, wj_sum } = options
  return _ks1_density(ks1(xJ, cdf, options), wJ ? ess(wJ, wj_sum) : xJ.length)
}

// minimum element in `xJ`
function min_in(xJ) {
  if (!is_array(xJ)) fatal('non-array argument')
  let z = inf
  for (let j = 0; j < xJ.length; ++j) if (xJ[j] < z) z = xJ[j]
  return z
}

// min_of(xJ|J, [f = x => x])
// minimum of `f(x,j)` over `xJ`
// integer argument `J≥0` is treated as array `xJ=[0,1,2,…,J-1]`
function min_of(xJ, f = x => x) {
  if (is_integer(xJ) && xJ >= 0) {
    const J = xJ
    let z = inf
    for (let j = 0; j < J; ++j) {
      const fxj = f(j, j)
      if (fxj < z) z = fxj
    }
    return z
  }
  if (!is_array(xJ)) fatal('invalid argument')
  let z = inf
  for (let j = 0; j < xJ.length; ++j) {
    const fxj = f(xJ[j], j)
    if (fxj < z) z = fxj
  }
  return z
}

const min_by = _.minBy

// maximum element in `xJ`
function max_in(xJ) {
  if (!is_array(xJ)) fatal('non-array argument')
  let z = -inf
  for (let j = 0; j < xJ.length; ++j) if (xJ[j] > z) z = xJ[j]
  return z
}

// max_of(xJ|J, [f = x => x])
// maximum of `f(x,j)` over `xJ`
// integer argument `J≥0` is treated as array `xJ=[0,1,2,…,J-1]`
function max_of(xJ, f = x => x) {
  if (is_integer(xJ) && xJ >= 0) {
    const J = xJ
    let z = -inf
    for (let j = 0; j < J; ++j) {
      const fxj = f(j, j)
      if (fxj > z) z = fxj
    }
    return z
  }
  if (!is_array(xJ)) fatal('invalid argument')
  let z = -inf
  for (let j = 0; j < xJ.length; ++j) {
    const fxj = f(xJ[j], j)
    if (fxj > z) z = fxj
  }
  return z
}

const max_by = _.maxBy

// `≡ [min_in(xJ), max_in(xJ)]`
function min_max_in(xJ) {
  if (!is_array(xJ)) fatal('non-array argument')
  let a = inf
  let b = -inf
  for (let j = 0; j < xJ.length; ++j) {
    const x = xJ[j]
    if (x < a) a = x
    if (x > b) b = x
  }
  return [a, b]
}

const min_max = min_max_in

// min_max_of(xJ|J, [f = x => x])
// `≡ [min_of(xJ|J, f), max_of(xJ|J, f)]`
function min_max_of(xJ, f = x => x) {
  if (is_integer(xJ) && xJ >= 0) {
    const J = xJ
    let a = inf
    let b = -inf
    for (let j = 0; j < J; ++j) {
      const fxj = f(j, j)
      if (fxj < a) a = fxj
      if (fxj > b) b = fxj
    }
    return [a, b]
  }
  if (!is_array(xJ)) fatal('invalid argument')
  let a = inf
  let b = -inf
  for (let j = 0; j < xJ.length; ++j) {
    const fxj = f(xJ[j], j)
    if (fxj < a) a = fxj
    if (fxj > b) b = fxj
  }
  return [a, b]
}

// sum(xJ|J, [f])
// sum of `xJ`, or `f(x,j)` over `xJ`
// integer argument `J≥0` is treated as array `xJ=[0,1,2,…,J-1]`
function sum(xJ, f = undefined) {
  if (is_integer(xJ) && xJ >= 0) {
    const J = xJ
    let z = 0
    if (!f) for (let j = 0; j < J; ++j) z += j
    else for (let j = 0; j < J; ++j) z += f(j, j)
    return z
  }
  if (!is_array(xJ)) fatal('invalid argument')
  let z = 0
  if (!f) for (let j = 0; j < xJ.length; ++j) z += xJ[j]
  else for (let j = 0; j < xJ.length; ++j) z += f(xJ[j], j)
  return z
}

const sum_of = sum
const mean = (xJ, f = undefined) => sum(xJ, f) / xJ.length
const mean_of = mean

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
const stdev = xJ => sqrt(variance(xJ))

// [circular mean](https://en.wikipedia.org/wiki/Circular_mean) of `xJ` on `[-r,r]`
function circular_mean(xJ, r = pi) {
  if (xJ.length == 0) return NaN
  const z = r == pi ? 1 : pi / r
  const θJ = z == 1 ? xJ : xJ.map(x => x * z)
  return atan2(sum(θJ, sin), sum(θJ, cos)) / z
}

// [circular stdev](https://en.wikipedia.org/wiki/Directional_statistics#Dispersion) of `xJ` on `[-r,r]`
function circular_stdev(xJ, r = pi) {
  if (xJ.length == 0) return NaN
  const z = r == pi ? 1 : pi / r
  const θJ = z == 1 ? xJ : xJ.map(x => x * z)
  const R = sqrt(mean(θJ, sin) ** 2 + mean(θJ, cos) ** 2)
  return sqrt(-2 * log(R)) / z
}

// median of sample `xJ`
// | `sorted` | `false` | assume `xJ` already sorted
// | `filter` | `false` | filter undefined values
// | `copy`   | `false` | copy `xJ` before sorting/filtering
function median(xJ, options = {}) {
  const { sorted, copy, filter } = options
  let J = xJ.length
  if (copy && (filter || !sorted)) xJ = xJ.slice()
  if (filter) J = remove(xJ).length
  if (!sorted) sort(xJ)
  // NOTE: (x&1)=x%2 and (x|0)=~~x
  return !(J & 1) ? (xJ[J / 2 - 1] + xJ[J / 2]) / 2 : xJ[(J / 2) | 0]
}

function _benchmark_median() {
  const xJ = random_array(100)
  const xJ_sorted = sort(random_array(100))
  benchmark(
    () => median(xJ),
    () => median(xJ, { copy: true }),
    () => median(xJ_sorted, { sorted: true })
  )
}

// sample quantiles `qK` for `xJ`
// | `sorted` | `false` | assume `xJ` already sorted
// | `copy`   | `false` | copy `xJ` before sorting
// | `α`      | `.375`  | estimation/interpolation parameter `α`
// | `β`      | `.375`  | estimation/interpolation parameter `β`
// default parameters `α=β=.375` are ~unbiased for normal `X`
// see [scipy.stats docs](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mstats.mquantiles.html#scipy-stats-mstats-mquantiles) for details and alternatives
function quantiles(xJ, qK, options = {}) {
  if (!is_array(xJ) || !is_array(qK)) fatal('non-array argument')
  // based on https://github.com/jstat/jstat/blob/e56dd7386e62f6787260cdc382b78b6848d21b62/src/vector.js#L303
  // originally from https://github.com/scipy/scipy/blob/47bb6febaa10658c72962b9615d5d5aa2513fa3a/scipy/stats/mstats_basic.py#L2659-L2784
  const { sorted, copy, α = 0.375, β = 0.375 } = options
  const J = xJ.length
  if (J == 0) return array(qK.length, NaN)
  if (J <= 1) return array(qK.length, xJ[0])
  if (!sorted) {
    if (copy) xJ = xJ.slice()
    sort(xJ)
  }
  let zK = array(qK.length)
  each(qK, (q, k) => {
    const m = α + q * (1 - α - β)
    const a = J * q + m
    const r = ~~clip(a, 1, J - 1)
    const g = clip(a - r, 0, 1)
    zK[k] = (1 - g) * xJ[r - 1] + g * xJ[r]
  })
  return zK
}

const quantile = (xJ, q, options = {}) => quantiles(xJ, [q], options)[0]

// ess(wJ, [sum_wj])
// effective sample size for weights `wJ`
// approximates ideal value `J*Var(target)/MSE(sample)`
// equivalent sample size _if we could sample from target_
// see [Rethinking the Effective Sample Size](https://arxiv.org/abs/1809.04129) for derivation
// esp. section 3.2 "Summary of assumptions and approximations"
// can be used as sample size for `ks1_cdf` or `ks2_cdf`
function ess(wJ, sum_wj, ε = 1e-6) {
  let s = sum_wj ?? 0 // sum
  let ss = 0 // sum of squares
  if (defined(sum_wj)) {
    if (sum_wj < ε) return 0 // total weight too small
    for (let j = 0; j < wJ.length; ++j) {
      const w = wJ[j]
      ss += w * w
    }
  } else {
    for (let j = 0; j < wJ.length; ++j) {
      const w = wJ[j]
      ss += w * w
      s += w
    }
  }
  if (s < ε) return 0 // total weight too small
  return (s * s) / ss
}

// clips `x` to `[a,b]`
function clip(x, a = 0, b = 1) {
  if (x < a) return a
  if (x > b) return b
  return x
}

// clips `xJ` to `[a,b]`
function clip_in(xJ, a = 0, b = 1) {
  if (!is_array(xJ)) fatal('non-array argument')
  if (is_finite(a) && is_finite(b)) {
    for (let j = 0; j < xJ.length; ++j) {
      if (xJ[j] < a) xJ[j] = a
      else if (xJ[j] > b) xJ[j] = b
    }
  } else if (is_finite(a)) {
    for (let j = 0; j < xJ.length; ++j) if (xJ[j] < a) xJ[j] = a
  } else {
    for (let j = 0; j < xJ.length; ++j) if (xJ[j] > b) xJ[j] = b
  }
  return xJ
}
