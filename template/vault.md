#template/vault renders vault files synced as `#vault/…` items by the vault's mind sync (design `notes/design/mind_sync_store.md` in the vault repo, over `notes/design/mind_sync.md`): the editable file in a `jinja_removed` block of the item, the vault's pinned snapshot (the pinned source and the pinned-HEAD preview) under the `_vault` key of the item's hidden store (read through the non-saving `_global_store` accessor), navigation split at standalone embed markers into toggles over sibling items, a live badge comparing the editable source with the stored snapshot, and exactly one semantic field in the expanded context. Managed items declare their sibling dependencies as hidden `#_vault/…` tags; this item is their renderer dependency.
<<js_table()>>

```js_removed:vault.js
// vault.js
```

#_///template
