// array(J,[x])
// array `xJ` of length `J`
// `x` can be given to initialize as `xJ[j]=x ∀j`
// `x` can be a function of index, e.g. `j=>j`
const array = (J = 0, x) => {
  const xJ = new Array(J)
  // NOTE: Array.from({length:J}, ...) was much slower
  if (typeof x == 'function') for (let j = 0; j < J; ++j) xJ[j] = x(j)
  else if (typeof x != 'undefined') xJ.fill(x)
  return xJ
}

function _test_array() {
  check(
    () => [array(), []],
    () => [array(1), [undefined]],
    () => [array(3), [undefined, undefined, undefined]],
    () => [array(3, 0), [0, 0, 0]],
    () => [array(3, j => j), [0, 1, 2]],
  )
}

function _benchmark_array() {
  benchmark(
    () => new Array(100),
    () => new Array(100).fill(0),
    () => array(100, j => j),
    () => Array.from({ length: 100 }, j => j),
  )
}

const zeroes = J => array(J, 0)
const ones = J => array(J, 1)

// fills `xJ` as `xJ[j]=f(j) ∀j`
function fill(xJ, f) {
  for (let j = 0; j < xJ.length; ++j) xJ[j] = f(j)
  return xJ
}

// copy(xJ, [yJ], [f])
// copies `xJ` into new array
// can copy `yJ` into existing `xJ`
// can map copied elements as `f(x,j)`
function copy(xJ, yJ, f) {
  if (yJ === undefined) return f ? xJ.map(f) : xJ.slice() // single arg mode
  if (f) for (let j = 0; j < xJ.length; ++j) xJ[j] = f(yJ[j], j)
  else for (let j = 0; j < xJ.length; ++j) xJ[j] = yJ[j]
  return xJ
}

// NOTE: introducing additional indices js, je, ks, ke, etc can significantly slow down these functions unless the arguments are reassigned to const, so we minimize indices for now

// copy_at(xJ, yK, [js=0])
// copies `yK` into `xJ` starting at `js`
function copy_at(xJ, yK, _js = 0) {
  const js = _js // important optimization
  for (let k = 0; k < yK.length; ++k) xJ[js + k] = yK[k]
  return xJ
}

// invokes `f(x,j)` for each `x` in `xJ`
function each(xJ, f) {
  for (let j = 0; j < xJ.length; ++j) f(xJ[j], j)
  return xJ
}

// invokes `f(j,x)` for each `x` in `xJ`
function scan(xJ, f) {
  for (let j = 0; j < xJ.length; ++j) f(j, xJ[j])
  return xJ
}

function _benchmark_each() {
  const xJ = array(1000, Math.random)
  benchmark(
    () => xJ.forEach(x => x),
    () => each(xJ, x => x),
    () => scan(xJ, j => j),
  )
}

const _benchmark_each_functions = ['each', 'scan']

// maps `yJ` into `xJ` as `f(x,y,j)`
function map(xJ, yJ, f) {
  for (let j = 0; j < xJ.length; ++j) xJ[j] = f(xJ[j], yJ[j], j)
  return xJ
}

// applies `f(x,j)` to `xJ`
const apply = (xJ, f) => {
  for (let j = 0; j < xJ.length; ++j) xJ[j] = f(xJ[j], j)
  return xJ
}

// => x=swap(y,y=x)
// swaps `x` and `y`
function swap(y, y_assigned) {
  if (y_assigned === undefined || y == y_assigned)
    fatal('expected usage is x=swap(y,y=x) for distinct x,y')
  return y
}

function _benchmark_swap() {
  let x = 1
  let y = 2
  benchmark(
    () => (x = swap(y, (y = x))),
    () => {
      const tmp = x
      x = y
      y = x
    },
    () => ([x, y] = [y, x]),
  )
}

function _benchmark_map() {
  let yJ = array(10000, Math.random)
  let xJ = array(10000)
  benchmark(
    () => map(xJ, yJ, (x, y) => x + y),
    () => map(xJ, yJ, (x, y) => y * y),
    () => copy(xJ, yJ, y => y * y),
    () =>
      (xJ = swap(
        apply(yJ, y => y * y),
        (yJ = xJ),
      )),
    () => yJ.map(y => y * y),
  )
}
