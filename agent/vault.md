#agent/vault is a _vault chat agent_: the request/reply protocol of a _[chat](#chat) agent_ with the vault host behind it instead of a model api. Tag a chat item `#agent/vault` (visible or hidden) and end it with a `\<<user>>` message; a listener on the vault host appends a signed reply, e.g. `\<<agent('vault/default')>>`, and a failure is a reply too.

`/vault` (#chat/vault) is the one command: it starts the supervisor, read-only at the vault root, which does the work through a worker in the chat's own worktree and reports on the chat item and on #vault; the owner merges the chat's proposal through #vault or by telling the supervisor. Other `#agent/vault/<name>` tags are retired: their conversations stay readable, nothing replies.

```js_input_removed
// nothing runs web-side; this inert block satisfies the #agent framework, which runs every #agent/* item as an agent item
```

Status: **live** (dispatcher `bin/mind_bridge_v2.py`, registry `agents/bridge.toml`, in the vault).