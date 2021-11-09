// TODO: figure out what to do w/ _array and Math.random (uniform) below
// TODO: ensure tests/benchmarks look good!

// returns dimensions of rectangular array `x`
const dims = x => (is_array(x) ? [x.length, ...dims(x[0])] : [])

function _test_dims() {
  check(
    () => equal(dims(0), []),
    () => equal(dims([]), [0]),
    () => equal(dims([[]]), [1, 0]),
    () => equal(dims([[1, 2]]), [1, 2]),
    () => equal(dims([[1], [2]]), [2, 1])
  )
}

const is_matrix = x => is_array(x) && is_array(x[0])

function _test_is_matrix() {
  check(
    () => equal(is_matrix([]), false),
    () => equal(is_matrix([[]]), true),
    () => equal(is_matrix([[0], 1]), true),
    () => equal(is_matrix([[[]]]), true)
  )
}

const matrixify = x => (!is_matrix(x) ? matrixify([x]) : x)

function scalarify(x) {
  return x.length == 1 ? (x[0]?.length == 1 ? x[0][0] : x[0]) : x
}

function transpose(xJK) {
  xJK = matrixify(xJK)
  const J = xJK.length,
    K = xJK[0].length
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
    () => equal(transpose(), undefined),
    () => equal(transpose([]), []),
    () => equal(transpose([[]]), []),
    () => equal(transpose(0), 0),
    () => equal(transpose([0]), 0),
    () => equal(transpose([[0]]), 0),
    () => equal(transpose([1, 2]), [[1], [2]]),
    () => equal(transpose([[1], [2]]), [1, 2]),
    () =>
      equal(
        transpose([
          [1, 2],
          [3, 4],
        ]),
        [
          [1, 3],
          [2, 4],
        ]
      ),
    () =>
      equal(
        transpose([
          [1, 2, 3],
          [4, 5, 6],
        ]),
        [
          [1, 4],
          [2, 5],
          [3, 6],
        ]
      ),
    () =>
      equal(
        transpose([
          [1, 4],
          [2, 5],
          [3, 6],
        ]),
        [
          [1, 2, 3],
          [4, 5, 6],
        ]
      )
  )
}

function _benchmark_transpose() {
  const J = 100
  const K = 10
  const zJK = _array(J, j => _array(K, Math.random))
  const zKJ = transpose(zJK)
  benchmark(() => transpose(zJK))
  benchmark(() => transpose(zKJ))
}

function dot(xJZ, yKZ) {
  // NOTE: rows into rows, NOT rows into cols
  ;(xJZ = matrixify(xJZ)), (yKZ = matrixify(yKZ))
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
    () => equal(dot(), NaN),
    () => equal(dot(0), NaN),
    () => equal(dot(0, 0), 0),
    () => equal(dot(1, 1), 1),
    () => equal(dot([], []), 0),
    () => equal(dot([], [[]]), 0),
    () => equal(dot([[]], []), 0),
    () => equal(dot([[]], [[]]), 0),
    () => equal(dot([1], [1]), 1),
    () => equal(dot([1], [1, 2]), [1, 2]),
    () => equal(dot([1, 2], [1]), [1, 2]),
    () => equal(dot([[1], [2]], [1]), [1, 2]),
    () => equal(dot([[1], [2]], 1), [1, 2]),
    () => equal(dot([[1, 2]], [1]), [1, 2]),
    () => equal(dot([[1, 2]], [[2, 3]]), 8),
    () => equal(dot([[1, 2]], [[2], [3]]), 8),
    () =>
      equal(
        dot(
          [[1, 2]],
          [
            [2, 3],
            [3, 4],
          ]
        ),
        [8, 11]
      ),
    () =>
      equal(
        dot(
          [
            [1, 2],
            [2, 3],
          ],
          [[2], [3]]
        ),
        [8, 13]
      ),
    // NOTE: matrix dot product is "rows into rows" NOT "rows into cols"
    () =>
      equal(
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
        ]
      )
  )
}

function _benchmark_dot() {
  const J = 100
  const K = 10
  const xJ = _array(J, Math.random)
  const yJ = _array(J, Math.random)
  const zJK = _array(J, j => _array(K, Math.random))
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
