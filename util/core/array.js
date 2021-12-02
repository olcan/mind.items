// array([J=0],[x])
// array `xJ` of length `J`
// `x` can be given to fill as `xJ[j]=x ∀j`
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

const zeroes = J => array(J, 0)
const ones = J => array(J, 1)

// fill(xJ, x, [js=0], [je=J])
// fills `xJ` as `xJ[j]=x ∀j`
// `x` can be a function of index, e.g. `j=>j`
function fill(xJ, x, js = 0, je = xJ.length) {
  js = Math.max(0, js)
  je = Math.min(je, xJ.length)
  if (typeof x == 'function') for (let j = js; j < je; ++j) xJ[j] = x(j)
  else for (let j = js; j < je; ++j) xJ[j] = x // can be undefined
  return xJ
}

// copy(xJ, [yJ], [f])
// copies `xJ` into new array
// can copy `yJ` into existing `xJ`
// can map copied elements as `f(x,j)`
function copy(xJ, yJ, f) {
  if (yJ === undefined) return xJ.slice() // single-arg mode
  // dual-arg copy(yJ,f) mode: shift args and allocate xJ
  if (typeof yJ == 'function') {
    f = yJ
    yJ = xJ
    xJ = array(yJ.length)
    for (let j = 0; j < xJ.length; ++j) xJ[j] = f(yJ[j], j)
    return xJ
  }
  if (f) for (let j = 0; j < xJ.length; ++j) xJ[j] = f(yJ[j], j)
  else for (let j = 0; j < xJ.length; ++j) xJ[j] = yJ[j]
  return xJ
}

// NOTE: introducing additional indices js, je, ks, ke, etc can significantly slow down these functions (assigning to const or hard-coding common cases such as js=0 can help), so we minimize indices for now

// copy_at(xJ, yK, [js=0])
// copies `yK` into `xJ` starting at `js`
function copy_at(xJ, yK, js = 0) {
  js = Math.max(0, js)
  if (js == 0) for (let k = 0; k < yK.length; ++k) xJ[k] = yK[k]
  else for (let k = 0; k < yK.length; ++k) xJ[js + k] = yK[k]
  return xJ
}

function _benchmark_copy_at() {
  let yJ = array(1000, Math.random)
  let xJ = array(1000)
  benchmark(() => copy_at(xJ, yJ, 0))
}

// each(xJ, f, [js=0], [je=J])
// invokes `f(x,j)` for each `x` in `xJ`
function each(xJ, f, js = 0, je = xJ.length) {
  js = Math.max(0, js)
  je = Math.min(je, xJ.length)
  for (let j = js; j < je; ++j) f(xJ[j], j)
  return xJ
}

// scan(xJ, f, [js=0], [je=J])
// invokes `f(j,x)` for each `x` in `xJ`
function scan(xJ, f, js = 0, je = xJ.length) {
  js = Math.max(0, js)
  je = Math.min(je, xJ.length)
  for (let j = js; j < je; ++j) f(j, xJ[j])
  return xJ
}

// invokes `f(j)` for `j=0,…,J-1`
const repeat = (J, f) => {
  for (let j = 0; j < J; ++j) f(j)
}

function _benchmark_each() {
  const xJ = array(1000, Math.random)
  const J = xJ.length
  benchmark(
    () => xJ.forEach(x => x),
    () => each(xJ, x => x),
    () => scan(xJ, j => j),
    () => repeat(J, j => j),
    () => {
      for (let j = 0; j < J; ++j) {}
    }
  )
}

const _benchmark_each_functions = ['each', 'scan', 'repeat']

// map(xJ, yJ, f, [js=0], [je=J])
// maps `yJ` into `xJ` as `f(x,y,j)`
function map(xJ, yJ, f, js = 0, je = xJ.length) {
  js = Math.max(0, js)
  je = Math.min(je, xJ.length)
  for (let j = js; j < je; ++j) xJ[j] = f(xJ[j], yJ[j], j)
  return xJ
}

// apply(xJ, f, [js=0], [je=J])
// applies `f(x,j)` to `xJ`
const apply = (xJ, f, js = 0, je = xJ.length) => {
  js = Math.max(0, js)
  je = Math.min(je, xJ.length)
  for (let j = js; j < je; ++j) xJ[j] = f(xJ[j], j)
  return xJ
}

// swaps `x<=>y` as `x = swap(y, y=x)`
// `apply+swap` can be faster than `map` or `copy`
// e.g. `xJ = swap(apply(yJ,y=>y*y), yJ=xJ)`
function swap(y, y_x) {
  if (y_x === undefined || y == y_x)
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
    () => ([x, y] = [y, x])
  )
}

function _benchmark_map() {
  let yJ = array(1000, Math.random)
  let xJ = array(1000)
  benchmark(
    () => map(xJ, yJ, (x, y) => x + y),
    () => map(xJ, yJ, (x, y) => y * y),
    () => map(array(1000), yJ, (x, y) => y * y),
    () => copy(xJ, yJ, y => y * y),
    () => copy(yJ, y => y * y),
    () => apply(yJ, y => y * y),
    () =>
      (xJ = swap(
        apply(yJ, y => y * y),
        (yJ = xJ)
      )),
    () => yJ.map(y => y * y)
  )
}

const _benchmark_map_functions = ['map', 'apply']
