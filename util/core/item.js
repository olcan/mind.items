// => _Item
// class for all items
// as returned by `_item(…)`, `_items(…)`, `_create(…)`, etc
// extendable as `_Item.prototype.method = function(…) { … }`
// can be `null` in non-window contexts, e.g. web workers
const _Item = typeof _this != 'undefined' ? _this.constructor : null
const is_item = x => x instanceof _Item

// => item.eval(js,{…})
// evaluates `js` in context of `item`
// _invoke on item; can't be aliased for `_this`_
// | `type`           | string  | `js` | prefix code block type
// | `async`          | bool | `false` | async mode
// | `async_simple`   | bool | `false` | async w/o `start(…)` wrapper
// | `debug`          | bool | `false` | eval w/o any wrappers
// | `exclude_prefix` | bool | `false` | eval w/o prefix code
// | `trigger`        | string  | `other` | eval trigger name
// | `skip_eval`      | bool  | `false` | skip eval, just return (expanded) code
// forwards options to `read` for code prefix w/ modified defaults:
// | `exclude_async_deps`          | `!async`,
// | `replace_ids`                 | `true`
// | `remove_empty_lines`          | `true`
// | `remove_comment_lines`        | `true`
// | `remove_tests_and_benchmarks` | `true`
const __eval = (...args) => _this.eval(...args)

// read([type=''],{…})
// reads text from item
// reads _whole item_ if `type==''` (default)
// `type` can indicate block(s) to read, e.g. `js`
// `type` can be regex, e.g. `js|js_tests?`
// blocks matching `type` are concentenated
// | `include_deps`         | `false` | include dependencies
// | `exclude_async_deps`   | `false` | exclude async dependencies
// | `exclude_async`        | `false` | also exclude self if async
// | `comment_deps`         | `false` | include delimiter comments
// | `replace_items`        | `false` | replace items for this read
// | `eval_macros`          | `false` | evaluate `\<<macros>>`
// | `replace_ids`          | `false` | replace `$id` (w/ item.id)
// | `remove_empty_lines`   | `false` | remove empty lines
// | `remove_comment_lines` | `false` | remove comment lines (`js` only)
// | `remove_tests_and_benchmarks` | `false` | remove tests & benchmarks (`js` only)
// | `remove_hidden`        | `false` | remove hidden sections (whole item only)
// | `remove_removed`       | `false` | remove "removed" sections (whole item only)
// | `remove_blocks`        | `''`    | remove specified blocks (whole item only)
const read = (...args) => _this.read(...args)

// read_deep(type,{…})
// reads from block `type` in item _& dependencies_
// uses `include_deps=true` by default
// other options same as `read`
const read_deep = (...args) => _this.read_deep(...args)

// read_input(type,{…})
// reads _input_ for `type` from item _& dependencies_
// reads `<type>_input` from item, `type` from deps
// options are same as `read` w/ defaults modified as follows:
// | `replace_ids`                 | `true`
// | `remove_empty_lines`          | `true`
// | `remove_comment_lines`        | `true`
// | `remove_tests_and_benchmarks` | `true`
const read_input = (...args) => _this.read_input(...args)

// write(text,[type],{…})
// writes `text` to block `type` in item
// default block `type` is `'_output'`
// writes _whole item_ if `type==''`
// | `keep_time` | bool | `false` | write w/o updating time
// | `skip_save` | bool | `false` | write w/o saving
const write = (...args) => _this.write(...args)

// write_lines(...lines)
// writes `lines` to item
// replaces existing item text
// `≡ write(flat(lines).filter(defined).join('\n').trim(),'')`
const write_lines = (...args) => _this.write_lines(...args)
if (_Item) {
  _Item.prototype.write_lines = function (...lines) {
    this.write(flat(lines).filter(defined).join('\n').trim(), '')
  }
}

// => item.clear(type, {…})
// clears (empties out) `type` blocks
// invoke on item; _not aliased for `_this`_
// forwards options (second argument) to `write`
const __clear = (...args) => _this.clear(...args)

// => item.remove(type, {…})
// removes `type` blocks
// invoke on item; _not aliased for `_this`_
// forwards options (second argument) to `write`
const __remove = (...args) => _this.remove(...args)

// => item.delete()
// deletes `item` ___permanently___
// confirmed only for `#named` items
// invoke on item; _can't be aliased for `_this`_
const __delete = (...args) => _this.delete(...args)

// get_log({…})
// log messages for item
// |`source` | string   | `self`, `any`, item `#name` or id
// |         |          | append `?` to include unknown (empty stack)
// |         |          | _default_: `self?` (from self or unknown sources)
// |`level`  | string   | `debug`, `info*`, `log`, `warn`, `error`
// |`since`  | string   | `eval*`, `run`, or ms since epoch
// |`filter` | function | custom predicate, passed object `{time,level,stack,type,text}`
// |`last`   | bool     | last matching entry pre-filter? (_additive_ w/ `filter`)
// |         |          | `*` indicates defaults
const get_log = (...args) => _this.get_log(...args)

// write_log({…})
// writes log messages into item
// takes default options from `_this.log_options`
// | `type` | output block type, default `'_log'`
// | ...    | options for `get_log` and `write`
const write_log = (...args) => _this.write_log(...args)

// show_logs([t=15000])
// show logs (`_log` block) in item
// autohide after `t` ms or never if `t<0`
const show_logs = (...args) => _this.show_logs(...args)

// hide logs (`_log` block) in item
const hide_logs = () => _this.hide_logs()

// show_status([status], [progress])
// show `status` on running item
// item must be running (`item.running==true`)
// can also indicate `progress∈[0,1]` in background
const show_status = (...args) => _this.show_status(...args)

// clear (and hide) status on item
const clear_status = () => _this.clear_status()

// touch([save=false])
// _touches_ item by updating its time
// optionally saves item
const touch = (...args) => _this.touch(...args)

// save()
// saves item
const save = (...args) => _this.save(...args)

// start(async_func)
// starts [async](https://mindbox.io/#features/_async) evaluation in context of item
// returns promise that resolves `async_func()`
// writes logs into item via `write_log`
// takes log options via `_this.log_options`
// invokes `invalidate_elem_cache` on error
// updates `_this.running` property
// item is ___not___ on [stack](https://mindbox.io/#MindPage/core/properties/_stack) unless added explicitly
// functions below can put item onto stack or associate logs w/ item as needed
const start = (...args) => _this.start(...args)

// invoke(func)
// invokes `func` w/ item on [stack](https://mindbox.io/#MindPage/core/properties/_stack)
// forwards returns & throws from `func`
// function can be async or return promise
// invokes `invalidate_elem_cache` on error
const invoke = (...args) => _this.invoke(...args)

// attach(thing)
// _attaches_ function or promise to item
// ensures item on stack for function/promise
// wraps function to invoke via `invoke`
// wraps promise to auto-attach in then/catch/finally
// returns all other types as is
const attach = (...args) => _this.attach(...args)

// dispatch(func,[delay=0])
// invokes attached function after `delay` ms
// `≡ setTimeout(attach(func), delay)`
const dispatch = (...args) => _this.dispatch(...args)

// => dispatch_task(name, func, [delay=0], [repeat=-1])
// dispatches function as _named_ task
// named tasks are _repeatable_ and _cancellable_
// if `repeat>=0`, repeats task every `repeat` ms
// cancels any existing task under `name`!
// cancels if `func` throws error or returns `null`
// cancels (w/o invoking function) if item is deleted
// modifies `repeat` (once) if `func` returns number ≥ 0
// function `func` can be async or return promise
const dispatch_task = (...args) => _this.dispatch_task(...args)

// cancel_task(name)
// cancels named task
const cancel_task = (...args) => _this.cancel_task(...args)

// pending_task(name)
// is named task pending completion? (can be waiting or running)
// can be used to avoid re-dispatch, e.g. for throttling (vs debouncing) runs
const pending_task = (...args) => _this.pending_task(...args)

// promise(func)
// new promise _attached_ to item
// `func` is _executor_ w/ args `(resolve[,reject])`
// `≡ attach(new Promise(attach(func)))`
const promise = (...args) => _this.promise(...args)

// resolve(thing)
// resolves promise _attached_ to item
// `≡ attach(Promise.resolve(thing))`
const resolve = (...args) => _this.resolve(...args)

// debug(...)
// logs debug messages to console
// associates w/ item on stack via `invoke`
// `≡ invoke(() => console.debug(...))`
const debug = (...args) => _this.debug(...args)

// print(...)
// `invoke(() => console.log(...))`
const print = (...args) => _this.log(...args)

// info(...)
// `invoke(() => console.info(...))`
const info = (...args) => _this.info(...args)

// warn(...)
// `invoke(() => console.warn(...))`
const warn = (...args) => _this.warn(...args)

// error(...)
// `invoke(() => console.error(...))`
const error = (...args) => _this.error(...args)

// fatal(...)
// throws error message w/ stack trace
const fatal = (...args) => _this.fatal(...args)

// delay(ms)
// promise w/ dispatched resolve
// `≡ promise(resolve => dispatch(resolve, ms))`
const delay = (...args) => _this.delay(...args)

// images({…})
// _uploaded_ images in item
// as sources (`src` in text), urls, or blob
// returns string array for sources
// returns promise for urls and blobs
// urls are _local_ urls for _downloaded_ images
// | `output` | `src` (default), `url`, or `blob`
const images = (...args) => _this.images(...args)

// cached(key, func)
// value _cached_ on item under `key`
// computed as `func(item)` as needed
// cache is accessible as `_this.cache`
// cleared on changes to item via `_this.deephash`
const cached = (...args) => _this.cached(...args)

// validate_cache
// validates cache for current `_this.deephash`
const validate_cache = (...args) => _this.validate_cache(...args)

// invalidate_cache
// invalidates cache (cleared on next access)
const invalidate_cache = (...args) => _this.invalidate_cache(...args)

// save_local_store
// saves `_this.local_store` to `localStorage`
const save_local_store = (...args) => _this.save_local_store(...args)

// save_global_store
// saves `_this.global_store` to firebase
const save_global_store = (...args) => _this.save_global_store(...args)

// invalidate_elem_cache({…})
// invalidates element cache for item
// can force rendering, delayed to help avoid tight render ⇄ trigger loops
// forced rendering also forces re-eval of any macros in item
// | `force_render` | `false` | force rendering of item
// | `render_delay` | `1000`  | render delay (ms)
const invalidate_elem_cache = (...args) => _this.invalidate_elem_cache(...args)

// elem([selector])
const elem = s => (!s ? _this.elem : _this.elem?.querySelector(s))

// elems(selector)
const elems = s => _this.elem?.querySelectorAll(s)
