const pi = Math.PI
const exp = Math.exp
const log = Math.log
const sin = Math.sin
const cos = Math.cos
const asin = Math.asin
const acos = Math.acos
const ln = Math.log
const loge = Math.log
const log2 = Math.log2
const log10 = Math.log10
const sqrt = Math.sqrt
const cbrt = Math.cbrt
const abs = Math.abs
const sign = Math.sign
const min = Math.min
const max = Math.max
const ceil = Math.ceil
const floor = Math.floor
const trunc = Math.trunc
const round = Math.round

// many alternatives to floor ...
// https://stackoverflow.com/a/5971668
// https://stackoverflow.com/a/1822769
// https://stackoverflow.com/a/5971668
function _test_floor() {
  const x = Math.random() * 1000
  check(() => [floor(x), trunc(x), ~~x, x | 0, x >> 0, x >> 0, x >>> 0])
  check(() => [floor(-x) + 1, trunc(-x), ~~-x, -x | 0, -x >> 0, -x << 0])
}

// benchmark to settle rumors of performance differences
// unfortunately varies by browser, but in Safari everything is quite close
// trunc and ~~ should be slightly faster as they do less work
// floor and trunc seem preferable where readability matters
function _benchmark_floor() {
  const x = Math.random() * 10000
  _benchmark_options = { N: 10000000 }
  benchmark(
    () => floor(x),
    () => trunc(x),
    // see https://stackoverflow.com/a/5971668
    // similar to Math.trunc, chops decimal part, positive floor, never NaN
    () => ~~x,
    () => x | 0,
    () => x >> 0
  )
}

// is `x` flat?
// flat means _uniform depth_ 1 or 0
// non-array (depth 0) considered flat
// undefined is considered non-array
function is_flat(x) {
  if (!is_array(x)) return true
  return !x.some(is_array)
}

function _test_is_flat() {
  check(
    () => is_flat(),
    () => is_flat(0),
    () => is_flat([]),
    () => is_flat([0]),
    () => !is_flat([[]]),
    () => !is_flat([0, []])
  )
}

// is `x` rectangular?
// rectangular means _uniform depth_
// non-array (depth 0) considered rectangular
// many functions below assume `x` is rectangular
function is_rectangular(x) {
  if (!is_array(x)) return true
  return _is_array_rectangular(x)
}

function _is_array_rectangular(x) {
  if (!is_array(x[0])) return is_flat(x)
  return x.every(xj => is_array(xj) && _is_array_rectangular(xj))
}

function _test_is_rectangular() {
  check(
    () => is_rectangular(),
    () => is_rectangular(0),
    () => is_rectangular([]),
    () => is_rectangular([[]]),
    () => is_rectangular([[], []]),
    () => !is_rectangular([[0], 0]),
    () => !is_rectangular([0, [0]]),
    () => is_rectangular([[0], [0]]),
    () => !is_rectangular([[0, [0]], [0]])
  )
}

// dimensions of _rectangular_ `x`
// _invalid for non-rectangular `x`_
function dimensions(x) {
  if (!is_array(x)) return []
  if (x.length == 0) return [0]
  return [x.length, ...dimensions(x[0])]
}

function _test_dimensions() {
  check(
    () => [dimensions(), []],
    () => [dimensions(0), []],
    () => [dimensions([]), [0]],
    () => [dimensions([[]]), [1, 0]],
    () => [dimensions([[1, 2]]), [1, 2]],
    () => [dimensions([[1], [2]]), [2, 1]]
  )
}

// depth of _rectangular_ `x`
// _invalid for non-rectangular `x`_
function depth(x) {
  if (!is_array(x)) return 0
  return depth(x[0]) + 1
}

function _test_depth() {
  check(
    () => depth() === 0,
    () => depth(0) === 0,
    () => depth([0]) === 1,
    () => depth([[0]]) === 2,
    () => depth([[0], 1]) === 2, // invalid!
    () => depth([0, [1]]) === 1, // invalid!
    () => depth([[0], [1]]) === 2
  )
}

const is_scalar = x => !is_array(x) // ≡ depth(x)==0

function _test_is_scalar() {
  check(
    () => is_scalar() === true,
    () => is_scalar(0) === true,
    () => is_scalar([]) === false,
    () => is_scalar([0]) === false
  )
}

// `depth(x) == 2` for _rectangular_ `x`
// _invalid for non-rectangular `x`_
const is_matrix = x => depth(x) == 2

function _test_is_matrix() {
  check(
    () => !is_matrix(),
    () => !is_matrix([]),
    () => is_matrix([[]]),
    () => is_matrix([[0]]),
    () => is_matrix([[0], 1]), // invalid!
    () => !is_matrix([[[]]]) // too deep
  )
}

// matrix([J=0],[K=0],[x])
// matrix `xJK` of dimensions `J,K`
// `x` can be given to fill as `xJK[j][k]=x ∀j,k`
// `x` can be a function of indices, e.g. `(j,k)=>j*k`
function matrix(J = 0, K = 0, x) {
  const xJK = new Array(J)
  for (let j = 0; j < J; ++j) xJK[j] = new Array(K)
  if (typeof x == 'function') {
    for (let j = 0; j < J; ++j) {
      const xj = xJK[j]
      for (let k = 0; k < K; ++k) xj[k] = x(j, k)
    }
  } else if (typeof x != 'undefined') for (let j = 0; j < J; ++j) xJK[j].fill(x)
  return xJK
}

function _benchmark_matrix() {
  benchmark(
    () => matrix(10, 10),
    () => array(10, k => array(10)),
    () => matrix(10, 1000),
    () => array(10, k => array(1000)),
    () => matrix(1000, 10),
    () => array(1000, k => array(10)),
    () => matrix(10, 10, 0),
    () => array(10, k => array(10, 0)),
    () => matrix(10, 1000, 0),
    () => array(10, k => array(1000, 0)),
    () => matrix(1000, 10, 0),
    () => array(1000, k => array(10, 0))
  )
}

// peels away outer arrays of length 1
// does not affect longer arrays
function scalarify(x) {
  while (is_array(x) && x.length == 1) x = x[0]
  return x
}

function _test_scalarify() {
  check(
    () => [scalarify(), undefined],
    () => [scalarify([]), []],
    () => [scalarify([[]]), []],
    () => [scalarify([[[]]]), []],
    () => [scalarify([0]), 0],
    () => [scalarify([[0]]), 0],
    () => [scalarify([[0, 1]]), [0, 1]],
    () => [scalarify([[0], 1]), [[0], 1]]
  )
}

// wraps scalar → array → 1×n matrix
// does not affect deeper arrays
// assumes _rectangular_ `x`
function matrixify(x) {
  if (!is_array(x)) x = [x] // convert scalar to array
  if (!is_array(x[0])) x = [x] // convert array to 1×n matrix
  return x
}

function _test_matrixify() {
  check(
    () => [matrixify(), [[undefined]]],
    () => [matrixify([]), [[]]],
    () => [matrixify([[]]), [[]]],
    () => [matrixify([[[]]]), [[[]]]],
    () => [matrixify(0), [[0]]],
    () => [matrixify([0]), [[0]]],
    () => [matrixify([0, 1]), [[0, 1]]],
    () => [matrixify([[0], 0]), [[0], 0]]
  )
}

// transposes matrix `xJK → xKJ`
// matrixifies scalar/vector argument as needed
// scalarifies transposed matrix
function transpose(xJK) {
  xJK = matrixify(xJK)
  const J = xJK.length
  const K = xJK[0].length
  // NOTE: function overhead can be significant for smaller inputs
  // return array(K, k=> array(J, j=> xJK[j][k]))
  const xKJ = new Array(K)
  for (let k = 0; k < K; ++k) {
    const xk = (xKJ[k] = new Array(J))
    for (let j = 0; j < J; ++j) xk[j] = xJK[j][k]
  }
  return scalarify(xKJ)
}

function _test_transpose() {
  check(
    () => [transpose(), undefined],
    () => [transpose([]), []],
    () => [transpose([[]]), []],
    () => [transpose(0), 0],
    () => [transpose([0]), 0],
    () => [transpose([[0]]), 0],
    () => [transpose([1, 2]), [[1], [2]]],
    () => [transpose([[1], [2]]), [1, 2]],
    () => [
      transpose([
        [1, 2],
        [3, 4],
      ]),
      [
        [1, 3],
        [2, 4],
      ],
    ],
    () => [
      transpose([
        [1, 2, 3],
        [4, 5, 6],
      ]),
      [
        [1, 4],
        [2, 5],
        [3, 6],
      ],
    ],
    () => [
      transpose([
        [1, 4],
        [2, 5],
        [3, 6],
      ]),
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
    ]
  )
}

function _benchmark_transpose() {
  const J = 100
  const K = 10
  const zJK = array(J, j => array(K, Math.random))
  const zKJ = transpose(zJK)
  benchmark(() => transpose(zJK))
  benchmark(() => transpose(zKJ))
}

// dot product `xJZ.transpose(yKZ)`
// multiplies _rows into rows_ (not rows into columns)
// matrixifies scalar/vector arguments as needed
function dot(xJZ, yKZ) {
  // NOTE: rows into rows, NOT rows into cols
  xJZ = matrixify(xJZ)
  yKZ = matrixify(yKZ)
  // transpose either side needed to align columns
  if (yKZ[0].length != xJZ[0].length) {
    if (yKZ.length == xJZ[0].length) yKZ = matrixify(transpose(yKZ))
    else if (xJZ.length == yKZ[0].length) xJZ = matrixify(transpose(xJZ))
  }
  const J = xJZ.length,
    K = yKZ.length,
    Z = xJZ[0].length
  if (yKZ[0].length != Z) fatal('incompatible arguments')
  let zJK = new Array(J)
  for (let j = 0; j < J; ++j) {
    const zjK = (zJK[j] = new Array(K))
    const xjZ = xJZ[j]
    for (let k = 0; k < K; ++k) {
      const ykZ = yKZ[k]
      let zjk = 0
      for (let z = 0; z < Z; ++z) zjk += xjZ[z] * ykZ[z]
      zjK[k] = zjk
    }
  }
  if (zJK.length > 1 && zJK[0].length == 1) zJK = transpose(zJK)
  return scalarify(zJK)
}

function _test_dot() {
  check(
    () => [dot(), NaN],
    () => [dot(0), NaN],
    () => [dot(0, 0), 0],
    () => [dot(1, 1), 1],
    () => [dot([], []), 0],
    () => [dot([], [[]]), 0],
    () => [dot([[]], []), 0],
    () => [dot([[]], [[]]), 0],
    () => [dot([1], [1]), 1],
    () => [dot([1], [1, 2]), [1, 2]],
    () => [dot([1, 2], [1]), [1, 2]],
    () => [dot([[1], [2]], [1]), [1, 2]],
    () => [dot([[1], [2]], 1), [1, 2]],
    () => [dot([[1, 2]], [1]), [1, 2]],
    () => [dot([[1, 2]], [[2, 3]]), 8],
    () => [dot([[1, 2]], [[2], [3]]), 8],
    () => [
      dot(
        [[1, 2]],
        [
          [2, 3],
          [3, 4],
        ]
      ),
      [8, 11],
    ],
    () => [
      dot(
        [
          [1, 2],
          [2, 3],
        ],
        [[2], [3]]
      ),
      [8, 13],
    ],
    // NOTE: matrix dot product is "rows into rows" NOT "rows into cols"
    () => [
      dot(
        [
          [1, 2],
          [2, 3],
        ],
        [
          [1, 2],
          [3, 2],
        ]
      ),
      [
        [5, 7],
        [8, 12],
      ],
    ]
  )
}

const _benchmark_dot = () => {
  const J = 100
  const K = 10
  const xJ = array(J, Math.random)
  const yJ = array(J, Math.random)
  const zJK = array(J, j => array(K, Math.random))
  const zKJ = transpose(zJK)

  benchmark(
    () => dot(xJ, yJ),
    () => dot(xJ, zJK),
    () => dot(zKJ, xJ),
    () => dot(zJK, xJ),
    () => dot(xJ, zKJ),
    () => dot(zJK, zKJ),
    () => dot(zJK, zJK)
  )
}

const scale = (xJ, y) => apply(xJ, x => x * y)
const shift = (xJ, y) => apply(xJ, x => x + y)

const add = (xJ, yJ) => map2(xJ, yJ, (x, y) => x + y)
const addf = (xJ, yJ, f) => map2(xJ, yJ, (x, y, j) => x + f(y, j))
const sub = (xJ, yJ) => map2(xJ, yJ, (x, y) => x - y)
const subf = (xJ, yJ) => map2(xJ, yJ, (x, y, j) => x - f(y, j))
const mul = (xJ, yJ) => map2(xJ, yJ, (x, y) => x * y)
const mulf = (xJ, yJ, f) => map2(xJ, yJ, (x, y, j) => x * f(y, j))
const div = (xJ, yJ) => map2(xJ, yJ, (x, y) => x / y)
const divf = (xJ, yJ, f) => map2(xJ, yJ, (x, y, j) => x / f(y, j))

// solves `a*x^3 + b*x^2 + c*x + d == 0`
function solve_cubic(a, b, c, d, ε = 1e-6) {
  // derived from https://stackoverflow.com/a/27176424
  // handle quadratic, linear, degenerate cases
  if (abs(a) < ε) {
    ;[a, b, c] = [b, c, d]
    if (abs(a) < ε) {
      ;[a, b] = [b, c]
      if (abs(a) < ε) return [] // degenerate
      return [-b / a]
    }
    const D = b * b - 4 * a * c
    if (abs(D) < ε) return [-b / (2 * a)]
    else if (D > 0) return [(-b + sqrt(D)) / (2 * a), (-b - sqrt(D)) / (2 * a)]
    return []
  }
  // convert to depressed cubic t^3+pt+q = 0 (subst x = t - b/3a)
  const p = (3 * a * c - b * b) / (3 * a * a)
  const q = (2 * b * b * b - 9 * a * b * c + 27 * a * a * d) / (27 * a * a * a)
  let roots

  if (abs(p) < ε) {
    // p = 0 -> t^3 = -q -> t = -q^1/3
    roots = [cbrt(-q)]
  } else if (abs(q) < ε) {
    // q = 0 -> t^3 + pt = 0 -> t(t^2+p)=0
    roots = [0].concat(p < 0 ? [sqrt(-p), -sqrt(-p)] : [])
  } else {
    const D = (q * q) / 4 + (p * p * p) / 27
    if (abs(D) < ε) {
      // D = 0 -> two roots
      roots = [(-1.5 * q) / p, (3 * q) / p]
    } else if (D > 0) {
      // only one real root
      const u = cbrt(-q / 2 - sqrt(D))
      roots = [u - p / (3 * u)]
    } else {
      // D < 0, three roots, but needs complex/trigonometric solution
      const u = 2 * sqrt(-p / 3)
      // D < 0 implies p < 0 and acos argument in [-1..1]
      const t = acos((3 * q) / p / u) / 3
      const k = (2 * pi) / 3
      roots = [u * cos(t), u * cos(t - k), u * cos(t - 2 * k)]
    }
  }
  // convert back from depressed cubic
  return apply(roots, x => x - b / (3 * a))
}
