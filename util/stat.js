function _test() {}
function _test_something() {}
function _benchmark() {}
function _benchmark_something() {}

const flip = (ph = 0.5) => Math.random() < ph
const uniform = (a, b) => {
  const u = Math.random()
  return a === undefined ? u : b === undefined ? u * a : a + u * (b - a)
}
// NOTE: uniform_int(n) ~ uniform_int(0,n-1)
//       uniform_int()  ~ uniform_int(0,1)
const uniform_int = (a, b) => {
  const u = Math.random()
  return ~~(a === undefined
    ? 2 * u // {0,1}
    : b === undefined
    ? u * a // {0,...,a-1}
    : a + u * (b + 1 - a)) // {a,...,b} (inclusive)
}
const discrete_uniform = uniform_int // consistent w/ random process
const discrete = (wJ, wj_sum = sum(wJ)) => {
  let j = 0,
    w = 0,
    wt = uniform() * wj_sum
  do {
    w += wJ[j++]
  } while (w < wt && j < wJ.length)
  return j - 1
}
const noise = (xJ, ε = 0.001) => apply(xJ, x => x + ε * (2 * uniform() - 1))

// triangular sampler from https://github.com/jstat/jstat/blob/master/src/distribution.js
const triangular = (a, b, c) => {
  if (a === undefined) return triangular(0, 1, 0.5)
  if (b === undefined) return triangular(0, a, a / 2)
  if (c === undefined) return triangular(a, b, (a + b) / 2)
  if (c < a) c = a
  else if (c > b) c = b
  const u = Math.random()
  if (u < (c - a) / (b - a)) return a + Math.sqrt(u * (b - a) * (c - a))
  return b - Math.sqrt((1 - u) * (b - a) * (b - c))
}
_.set(triangular, '_name', 'triangular') // TODO: standardize names

// Durstenfeld shuffle, see https://stackoverflow.com/a/12646864
function shuffle(array, start = 0, end = array.length) {
  for (let i = end - 1; i > start; i--) {
    const j = start + ~~(Math.random() * (i - start + 1))
    const tmp = array[i]
    array[i] = array[j]
    array[j] = tmp
  }
}

// adapted from https://github.com/jstat/jstat/blob/master/src/vector.js
function min(xJ) {
  if (!isArray(xJ)) return min(Array.from(arguments))
  let z = inf
  const J = xJ.length
  for (let j = 0; j < J; ++j) if (xJ[j] < z) z = xJ[j]
  return z
}
const min2 = (xJ, z = 0) => (each(xJ, x => x >= z || (z = x)), z) // reference
function max(xJ) {
  if (!isArray(xJ)) return max(Array.from(arguments))
  let z = -inf
  const J = xJ.length
  for (let j = 0; j < J; ++j) if (xJ[j] > z) z = xJ[j]
  return z
}
function sum(xJ) {
  if (!isArray(xJ)) return sum(Array.from(arguments))
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
