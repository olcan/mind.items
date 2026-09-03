#template/vault renders vault files synced as `#vault/…` items by the vault's mind sync (design `notes/design/mind_sync.md` in the vault repo): the editable file in a `jinja_removed` block, the vault's pinned-HEAD preview in an opaque `vault_removed` payload, navigation split at standalone embed markers into toggles over sibling items, and exactly one semantic field in the expanded context. Managed items declare their sibling dependencies as hidden `#_vault/…` tags; this item is their renderer dependency.
<<js_table()>>

```js_removed:vault.js
// vault.js
```

#_///template
