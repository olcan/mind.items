#template/example <!-- template --> This is an example template demonstrating various types of placeholder macros:
- Dictionary-based `field(…)` macros: <<field('dict_1')>>, <<field('dict_2')>>
- Generic code-based macros: <<var_1>>, <<func('1')>>
- Modal macro: <<modal('hello modal', 'modal')>>
- Toggle macro: <<toggle('hello toggle', 'toggle')>>
<<usage?'See [usage](#template/example/usage) for example usage.':''>>
<!-- /template -->

```js_removed
let var_1 = placeholder('var_1') // use let to allow override in template()
let func = suffix => placeholder('func_' + suffix)
let usage = true
```