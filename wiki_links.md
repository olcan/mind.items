#wiki_links opens a `[[path]]` or `[[path|text]]` reference in an item as a file in the editor, through the handler this account configures. `/wiki_links <url> [root]` sets the handler: `url` its address, for the vault's VS Code extension `vscode-insiders://olcan.auto-open-obsidian/link/{link}` (`vscode://…` for the stable build), `root` the absolute path the files resolve under on the editor's host (optional: the editor's open folder otherwise); `/wiki_links off` clears it, `/wiki_links` alone shows it. Where the url holds `{link}` (once, in its path), the app writes a link's path, the root and its view there as one packed text and appends no query: nothing between the page and the handler then reads a path's own characters as a field, and a `[[path#diff]]` reference asks the handler for the path's diff instead of the file (the vault's extension opens a proposal's review for `[[worktrees/<name>#diff]]`, one file's diff for `[[worktrees/<name>/<path>#diff]]`, and for any other file or folder what it holds that is not committed yet). A url without `{link}` gets `?path=…` and `&root=…` appended instead and carries no view: `#diff` is then dropped like any other fragment. The app renders the links only under the setting, and every renderer (the items, the frames of bridge replies, the `#template/vault` projections, the `#vault` tables, the todoer's rows) writes the one anchor the app builds; a path is relative to the root, `.md` implied (`[[docs/x]]` opens `docs/x.md`); a plain reference never names a directory, and `[[folder#diff]]` is a folder's uncommitted changes.

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
