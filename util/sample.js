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
  assert(is_object(domain), `unknown domain ${domain}`)
  return keys(domain).every(key => {
    switch (key) {
      case 'via':
        assert(is_function(domain.via), `invalid 'via' domain ${domain.via}`)
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
        assert(key[0] == '_', `invalid domain property '${key}'`)
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
  assert(is_object(domain), `unknown domain ${domain}`)
  if (empty(domain)) return null // everything -> empty
  let domains = keys(domain).map(key => {
    switch (key) {
      case 'via':
        assert(is_function(domain.via), `invalid 'via' domain ${domain.via}`)
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
        assert(key[0] == '_', `invalid domain property '${key}'`)
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
      assert(x.length == domain.length, 'array length mismatch for distance')
      const d = max_of(x, (xj, j) => distance(xj, domain[j]) ?? inf)
      return is_inf(d) ? undefined : d
    }
  }
  assert(is_object(domain), `unknown domain ${domain}`)
  if (domain._distance) return domain._distance(x)
  const d = max_of(keys(domain), key => {
    switch (key) {
      case 'via':
        assert(is_function(domain.via), `invalid 'via' domain ${domain.via}`)
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
        // min_of ignores undefined|inf so we have to check separately
        if (!domain.or.every(dom => defined(distance(x, dom)))) return inf
        return min_of(domain.or, dom => distance(x, dom))
      case 'not':
        const inverted = invert(domain.not) // attempt transform
        if (inverted.not) return inf // unable to transform (w/o not)
        return distance(x, inverted) ?? inf // distance to transformed domain
      default:
        assert(key[0] == '_', `invalid domain property '${key}'`)
    }
  })
  return is_inf(d) ? undefined : d
}

// density of `x` in `domain`
// _log-probability density_ `log_p` of sampling `x` from `domain`
// uses `domain._log_p` defined alongside `_prior` for _sampler domains_
// sampler domains are those that can be sampled as `sample(domain)`
// density always satisfies `p>0` inside, `p==0` outside `domain`
// `undefined` if `domain._log_p` is undefined
function density(x, domain) {
  if (!from(x, domain)) return -inf
  if (domain._log_p) return domain._log_p(x)
}

// sample `x` from `domain`
// random variable is denoted `X ∈ dom(X)`
// _prior model_ `P(X)` is defined or implied by `domain`
// can be _conditioned_ as `P(X|c)` using `condition(c)`
// can be _weighted_ as `∝ P(X) × W(X)` using `weight(…)`
// sampler function `domain` is passed new _sampler `context`_
// non-function `domain` requires outer `sample(context=>{ … })`
// _sampler domains_ specify default `domain._prior`, `._posterior`
// conditions/weights are scoped by outer `sample(context=>{ … })`
// samples are tied to _lexical context_, e.g. are constant in loops
// `options` for all domains:
// | `name`        | name of sampled value
// |               | default inferred from lexical context
// |               | e.g. `let x = sample(…) ≡ sample(…,{name:'x'})`
// | `prior`       | prior sampler `f => f(x,[log_pw=0])`
// |               | `x~S(X), log_pw=log(∝p(x)/s(x))`
// |               | _default_: `domain._prior`
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
// |               | _default_: `({ess,J}) => ess >= .9 * J`
// |               | default helps avoid extreme weights due to rapid reweights
// | `reweight_ess`| minimum `ess` after reweight, _default_: `10`
// | `min_reweights`| minimum number of reweight steps, _default_: `3`
// | `max_reweight_tries`| maximum reweight attempts per step, _default_: `100`
// | `resample_if` | resample predicate `context => …`
// |               | called once per update step `context.u = 0,1,…`
// |               | _default_: `({ess,essu,J}) => ess/essu < clip(essu/J,.5,1)`
// |               | default allows `ess→essu→J` w/ effective moves for `essu→J`
// | `move_while`  | move predicate `context => …`
// |               | called _until false_ every update step `context.u = 0,1,…`
// |               | `context.p` is proposed moves (current update step)
// |               | `context.a` is accepted moves (current update step)
// |               | `context.aK` is accepted moves per posterior "pivot" value
// |               | `context.aaK` is accepted moves per prior "jump" value
// |               | `context.m` is total move count (all update steps)
// |               | _default_: `({essu,J,K,a,aK,aaK}) => essu<.9*J ||`
// |               | `a < J || min_in(aK)<J/K || min_in(aaK)<J/K`
// |               | default allows `essu→J` w/ up to `J/10` slow-movers
// | `move_weights`| move weight function `(context, awK) => …`
// |               | _default_: `({aK,aaK},awK,aawK) => {`
// |               | `fill(awK, k=> max(0, J/K - aK[k] ));`
// |               | `fill(aawK,k=> max(0, J/K - aaK[k])) }`
// |               | default concentrates on deficiencies w.r.t. `move_while`
// | `max_updates` | maximum number of update steps, _default_: `1000`
// | `min_updates` | minimum number of update steps, _default_: `0`
// | `min_stable_updates` | minimum stable update steps, _default_: `1`
// | `min_unweighted_updates` | minimum unweighted update steps, _default_: `3`
// | `max_time`    | maximum time (ms) for sampling, _default_: `1000` ms
// | `min_time`    | minimum time (ms) for sampling, _default_: `0` ms
// | `min_ess`     | minimum `ess` desired (within `max_time`), _default_: `J/2`
// | `max_mks`     | maximum `mks` desired (within `max_time`)
// |               | `mks` is _move KS_ `-log2(ks2_test(from, to))`
// |               | _default_: `1` ≡ failure to reject same-dist at `ɑ<1/2`
// | `mks_tail`    | ratio (<1) of recent updates for `mks`, _default_: `1/2`
// | `mks_period`  | minimum update steps for `mks`, _default_: `1`
// | `updates`     | target number of update steps, _default_: auto
// |               | _warning_: can cause pre-posterior sampling w/o warning
// | `time`        | target time (ms) for sampling, _default_: auto
// |               | _warning_: can cause pre-posterior sampling w/o warning
// | `targets`     | object of targets for named values sampled in this context
// |               | see `target` option above for possible targets
// |               | can be `true` for auto-generated targets
// | `max_tks`     | maximum `tks` desired once updates are complete
// |               | `tks` is _target KS_ `-log2(ks1|2_test(sample, target))`
// |               | ignored if no targets specified via `target(s)` option
// |               | used only as diagnostic test, not as stopping condition
// |               | _default_: `5` ≡ failure to reject same-dist at `ɑ<1/32`
// | `params`      | object of parameters to be captured from parent context
function sample(domain, options = undefined) {
  // decline non-function domain which requires a parent sampler that would have replaced calls to sample(…)
  assert(
    is_function(domain),
    `invalid sample(…) call outside of sample(context=>{ … })`
  )
  // decline target for root sampler since that is no parent to track tks
  assert(!options?.target, `invalid target outside of sample(context=>{ … })`)
  return new _Sampler(domain, options).sample()
}

// confine `x` to `domain`
// `≡ condition(from(x, domain))`, see below
// uses `distance(x, domain)` for guidance outside `domain`
// uses `density(x, domain) ?? 0` as weights inside `domain`
// distances help w/ rare domains, densities w/ unbounded domains
// densities ensure consistency w/ sampling distribution of `sample(domain)`
function confine(x, domain) {
  fatal(`unexpected (unparsed) call to confine(…)`)
}

// condition samples on `cond` (`c`)
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

// is `wJ` uniform?
function _uniform(wJ, wj_sum = sum(wJ), ε = 1e-6) {
  const w_mean = wj_sum / wJ.length
  const [w_min, w_max] = [(1 - ε) * w_mean, (1 + ε) * w_mean]
  return wJ.every(w => w >= w_min && w <= w_max)
}

class _Timer {
  constructor() {
    this.start = Date.now()
  }
  toString() {
    return Date.now() - this.start + 'ms'
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
    this.options = options
    this.domain = func // save sampler function as domain
    this.start_time = Date.now()

    // parse sampled values and determine K
    assign(this, this._parse_func(func))
    const K = (this.K = this.values.length)
    const N = (this.N = this.weights.length)
    if (options.log) print(`parsed ${K} sampled values in ${this.func}`)

    // merge in default options
    const J = (this.J = options.size ?? 1000)
    assert(J > 0, `invalid sample size ${J}`)
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
        max_reweight_tries: 100,
        resample_if: ({ ess, essu, J }) => ess / essu < clip(essu / J, 0.5, 1),
        move_while: ({ essu, J, K, a, aK, aaK }) =>
          essu < 0.9 * J ||
          a < J ||
          min_in(aK) < J / K ||
          min_in(aaK) < 0.1 * (J / K),
        move_weights: ({ aK, aaK }, awK, aawK) => {
          fill(awK, k => max(0, J / K - aK[k]))
          fill(aawK, k => max(0, 0.1 * (J / K) - aaK[k]))
        },
        max_updates: 1000,
        min_updates: 0,
        min_stable_updates: 1,
        min_unweighted_updates: 3,
        max_time: 1000,
        min_time: 0,
        min_ess: J / 2,
        max_mks: 1,
        mks_tail: 1 / 2,
        mks_period: 1,
        max_tks: 5,
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

    this.kJ = array(J) // array of (posterior) pivot values in _move
    this.upJK = matrix(J, K) // last jump proposal step
    this.uaJK = matrix(J, K, 0) // last jump accept step
    this.upwK = array(K) // jump proposal weights (computed at pivot value)
    this.awK = array(K) // array of move weights by pivot value
    this.aawK = array(K) // array of move weights by jump value

    this.m = 0 // move count
    this.xBJK = [] // buffered samples for mks
    this.log_p_xBJK = [] // buffered sample log-densities for mks
    this.rwBJ = [] // buffered sample weights for mks
    this.rwBj_sum = [] // buffered sample weight sums for mks
    this.uB = [] // buffer sample update steps
    this.pK = array(K) // move proposals per pivot value
    this.aK = array(K) // move accepts per pivot value
    this.aaK = array(K) // move accepts per jump value
    this.log_pwJ = array(J) // prior log-weights per run
    this.log_wJ = array(J) // posterior log-weights
    this.log_wrfJN = matrix(J, N) // posterior log-weight relaxation functions
    this.rN = array(N) // relaxation parameters in [0,1]
    this.zN = array(N) // distance scaling factor for log_wr
    this.bN = array(N) // density base offset for log_wr
    this.log_wrJ = array(J) // posterior relaxed log-weights
    this.log_rwJ = array(J) // posterior/sample ratio log-weights
    this.log_mwJ = array(J) // posterior move log-weights
    this.log_mpJ = array(J) // posterior move log-densities
    this.log_cwJ = array(J) // posterior candidate log-weights
    this.log_cwrfJN = matrix(J, N) // posterior candidate log-weight relaxations
    this.xJ = array(J) // return values
    this.pxJ = array(J) // prior return values
    this.yJ = array(J) // proposed return values
    this.jJ = array(J) // sample indices
    this.jjJ = array(J) // shuffle indices
    // resample (shuffle) buffers
    this._jJ = array(J)
    this._xJ = array(J)
    this._xJK = array(J)
    this._uaJK = array(J)
    this._log_p_xJK = array(J)
    this._log_wJ = array(J)
    this._log_wrfJN = array(J)
    this._log_wrJ = array(J)
    // reweight buffers
    this._log_rwJ = array(J)
    this._rN = array(N)

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
    cache(this, 'wsum', [], () => sum(this.log_wJ, exp))
    cache(this, 'wrsum', ['rwJ'], () => sum(this.log_wrJ, exp))
    cache(this, 'rwX', ['rwJ_agg'])
    cache(this, 'elw', ['rwJ'])
    cache(this, 'elp', ['rwJ'])
    cache(this, 'tks', ['rwJ'])
    cache(this, 'stdevK', ['rwJ'])
    cache(this, 'mks', ['rwJ'])

    // initialize stats
    this._init_stats()

    if (defined(this.options.targets)) {
      if (this.options.targets == true) this._targets()
      else assert(is_object(this.options.targets), 'invalid option targets')
    }

    // sample prior (along w/ u=0 posterior)
    let timer = _timer_if(options.log)
    this._sample_prior()
    if (options.log) {
      print(
        `sampled ${J} prior runs (ess ${this.pwj_ess}, ` +
          `wsum ${this.wsum}) in ${timer}`
      )
      print(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=0`)
    }

    // update sample to posterior
    timer = _timer_if(options.log)
    this._update()
    if (options.log) {
      print(`applied ${this.u} updates in ${timer}`)
      print(`ess ${~~this.ess} (essu ${~~this.essu}) for posterior@u=${this.u}`)
      if (this.stats) print(str(omit(this.stats, 'updates')))
    }

    if (options.quantiles) this._quantiles()
    if (options.plot) this._plot()
  }

  _parse_func(func) {
    // replace sample|condition|weight|confine calls
    const js = func.toString()
    const lines = js.split('\n')
    const values = []
    const weights = []
    const names = new Set()
    // argument pattern allowing nested parentheses is derived from that in core.js
    // this particular pattern allows up to 5 levels of nesting for now
    // also note javascript engine _should_ cache the compiled regex
    const __sampler_regex =
      /(?:(?:^|\n|;) *(?:const|let|var)? *(\S+) *= *|\b)(sample|sample_array|condition|weight|confine|confine_array) *\(((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\((?:`.*?`|'[^\n]*?'|"[^\n]*?"|\([^()]*?\)|.*?)*?\)|.*?)*?\)|.*?)*?\)|.*?)*?\)|.*?)*?)\)/gs
    this.js = js.replace(__sampler_regex, (m, name, method, args, offset) => {
      if (name) {
        assert(
          !names.has(name),
          `invalid duplicate name '${name}' for sampled value`
        )
        assert(
          !name.match(/^\d/),
          `invalid numeric name '${name}' for sampled value`
        )
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
      const line_index = _count_unescaped(prefix, '\n')
      const line = lines[line_index]
      check(() => [
        line_prefix + mt + line_suffix,
        line,
        (a, b) => a.startsWith(b),
      ]) // sanity check

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

      // if method is 'condition', replace from(..) in args
      if (method == 'condition')
        args = args.replace(/\bfrom *\(/g, `__sampler._from(`)

      if (method == 'confine_array') {
        // parse size as first argument
        const [, size] = args.match(/^ *(\d+) *,/) ?? []
        assert(size > 0, 'invalid/missing size for confine_array')
        const args_wo_size = args.replace(/^ *(\d+) *,/, '')
        assert(
          args_wo_size.match(/^ *(\S+)\[__i\] *,/),
          'invalid/missing second argument …[__i] for confine_array'
        )
        return (
          ';(' +
          array(size, i => {
            const index = weights.length
            weights.push({ index, offset, method, args, line_index, line, js })
            const args_indexed = args_wo_size.replaceAll('__i', i)
            return `__sampler._confine(${index},${args_indexed})`
          }) +
          ')'
        )
      }

      if (method == 'sample_array') {
        // parse size as first argument
        const [, size] = args.match(/^ *(\d+) *,/) ?? []
        assert(size > 0, 'invalid/missing size for sample_array')
        const args_wo_size = args.replace(/^ *(\d+) *,/, '')
        const array_name = name || index
        return m.replace(
          /sample_array *\(.+\)$/s,
          '[' +
            array(size, i => {
              const index = values.length
              name = array_name + `[${i}]` // aligned w/ values & unique
              names.add(name)
              values.push({ index, offset, name, args, line_index, line, js })
              const args_indexed = args_wo_size.replaceAll('__i', i)
              return `__sampler._sample(${index},${args_indexed})`
            }) +
            ']'
        )
      }

      // replace condition|weight|confine call
      if (method != 'sample') {
        const index = weights.length
        weights.push({ index, offset, method, args, line_index, line, js })
        return `__sampler._${method}(${index},${args})`
      }

      // replace sample call
      const index = values.length
      name ||= index // name aligned w/ values & unique
      names.add(name)
      values.push({ index, offset, name, args, line_index, line, js })
      return m.replace(
        /sample *\(.+\)$/s,
        `__sampler._sample(${index},${args})`
      )
    })

    // evaluate new function w/ replacements
    // use wrapper to pass along params (if any) from calling scope/context
    const __sampler = this // since 'this' is overloaded in function(){...}
    if (this.options.params) {
      const params = this.options.params
      const wrapper = `(function({${_.keys(params)}}) { return ${this.js} })`
      func = eval(wrapper)(params)
    } else func = eval('(' + this.js + ')')
    // use another wrapper to invoke _init_func() before each run
    const func_w_init = function () {
      __sampler._init_func()
      func(...arguments)
    }
    return { func: func_w_init, values, weights, names, nK: array(names) }
  }

  _init_func() {
    each(this.values, v => (v.called = false))
    each(this.weights, w => (w.called = false))
  }

  _init_stats() {
    const options = this.options
    if (!options.stats) return // stats disabled
    // enable ALL stats for stats == true
    const known_keys = flat(
      'ess essu essr elw elp wsum mar mlw mlp mks tks gap p a m t r'.split(
        /\W+/
      ),
      this.nK.map(n => `mar.${n}`),
      this.nK.map(n => `p.${n}`),
      this.nK.map(n => `pp.${n}`)
    )
    if (options.stats == true) options.stats = known_keys
    // convert string to array of keys
    if (is_string(options.stats))
      options.stats = options.stats.split(/[^\.\w]+/)
    // convert array of string keys to object of booleans (true)
    if (is_array(options.stats)) {
      assert(every(options.stats, is_string), 'invalid option stats')
      options.stats = from_entries(options.stats.map(k => [k, true]))
    }
    assert(
      is_object(options.stats) && every(values(options.stats), is_boolean),
      'invalid option stats'
    )
    const unknown_keys = diff(keys(options.stats), known_keys)
    assert(empty(unknown_keys), `unknown stats: ${unknown_keys}`)

    this.stats = {
      reweights: 0,
      reweight_tries: 0,
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
      targets_time: 0,
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
    if (spec.wsum) update.wsum = round_to(this.wsum, 1)
    if (spec.mar)
      update.mar = this.u == 0 ? 100 : round_to(100 * (this.a / this.p), 3, 3)
    each(this.nK, (n, k) => {
      if (spec[`mar.${n}`])
        update[`mar.${n}`] =
          this.u == 0 ? 100 : round_to(100 * (this.aK[k] / this.pK[k]), 3, 3)
    })
    if (spec.mlw) update.mlw = this.u == 0 ? 0 : round_to(this.mlw, 1)
    if (spec.mlp) update.mlp = this.u == 0 ? 0 : round_to(this.mlp, 1)
    if (spec.mks) update.mks = round_to(this.mks, 3)
    if (spec.tks) update.tks = round_to(this.tks, 1)
    if (spec.gap) update.gap = round_to(this.log_wrj_gap, 1)
    if (spec.p) update.p = this.u == 0 ? 0 : this.p
    each(this.nK, (n, k) => {
      if (spec[`p.${n}`]) update[`p.${n}`] = this.u == 0 ? 0 : this.pK[k]
      if (spec[`pp.${n}`])
        update[`pp.${n}`] = round(
          this.u == 0 ? 100 / this.K : 100 * (this.pK[k] / this.p)
        )
    })
    if (spec.a) update.a = this.u == 0 ? 0 : this.a
    if (spec.m) update.m = this.m
    if (spec.t) update.t = this.t
    if (spec.r) update.r = round_to(this.r, 3, inf, 'floor')

    if (this.u == 0) stats.updates = [update]
    else stats.updates.push(update)
  }

  _fill_log_wrj(log_wrJ) {
    const { log_wJ, log_wrfJN, rN, zN, bN } = this
    if (max_in(rN) == 0) {
      // for r=0 we avoid invoking log_wr but also implicitly assume log_wr->0 as r->0 since otherwise first reweight can fail due to extreme weights
      fill(log_wrJ, 0)
    } else {
      // compute distance scaling factor zN for possible scaling in log_wr
      // zN is passed as second argument, undefined when computing minimum
      // 1/max and 1/mean are easy to compute, 1/quantile is harder
      // fill(zN, n => this.J / sum(log_wrfJN, fN => (fN[n] ? fN[n](rN[n]) : 0)))
      fill(zN, n => 1 / max_of(log_wrfJN, fN => (fN[n] ? fN[n](rN[n]) : 0)))

      // compute density base offset bN for possible shifting in log_wr
      // this is always the minimum observed density and can have any sign
      // we take undefined densities (e.g. outside domain) as inf (before min)
      fill(bN, n => min_of(log_wrfJN, fN => (fN[n] ? fN[n](rN[n], null) : inf)))
      apply(bN, b => (b == inf ? 0 : b)) // if min is inf, base is zero

      // fill log_wrJ
      fill(log_wrJ, j =>
        sum(log_wrfJN[j], (f, n) => (f ? f(rN[n], zN[n], bN[n]) : 0))
      )
    }
    this.wrsum = null // since log_wrJ changed
    // print('fill_log_wrj', rN, mean(log_wrJ), min_max_in(log_wrJ), this.wrsum)

    // compute gap allowing for infinities (w/o creating NaNs)
    const gap = (a, b) => (a == b ? 0 : abs(a - b))
    this.log_wrj_gap = max_of(this.log_wrJ, (lwrj, j) => gap(lwrj, log_wJ[j]))
    if (this.log_wrj_gap < 1e-6) this.log_wrj_gap = 0 // chop to 0 below 1e-6
    // we expect gap==0 iff r==1
    // only exception is if all weights are 0
    if (this.r == 1) assert(this.log_wrj_gap == 0, `unexpected gap>0 @ r=1`)
    if (this.log_wrj_gap == 0) assert(this.r == 1, `unexpected gap=0 @ r<1`)

    // clip infinities to enable subtraction in _reweight & _move
    clip_in(log_wrJ, -Number.MAX_VALUE, Number.MAX_VALUE)
  }

  _sample_prior() {
    const timer = _timer_if(this.stats)
    const { func, xJ, pxJ, pxJK, xJK, jJ, log_p_xJK } = this
    const { log_pwJ, log_wJ, rN, log_wrJ, log_rwJ, stats } = this
    this.u = 0 // prior is zero'th update step
    fill(log_pwJ, 0)
    fill(log_wJ, 0)
    each(log_p_xJK, log_p_xjK => fill(log_p_xjK, 0))
    fill(xJ, j => ((this.j = j), func(this)))
    fill(rN, 0) // r=0 for u=0
    this._fill_log_wrj(log_wrJ) // should set log_wrJ=0 and compute gap
    copy(log_rwJ, log_pwJ) // since log_wrJ == 0
    fill(jJ, j => j) // init sample indices
    // copy prior samples for sample_prior()
    each(pxJK, (pxjK, j) => copy(pxjK, xJK[j]))
    copy(pxJ, xJ)
    if (stats) stats.sample_time += timer.t
  }

  // reweight by incrementing rN until rN=1
  // multiply rwJ by wrJ@r_next / wrJ@r
  _reweight() {
    if (this.r == 1) return // no longer needed
    const timer = _timer_if(this.stats)
    // print(`reweighting [${rN}], gap ${this.log_wrj_gap}`)
    this._swap('log_wrJ', 'log_rwJ') // save current state in buffers
    const { rN, _rN, log_wrJ, _log_wrJ, log_rwJ, _log_rwJ, stats } = this

    // apply random increment to rN that satisfies reweight_ess
    const { reweight_ess, min_reweights, max_reweight_tries } = this.options
    assert(this.ess > reweight_ess, `ess too low for reweight`)
    let tries = 0 // number of tries to reweight (i.e. increment rN)
    copy(_rN, rN) // save current rN as base
    do {
      if (tries++ == 0) fill(rN, n => min(1, _rN[n] + 1 / min_reweights))
      else apply(rN, (r, n) => _rN[n] + (r - _rN[n]) * random())
      this._fill_log_wrj(log_wrJ) // weights for next rN
      copy(log_rwJ, _log_rwJ, (lw, j) => lw + log_wrJ[j] - _log_wrJ[j])
      this.rwJ = null // reset cached posterior ratio weights and dependents
    } while (this.ess < reweight_ess && tries < max_reweight_tries)
    if (this.ess < reweight_ess)
      fatal(
        `failed reweight in ${tries} tries ` +
          `(ess=${this.ess} < reweight_ess=${reweight_ess})`
      )

    if (stats) {
      stats.reweights++
      stats.reweight_tries += tries
      stats.reweight_time += timer.t
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
    const { _xJ, xJ, _xJK, xJK, _log_wJ, log_wJ, _log_wrfJN, log_wrfJN } = this
    const { _uaJK, uaJK, _log_wrJ, log_wrJ, log_p_xJK, _log_p_xJK } = this
    if (rwj_uniform) random_discrete_uniform_array(jjJ, J)
    else random_discrete_array(jjJ, rwJ, rwj_sum) // note: sorted indices
    scan(jjJ, (j, jj) => {
      _jJ[j] = jJ[jj]
      _xJ[j] = xJ[jj]
      _xJK[j] = xJK[jj]
      _uaJK[j] = uaJK[jj]
      _log_p_xJK[j] = log_p_xJK[jj]
      _log_wJ[j] = log_wJ[jj]
      _log_wrfJN[j] = log_wrfJN[jj]
      _log_wrJ[j] = log_wrJ[jj]
    })
    this._swap(
      'jJ',
      'xJ',
      'xJK',
      'uaJK',
      'log_p_xJK',
      'log_wJ',
      'log_wrfJN',
      'log_wrJ'
    )
    fill(log_rwJ, 0) // reset weights now "baked into" sample
    this.rwJ = null // reset cached posterior ratio weights and dependents
    this.counts = null // since jJ changed
    this.wsum = null // since log_wJ changed
    if (stats) {
      stats.resamples++
      stats.resample_time += timer.t
    }
  }

  // move step
  // take metropolis-hastings steps along posterior chain
  _move() {
    const timer = _timer_if(this.stats)
    const { J, K, N, func, yJ, yJK, kJ, upJK, uaJK, xJ, xJK, jJ, jjJ } = this
    const { log_cwJ, log_cwrfJN, log_wJ, log_wrfJN, log_wrJ, stats, rN } = this
    const { zN, bN, awK, aawK, log_mwJ, log_mpJ, log_p_xJK, log_p_yJK } = this
    fill(log_mwJ, 0) // reset move log-weights log(∝q(x|y)/q(y|x))
    fill(log_mpJ, 0) // reset move log-densities log(∝p(y)/p(x))
    fill(log_cwJ, 0) // reset posterior candidate log-weights
    each(log_cwrfJN, log_cwrfjN => fill(log_cwrfjN, undefined))
    each(yJK, yjK => fill(yjK, undefined))
    each(log_p_yJK, log_p_yjK => fill(log_p_yjK, 0))
    each(upJK, upjK => fill(upjK, 0))
    // choose random pivot based on uaJK (least-recently prior-jumped)

    // choose random pivot based on uaJK, awK, and aawK
    // random_discrete_uniform_array(kJ, K)
    const wK = (this._move_wK ??= array(K))
    each(uaJK, (uajK, j) => {
      fill(wK, k => this.u - uajK[k] || awK[k] || aawK[k])
      kJ[j] = random_discrete(wK)
    })

    this.moving = true // enable posterior chain sampling into yJK in _sample
    const tmp_log_wJ = log_wJ // to be restored below
    const tmp_log_wrfJN = log_wrfJN // to be restored below
    this.log_wJ = log_cwJ // redirect log_wJ -> log_cwJ temporarily
    this.log_wrfJN = log_cwrfJN // redirect log_wrfJN -> log_cwrfJN temporarily
    fill(yJ, j => ((this.j = j), func(this)))
    this.log_wJ = tmp_log_wJ // restore log_wJ
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
      let log_cwrj = sum(log_cwrfJN[j], (f, n) =>
        f ? f(rN[n], zN[n], bN[n]) : 0
      )
      log_cwrj = clip(log_cwrj, -Number.MAX_VALUE, Number.MAX_VALUE)
      const log_dwj = log_cwrj - log_wrJ[j]
      if (random() < exp(log_mwJ[j] + log_mpJ[j] + log_dwj)) {
        // update state to reflect move
        xJ[j] = yJ[j]
        xJK[j] = yJK[j] // can't copy since rows can share arrays
        yJK[j] = array(K) // replace array since moved into xJK
        log_p_xJK[j] = log_p_yJK[j]
        log_p_yJK[j] = array(K)
        log_wJ[j] = log_cwJ[j]
        log_wrfJN[j] = log_cwrfJN[j]
        log_cwrfJN[j] = array(N)
        log_wrJ[j] = log_cwrj
        // log_dwj and any other factors in p(accept) are already reflected in
        // post-accept sample so log_rwJ is invariant; this was confirmed
        // (but not quite understood) in earlier implementations
        // log_rwJ[j] += log_dwj
        // log_rwJ[j] += log_mpJ[j]
        jJ[j] = J + j // new index remapped below
        this.move_log_w += log_dwj
        this.move_log_p += log_mpJ[j]
        this.aK[k_pivot]++
        each(upJK[j], (u, k) => {
          if (u != this.u) return
          uaJK[j][k] = u // accepted jump
          this.aaK[k]++
        })
        this.a++
        accepts++
      }
    })

    // reassign indices and reset state if any moves were accepted
    if (accepts > 0) {
      fill(jjJ, -1)
      let jj = 0 // new indices
      apply(jJ, j => (j >= J ? jj++ : jjJ[j] >= 0 ? jjJ[j] : (jjJ[j] = jj++)))
      this.rwJ = null // reset cached posterior ratio weights and dependents
      this.counts = null // since jJ changed
      this.wsum = null // since log_wJ changed
    }

    if (stats) {
      stats.moves++
      stats.proposals += J
      stats.accepts += accepts
      stats.move_time += timer.t
    }
  }

  _update() {
    const {
      time,
      updates,
      max_time,
      min_time,
      max_updates,
      min_updates,
      min_stable_updates,
      min_unweighted_updates,
      max_mks,
      max_tks,
      min_ess,
      reweight_if,
      resample_if,
      move_while,
      move_weights,
    } = this.options

    assert(this.u == 0, '_update requires u=0')

    let stable_updates = 0
    let unweighted_updates = 0

    do {
      // reweight
      // pre-stats for more meaningful ess, etc
      // also reweight on u=0 to avoid prior moves at u=1
      // should be skipped (even at u=0) if ess is too low
      if (reweight_if(this)) this._reweight()

      // update stats
      this._update_stats()

      // check for termination
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

        // check gap=0 and target ess, mks
        if (this.log_wrj_gap == 0 && this.ess >= min_ess && this.mks <= max_mks)
          stable_updates++
        else stable_updates = 0
        if (this.log_wrj_gap == 0) unweighted_updates++
        if (
          stable_updates >= min_stable_updates &&
          unweighted_updates >= min_unweighted_updates
        ) {
          const { t, u, ess, mks } = this
          if (this.options.log)
            print(
              `reached target ess=${round(ess)}≥${min_ess}, ` +
                `gap=0, mks=${round_to(mks, 3)}≤${max_mks} ` +
                `@ u=${u}, t=${t}ms, stable_updates=${stable_updates}, ` +
                `unweighted_updates=${unweighted_updates}`
            )
          break
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
          break
        }
      }

      // buffer samples at u=0 and then every mks_period updates
      if (this.u % this.options.mks_period == 0) {
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
      fill(this.pK, 0) // proposed moves by pivot value
      fill(this.aK, 0) // accepted moves by pivot value
      fill(this.aaK, 0) // accepted moves by jump value
      this.mlw = 0 // log_w improvement
      this.mlp = 0 // log_p improvement
      while (move_while(this) && this.t < max_time) {
        move_weights(this, this.awK, this.aawK)
        this._move()
        this.mlw += this.move_log_w
        this.mlp += this.move_log_p
      }
    } while (true)

    // check wrj gap and target tks if warnings enabled
    if (this.options.warn) {
      // warn about pre-posterior sample w/ log_wrj_gap>0
      if (this.log_wrj_gap > 0)
        warn(`pre-posterior sample w/ log_wrj_gap=${this.log_wrj_gap}>0`)
      if (this.tks > max_tks) {
        warn(`failed to achieve target tks=${this.tks}≤${max_tks}`)
        print('tks_pK:', str(zip_object(this.nK, round_to(this.___tks_pK, 3))))
      }
    }
  }

  _targets() {
    const timer = _timer_if(this.stats)
    const f = this.domain // sampler domain function
    let o = clone_deep(this.options)
    o = omit(o, ['log', 'plot', 'quantiles', 'targets'])
    o.warn = false
    o.updates = o.min_updates = o.max_updates = 0 // no updates
    o.reweight_if = () => false // no reweight for u=0
    // o.size = 10 * this.J // 10x samples per run

    let targets = []
    while (targets.length < 1000 && timer.t < 1000) {
      const { xJK, log_wJ } = new _Sampler(f, o)
      let w_accept
      each(xJK, (xjK, j) => {
        const w = exp(log_wJ[j])
        if (w == 0) return // skip rejected run
        w_accept ??= w
        assert(
          approx_equal(w, w_accept),
          `uneven weights ${w}!=${w_accept} for target run`
        )
        if (w) targets.push(zip_object(this.nK, xjK))
      })
    }
    if (targets.length < 1000)
      fatal(`generated only ${targets.length}/1000 targets in ${timer.t}ms`)
    this.options.targets = transpose_objects(targets)
    if (this.options.log)
      print(`generated ${targets.length} targets in ${timer.t}ms`)
    if (this.stats) this.stats.targets_time = timer.t
  }

  _quantiles() {
    const options = this.options
    assert(size(options.stats) == 1, 'quantiles require single stats:<name>')
    // enable default quantiles for quantiles == true
    if (options.quantiles == true) options.quantiles = [0, 0.1, 0.5, 0.9, 1]

    // execute necessary runs
    const R = options.quantile_runs
    assert(is_integer(R) && R > 0, 'invalid option quantile_runs')
    const f = this.domain // sampler domain function
    let o = clone_deep(options)
    o = omit(o, ['log', 'plot', 'quantiles', 'targets'])
    o.warn = false
    o.updates = o.min_updates = o.max_updates = this.u // fix update steps
    const sR = [this.stats, ...array(R - 1, r => new _Sampler(f, o).stats)]
    if (options.log) print(`completed ${R} quantile runs in ${this.t}ms`)

    // compute quantiles of global stats
    const qQ = options.quantiles
    assert(is_array(qQ) && qQ.every(is_prob), 'invalid option quantiles')
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
      const formatters = { __function_context: {} }
      const formatter_context = formatters.__function_context
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
          merge(formatter_context, options.formatter_context)
        series.push(omit(options, ['mapper', 'formatter']))
      }
      // function for adding a "rescaled" line to y2 axis of plot
      const add_rescaled_line = (n, range, d = 1, s = inf) => {
        if (quantiles && !quantiles.includes(prop)) {
          // push quantile series instead, rescaling across all quantiles
          const [a, b] = range ?? min_max_in(flat(updates.map(_.values)))
          each(quantiles, k => add_rescaled_line(k, [a, b]))
          return
        }
        const [a, b] = range ?? min_max_in(map(updates, n))
        const _n = n.replace(/\./g, '_') // periods don't work well w/ context
        add_line(n, {
          axis: 'y2',
          mapper: x => round_to((100 * (x - a)) / max(b - a, 1e-6), d, s),
          formatter: eval(
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
      if (spec.gap) add_line('gap')
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

      each(this.nK, n => {
        if (spec[`mar.${n}`])
          add_line(`mar.${n}`, { axis: 'y2', formatter: x => `${x}%` })
        if (spec[`pp.${n}`])
          add_line(`pp.${n}`, { axis: 'y2', formatter: x => `${x}%` })
      })

      if (spec.wsum) add_rescaled_line('wsum')
      if (spec.elw) add_rescaled_line('elw', null, 3)
      if (spec.elp) {
        const [a, b] = min_max_in(map(updates, 'elp'))
        add_rescaled_line('elp', [a, b], 3)
      }
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
      if (spec.m) add_rescaled_line('m')
      if (spec.t) add_rescaled_line('t')
      if (spec.r) add_rescaled_line('r', null, 3)

      each(this.nK, n => {
        if (spec[`p.${n}`]) add_rescaled_line(`p.${n}`, null, 0)
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
              // elw/elp/wsum closely related, mlw/mlp is dashed to distinguish
              mlw: '#666',
              mlp: '#666',
              elw: '#666',
              elp: '#666',
              wsum: '#666',
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
                format: y => y_labels[round(log10(2 ** y))] ?? '?',
                __function_context: { y_labels },
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
              value: (v, _, n) => formatters[n]?.(v) ?? v,
              __function_context: { formatters },
            },
          },
          grid: {
            y: {
              lines: compact([
                { value: 1, class: 'accept strong' },
                { value: round_to(log2(10), 2), class: 'accept' },
                { value: round_to(log2(100), 2), class: 'accept weak' },
                mlw_0_on_y
                  ? { value: round_to(mlw_0_on_y, 2), class: 'mlw' }
                  : null,
                mlp_0_on_y
                  ? { value: round_to(mlp_0_on_y, 2), class: 'mlp' }
                  : null,
              ]),
            },
          },
          // point: { show: false },
          padding: { right: 50, left: 35 },
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
    const { J, rwJ, rwj_sum, xJK, pxJK, pwj_sum } = this
    each(this.values, (value, k) => {
      // use name but replace non-alphanum w/ underscore
      const name = value.name.replace(/\W/g, '_').replace(/^_+|_+$/g, '')
      if (!is_number(value.first)) return // value not number

      // get prior w/ weights that sum to J
      const pxJ = array(J, j => pxJK[j][k])
      const pwJ = scale(copy(this.pwJ), J / pwj_sum)

      // include any undefined values for now
      const xJ = array(J, j => xJK[j][k])
      const wJ = scale(copy(rwJ), J / rwj_sum) // rescale to sum to J

      if (!value.target) {
        hist([pxJ, xJ], { weights: [pwJ, rwJ] }).hbars({
          name,
          series: [
            { label: 'prior', color: '#555' },
            { label: 'posterior', color: '#d61' },
          ],
        })
        return
      }

      if (is_function(value.target)) {
        warn(`cdf target not yet supported for value '${name}'`)
        return // cdf target not supported yet
      }

      // get target sample w/ weights that sum to J
      const yR = value.target
      const wR = array(value.target.length)
      if (value.target_weights) {
        copy(wR, value.target_weights)
        scale(wR, J / value.target_weight_sum) // rescale to sum to J
      } else {
        fill(wR, J / value.target.length) // rescale to sum to J
      }

      hist([pxJ, xJ, yR], { weights: [pwJ, wJ, wR] }).hbars({
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
    return Date.now() - this.start_time
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
      if (!value.sampler) return // value not sampled
      // return per-element stdev for array values
      if (is_array(value.first)) {
        const R = value.first.length
        const stdevR = (stdevK[k] ??= array(R))
        assert(stdevR.length == R, 'variable-length arrays not supported yet')
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
        assert(vR.every(is_finite) && min_of(vR) >= -1e-6, 'bad variance', vR)
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
      assert(is_finite(v) && v >= -1e-6, 'bad variance', v)
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
    const { rwJ, rwj_sum, log_wJ } = this
    const z = 1 / rwj_sum
    return sum(log_wJ, (log_wj, j) => {
      // NOTE: elw==0 when conditioning (log_wj 0 or -inf for all j)
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
    const { J, K, xJK, rwJ, rwj_uniform, values, stats } = this
    // compute ks1_test or ks2_test for each value w/ target
    const pK = (this.___tks_pK ??= array(K))
    fill(pK, k => {
      const value = values[k]
      if (!value.target) return undefined // no target
      const xR = (this.___tks_xR ??= array(J))
      const wR = (this.___tks_wR ??= array(J))
      let wr_sum = 0
      let r = 0
      repeat(J, j => {
        const x = xJK[j][k]
        const w = rwJ[j]
        if (x !== undefined) {
          xR[r] = x
          wR[r++] = w
          wr_sum += w
        }
      })
      if (r == 0 || wr_sum == 0) return 0 // not enough samples/weight
      xR.length = wR.length = r
      if (is_function(value.target)) {
        // use ks1_test for cdf target
        return ks1_test(xR, value.target, { wJ: wR, wj_sum: wr_sum })
      }
      // use ks2_test for sample target
      return ks2_test(xR, value.target, {
        wJ: rwj_uniform ? undefined : wR,
        wj_sum: rwj_uniform ? undefined : wr_sum,
        wK: value.target_weights,
        wk_sum: value.target_weight_sum,
      })
    })
    const pR = pK.filter(defined)
    if (stats) stats.tks_time += timer.t
    // minimum p-value ~ Beta(1,R) so we transform as beta_cdf(p,1,R)
    return -log2(beta_cdf(min_in(pR), 1, pR.length))
  }

  __mks() {
    const timer = _timer_if(this.stats)
    const { u, J, K, uB, xBJK, log_p_xBJK, rwBJ, rwBj_sum, xJK, uaJK } = this
    const { log_p_xJK, rwJ, rwj_sum, rwj_uniform, stats } = this
    const { mks_tail, mks_period } = this.options

    // trim mks sample buffer to cover desired tail of updates
    if (xBJK.length < 2) return inf // not enough updates yet
    const B = min(xBJK.length, max(2, 1 + ceil((u * mks_tail) / mks_period)))
    while (xBJK.length > B) {
      uB.shift()
      xBJK.shift()
      log_p_xBJK.shift()
      rwBJ.shift()
      rwBj_sum.shift()
    }

    const xJ = (this.___mks_xJ ??= array(J))
    const wJ = (this.___mks_wJ ??= array(J))
    const yJ = (this.___mks_yJ ??= array(J))
    const log_p_xJ = (this.___mks_log_p_xJ ??= array(J))
    const log_p_yJ = (this.___mks_log_p_yJ ??= array(J))

    // include only samples fully updated since buffered update
    copy(wJ, rwJ, (w, j) => (min_in(uaJK[j]) > uB[0] ? w : 0))
    const wj_sum = sum(wJ)
    if (wj_sum < 0.5 * rwj_sum) return inf // not enough samples/weight

    const pR2 = array(K, k => {
      const value = this.values[k]
      if (!value.sampler) return // value not sampled
      if (!is_number(value.first)) return // value not number
      copy(xJ, xJK, xjK => xjK[k])
      copy(yJ, xBJK[0], yjK => yjK[k])
      copy(log_p_xJ, log_p_xJK, log_p_xjK => log_p_xjK[k])
      copy(log_p_yJ, log_p_xBJK[0], log_p_yjK => log_p_yjK[k])
      return [
        ks2_test(xJ, yJ, {
          wJ,
          wj_sum,
          wK: rwBJ[0],
          wk_sum: rwBj_sum[0],
        }),
        ks2_test(log_p_xJ, log_p_yJ, {
          wJ,
          wj_sum,
          wK: rwBJ[0],
          wk_sum: rwBj_sum[0],
        }),
      ]
    }).filter(defined)

    if (stats) stats.mks_time += timer.t
    const R = pR2.length
    if (R == 0) return inf
    // note there are many dependencies in the statistics, especially between x and log_p for same value (k), so we process take min across post-beta adjustment
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
    const j = this.sample_index(options)
    const xJK = options?.prior ? this.pxJK : this.xJK
    switch (options?.format) {
      case 'array':
        return xJK[j]
      case 'object':
      default:
        return set(zip_object(this.nK, xJK[j]), '_index', j)
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
          return assign(this.sample_values(options), {
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
    assert(!value.called, 'sample(…) invoked dynamically (e.g. inside loop)')
    value.called = true
    const { j, xJK, log_pwJ, yJK, log_mwJ, log_mpJ, log_wJ, moving } = this
    const { upJK, uaJK, aawK, upwK, log_p_xJK, log_p_yJK } = this

    // reject run (-∞ weight) on nullish (null=empty or undefined) domain
    if (is_nullish(domain)) log_wJ[j] = -inf

    // return undefined on (effectively) rejected run
    if (log_wJ[j] == -inf) return undefined
    if (moving && min(log_mwJ[j], log_mpJ[j]) == -inf) return undefined

    // initialize on first call
    if (!value.sampler) {
      value.sampler = this

      // process name if specified
      if (options?.name) {
        assert(
          !this.names.has(options.name),
          `invalid duplicate name '${options.name}' for sampled value`
        )
        assert(
          !options.match(/^\d/),
          `invalid numeric name '${options.name}' for sampled value`
        )
        value.name = options.name
        this.names.add(value.name)
        this.nK[k] = value.name
      }

      // pre-process function domain if parameter-free
      // otherwise have to do it on every call before sampling (see below)
      value.sampler_domain = is_function(domain)
      if (value.sampler_domain && size(options?.params) == 0)
        value.domain = new _Sampler(domain, options)

      const { index, name, args } = value
      const line = `line ${value.line_index}: ${value.line.trim()}`

      // process target if specified
      const target = options?.target ?? this.options.targets?.[name]
      if (target) {
        const timer = _timer_if(this.options.log)
        value.target = target
        // sample from sampler domain (_prior)
        if (value.target?._prior) {
          const T = options?.size ?? this.J
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
          if (this.options.log) print(`sampled ${T} target values in ${timer}`)
        } else {
          if (!is_function(value.target) && !is_array(value.target))
            fatal(`invalid target @ ${line}`)
          assert(!defined(options?.size), `unexpected size option @ ${line}`)
        }
      } else {
        assert(!defined(options?.size), `unexpected size option @ ${line}`)
      }

      // log sampled value
      if (this.options.log) {
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

    // process sampler domain (unless pre-processed)
    // also ensure ~full ess since that is assumed by posterior sampler
    if (value.sampler_domain) {
      domain = value.domain ?? new _Sampler(domain, options)
      assert(
        approx_equal(domain.ess, domain.J, 1e-3),
        'sampler domain failed to achieve full ess'
      )
    }

    const log_p = domain._log_p
    assert(log_p, 'missing prior density (_log_p)')
    const prior = options?.prior ?? domain._prior
    assert(prior, 'missing prior sampler (_prior)')

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
      assert(xjk !== undefined, 'unexpected missing prior value')
      log_p_yjK[k] = log_p_xjk
      return (yjK[k] = xjk)
    }

    // if at pivot, compute jump weights for unsampled values based on uaJK
    // unsampled values are pivot + past-pivot values
    if (k == k_pivot) {
      // copy(upwK, aawK, (w, k) => (yjK[k] === undefined ? w : 0))
      copy(upwK, uaJK[j], (u, k) =>
        yjK[k] === undefined ? this.u - u || aawK[k] : 0
      )
      const s = sum(upwK)
      if (s) scale(upwK, 1 / s)
    }

    // if at or past pivot, resample "jump" value from prior
    // always resample if xjk is missing (can only happen past pivot)
    if (xjk === undefined || random_boolean(upwK[k])) {
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
    const posterior = options?.posterior ?? domain._posterior
    assert(posterior, 'missing posterior sampler (_posterior)')
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

  _from(x, domain) {
    // reject outright on nullish (null=empty or undefined) domain
    // allows undefined/empty domains as in _sample
    if (is_nullish(domain)) return false
    const c = from(x, domain)
    // log_wr can be specified explicitly by the domain
    let log_wr = domain?._log_wr
    // if missing, use default log_wr based on distance and/or log_p
    if (!log_wr) {
      const d = distance(x, domain) ?? 0 // take 0 if undefined
      const log_p = density(x, domain) ?? 0 // take 0 (improper) if undefined
      if (!c) {
        assert(d >= 0, `negative distance (outside domain)`)
        assert(log_p == -inf, `positive density ${log_p} outside domain x=${x}`)
      } else assert(d == 0, `non-zero distance ${d} inside domain`)
      log_wr = (r, z, b) => {
        if (z === undefined) return d // distance for z
        if (b === undefined) return c ? log_p : inf // log_p for b
        if (d == 0) return r * log_p // inside OR unknown distance, note r>0
        return r * b + log(1 - r) * (1 + 100 * d * z)
      }
    }
    if (log_wr) return set(new Boolean(c), '_log_wr', log_wr)
    return c
  }

  _condition(n, cond, log_wr = cond._log_wr) {
    if (cond.valueOf) cond = cond.valueOf() // unwrap object
    // note cond-based log_w is superseded by log_wr(1, 0, 0)
    const log_w = log_wr ? log_wr(1, 0, 0) : cond ? 0 : -inf
    this._weight(n, log_w, log_wr ?? (r => log(cond || 1 - r)))
  }

  _weight(n, log_w, log_wr = log_w._log_wr) {
    const weight = this.weights[n]
    assert(
      !weight.called,
      'confine|condition|weight(…) invoked dynamically (e.g. inside loop)'
    )
    weight.called = true
    if (log_w.valueOf) log_w = log_w.valueOf() // unwrap object
    this.log_wJ[this.j] += log_w // must match log_wr(1, 0, 0)
    this.log_wrfJN[this.j][n] = log_wr ?? (r => r * log_w) // note r>0
  }

  _confine(n, x, domain) {
    this._condition(n, this._from(x, domain))
  }
}

function _run() {
  const js = _this.read('js_input').trim()
  // if js begins w/ sample(...) call, assume no wrapper is needed
  if (js.match(/^sample *\(/)) return null
  // if js contains any sample|sample_array call, then wrap inside sample(...)
  // note this could match inside comments or strings
  if (!js.match(/\b(?:sample|sample_array) *\(/)) return null
  const func = eval(flat('(context=>{', js, '})').join('\n'))
  const options = {}
  if (typeof _sample_options == 'object') merge(options, _sample_options)
  return sample(func, options)
}
