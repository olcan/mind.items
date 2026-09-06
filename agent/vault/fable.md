#agent/vault/fable is the _fable_ persona of the [vault chat agent](#agent/vault): Claude Fable 5.1 at maximum effort on the vault host's subscription runtime (vault registry `agents/bridge.toml`, config `agents/fable5p1_max_agent.md`, cost limit $10). Tag a chat item `#agent/vault/fable` (visible or hidden) and end it with a `\<<user>>` message, or use the `/fable` [chat command](#chat/fable); replies arrive as `\<<agent('vault/fable · run …')>>`. Personas resolve on the trusted vault side; this item exists so the persona tag has one uniquely labelled item to depend on (a hidden tag without one is a missing dependency).

```js_input_removed
// vault agents run on the vault host, which listens for requests and appends
// replies via firestore sync; nothing runs web-side (this inert block satisfies
// the #agent framework, which runs every #agent/* item as an agent item)
```