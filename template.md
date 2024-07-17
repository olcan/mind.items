#template defines utilities for templatized content in _template items_ such as #/example. Delimiters `<!-- template -->` and `<!-- /template -->` are required to separate the template content where _placeholder macros_ may be used.  
<<js_table()>>

```js_removed:template.js
// template.js
```

```css_removed:template.css
// template.css
```

```js_init_removed
function _init() {
  document.head.insertAdjacentHTML("beforeend", "<style>" +
    _this.read('css') + "</style>") // see below
}
```

#_util/core #_autodep #_init
#_/example #_/example/usage <!-- dependents for /_install -->