// TODO: break down histogram into simpler functions
// TODO: separate representation from visualization
// TODO: always allow basic _tabular_ visualization
// TODO: document histogram, start charting

function histogram(xJ, options = {}) {
  let {
    bins = 10,
    weights, // can be function or array
    range: [xs = mina(xJ), xe = maxa(xJ)] = [mina(xJ), maxa(xJ)],
    label = 'auto', // auto|lower|upper
    label_format,
    bound_format, // for boundary values in label
    weight_format,
    bound_precision = 2, // args for round(x,...) for default bound_format
    weight_precision = 2, // args for round(x,...) for default weight_format
    output = 'object', // array|object
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

  // bin xJ into K bins and aggregate wJ(j) into wK
  const J = xJ.length
  const K = bins
  const d = (xe - xs) / K
  const wK = array(K, 0)
  each(xJ, (x, j) => {
    if (x >= xs && x <= xe) wK[x == xe ? K - 1 : floor((x - xs) / d)] += wJ(j)
  })

  // generate bin labels
  const labels = array(K, k => {
    const lower = bound_format(xs + k * d)
    const upper = bound_format(k == K - 1 ? xe : xs + (k + 1) * d)
    const range =
      `[${lower}, ${upper}` + (k == K - 1 && xe == maxa(xJ) ? ']' : ')')
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

  // output as requested
  switch (output) {
    case 'array':
      return [labels, wK]
    case 'object':
      return _.zipObject(labels, wK)
    default:
      fatal(`invalid output '${output}'`)
  }
}
