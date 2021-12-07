// TODO: bin_counts and bin_weights
// TODO: separate representation from visualization
// TODO: always allow basic _tabular_ visualization
// TODO: document histogram, start charting

// up to `K` bins (`K+1` values) for `xJ`
// `K+1` values encode `K` half-open intervals $`[x_i,x_{i+1})`$
// can be given only range pair `[xs,xe]` or `min_max_in(xJ)`
// rounds boundary values `x` to `d` decimal places
// drops empty/small bins to return _up to_ `K` bins
function bins(xJ, K = 10, d = 2) {
  assert(is_array(xJ), `non-array argument`)
  assert(xJ.length, `empty array argument`)
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
  const r = xs - xsr - (last(xK) - xe)
  if (abs(r) > p)
    apply(xK, (x, k) =>
      round(x + r / 2, d, inf, k == 0 ? 'floor' : k == K - 1 ? 'ceil' : 'round')
    )
  assert(xK[0] < xs, `binning error: first bin ${xK[0]} ≥ ${xs}`)
  assert(xe < xK[K - 1], `binning error: last bin ${xK[K - 1]} ≤ ${xe}`)
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

function histogram(xJ, options = {}) {
  let {
    bins = 10,
    weights, // can be function or array
    range = min_max_in(xJ),
    label = 'auto', // auto|lower|upper
    label_format,
    bound_format, // for boundary values in label
    weight_format,
    bound_precision = 2, // args for round(x,...) for default bound_format
    weight_precision = 2, // args for round(x,...) for default weight_format
  } = options

  label_format ??= x => x
  bound_format ??= x => round(x, ...[bound_precision].flat())
  weight_format ??= x => round(x, ...[weight_precision].flat())

  // determine weight function wJ(j)
  const wJ = j => 1
  if (weights) {
    if (is_function(weights)) wJ = weights
    else if (is_array(weights)) wJ = j => weights[j]
    else fatal(`invalid weights`)
  }

  // bin xJ into K linear bins and aggregate wJ(j) into wK
  const J = xJ.length
  const K = bins
  const [xs, xe] = range
  const d = (xe - xs) / K
  const wK = array(K, 0)
  each(xJ, (x, j) => {
    if (x >= xs && x <= xe) wK[x == xe ? K - 1 : floor((x - xs) / d)] += wJ(j)
  })

  // generate bin labels
  const labels = array(K, k => {
    const lower = bound_format(xs + k * d)
    const upper = bound_format(k == K - 1 ? xe : xs + (k + 1) * d)
    // TODO: fix unused label_format... pass label as pair? also the linear binning is hard-coded inside this loop, which is not great and may be worth restructuring
    const range =
      `[${lower}, ${upper}` + (k == K - 1 && xe == max_in(xJ) ? ']' : ')')
    switch (label) {
      case 'range':
        return range
      case 'lower':
        return lower
      case 'upper':
        return upper
      case 'auto':
        if (
          range.endsWith(')') &&
          is_integer(parseFloat(lower)) &&
          upper == parseFloat(lower) + 1
        )
          return lower
        return range
      default:
        fatal(`invalid label '${label}'`)
    }
  })

  return zip(labels, wK)
}
