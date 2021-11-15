#benchmarker benchmarks items that define functions `_benchmark_*()`.
- Can be defined in any blocks matching `js|js_benchmarks?`.
- Can be associated w/ functions w/ different names:
  - Define `const _benchmark_*_functions = [...names]`.
- Run automatically on any changes to item.
- Can be run manually as `/benchmark [items]`:  
<< command_table() >>

```js_removed:benchmarker.js
// benchmarker.js
```

#_listen #_util/core