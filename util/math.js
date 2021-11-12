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

function transpose(xJK) {
  xJK = matrixify(xJK)
  const J = xJK.length
  const K = xJK[0].length
  // NOTE: function overhead can be significant for smaller inputs
  // return array(K, k=> array(J, j=> xJK[j][k]))
  const xKJ = new Array(K)
  for (let k = 0; k < K; ++k) {
    xKJ[k] = new Array(J)
    for (let j = 0; j < J; ++j) xKJ[k][j] = xJK[j][k]
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

function _benchmark_dot() {
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
