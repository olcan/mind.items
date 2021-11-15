#tester tests items that define functions `_test_*()`.
- Can be defined in any blocks matching `js|js_tests?`.
- Can be associated w/ functions w/ different names:
  - Define `const _test_*_functions = [...names]`.
- Run automatically on any changes to item.
- Can be run manually as `/test [items]`:  
<< command_table() >>

```js_removed:tester.js
// tester.js
```

#_listen #_util/core
