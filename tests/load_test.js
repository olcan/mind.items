#!/usr/bin/env node
// plain-node table for _load (load.js): url strings are flattened and loaded through appended
// script tags in order, non-strings are skipped (the `self.lib || url` guard), promise arguments
// resolve alongside, and each url loads at most once per page: concurrent calls share its pending
// load, later calls its completed one (also across re-evaluations of load.js, which runs as the
// dependency prefix of every evaluation of a #_load dependent; the registry is the #load item's
// in-memory store.loading, a Map from url to promise), and a failed load is forgotten so that the
// next call retries it. run: node tests/load_test.js
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const src = fs.readFileSync(path.join(__dirname, '..', 'load.js'), 'utf8')

// evaluates load.js against a fake page; evaluating again re-defines _load on the same window,
// and _item('$id') resolves to the page's #load item (the app replaces $id per item at read time)
const evaluate = (window, page) => {
  const _ = { flattenDeep: xs => xs.flat(Infinity) }
  const _item = () => page.item
  new Function('window', 'document', '_', 'console', '_item', src)(window, page.document, _, page.console, _item)
}
const fake = () => {
  const page = { scripts: [], logs: [], item: { store: {} } } // script tags, console.debug lines, the #load item
  page.document = {
    createElement: tag => ({ tag }),
    head: { appendChild: script => page.scripts.push(script) },
  }
  page.console = { debug: msg => page.logs.push(msg) }
  const window = {}
  evaluate(window, page)
  page.srcs = () => page.scripts.map(s => s.src)
  page.loading = () => page.logs.filter(l => l.startsWith('loading url')).length
  return { window, page }
}

;(async () => {
  // a non-window context defines nothing
  assert.doesNotThrow(() => evaluate(undefined, fake().page))

  // one call: each url appended once in order, non-strings skipped, promise arguments alongside
  const { window, page } = fake()
  const custom = Promise.resolve('init')
  const first = window._load(['a', ['b', 'a']], undefined, null, { lib: true }, 'b', custom)
  assert.deepEqual(page.srcs(), ['a', 'b'], 'each url appended once')
  assert.equal(page.loading(), 2, 'one loading line per appended script')

  // a concurrent call shares the pending loads and appends only the new url
  const second = window._load('a', 'c')
  assert.deepEqual(page.srcs(), ['a', 'b', 'c'])
  page.scripts.forEach(s => s.onload())
  assert.deepEqual(await first, [undefined, undefined, undefined, undefined, 'init'])
  assert.deepEqual(await second, [undefined, undefined])
  assert.equal(page.logs.filter(l => /^loaded url '[abc]' in \d+ms$/.test(l)).length, 3)

  // a later call shares the completed loads: nothing appended, resolves
  assert.deepEqual(await window._load('a', ['b', 'c']), [undefined, undefined, undefined])
  assert.deepEqual(page.srcs(), ['a', 'b', 'c'])

  // a re-evaluation of load.js (the dependency prefix of another evaluation) keeps the page's loads
  evaluate(window, page)
  assert.equal(page.item.store.loading.size, 3, 'the registry is the item store')
  assert.deepEqual(await window._load('a'), [undefined])
  assert.deepEqual(page.srcs(), ['a', 'b', 'c'])
  assert.equal(page.loading(), 3)

  // a failed load rejects every sharer and is forgotten: the next call retries it
  const failed = window._load('bad')
  const sharer = window._load('bad')
  assert.deepEqual(page.srcs(), ['a', 'b', 'c', 'bad'])
  const error = new Error('404')
  page.scripts[3].onerror(error)
  await assert.rejects(failed, e => e === error)
  await assert.rejects(sharer, e => e === error)
  const retried = window._load('bad')
  assert.deepEqual(page.srcs(), ['a', 'b', 'c', 'bad', 'bad'], 'retried by a new script')
  page.scripts[4].onload()
  assert.deepEqual(await retried, [undefined])
  assert.equal(page.loading(), 5)

  console.log('ok')
})().catch(e => {
  console.error(e)
  process.exit(1)
})
