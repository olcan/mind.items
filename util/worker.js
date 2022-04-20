// initialize worker
// can be _closed_ using `close_worker` (see below)
// `options.imports` can be (array of) `/path` or `#item` strings
// default imports are lodash (`/lodash.min.js`) and `_this.name`
function init_worker(options = {}) {
  if (!_this.name.startsWith('#')) fatal('init_worker called from unnamed item')
  const { imports = ['/lodash.min.js', _this.name] } = options
  // create worker
  // const worker = new Worker('worker.js')
  const host = location.protocol + '//' + location.host
  const js = [
    imports.filter(s => s[0] == '/').map(s => `import '${host}/lodash.min.js'`),
    _pre_init_js(options),
    imports.filter(s => s[0] == '#').map(s => _item(s)?.read_deep('js')),
    `self.onmessage = function(e){ self.onmessage=null; eval(e.data) }`,
  ]
    .flat()
    .filter(s => s)
    .join(';\n')
  const worker = new Worker(
    URL.createObjectURL(new Blob([js], { type: 'application/javascript' })),
    { type: 'module' }
  ) // module works support import keyword
  worker.id = _hash(Date.now()) // unique id based on init time
  worker.item = _this // creator item
  worker.host = host // host url for imports
  // set up handler for messages _from_ worker
  worker.onmessage = e => {
    // handle item method calls from worker
    if (e.data.item && e.data.method) {
      // invoke method on item
      // note if any errors are thrown, call stack will not be helpful
      // corresponding worker-side errors should provide much more context
      return _item(e.data.item)?.[e.data.method]?.(...(e.data.args ?? []))
    }
    // log all other messages to console as warning
    warn(
      `non-item message from worker ${worker.id} (${worker.item.name}): ` +
        e.data
    )
    // write_log()
  }
  // initialize worker via initial eval
  function init(id, item, host, silent) {
    const start = Date.now()

    // load lodash as _ (not for module workers, which can use import keyword)
    // importScripts(host + '/lodash.min.js')
    // print(`loaded lodash (${_?.VERSION}) in ${Date.now()-start}ms`)

    // set up message handler for custom js eval via message {js:'...'}
    self.onmessage = e => {
      const { js, context } = e.data
      if (js) {
        if (context) eval(`(({${_.keys(context)}})=>(${js}))`)(context)
        else eval(`(${js})`) // parentheses required for function(){...}
      }
    }

    if (!silent) print(`initialized worker ${id} in ${Date.now() - start}ms`)
  }
  worker.postMessage(
    `(${init})('${worker.id}','${_this.name}','${host}',${options.silent})`
  )

  return worker
}

function _pre_init_js(options) {
  function pre_init(item) {
    // set up _this to redirect (most) _Item methods to initializing item
    // see #util/item for listing of _Item methods
    self._this = new Proxy(
      {},
      {
        get(target, method) {
          switch (method) {
            case 'constructor':
              return null // so _Item = null in #util/item
            case 'eval':
            case 'write':
            case 'write_lines':
            case 'clear':
            case 'remove':
            case 'delete':
            case 'write_log':
            case 'write_log_any':
            case 'show_logs':
            case 'touch':
            case 'save':
            case 'debug':
            case 'print':
            case 'log':
            case 'info':
            case 'warn':
            case 'error':
              return (...args) => postMessage({ item, method, args })
            case 'fatal':
              return (...args) => {
                postMessage({ item, method, args })
                throw new Error('stopping worker eval at fatal error')
              }
            default:
              console.error(`_Item.${method} not available in worker`)
          }
        },
      }
    )
  }
  return `(${pre_init})('${_this.name}',${options.silent})`
}

// evaluate `js` on `worker`
// `js` can be string or function
// |`deps`    | dependency item names
// |`context` | context object (can contain transferables)
// |`transfer`| transferables (e.g. typed array buffers)
// |`done`    | done message handler, can return `null` to fall back to default
// |`error`   | error message handler
function eval_on_worker(worker, js, options = {}) {
  let { deps, context, transfer, done, error } = options
  if (deps) deps = [deps].flat()
  if (transfer) transfer = [transfer].flat()
  if (typeof js == 'function') js = `(${js})()`
  if (!is_string(js)) fatal(`invalid argument js; must be function or string`)
  js = [deps?.map(s => _item(s)?.read_deep('js')), js]
    .filter(s => s)
    .join(';\n')

  // set up single-message 'done' handler if specified
  // eval must post message w/ { done:true } to trigger done handler
  // eval can also post message w/ { error:... } to reject eval promise
  // done handler simply invokes done(e) and restores default handler
  // evals are serialized (made 'sync' on worker) via worker.eval promise chain
  if (done) {
    // note we use allSettled to continue eval, assuming errors in prior evals are properly reported and handled (and trigger close/terminate of workers as appropriate), instead of propagating errors to next eval
    return (worker.eval = Promise.allSettled([worker.eval]).then(() => {
      worker.postMessage({ js, context }, transfer)
      const default_handler = worker.onmessage
      return new Promise((resolve, reject) => {
        worker.onmessage = e => {
          if (e.data.error) {
            error?.(e.data.error) // invoke error handler if any
            worker.onmessage = default_handler // restore default handler
            reject(e.data.error)
            return
          }
          if (!e.data.done) return default_handler(e) // use default until done
          try {
            if (done(e) === null) default_handler(e) // use default if null
          } catch (e) {
            // reject eval promise if done handler throws error
            // note we do not invoke error handler since error is not on worker
            worker.onmessage = default_handler // restore default handler
            reject(e)
            return
          }
          worker.onmessage = default_handler // restore default handler
          resolve() // resolve eval promise
        }
      })
    }))
  } else {
    // post async eval message
    worker.postMessage({ js, context }, transfer)
  }
}

// closes worker
// resolves any pending eval or messages, unlike `worker.terminate()`
function close_worker(worker) {
  eval_on_worker(
    worker,
    () => {
      close()
      postMessage({ done: true })
    },
    {
      done: () => {
        print(`closed worker ${worker.id} (${worker.item.name})`)
      },
    }
  )
}
