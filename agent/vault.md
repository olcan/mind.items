#agent/vault is a _vault chat agent_: the request/reply protocol of a _[chat](#chat) agent_, with a vault host behind it instead of a model api. Tag a chat item `#agent/vault` (visible or hidden) and end it with a `\<<user>>` message; a listener on the vault host appends a signed reply, e.g. `\<<agent('vault/default')>>`. Failures are replies too, so no request dies silently.

Since 2026-09-10 the only persona is the default: `/vault` (#chat/vault) starts a supervisor (read-only at the vault root) that gets the work done through a worker in the chat's own worktree. The owner talks to the supervisor only, sees its status on the chat item and on #vault, and merges the chat's proposal through #vault or by telling the supervisor (design `notes/design/mind_vault_supervisor.md` in the vault). A sub-tag `#agent/vault/<name>` still selects a registry name, but every other name is retired: its conversations stay readable but are no longer requests (nothing paid, nothing replies), and an unknown name gets no reply either.

```js_input_removed
// nothing runs web-side (the vault host listens and replies); this inert block satisfies
// the #agent framework, which runs every #agent/* item as an agent item
```

The legacy route `#agent/native` stays a read alias: dormant conversations keep working, new items use `#agent/vault`.

Status: **live** (dispatcher `bin/mind_bridge_v2.py`, registry `agents/bridge.toml`, in the vault).