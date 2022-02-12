#logger/values are simply numbers that can be parsed from text together w/ a name (e.g. `weight`), unit (e.g. `lbs`), and (optionally) a comparison operator (e.g. `=`,`<`,`>=`,etc). Values are useful as basic syntax for commands that record observations for personal #events (e.g. `weight 195 lbs`). Syntax follows simple rules:
- semicolon is allowed as pre/post-delimiter
- period, comma, and colon are allowed as post-delimiter only
- commas are allowed in name (to allow lists) but not unit
- quotes/apostrophes are also allowed in name for contractions/etc
- dollar sign ($) is allowed in name for easy parsing as prefix unit
- pipe (|) is allowed in name to handle OR matching for colors

```js_removed:values.js
// values.js
```

```js_input
json(parse_values(',ok,test, 2h 30m 2m 5s, 400cal, ok <30m, 2p'))
```

```_output
[{number:2.5347222222222223,name:"ok,test",unit:"h"},{number:400,unit:"c"},{number:0.5,name:"ok",comparison:"<",unit:"h"},{number:2,unit:"p"}]
```