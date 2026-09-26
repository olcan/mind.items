#!/usr/bin/env node
// plain-node table for the #wiki_links item (wiki_links.md, wiki_links.js; the vault's design
// notes/design/wiki_links.md 2.6): the command over a stub app (the setter's contract: the
// accepted config, null for a clearing, undefined for a refusal), what the store keeps and what
// it never keeps, the welcome and store-change applications, and the init block of the item
// text (the setting before the first render).
// run: node external/mind.items/tests/wiki_links_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const src = fs.readFileSync(path.join(__dirname, '..', 'wiki_links.js'), 'utf8')
const item = fs.readFileSync(path.join(__dirname, '..', 'wiki_links.md'), 'utf8')
const init = item.match(/```js:js_init_removed\n([\s\S]*?)\n```/)
if (!init) throw new Error('no init block in wiki_links.md')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// the stub app: the setter accepts a url with a scheme (normalizing away an empty root), refuses
// anything else, and records every call; the item saves through save_global_store
const calls = { set: [], saves: [], alerts: [] }
const store = {}
const ctx = {
  _this: { id: 'wiki-id', _global_store: store, save_global_store: opts => calls.saves.push(opts) },
  _set_wiki_links: value => {
    calls.set.push(value)
    if (value == null) return null
    if (!/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(value.url ?? '')) return undefined
    return value.root ? { url: value.url, root: value.root } : { url: value.url }
  },
  alert: text => calls.alerts.push(text),
}
vm.createContext(ctx)
vm.runInContext(src, ctx)
const reset = () => {
  calls.set.length = calls.saves.length = calls.alerts.length = 0
  for (const key of Object.keys(store)) delete store[key]
}
const cmd = (args, ...words) => vm.runInContext('_on_command_wiki_links', ctx)(args, ...words) // the app passes the line, then its words; the item reads the line

// the command
reset()
check('no setting: the usage', [cmd('', undefined), calls.alerts, calls.set, calls.saves], [undefined, ['wiki links: off (usage: /wiki_links <url> [root])'], [], []])
reset()
check('a url and a root: applied through the setter, the accepted config saved, reported', [
  cmd('x://h/f /r', 'x://h/f', '/r'), calls.set, store.wiki_links, calls.saves, calls.alerts,
], [undefined, [{ url: 'x://h/f', root: '/r' }], { url: 'x://h/f', root: '/r' }, [{ invalidate_elem_cache: false }], ['wiki links: x://h/f under /r']])
check('shown afterwards', [cmd('', undefined), calls.alerts[1]], [undefined, 'wiki links: x://h/f under /r'])
reset()
check('a root with spaces: the rest of the line, not the second word', [cmd('x://h/f /Users/o c/v', 'x://h/f', '/Users/o', 'c/v'), store.wiki_links], [undefined, { url: 'x://h/f', root: '/Users/o c/v' }])
reset()
check('a url alone: the root left out of the saved config', [cmd('x://h/f', 'x://h/f', undefined), store.wiki_links, calls.alerts], [undefined, { url: 'x://h/f' }, ['wiki links: x://h/f']])
reset()
store.wiki_links = { url: 'x://h/f' }
check('a refused url: nothing saved, the setter left as it was, the command text returned', [
  cmd('h/f /r', 'h/f', '/r'), calls.set, store.wiki_links, calls.saves, calls.alerts,
], ['/wiki_links h/f /r', [{ url: 'h/f', root: '/r' }], { url: 'x://h/f' }, [], ['/wiki_links: refused h/f /r (a url is <scheme>://<host>/<path> without a query)']])
reset()
store.wiki_links = { url: 'x://h/f' }
check('off: the setter cleared, the key gone, saved, reported', [cmd('off', 'off'), calls.set, 'wiki_links' in store, calls.saves.length, calls.alerts], [undefined, [null], false, 1, ['wiki links: off']])

// the applications from the store
reset()
store.wiki_links = { url: 'x://h/f', root: '/r' }
vm.runInContext('_on_welcome()', ctx)
check('welcome applies the store', calls.set, [{ url: 'x://h/f', root: '/r' }])
reset()
vm.runInContext('_on_welcome()', ctx)
check('welcome without a setting applies null', calls.set, [null])
reset()
store.wiki_links = { url: 'y://h/g' }
check('a change of this item\'s store applies it and is handled', [vm.runInContext("_on_global_store_change('wiki-id')", ctx), calls.set], [true, [{ url: 'y://h/g' }]])
reset()
check('another item\'s store change is ignored', [vm.runInContext("_on_global_store_change('other-id')", ctx), calls.set], [undefined, []])

// the init block: a dependency-free function over the store, the setter and _this alone
reset()
store.wiki_links = { url: 'z://h' }
const initCtx = vm.createContext({ _this: ctx._this, _set_wiki_links: ctx._set_wiki_links })
vm.runInContext(init[1] + '\n_init()', initCtx)
check('the init block applies the store before the first render', calls.set, [{ url: 'z://h' }])
reset()
vm.runInContext('_init()', initCtx)
check('the init block applies null without a setting', calls.set, [null])
check('the item declares its hooks (#_listen: the app dispatches a /command to listener items alone)', ['#_init', '#_welcome', '#_listen'].every(tag => item.includes(tag)), true)
check('the item text spells no macro (it declares no dependency to evaluate one)', /<</.test(item), false)

if (failures) {
  console.log(`${failures} FAILED`)
  process.exit(1)
}
console.log('all ok')
