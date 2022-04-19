// is `x` from `domain`?
// | **domain**       | **description**
// | sampler function | `x` via function `≡{via:func}`
// | type string      | `x` is of type `≡{is:type}`
// | number           | `x` `===` number `≡{eqq:number}`
// | primitive array  | `x` in array of possible values, `≡{in:array}`
// | object array     | `x` is array matching per-element constraints
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
// | `not:domain`     | inverted domain
// `false` if `domain` is `undefined` (or omitted)
function from(x, domain) {
  if (x === undefined) return false
  if (is_nullish(domain)) return false // empty or undefined
  if (is_function(domain)) return from(x, { via: domain })
  if (is_string(domain)) return is(x, domain) // ≡{is:type}
  if (is_number(domain)) return x === domain // ≡{eqq:number}
  if (is_array(domain)) {
    if (is_primitive(domain[0])) return domain.includes(x) // ≡{in:array}
    if (is_object(domain[0])) {
      if (x.length != domain.length) return false
      return x.every((xj, j) => from(xj, domain[j]))
    }
  }
  if (!is_object(domain)) fatal(`unknown domain ${domain}`)
  return keys(domain).every(key => {
    switch (key) {
      case 'via':
        if (!is_function(domain.via))
          fatal(`invalid 'via' domain ${domain.via}`)
        // function may optionally declare return domain as _domain
        // otherwise function is allowed to return anything
        if (domain.via._domain) return from(x, domain.via._domain)
        return true // function can return anything
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
      case 'gt':
        return x > domain.gt
      case 'gte':
        return x >= domain.gte
      case 'lte':
        return x <= domain.lte
      case 'lt':
        return x < domain.lt
      case 'and':
        return domain.and.every(dom => from(x, dom))
      case 'or':
        return domain.or.some(dom => from(x, dom))
      case 'not':
        return !from(x, domain.not)
      default:
        if (!(key[0] == '_')) fatal(`invalid domain property '${key}'`)
        return true // ignore underscore-prefixed property
    }
  }) // = true if empty(domain)
}

// inverts `domain`
// transforms domain if possible, e.g. `{lt: x}` → `{gte: x}`
// `≡ {not:domain}` if no such transformation is available
// maintains `undefined` (or omitted) domain
function invert(domain) {
  if (domain === undefined) return domain // maintain undefined
  if (domain === null) return {} // empty -> everything
  if (is_function(domain)) return invert({ via: domain })
  if (is_string(domain)) return invert({ is: domain })
  if (is_array(domain)) {
    if (is_primitive(domain[0])) return invert({ in: domain })
    if (is_object(domain[0])) return domain.map(invert)
  }
  if (is_number(domain)) return invert({ eqq: domain })
  if (!is_object(domain)) fatal(`unknown domain ${domain}`)
  if (empty(domain)) return null // everything -> empty
  let domains = keys(domain).map(key => {
    switch (key) {
      case 'via':
        if (!is_function(domain.via))
          fatal(`invalid 'via' domain ${domain.via}`)
        if (domain.via._domain) return invert(domain.via._domain)
        return null // function can return anything -> nothing
      case 'is':
      case 'in':
      case 'in_eq':
      case 'in_eqq':
      case 'in_equal':
      case 'eq':
      case 'eqq':
      case 'equal':
        return { not: { [key]: domain[key] } }
      case 'gt':
        return { lte: domain.gt }
      case 'gte':
        return { lt: domain.gte }
      case 'lte':
        return { gt: domain.lte }
      case 'lt':
        return { gte: domain.lt }
      case 'and':
        return { or: domain.and.map(invert) }
      case 'or':
        // simplify and:... if all domains have distinct keys
        // note we do not do partial merges so it is all or nothing
        const domains = domain.or.map(invert)
        const all_keys = flatten(domains.map(keys))
        if (all_keys.length == uniq(all_keys).length) return merge(...domains)
        return { and: domains }
      case 'not':
        return domain.not // not:domain -> domain
      default:
        // inversion REMOVES underscore-prefixed properties
        // e.g. _prior, _posterior, _log_p, _log_wr, ...
        if (!(key[0] == '_')) fatal(`invalid domain property '${key}'`)
        return undefined // drop underscore-prefixed property
    }
  })
  domains = domains.filter(defined)
  if (domains.length == 1) return domains[0]
  return { or: domains }
}

const _distance = (x, y) => {
  if (!is_finite(x) || !is_finite(y)) return undefined
  return abs(x - y)
}
const _distance_to_array = (x, yJ) => {
  if (yJ.length == 0) return undefined
  if (!is_finite(x) || !yJ.every(is_finite)) return undefined
  return min_of(yJ, y => abs(x - y))
}

// distance of `x` from `domain`
// `=0` if `x` is from `domain`, `>0` otherwise
// `domain._distance` function is used if defined
// can be `undefined` for given `domain` or `x`
function distance(x, domain) {
  if (x === undefined) return undefined
  if (is_nullish(domain)) return undefined // empty or undefined
  if (is_function(domain)) return distance(x, { via: domain })
  if (is_string(domain)) return undefined
  if (is_number(domain)) return _distance(x, domain)
  if (is_array(domain)) {
    if (is_primitive(domain[0])) return _distance_to_array(x, domain)
    if (is_object(domain[0])) {
      if (!(x.length == domain.length))
        fatal('array length mismatch for distance')
      // for array domain, take sum of per-element distances
      // sum (unlike min/max) is sensitive to per-element distances
      // sum (unlike mean) is also sensitive to array length (dimensions)
      const d = sum_of(x, (xj, j) => distance(xj, domain[j]) ?? inf)
      return is_inf(d) ? undefined : d
    }
  }
  if (!is_object(domain)) fatal(`unknown domain ${domain}`)
  if (domain._distance) return domain._distance(x)
  const d = max_of(keys(domain), key => {
    switch (key) {
      case 'via':
        if (!is_function(domain.via))
          fatal(`invalid 'via' domain ${domain.via}`)
        if (domain.via._domain) return distance(x, domain.via._domain)
        return inf
      case 'is':
        return inf
      case 'in':
      case 'in_eq':
      case 'in_eqq':
      case 'in_equal':
        return _distance_to_array(x, domain[key]) ?? inf
      case 'eq':
      case 'eqq':
      case 'equal':
        return _distance(x, domain[key]) ?? inf
      case 'gt':
        return max(0, domain.gt - x)
      case 'gte':
        return max(0, domain.gte - x)
      case 'lte':
        return max(0, x - domain.lte)
      case 'lt':
        return max(0, x - domain.lt)
      case 'and':
        return max_of(domain.and, dom => distance(x, dom) ?? inf)
      case 'or':
        // convert undefined -> -inf for min_of then return inf for max_of
        return abs(min_of(domain.or, dom => distance(x, dom) ?? -inf))
      case 'not':
        const inverted = invert(domain.not) // attempt transform
        if (inverted.not) return inf // unable to transform (w/o not)
        return distance(x, inverted) ?? inf // distance to transformed domain
      default:
        if (!(key[0] == '_')) fatal(`invalid domain property '${key}'`)
    }
  })
  return is_inf(d) ? undefined : d
}

// density of `x` in `domain`
// _log-probability density_ `log_p` of sampling `x` from `domain`
// uses `domain._log_p` defined alongside `_prior` for _sampler domains_
// sampler domains are those that can be sampled as `sample(domain)`
// always `-inf` outside `domain`, regardless of `domain._log_p`
// can be `undefined` inside domain if `domain._log_p` missing
function density(x, domain) {
  if (!from(x, domain)) return -inf
  if (domain._log_p) return domain._log_p(x)
}

// sample _unknown_ from `domain`
// random variable is denoted `X ∈ dom(X)`
// _prior model_ `P(X)` is defined or implied by `domain`
// can be _conditioned_ as `P(X|c)` using `condition(c)`
// can be _weighted_ as `∝ P(X) × W(X)` using `weight(…)`
// sampler function `domain` is passed new _sampler `context`_
// non-function `domain` requires outer `sample(context=>{ … })`
// _sampler domains_ specify default `domain._prior|_log_p|_posterior`
// conditions/weights are scoped by outer `sample(context=>{ … })`
// samples are tied to _lexical context_, e.g. are constant in loops
// `options` for all domains:
// | `name`        | name of sampled value
// |               | default inferred from lexical context
// |               | e.g. `let x = sample(…) ≡ sample(…,{name:'x'})`
// | `prior`       | prior sampler `f => f(x,[log_pw=0])`
// |               | `x~S(X), log_pw=log(∝p(x)/s(x))`
// |               | _default_: `domain._prior`
// | `log_p`       | prior density function `x => …`
// |               | _default_: `domain._log_p`
// | `posterior`   | posterior (chain) sampler `(f,x,…) => f(y,[log_mw=0])`
// |               | `y~Q(Y|x), log_mw=log(∝q(x|y)/q(y|x))`
// |               | _default_: `domain._posterior`
// | `target`      | target cdf, sample, or sampler domain for `tks` metric
// |               | `tks` is _target KS_ `-log2(ks1|2_test(sample, target))`
// |               | for sampler domain, sample `size` can be specified
// |               | default `size` is inherited from context (see below)
// |               | also see `targets` and `max_tks` options below
// |               | _default_: no target (`tks=0`)
// `options` for sampler function (_context_) domains `context=>{ … }`:
// | `size`        | sample size `J`, _default_: `1000`
// |               | ≡ _independent_ runs of `context=>{ … }`
// |               | ≡ posterior update chains (dependent runs)
// | `reweight_if` | reweight predicate `context => …`
// |               | called once per update step `context.u = 0,1,2,…`
// |               | reduces `ess` to `≥reweight_ess` (see below)
// |               | predicate ignored when optimizing or accumulating
// |               | _default_: `({ess,J}) => ess >= .9 * J`
// |               | default helps reduce reweight failures/retries
// | `reweight_ess`| minimum `ess` after reweight, _default_: `10`
// |               | smaller minimum allows more extreme weights
// | `min_reweights`| minimum number of reweight steps, _default_: `3`
// |                | does not apply when optimizing or accumulating
// | `max_reweight_tries`| maximum reweight attempts per step, _default_: `100`
// |               | default is `1` when optimizing or accumulating
// | `resample_if` | resample predicate `context => …`
// |               | called once per update step `context.u = 0,1,…`
// |               | _default_: `({ess,essu,J}) => ess/essu < clip(essu/J,.5,1)`
// |               | default allows `ess→essu→J` w/ effective moves for `essu→J`
// | `move_while`  | move predicate `context => …`
// |               | called _until false_ every update step `context.u = 0,1,…`
// |               | `context.p` is proposed moves (current update step)
// |               | `context.a` is accepted moves (current update step)
// |               | `context.aK` is accepts per posterior "pivot"
// |               | `context.uaK` is accepts per prior "jump" value
// |               | _default_: `({essu,J,a,awK,uawK}) =>`
// |               | `(essu<.9*J || a<J || max_in(awK)>0 || max_in(uawK)>0)`
// |               | see `move_weights` below for `awK` and `uawK`
// |               | default allows `essu→J` w/ up to `J/10` slow-movers
// | `move_weights`| move weight function `(context, awK, uawK) => …`
// |               | _default_ uses deficiencies in `move_targets` below
// | `move_targets`| move target function `(context, atK, uatK) => …`
// |               | _default_ splits accepts uniformly over sampled values
// | `max_updates` | maximum number of update steps, _default_: `1000`
// | `min_updates` | minimum number of update steps, _default_: `0`
// | `min_stable_updates` | minimum stable update steps, _default_: `1`
// | `min_posterior_updates` | minimum posterior update steps, _default_: `3`
// |               | posterior updates are fully-weighted (`r==1`) updates
// | `max_time`    | maximum time (ms) for sampling, _default_: `1000` ms
// | `min_time`    | minimum time (ms) for sampling, _default_: `0` ms
// | `min_ess`     | minimum `ess` desired (within `max_time`), _default_: `.9*J`
// |               | default is `1` when optimizing or accumulating
// | `max_mks`     | maximum `mks` desired (within `max_time`)
// |               | `mks` is _move KS_ `-log2(ks2_test(from, to))`
// |               | _default_: `1` ≡ failure to reject same-dist at `α<1/2`
// | `mks_tail`    | ratio (<1) of recent updates for `mks`, _default_: `1/2`
// |               | integer values `≥1` are interpreted as _mks periods_
// |               | default is `1` when optimizing or accumulating
// | `mks_period`  | minimum update steps for `mks`, _default_: `1`
// | `updates`     | target number of update steps, _default_: auto
// |               | _warning_: can cause pre-posterior sampling w/o warning
// |               | changes default `max_updates` to `inf`
// | `time`        | target time (ms) for sampling, _default_: auto
// |               | _warning_: can cause pre-posterior sampling w/o warning
// |               | changes default `max_time` to `inf`
// | `async`       | run updates/moves in async _quanta_, _default_: `false`
// |               | allows dom updates & main-thread tasks between quanta
// | `quantum`     | maximum time (ms) per async update/move, _default_: `100`
// |               | shorter quanta = more responsive of dom & main-thread
// |               | longer quanta = less dispatch delay (`await` time)
// |               | does not apply in sync mode (`async:false`)
// | `opt_time`    | optimization time, should be `<max_time`
// |               | _default_: `(time || max_time) / 2`
// | `opt_penalty` | optimization penalty, should be `<0`, _default_: `-5`
// |               | used as default `log_w` for sub-optimal samples
// |               | must be finite to allow non-opt. weights/conditions
// |               | must be small for ess to be close to expected for quantile
// | `targets`     | object of targets for named values sampled in this context
// |               | see `target` option above for possible targets
// |               | can be `true` for auto-generated targets
// | `max_tks`     | maximum `tks` desired once updates are complete
// |               | `tks` is _target KS_ `-log2(ks1|2_test(sample, target))`
// |               | ignored if no targets specified via `target(s)` option
// |               | used only as diagnostic test, not as stopping condition
// |               | _default_: `5` ≡ failure to reject same-dist at `α<1/32`
// | `params`      | object of parameters to be captured from parent context
function sample(domain, options = undefined) {
  // decline non-function domain which requires a parent sampler that would have replaced calls to sample(…)
  if (!is_function(domain))
    fatal(`invalid sample(…) call outside of sample(context=>{ … })`)
  // decline target for root sampler since that is no parent to track tks
  if (options?.target) fatal(`invalid target outside of sample(context=>{ … })`)
  const sampler = new _Sampler(domain, options)
  const sample = sampler.sample(options)
  // if (options?.store) _this.global_store._sample = sample
  return sample
}

// sample `J` _unknowns_ into `xJ` from `domain`
// `domain` can be a function `(j,J,s)=>…`, `s` partial sum up to `j-1`
function sample_array(J, xJ, domain, options = undefined) {
  fatal(`unexpected (unparsed) call to sample_array(…)`)
}

// confine `x` to `domain`
// uses `distance(x, domain)` for guidance outside `domain`
// uses `density(x, domain) ?? 0` as weights inside `domain`
// distances help w/ rare domains, densities w/ unbounded domains
// densities refine condition `x∈domain|x～prior` as `x～sample(domain)|x～prior`
function confine(x, domain) {
  fatal(`unexpected (unparsed) call to confine(…)`)
}

// confine `J` values in `xJ` to `domain`
// `domain` can be a function `(j,J)=>…`
function confine_array(J, xJ, domain) {
  fatal(`unexpected (unparsed) call to confine_array(…)`)
}

// condition samples on `cond`
// `≡ weight(c ? 0 : -inf)`, see below
// scoped by outer `sample(context=>{ … })`
// conditions models `P(X) → P(X|c)` for all `X` in context
// corresponds to _indicator weights_ `𝟙(c|X) = (c ? 1 : 0)`
// requires `O(1/P(c))` samples; ___can fail for rare conditions___
// rare conditions require _relaxation function_ `log_wr(r), r∈(0,1]`
// default `log_wr = r=>log(c||1-r)` uses `1-r` as penalty for `!c`
// domain conditions, e.g. `from(x,domain)`, define own default
// `cond._log_wr` (if defined) supersedes default `log_wr`
// `cond` is unwrapped via `cond.valueOf` if defined
function condition(cond, log_wr = undefined) {
  fatal(`unexpected (unparsed) call to condition(…)`)
}

// weight samples by `log_w`
// scoped by outer `sample(context=>{ … })`
// normalized weights can be denoted as prob. dist. `W(X)`
// augments models `P(X) -> ∝ P(X) × W(X)` for all `X` in context
// _likelihood weights_ `∝ P(c|X)` _fork-condition_ models `P(X) → P(X|c')`
// effective sample size (ess) becomes `1/E[W²]`; ___can fail for extreme weights___
// extreme weights require _relaxation function_ `log_wr(r), r∈(0,1]`
// default `log_wr = r=>r*log_w` treats `r` as _weight exponent_
// `log_w._log_wr` (if defined) supersedes default `log_wr`
// `log_w` is unwrapped using `log_w.valueOf` if defined
// see #/weight for technical details
function weight(log_w, log_wr = undefined) {
  fatal(`unexpected (unparsed) call to weight(…)`)
}

// maximize `x` at quantile `q`
// concentrates weight on `~(1-q)*J` samples w/ _greatest_ `x`
// converges _around_ `~(1-q)*J` samples w/ _maximal_ `q`-quantile `x:P(X≤x)=q`
// spread is based on _sampling noise_, depends on samplers, `move_targets`, etc
// expected ess is `~(1-q)*J`, inexact due to sampling noise & duplication (`essu<J`)
// spread and expected ess also increase w/ `opt_penalty` (see `sample` above)
// ess can be increased using `min_ess`, at cost of larger spread (larger for smaller `q`)
// ess can also be increased at computational cost by increasing sample size `J`
function maximize(x, q = 0.5, log_wr = undefined) {
  fatal(`unexpected (unparsed) call to maximize(…)`)
}

// minimize `x` at quantile `q`
// concentrates weight on `~q*J` samples w/ _smallest_ `x`
// converges _around_ `~q*J` samples w/ _minimal_ `q`-quantile `x:P(X≤x)=q`
// see `maximize` above for additional comments
function minimize(x, q = 0.5, log_wr = undefined) {
  fatal(`unexpected (unparsed) call to minimize(…)`)
}

// accumulate(...)
// accumulate weights across runs
// applies to calls within arguments only
// returns argument(s), as array if multiple
function accumulate() {
  fatal(`unexpected (unparsed) call to accumulate(…)`)
}

// predict value `x`
function predict(x) {}

// is `wJ` uniform?
function _uniform(wJ, wj_sum = sum(wJ), ε = 1e-6) {
  const w_mean = wj_sum / wJ.length
  const [w_min, w_max] = [(1 - ε) * w_mean, (1 + ε) * w_mean]
  return wJ.every(w => w >= w_min && w <= w_max)
}

function _remove_undefined(xJ, wJ) {
  let jj = -1
  for (let j = 0; j < xJ.length; ++j) {
    if (xJ[j] === undefined) continue
    if (++jj == j) continue // no undefined yet
    xJ[jj] = xJ[j]
    wJ[jj] = wJ[j]
  }
  xJ.length = wJ.length = ++jj
}

function _rank_aggregated(xJ, wJ) {
  let wX = new Map()
  if (wJ) each(xJ, (x, j) => wX.set(x, (wX.get(x) ?? 0) + wJ[j]))
  const [xR, wR] = transpose(rank_by(array(wX.entries()), last))
  copy(xJ, xR)
  copy(wJ, wR)
  return wX
}

function _max_index_by(J, f) {
  let max_j = 0
  let max_fj = f(0)
  for (let j = 1; j < J; j++) {
    const fj = f(j)
    if (fj <= max_fj) continue
    max_fj = fj
    max_j = j
  }
  return max_j
}

class _Timer {
  constructor() {
    this.start = Date.now()
  }
  toString() {
    return this.t + 'ms'
  }
  get t() {
    return Date.now() - this.start
  }
}
function _timer() {
  return new _Timer()
}
function _timer_if(c) {
  if (c) return new _Timer()
}

class _Sampler {
  constructor(func, options = {}) {
    // in sync mode, create _SampleSync defined dynamically below
    if (!options.async && this.constructor.name != '_SamplerSync')
      return new _SamplerSync(func, options)

    this.options = options
    this.domain = func // save sampler function as domain
    this.start_time = Date.now()
    this.init_time = 0 // any init time excluded from this.t
    this.pending_time = 0 // any delays (e.g. dom updates) excluded from this.t

    // parse sampled values & observed weights
    assign(this, this._parse_func(func))
    const K = (this.K = this.values.length)
    const N = (this.N = this.weights.length)
    if (options.log) print(`parsed ${K} sampled values in ${this.func}`)

    // merge in default options
    const J = (this.J = options.size ?? 1000)
    if (!(J > 0)) fatal(`invalid sample size ${J}`)
    this.options = options = assign(
      {
        stats: false,
        quantiles: false,
        log: false, // silent by default
        warn: true,
        params: {},
        quantile_runs: 100,
        size: J,
        reweight_if: ({ ess, J }) => ess >= 0.9 * J,
        reweight_ess: 10,
        min_reweights: 3,
        max_reweight_tries: this.optimizing || this.accumulating ? 1 : 100,
        resample_if: ({ ess, essu, J }) => ess / essu < clip(essu / J, 0.5, 1),
        move_while: ({ essu, J, a, awK, uawK }) =>
          essu < 0.9 * J || a < J || max_in(awK) > 0 || max_in(uawK) > 0,
        move_weights: ({ aK, uaK, atK, uatK }, awK, uawK) => {
          fill(awK, k => max(0, atK[k] - aK[k]))
          fill(uawK, k => max(0, uatK[k] - uaK[k]))
        },
        move_targets: ({ J /*, r, accumulating*/ }, atK, uatK) => {
          // split J or .1*J, excluding non-sampled (e.g. "predicted") values
          fill(atK, k => (this.values[k].sampled ? 1 : 0))
          fill(uatK, k => (this.values[k].sampled ? 1 : 0))
          if (sum(atK) > 0) scale(atK, J / sum(atK))
          if (sum(uatK) > 0) scale(uatK, (0.1 * J) / sum(uatK))
          // if (optimizing && r == 1) scale(uatK, 0)
          // if (accumulating && r == 1) scale(uatK, 0)
          // if (accumulating && r == 1) scale(atK, 0)
        },
        max_updates: options.updates ? inf : 1000,
        min_updates: 0,
        min_stable_updates: 1,
        min_posterior_updates: 3,
        max_time: options.time ? inf : 1000,
        min_time: 0,
        min_ess: this.optimizing || this.accumulating ? 1 : 0.9 * J,
        max_mks: 1,
        mks_tail: this.optimizing || this.accumulating ? 1 : 0.5,
        mks_period: 1,
        max_tks: 5,
        quantum: 100,
      },
      options
    )

    // set up default prior/posterior sampler functions
    // note posterior here refers to posterior in parent context
    // for posterior, we need to consider weights for log(∝q(x|y)/q(y|x))
    // for efficiency, we require parent to ensure ess≈J s.t. weights≈0
    const sampler = f => f(this.sample())
    this._prior = this._posterior = sampler

    // initialize run state
    this.xJK = matrix(J, K) // samples per run/value
    this.pxJK = matrix(J, K) // prior samples per run/value
    this.yJK = matrix(J, K) // posterior samples per run/value
    this.log_p_xJK = matrix(J, K) // sample (prior) log-densities
    this.log_p_yJK = matrix(J, K) // posterior sample (prior) log-densities
    // this.domJK = matrix(J, K) // sampler domains per run/value

    this.kJ = array(J) // array of (posterior) pivot values in _move
    this.upJK = matrix(J, K) // last jump proposal step
    this.uaJK = matrix(J, K, 0) // last jump accept step
    this.upwK = array(K) // jump proposal weights (computed at pivot value)
    this.awK = array(K) // array of move weights by pivot value
    this.uawK = array(K) // array of move weights by jump value
    this.atK = array(K) // array of move targets by pivot value
    this.uatK = array(K) // array of move targets by jump value

    this.xBJK = [] // buffered samples for mks
    this.log_p_xBJK = [] // buffered sample log-densities for mks
    this.rwBJ = [] // buffered sample weights for mks
    this.rwBj_sum = [] // buffered sample weight sums for mks
    this.uB = [] // buffer sample update steps
    this.pK = array(K) // move proposals per pivot value
    this.aK = array(K) // move accepts per pivot value
    this.upK = array(K) // move proposals per jump value
    this.uaK = array(K) // move accepts per jump value
    this.log_pwJ = array(J) // prior log-weights per run
    this.log_wrfJN = matrix(J, N) // posterior log-weight relaxation functions
    this.rN = array(N) // relaxation parameters
    this.log_wrJ = array(J) // posterior relaxed log-weights
    this.log_rwJ = array(J) // posterior/sample ratio log-weights
    this.log_mwJ = array(J) // posterior move log-weights
    this.log_mpJ = array(J) // posterior move log-densities
    this.log_cwrJ = array(J) // posterior candidate relaxed log-weights
    this.log_cwrfJN = matrix(J, N) // posterior candidate log-weight relaxations
    this.xJ = array(J) // return values
    this.pxJ = array(J) // prior return values
    this.yJ = array(J) // proposed return values
    this.jJ = array(J) // sample indices
    this.jjJ = array(J) // shuffle indices
    // resample (shuffle) & sort buffers
    this._jJ = array(J)
    this._xJ = array(J)
    this._xJK = array(J)
    this._uaJK = array(J)
    this._log_p_xJK = array(J)
    this._log_wrfJN = array(J)
    this._log_wrJ = array(J)
    // reweight buffers
    this._rN = array(N)
    this._log_rwJ = array(J) // also used in sort
    this._log_rwJ_base = array(J)

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

    cache(this, 'ess', ['rwj_ess'])
    cache(this, 'lwr', [], () => sum(this.log_wrJ))
    cache(this, 'lpx', [], () => sum(this.log_p_xJK, lpK => sum(lpK)))
    cache(this, 'rwX', ['rwJ_agg'])
    cache(this, 'elw', ['rwJ'])
    cache(this, 'elp', ['rwJ'])
    cache(this, 'tks', ['rwJ'])
    cache(this, 'stdevK', ['rwJ'])
    cache(this, 'mks', ['rwJ'])

    // note "best" point is chosen based on "density" (log_p_xJK, log_wrJ) only
    // specifically NOT by sample weights log_pwJ, log_rwJ, or rwJ_agg
    // combining the two would result in double-counting
    // "best" point may not be good if posterior is not concentrated around it
    // must be consistent w/ sample|sample_values
    cache(this, 'best_prior_index', ['pwJ'], () =>
      _max_index_by(J, j => sum(this.log_p_xJK[j]))
    )
    cache(this, 'best_index', ['lpx', 'lwr'], () =>
      _max_index_by(J, j => sum(this.log_p_xJK[j]) + this.log_wrJ[j])
    )
    cache(this, 'min_prior', ['pwJ'], () =>
      min_of(J, j => sum(this.log_p_xJK[j]))
    )
    cache(this, 'min_weight', ['lwr'], () => min_in(this.log_wrJ))
    cache(this, 'min_posterior', ['lwr', 'lpx'], () =>
      min_of(J, j => sum(this.log_p_xJK[j]) + this.log_wrJ[j])
    )

    this._init()
  }

  // NOTE: _init remains sync even in async mode so that new _Sampler always returns a sampler object and calling contexts are not forced to use async/await; instead the promise is stored internally as _init_promise to be resolved later in sample once invoked
  _init() {
    this._init_stats()
    const { stats, options } = this
    if (options._worker) return // skip further init on worker

    if (options.async) {
      return (this._init_promise = invoke(async () => {
        if (options.workers > 0) await this._init_workers() // init workers
        await this._init_prior()
        if (this.J == 1) return // skip updates/posterior in debug mode

        // update sample to posterior if there are weights OR targets
        if (this.weights.length || this.values.some(v => v.target)) {
          while (!this.done) {
            try {
              await invoke(async () => {
                const timer = _timer_if(stats)
                await this._update()
                if (stats) {
                  stats.time.update += timer.t
                  stats.quanta++
                }
              })
            } catch (e) {
              this.done = true // stop updates on error
            } // already logged

            // update dom to keep page responsive between update quanta
            const timer = _timer()
            await _update_dom()
            this.pending_time += timer.t
          }
        }
        this._output()
      })).finally(() => {
        if (this.workers) each(this.workers, close_worker) // close workers
      })
    }

    this._init_prior() // not async in sync mode
    if (this.J == 1) return // skip updates/posterior in debug mode

    // update sample to posterior if there are weights OR targets
    if (this.weights.length || this.values.some(v => v.target)) {
      const timer = _timer_if(stats)
      while (!this.done) this._update() // not async in sync mode
      if (stats) stats.time.update = timer.t
    }
    this._output()
  }

  async _init_workers() {
    const { J } = this
    const W = this.options.workers
    const timer = _timer()
    this.workers = []
    let js, je
    let j = 0
    while (j < J) {
      js = j
      j = je = min(J, j + ~~max(1, J / W))
      const worker = init_worker({ silent: true /* logged here */ })
      assign(worker, { index: this.workers.length, js, je })
      eval_on_worker(
        worker,
        () => {
          try {
            self.sampler = new _Sampler(clean_eval(js), parse(options))
            postMessage({ done: true }) // report init completion
          } catch (error) {
            postMessage({ error }) // report error
            // throw error // on worker (can be redundant)
          }
        },
        {
          context: {
            js: `(${this.domain})`, // original sampler function as string
            options: stringify(
              assign(
                omit(this.options, [
                  'log',
                  'plot',
                  'table',
                  'quantiles',
                  'targets',
                  'workers',
                  'async',
                ]),
                {
                  size: je - js, // restrict size to range [js,je)
                  _worker: true, // internal option to skip init
                }
              )
            ), // same omits as in _targets, w/ functions stringified
          },
          done: e => {
            // print(
            //   `init eval done on worker ${worker.index} in ${timer}`,
            //   str(e.data)
            // )
          },
        }
      )
      this.workers.push(worker)
    }
    try {
      await Promise.all(map(this.workers, 'eval'))
      print(`initialized ${this.workers.length} workers in ${timer}`)
    } catch (e) {
      console.error('failed to initialize worker;', e)
      throw e // stops init & closes workers (via finally block in _init)
    }
  }

  async _init_prior() {
    const { J, stats, options } = this

    if (defined(this.options.targets)) {
      if (this.options.targets == true) this._targets()
      else if (!is_object(this.options.targets)) fatal('invalid option targets')
    }

    this.init_time = this.t // includes constructor & target sampling

    // sample prior (along w/ u=0 posterior)
    let timer = _timer_if(options.log || stats)
    await this._sample_prior()
    if (stats) stats.time.prior = timer.t
    if (options.log) {
      print(
        `sampled ${J} prior runs (ess ${this.pwj_ess}, ` +
          `lwr ${this.lwr}, lpx ${this.lpx}) in ${timer}`
      )
      print(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=0`)
    }

    // treat J==1 as "debug mode"
    // print sampled values or simulations and skip posterior (see _init)
    if (J == 1) {
      print('values:', str(this.sample_values()))
      const printed_histories = new Set()
      each(this.sims, s => {
        if (printed_histories.has(s.xt)) return
        // print out history (trace/events/states) merged by time
        // auxiliary state should be enabled by default under sampler w/ J==1
        if (!s.xt._trace || !s.xt._events || !s.xt._states)
          fatal(`missing history in simulated state w/ J==1`)
        const trace = s.xt._trace.map(e =>
          define(e, '_print', { value: print_trace })
        )
        const events = s.xt._events.map(e =>
          define(e, '_print', { value: print_event })
        )
        const states = s.xt._states.map(e =>
          define(e, '_print', { value: print_state })
        )
        const history = sort_by([...events, ...trace, ...states], h => h.t)
        for (const h of history) h._print(h)
        printed_histories.add(s.xt)
      })
      return
    }
  }

  _output() {
    const { stats, options } = this

    if (options.log) {
      print(`applied ${this.u} updates in ${timer}`)
      print(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=${this.u}`)
      if (stats) print(str(omit(stats, 'updates')))
    }

    if (options.table) this._table()
    if (options.quantiles) this._quantiles()
    if (options.plot) this._plot()
  }

  _parse_func(func) {
    // replace sample|condition|weight|confine calls
    let js = func.toString()
    const lines = js.split('\n')
    const values = []
    const weights = []
    const sims = []
    const names = new Set()
    let optimizing = false
    let accumulating = false
    let cumulative = false // flag for cumulative weight calls

    // parse positive integer variables for possible use w/ sample|confine_array
    // also include any positive integer params
    const sizes = from_entries(
      Array.from(
        js.matchAll(
          /(?:^|\n|;) *(?:const|let|var) *(?<name>[_\p{L}][_\p{L}\d]*)\s*=\s*(?<size>[1-9]\d*)(?=\s)/gsu
        ),
        m => {
          const { name, size } = m.groups
          return [name, size]
        }
      )
    )
    if (this.options.params) {
      each(entries(this.options.params), ([k, v]) => {
        if (is_integer(v) && v > 0) sizes[k] = v
      })
    }

    const parse_array_args = args => {
      let [, size, name] =
        args.match(/^ *([1-9]\d*|[_\p{L}][_\p{L}\d]*)\s*,\s*(\S+?)/su) ?? []
      return [size > 0 /*=>digit*/ ? size : sizes[size], name]
    }

    // parse and replace key function calls
    // we use global __sampler variable instead of 'this' to avoid ambiguity
    // argument pattern allowing nested parentheses is derived from that in core.js
    // this particular pattern allows up to 5 levels of nesting for now
    // note prefix ...|...| is to skip comments w/o matching calls inside
    // also note javascript engine _should_ cache the compiled regex
    const __sampler_regex =
      /\s*\/\/[^\n]*|\s*\/\*.*?\*\/|(?:(?:^|\n|;) *(?:const|let|var)? *(\[[^\[\]]+\]|\{[^\{\}]+\}|\S+)\s*=\s*(?:\S+\s*=\s*)*|(?:^|[,{\s])(`.*?`|'[^\n]*?'|"[^\n]*?"|[_\p{L}][_\p{L}\d]*) *: *|\b)(sample|sample_array|simulate|predict|condition|weight|minimize|maximize|confine|confine_array|accumulate) *\(((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\([^()]*?\)|.*?)*?\)|.*?)*?\)|.*?)*?\)|.*?)*?\)|.*?)*?)\)/gsu

    let line_index, line // shared across recursive calls
    const _replace_calls = (js, root = false) =>
      js.replace(__sampler_regex, (m, name, key, method, args, offset) => {
        if (!method) return m // skip comments (from prefix ...|...|)
        // remove quotes from object object key
        if (key?.match(/^[`'"].*[`'"]$/s)) key = key.slice(1, -1)
        // parse size (and alt name) from array method args
        let size, args_name
        if (method.endsWith('_array')) {
          ;[size, args_name] = parse_array_args(args)
          if (!(size > 0)) fatal(`invalid/missing size for ${method}`)
        }
        // if name (via assignment) is mising, try object key or args
        name ??= key ?? args_name
        // check name, parse into array names if possible
        let array_names
        if (name) {
          // decline destructuring assignment to object {...}
          if (!(name[0] != '{'))
            fatal(`destructuring assignment to object ${name} not supported`)
          // allow destructuring assignment to full flat array from sample_array
          if (name[0] == '[') {
            if (name.slice(1, -1).match(/\[|{/))
              fatal(
                `destructuring assignment to nested array ${name} not supported`
              )
            if (name.slice(1, -1).match(/=/))
              fatal(
                `default values in assignment to array ${name} not supported`
              )
            if (method != 'sample_array')
              fatal(`destructuring assignment to array requires sample_array`)
            array_names = name.match(/[_\p{L}][_\p{L}\d]*/gu) ?? []
            if (size != array_names.length)
              fatal('destructuring array assignment size mismatch')
          } else {
            if (names.has(name)) name += '_' + index // de-duplicate name
            if (name.match(/^\d/))
              fatal(`invalid numeric name '${name}' for sampled value`)
          }
        }
        // extract lexical context
        let mt = m
        if (js[offset] == '\n') {
          offset++ // skip leading \n if matched
          mt = m.slice(1)
        }
        const prefix = js.slice(0, offset)
        const suffix = js.slice(offset + mt.length)
        const line_prefix = prefix.match(/.*$/)[0]
        const line_suffix = suffix.match(/^.*/)[0]

        // skip matches inside comments or strings
        if (
          line_prefix.match(/\/\/.*$/) ||
          _count_unescaped(prefix, '/*') > _count_unescaped(prefix, '*/') ||
          _count_unescaped(prefix, '`') % 2 ||
          _count_unescaped(line_prefix, "'") % 2 ||
          _count_unescaped(line_prefix, '"') % 2
        ) {
          return m
        }

        // skip method calls
        if (line_prefix.match(/\.$/)) return m

        // skip function definitions (e.g. from imported #util/sample)
        if (line_prefix.match(/function *$/)) return m
        if (line_suffix.match(/{ *$/)) return m

        // update & check line if processing at root level (vs in args)
        if (root) {
          line_index = _count_unescaped(prefix, '\n')
          line = lines[line_index]
          check(() => [
            line_prefix + mt + line_suffix,
            line,
            (a, b) => a.startsWith(b),
          ]) // sanity check
        }

        // if method is 'accumulate', enable global and per-call flags
        if (method == 'accumulate') {
          accumulating = true
          cumulative = true
        }

        // recursively replace calls nested inside arguments
        args = _replace_calls(args)

        // if method is 'accumulate', just disable per-call flag and return
        if (method == 'accumulate') {
          cumulative = false
          // note we still need to replace args
          return m.replace(
            new RegExp(method + ' *\\(.+\\)$', 's'),
            `__sampler._${method}(${args})`
          )
        }

        // uncomment to debug replacement issues ...
        // console.log(offset, line_prefix + line_suffix)

        let index
        const lexical_context = context => ({
          index,
          offset,
          method,
          cumulative,
          name,
          args,
          line_index,
          line,
          js,
          ...context,
        })

        switch (method) {
          case 'confine_array':
            index = weights.length
            repeat(size, () => {
              const index = weights.length // element index
              weights.push(lexical_context({ index }))
            })
            break
          case 'sample_array':
            index = values.length
            if (!array_names) {
              // process using array name
              const array_name = name || str(index)
              repeat(size, i => {
                const index = values.length // element index
                names.add((name = array_name + `[${i}]`)) // aligned w/ values & unique
                values.push(lexical_context({ index, sampled: true }))
              })
            } else {
              // process names from destructuring assignment
              for (const name of array_names) {
                const index = values.length // element index
                if (names.has(name)) name += '_' + index // de-duplicate name
                names.add(name) // aligned w/ values & unique
                values.push(lexical_context({ index, name, sampled: true }))
              }
            }
            break
          case 'maximize':
          case 'minimize':
            // also plot optimized value under inferred name
            optimizing = true // enable optimization mode
            index = values.length
            if (!name) {
              ;[, name] = args.match(/^\s*(\S+?)\s*(?:,|$)/su) ?? []
              name ??= method // name after optimization method
            }
            if (names.has(name)) name += '_' + index // de-duplicate name
            if (name.match(/^\d/))
              fatal(`invalid numeric name '${name}' for optimized value`)
            names.add(name) // name aligned w/ values & unique
            values.push(lexical_context())
          // continue to process as weight ...
          case 'condition':
          case 'weight':
          case 'confine':
            let value_index = index // from maximize|minimize above
            index = weights.length
            name ||= str(index)
            weights.push(lexical_context({ value_index }))
            break
          case 'simulate':
            index = sims.length
            // note simulation name is separate from sampled value names
            sims.push(lexical_context())
            break
          case 'predict':
            index = values.length
            if (!name) {
              ;[, name] = args.match(/^\s*(\S+?)\s*(?:,|$)/su) ?? []
              name ??= method // name after predict method
            }
            if (names.has(name)) name += '_' + index // de-duplicate name
            if (name.match(/^\d/))
              fatal(`invalid numeric name '${name}' for optimized value`)
            names.add(name) // name aligned w/ values & unique
            values.push(lexical_context())
            break
          case 'sample':
            // replace sample call
            index = values.length
            names.add((name ||= str(index))) // name aligned w/ values & unique
            values.push(lexical_context({ sampled: true }))
            break
          default:
            fatal(`unknown method ${method}`)
        }
        return m.replace(
          new RegExp(method + ' *\\(.+\\)$', 's'),
          `__sampler._${method}(${index},${args})`
        )
      })

    js = _replace_calls(js, true /*root js*/)
    const params = this.options.params // params (if any) from calling context
    const state = {
      values,
      weights,
      sims,
      names,
      nK: array(names),
      optimizing,
      accumulating,
    }

    // function wrapper to prep sampler & set self.__sampler
    const wrap = func =>
      function (sampler) {
        each(sampler.values, v => (v.called = false))
        each(sampler.weights, w => (w.called = false))
        self.__sampler = sampler
        const out = func(sampler)
        self.__sampler = null
        return out
      }

    // evaluate function from js w/ replacements & optional params
    // also wrap function using _wrap_func (see below)
    func = params
      ? clean_eval(`(({${keys(params)}})=>(${js}))`)(params)
      : clean_eval(`(${js})`) // parentheses required for function(){...}
    return { ...state, func: wrap(func) }
  }

  _clone(transferables, js = 0, je = this.J, debug = false) {
    const path = (v, k, obj) => {
      if (v == this) return 'this'
      if (obj != this && !obj.__key) return 'this.….' + k // unknown path
      let path = 'this'
      while (obj?.__key) {
        path += '.' + obj.__key
        obj = obj.__parent
      }
      return path + '.' + k
    }

    const has_function = v =>
      is_function(v) ||
      (is_array(v)
        ? has_function(v[0]) // assume uniform arrays
        : is_object(v) && some(values(v), has_function))
    const is_plain = v => Object.getPrototypeOf(v) == Object.prototype
    const is_complex = v => !is_primitive(v) && !is_plain(v) && !is_array(v)
    const has_complex = v =>
      is_complex(v) ||
      (is_array(v)
        ? has_complex(v[0]) // assume uniform arrays
        : is_object(v) && some(values(v), has_complex))
    const is_simple = v => !has_function(v) && !has_complex(v)

    return omit_by(
      clone_deep_with(this, (v, k, obj) => {
        if (v == this) return // use default cloner
        if (is_nullish(v)) return
        if (k[0] == '_') return null // skip buffers & cached properties
        if (obj == this && ['options', 'workers'].includes(k)) return null

        // skip functions (for now)
        if (is_function(v)) {
          if (debug) console.warn(`skipping function ${path(v, k, obj)}`)
          return null
        }

        if (is_object(v)) {
          // skip complex objects
          if (is_complex(v)) {
            if (debug) console.warn(`skipping complex ${path(v, k, obj)}`)
            return null
          }

          // TODO: slice J-indexed arrays to [js,je)
          // if (is_array(v) && v.length == J)

          // move simple objects by reference (w/o cloning)
          if (is_simple(v)) {
            if (debug) console.log(`moving ${path(v, k, obj)}`)
            return v
          }

          // in debug mode, define __key/__parent for path tracing
          if (debug && !v.__key) {
            define(v, '__key', { value: k })
            define(v, '__parent', { value: this })
          }

          // TODO: review clonings for run==2, better organize and document logic
        }

        if (debug) console.log(`cloning ${path(v, k, obj)} (${typeof v})`)
      }),
      is_nullish
    ) // drop nullish values
  }

  _merge(obj, js = 0) {
    // TODO: merge obj into this, w/ handling functions & J-indexed arrays
  }

  async _sample_func() {
    const timer = _timer_if(this.stats)
    const { s, func, xJ, yJ, moving, workers, J } = this

    if (workers) {
      // print(`starting sample ${s} on ${workers.length} workers ...`)
      const evals = workers.map((worker, w) => {
        const { js, je } = worker
        const transferables = []
        const input = this._clone(transferables, js, je, s == 2 && w == 0)
        return eval_on_worker(
          worker,
          () => {
            try {
              sampler._merge(input)
              sampler._sample_func()
              const transferables = []
              postMessage({
                done: true,
                output: sampler._clone(transferables),
                transfer: transferables,
              })
            } catch (error) {
              postMessage({ error }) // report error
              // throw error // on worker (can be redundant)
            }
          },
          {
            context: { s, input },
            transfer: transferables,
            done: e => {
              this._merge(e.data.output, js)
              // print(`sample ${s}.[${js},${je}) done on worker ${w} in ${timer}`)
            },
          }
        )
      })

      try {
        await Promise.all(evals)
        print(`sample ${s} done on ${workers.length} workers in ${timer}`)
      } catch (e) {
        console.error(`sample ${s} failed on worker;`, e)
        throw e // stops init & closes workers (via finally block in _init)
      }

      // TODO: this is temporary until clone/merge_clone are working!
      fill(moving ? yJ : xJ, j => ((this.j = j), func(this)))
    } else {
      // no workers, invoke on main thread
      fill(moving ? yJ : xJ, j => ((this.j = j), func(this)))
    }
    this.s++ // advance sampling step
    if (this.stats) {
      this.stats.time.func += timer.t
      this.stats.samples++
    }
  }

  _init_stats() {
    const options = this.options
    if (!options.stats) return // stats disabled
    // enable ALL stats for stats == true
    const known_keys = flat(
      'ess essu essr elw elp lwr lpx mar mlw mlp mks tks p a m t r'.split(
        /\W+/
      ),
      this.nK.map(n => `mar.${n}`),
      this.nK.map(n => `uar.${n}`),
      this.nK.map(n => `up.${n}`),
      this.nK.map(n => `ua.${n}`),
      this.nK.map(n => `p.${n}`),
      this.nK.map(n => `a.${n}`),
      this.nK.map(n => `pp.${n}`),
      this.nK.map(n => `mean.${n}`),
      this.nK.map(n => `median.${n}`),
      this.weights.map(w => `r.${w.name}`)
    )
    if (options.stats == true) options.stats = known_keys
    // convert string to array of keys
    if (is_string(options.stats))
      options.stats = options.stats.split(/[^\.\w]+/)
    // convert array of string keys to object of booleans (true)
    if (is_array(options.stats)) {
      if (!every(options.stats, is_string)) fatal('invalid option stats')
      options.stats = from_entries(options.stats.map(k => [k, true]))
    }
    if (!(is_object(options.stats) && every(values(options.stats), is_boolean)))
      fatal('invalid option stats')
    const unknown_keys = diff(keys(options.stats), known_keys).filter(
      k => !k.includes('.') // since names can change at runtime
    )
    if (!empty(unknown_keys)) fatal(`unknown stats: ${unknown_keys}`)

    this.stats = {
      reweights: 0,
      reweight_tries: 0,
      resamples: 0,
      sorts: 0,
      moves: 0,
      proposals: 0,
      accepts: 0,
      quanta: 0, // remains 0 for sync mode
      samples: 0,
      time: {
        func: 0,
        targets: 0,
        prior: 0,
        update: 0,
        updates: {
          sample: 0,
          reweight: 0,
          resample: 0,
          sort: 0,
          move: 0,
          mks: 0,
          tks: 0,
        },
      },
    }
  }

  _update_stats() {
    const { stats } = this
    if (!stats) return // stats disabled
    const spec = this.options.stats
    if (empty(spec)) return // no update stats enabled

    const update = {}
    if (spec.ess) update.ess = round(this.ess)
    if (spec.essu) update.essu = round(this.essu)
    if (spec.essr) update.essr = round(100 * clip(this.ess / this.essu))
    if (spec.elw) update.elw = round_to(this.elw, 3)
    if (spec.elp) update.elp = round_to(this.elp, 3)
    if (spec.lwr) update.lwr = round_to(this.lwr, 1)
    if (spec.lpx) update.lpx = round_to(this.lpx, 1)
    if (spec.mar)
      update.mar = this.u == 0 ? 100 : round_to(100 * (this.a / this.p), 3, 3)
    each(this.nK, (n, k) => {
      if (spec[`mar.${n}`])
        update[`mar.${n}`] =
          this.u == 0 ? 100 : round_to(100 * (this.aK[k] / this.pK[k]), 3, 3)
    })
    if (spec.uar)
      update.uar = this.u == 0 ? 100 : round_to(100 * (this.ua / this.up), 3, 3)
    each(this.nK, (n, k) => {
      if (spec[`uar.${n}`])
        update[`uar.${n}`] =
          this.u == 0 ? 100 : round_to(100 * (this.uaK[k] / this.upK[k]), 3, 3)
    })
    if (spec.mlw) update.mlw = this.u == 0 ? 0 : round_to(this.mlw, 1)
    if (spec.mlp) update.mlp = this.u == 0 ? 0 : round_to(this.mlp, 1)
    if (spec.mks) update.mks = round_to(this.mks, 3)
    if (spec.tks) update.tks = round_to(this.tks, 1)
    if (spec.p) update.p = this.u == 0 ? 0 : this.p
    each(this.nK, (n, k) => {
      if (spec[`up.${n}`]) update[`up.${n}`] = this.u == 0 ? 0 : this.upK[k]
      if (spec[`ua.${n}`]) update[`ua.${n}`] = this.u == 0 ? 0 : this.uaK[k]
      if (spec[`p.${n}`]) update[`p.${n}`] = this.u == 0 ? 0 : this.pK[k]
      if (spec[`a.${n}`]) update[`a.${n}`] = this.u == 0 ? 0 : this.aK[k]
      if (spec[`pp.${n}`])
        update[`pp.${n}`] = round(
          this.u == 0 ? 100 / this.K : 100 * (this.pK[k] / this.p)
        )
      if (spec[`mean.${n}`] || spec[`median.${n}`]) {
        const { J, xJK, rwJ } = this
        const xJ = array(J, j => xJK[j][k])
        const wJ = copy(rwJ)
        _remove_undefined(xJ, wJ)
        const wtd_mean = dot(xJ, wJ) / sum(wJ)
        if (spec[`mean.${n}`]) update[`mean.${n}`] = round_to(wtd_mean, 3)
        if (spec[`median.${n}`]) {
          const xR = lookup(xJ, random_discrete_array(array(10 * J), wJ))
          update[`median.${n}`] = round_to(median(xR), 3)
        }
      }
    })
    if (spec.a) update.a = this.u == 0 ? 0 : this.a
    if (spec.t) update.t = this.t
    if (spec.r) update.r = round_to(this.r, 3, inf, 'floor')
    each(this.weights, (weight, n) => {
      if (spec[`r.${weight.name}`])
        update[`r.${weight.name}`] = round_to(this.rN[n], 3, inf, 'floor')
    })

    if (this.u == 0) stats.updates = [update]
    else stats.updates.push(update)
  }

  async _sample_prior() {
    const timer = _timer_if(this.stats)
    const { xJ, pxJ, pxJK, xJK, jJ, log_p_xJK } = this
    const { log_pwJ, rN, log_wrJ, log_rwJ, log_wrfJN, stats } = this
    this.u = 0 // prior is zero'th update step
    this.s = 0 // prior is zero'th sampling step
    fill(rN, this.options.r0 ?? 0) // default r0=0 at u=0
    fill(log_pwJ, 0)
    each(log_p_xJK, log_p_xjK => fill(log_p_xjK, 0))
    await this._sample_func()
    copy(log_rwJ, log_pwJ) // log_wrJ added below if r0>0
    if (max_in(rN) == 0) {
      fill(log_wrJ, 0)
    } else {
      each(rN, (r, n) => this.weights[n].init_log_wr?.(r))
      fill(log_wrJ, j => sum(log_wrfJN[j], (f, n) => f(rN[n])))
      clip_in(log_wrJ, -Number.MAX_VALUE, Number.MAX_VALUE)
      add(log_rwJ, log_wrJ)
    }
    this.lwr = null // since log_wrJ changed
    this.lpx = null // since log_p_xJK changed
    fill(jJ, j => j) // init sample indices
    this._sort() // since rwJ_agg changed
    // copy prior samples for sample_prior()
    each(pxJK, (pxjK, j) => copy(pxjK, xJK[j]))
    copy(pxJ, xJ)
    if (stats) stats.time.updates.sample += timer.t
  }

  async _fork() {
    this.forking = true
    await this._sample_func()
    this.forking = false
  }

  // reweight by incrementing rN
  // multiply rwJ by wrJ@r_next / wrJ@r
  async _reweight() {
    const timer = _timer_if(this.stats)
    if (this.r == 1 && !this.optimizing && !this.accumulating) return
    // if (this.r == 1 && !this.optimizing) return

    const { rN, _rN, J, log_wrJ, weights } = this
    const { log_rwJ, _log_rwJ, _log_rwJ_base, log_wrfJN, stats } = this
    const { reweight_ess, min_reweights, max_reweight_tries } = this.options

    // check reweight_ess > optimization quantile ess (if any)
    if (this.optimizing) {
      each(weights, weight => {
        if (weight.optimizing && reweight_ess >= (1 - weight.q) * J)
          fatal(
            `reweight_ess=${reweight_ess} too low ` +
              `for optimization quantile q=${weights[0].q}`
          )
      })
    }

    // check ess > reweight_ess before attemping reweight
    if (this.ess <= reweight_ess)
      fatal(
        `ess too low to attempt reweight ` +
          `(ess=${this.ess} <= reweight_ess=${reweight_ess})`
      )

    // if optimizing, fork before additive reweight
    // ensures fresh samples used for additive (asymptotic) log_w
    // also ensures posterior _predictive_ distributions are optimized
    if (this.optimizing || this.accumulating) await this._fork()

    // save state for possible retries w/ backtracking
    let tries = 0
    copy(_rN, rN)
    copy(_log_rwJ, log_rwJ)
    // NOTE: we store _last and _base on log_wr functions to avoid having to shuffle around additional buffers in _resample (and _sort); note a downside is that base is lost on _fork, so we couldn't subtract base for optimization or accumulation even if we wanted to
    if (weights.some(w => !w.optimizing && !w.cumulative))
      each(log_wrfJN, fjN =>
        each(fjN, fjn => !fjn || (fjn._base = fjn._last ?? 0))
      )

    do {
      fill(log_wrJ, 0)
      fill(_log_rwJ_base, 0) // for _base
      if (tries > 0) copy(log_rwJ, _log_rwJ)
      each(rN, (r, n) => {
        const weight = weights[n]
        if (weight.optimizing) {
          // increment via weight.inc_r
          r = rN[n] = weight.inc_r(r)
          // we skip reweights when r is unchanged by inc_r
          // at r=1 this allows ess to increase (1-q)*J -> min_ess
          // cost is increasing spread, greater increase for smaller q
          // moves only mix into incremental log_wr subject to sampling noise
          // reweights (+ resampling) critical for mixing into optimal sample
          // moves w/o reweighting decay toward ~prior (faster for smaller q)
          // transitions depend on sample quality & subject to sampling noise
          // prefer using larger J to increase ess at computational cost only
          // we do not artificially restrict movement to boost ess
          if (r == _rN[n] && this.options.min_ess > (1 - weight.q) * J) {
            addf(log_wrJ, log_wrfJN, fjN => fjN[n]?.(r) ?? 0)
            return // nothing else to do
          }
        } else {
          if (r == 1 && !weight.cumulative) return
          // if (r == 1) return
          if (weight.cumulative) {
            // increment based on time relative to half-time point
            const acc_time = (this.options.time || this.options.max_time) / 2
            r = rN[n] = min(1, this.t / acc_time)
          } else {
            // increment by 1/min_reweights, then backtrack as needed
            if (tries == 0) r = rN[n] = min(1, _rN[n] + 1 / min_reweights)
            else r = rN[n] = _rN[n] + (rN[n] - _rN[n]) * random()
          }
        }
        weight.init_log_wr?.(r)
        repeat(J, j => {
          const log_wr = log_wrfJN[j][n]
          if (!log_wr) return // not called in last pass
          const log_w = log_wr(r)
          log_wrJ[j] += log_w
          if (weight.optimizing) {
            // optimization|acccumulation log_wr is additive
            // can be interpreted as a conjunctive (AND) condition
            // log_w is (log) likelihood weight P(≥xq0)P(≥xq1)…, xqn⭇xq
            // log_w concentrates around samples that maximize quantile xq
            // final log_w only defined asymptotically as u→∞
            // additive log_wr must be finite to allow non-additive log_w
            // use opt_penalty to balance against non-additive finite log_w
            // note issue is that log_rwJ is reset to 0 once baked in, so
            //   non-additive log_w is only added for new samples from move
            //   whereas additive log_w is added repeatedly in each update step
            log_rwJ[j] += log_w
          } else {
            if (weight.cumulative) {
              // if (r == 1) {
              //   const acc_time =
              //     (this.options.time || this.options.max_time) / 2
              //   log_rwJ[j] += log_w * clip(2 - this.t / acc_time)
              // } else {
              log_rwJ[j] += log_w
              // }
            } else {
              log_rwJ[j] += log_w // -log_wr._base
              _log_rwJ_base[j] += log_wr._base
              log_wr._last = log_w // becomes _base in next reweight
            }
          }
        })
      })
      clip_in(log_wrJ, -Number.MAX_VALUE, Number.MAX_VALUE)
      clip_in(log_rwJ, -Number.MAX_VALUE, Number.MAX_VALUE)
      clip_in(_log_rwJ_base, -Number.MAX_VALUE, Number.MAX_VALUE)
      sub(log_rwJ, _log_rwJ_base) // subtract _base for non-optimizing weights
      this.lwr = null // since log_wrJ changed
      this.rwJ = null // since log_rwJ changed
    } while (++tries < max_reweight_tries && this.ess < reweight_ess)

    if (this.ess < reweight_ess)
      fatal(
        `failed reweight in ${tries} tries ` +
          `(ess=${this.ess} < reweight_ess=${reweight_ess})`
      )

    // if optimizing, re-fork after reweight
    // ensures stats/plots also reflect posterior predictive
    // comment this out to see "predictive delta" in stats/plots
    // we have to update log_wrJ for move step (verified by mks convergence)
    // note log_rwJ is invariant to forking (same as in _move)
    if (this.optimizing || this.accumulating) {
      await this._fork()
      fill(log_wrJ, j => sum(log_wrfJN[j], (f, n) => f?.(rN[n]) ?? 0))
      clip_in(log_wrJ, -Number.MAX_VALUE, Number.MAX_VALUE)
      this.lwr = null // since log_wrJ changed
    }

    this._sort() // since rwJ_agg changed

    if (stats) {
      stats.reweights++
      stats.reweight_tries += tries
      stats.time.updates.reweight += timer.t
    }
  }

  // swap arrays w/ temporary buffers prefixed w/ _
  _swap(...names) {
    each(names, n => (this[n] = swap(this[`_${n}`], (this[`_${n}`] = this[n]))))
  }

  // resample step
  // resample based on rwJ, reset rwJ=1
  _resample() {
    const timer = _timer_if(this.stats)
    const { J, jjJ, rwj_uniform, rwJ, rwj_sum, log_rwJ, stats, _jJ, jJ } = this
    const { _xJ, xJ, _xJK, xJK, _log_wrfJN, log_wrfJN } = this
    const { _uaJK, uaJK, _log_wrJ, log_wrJ, log_p_xJK, _log_p_xJK } = this
    if (rwj_uniform) random_discrete_uniform_array(jjJ, J)
    else random_discrete_array(jjJ, rwJ, rwj_sum) // note: sorted indices
    scan(jjJ, (j, jj) => {
      _jJ[j] = jJ[jj]
      _xJ[j] = xJ[jj]
      _xJK[j] = xJK[jj]
      _uaJK[j] = uaJK[jj]
      _log_p_xJK[j] = log_p_xJK[jj]
      _log_wrfJN[j] = log_wrfJN[jj]
      _log_wrJ[j] = log_wrJ[jj]
    })
    this._swap('jJ', 'xJ', 'xJK', 'uaJK', 'log_p_xJK', 'log_wrfJN', 'log_wrJ')
    fill(log_rwJ, 0) // reset weights now "baked into" sample
    this.rwJ = null // since log_rwJ changed
    this.counts = null // since jJ changed
    this.lwr = null // since log_wrJ changed
    this.lpx = null // since log_p_xJK changed
    // note this can be commented out if _sort is based on non-aggregate weight
    this._sort() // since rwJ_agg changed (despite uniform log_rwJ)
    if (stats) {
      stats.resamples++
      stats.time.updates.resample += timer.t
    }
  }

  // (re)sort by decreasing aggregate weight (rwJ_agg)
  // allows enumerating samples in decreasing weight
  // speeds up random_discrete(_array) based on rwJ as in sample_index()
  // could also speed up other operations that are somehow biased by weight
  // not strictly necessary otherwise, but cheap & can reveal bugs
  // e.g. revealed a weighted sorting bug in ks2
  // could be tied to an option in the future
  _sort() {
    if (!this.options.sort) return // disabled
    // if (this.rwj_uniform) return // nothing to do
    if (this.ess == this.J) return // nothing to do
    const timer = _timer_if(this.stats)
    const { jjJ, rwJ_agg, stats, _jJ, jJ } = this
    const { _xJ, xJ, _xJK, xJK, _log_wrfJN, log_wrfJN } = this
    const { _uaJK, uaJK, _log_wrJ, log_wrJ, log_p_xJK, _log_p_xJK } = this
    const { _log_rwJ, log_rwJ } = this

    fill(jjJ, j => j)
    // rank_by(jjJ, j => rwJ[j])
    rank_by(jjJ, j => rwJ_agg[jJ[j]])
    scan(jjJ, (j, jj) => {
      _jJ[j] = jJ[jj]
      _xJ[j] = xJ[jj]
      _xJK[j] = xJK[jj]
      _uaJK[j] = uaJK[jj]
      _log_p_xJK[j] = log_p_xJK[jj]
      _log_wrfJN[j] = log_wrfJN[jj]
      _log_wrJ[j] = log_wrJ[jj]
      _log_rwJ[j] = log_rwJ[jj]
    })
    this._swap(
      'jJ',
      'xJ',
      'xJK',
      'uaJK',
      'log_p_xJK',
      'log_wrfJN',
      'log_wrJ',
      'log_rwJ'
    )
    this.rwJ = null // since log_rwJ changed
    // sanity check that first sample has maximal aggregate weight
    // note this should be commented out if _sort is based on non-aggregate weight
    check(() => [max_in(rwJ_agg), this.rwJ_agg[this.jJ[0]]])
    // note all other state should be invariant to permutation
    if (stats) {
      stats.sorts++
      stats.time.updates.sort += timer.t
    }
  }

  // move step
  // take metropolis-hastings steps along posterior chain
  async _move() {
    const timer = _timer_if(this.stats)
    const { J, K, N, yJ, yJK, kJ, upJK, uaJK, xJ, xJK, jJ, jjJ } = this
    const { log_cwrfJN, log_wrfJN, log_cwrJ, log_wrJ, stats } = this
    const { awK, uawK, log_mwJ, log_mpJ, log_p_xJK, log_p_yJK } = this
    fill(log_mwJ, 0) // reset move log-weights log(∝q(x|y)/q(y|x))
    fill(log_mpJ, 0) // reset move log-densities log(∝p(y)/p(x))
    each(log_cwrfJN, log_cwrfjN => fill(log_cwrfjN, undefined))
    fill(log_cwrJ, 0)
    each(yJK, yjK => fill(yjK, undefined))
    each(log_p_yJK, log_p_yjK => fill(log_p_yjK, 0))
    each(upJK, upjK => fill(upjK, 0))

    // choose random pivot based on uaJK, awK, and uawK
    // note exploration matters for optimization also
    // random_discrete_uniform_array(kJ, K)
    const wK = (this._move_wK ??= array(K))
    each(uaJK, (uajK, j) => {
      fill(wK, k => this.u - uajK[k] || awK[k] || uawK[k])
      fill(wK, k => awK[k] || uawK[k])
      kJ[j] = random_discrete(wK)
    })

    this.moving = true // enable posterior chain sampling into yJK in _sample
    const tmp_log_wrfJN = log_wrfJN // to be restored below
    this.log_wrfJN = log_cwrfJN // redirect log_wrfJN -> log_cwrfJN temporarily
    await this._sample_func()
    each(this.rN, (r, n) => addf(log_cwrJ, log_cwrfJN, fjN => fjN[n]?.(r) ?? 0))
    clip_in(log_cwrJ, -Number.MAX_VALUE, Number.MAX_VALUE)
    this.log_wrfJN = tmp_log_wrfJN // restore log_wrfJN
    this.moving = false // back to using xJK

    // accept/reject proposed moves
    let accepts = 0
    this.move_log_w = 0
    this.move_log_p = 0
    repeat(J, j => {
      const k_pivot = kJ[j]
      this.p++
      this.pK[k_pivot]++
      each(upJK[j], (u, k) => {
        if (u != this.u) return
        this.up++
        this.upK[k]++
      })
      const log_dwj = log_cwrJ[j] - log_wrJ[j]
      if (random() < exp(log_mwJ[j] + log_mpJ[j] + log_dwj)) {
        // update state to reflect move
        xJ[j] = yJ[j]
        xJK[j] = yJK[j] // can't copy since rows can share arrays
        yJK[j] = array(K) // replace array since moved into xJK
        log_p_xJK[j] = log_p_yJK[j]
        log_p_yJK[j] = array(K)
        log_wrfJN[j] = log_cwrfJN[j]
        log_cwrfJN[j] = array(N)
        log_wrJ[j] = log_cwrJ[j]
        // log_dwj and any other factors in p(accept) are already reflected in
        // post-accept sample so log_rwJ is invariant; this was confirmed
        // (but not quite understood) in earlier implementations
        // log_rwJ[j] += log_dwj
        // log_rwJ[j] += log_mpJ[j]
        jJ[j] = J + j // new index remapped below
        this.move_log_w += log_dwj
        this.move_log_p += log_mpJ[j]
        each(upJK[j], (u, k) => {
          if (u != this.u) return
          uaJK[j][k] = u // accepted jump
          this.uaK[k]++
          this.ua++
        })
        this.aK[k_pivot]++
        this.a++
        accepts++
      }
    })

    // reassign indices and reset state if any moves were accepted
    if (accepts > 0) {
      fill(jjJ, -1)
      let jj = 0 // new indices
      apply(jJ, j => (j >= J ? jj++ : jjJ[j] >= 0 ? jjJ[j] : (jjJ[j] = jj++)))
      // note log_rwJ is invariant by design (also see comment above)
      // BUT its dependents generally ALSO depend on xJK, log_wrJ, etc
      // this.rwJ = null // rwJ did NOT change
      each(this.__deps['rwJ'], dep => (this[dep] = null))
      this.counts = null // since jJ changed
      this.lwr = null // since log_wrJ changed
      this.elw = null // since log_wrfJN changed (though rwJ did not)
      this.lpx = null // since log_p_xJK changed
      // note this can be commented out if _sort is based on non-aggregate weight
      this._sort() // since rwJ_agg changed (despite invariant log_rwJ)
    }

    if (stats) {
      stats.moves++
      stats.proposals += J
      stats.accepts += accepts
      stats.time.updates.move += timer.t
    }
  }

  async _update() {
    const {
      time,
      updates,
      max_time,
      min_time,
      max_updates,
      min_updates,
      min_stable_updates,
      min_posterior_updates,
      max_mks,
      min_ess,
      mks_period,
      reweight_if,
      resample_if,
      move_targets,
    } = this.options

    // if done, just return
    if (this.done) fatal(`_update invoked after done`)

    // initialize update-related state on u=0
    if (this.u == 0) {
      this.stable_updates = 0
      this.posterior_updates = 0
      this.done = false
    }
    const timer = _timer() // step timer

    // if resuming move, do that ...
    if (this.resume_move) return await this._update_move(timer)

    // reweight
    // pre-stats for more meaningful ess, etc
    // also reweight on u=0 to avoid prior moves at u=1
    // should be skipped (even at u=0) if ess is too low
    // forced if optimizing|accumulating (see comments in _reweight|_maximize)
    // NOTE: not forced on final step, so ess can be unrealistic (and r low) if updates are terminated early, e.g. due to max_time
    if (this.optimizing || this.accumulating || reweight_if(this))
      await this._reweight()

    // update stats
    this._update_stats()

    // check for termination
    // continue based on min_time/updates
    // minimums supersede maximum and target settings
    // targets override default maximums (see constructor)
    // actual stopping is below, after reweight and update_stats
    if (this.t >= min_time && this.u >= min_updates) {
      // check target updates
      if (this.u >= updates) {
        const { t, u } = this
        if (this.options.log)
          print(`reached target updates u=${u}≥${updates} (t=${t}ms)`)
        return this._done()
      }

      // check target time
      if (this.t >= time) {
        const { t, u } = this
        if (this.options.log)
          print(`reached target time t=${t}≥${time}ms (u=${u})`)
        return this._done()
      }

      // check r==1 and target ess, and mks
      if (
        this.r == 1 &&
        this.ess >= min_ess &&
        (max_mks == inf || this.mks <= max_mks)
      )
        this.stable_updates++
      else this.stable_updates = 0
      if (this.r == 1) this.posterior_updates++
      if (
        this.stable_updates >= min_stable_updates &&
        this.posterior_updates >= min_posterior_updates
      ) {
        const { t, u, ess, mks } = this
        if (this.options.log)
          print(
            `reached target ess=${round(ess)}≥${min_ess}, ` +
              `r=1, mks=${round_to(mks, 3)}≤${max_mks} ` +
              `@ u=${u}, t=${t}ms, stable_updates=${this.stable_updates}, ` +
              `posterior_updates=${this.posterior_updates}`
          )
        return this._done()
      }

      // check max_time/updates for potential early termination
      if (this.t >= max_time || this.u >= max_updates) {
        const { t, u } = this
        if (this.options.warn) {
          // warn about running out of time or updates
          if (t > max_time)
            warn(`ran out of time t=${t}≥${max_time}ms (u=${u})`)
          else warn(`ran out of updates u=${u}≥${max_updates} (t=${t}ms)`)
        }
        return this._done()
      }
    }

    // buffer samples at u=0 and then every mks_period updates
    if (this.u % mks_period == 0) {
      this.uB.push(this.u)
      this.xBJK.push(clone_deep(this.xJK))
      this.log_p_xBJK.push(clone_deep(this.log_p_xJK))
      if (this.rwj_uniform) {
        this.rwBJ.push(undefined)
        this.rwBj_sum.push(undefined)
      } else {
        this.rwBJ.push(clone_deep(this.rwJ))
        this.rwBj_sum.push(this.rwj_sum)
      }
    }

    // advance to next step
    this.u++

    // resample
    if (resample_if(this)) this._resample()

    // move
    // must be done after reweights (w/ same u) for accurate mlw
    this.p = 0 // proposed move count
    this.a = 0 // accepted move count
    this.up = 0 // proposed jump count
    this.ua = 0 // accepted jump count
    fill(this.pK, 0) // proposed moves by pivot value
    fill(this.aK, 0) // accepted moves by pivot value
    fill(this.upK, 0) // proposed moves by jump value
    fill(this.uaK, 0) // accepted moves by jump value
    this.mlw = 0 // log_w improvement
    this.mlp = 0 // log_p improvement
    move_targets(this, this.atK, this.uatK)
    await this._update_move(timer)
  }

  async _update_move(timer) {
    const { max_time, move_while, move_weights, quantum } = this.options
    this.resume_move = true // resume if we return w/o completing move step
    if (timer.t >= quantum) return // continue (will resume move)

    while (move_while(this)) {
      move_weights(this, this.awK, this.uawK)
      await this._move()
      this.mlw += this.move_log_w
      this.mlp += this.move_log_p
      if (timer.t >= quantum) return // continue (will resume move)
      if (this.t >= max_time) {
        if (this.options.warn)
          warn(`last move step (u=${this.u}) cut short due to max_time`)
        this.resume_move = false
        return // continue (will terminate updates on next call)
      }
    }
    this.resume_move = false
    return // continue
  }

  _done() {
    this.done = true // no more updates
    // warn about r<1 and tks>max_tks if warnings enabled
    if (this.options.warn) {
      if (this.r < 1) warn(`pre-posterior sample w/ r=${this.r}<1`)
      if (this.tks > this.max_tks) {
        warn(`failed to achieve target tks=${this.tks}≤${this.max_tks}`)
        print('tks_pK:', str(zip_object(this.nK, round_to(this.___tks_pK, 3))))
      }
    }
  }

  _targets() {
    const timer = _timer_if(this.stats)
    const f = this.domain // sampler domain function
    let o = omit(this.options, [
      'log',
      'plot',
      'table',
      'quantiles',
      'targets',
      'workers',
      'async',
    ])
    o.warn = false
    o.updates = o.min_updates = o.max_updates = 0 // no updates
    o.reweight_if = () => false // no reweight for u=0
    // o.size = 10 * this.J // 10x samples per run
    o.r0 = 1 // so r=1 at u=0 and rwJ is final weight

    let targets = []
    while (targets.length < 1000 && timer.t < 1000) {
      const { xJK, rwJ } = new _Sampler(f, o)
      let w_accept
      each(xJK, (xjK, j) => {
        const w = rwJ[j]
        if (w == 0) return // skip rejected run
        w_accept ??= w
        if (!approx_equal(w, w_accept))
          fatal(`uneven weights ${w}!=${w_accept} for target run`)
        if (w) targets.push(zip_object(this.nK, xjK))
      })
    }
    if (targets.length < 1000)
      fatal(`generated only ${targets.length}/1000 targets in ${timer}`)
    this.options.targets = transpose_objects(targets)
    if (this.options.log)
      print(`generated ${targets.length} targets in ${timer}`)
    if (this.stats) this.stats.time.targets = timer.t
  }

  _quantiles() {
    const options = this.options
    if (!(size(options.stats) == 1))
      fatal('quantiles require single stats:<name>')
    // enable default quantiles for quantiles == true
    if (options.quantiles == true) options.quantiles = [0, 0.1, 0.5, 0.9, 1]

    // execute necessary runs
    const R = options.quantile_runs
    if (!(is_integer(R) && R > 0)) fatal('invalid option quantile_runs')
    const f = this.domain // sampler domain function
    let o = omit(options, [
      'log',
      'plot',
      'table',
      'quantiles',
      'targets',
      'workers',
      'async',
    ]) // same as in _targets
    o.warn = false
    o.updates = o.min_updates = o.max_updates = this.u // fix update steps
    const sR = [this.stats, ...array(R - 1, r => new _Sampler(f, o).stats)]
    if (options.log) print(`completed ${R} quantile runs in ${this.t}ms`)

    // compute quantiles of global stats
    const qQ = options.quantiles
    if (!(is_array(qQ) && qQ.every(is_prob))) fatal('invalid option quantiles')
    const qR = n => quantiles(map(sR, n), qQ)

    const s = omit(this.stats, 'updates')
    const stats = map_values(s, (v, k) =>
      round_to(quantiles(map(sR, k), qQ), 2)
    )
    if (options.log) print(str(stats))

    // compute quantiles of update stats
    const sn = keys(options.stats)[0]
    const sUQ = apply(
      matrixify(transpose(sR.map(sr => map(sr.updates, sn)))) /*sUR*/,
      suR => round_to(quantiles(suR, qQ), 2)
    )
    // print(str(sUQ))
    this.stats.updates = sUQ.map(suQ =>
      from_entries(qQ.map((qq, q) => ['q' + round(100 * qq), suQ[q]]))
    )
  }

  _table() {
    const { J, rwJ, xJK, pxJK } = this
    let value_table = []
    each(this.values, (value, k) => {
      let row = [value.name]
      const number = is_number(value.first)
      const nstr = x => round_to(x, 2)?.toFixed(2)
      const wtd_mean = (xJ, wJ) => dot(xJ, wJ) / sum(wJ)
      // get weighted prior and posterior & remove undefined values
      const pxJ = array(J, j => pxJK[j][k])
      const pwJ = copy(this.pwJ)
      let xJ = array(J, j => xJK[j][k])
      const wJ = copy(rwJ)
      _remove_undefined(xJ, wJ)
      _remove_undefined(pxJ, pwJ)

      if (number) {
        const prior = wtd_mean(pxJ, pwJ)
        const post = wtd_mean(xJ, wJ)
        const delta = post - prior
        const [x_min, x_max] = min_max_in(xJ)
        row.push(`[${nstr(x_min)},${nstr(x_max)}]`)
        row.push(`${nstr(prior)} → ${nstr(post)}`)
        row.push((delta > 0 ? '+' : '') + nstr(delta))
      } else {
        scale(wJ, 1 / sum(wJ))
        _rank_aggregated(xJ, wJ)
        scale(pwJ, 1 / sum(pwJ))
        const pwX = _rank_aggregated(pxJ, pwJ)
        const j_best = _max_index_by(xJ.length, j => wJ[j])
        const x_post = xJ[j_best]
        const w_post = wJ[j_best]
        const w_prior = pwX.get(x_post)
        const delta = w_post - w_prior
        row.push(str(x_post))
        row.push(`${nstr(w_prior)} → ${nstr(w_post)}`)
        row.push((delta > 0 ? '+' : '') + nstr(delta))
      }

      value_table.push(row)
    })
    const stats = this.stats
    _this.write(table(value_table), '_md_values')

    const r = round_to(this.r, 3, inf, 'floor')
    const ess = round(this.ess)
    const lwr = round_to(this.lwr, 1)
    const lpx = round_to(this.lpx, 1)
    const mks = round_to(this.mks, 3)
    _this.write(
      table(
        entries({
          // always display r, ess, lwr, and mks at the top
          r,
          ess,
          lwr,
          lpx,
          mks,
          // also omit t since redundant and confusable w/ x.t
          ...omit(last(stats.updates), ['t', 'r', 'ess', 'lwr', 'lpx', 'mks']),
        })
      ),
      '_md_last_update'
    )
    _this.write(
      table(
        entries({
          updates: stats.updates ? stats.updates.length - 1 : 0,
          ...pick_by(stats, is_number),
          workers: this.workers?.length ?? 0,
        })
      ),
      '_md_stats'
    )
    _this.write(table(entries(stats.time.updates)), '_md_time_updates')
    _this.write(
      table(
        entries({
          time: this.t + this.init_time + this.pending_time,
          running: this.t,
          pending: this.pending_time,
          init: this.init_time,
          ...pick_by(stats.time, is_number),
          pps: round((1000 * stats.proposals) / stats.time.updates.move),
          aps: round((1000 * stats.accepts) / stats.time.updates.move),
        })
      ),
      '_md_time'
    )
    const prior_best = this.sample({ values: true, index: 'best', prior: true })
    const best = this.sample({ values: true, index: 'best' })
    const combined = transpose_objects(round_to([prior_best, best], 2))
    _this.write(table(entries(combined).map(row => flat(row))), '_md_best')
    _this.write(
      flat(
        '<style>',
        `#item table { font-size:80%; line-height:140%; white-space:nowrap; color:#aaa; font-family:'jetbrains mono', monospace }`,
        `#item table + br { display: none }`,
        `#item table { display: inline-block; vertical-align:top; margin-right:10px; margin-bottom:10px }`,
        `#item table:first-of-type { display: table }`,
        `#item table:first-of-type td:not(:first-child) { padding-left:15px }`,
        '</style>'
      ).join('\n'),
      '_html'
    )
  }

  _plot() {
    const updates = this.stats?.updates
    if (updates) {
      const spec = this.options.stats
      let quantiles
      if (this.options.quantiles)
        quantiles = this.options.quantiles.map(q => 'q' + round(100 * q))

      // y is logarithmic ks p-value axis
      // y2 is linear percentage axis
      // stats that do not fit either are rescaled to 0-100 and plotted on y2
      const y_ticks = range(8).map(e => round_to(log2(`1e${e}`), 2))
      const y_labels = ['1', '10', '10²', '10³', '10⁴', '10⁵', '10⁶', '10⁷']

      const values = []
      const series = []
      const formatters = {}
      // function for adding line to plot
      const add_line = (prop, options = {}) => {
        if (quantiles && !quantiles.includes(prop)) {
          each(quantiles, k => add_line(k, omit(options, 'label')))
          return
        }
        const f = options.mapper ?? (x => x)
        values.push(updates.map(su => f(get(su, prop))))
        options.label ??= prop
        options.axis ??= 'y'
        if (options.formatter) formatters[prop] = options.formatter
        if (options.formatter_context)
          formatters[prop].__context = options.formatter_context
        series.push(omit(options, ['mapper', 'formatter', 'formatter_context']))
      }
      // function for adding a "rescaled" line to y2 axis of plot
      const add_rescaled_line = (n, range, d = 1, s = inf) => {
        if (quantiles && !quantiles.includes(prop)) {
          // push quantile series instead, rescaling across all quantiles
          const [a, b] = range ?? min_max_in(flat(updates.map(_.values)))
          each(quantiles, k => add_rescaled_line(k, [a, b]))
          return
        }
        // note we ignore infinite values for computing range
        const [a, b] = range ?? min_max_in(map(updates, n).filter(is_finite))
        const _n = n.replace(/\./g, '_') // periods don't work well w/ context
        add_line(n, {
          axis: 'y2',
          mapper: x => round_to((100 * (x - a)) / max(b - a, 1e-6), d, s),
          formatter: clean_eval(
            `(x => round_to((x / 100) * (${_n}_b - ${_n}_a) + ${_n}_a, ${d}, ${s}))`
          ),
          formatter_context: { [`${_n}_a`]: a, [`${_n}_b`]: b },
        })
      }

      if (spec.mks)
        add_line('mks', {
          formatter: x =>
            (2 ** x < 1000 ? round_to(2 ** x, 2) : '>10^' + ~~log10(2 ** x)) +
            ` (${x})`,
        })
      if (spec.tks) add_line('tks')
      if (spec.ess)
        add_line('ess', {
          axis: 'y2',
          mapper: x => round_to((100 * x) / this.J, 1),
          formatter: x => `${x}%`,
        })
      if (spec.essu)
        add_line('essu', {
          axis: 'y2',
          mapper: x => round_to((100 * x) / this.J, 1),
          formatter: x => `${x}%`,
        })
      if (spec.essr) add_line('essr', { axis: 'y2', formatter: x => `${x}%` })
      if (spec.mar) add_line('mar', { axis: 'y2', formatter: x => `${x}%` })
      if (spec.r)
        add_line('r', {
          axis: 'y2',
          mapper: x => round_to(100 * x, 1),
          formatter: x => round_to(x / 100, 3),
        })

      each(this.nK, n => {
        if (spec[`mar.${n}`])
          add_line(`mar.${n}`, { axis: 'y2', formatter: x => `${x}%` })
        if (spec[`uar.${n}`])
          add_line(`uar.${n}`, { axis: 'y2', formatter: x => `${x}%` })
        if (spec[`pp.${n}`])
          add_line(`pp.${n}`, { axis: 'y2', formatter: x => `${x}%` })
      })

      each(this.weights, weight => {
        if (spec[`r.${weight.name}`])
          add_line(`r.${weight.name}`, {
            axis: 'y2',
            mapper: x => round_to(100 * x, 1),
            formatter: x => round_to(x / 100, 3),
          })
      })

      if (spec.lwr) add_rescaled_line('lwr')
      if (spec.lpx) add_rescaled_line('lpx')
      if (spec.elw) add_rescaled_line('elw', null, 3)
      if (spec.elp) add_rescaled_line('elp', null, 3)
      let mlw_0_on_y // for grid line to indicate 0 level for mlw on y axis
      if (spec.mlw) {
        const [a, b] = min_max_in(map(updates, 'mlw'))
        add_rescaled_line('mlw', [a, b])
        mlw_0_on_y = (-a / max(b - a, 1e-6)) * last(y_ticks)
      }
      let mlp_0_on_y // for grid line to indicate 0 level for mlp on y axis
      if (spec.mlp) {
        const [a, b] = min_max_in(map(updates, 'mlp'))
        add_rescaled_line('mlp', [a, b])
        mlp_0_on_y = (-a / max(b - a, 1e-6)) * last(y_ticks)
      }
      if (spec.p) add_rescaled_line('p')
      if (spec.a) add_rescaled_line('a')
      if (spec.t) add_rescaled_line('t')

      each(this.nK, n => {
        if (spec[`up.${n}`]) add_rescaled_line(`up.${n}`, null, 0)
        if (spec[`ua.${n}`]) add_rescaled_line(`ua.${n}`, null, 0)
        if (spec[`p.${n}`]) add_rescaled_line(`p.${n}`, null, 0)
        if (spec[`a.${n}`]) add_rescaled_line(`a.${n}`, null, 0)
        if (spec[`mean.${n}`]) add_rescaled_line(`mean.${n}`, null, 3)
        if (spec[`median.${n}`]) add_rescaled_line(`median.${n}`, null, 3)
      })

      plot({
        name: 'updates',
        title: `\`${this.u}\` updates in \`${this.t}ms\``,
        data: { values },
        renderer: 'lines',
        renderer_options: {
          series,
          data: {
            colors: {
              // weight-related stats are gray
              // elw/elp/lwr closely related, mlw/mlp is dashed to distinguish
              mlw: '#666',
              mlp: '#666',
              elw: '#666',
              elp: '#666',
              lwr: '#666',
              ...from_pairs(
                quantiles?.map(q => [
                  q,
                  q == 'q50'
                    ? '#ddd'
                    : q == 'q0' || q == 'q100'
                    ? '#444'
                    : '#777',
                ])
              ),
            },
          },
          axis: {
            y: {
              show: series.some(s => s.axis === 'y'),
              min: 0,
              max: last(y_ticks),
              tick: {
                values: y_ticks,
                format: assign(y => y_labels[round(log10(2 ** y))] ?? '?', {
                  __context: { y_labels },
                }),
              },
            },
            y2: {
              show: series.some(s => s.axis === 'y2'),
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
              value: assign((v, _, n) => formatters[n]?.(v) ?? v, {
                __context: { formatters },
              }),
            },
          },
          grid: {
            y: {
              lines:
                spec.mks || spec.tks
                  ? compact([
                      { value: 1, class: 'accept strong' },
                      { value: round_to(log2(10), 2), class: 'accept' },
                      { value: round_to(log2(100), 2), class: 'accept weak' },
                      mlw_0_on_y
                        ? { value: round_to(mlw_0_on_y, 2), class: 'mlw' }
                        : null,
                      mlp_0_on_y
                        ? { value: round_to(mlp_0_on_y, 2), class: 'mlp' }
                        : null,
                    ])
                  : [],
            },
          },
          // point: { show: false },
          padding: { right: 50, left: spec.mks || spec.tks ? 35 : 10 },
          styles: [
            `#plot .c3-ygrid-line line { opacity: 1 !important }`,
            `#plot .c3-ygrid-line.accept line { opacity: .1 !important; stroke:#0f0; stroke-width:5px }`,
            `#plot .c3-ygrid-line.strong line { opacity: .25 !important }`,
            `#plot .c3-ygrid-line.weak line { opacity: .05 !important }`,
            `#plot .c3-target path { stroke-width:2px }`,
            `#plot .c3-target { opacity:1 !important }`,
            // dashed line, grid line legend, and tooltip for mlw/mlp
            `#plot :is(.c3-target-mlw,.c3-target-mlp) path { stroke-dasharray:5,3; }`,
            `#plot :is(.c3-ygrid-line.mlw,.c3-ygrid-line.mlp) line { opacity: 1 !important; stroke-dasharray:5,3;}`,
            `#plot :is(.c3-legend-item-mlw,.c3-legend-item-mlp) line { stroke-dasharray:2,2; }`,
            `#plot :is(.c3-tooltip-name--mlw, c3-tooltip-name--mlp) span { background: repeating-linear-gradient(90deg, #666, #666 2px, transparent 2px, transparent 4px) !important }`,
          ],
        },
        dependencies: ['#_c3'],
      })
    }

    // plot posteriors (vs priors and targets if specified)
    // if plot is specified as string or array, use it to filter values by name
    let plot_names
    if (is_string(this.options.plot))
      plot_names = new Set(this.options.plot.split(/\W+/))
    else if (is_array(this.options.plot)) {
      if (!every(this.options.plot, is_string)) fatal('invalid option plot')
      plot_names = new Set(this.options.plot)
    }
    const { J, rwJ, xJK, pxJK } = this
    each(this.values, (value, k) => {
      // use value name as plot name but replace non-alphanum w/ underscore
      const name = value.name.replace(/\W/g, '_').replace(/^_+|_+$/g, '')

      // filter by plot name if names are specified
      if (plot_names && !plot_names.has(name)) return

      // skip non-primitive values
      // note we now convert to string below instead
      // sample_array can be used to treat elements as values
      // if (!is_primitive(value.first)) return // value not primitive

      // get prior w/ weights
      const pxJ = array(J, j => pxJK[j][k])
      apply(pxJ, x => (is_primitive(x) ? x : str(round_to(x, 2))))
      const pwJ = copy(this.pwJ)
      // we remove undefined and rescale weights to J for all samples
      _remove_undefined(pxJ, pwJ)
      if (pwJ.length == 0) warn('missing prior samples to plot ' + name)
      scale(pwJ, J / sum(pwJ)) // rescale to sum to J

      // get posterior w/ weights
      const xJ = array(J, j => xJK[j][k])
      apply(xJ, x => (is_primitive(x) ? x : str(round_to(x, 2))))
      const wJ = copy(rwJ)
      _remove_undefined(xJ, wJ)
      if (wJ.length == 0) warn('missing posterior samples to plot ' + name)
      scale(wJ, J / sum(wJ)) // rescale to sum to J

      if (!value.target) {
        hist([pxJ, xJ], { weights: [pwJ, wJ] }).hbars({
          name,
          series: [
            { label: 'prior', color: '#555' },
            { label: 'posterior', color: '#d61' },
          ],
          delta: true, // append delta series
        })
        return
      }

      if (is_function(value.target)) {
        warn(`cdf target not yet supported for value '${name}'`)
        return // cdf target not supported yet
      }

      // get target sample w/ weights
      const yT = value.target
      const wT = array(value.target.length, 1)
      if (value.target_weights) copy(wT, value.target_weights)
      _remove_undefined(yT, wT)
      if (wJ.length == 0) warn('missing target samples to plot ' + name)
      scale(wT, J / sum(wT)) // rescale to sum to J

      hist([pxJ, xJ, yT], { weights: [pwJ, wJ, wT] }).hbars({
        name,
        series: [
          { label: 'prior', color: '#555' },
          { label: 'posterior', color: '#d61' },
          { label: 'target', color: '#6a6' },
        ],
        delta: true, // append delta series
      })
    })
  }

  get t() {
    return Date.now() - this.start_time - this.init_time - this.pending_time
  }

  get r() {
    return this.N == 0 ? 1 : min_in(this.rN)
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
    const rwJ_agg = (this.___rwJ_agg ??= array(J))
    fill(rwJ_agg, 0)
    each(jJ, (jj, j) => (rwJ_agg[jj] += rwJ[j]))
    return rwJ_agg
  }

  __counts() {
    const { J, jJ } = this
    const counts = (this.___counts ??= array(J))
    fill(counts, 0)
    each(jJ, jj => counts[jj]++)
    return counts
  }

  __rwX() {
    const { jJ, xJ, rwJ_agg } = this
    const rwX = (this.___rwX ??= new Map())
    for (const k of rwX.keys()) rwX.set(k, 0)
    each(jJ, (jj, j) => rwJ_agg[jj] == 0 || rwX.set(xJ[j], rwJ_agg[jj]))
    for (const [k, v] of rwX.entries()) if (v == 0) rwX.delete(k)
    return rwX
  }

  __stdevK() {
    const { J, K, xJK, rwJ } = this
    const stdevK = (this.___stdevK ??= array(K))
    return fill(stdevK, k => {
      const value = this.values[k]
      if (!value.sampled) return // value not sampled
      // return per-element stdev for arrays of numbers
      if (is_array(value.first) && is_finite(value.first[0])) {
        const R = value.first.length
        const stdevR = (stdevK[k] ??= array(R))
        if (!(stdevR.length == R))
          fatal('variable-length arrays not supported yet')
        let w = 0
        let sR = value._sR ?? array(R)
        let ssR = value._ssR ?? array(R)
        fill(sR, 0)
        fill(ssR, 0)
        for (let j = 0; j < J; ++j) {
          const wj = rwJ[j]
          if (wj == 0) continue // skip run
          const xjkR = xJK[j][k]
          if (xjkR === undefined) continue // skip run
          w += wj
          addf(sR, xjkR, x => wj * x)
          addf(ssR, xjkR, x => wj * x * x)
        }
        if (w == 0) return // not enough samples/weight
        const mR = scale(sR, 1 / w)
        const vR = sub(scale(ssR, 1 / w), mul(mR, mR))
        if (!(vR.every(is_finite) && min_of(vR) >= -1e-6))
          fatal('bad variance', vR)
        apply(vR, v => (v < 1e-12 ? 0 : v)) // chop small stdev to 0
        return apply(vR, sqrt)
      }
      if (!is_number(value.first)) return // value not number
      let w = 0
      let s = 0
      let ss = 0
      for (let j = 0; j < J; ++j) {
        const wj = rwJ[j]
        if (wj == 0) continue // skip run
        const xjk = xJK[j][k]
        if (xjk === undefined) continue // skip run
        w += wj
        s += wj * xjk
        ss += wj * xjk * xjk
      }
      if (w == 0) return // not enough samples/weight
      const m = s / w
      const v = ss / w - m * m
      if (!(is_finite(v) && v >= -1e-6)) fatal('bad variance', v)
      if (v < 1e-12) return 0 // stdev too small, return 0 to be dealt with
      return sqrt(v)
    })
  }

  __ess() {
    const ε = 1e-6
    // for official ess, we require unscaled_rwj_sum to be >=ε
    // in particular this means ess=0 if all weights go to 0 (or -inf)
    const unscaled_rwj_sum = sum(this.log_rwJ, exp)
    return unscaled_rwj_sum < ε ? 0 : this.rwj_ess
  }

  __elw() {
    const { J, rwJ, rwj_sum, log_wrfJN } = this
    const log_wJ = (this.___elw_log_wJ ??= array(J))
    fill(log_wJ, j => sum(log_wrfJN[j], f => f?.(1) ?? 0))
    const z = 1 / rwj_sum
    return sum(log_wJ, (log_wj, j) => {
      if (rwJ[j] == 0) return 0 // take 0 * -inf == 0 instead of NaN
      return log_wj * rwJ[j] * z
    })
  }

  __elp() {
    const { rwJ, rwj_sum, log_p_xJK } = this
    const z = 1 / rwj_sum
    return sum(log_p_xJK, (log_p_xjK, j) => {
      if (rwJ[j] == 0) return 0 // take 0 * -inf == 0 instead of NaN
      return sum(log_p_xjK) * rwJ[j] * z
    })
  }

  __tks() {
    const timer = _timer_if(this.stats)
    const { J, K, xJK, rwJ, rwj_uniform, rwj_sum, values, stats } = this
    // compute ks1_test or ks2_test for each value w/ target
    const xJ = (this.___tks_xJ ??= array(J))
    const wJ = (this.___tks_wJ ??= array(J))
    const wJy = (this.___tks_wJy ??= array(J))
    const pK = (this.___tks_pK ??= array(K))
    fill(pK, k => {
      const value = values[k]
      if (!value.target) return undefined // no target
      copy(xJ, xJK, xjK => xjK[k])
      if (is_function(value.target)) {
        // use ks1_test for cdf target
        return ks1_test(xJ, value.target, {
          wJ: rwj_uniform ? undefined : rwJ,
          wj_sum: rwj_uniform ? undefined : rwj_sum,
          filter: true, // filter undefined
        })
      }
      if (!rwj_uniform) copy(wJ, rwJ) // since ks2 can modify wJ

      // copy target sample arrays also since ks2 can modify
      const yT = (this.___tks_yT ??= array(value.target.length))
      copy(yT, value.target)
      if (value.target_weights) copy(wJy, value.target_weights)

      // use ks2_test for sample target
      return ks2_test(xJ, yT, {
        wJ: rwj_uniform ? undefined : wJ,
        wj_sum: rwj_uniform ? undefined : rwj_sum,
        wK: value.target_weights ? wJy : undefined,
        wk_sum: value.target_weight_sum,
        filter: true, // filter undefined
        numberize: !is_number(value.first), // map to random numbers
      })
    })
    const pR = pK.filter(defined)
    if (stats) stats.time.updates.tks += timer.t
    // minimum p-value ~ Beta(1,R) so we transform as beta_cdf(p,1,R)
    return -log2(beta_cdf(min_in(pR), 1, pR.length))
  }

  __mks() {
    const timer = _timer_if(this.stats)
    const { u, J, K, uB, xBJK, log_p_xBJK, rwBJ, rwBj_sum, xJK, uaJK } = this
    const { log_p_xJK, rwJ, rwj_sum, stats } = this
    const { mks_tail, mks_period } = this.options

    // trim mks sample buffer to cover desired tail of updates
    // note last buffered update can be within < mks_period steps
    // so we always include that, plus specified "tail" of updates
    if (xBJK.length < 2) return inf // not enough updates yet
    if (mks_tail < 0 || (mks_tail >= 1 && !is_integer(mks_tail)))
      fatal(`invalid mks_tail ${mks_tail}, must be <1 or integer ≥1`)
    const B = min(
      xBJK.length,
      1 + (is_integer(mks_tail) ? mks_tail : ceil((u * mks_tail) / mks_period))
    )
    while (xBJK.length > B) {
      uB.shift()
      xBJK.shift()
      log_p_xBJK.shift()
      rwBJ.shift()
      rwBj_sum.shift()
    }

    const xJ = (this.___mks_xJ ??= array(J))
    const yJ = (this.___mks_yJ ??= array(J))
    const log_p_xJ = (this.___mks_log_p_xJ ??= array(J))
    const log_p_yJ = (this.___mks_log_p_yJ ??= array(J))
    const wJ = (this.___mks_wJ ??= array(J))
    // buffers to copy wJ and rwBJ[0] inside loop since ks2 can modify
    const wJk = (this.___mks_wJk ??= array(J))
    const rwbJk = (this.___mks_rwbJk ??= array(J))

    // unless optimizing, use only samples fully updated since buffered update
    // cancel if updated samples do not have at least 1/2 weight
    if (this.optimizing) copy(wJ, rwJ)
    else copy(wJ, rwJ, (w, j) => (min_in(uaJK[j]) > uB[0] ? w : 0))
    const wj_sum = sum(wJ)
    if (wj_sum < 0.5 * rwj_sum) return inf // not enough samples/weight
    const wj_uniform = _uniform(wJ, wj_sum)

    const pR2 = fill((this.___mks_pK2 ??= array(K)), k => {
      const value = this.values[k]
      if (!value.sampled) return // value not sampled
      if (!is_primitive(value.first)) return // value not primitive
      copy(xJ, xJK, xjK => xjK[k])
      copy(yJ, xBJK[0], yjK => yjK[k])
      copy(log_p_xJ, log_p_xJK, log_p_xjK => log_p_xjK[k])
      copy(log_p_yJ, log_p_xBJK[0], log_p_yjK => log_p_yjK[k])
      return [
        ks2_test(xJ, yJ, {
          wJ: wj_uniform ? undefined : copy(wJk, wJ),
          wj_sum: wj_uniform ? undefined : wj_sum,
          wK: rwBJ[0] ? copy(rwbJk, rwBJ[0]) : undefined,
          wk_sum: rwBj_sum[0],
          filter: true, // filter undefined
          numberize: !is_number(value.first), // map to random numbers
        }),
        ks2_test(log_p_xJ, log_p_yJ, {
          wJ: wj_uniform ? undefined : copy(wJk, wJ),
          wj_sum: wj_uniform ? undefined : wj_sum,
          wK: rwBJ[0] ? copy(rwbJk, rwBJ[0]) : undefined,
          wk_sum: rwBj_sum[0],
        }),
      ]
    }).filter(defined)
    // print('mks_pK:', str(zip_object(this.nK, round_to(this.___mks_pK2, 3))))

    if (stats) stats.time.updates.mks += timer.t
    const R = pR2.length
    if (R == 0) return inf
    // note there are many dependencies in the statistics, especially between x and log_p for same value (k), so we take min across post-beta adjustment
    return -log2(min_in(transpose(pR2).map(pR => beta_cdf(min_in(pR), 1, R))))
  }

  sample_index(options) {
    if (options?.prior) {
      const { J, pwj_uniform, pwJ, pwj_sum } = this
      return pwj_uniform
        ? random_discrete_uniform(J)
        : random_discrete(pwJ, pwj_sum)
    }
    const { J, rwj_uniform, rwJ, rwj_sum } = this
    return rwj_uniform
      ? random_discrete_uniform(J)
      : random_discrete(rwJ, rwj_sum)
  }

  sample_indices(jR, options) {
    if (options?.prior) {
      const { J, pwj_uniform, pwJ, pwj_sum } = this
      return pwj_uniform
        ? random_discrete_uniform_array(jR, J)
        : random_discrete_array(jR, pwJ, pwj_sum)
    }
    const { J, rwj_uniform, rwJ, rwj_sum } = this
    return rwj_uniform
      ? random_discrete_uniform_array(jR, J)
      : random_discrete_array(jR, rwJ, rwj_sum)
  }

  sample_values(options) {
    const prior = options?.prior
    const xJK = prior ? this.pxJK : this.xJK
    if (options?.index == 'best')
      options.index = prior ? this.best_prior_index : this.best_index
    const j = options?.index ?? this.sample_index(options)
    switch (options?.format) {
      case 'array':
        return xJK[j]
      case 'object':
      default:
        return assign(zip_object(this.nK, xJK[j]), { _index: j })
    }
  }

  sample_sync(options) {
    const prior = options?.prior
    const xJK = prior ? this.pxJK : this.xJK
    const xJ = prior ? this.pxJ : this.xJ
    if (options?.index == 'best')
      options.index = prior ? this.best_prior_index : this.best_index
    const j = options?.index ?? this.sample_index(options)
    let props
    if (options?.details) {
      if (prior) {
        props = {
          _prior: undefined,
          _weight: undefined,
          _posterior: undefined,
          _importance: this.pwJ[j],
          _importance_agg: this.pwJ[j],
        }
      } else {
        const px = sum(this.log_p_xJK[j])
        props = {
          _prior: px - this.min_prior,
          _weight: this.log_wrJ[j] - this.min_weight,
          _posterior: px + this.log_wrJ[j] - this.min_posterior,
          _importance: this.rwJ[j],
          _importance_agg: this.rwJ_agg[this.jJ[j]],
        }
      }
    }
    if (options?.values) {
      switch (options?.format) {
        case 'array':
          return [...xJK[j], xJ[j]]
        case 'object':
        default:
          return assign(this.sample_values(options), {
            _output: xJ[j],
            _index: j,
            ...props,
          })
        // default:
        //   return [xJ[j], this.sample_values(options)]
      }
    } else if (options?.output) {
      return { _output: xJ[j], _weight: w, _index: j }
    }
    return xJ[j]
  }

  sample(options) {
    if (options.async) {
      return invoke(async () => {
        await this._init_promise
        return this.sample_sync(options)
      })
    }
    return this.sample_sync(options)
  }

  // TODO: list input/output state for all replacement methods below!
  // TODO: isolate 'this' to top of function, document all properties

  _sample(k, domain, opt, array_k0, array_len) {
    const {
      options, // in, not to be confused w/ 'opt' for sample-specific options
      values, // in-out, first sampling special, value.domain non-cloneable
      names, // in-out, first sampling only
      nK, // in-out, first sampling only
      J, // in
      j, // in
      xJK, // in-out, in if forking or moving
      log_pwJ, // out, non-moving only
      yJK, // in-out, moving only, in if forking
      log_mwJ, // out, moving only
      log_mpJ, // in-out, moving only, used to shortcut (undefined) for -inf
      moving, // in
      forking, // in
      upJK, // out, moving only
      uaJK, // in, moving only
      uawK, // in, moving only
      upwK, // internal, moving only, computed at pivot value
      log_p_xJK, // in-out, in if forking or moving
      log_p_yJK, // out, moving only
    } = this

    const value = values[k]
    if (value.called) fatal('sample(…) invoked dynamically (e.g. inside loop)')
    value.called = true

    // return undefined on nullish (undefined or null=empty) domain
    if (is_nullish(domain)) return undefined

    // if "forking", return existing sampled values
    // note forking is for non-sampled random values/weights only
    // sampled random values can be forked explicitly if needed
    // TODO: disallow or handle non-sampled randomized domains, e.g. using domJK
    if (forking) return moving ? yJK[j][k] : xJK[j][k]

    // return undefined on (effectively) rejected run if sampling posterior
    if (moving && min(log_mwJ[j], log_mpJ[j]) == -inf) return undefined

    // initialize on first call
    if (!value.sampled) {
      value.sampled = true

      // process name if specified in sample options (only on first call)
      // handle sample_array case (w/ k0,len), and string/array shorthands
      if (
        opt &&
        (opt.name ||
          is_string(opt) ||
          (defined(array_k0) && (opt.names || opt.every?.(is_string))))
      ) {
        let name
        if (defined(array_k0)) {
          if (opt.names) name = opt.names[k - array_k0]
          if (is_string(opt)) opt = opt.split(/\W+/)
          if (!is_array(opt)) fatal(`invalid options ${str(opt)}`)
          if (!(opt.length == array_len))
            fatal(`name (options) array size mismatch`)
          name = opt[k - array_k0]
        } else name = opt.name ?? opt
        if (!is_string(name)) fatal(`invalid name '${name}' for sampled value`)
        if (!name) fatal(`blank name for sampled value at index ${k}`)
        if (name.match(/^\d/))
          fatal(`invalid numeric name '${name}' for sampled value`)
        value.name = name
        if (names.has(value.name)) value.name += '_' + value.index
        names.add(value.name)
        nK[k] = value.name
      }

      const { index, name, args } = value
      const line = `line ${value.line_index}: ${value.line.trim()}`

      // process target if specified
      const target = opt?.target ?? options.targets?.[name]
      if (target) {
        const timer = _timer_if(options.log)
        value.target = target
        // sample from sampler domain (_prior)
        if (value.target?._prior) {
          const T = opt?.size ?? J
          const xT = array(T)
          let log_wT // weight array allocated below if needed
          const prior = value.target._prior
          fill(xT, t =>
            prior((x, log_pw = 0) => {
              if (log_pw) {
                log_wT ??= array(T, 0)
                log_wT[t] += log_pw
              }
              return x
            })
          )
          value.target = xT
          if (log_wT) {
            value.target_weights = apply(log_wT, exp)
            value.target_weight_sum = sum(value.target_weights)
          }
          if (options.log) print(`sampled ${T} target values in ${timer}`)
        } else {
          if (!is_function(value.target) && !is_array(value.target))
            fatal(`invalid target @ ${line}`)
          if (defined(opt?.size)) fatal(`unexpected size option @ ${line}`)
        }
      } else {
        if (defined(opt?.size)) fatal(`unexpected size option @ ${line}`)
      }

      // log sampled value
      if (options.log) {
        let target = ''
        if (is_array(value.target))
          target =
            ` --> target sample size=${value.target.length}, ` +
            `mean=${round_to(mean(value.target), 3)}`
        else if (is_function(value.target))
          target = ` --> target cdf ${str(value.target)}`
        print(`[${index}] ${name ? name + ' = ' : ''}sample(${args})${target}`)
      }
    }

    // init sampler for function domain
    // reuse parameter-free samplers across sample calls (via value.domain)
    // also require full ess since that is assumed by posterior sampler
    // TODO: disallow or handle changes to sampler function
    //       i.e. value.domain.domain should match domain
    if (is_function(domain)) {
      domain = value.domain ?? new _Sampler(domain, opt)
      if (size(opt?.params) == 0 && !value.domain)
        define(value, 'domain', { value: domain }) // non-enumerable
      if (!approx_equal(domain.ess, domain.J, 1e-3))
        fatal('sampler domain failed to achieve full ess')
    }

    // require prior and log_p to be defined via domain or options
    // note we do not auto-wrap as constant(domain) for now
    const prior = opt?.prior ?? domain._prior
    if (!prior) fatal('missing prior sampler (_prior)')
    const log_p = opt?.log_p ?? domain._log_p
    if (!log_p) fatal('missing prior density (_log_p)')

    // if not moving, sample from prior into xJK
    // prior sample weights (if any) are stored in log_pwJ
    // prior sampling density is stored in log_p_xJK
    // first defined value is stored in value.first
    if (!moving) {
      return prior((x, log_pw = 0) => {
        log_pwJ[j] += log_pw
        log_p_xJK[j][k] = log_p(x)
        value.first ??= x // save first defined value
        return (xJK[j][k] = x)
      })
    }

    // if moving, sample into yJK by resampling from existing runs xJK
    // run "y" is resampled from run "x" starting at "pivot" value
    // pivot value is either posterior "pivoted" or prior "jumped"
    // once past pivot, values can be "reused" or "jumped"
    const xjk = xJK[j][k]
    const yjK = yJK[j]
    const log_p_yjK = log_p_yJK[j]
    const log_p_xjk = log_p_xJK[j][k]
    const k_pivot = this.kJ[j]

    // if before pivot value, stay at xjk
    // before pivot means "not at pivot and pivot is unsampled"
    // condition k<=k_pivot is NOT reliable since sampling order can vary
    if (k != k_pivot && yjK[k_pivot] === undefined) {
      if (!(xjk !== undefined)) fatal('unexpected missing prior value')
      log_p_yjK[k] = log_p_xjk
      return (yjK[k] = xjk)
    }

    // if at pivot, compute jump weights for unsampled values based on uaJK
    // unsampled values are pivot + past-pivot values
    if (k == k_pivot) {
      // copy(upwK, uawK, (w, k) => (yjK[k] === undefined ? w : 0))
      copy(upwK, uaJK[j], (u, k) =>
        yjK[k] === undefined ? this.u - u || uawK[k] : 0
      )
      const s = sum(upwK)
      if (s) scale(upwK, 1 / s)
    }

    // if at or past pivot, resample "jump" value from prior
    // always resample if xjk is missing (can only happen past pivot)
    // always "jump" if log_p(xjk)==0, i.e. jump == stay
    // otherwise "stay" fails if xjk varies across runs since then log_p=-inf
    if (xjk === undefined || log_p_xjk == 0 || random_boolean(upwK[k])) {
      // if (xjk === undefined || k != k_pivot) {
      // if (xjk === undefined || k != k_pivot || random_boolean(0.5)) {
      // if (xjk === undefined || true) {
      upJK[j][k] = this.u // jump proposed (not yet accepted)
      return prior(y => {
        log_p_yjK[k] = log_p(y)
        // sampling from prior is equivalent to weighting by prior likelihood
        // log_mpJ[j] += log_p_yjK[k] - log_p_xjk
        value.first ??= x // save first defined value (in case xjk was undefined)
        return (yjK[k] = y)
      })
    }

    // if past pivot, stay at xjk but still add prior density ratio to log_mpJ
    // reject and return undefined for out-of-domain xjk
    if (k != k_pivot) {
      if (!from(xjk, domain)) {
        log_mpJ[j] = -inf
        return undefined
      }
      log_p_yjK[k] = log_p(xjk) // new log_p under pivot
      log_mpJ[j] += log_p_yjK[k] - log_p_xjk
      return (yjK[k] = xjk)
    }

    // if at k_pivot, move from xjk along posterior chain
    const posterior = opt?.posterior ?? domain._posterior
    if (!posterior) fatal('missing posterior sampler (_posterior)')
    // upJK[j][k] = this.u // jump proposed
    return posterior(
      (y, log_mw = 0) => {
        log_mwJ[j] += log_mw
        log_p_yjK[k] = log_p(y)
        log_mpJ[j] += log_p_yjK[k] - log_p_xjk
        return (yjK[k] = y)
      },
      xjk,
      this.stdevK[k]
    )
  }

  _predict(k, x, name) {
    const {
      values, // in-out
      j, // in
      u, // in
      xJK, // out
      upJK, // out
    } = this
    const value = values[k]
    if (!value.called && is_string(name)) {
      if (!name) fatal(`blank name for predicted value at index ${k}`)
      if (name.match(/^\d/))
        fatal(`invalid numeric name '${name}' for predicted value`)
      value.name = name
    }
    value.called = true
    // treat NaN (usually due to undefined samples) as undefined
    if (is_nan(x)) x = undefined
    value.first ??= x // used to determine type
    xJK[j][k] = x
    // treat as jump to simplify update-related logic, e.g. in __mks
    // value.sampled can also be used to treat predicted values differently
    upJK[j][k] = u
    return x
  }

  _condition(n, cond, log_wr = cond._log_wr) {
    if (cond.valueOf) cond = cond.valueOf() // unwrap object
    // note log_wr(1) supersedes (cond?0:-inf) as default log_w
    if (!log_wr) this._weight(n, cond ? 0 : -inf, r => log(cond || 1 - r))
    else this._weight(n, log_wr(1), log_wr)
    return cond
  }

  _weight(n, log_w, log_wr = log_w._log_wr) {
    const {
      weights, // in-out
      j, // in
      // out, contains functions log_wr w/ properties
      //   _d, _log_p, _stats(r), _x, _base, _last
      log_wrfJN,
    } = this

    // treat NaN (usually due to undefined samples) as 0
    if (is_nan(log_w)) {
      log_w = 0
      log_wr = r => 0
    }
    const weight = weights[n]
    if (weight.called)
      fatal(
        'confine|maximize|minimize|condition|weight(…) ' +
          'invoked dynamically (e.g. inside loop)'
      )
    weight.called = true
    if (log_w.valueOf) log_w = log_w.valueOf() // unwrap object
    log_wr ??= r => r * log_w // note r>0
    // note we require log_wr(1) == log_w
    if (log_wr(1) != log_w)
      fatal(`log_wr(1)=${log_wr(1)} does not match log_w=${log_w}`)
    log_wrfJN[j][n] = log_wr
    return log_w
  }

  _confine(n, x, domain) {
    // reject outright on nullish (null=empty or undefined) domain
    // allows undefined/empty domains as in _sample
    if (is_nullish(domain)) return this._weight(n, -inf)

    const {
      weights, // in-out, contains function weight.init_log_wr
      J, // in
      log_wrfJN, // in-out, used _async_ in weight.init_log_wr when invoked
    } = this

    const weight = weights[n]
    const c = from(x, domain)
    const d = distance(x, domain) ?? 0 // take 0 if undefined
    const log_p = density(x, domain) ?? 0 // take 0 (improper) if undefined
    const dJ = (weight.dJ ??= array(J))
    const log_pJ = (weight.log_pJ ??= array(J))

    // debug(x, str(domain), d, log_p)
    if (!c) {
      if (d < 0) fatal(`negative distance (outside domain)`)
      if (log_p > -inf) fatal(`positive density ${log_p} outside domain x=${x}`)
    } else if (d != 0) fatal(`non-zero distance ${d} inside domain`)

    // set up weight.init_log_wr
    weight.init_log_wr ??= r => {
      repeat(J, j => {
        const log_wr = log_wrfJN[j][n]
        dJ[j] = log_wr._d
        log_pJ[j] = log_wr._log_p
      })
      weight.stats = undefined // reset _stats (if any)
      repeat(J, j => {
        const log_wr = log_wrfJN[j][n]
        if (log_wr._stats) weight.stats ??= log_wr._stats()
      })
      // console.debug(str(weight.stats))
    }

    // if domain._log_wr is defined, wrap it to pass [c,d,log_p,dJ,log_pJ,stats]
    // otherwise define default log_wr w/ basic distance/density support
    let log_wr
    if (domain._log_wr) {
      log_wr = r => domain._log_wr(r, c, d, log_p, dJ, log_pJ, weight.stats)
    } else {
      log_wr = r => {
        // if (weight.cumulative) return r * log_p >= -10 ? 0 : -10
        // if (weight.cumulative) return (1 - r) * log_p
        if (r == 1) return d == 0 ? log_p : -inf // log_p vs 0 in default log_w
        if (d == 0) return r * log_p // inside OR unknown distance, note r>0
        const [z, b] = weight.stats // from _stats below
        return r * b + log(1 - r) * (1 + 100 * d * z)
      }
      log_wr._d = d // distance for scaling factor z
      log_wr._log_p = c ? log_p : inf // log_p for base offset b
      log_wr._stats = () => [
        1 / max_in(dJ), // 0 if all undefined
        (b => (b == inf ? 0 : b))(min_in(log_pJ)), // 0 if all undefined
      ]
    }

    // note log_wr(1) supersedes (cond?0:-inf) as default log_w
    this._weight(n, log_wr(1), log_wr)
    return x
  }

  _minimize(n, x, q = 0.5, _log_wr) {
    if (!(q > 0 && q < 1)) fatal(`invalid quantile ${q}`)
    return this._maximize(n, -x, 1 - q, _log_wr)
  }

  _maximize(n, x, q = 0.5, _log_wr) {
    const {
      weights, // in-out, contains function weight.init_log_wr
      J, // in
      // t, in, computed/used async as this.t in weight.inc_r
      // essu, in, computed/cached/used async as this.essu in log_wr
      options, // in
      log_wrfJN, // in-out, used _async_ in weight.init_log_wr when invoked
    } = this

    const weight = weights[n]
    if (!(q > 0 && q < 1)) fatal(`invalid quantile ${q}`)
    if (q != (weight.q ??= q)) fatal(`quantile ${q} modified from ${weight.q}`)

    // initialize on first call w/o init_log_wr set up
    if (!weight.init_log_wr) {
      weight.xJ ??= array(J)
      weight.optimizing = true
      weight.minimizing = weight.method == 'minimize'
      // increase r based on time
      // opt_time is for optimization, remaining time is to achieve min_ess
      weight.max_time = options.time || options.max_time
      weight.opt_time = options.opt_time ?? weight.max_time / 2
      weight.opt_penalty = options.opt_penalty ?? -5
      weight.inc_r = r => min(1, this.t / weight.opt_time)
      // weight.inc_r = r =>
      //   this.ess >= (1 - q) * J ? min(1, this.t / weight.opt_time) : r
      weight.init_log_wr = r => {
        repeat(J, j => {
          const log_wr = log_wrfJN[j][n]
          weight.xJ[j] = log_wr._x
        })
        weight.stats = undefined
        repeat(J, j => {
          const log_wr = log_wrfJN[j][n]
          if (log_wr._stats) weight.stats ??= log_wr._stats(r)
        })
        // console.debug(str(weight.stats))
      }
    }

    // if log_wr is given, wrap it to pass [xJ,stats]
    // otherwise define default log_wr w/ basic optimization support
    let log_wr
    if (_log_wr) {
      log_wr = r => _log_wr(r, xJ, weight.stats)
    } else {
      log_wr = r => {
        if (!weight.stats) return 0 // always 0 before stats init
        const [xq] = weight.stats
        return x >= xq ? 0 : weight.opt_penalty
      }
      log_wr._x = x // value x for stats
      log_wr._stats = r => {
        // const rr = pow(r, 1)
        // const qa = 0.5 * (1 - rr) + q * rr
        // const qb = qa < .5 ? qa : max(.5, 1 - (1 - qa) * (J / this.essu))
        const qq = q < 0.5 ? q : max(0.5, 1 - (1 - q) * (J / this.essu))
        return quantiles(weight.xJ, [qq]) // => ess=(1-q)
      }
    }

    this._weight(n, log_wr(1), log_wr)

    // also _predict and return value, negating for minimization
    if (weight.minimizing) {
      this._predict(weight.value_index, -x)
      return -x
    } else {
      this._predict(weight.value_index, x)
      return x
    }
  }

  _sample_array(k, J, xJ, domain, options) {
    if (!is_array(xJ))
      fatal('invalid non-array second argument for sample_array')
    if (!(xJ.length == J)) fatal('array size mismatch for sample_array')
    const domain_fj = is_function(domain) ? domain : j => domain
    let sum_xj = 0 // partial sum
    return fill(xJ, j => {
      const xj = this._sample(k + j, domain_fj(j, J, sum_xj), options, k, J)
      sum_xj += xj
      return xj
    })
  }

  _confine_array(n, J, xJ, domain) {
    if (!is_array(xJ))
      fatal('invalid non-array second argument for confine_array')
    if (!(xJ.length == J)) fatal('array size mismatch for confine_array')
    const domain_fj = is_function(domain) ? domain : j => domain
    return each(xJ, (x, j) => this._confine(n + j, x, domain_fj(j, J)))
  }

  _simulate(s, ...args) {
    const {
      sims, // out
      J, // in
    } = this
    const sim = sims[s]
    // for J==1 (debug mode), store sim.xt
    if (J == 1) return (sim.xt = simulate(...args))
    return simulate(...args)
  }

  _accumulate() {
    if (arguments.length > 0) return arguments[0]
    else return arguments
  }
} // class _Sampler

// define _SamplerSync from _Sampler by dropping async|await keywords
// regex pattern avoids matches inside strings and comments
const _SamplerSync = eval(
  '(' +
    _Sampler
      .toString()
      .replace(/^class _Sampler/, 'class _SamplerSync')
      .replace(
        /`.*?`|'[^\n]*?'|"[^\n]*?"|\/\/[^\n]*|\/\*.*?\*\/|(?:^|\s)(?:async|await)\s+/g,
        m => m.replace(/(?:async|await)\s+$/, '') // drop async|await... suffix
      ) +
    ')'
)

function _run() {
  _this.log_options.source = 'self' // exclude background logs (for async runs)
  const js = read('js_input').trim()
  // if js begins w/ sample(...) call, assume no wrapper is needed
  if (js.match(/^sample *\(/)) return null
  // if js contains any sample|simulate|sample_array call, then wrap inside sample(...)
  // note this could match inside comments or strings
  if (!js.match(/\b(?:sample|sample_array|simulate) *\(/)) return null
  print('running inside sample(…) due to sampled or simulated values')
  const func = clean_eval(flat('(context=>{', js, '})').join('\n'))
  const options = {}
  if (typeof _sample_options == 'object') merge(options, _sample_options)
  return sample(func, options)
}
