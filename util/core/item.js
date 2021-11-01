// read
// comment here
const read = (...args) => _this.read(...args)
const read_deep = (...args) => _this.read_deep(...args)
const write = (...args) => _this.write(...args)
const clear = (...args) => _this.clear(...args)
const remove = (...args) => _this.remove(...args)

// => item.delete
// deletes `item`
// `delete` _can't be aliased_
const __delete = (...args) => _this.delete(...args)

// => item.eval(code,[options])
// evaluates `code` in context of `item`
// `eval` _can't be aliased_
const __eval = (...args) => _this.eval(...args)

const get_log = (...args) => _this.get_log(...args)
const write_log = (...args) => _this.write_log(...args)
const write_log_any = (...args) => _this.write_log_any(...args)
const show_logs = (...args) => _this.show_logs(...args)
const touch = (...args) => _this.touch(...args)
const save = (...args) => _this.save(...args)

const start = (...args) => _this.start(...args)
const invoke = (...args) => _this.invoke(...args)
const attach = (...args) => _this.attach(...args)
const dispatch = (...args) => _this.dispatch(...args)
const dispatch_task = (...args) => _this.dispatch_task(...args)
const cancel_task = (...args) => _this.cancel_task(...args)
const promise = (...args) => _this.promise(...args)
const resolve = (...args) => _this.resolve(...args)

const debug = (...args) => _this.debug(...args)
const log = (...args) => _this.log(...args)
const info = (...args) => _this.info(...args)
const warn = (...args) => _this.warn(...args)
const error = (...args) => _this.error(...args)
const fatal = (...args) => _this.fatal(...args)

const delay = (...args) => _this.delay(...args)
const images = (...args) => _this.images(...args)
const cached = (...args) => _this.cached(...args)
const validate_cache = (...args) => _this.validate_cache(...args)
const invalidate_cache = (...args) => _this.invalidate_cache(...args)
const invalidate_elem_cache = (...args) => _this.invalidate_elem_cache(...args)
const save_local_store = (...args) => _this.save_local_store(...args)
const save_global_store = (...args) => _this.save_global_store(...args)
