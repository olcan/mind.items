#wiki_links opens a `[[path]]` or `[[path|text]]` reference in an item as a file in the editor, through the handler this account configures. `/wiki_links <url> [root]` sets the handler: `url` its base, for the vault's VS Code extension `vscode-insiders://olcan.auto-open-obsidian/file` (`vscode://…` for the stable build), `root` the absolute path the files resolve under on the editor's host (optional: the editor's open folder otherwise); `/wiki_links off` clears it, `/wiki_links` alone shows it. The app renders the links only under the setting, and every renderer (the items, the frames of bridge replies, the `#template/vault` projections, the `#vault` tables, the todoer's rows) writes the one anchor the app builds; a path is relative to the root, `.md` implied (`[[docs/x]]` opens `docs/x.md`), never a directory.

```js_removed:wiki_links.js
// wiki_links.js
```

```js:js_init_removed
// the setting reaches the app before its first render (the app runs _init before rendering)
function _init() {
  _set_wiki_links(_this._global_store.wiki_links ?? null)
}
```

#_init #_welcome #_listen
