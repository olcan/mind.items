#agent/native is retired — renamed to #agent/vault. The vault bridge still reads the legacy `#agent/native` route indefinitely, so dormant conversations under the old tag keep working; new items should tag `#agent/vault`. This permanent tombstone keeps updates clean for accounts that still hold the item.

```js_input_removed
// inert block satisfying the #agent framework, which runs every #agent/* item
// as an agent item (see #agent/vault; nothing runs web-side for the bridge)
```
