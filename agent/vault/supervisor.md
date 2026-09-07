#agent/vault/supervisor is the _supervisor_ persona of the [vault chat agent](#agent/vault): claude-opus-5, read-only at the vault root (file tools, no web), with the supervisor tools that act through the bridge's own registry: list the executing runs and the undecided proposals, read a run's activity, stop a run, post a status line, progress, or note (shown on #vault and the chat item), and retire a proposal (reject, or accept when the owner pre-approved it: the merge runs the worktree's gates first). It acts only with a stated reason and otherwise advises (registry `agents/bridge.toml` `[supervisor]`, cost limit $5). Use `/supervisor <msg>` (item #chat/supervisor).

```js_input_removed
// vault agents run on the vault host, which listens for requests and appends
// replies via firestore sync; nothing runs web-side (this inert block satisfies
// the #agent framework, which runs every #agent/* item as an agent item)
```