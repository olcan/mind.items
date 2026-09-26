// the account's wiki links (the vault's notes/design/wiki_links.md 2.6): the setting lives in
// this item's global store (`wiki_links`: `{ url, root }`), so every device applies it; the app
// owns the validation and the rendering (window._set_wiki_links returns the accepted config,
// null for a clearing, undefined for a refused value, which is never saved)

// => /wiki_links [url|off] [root]
// shows, sets or clears the account's wiki link handler: `url` the handler's base, e.g. `vscode-insiders://olcan.auto-open-obsidian/file` (the vault's VS Code extension; `vscode://…` for the stable build), `root` the absolute path the files resolve under on the editor's host (optional: the editor's open folder otherwise); `off` clears the setting
function _on_command_wiki_links(args) {
  // the url is the first word, the root the rest of the line (a path may hold spaces)
  const line = String(args ?? '').trim()
  const space = line.search(/\s/)
  const url = space < 0 ? line : line.slice(0, space)
  const root = space < 0 ? '' : line.slice(space).trim()
  const store = _this._global_store
  if (!url) {
    alert(store.wiki_links ? `wiki links: ${_wiki_links_text(store.wiki_links)}` : 'wiki links: off (usage: /wiki_links <url> [root])')
    return
  }
  let config = null
  if (url == 'off') _set_wiki_links(null)
  else {
    config = _set_wiki_links({ url, root })
    if (!config) {
      alert(`/wiki_links: refused ${url}${root ? ' ' + root : ''} (a url is <scheme>://<host>/<path> without a query)`)
      return `/wiki_links ${args}`
    }
  }
  if (config) store.wiki_links = config
  else delete store.wiki_links
  _this.save_global_store({ invalidate_elem_cache: false }) // the app re-rendered on the change already
  alert(`wiki links: ${config ? _wiki_links_text(config) : 'off'}`)
}

const _wiki_links_text = config => config.url + (config.root ? ` under ${config.root}` : '')

// the setting applied from the store: at welcome (after the app's _init applied it before the
// first render, an equal value changes nothing) and at every change of this item's store, local
// or from another device
function _apply_wiki_links() {
  _set_wiki_links(_this._global_store.wiki_links ?? null)
}

function _on_welcome() {
  _apply_wiki_links()
}

function _on_global_store_change(id) {
  if (id != _this.id) return // another item's store
  _apply_wiki_links()
  return true // handled: no re-render of this item
}
