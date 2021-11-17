// => _Random
// random base class
// TODO: include general documentation here, e.g. why underscored? (to allow convenient and flexible global initializer functions)
// TODO: remember scoped definitions are not listed in js_table
class _Random {
  // static initializer <class>.init(...)
  // creates new instance of class w/ given args
  // works for base class _Random and all subclasses
  // seals for integrity and to force documenting properties below
  // unsealed object can still be created as new <class>
  // TODO: forward sampling mode where _init just invokes _value?
  static init(...args) {
    return Object.seal(new this.prototype.constructor(...args))
  }
  constructor() {
    // TODO: define and document properties ...
  }
}
const Random = (...args) => _Random.init(...args)

const is_random = x => x instanceof _Random

const value = x => (is_random(x) ? x.value : x)

const value_deep = x => (is_random(x) ? value_deep(x.value) : x)
