// plot `obj` in item `name`
// `name` string can be first argument
function plot(obj, name = undefined) {
  ;[name, obj] = lookup_types(arguments, ['string', 'object']) // allow reordering of args
  if (is_array(name)) fatal('invalid arguments w/ multiple strings')
  let obj_tail // tail of plain-object arguments to be merged into obj
  if (is_array(obj) && obj.slice(1).every(is_plain_object)) {
    obj_tail = merge({}, ...obj.slice(1))
    obj = first(obj)
  }

  if (window.__sampler) fatal('plot(…) not allowed inside sample(…)')
  // wrap array argument as { data: { values: ... } }
  if (is_array(obj)) obj = { data: { values: obj } }
  if (!is_plain_object(obj))
    fatal('invalid argument to plot, must be plain object or array')
  name ||= obj.name || '#/plot' // default name can also be specified in obj
  if (!_this.name.startsWith('#')) fatal('plot called from unnamed item')
  if (!name.match(/^#?\/?[_\p{L}\d]+$/u))
    fatal(`invalid non-alphanumeric name '${name}' for plot item`)
  // prefix name with #/ if missing and convert to absolute name
  if (name.match(/^\w/)) name = '#/' + name
  else if (name.match(/^\/\w/)) name = '#' + name
  name = name.replace(/^#\//, _this.name + '/')

  if (!obj.data) obj = { data: obj } // data-only obj
  if (obj_tail) merge(obj, obj_tail) // merge obj_tail (if any) into obj
  let {
    data, // required
    renderer = 'lines', // string or packable function
    renderer_options, // options for renderer, passed via stringify/parse
    encoding = 'json', // used as language for markdown block
    encoder = stringify, // must be function (invoked by plot)
    decoder = 'parse', // string or packable function
    dependencies, // optional dependencies (besides #_util/plot)
    caption, // optional caption block (default: _md|markdown_<name> if exists)
    title, // optional title markdown placed immediately after label
  } = obj

  // wrap array data as { values: ... }
  if (is_array(data)) data = { values: data }

  if (!data) fatal('missing data')
  if (!is_plain_object(data) && !is_string(data))
    fatal('invalid plot data; must be plain object or path string for download')
  if (!renderer) fatal('missing renderer')
  if (!(is_function(renderer) || is_string(renderer))) fatal('invalid renderer')
  if (!(is_function(decoder) || is_string(decoder))) fatal('invalid decoder')
  if (!is_function(encoder)) fatal('invalid encoder')
  // convert renderer and parser to strings embeddable in macro
  if (is_function(renderer)) renderer = renderer.toString()
  if (!renderer.match(/^\w+$/)) renderer = `(${renderer})`
  if (is_function(decoder)) decoder = decoder.toString()
  if (!decoder.match(/^\w+$/)) decoder = `(${decoder})`
  const ro = renderer_options ? `,parse(read('json_options'))` : ''
  const macro = `${renderer}(${decoder}(read('${encoding}_data'))${ro})`
  dependencies = flat('#_util/plot', dependencies ?? []).join(' ')
  const text = encoder(data)

  // if no caption, check for default caption blocks
  if (!caption) {
    const plot_name = name.replace(/^.*\//, '')
    for (let pfx of ['_md_', '_markdown_', '_html_']) {
      if (read(`${pfx}${plot_name}_removed`)) {
        caption = pfx + plot_name
        break
      }
    }
  }

  // read caption if any
  let caption_text
  let caption_sync_js
  if (caption) {
    if (!(is_string(caption) && caption.match(/^\w+$/)))
      fatal('invalid caption (must be block name)')
    caption = caption.replace(/_removed$/, '') // drop required suffix
    caption_text = read(caption + '_removed')
    if (!caption_text)
      fatal(`could not read caption block '${caption}_removed'`)
    caption_sync_js = `function _on_item_change(...args) { _sync_caption('${caption}', ...args) }`
  }

  // look up item, create if missing
  let item = _item(name, { silent: true } /* do not log errors */)
  item ??= _create(name)

  // tag item if not tagged already
  if (!_this.tags_visible.includes(item.name.toLowerCase())) {
    const tag = item.name.replace(_this.name, '#') // make relative
    let text = read()
    // if item does not end with a separate line of tags, create a new line
    if (!text.match(/\n\s*#[^\n]+$/)) text += '\n' + tag
    else text += ' ' + tag
    write(text, '')
  }

  item.write_lines(
    item.name + (title ? ' ' + title : ''),
    `\<<${macro}>>`,
    caption_text ? block(caption, caption_text) : undefined,
    `<!--removed-->`,
    block(encoding + '_data', text),
    renderer_options
      ? block('json_options', stringify(renderer_options ?? {}))
      : undefined,
    caption_sync_js ? block('js', caption_sync_js) : undefined,
    `<!--/removed-->`,
    dependencies
  )

  // focus on plot item if focused on plotting item
  // (async call prevents re-focusing for multiple plots in same js run)
  invoke(async () => {
    if (lower(MindBox.get().trim()) == lower(_this.name)) {
      MindBox.set(item.name)
      await _update_dom() // wait for page update
    }
  })

  // prompt to delete untagged plots (subitems that import #_util/plot)
  // dispatch as task to execute once after last plot in run
  dispatch_task('delete_untagged_plots', () => {
    const untagged_plots = diff(
      _sublabels(_this.label).map(s => _this.label + '/' + s),
      _this.tags_visible
    ).filter(
      label =>
        label.indexOf('/', _this.label.length + 1) == -1 && // immediate children only
        _item(label)?.tags_hidden.includes('#util/plot')
    )
    const s = untagged_plots.length > 1 ? 's' : ''
    if (
      untagged_plots.length &&
      confirm(
        `delete ${untagged_plots.length} untagged plot${s} listed below?\n` +
          untagged_plots.join('\n')
      )
    ) {
      // focus back on plotting item if focused item is to be deleted
      if (untagged_plots.includes(lower(MindBox.get().trim())))
        MindBox.set(_this.name)
      each(untagged_plots, label => _item(label).delete(false /*confirm*/))
    }
    // write_log()
  })
}

function _sync_caption(
  caption,
  // ...args for _on_item_change
  id,
  label,
  prev_label,
  deleted,
  remote,
  dependency
) {
  if (remote || dependency || deleted) return
  const text = read(caption)
  const parent_name = _this.name.replace(/\/[^\/]*$/, '')
  const parent = _item(parent_name)
  if (caption != parent.read(caption)) parent.write(text, caption + '_removed')
}

// hist(xJ|xSJ, {…})
// histogram(s) for `xJ` or `xSJ`
// labeled counts or weights
function hist(xSJ, options = {}) {
  xSJ = matrixify(xSJ) // convert to matrix in case of single series xJ
  const S = xSJ.length // number of series
  const _options = options // original user options (no defaults)
  let {
    bins, // can be array or integer (for max bins)
    values, // can be array or integer, disables binning
    precision = 2, // d or [d,s] arguments to bin(xJ,…) or round_to(…)
    labeler = 'mid', // string or function (a,b,k) => label
    label_precision, // for fixed precision (decimal places); default is auto
    stringifier, // stringifier for numbers; default is round_to in string mode
    weights, // optional weights
    weight_precision = 2, // ignored if no weights
    sort_values_by, // non-binned mode only; see default below
    min_distinct_ratio = 0.5, // disable binning if <max(K+1,r*J) distinct
  } = options
  let wSJ = weights
  if (wSJ) {
    wSJ = matrixify(wSJ)
    if (!equal(dimensions(wSJ), dimensions(xSJ))) fatal('invalid weights')
  }

  let K // rows (bins or values)
  let lK // function for labels, defined below
  let cSK // array of counts or weights
  const max_bins = is_integer(bins) ? bins : 10

  // flatten xSJ and wSJ for binning or ranking
  const xZ = flat(xSJ)
  const wZ = wSJ ? flat(wSJ) : undefined

  // automatically disable binning if:
  // - bins option (integer or array) is not defined
  // - values option (integer or array) is defined
  // - xZ contains any non-numbers
  // - xZ has too few distinct numbers: < max(K+1, J*min_distinct_ratio))
  if (
    !defined(bins) &&
    (defined(values) ||
      !xZ.every(is_number) ||
      uniq(xZ).length < max(max_bins + 1, xZ.length * min_distinct_ratio))
  ) {
    // rank non-numeric values
    values ??= 10 // 10 values by default
    let cX = {}
    if (wZ) each(xZ, (x, z) => (cX[x] = (cX[x] ?? 0) + wZ[z]))
    else each(xZ, x => (cX[x] = (cX[x] ?? 0) + 1))
    if (is_integer(values)) {
      if (!(values > 0)) fatal('invalid values <= 0')
      // we rank by count/weight by default
      // we sort by keys if untruncated and numeric
      // arbitrary ordering is possible w/ values array
      // alternatively can pass sort_values_by option
      values = take(
        sort_values_by
          ? sort_by(keys(cX), sort_values_by)
          : size(cX) <= values && keys(cX).every(is_numeric)
          ? sort_by(keys(cX), x => x)
          : rank_by(keys(cX), x => cX[x]),
        values
      )
    }
    if (!is_array(values)) fatal('invalid values')
    K = values.length
    const cSX = array(S, s => {
      const xsJ = xSJ[s]
      const wsJ = wSJ?.[s]
      let csX = {}
      if (wsJ) each(xsJ, (x, j) => (csX[x] = (csX[x] ?? 0) + wsJ[j]))
      else each(xsJ, (x, j) => (csX[x] = (csX[x] ?? 0) + 1))
      return csX
    })
    cSK = array(S, s => lookup(cSX[s], values, 0))
    const labels = values //.map(stringifier ?? str)
    lK = () => labels
  } else {
    // bin numeric values
    const [d, s] = flat([precision])
    const xB = is_array(bins) ? bins : bin(xZ, max_bins, d, s)
    if (!is_array(xB)) fatal('non-array bins')
    label_precision ??= max_of(xB, _decimal_places)
    // note round_to is better because it rounds numerically before stringifying
    // applying toFixed directly can return odd values such as '-0', '-0.0', etc
    label_precision = label_precision.toString() // for round_to as stringifier
    stringifier ??= x => round_to(x, label_precision) // default stringifier
    K = xB.length - 1
    cSK = array(S, s => count_bins(xSJ[s], xB, wSJ?.[s]))

    lK = labeler => {
      if (is_string(labeler)) {
        if (labeler == 'left') labeler = (a, b) => stringifier(a)
        else if (labeler == 'right') labeler = (a, b) => stringifier(b)
        else if (labeler == 'range')
          labeler = (a, b) => stringifier(a) + '…' + stringifier(b)
        else if (labeler == 'mid')
          labeler = (a, b) => stringifier(round_to((a + b) / 2, d, s))
        else fatal(`unknown labeler '${labeler}'`)
      }
      if (!is_function(labeler)) fatal('invalid labeler')
      return array(K, k => labeler(xB[k], xB[k + 1], k))
    }
  }

  // round weights if weighted
  if (weights) {
    const [wd, ws] = flat(weight_precision)
    apply(cSK, csK => apply(csK, w => round_to(w, wd, ws)))
  }

  // returned data array w/ default labels & plotting methods attached below
  const cKS = transpose(cSK)
  const data = lK(labeler).map((lk, k) => [lk, ...cKS[k]])

  // helper for plotting
  function _plot(type, ...args) {
    let [name, options] = lookup_types(args, ['string', 'object'])
    name ??= options?.name ?? 'hist_' + type
    let labeler = options?.labeler ?? _options.labeler ?? 'range'
    let obj = { name, renderer_options: options, caption: options?.caption }
    switch (type) {
      case 'table':
        return plot({
          ...obj,
          data: lK(labeler).map((lk, k) => [lk, ...cKS[k]]),
          renderer: 'table',
        })
      case 'bars': {
        labeler = options?.labeler ?? _options.labeler ?? 'mid'
        return plot({
          ...obj,
          data: { labels: lK(labeler), values: cSK },
          renderer: 'bars',
          dependencies: ['#_c3'],
        })
      }
      case 'hbars': {
        return plot({
          ...obj,
          data: { labels: lK(labeler), values: cSK },
          renderer: 'hbars',
          renderer_options: {
            height: 10 + K * (5 + max(20, S * 10)),
            ...options,
          },
          dependencies: ['#_c3'],
        })
      }
      case 'lines': {
        if (values) fatal('hist(…).lines(…) requires binned mode')
        labeler = options?.labeler ?? _options.labeler ?? 'mid'
        const labels = lK(labeler)
        if (!is_numeric(labels[0]))
          fatal('hist(…).lines(…) needs numeric labels')
        return plot({
          ...obj,
          data: { x_values: labels, values: cSK },
          renderer: 'lines',
          dependencies: ['#_c3'],
        })
      }
    }
  }

  return assign(data, {
    table: (...args) => _plot('table', ...args),
    bars: (...args) => _plot('bars', ...args),
    vbars: (...args) => _plot('bars', ...args),
    hbars: (...args) => _plot('hbars', ...args),
    lines: (...args) => _plot('lines', ...args),
  })
}

// bin `xJ` into `≤K` bins `xB`
// `B` values encode `B-1` _right-open intervals_ $`[x_b,x_{b+1})`$
// can be given only range pair `[xs,xe]` or `min_max_in(xJ)`
// rounds boundary values to `d` decimal places
// can also round to at most `s` significant digits
// drops empty or small bins to return `≤K` bins
function bin(xJ, K = 10, d = 2, s = inf) {
  if (!is_array(xJ)) fatal('non-array argument')
  if (!xJ.length) fatal('empty array argument')
  if (!(is_integer(K) && K > 0)) fatal(`invalid bin count ${K}`)
  let [xs, xe] = min_max_in(xJ)
  if (!(is_finite(xs) && is_finite(xe))) fatal(`array contains infinities`)
  const p = parseFloat(`1e${-d}`) // absolute precision
  // align first/last bins to precision, shifting for strict containment
  let xsr = round_to(xs, d, inf, 'floor')
  let xer = round_to(xe, d, inf, 'ceil')
  if (xsr == xs) xsr -= p
  if (xer == xe) xer += p
  // round up bin width to at least 2x precision
  const xd = max(2 * p, round_to((xer - xsr) / K, d, inf, 'ceil'))
  // generate bins until last value is contained
  let xK = [xsr]
  while (last(xK) <= xe) xK.push(round_to(last(xK) + xd, d))
  K = xK.length
  // shift (and re-round) bins to equalize gap from first/last value
  const r = round_to(xs - xsr - (last(xK) - xe), d)
  if (abs(r) > p) apply(xK, (x, k) => round_to(x + r / 2, d))
  if (!(xK[0] < xs)) fatal(`binning error: first bin ${xK[0]} ≥ ${xs}`)
  if (!(xe < xK[K - 1])) fatal(`binning error: last bin ${xK[K - 1]} ≤ ${xe}`)
  // apply additional rounding for significant digits
  if (s < inf) {
    if (!(s > 0)) fatal(`invalid significant digits ${s}`)
    apply(xK, (x, k) =>
      round_to(x, d, s, k == 0 ? 'floor' : k == K - 1 ? 'ceil' : 'round')
    )
    xK = uniq(xK)
    K = xK.length
    if (!(xK.length > 1 && xK[0] < xs && xe < xK[K - 1]))
      fatal(
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
function count_bins(xJ, xB = bin(xJ), wJ = undefined) {
  if (!is_array(xJ)) fatal('non-array argument')
  if (!xJ.length) fatal('empty array')
  if (!is_array(xB)) fatal('non-array bins')
  const K = xB.length - 1 // number of bins
  if (!(K > 0 && xB.every((x, b) => b == 0 || x > xB[b - 1])))
    fatal('invalid bins')
  const cK = array(xB.length - 1, 0)
  if (wJ) {
    if (!(is_array(wJ) && wJ.length == xJ.length)) fatal('invalid weights')
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

function _extract_template_options(options = {}, defaults = {}) {
  const props = ['width', 'max_width', 'height', 'style', 'styles', 'classes']
  let {
    width = 'auto',
    max_width = 'none',
    height = 200,
    style = '',
    styles = '',
    classes = '',
  } = merge(defaults, pick(options, props))
  options = omit(options, props) // remove props from options
  if (is_number(width)) width += 'px'
  if (is_number(max_width)) max_width += 'px'
  if (is_number(height)) height += 'px'
  style = `width:${width};max-width:${max_width};height:${height};${style}`
  style = `style="${style}"`
  styles = flat(styles).join('\n')
  return { style, styles, classes, options }
}

function _plot(type, data, _options, defaults = {}) {
  const { style, styles, classes, options } =
    _extract_template_options(_options)
  // pass along data/options via item store keyed by macro cid
  // macro cid is also passed to html via template string __cid__
  // macro cid is preferred to html script cid for consistency
  _this.store[`${type}-$cid`] = { data, options: merge(defaults, options) }
  return block(
    '_html',
    _item('#util/plot')
      .read(`html_${type}`)
      .replace(/__classes__/g, classes)
      .replace(/__style__/g, style)
      .replace(/\/\* *__styles__ *\*\//g, styles)
      .replace(/#plot\b/g, `#${type}-__cid__`)
      .replace(/__pid__/g, `${type}-$cid`) // plot id w/ type prefix
      .replace(/__cid__/g, '$cid')
  )
}

// rendering helper to resolve inputs to html scripts via _this.store
// also allows data to be specified as path string for download
function _render_plot(key, render) {
  let { data, options } = _this.store[key]
  if (!is_plain_object(options)) fatal('invalid options for plot')
  if (!is_plain_object(data) && !is_string(data)) fatal('invalid data')
  if (is_string(data)) data = download(data)
  if (is_promise(data)) resolve(data).then(data => render(data, options))
  else render(data, options)
}

// bars(data, {…})
// bar chart
function bars(data, options = {}) {
  return _plot('bars', data, options, {
    series: [], // {label, color, axis}
    bar_axis: false,
    bar_values: false,
    delta: false, // add delta column? (for 2-column data only)
    delta_color: '#48d',
    value_format: '.2~f',
    // options to help fit labels on narrow screens
    max_labels: outerWidth < 1024 ? 13 : Infinity,
    label_angle: 0,
  })
}

// hbars(data, {…})
// horizontal bar chart
function hbars(data, options = {}) {
  return _plot('hbars', data, options, {
    series: [], // {label, color, axis}
    bar_axis: false,
    bar_values: false,
    value_format: '.2~f',
    delta: false, // add delta column? (for 2-column data only)
    delta_color: '#48d',
  })
}

// lines(data, {…})
// line chart
function lines(data, options = {}) {
  return _plot('lines', data, options, {
    series: [], // {label, color, axis}
    ...options, // can contain any c3 chart options, e.g. title
  })
}
