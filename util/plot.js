// bin `xJ` into `≤K` bins `xB`
// `B` values encode `B-1` _right-open intervals_ $`[x_b,x_{b+1})`$
// can be given only range pair `[xs,xe]` or `min_max_in(xJ)`
// rounds boundary values to `d` decimal places
// can also round to at most `s` significant digits
// drops empty or small bins to return `≤K` bins
function bin(xJ, K = 10, d = 2, s = inf) {
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

function _test_bin() {
  check(
    () => throws(() => bin([])),
    () => throws(() => bin([inf])),
    () => throws(() => bin([-inf])),
    () => throws(() => bin([0], 0)),
    () => throws(() => bin([0], -1)),
    () => [bin([0], 1), [-0.01, 0.01]],
    () => [bin([0]), [-0.01, 0.01]], // empty bins dropped/merged
    () => [bin([0]), [-0.01, 0.01]],
    () => [bin([0, 0.009]), [-0.01, 0.01]], // too close to create bin
    () => [bin([-0.009, 0]), [-0.01, 0.01]], // too close to create bin
    () => [bin([0, 0.01]), [-0.01, 0.01, 0.03]],
    () => [bin([0, 1], 1), [-0.01, 1.01]],
    () => [bin([0, 1], 2), [-0.01, 0.5, 1.01]],
    () => [bin([0, 1], 3), [-0.01, 0.33, 0.67, 1.01]],
    // test varying precision from -10 to 10
    () => [bin([0, 1], 3, 2), [-0.01, 0.33, 0.67, 1.01]],
    () => [bin([0, 1], 3, 3), [-0.001, 0.333, 0.667, 1.001]],
    () => [bin([0, 1], 3, 4), [-0.0001, 0.3333, 0.6667, 1.0001]],
    () => [bin([0, 1], 3, 5), [-0.00001, 0.33333, 0.66667, 1.00001]],
    // test reducing significant digits ...
    () => [bin([0, 1], 3, 5, 6), [-0.00001, 0.33333, 0.66667, 1.00001]],
    () => [bin([0, 1], 3, 5, 5), [-0.00001, 0.33333, 0.66667, 1.0001]],
    () => [bin([0, 1], 3, 5, 4), [-0.00001, 0.3333, 0.6667, 1.001]],
    () => [bin([0, 1], 3, 5, 3), [-0.00001, 0.333, 0.667, 1.01]],
    () => [bin([0, 1], 3, 5, 2), [-0.00001, 0.33, 0.67, 1.1]],
    () => [bin([0, 1], 3, 5, 1), [-0.00001, 0.3, 0.7, 2]],
    () => [bin([0, 1], 3, 10), [-1e-10, 0.3333333333, 0.6666666667, 1 + 1e-10]],
    () => [bin([0, 1], 3, 1), [-0.3, 0.3, 0.8, 1.3]],
    () => [bin([0, 1], 3, 0), [-1, 1, 3]],
    () => [bin([0, 1], 3, -1), [-10, 10]],
    () => [bin([0, 1], 3, -2), [-100, 100]],
    () => [bin([0, 1], 3, -10), [-1e10, 1e10]]
  )
}

// count `xJ` into bins `xB`
// can aggregate optional weights `wJ`
function count(xJ, xB = bin(xJ), wJ = undefined) {
  assert(is_array(xJ), 'non-array argument')
  assert(xJ.length, 'empty array')
  assert(is_array(xB), 'non-array bins')
  const K = xB.length - 1 // number of bins
  assert(K > 0 && xB.every((x, b) => b == 0 || x > xB[b - 1]), 'invalid bins')
  const cK = array(xB.length - 1, 0)
  if (wJ) {
    assert(is_array(wJ) && wJ.length == xJ.length, 'invalid weights')
    each(xJ, (x, j) => {
      const k = sorted_last_index(xB, x) - 1
      if (k < 0 || k >= K) return // outside first/last bin
      cK[k] += wJ[j]
    })
  } else {
    each(xJ, x => {
      const k = sorted_last_index(xB, x) - 1
      if (k < 0 || k >= K) return // outside first/last bin
      cK[k]++
    })
  }
  return cK
}

// histogram(xJ, {…})
function histogram(xJ, options = {}) {
  let {
    bins, // can be array or integer (for max bins)
    precision = 1, // d or [d,s] arguments to bin(xJ,…) or round(…)
    label_precision, // for fixed precision (decimal places); default is auto
    value_formatter = x => x.toFixed(label_precision),
    labeler = (a, b) => [value_formatter(a), value_formatter(b)],
    labels, // custom labels
    weights, // optional weights
    weight_precision = 2, // ignored if no weights
  } = options
  // interpret integer bins as max_bins
  if (is_integer(bins)) {
    max_bins = bins
    bins = undefined
  }
  const [d, s] = flat(precision)
  const xB = is_array(bins) ? bins : bin(xJ, is_integer(bins) ? bins : 10, d, s)
  label_precision ??= min_of(xB, _decimal_places)
  assert(is_array(xB), 'non-array bins')
  const cK = count(xJ, xB, weights)
  const [wd, ws] = flat(weight_precision)
  if (weights) apply(cK, w => round(w, wd, ws))
  const lK = labels ?? array(cK.length, k => labeler(xB[k], xB[k + 1]))
  return set(transpose([lK, cK]).map(flatten), 'name', 'histogram')
}

function plot(obj, name = undefined) {
  assert(is_object(obj), 'non-object argument')
  name ||= obj.name || '#/plot' // default name can also be specified in obj
  if (!obj.data) obj = { data: obj } // data-only obj
  let {
    data, // required
    renderer = 'table', // can be function or string
    // data<->text encoder/decoder
    encoding = 'json', // block type/name (_removed is appended)
    encoder = stringify, // must be function
    decoder = 'parse', // can be function or string
    deps, // optional dependencies (besides #_util/core)
  } = obj

  assert(data, 'missing data')
  assert(renderer, 'missing renderer')
  assert(is_function(renderer) || is_string(renderer), 'invalid renderer')
  assert(is_function(decoder) || is_string(decoder), 'invalid decoder')
  assert(is_function(encoder), 'invalid encoder')
  // convert renderer and parser to strings embeddable in macro
  if (is_function(renderer)) renderer = renderer.toString()
  if (!renderer.match(/^\w+$/)) renderer = `(${renderer})`
  if (is_function(decoder)) decoder = decoder.toString()
  if (!decoder.match(/^\w+$/)) decoder = `(${decoder})`
  const macro = `${renderer}(${decoder}(read('${encoding}')))`
  deps = flat('#_util/core', deps ?? []).join(' ')
  const text = encoder(data)

  // determine item
  assert(_this.name.startsWith('#'), 'plot called from unnamed item')
  if (name.match(/^\w/)) name = '/' + name
  if (name.match(/^\/\w/)) name = '#' + name
  if (name.match(/^#\/\w/)) name = name.replace(/^#\//, _this.name + '/')
  let item = _item(name, false /* do not log errors */)
  item ??= _create(name)

  // tag item if not tagged already
  if (!_this.tags_visible.includes(item.name)) {
    const tag = item.name.replace(_this.name, '#') // make relative
    let text = read()
    // if item does not end with a line of tags, create a new line
    if (!text.match(/\n *#[^\n]*$/)) text += '\n' + tag
    else text += ' ' + tag
    write(text, '')
  }

  item.write_lines(
    item.name,
    `\<<${macro}>>`,
    block(encoding + '_removed', text),
    deps
  )

  // write any logs to calling item
  write_log()

  // focus on output item
  dispatch(async () => {
    if (MindBox.get() != item.name) {
      MindBox.set(item.name)
      await _update_dom() // wait for page update
    }
    if (!item.elem) {
      console.warn(`missing element for ${item.name}`)
      return
    }
    // scroll item to ~middle of screen if too low
    if (item.elem.offsetTop > document.body.scrollTop + innerHeight * 0.9)
      document.body.scrollTo(0, item.elem.offsetTop - innerHeight / 2)
  })
}
