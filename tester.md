#tester tests items that define functions `_test_*()`.
- Can be defined in any blocks matching `js|js_tests?`.
- Can be associated w/ functions w/ different names:
  - Define `const _test_*_functions = [...names]`.
- Run automatically on any changes to item.
- Tests named `_test_live_*` (e.g. tests hitting network APIs) are excluded from
  automatic and default `/test` runs; select them via `pattern`, e.g. `/test #item live`.
- Can be run manually as `/test [items] [pattern]`:  
<< command_table() >>

```js_removed:tester.js
// tester.js
```

#_listen #_util/core