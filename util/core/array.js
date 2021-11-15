// array(length,[value])
// array of `length` copies of `value`
// `value` can be function of index
const array = (J = 0, xj) => {
  const xJ = new Array(J)
  // NOTE: Array.from({length:J}, ...) was much slower
  if (typeof xj == 'function') for (let j = 0; j < J; ++j) xJ[j] = xj(j)
  else if (typeof xj != 'undefined') xJ.fill(xj)
  return xJ
}

function _test_array() {
  check(
    () => [array(), []],
    () => [array(1), [undefined]],
    () => [array(3), [undefined, undefined, undefined]],
    () => [array(3, 0), [0, 0, 0]],
    () => [array(3, j => j), [0, 1, 2]]
  )
}

function _benchmark_array() {
  benchmark(
    () => new Array(100),
    () => new Array(100).fill(0),
    () => array(100, j => j),
    () => Array.from({ length: 100 }, j => j)
  )
}
