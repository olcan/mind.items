// array([J=0],[x])
// array `xJ` of length `J`
// `x` can be given to fill as `xJ[j]=x ∀j`
// `x` can be a function of index, e.g. `j=>j`
// uses `Array.from` if `J` is not a number
const array = (J = 0, x) => {
  const xJ = is_number(J) ? new Array(J) : Array.from(J)
  // NOTE: Array.from({length:J}, ...) was much slower
  if (is_function(x)) for (let j = 0; j < J; ++j) xJ[j] = x(j)
  else if (defined(x)) xJ.fill(x)
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
    () => array(100),
    () => array(100, 0),
    () => array(100, j => j),
    () => Array.from({ length: 100 }),
    () => Array.from({ length: 100 }, j => j)
  )
}

const zeroes = J => array(J, 0)
const ones = J => array(J, 1)

// NOTE: using min/max to bound js/je enables significant speedup in benchmarks

// fill(xJ, x, [js=0], [je=J])
// fills `xJ` as `xJ[j]=x ∀j`
// `x` can be a function of index, e.g. `j=>j`
function fill(xJ, x, js = 0, je = xJ.length) {
  js = Math.max(0, js)
  je = Math.min(je, xJ.length)
  if (is_function(x)) for (let j = js; j < je; ++j) xJ[j] = x(j)
  else for (let j = js; j < je; ++j) xJ[j] = x // can be undefined
  return xJ
}

// remove(xJ, [x], [js=0], [je=J])
// removes all `x` from `xJ`
// `x` can be a predicate (boolean) function `(xj,j)=>…`
// `x` can be `undefined` (or omitted)
// uses `===` for comparisons
function remove(xJ, x, js = 0, je = xJ.length) {
  js = Math.max(0, js)
  je = Math.min(je, xJ.length)
  let jj = js - 1
  if (is_function(x)) {
    for (let j = js; j < je; ++j) {
      if (x(xJ[j], j)) continue // skip match
      if (++jj == j) continue // no match yet
      xJ[jj] = xJ[j]
    }
  } else {
    for (let j = js; j < je; ++j) {
      if (xJ[j] === x) continue // skip match
      if (++jj == j) continue // no match yet
      xJ[jj] = xJ[j]
    }
  }
  copy_at(xJ, xJ, ++jj, je) // copy any tail
  xJ.length = jj + (xJ.length - je)
  return xJ
}

function _test_remove() {
  check(
    () => [remove([]), []],
    () => [remove([0]), [0]],
    () => [remove([undefined, 0, undefined]), [0]],
    () => [remove([undefined, 0, undefined, 1, 2], undefined, 0, 3), [0, 1, 2]],
    () => [remove([undefined, 0, undefined, 1, 2], x => !x, 0, 3), [1, 2]]
  )
}

function _benchmark_remove() {
  const xJ = zeroes(100)
  apply(xJ, (x, j) => (j % 2 == 0 ? 1 : x))
  benchmark(
    () => remove(xJ.slice(), 1),
    () => remove(xJ.slice(), x => x === 1),
    () => _.remove(xJ.slice(), x => x === 1),
    () => _.pull(xJ.slice(), 1)
  )
}

// copy(xJ, [yJ], [f], [g])
// copies `xJ` into new array
// can copy `yJ` into existing `xJ`
// can map copied elements as `f(x,j)`
// can filter copied elements via `g(x,j)`
function copy(xJ, yJ, f, g) {
  if (yJ === undefined) return xJ.slice() // single-arg mode
  // single-array mode: shift args and allocate xJ
  if (!yJ || is_function(yJ)) return copy(array(xJ.length), ...arguments)
  if (xJ.length != yJ.length) xJ.length = yJ.length // resize xJ if needed
  // filter mode; use function g to filter yJ into (resized) xJ
  if (g) {
    let jx = 0
    if (f) {
      for (let j = 0; j < xJ.length; ++j)
        if (g(yJ[j], j)) xJ[jx++] = f(yJ[j], j)
    } else {
      for (let j = 0; j < xJ.length; ++j) if (g(yJ[j], j)) xJ[jx++] = yJ[j]
    }
    xJ.length = jx
    return xJ
  }
  if (f) for (let j = 0; j < xJ.length; ++j) xJ[j] = f(yJ[j], j)
  else for (let j = 0; j < xJ.length; ++j) xJ[j] = yJ[j]
  return xJ
}

// copy_at(xJ, yK, [js=0], [ks=0], [ke=K])
// copies `yK[ks…ke-1]` into `xJ[js…]`
function copy_at(xJ, yK, js = 0, ks = 0, ke = yK.length) {
  js = Math.max(0, js)
  ks = Math.max(0, ks)
  ke = Math.min(ke, yK.length)
  if (js == 0 && ks == 0) for (let k = ks; k < ke; ++k) xJ[k] = yK[k]
  else if (js == 0) for (let k = ks; k < ke; ++k) xJ[k - ks] = yK[k]
  else if (ks == 0) for (let k = ks; k < ke; ++k) xJ[js + k] = yK[k]
  else for (let k = ks; k < ke; ++k) xJ[js + k - ks] = yK[k]
  return xJ
}

function _benchmark_copy_at() {
  let yJ = array(1000, Math.random)
  let xJ = array(1000)
  benchmark(
    () => copy_at(xJ, yJ, 0),
    () => copy_at(xJ, yJ, 500),
    () => copy_at(xJ, yJ, 500, 500),
    () => copy(xJ, yJ)
  )
}
const _benchmark_copy_at_functions = ['copy_at', 'copy']

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

// map2(xJ, yJ, f, [js=0], [je=J])
// maps `yJ` into `xJ` as `f(x,y,j)`
function map2(xJ, yJ, f, js = 0, je = xJ.length) {
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
  if (y == y_x) fatal('expected usage is x=swap(y,y=x) for distinct x,y')
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
      y = tmp
    },
    () => ([x, y] = [y, x])
  )
}

function _benchmark_map2() {
  let yJ = array(1000, Math.random)
  let xJ = array(1000)
  benchmark(
    () => map2(xJ, yJ, (x, y) => x + y),
    () => map2(xJ, yJ, (x, y) => y * y),
    () => map2(array(1000), yJ, (x, y) => y * y),
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
