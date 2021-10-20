#install_test demonstrates `_install(item)` function.
```js
const _install = item => 
  _modal({ content:`Installed ${item.name} from ${item.attr.path}.` })
```