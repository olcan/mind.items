// loads given url string(s)
// flattens out arrays, skips non-strings
// resolves any Promise arguments simultaneously with url loads
//   (allows simultaneous custom init besides url loading)
// loads each url at most once per page: concurrent and repeated loads of
//   a url share its pending or completed load, kept per url in this
//   item's store (store.loading); a failed load is forgotten so a later
//   call retries
// undefined on non-window contexts (e.g. web workers)
if (typeof window != 'undefined') {
  window._load = (...urls) => {
    const args = _.flattenDeep([...urls])
    const loading = (_item('$id').store.loading ??= new Map()) // url -> promise
    return Promise.all(args.filter(u=>(typeof u === 'string')).map(src => {
      if (loading.has(src)) return loading.get(src)
      const start = Date.now()
      console.debug(`loading url '${src}' ...`)
      const load = new Promise((resolve, reject) => {
        let script = document.createElement('script')
        script.src = src
        script.onload = () => {
          console.debug(`loaded url '${src}' in ${Date.now()-start}ms`)
          resolve()
        }
        script.onerror = (e) => {
          loading.delete(src) // forget failed load so a later call retries
          reject(e)
        }
        document.head.appendChild(script)
      })
      loading.set(src, load)
      return load
    }).concat(args.filter(u=> u instanceof Promise)))
  }
}
