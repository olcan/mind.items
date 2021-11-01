// read
const read = (...args) => _this.read(...args)

// read_deep
const read_deep = (...args) => _this.read_deep(...args)

// write
const write = (...args) => _this.write(...args)

// clear
const clear = (...args) => _this.clear(...args)

// remove
const remove = (...args) => _this.remove(...args)

// => item.delete
// deletes `item`
// _can't be aliased_
const __delete = (...args) => _this.delete(...args)

// => item.eval(code,[options])
// evaluates `code` in context of `item`
// _can't be aliased_
const __eval = (...args) => _this.eval(...args)

// get_log
const get_log = (...args) => _this.get_log(...args)

// write_log
const write_log = (...args) => _this.write_log(...args)

// write_log_any
const write_log_any = (...args) => _this.write_log_any(...args)

// show_logs
const show_logs = (...args) => _this.show_logs(...args)

// touch
const touch = (...args) => _this.touch(...args)

// save
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
