#python enables running native (transpiled) `python_input` via [Brython](https://github.com/brython-dev/brython). See #/example.
```js
if (!window.$B) {
  const _brython = 'https://cdn.jsdelivr.net/npm/brython@3.12.4'
  await _load(_brython + '/brython.min.js',
              _brython + '/brython_stdlib.js')
}
```
```js_removed
// enable 'run' for python_input blocks
async function _run() {
  try {
    // note for some reason file_cache is not initialized and compiler_error
    // fails trying to get the source based on the filename, so we fix that here
    // compiler_error: https://github.com/brython-dev/brython/blob/c1e60afe5baedfbf57d30904315ea12963a1de8a/www/src/ast_to_js.js#L93
    // script_id: https://github.com/brython-dev/brython/blob/c1e60afe5baedfbf57d30904315ea12963a1de8a/www/src/brython_builtins.js#L414
    // filename: https://github.com/brython-dev/brython/blob/c1e60afe5baedfbf57d30904315ea12963a1de8a/www/src/brython_builtins.js#L400
    const script_id = '_run'
    const filename = $B.script_path + '#' + script_id // see https://github.com/brython-dev/brython/blob/c1e60afe5baedfbf57d30904315ea12963a1de8a/www/src/brython_builtins.js#L400
    // note we use read() vs read_input() as the latter drops empty/comment lines
    const python = _this.read('python_input')
    console.debug(python)
    $B.file_cache[$B.script_path + '#' + script_id] = python
    const js = $B.python_to_js(python, script_id)
    // console.debug(js)
    let globals = await _this.eval(js, {async:true, async_simple:true})
    // console.debug(ret)
    globals = _.pickBy(globals, (v,k)=>!k.startsWith('__'))
    _this.log('globals:', JSON.stringify(globals))
    // return JSON.stringify(globals)
  } catch (e) {
    if (!e.args) console.error('js error', e) // assume js error
    // note there is a lot more info in compiler_error exceptions
    // see https://github.com/brython-dev/brython/blob/c1e60afe5baedfbf57d30904315ea12963a1de8a/www/src/ast_to_js.js#L90
    // note some (most?) exceptions use $linenums
    // see https://github.com/brython-dev/brython/blob/3521d3b67cbb6029d8d25a00460eef6a83adb229/www/src/py_exceptions.js#L454
    else console.error(`#python error: ${e.args[0]} (line:${e.lineno||e.$linenums})`)
  }
}
```
#_load #_async #_autodep