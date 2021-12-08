// TODO: bin_labels
// TODO: separate representation from visualization
// TODO: always allow basic _tabular_ visualization
// TODO: document histogram, start charting

// bins `xJ` into `≤K` bins `xB`
// `B` values encode `B-1` _right-open intervals_ $`[x_b,x_{b+1})`$
// can be given only range pair `[xs,xe]` or `min_max_in(xJ)`
// rounds boundary values to `d` decimal places
// can also round to at most `s` significant digits
// drops empty or small bins to return `≤K` bins
function bins(xJ, K = 10, d = 2, s = inf) {
  assert(is_array(xJ), 'non-array argument')
  assert(xJ.length, 'empty array argument')
  assert(is_integer(K) && K > 0, `invalid bin count ${K}`)
  let [xs, xe] = min_max_in(xJ)
  assert(is_finite(xs) && is_finite(xe), `array contains infinities`)
  const p = parseFloat(`1e${-d}`) // absolute precision
  // align first/last bins to precision, shifting for strict containment
  let xsr = round(xs, d, inf, 'floor')
  let xer = round(xe, d, inf, 'ceil')
  if (xsr == xs) xsr -= p
  if (xer == xe) xer += p
  // round up bin width to at least 2x precision
  const xd = max(2 * p, round((xer - xsr) / K, d, inf, 'ceil'))
  // generate bins until last value is contained
  let xK = [xsr]
  while (last(xK) <= xe) xK.push(round(last(xK) + xd, d))
  K = xK.length
  // shift (and re-round) bins to equalize gap from first/last value
  const r = round(xs - xsr - (last(xK) - xe), d)
  if (abs(r) > p) apply(xK, (x, k) => round(x + r / 2, d))
  assert(xK[0] < xs, `binning error: first bin ${xK[0]} ≥ ${xs}`)
  assert(xe < xK[K - 1], `binning error: last bin ${xK[K - 1]} ≤ ${xe}`)
  // apply additional rounding for significant digits
  if (s < inf) {
    assert(s > 0, `invalid significant digits ${s}`)
    apply(xK, (x, k) =>
      round(x, d, s, k == 0 ? 'floor' : k == K - 1 ? 'ceil' : 'round')
    )
    xK = uniq(xK)
    K = xK.length
    assert(
      xK.length > 1 && xK[0] < xs && xe < xK[K - 1],
      `failed to adjust bins for s=${s}, range=[${xs},${xe}], bins=[${xK}]`
    )
  }
  return xK
}

function _test_bins() {
  check(
    () => throws(() => bins([])),
    () => throws(() => bins([inf])),
    () => throws(() => bins([-inf])),
    () => throws(() => bins([0], 0)),
    () => throws(() => bins([0], -1)),
    () => [bins([0], 1), [-0.01, 0.01]],
    () => [bins([0]), [-0.01, 0.01]], // empty bins dropped/merged
    () => [bins([0]), [-0.01, 0.01]],
    () => [bins([0, 0.009]), [-0.01, 0.01]], // too close to create bin
    () => [bins([-0.009, 0]), [-0.01, 0.01]], // too close to create bin
    () => [bins([0, 0.01]), [-0.01, 0.01, 0.03]],
    () => [bins([0, 1], 1), [-0.01, 1.01]],
    () => [bins([0, 1], 2), [-0.01, 0.5, 1.01]],
    () => [bins([0, 1], 3), [-0.01, 0.33, 0.67, 1.01]],
    // test varying precision from -10 to 10
    () => [bins([0, 1], 3, 2), [-0.01, 0.33, 0.67, 1.01]],
    () => [bins([0, 1], 3, 3), [-0.001, 0.333, 0.667, 1.001]],
    () => [bins([0, 1], 3, 4), [-0.0001, 0.3333, 0.6667, 1.0001]],
    () => [bins([0, 1], 3, 5), [-0.00001, 0.33333, 0.66667, 1.00001]],
    // test reducing significant digits ...
    () => [bins([0, 1], 3, 5, 6), [-0.00001, 0.33333, 0.66667, 1.00001]],
    () => [bins([0, 1], 3, 5, 5), [-0.00001, 0.33333, 0.66667, 1.0001]],
    () => [bins([0, 1], 3, 5, 4), [-0.00001, 0.3333, 0.6667, 1.001]],
    () => [bins([0, 1], 3, 5, 3), [-0.00001, 0.333, 0.667, 1.01]],
    () => [bins([0, 1], 3, 5, 2), [-0.00001, 0.33, 0.67, 1.1]],
    () => [bins([0, 1], 3, 5, 1), [-0.00001, 0.3, 0.7, 2]],
    () => [
      bins([0, 1], 3, 10),
      [-1e-10, 0.3333333333, 0.6666666667, 1 + 1e-10],
    ],
    () => [bins([0, 1], 3, 1), [-0.3, 0.3, 0.8, 1.3]],
    () => [bins([0, 1], 3, 0), [-1, 1, 3]],
    () => [bins([0, 1], 3, -1), [-10, 10]],
    () => [bins([0, 1], 3, -2), [-100, 100]],
    () => [bins([0, 1], 3, -10), [-1e10, 1e10]]
  )
}

// counts `xJ` into bins `xB`
function bin_counts(xJ, xB = bins(xJ)) {
  assert(is_array(xJ), 'non-array argument')
  assert(xJ.length, 'empty array')
  assert(is_array(xB), 'non-array bins')
  const K = xB.length - 1 // number of bins
  assert(K > 0 && xB.every((x, b) => b == 0 || x > xB[b - 1]), 'invalid bins')
  const cK = array(xB.length - 1, 0)
  each(xJ, x => {
    const k = sorted_last_index(xB, x) - 1
    if (k < 0 || k >= K) return // outside first/last bin
    cK[k]++
  })
  return cK
}

// sums weights `wJ` for `xJ` into bins `xB`
function bin_weights(xJ, wJ, xB = bins(xJ)) {
  assert(
    is_array(xJ) && is_array(wJ) && xJ.length == wJ.length,
    'invalid arguments'
  )
  assert(xJ.length, 'empty array')
  assert(is_array(xB), 'non-array bins')
  const K = xB.length - 1 // number of bins
  assert(K > 0 && xB.every((x, b) => b == 0 || x > xB[b - 1]), 'invalid bins')
  const cK = array(xB.length - 1, 0)
  each(xJ, (x, j) => {
    const k = sorted_last_index(bins, x) - 1
    if (k < 0 || k >= K) return // outside first/last bin
    cK[k] += wJ[j]
  })
  return cK
}

// labels for bins `xB` using labeler `f`
function bin_labels(xB, f = (a, b) => a + '…' + b) {
  assert(is_array(xB), 'non-array bins')
  const K = xB.length - 1 // number of bins
  assert(K > 0 && xB.every((x, b) => b == 0 || x > xB[b - 1]), 'invalid bins')
  return array(K, k => f(xB[k], xB[k + 1]))
}

function histogram(xJ, options = {}) {
  const {
    max_bins = 10,
    precision = 2, // d or [d,s] arguments to bins(xJ,…) or round(…)
    labels,
    weights,
  } = options
  const xB = options.bins ?? bins(xJ, max_bins, ...flat(precision))
  assert(is_array(xB), 'non-array bins')
  const sK = labels ?? bin_labels(xB)
  assert(is_array(sK), 'non-array labels')
  const cK = weights ? bin_weights(xJ, weights, xB) : bin_counts(xJ, xB)
  assert(is_array(cK) && cK.length == sK.length, 'bin/label mismatch')
  return transpose([sK, cK])
}
