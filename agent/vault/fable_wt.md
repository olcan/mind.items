#agent/vault/fable_wt is retired — the vault's personas were folded into the single `/vault` supervisor on 2026-09-10 (see #agent/vault): conversations under this tag stay readable and are no longer requests (nothing is paid, nothing replies); start a new one with `/vault`. This permanent tombstone keeps updates clean for accounts that still hold the item.

```js_input_removed
// vault agents run on the vault host, which listens for requests and appends
// replies via firestore sync; nothing runs web-side (this inert block satisfies
// the #agent framework, which runs every #agent/* item as an agent item)
```
