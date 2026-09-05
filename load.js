// loads given url string(s)
// flattens out arrays, skips non-strings
// resolves any Promise arguments simultaneously with url loads
//   (allows simultaneous custom init besides url loading)
// undefined on non-window contexts (e.g. web workers)
if (typeof window != 'undefined') {
  window._load = (...urls) =>
    Promise.all(_.flattenDeep([...urls])
      .filter(u=>(typeof u === 'string')).map(
        src=> new Promise((resolve, reject) => {
          const start = Date.now()
          console.debug(`loading url '${src}' ...`)
          let script = document.createElement('script')
          script.src = src
          script.onload = () => {
            console.debug(`loaded url '${src}' in ${Date.now()-start}ms`)
            resolve()
          }
          script.onerror = reject
          document.head.appendChild(script)
        })).concat(_.flattenDeep([...urls])
          .filter(u=> u instanceof Promise)))
}
