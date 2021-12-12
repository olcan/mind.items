// is `x` from `domain`?
// | sampler function | `x` via function `≡{via:func}`
// | type string      | `x` is of type `≡{is:type}`
// | array            | `x` in array, `≡{in:array}`
// | object           | `x` matching constraints
// | `{}`             | everything (no constraints)
// | `via:func`       | `func._domain || {}`
// | `is:type`        | `≡ is(x,type)` see [types](#util/core/types)
// | `in:[…]`         | `≡ […].includes(x)`, see [sameValueZero](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness)
// | `in_eq:[…]`      | values `x==y`
// | `in_eqq:[…]`     | values `x===y`
// | `in_equal:[…]`   | values `equal(x,y)`, see [isEqual](https://lodash.com/docs/4.17.15#isEqual)
// | `eq:y`           | equality `x==y`
// | `eqq:y`          | strict equality `x===y`
// | `equal:y`        | equality via `equal(x,y)`
// | `gte|lte:y`      | inequality `x≥y`, `x≤y`
// | `gt|lt:y`        | strict inequality `x>y`, `x<y`
// | `and|or:[…]`     | composite domain
// `false` for unknown (or missing) `domain`
function from(x, domain) {
  if (!domain) return false
  if (is_function(domain)) return from({ via: domain })
  if (is_string(domain)) return is(x, domain) // ≡{is:type}
  if (is_array(domain)) return domain.includes(x) // ≡{in:array}
  if (!is_object(domain)) false
  return Object.keys(domain).every(key => {
    switch (key) {
      case 'via':
        if (is_function(domain.via)) {
          // function may optionally declare return domain as _domain
          // otherwise function is allowed to return anything
          if (domain.via._domain) return from(x, domain.via._domain)
          else return true // function can return anything
        } else return false // unknown "via" domain
      case 'is':
        return is(x, domain.is)
      case 'in':
        return domain.in.includes(x) // sameValueZero
      case 'in_eq':
        return domain.in_eq.some(y => x == y)
      case 'in_eqq':
        return domain.in_eqq.some(y => x === y)
      case 'in_equal':
        return domain.in_equal.some(y => equal(x, y))
      case 'eq':
        return x == domain.eq
      case 'eqq':
        return x === domain.eqq
      case 'equal':
        return equal(x, domain.equal)
      case 'gte':
        return x >= domain.gte
      case 'lte':
        return x <= domain.lte
      case 'gt':
        return x > domain.gt
      case 'lt':
        return x < domain.lt
      case 'and':
        return domain.and.every(dom => from(x, dom))
      case 'or':
        return domain.or.some(dom => from(x, dom))
      default:
        return key[0] == '_' // accept private _key only (for internal use)
    }
  })
}

// sample(domain, [options])
// sample value `x` from `domain`
// random variable is denoted `X ∈ dom(X)`
// _prior model_ `P(X)` is defined or implied by `domain`
// can be _conditioned_ as `P(X|c)` using `condition(c)`
// can be _weighted_ as `∝ P(X) × W(X)` using `weight(…)`
// sampler function `domain` is passed new _sampler `context`_
// non-function `domain` requires outer `sample(context=>{ … })`
// special _sampler domain_ can specify `domain._prior`, `._posterior`
// conditions/weights are scoped by outer `sample(context=>{ … })`
// samples are tied to _lexical context_, e.g. are constant in loops
// `options` for all domains:
// | `name`        | name of sampled value
// |               | default inferred from lexical context
// |               | e.g. `let x = sample(…) ≡ sample(…,{name:'x'})`
// | `prior`       | prior sampler `f => f(x,[log_pw=0])`
// |               | `x~S(X), log_pw=log(∝p(x)/s(x))`
// |               | _default_: `domain._prior`
// | `posterior`   | posterior (chain) sampler `(f,x) => f(x,y,[log_mw=0])`
// |               | `y~Q(Y|x), log_mw=log(∝q(x|y)/q(y|x))`
// |               | _default_: `domain._posterior`
// | `target`      | target cdf, sample, or sampler domain for `tks` metric
// |               | `tks` is _target KS_ `-log2(ks1|2_test(sample, target))`
// |               | for sampler domain, sample `size` can be specified
// |               | default `size` is inherited from context (see below)
// |               | also see below `targets` option for context
// |               | _default_: no target (`tks=0`)
// `options` for sampler function (_context_) domains `context=>{ … }`:
// | `size`        | sample size `J`, _default_: `1000`
// |               | ≡ _independent_ runs of `context=>{ … }`
// |               | ≡ posterior update chains (dependent runs)
// | `resample_if` | resample predicate `context => …`
// |               | called once per update step `context.u = 0,1,…`
// |               | _default_: `({ess,essu,J}) => ess/essu < clip(essu/J,.5,1)`
// |               | default allows `ess→essu→J` w/ effective moves for `essu→J`
// | `move_while`  | move predicate `context => …`
// |               | called _until false_ every update step `context.u = 0,1,…`
// |               | `context.p` is proposed move count (current update step)
// |               | `context.a` is accepted move count (current update step)
// |               | `context.m` is total move count (all update steps)
// |               | _default_: `({essu,J,a}) => essu<J/2 || a<J`
// |               | default allows `essu→J` w/ up to `J/2` slow-moving samples
// | `weight_exp`  | weight exponent function `u => …` `∈[0,1]`
// |               | multiplied into `log_w` and `log_wu(u)` (if defined)
// |               | triggers warning if sampling is stopped at `weight_exp<1`
// |               | does not affect `-inf` weights, e.g. due to conditioning
// |               | _default_: `u => min(1, (u+1)/3)`
// | `max_updates` | maximum number of update steps, _default_: `inf`
// | `min_updates` | minimum number of update steps, _default_: `0`
// | `max_time`    | maximum time (ms) for sampling, _default_: `100` ms
// | `min_time`    | minimum time (ms) for sampling, _default_: `0` ms
// | `min_ess`     | minimum `ess` desired (within `max_time`), _default_: `J/2`
// | `max_mks`     | maximum `mks` desired (within `max_time`)
// |               | `mks` is _move KS_ `-log2(ks2_test(from, to))`
// |               | _default_: `3` ≡ failure to reject same-dist at `ɑ<1/8`
// | `mks_buffer`  | move buffer size `B` for `mks`, _default_: `1000`
// | `mks_period`  | move buffer period for `mks`, _default_: `ceil(3*J/M)`
// | `updates`     | target number of update steps, _default_: auto
// |               | _warning_: can cause pre-posterior sampling w/o warning
// | `time`        | target time (ms) for sampling, _default_: auto
// |               | _warning_: can cause pre-posterior sampling w/o warning
// | `targets`     | object of targets for named values sampled in this context
// |               | see `target` option above for possible targets
function sample(domain, options) {
  // decline non-function domain which requires a parent sampler that would have replaced calls to sample(…)
  assert(
    is_function(domain),
    `invalid sample(…) call outside of sample(context=>{ … })`
  )
  // decline target for root sampler since that is no parent to track tks
  assert(!options?.target, `invalid target outside of sample(context=>{ … })`)
  return new _Sampler(domain, options).sample()
}

function _benchmark_sample() {
  _benchmark_options.N = 10
  benchmark(
    () => sample(() => {}, { size: 10000, updates: 0 }),
    () => sample(() => {}, { size: 10000, updates: 1 }),
    () => sample(() => {}, { size: 1000, updates: 10 }),
    () => sample(() => {}, { size: 100, updates: 10 }),
    () => sample(() => sample(uniform()), { size: 100, updates: 10 }),
    () =>
      sample(
        () => {
          let a = sample(uniform())
          let b = sample(uniform(a, 1))
          condition(b > 0.9)
        },
        { size: 100, updates: 20 }
      )
  )
}

// condition(c, [log_wu])
// condition samples on `c`
// scoped by outer `sample(context=>{ … })`
// conditions models `P(X) → P(X|c)` for all `X` in context
// corresponds to _indicator weights_ `𝟙(c|X) = (c ? 1 : 0)`
// `≡ weight(c ? 0 : -inf)`, see more general `weight(…)` below
// requires `O(1/P(c))` samples; ___can fail for rare conditions___
// _weight sequence_ `log_wu(u)=0↘-∞, u=0,1,…` can help, see #/weight
// _likelihood weights_ `∝ P(c|X) = E[𝟙(c|X)]` can help, see `weight(…)`
function condition(c, log_wu) {
  fatal(`unexpected call to condition(…)`)
}

// weight(log_w, [log_wu])
// weight samples by `log_w`
// scoped by outer `sample(context=>{ … })`
// normalized weights can be denoted as prob. dist. `W(X)`
// augments models `P(X) -> ∝ P(X) × W(X)` for all `X` in context
// _likelihood weights_ `∝ P(c|X)` condition models `P(X) → P(X|c)`
// effective sample size (ess) becomes `1/E[W²]`; ___can fail for extreme weights___
// _weight sequence_ `log_wu(u)=0→log_w, u=0,1,…` can help
// see #/weight for technical details
function weight(log_w, guide) {
  fatal(`unexpected call to weight(…)`)
}

// is `wJ` uniform?
function _uniform(wJ, wj_sum = sum(wJ), ε = 1e-6) {
  const w_mean = wj_sum / wJ.length
  const [w_min, w_max] = [(1 - ε) * w_mean, (1 + ε) * w_mean]
  return wJ.every(w => w >= w_min && w <= w_max)
}

class _Sampler {
  constructor(func, options) {
    this.start_time = Date.now()
    // merge in default options
    const J = (this.J = options?.size ?? 1000)
    assert(J > 0, `invalid sample size ${J}`)
    const B = (this.B = options?.mks_buffer ?? 1000)
    assert(B > 0 && B % 2 == 0, `invalid move buffer size ${B}`)
    this.options = options = _.merge(
      {
        log: false, // silent by default
        warn: true,
        size: J,
        resample_if: ({ ess, essu, J }) => ess / essu < clip(essu / J, 0.5, 1),
        move_while: ({ essu, J, a }) => essu < J / 2 || a < J,
        weight_exp: u => min(1, (u + 1) / 3),
        max_updates: inf,
        min_updates: 0,
        max_time: 100,
        min_time: 0,
        min_ess: J / 2,
        max_mks: 3,
        mks_buffer: B,
        mks_period: ceil((3 * J) / B),
      },
      options
    )
    if (options.log)
      print(`mks_buffer: ${this.B} (period ${options.mks_period})`)

    // set up default prior/posterior sampler functions
    this._prior = f => f(this.sample({ prior: true }))
    this._posterior = f => f(this.sample())

    // replace sample|condition|weight|... calls
    window.__sampler = this // for use in replacements instead of `this`
    const js = func.toString()
    const lines = js.split('\n')
    this.values = []
    this.names = []
    this.js = js.replace(
      /(?:(?:^|\n|;) *(?:const|let|var) *(\w+) *= *|\b)(sample|condition|weight) *\(/g,
      (m, name, method, offset) => {
        // extract lexical context
        if (js[offset] == '\n') offset++ // skip leading \n if matched
        const prefix = js.slice(0, offset)
        const suffix = js.slice(offset)
        const line_prefix = prefix.match(/.*$/)[0]
        const line_suffix = suffix.match(/^.*/)[0]
        const line_index = _count_unescaped(prefix, '\n')
        const line = lines[line_index]
        check(() => [line_prefix + line_suffix, line]) // sanity check

        // skip matches inside comments or strings
        if (
          line_prefix.match(/\/\/.*$/) ||
          _count_unescaped(prefix, '/*') > _count_unescaped(prefix, '*/') ||
          _count_unescaped(prefix, '`') % 2 ||
          _count_unescaped(line_prefix, "'") % 2 ||
          _count_unescaped(line_prefix, '"') % 2
        )
          return m

        // skip method calls
        if (line_prefix.match(/\.$/)) return m

        // skip function definitions (e.g. from imported #util/sample)
        if (line_prefix.match(/function *$/)) return m
        if (line_suffix.match(/{ *$/)) return m

        // uncomment to debug replacement issues ...
        // console.log(offset, line_prefix + line_suffix)

        // replace non-sample function all
        if (method != 'sample') return `__sampler._${method}(`

        // parse args, allowing nested parentheses
        // this is naive about strings, comments, escaping, etc
        // but it should work as long as parentheses are balanced
        let args = ''
        let depth = 0
        for (let i = 0; i < suffix.length; i++) {
          const c = suffix[i]
          if (c == ')' && --depth == 0) break
          if (depth) args += c
          if (c == '(') depth++
        }

        // replace sample call
        const k = this.values.length
        this.values.push({ js, index: k, offset, name, args, line_index, line })
        this.names.push(name || k)
        return m.replace(/sample *\($/, `__sampler._sample(${k},`)
      }
    )
    // evaluate new function w/ replacements
    // wrapping in parentheses is required for named functions
    // does not capture variables from calling context
    this.func = eval('(' + this.js + ')')
    // console.log(this.js)

    // initialize run state
    this.K = this.values.length
    this.xJK = matrix(J, this.K) // samples per run/value
    this.xJk = array(J) // tmp array for sampling columns of xJK
    this.pxJK = matrix(J, this.K) // prior samples per run/value
    this.yJK = matrix(J, this.K) // posterior (chain) samples per run/value
    this.yJk = array(J) // tmp array for sampling columns of yJK
    this.m = 0 // move count
    this.mb = 0 // moves since last buffered move (i.e. unbuffered moves)
    this.b = 0 // moves buffered, also index into move buffers xBK,yBK
    this.xBK = array(this.B)
    this.yBK = array(this.B)
    this.log_pwJ = array(J) // prior log-weights per run
    this.log_wJ = array(J) // posterior log-weights
    this.log_wufJ = array(J) // posterior log-weight sequences
    this.log_wuJ = array(J) // posterior log-weights for step u
    this.log_rwJ = array(J) // posterior/sample ratio log-weights
    this.log_mwJ = array(J) // posterior move log-weights
    this.log_cwJ = array(J) // posterior candidate log-weights
    this.log_cwufJ = array(J) // posterior candidate log-weight sequences
    this.xJ = array(J) // return values
    this.pxJ = array(J) // prior return values
    this.yJ = array(J) // proposed return values
    this.jJ = array(J) // sample indices
    this.jjJ = array(J) // shuffle indices
    // resample (shuffle) buffers
    this._jJ = array(J)
    this._xJ = array(J)
    this._xJK = array(J)
    this._log_wJ = array(J)
    this._log_wufJ = array(J)
    this._log_wuJ = array(J)
    // stats
    this.stats = {
      reweights: 0,
      resamples: 0,
      moves: 0,
      proposals: 0,
      accepts: 0,
      sample_time: 0,
      reweight_time: 0,
      resample_time: 0,
      move_time: 0,
      mks_time: 0,
      tks_time: 0,
      updates: [],
    }

    // define cached properties
    cache(this, 'pwJ', [])
    cache(this, 'pwj_sum', ['pwJ'], () => sum(this.pwJ))
    cache(this, 'pwj_ess', ['pwJ'], () => ess(this.pwJ, this.pwj_sum))
    cache(this, 'pwj_uniform', ['pwJ'], () => _uniform(this.pwJ, this.pwj_sum))

    cache(this, 'counts', [])
    cache(this, 'essu', ['counts'], () => ess(this.counts, J))

    cache(this, 'rwJ', [])
    cache(this, 'rwJ_agg', ['rwJ', 'counts'])
    cache(this, 'rwj_sum', ['rwJ'], () => sum(this.rwJ))
    cache(this, 'rwj_ess', ['rwJ_agg'], () => ess(this.rwJ_agg, this.rwj_sum))
    cache(this, 'rwj_uniform', ['rwJ'], () => _uniform(this.rwJ, this.rwj_sum))
    cache(this, 'wsum', [], () => sum(this.log_wJ, exp))
    cache(this, 'elw', ['rwJ'])
    cache(this, 'tks', ['rwJ'])
    cache(this, 'mks', [])

    // sample prior (along w/ u=0 posterior)
    let start = Date.now()
    this._sample_prior()
    const ms = Date.now() - start
    if (options.log) {
      print(`sampled ${J} prior runs (ess ${this.pwj_ess}) in ${ms}ms`)
      print(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=0`)
    }

    // update sample to posterior
    start = Date.now()
    this._update()
    if (options.log) {
      print(`applied ${this.u} updates in ${Date.now() - start}ms`)
      print(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=${this.u}`)
      print(str(omit(this.stats, 'updates')))
    }

    // plot stats
    if (options.plot) {
      const values = []
      const series = []
      const add_line = (prop, options = {}, f = x => x) => {
        values.push(this.stats.updates.map(su => f(su[prop])))
        options.label ??= prop
        options.axis ??= 'y'
        series.push(options)
      }
      // y is logarithmic ks p-value axis
      // y2 is linear percentage axis
      add_line('mks')
      add_line('tks')
      add_line('gap')
      add_line('ess', { axis: 'y2' }, x => (100 * x) / J)
      add_line('essu', { axis: 'y2' }, x => (100 * x) / J)
      add_line('essr', { axis: 'y2' })
      add_line('mar', { axis: 'y2' })
      const [wsum_a, wsum_b] = min_max_in(this.stats.updates.map(u => u.wsum))
      add_line('wsum', { axis: 'y2' }, x =>
        round((100 * (x - wsum_a)) / max(wsum_b - wsum_a, 1e-6), 1)
      )
      const [elw_a, elw_b] = min_max_in(this.stats.updates.map(u => u.elw))
      add_line('elw', { axis: 'y2' }, x =>
        round((100 * (x - elw_a)) / max(elw_b - elw_a, 1e-6), 2)
      )
      const [mlw_a, mlw_b] = min_max_in(this.stats.updates.map(u => u.mlw))
      add_line('mlw', { axis: 'y2' }, x =>
        round((100 * (x - mlw_a)) / max(mlw_b - mlw_a, 1e-6), 1)
      )
      const formatters = {
        elw: x => round((x / 100) * (elw_b - elw_a) + elw_a, 2),
        wsum: x => round((x / 100) * (wsum_b - wsum_a) + wsum_a, 1),
        mlw: x => round((x / 100) * (mlw_b - mlw_a) + mlw_a, 1),
        mks: x => (2 ** x < 1000 ? round(2 ** x, 2) : '>10^' + ~~log10(2 ** x)),
        ess: x => `${x}%`,
        __function_context: { wsum_a, wsum_b, elw_a, elw_b, mlw_a, mlw_b },
      }
      const y_ticks = range(8).map(e => round(log2(`1e${e}`), 2))
      const y_labels = ['1', '10', '10²', '10³', '10⁴', '10⁵', '10⁶', '10⁷']
      const mlw_0_on_y = ((0 - mlw_a) / (mlw_b - mlw_a)) * last(y_ticks)

      plot({
        name: 'stats',
        data: { values },
        renderer: 'lines',
        renderer_options: {
          series,
          data: {
            colors: { mlw: '#666', elw: '#666', wsum: '#666' },
          },
          axis: {
            y: {
              min: 0,
              max: last(y_ticks),
              tick: {
                values: y_ticks,
                format: y => y_labels[round(log10(2 ** y))] ?? '?',
                __function_context: { y_labels },
              },
            },
            y2: {
              show: true,
              min: 0,
              tick: {
                values: [0, 20, 40, 60, 80, 100],
                format: y => y + '%',
              },
            },
          },
          tooltip: {
            format: {
              title: x => 'step ' + x,
              value: (v, _, n) => formatters[n]?.(v) ?? v,
              __function_context: { formatters },
            },
          },
          grid: {
            y: {
              lines: [
                { value: 0, class: 'accept strong' },
                { value: round(log2(10), 2), class: 'accept' },
                { value: round(log2(100), 2), class: 'accept weak' },
                { value: round(mlw_0_on_y, 2), class: 'mlw' },
              ],
            },
          },
          // point: { show: false },
          padding: { right: 50, left: 35 },
          styles: [
            `#plot .c3-ygrid-line line { opacity: 1 !important }`,
            `#plot .c3-ygrid-line.mlw line { opacity: 1 !important; stroke-dasharray:5,3;}`,
            `#plot .c3-ygrid-line.accept line { opacity: .1 !important; stroke:#0f0; stroke-width:5px }`,
            `#plot .c3-ygrid-line.strong line { opacity: .25 !important }`,
            `#plot .c3-ygrid-line.weak line { opacity: .05 !important }`,
            `#plot .c3-target path { stroke-width:2px }`,
            `#plot .c3-target { opacity:1 !important }`,
            // dashed line, legend, and tooltip for mlw
            `#plot .c3-target-mlw path { stroke-dasharray:5,3; }`,
            `#plot .c3-legend-item-mlw line { stroke-dasharray:2,2; }`,
            `#plot .c3-tooltip-name--mlw span { background: repeating-linear-gradient(90deg, #666, #666 2px, transparent 2px, transparent 4px) !important }`,
          ],
        },
        dependencies: ['#_c3'],
      })

      // plot posteriors vs targets
      if (options.targets) {
        each(this.values, (value, k) => {
          if (!value.target) return // no target
          if (is_function(value.target)) return // cdf target not supported yet
          const name = value.name
          assert(is_array(value.target))
          const jR = array(value.target.length)
          this.sample_indices(jR)
          const xR = array(jR.length, r => this.xJK[jR[r]][k])
          hist([xR, value.target]).hbars({
            name: 'hist_' + name,
            series: [
              { label: 'posterior', color: '#d61' },
              { label: 'target', color: 'gray' },
            ],
            delta: true, // append delta series
          })
        })
      }
    }
  }

  _fill_log_wuj(log_wuJ, u = this.u) {
    const { log_wJ, log_wufJ } = this
    const w_exp = this.options.weight_exp(u)
    // note w_exp has no effect on infinities
    fill(log_wuJ, j => (log_wufJ[j] ? log_wufJ[j](u) : w_exp * log_wJ[j]))
    // compute gap allowing for infinities (w/o creating NaNs)
    const gap = (a, b) => (a == b ? 0 : abs(a - b))
    this.log_wuj_gap = max_of(this.log_wuJ, (lwuj, j) => gap(lwuj, log_wJ[j]))
    if (this.log_wuj_gap < 1e-6) this.log_wuj_gap = 0 // chop to 0 below 1e-6
    // clip infinities to enable subtraction in _reweight & _move
    clip_in(log_wuJ, -Number.MAX_VALUE, Number.MAX_VALUE)
  }

  _sample_prior() {
    const start = Date.now()
    const { func, xJ, pxJ, pxJK, xJK, jJ } = this
    const { log_pwJ, log_wJ, log_wufJ, log_wuJ, log_rwJ, stats } = this
    this.u = 0 // prior is zero'th update step
    fill(log_pwJ, 0)
    fill(log_wJ, 0)
    fill(log_wufJ, undefined)
    fill(xJ, j => ((this.j = j), func(this)))
    this._fill_log_wuj(log_wuJ)
    // init log_rwJ = log_pwJ + log_wuJ
    fill(log_rwJ, j => log_pwJ[j] + log_wuJ[j])
    fill(jJ, j => j) // init sample indices
    // copy prior samples for sample_prior()
    each(pxJK, (pxjK, j) => copy(pxjK, xJK[j]))
    copy(pxJ, xJ)
    stats.sample_time += Date.now() - start
  }

  // reweight for next step (u+1)
  // multiply rwJ by wJ@u+1/wJ@u (could be 1)
  // stop once wJ@u -> ~wJ; difference is called "gap" (max norm)
  _reweight() {
    if (this.log_wuj_gap == 0) return // no longer needed
    const start = Date.now()
    const { u, log_wJ } = this
    print(`reweighting ${u}->${u + 1}, gap ${this.log_wuj_gap}`)
    this._swap('log_wuJ') // store weights for last step (u) in _log_wuJ
    this._fill_log_wuj(this.log_wuJ, u + 1) // compute weights for u+1
    const { log_wuJ, _log_wuJ, log_rwJ, stats } = this
    apply(log_rwJ, (lw, j) => lw + log_wuJ[j] - _log_wuJ[j])
    this.rwJ = null // reset cached posterior ratio weights and dependents
    stats.reweights++
    stats.reweight_time += Date.now() - start
    this.stats.reweight_time += Date.now() - start
  }

  // swap arrays w/ temporary buffers prefixed w/ _
  _swap(...names) {
    each(names, n => (this[n] = swap(this[`_${n}`], (this[`_${n}`] = this[n]))))
  }

  // resample step
  // resample based on rwJ, reset rwJ=1
  _resample() {
    const start = Date.now()
    const { J, jjJ, rwj_uniform, rwJ, rwj_sum, log_rwJ, stats, _jJ, jJ } = this
    const { _xJ, xJ, _xJK, xJK, _log_wJ, log_wJ, _log_wufJ, log_wufJ } = this
    const { _log_wuJ, log_wuJ } = this
    if (rwj_uniform) random_discrete_uniform_array(jjJ, J)
    else random_discrete_array(jjJ, rwJ, rwj_sum) // note: sorted indices
    scan(jjJ, (j, jj) => {
      _jJ[j] = jJ[jj]
      _xJ[j] = xJ[jj]
      _xJK[j] = xJK[jj]
      _log_wJ[j] = log_wJ[jj]
      _log_wufJ[j] = log_wufJ[jj]
      _log_wuJ[j] = log_wuJ[jj]
    })
    this._swap('jJ', 'xJ', 'xJK', 'log_wJ', 'log_wufJ', 'log_wuJ')
    fill(log_rwJ, 0) // reset weights now "baked into" sample
    this.rwJ = null // reset cached posterior ratio weights and dependents
    this.counts = null // also reset counts/essu due to change in jJ
    this.wsum = null // since log_wJ changed
    stats.resamples++
    stats.resample_time += Date.now() - start
  }

  // move step
  // take metropolis-hastings steps along posterior chain
  _move() {
    const start = Date.now()
    const { J, u, func, yJ, yJK, xJ, xJK, jJ, jjJ, log_mwJ } = this
    const { log_cwJ, log_cwufJ, log_wJ, log_wufJ, log_wuJ, stats } = this
    fill(log_mwJ, 0) // reset move log-weights log(∝q(x|y)/q(y|x))
    fill(log_cwJ, 0) // reset posterior candidate log-weights
    fill(log_cwufJ, undefined) // reset posterior candidate future log-weights
    each(yJK, yjK => fill(yjK, undefined))
    this.moving = true // enable posterior chain sampling into yJK in _sample
    const tmp_log_wJ = log_wJ // to be restored below
    const tmp_log_wufJ = log_wufJ // to be restored below
    this.log_wJ = log_cwJ // redirect log_wJ -> log_cwJ temporarily
    this.log_wufJ = log_cwufJ // redirect log_wufJ -> log_cwufJ temporarily
    fill(yJ, j => ((this.j = j), func(this)))
    this.log_wJ = tmp_log_wJ // restore log_wJ
    this.log_wufJ = tmp_log_wufJ // restore log_wufJ
    this.moving = false // back to using xJK

    // accept/reject proposed moves
    this.move_proposals = 0
    this.move_accepts = 0
    this.move_log_w = 0
    const w_exp = this.options.weight_exp(u)
    repeat(J, j => {
      let log_cwuj = log_cwufJ[j] ? log_cwufJ[j](u) : w_exp * log_cwJ[j]
      log_cwuj = clip(log_cwuj, -Number.MAX_VALUE, Number.MAX_VALUE)
      const log_dwj = log_cwuj - log_wuJ[j]
      if (random() < exp(log_mwJ[j] + log_dwj)) {
        // update move buffer
        this.m++
        this.mb++
        if (this.mb == this.options.mks_period) {
          this.mb = 0 // now 0 moves since last buffered
          const b = this.b++ % this.B
          this.xBK[b] = xJK[j]
          this.yBK[b] = yJK[j]
          this.mks = null // reset mks since new move buffered
        }
        // update state to reflect move
        xJ[j] = yJ[j]
        xJK[j] = yJK[j] // can't copy since rows can share arrays
        yJK[j] = array(this.K) // replace array since moved into xJK
        log_wJ[j] = log_cwJ[j]
        log_wufJ[j] = log_cwufJ[j]
        log_wuJ[j] = log_cwuj
        // log_dwj is already reflected in sample so log_rwJ is invariant
        // was confirmed (but not quite understood) in earlier implementations
        // log_rwJ[j] += log_dwj
        jJ[j] = J + j // new index remapped below
        this.move_log_w += log_dwj
        this.move_accepts++
      }
    })
    this.move_proposals += J

    // reassign indices and reset state if any moves were accepted
    if (this.move_accepts > 0) {
      fill(jjJ, -1)
      let jj = 0 // new indices
      apply(jJ, j => (j >= J ? jj++ : jjJ[j] >= 0 ? jjJ[j] : (jjJ[j] = jj++)))
      this.rwJ = null // reset cached posterior ratio weights and dependents
      this.counts = null // also reset counts/essu due to change in jJ
      this.wsum = null // since log_wJ changed
    }

    stats.moves++
    stats.proposals += J
    stats.accepts += this.move_accepts
    stats.move_time += Date.now() - start
  }

  _update() {
    const {
      time,
      updates,
      max_time,
      min_time,
      max_updates,
      min_updates,
      max_mks,
      min_ess,
      weight_exp,
      resample_if,
      move_while,
    } = this.options

    assert(this.u == 0, '_update requires u=0')

    // push stats for u=0
    const { stats } = this
    stats.updates.push({
      ess: round(this.ess),
      essu: round(this.essu),
      essr: round(100 * clip(this.ess / this.essu)),
      elw: round(this.elw, 2), // expected log weight for u=0
      wsum: round(this.wsum, 1), // total weight for u=0
      mar: 100, // start at 100% acceptance rate
      mlw: 0, // start at 0 log_w improvement
      mks: inf, // no data yet
      tks: round(this.tks, 1),
      gap: round(this.log_wuj_gap, 1),
      p: 0, // no proposals yet
      a: 0, // no accepts yet
      m: 0, // no moves yet
      t: this.t, // time so far
    })

    // skip updates if target updates=0 or time=0
    if (updates == 0 || time == 0) return

    do {
      const gap = this.log_wuj_gap // save gap before reweight for stat
      this._reweight() // reweight for step u+1

      // append stats for last update step u (except u=0)
      if (this.u > 0) {
        stats.updates.push({
          ess: round(this.ess),
          essu: round(this.essu),
          essr: round(100 * clip(this.ess / this.essu)),
          elw: round(this.elw, 2),
          wsum: round(this.wsum, 1),
          mar: round(100 * (this.a / this.p)),
          mlw: round(this.mlw, 1),
          mks: round(this.mks, 1),
          tks: round(this.tks, 1),
          gap: round(gap, 1),
          p: this.p,
          a: this.a,
          m: this.m - last(stats.updates).m,
          t: this.t - last(stats.updates).t, // time so far
        })

        // continue based on min_time/updates
        // minimums supercede maximum and target settings
        if (this.t >= min_time && this.u >= min_updates) {
          // check target updates
          if (this.u >= updates) {
            const { t, u } = this
            if (this.options.log)
              print(`reached target updates u=${u}≥${updates} (t=${t}ms)`)
            break
          }

          // check target time
          if (this.t >= time) {
            const { t, u } = this
            if (this.options.log)
              print(`reached target time t=${t}≥${time}ms (u=${u})`)
            break
          }

          // check target ess/mks/mlw if min_time/updates satisfied
          if (this.ess >= min_ess && this.mks <= max_mks && this.mlw <= 0) {
            const { t, u, ess, mks, mlw } = this
            if (this.options.log)
              print(
                `reached target ess=${round(ess)}≥${min_ess}, ` +
                  `mks=${round(mks, 3)}≤${max_mks}, mlw=${round(mlw, 3)}≤0 ` +
                  `@ u=${u}, t=${t}ms`
              )
            break
          }

          // check max_time/updates for potential early termination
          if (this.t > max_time || this.u > max_updates) {
            const { t, u, log_wuj_gap } = this
            if (this.options.warn) {
              // warn about running out of time or updates
              if (t > max_time)
                warn(`ran out of time t=${t}>${max_time}ms (u=${u})`)
              else warn(`ran out of updates u=${u}>${max_updates} (t=${t}ms)`)
              // warn about pre-posterior sample w/ log_wuj_gap>0
              if (log_wuj_gap > 0)
                warn(`pre-posterior sample w/ log_wuj_gap=${log_wuj_gap}>0`)
            }
            break
          }
        }
      }

      this.u++ // advance to next step

      // resample
      if (resample_if(this)) this._resample()

      // move
      // must be done after reweights (w/ same u) for accurate mlw
      this.p = 0 // proposed move count
      this.a = 0 // accepted move count
      this.mlw = 0 // log_w improvement
      const { proposals, accepts } = stats
      while (move_while(this)) {
        this._move()
        this.p += this.move_proposals
        this.a += this.move_accepts
        this.mlw += this.move_log_w
      }
    } while (true)
  }

  get t() {
    return Date.now() - this.start_time
  }

  __pwJ() {
    const { J, log_pwJ } = this
    const max_log_pwj = max_in(log_pwJ)
    const pwJ = (this.___pwJ ??= array(J))
    return copy(pwJ, log_pwJ, log_pwj => exp(log_pwj - max_log_pwj))
  }

  __rwJ() {
    const { J, log_rwJ } = this
    const max_log_rwj = max_in(log_rwJ)
    const rwJ = (this.___rwJ ??= array(J))
    return copy(rwJ, log_rwJ, log_rwj => exp(log_rwj - max_log_rwj))
  }

  __rwJ_agg() {
    const { J, jJ, rwJ } = this
    // aggregate over duplicate indices jJ using _rwJ_agg as buffer
    // instead of adding weights, we check consistency and multiply by counts
    const rwJ_agg = (this.___rwJ_agg ??= array(J))
    fill(rwJ_agg, 0)
    each(jJ, (jj, j) => {
      if (rwJ_agg[jj] && rwJ_agg[jj] != rwJ[j])
        throw new Error(
          'inconsistent (random?) condition/weight for identical samples; ' +
            'please ensure sample(…) is used for all random values'
        )
      else rwJ_agg[jj] = rwJ[j]
    })
    return mul(rwJ_agg, this.counts)
  }

  __counts() {
    const { J, jJ } = this
    const counts = (this.___counts ??= array(J))
    fill(counts, 0)
    each(jJ, jj => counts[jj]++)
    return counts
  }

  get ess() {
    return this.rwj_ess
  }

  __elw() {
    const { rwJ, rwj_sum, log_wJ } = this
    const z = 1 / rwj_sum
    const elw = sum(log_wJ, (log_wj, j) => {
      // NOTE: when conditioning w/ log_wj either 0 or -inf, elw==0 always
      if (rwJ[j] == 0) return 0 // take 0 * -inf == 0 instead of NaN
      return log_wj * rwJ[j] * z
    })
    return elw
  }

  __tks() {
    const start = Date.now()
    const { J, K, xJK, values, stats } = this
    const pK = (this.___mks_pK ??= array(K)) // array of ks-test p-values
    // compute ks1_test or ks2_test for each (numeric) value w/ target
    fill(pK, k => {
      const value = values[k]
      if (!value.target) return 1 // no target
      const xR = (this.___tks_xR ??= array(J))
      let r = 0
      repeat(J, j => {
        const x = xJK[j][k]
        if (x !== undefined) xR[r++] = x
      })
      if (r == 0) return 1 // not enough samples
      xR.length = r
      if (is_function(value.target)) {
        // use ks1_test for cdf target
        return ks1_test(xR, value.target, {
          wJ: this.rwJ,
          wj_sum: this.rwj_sum,
        })
      }
      // use ks2_test for sample target
      return ks2_test(xR, value.target, {
        wJ: this.rwj_uniform ? undefined : this.rwJ,
        wj_sum: this.rwj_uniform ? undefined : this.rwj_sum,
        wK: value.target_weights,
        wk_sum: value.target_weight_sum,
      })
    })
    stats.tks_time += Date.now() - start
    // minimum p-value ~ Beta(1,K) so we transform as beta_cdf(p,1,K)
    return -log2(beta_cdf(min_in(pK), 1, K))
  }

  __mks() {
    const start = Date.now()
    const { b, B, K, stats } = this
    if (b < B) return inf // not enough data yet
    // rotate buffer so b=0 and we can split in half at B/2
    const xBK = (this.___mks_xBK ??= array(B))
    const yBK = (this.___mks_yBK ??= array(B))
    const bb = b % B
    copy_at(xBK, this.xBK, 0, bb)
    copy_at(xBK, this.xBK, B - bb, 0, bb)
    copy_at(yBK, this.yBK, 0, bb)
    copy_at(yBK, this.yBK, B - bb, 0, bb)
    // initialize single-value buffers for ks2_test
    const R = B / 2
    assert(is_integer(R)) // B should be divisible by 2
    const xR = (this.___mks_xR ??= array(R))
    const yR = (this.___mks_yR ??= array(R))
    const pK = (this.___mks_pK ??= array(K)) // array of ks-test p-values
    // compute ks2_test for each numeric value
    // for now we simply test type of first sampled value
    fill(pK, k => {
      const value = this.values[k]
      if (!value.sampler) return 1 // value not sampled
      let rx = 0
      let ry = 0
      for (let b = 0; b < R; ++b) {
        const xbk = xBK[b][k]
        if (xbk !== undefined) {
          if (rx == 0 && typeof xbk != 'number') return 1 // not a number
          xR[rx++] = xbk
        }
        const ybk = yBK[R + b][k]
        if (ybk !== undefined) {
          if (ry == 0 && typeof ybk != 'number') return 1 // not a number
          yR[ry++] = ybk
        }
      }
      if (rx == 0 || ry == 0) return 1 // not enough samples
      xR.length = rx
      yR.length = ry
      return ks2_test(xR, yR)
    })
    stats.mks_time += Date.now() - start
    // minimum p-value ~ Beta(1,K) so we transform as beta_cdf(p,1,K)
    return -log2(beta_cdf(min_in(pK), 1, K))
  }

  sample_index(options) {
    if (options?.prior) {
      const { J, pwj_uniform, pwJ, pwj_sum } = this
      const j = pwj_uniform
        ? random_discrete_uniform(J)
        : random_discrete(pwJ, pwj_sum)
      return j
    }
    const { J, rwj_uniform, rwJ, rwj_sum } = this
    const j = rwj_uniform
      ? random_discrete_uniform(J)
      : random_discrete(rwJ, rwj_sum)
    return j
  }

  sample_indices(jR, options) {
    if (options?.prior) {
      const { J, pwj_uniform, pwJ, pwj_sum } = this
      const j = pwj_uniform
        ? random_discrete_uniform_array(jR, J)
        : random_discrete_array(jR, pwJ, pwj_sum)
      return j
    }
    const { J, rwj_uniform, rwJ, rwj_sum } = this
    const j = rwj_uniform
      ? random_discrete_uniform_array(jR, J)
      : random_discrete_array(jR, rwJ, rwj_sum)
    return j
  }

  sample_values(options) {
    const j = this.sample_index(options)
    const xJK = options?.prior ? this.pxJK : this.xJK
    switch (options?.format) {
      case 'array':
        return xJK[j]
      case 'object':
      default:
        return _.set(_.zipObject(this.names, xJK[j]), '_index', j)
    }
  }

  sample(options) {
    const j = this.sample_index(options)
    const [xJK, xJ] = options?.prior
      ? [this.pxJK, this.pxJ]
      : [this.xJK, this.xJ]
    if (options?.values) {
      switch (options?.format) {
        case 'array':
          return [...xJK[j], xJ[j]]
        case 'object':
        default:
          return _.assign(this.sample_values(options), {
            _output: xJ[j],
            _index: j,
          })
        // default:
        //   return [xJ[j], this.sample_values(options)]
      }
    } else if (options?.index) {
      return {
        _output: xJ[j],
        _index: j,
      }
    }
    return xJ[j]
  }

  _sample(k, domain, options) {
    const value = this.values[k]
    assert(domain, 'missing domain')
    const { j, xJK, log_pwJ, yJK, log_mwJ } = this

    // if sampler not yet set, indicate initialization
    if (!value.sampler) {
      value.sampler = this
      const { index, name, args } = value
      const line = `line ${value.line_index}: ${value.line.trim()}`
      const target = options?.target ?? this.options.targets?.[name]
      if (target) {
        const start = Date.now()
        value.target = target
        // sample from sampler domain (_prior)
        if (value.target?._prior) {
          const T = options?.size ?? this.J
          const xT = array(T)
          let log_wT // weight array allocated below if needed
          const prior = value.target._prior
          repeat(T, t =>
            prior((x, log_pw = 0) => {
              xT[t] = x
              if (!log_pw) return
              log_wT ??= array(T, 0)
              log_wT[t] += log_pw
            })
          )
          value.target = xT
          if (log_wT) {
            value.target_weights = apply(log_wT, exp)
            value.target_weight_sum = sum(value.target_weights)
          }
          const ms = Date.now() - start
          if (this.options.log) print(`sampled ${T} target values in ${ms}ms`)
        } else {
          if (!is_function(value.target) && !is_array(value.target))
            fatal(`invalid target @ ${line}`)
          assert(!defined(options?.size), `unexpected size option @ ${line}`)
        }
      } else {
        assert(!defined(options?.size), `unexpected size option @ ${line}`)
      }
      if (this.options.log) {
        let target = ''
        if (is_array(value.target))
          target =
            ` --> target sample size=${value.target.length}, ` +
            `mean=${round(mean(value.target), 3)}`
        else if (is_function(value.target))
          target = ` --> target cdf ${str(value.target)}`
        print(`[${index}] ${name ? name + ' = ' : ''}sample(${args})${target}`)
      }
    }

    // if moving and sampled from prior, sample from posterior chain into yJK
    // note any given value may not get triggered in any particular pass
    if (this.moving && xJK[j][k] !== undefined) {
      if (yJK[j][k] === undefined) {
        const posterior = options?.posterior ?? domain._posterior
        assert(posterior, 'missing posterior (chain) sampler')
        posterior((y, log_mw = 0) => {
          yJK[j][k] = y
          log_mwJ[j] += log_mw
        }, xJK[j][k])
      }
      return yJK[j][k]
    }

    // sample from prior into xJK
    if (xJK[j][k] === undefined) {
      const prior = options?.prior ?? domain._prior
      assert(prior, 'missing prior sampler')
      prior((x, log_pw = 0) => {
        xJK[j][k] = x
        log_pwJ[j] += log_pw
      })
    }
    return xJK[j][k]
  }

  _condition(c, log_wu) {
    this._weight(c ? 0 : -inf, log_wu)
  }

  _weight(log_w, log_wu) {
    this.log_wJ[this.j] += log_w
    if (log_wu) {
      const prev_log_wu = this.log_wufJ[this.j]
      if (prev_log_wu) this.log_wufJ[this.j] = u => log_wu(u) + prev_log_wu(u)
      else this.log_wufJ[this.j] = log_wu
    }
  }
}

// uniform([a],[b])
// uniform _sampler domain_
// range domain w/ uniform `_prior` & `_posterior` samplers
// range is `[0,1)`,`[0,a)`, or `[a,b)` depending on arguments
// see `random_uniform` in #//stat for details
function uniform(a, b) {
  if (a === undefined) return uniform(0, 1)
  if (b === undefined) return uniform(0, a)
  assert(is_number(a) && is_number(b) && a < b, 'invalid args')
  const sampler = f => f(a + random() * (b - a))
  return { gte: a, lt: b, _prior: sampler, _posterior: sampler }
}

function _benchmark_uniform() {
  benchmark(
    () => uniform(),
    () => uniform(1),
    () => uniform(0, 1)
  )
}
