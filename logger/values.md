#logger/values are simply numbers that can be parsed from text together w/ a name (e.g. `weight`), unit (e.g. `lbs`), and (optionally) a comparison operator (e.g. `=`,`<`,`>=`,etc). Values are useful as basic syntax for commands that record observations for personal #events (e.g. `weight 195 lbs`). Syntax follows simple rules:
- semicolon is allowed as pre/post-delimiter
- period, comma, and colon are allowed as post-delimiter only
- commas are allowed in name (to allow lists) but not unit
- quotes/apostrophes are also allowed in name for contractions/etc
- dollar sign ($) is allowed in name for easy parsing as prefix unit
- pipe (|) is allowed in name to handle OR matching for colors

**Example**: (run for output)
```js_input
parse_values(',ok,test, 2h 30m 2m 5s, 400cal, ok <30m, 2p')
```
```js_removed:values.js
// values.js
```