// => item.eval(code,…)
// evaluates `code` in context of `item`
// _invoke on item, can't be aliased for `_this`_
// | `code`  | string  | | code to evaluate
// | `type`  | string  | `js` | prefix code block type
// | `async` | bool | `false` | async mode
// | `async_simple`   | bool | `false` | async w/o `start(…)` wrapper
// | `debug`          | bool | `false` | eval w/o any wrappers
// | `exclude_prefix` | bool | `false` | eval w/o prefix code
// | `trigger`        | string  | `other` | eval trigger name
const __eval = (...args) => _this.eval(...args)

// read([type],…)
// reads text from item
// reads from block `type` or _whole item_ if `type==''`
// concatenates multiple blocks of same `type`
// | `include_deps`       | bool | include dependencies
// | `exclude_async_deps` | bool | exclude async dependencies
// | `exclude_async`      | bool | also exclude self if async
// | `keep_empty_lines`   | bool | keep empty lines
// | `replace_ids`        | bool | replace `$id` w/ item ids
// | <td colspan=3 style="text-align:center"> all options default to `false`</td>
const read = (...args) => _this.read(...args)

// read_deep(type,…)
// reads from block `type` in item _+ dependencies_
// concatenates blocks of same `type`
const read_deep = (...args) => _this.read_deep(...args)

// read_input(type,…)
// reads _input_ for `type` from item _+ dependencies_
// reads `<type>_input` from item, `type` from deps
const read_input = (...args) => _this.read_input(...args)

// write(text,[type],…)
// writes `text` to block `type` in item
// default block `type` is `'_output'`
// writes _whole item_ if `type==''`
const write = (...args) => _this.write(...args)

// clear(type)
// clears (empties) `type` blocks
const clear = (...args) => _this.clear(...args)

// remove(type)
// removes `type` blocks
const remove = (...args) => _this.remove(...args)

// => item.delete
// deletes `item` ___permanently___
// confirmed only for `#named` items
// _can't be aliased for `_this`_
const __delete = (...args) => _this.delete(...args)

// get_log(…)
// returns log messages for item
// |`source` | string   | `self*`, `any`, item `#name` or id
// |         |          | append `?` to include unknown (empty stack)
// |`level`  | string   | `debug`, `info*`, `log`, `warn`, `error`
// |`since`  | string   | `run*`, `eval`, or ms since epoch
// |`filter` | function | custom predicate, passed object `{time,level,stack,type,text}`
// |         |          | `*` indicates defaults
const get_log = (...args) => _this.get_log(...args)

// write_log(…)
// writes log messages into item
// | `type` | output block type, default `'_log'`
// | ...    | same options as `get_log`
const write_log = (...args) => _this.write_log(...args)

// write_log_any(…)
// writes all log messages into item
// same options as `write_log`
// default `source` is `'any'`
const write_log_any = (...args) => _this.write_log_any(...args)

// show_logs([t=15000])
// show logs (`_log` block) in item
// autohide after `t` ms or never if `t<0`
const show_logs = (...args) => _this.show_logs(...args)

// touch([save=false])
// _touches_ item by updating its time
// optionally saves item
const touch = (...args) => _this.touch(...args)

// save()
// saves item
const save = (...args) => _this.save(...args)

// start
const start = (...args) => _this.start(...args)

// invoke
const invoke = (...args) => _this.invoke(...args)

// attach
const attach = (...args) => _this.attach(...args)

// dispatch
const dispatch = (...args) => _this.dispatch(...args)

// dispatch_task
const dispatch_task = (...args) => _this.dispatch_task(...args)

// cancel_task
const cancel_task = (...args) => _this.cancel_task(...args)

// promise
const promise = (...args) => _this.promise(...args)

// resolve
const resolve = (...args) => _this.resolve(...args)

// debug
const debug = (...args) => _this.debug(...args)

// log
const log = (...args) => _this.log(...args)

// info
const info = (...args) => _this.info(...args)

// warn
const warn = (...args) => _this.warn(...args)

// error
const error = (...args) => _this.error(...args)

// fatal
const fatal = (...args) => _this.fatal(...args)

// delay
const delay = (...args) => _this.delay(...args)

// images
const images = (...args) => _this.images(...args)

// cached
const cached = (...args) => _this.cached(...args)

// validate_cache
const validate_cache = (...args) => _this.validate_cache(...args)

// invalidate_cache
const invalidate_cache = (...args) => _this.invalidate_cache(...args)

// invalidate_elem_cache
const invalidate_elem_cache = (...args) => _this.invalidate_elem_cache(...args)

// save_local_store
const save_local_store = (...args) => _this.save_local_store(...args)

// save_global_store
const save_global_store = (...args) => _this.save_global_store(...args)
