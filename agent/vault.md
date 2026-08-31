#agent/vault is a _vault chat agent_: the request/reply protocol of a _[chat](#chat) agent_, with a vault host behind it instead of a model api. Tag a chat item `#agent/vault` (visible or hidden) and end it with a `\<<user>>` message; a listener on the vault host appends a signed reply, e.g. `\<<agent('vault/default')>>`. Personas (e.g. `#agent/vault/opus`) are sub-tags that select vault-side authority — agent config, sandbox profile, cost limit — from a registry on the trusted side; the web side only ever selects a name, and unknown personas get an error reply listing available ones. Failures are replies too, so no request dies silently.

```js_input_removed
// vault agents run on the vault host, which listens for requests and appends
// replies via firestore sync; nothing runs web-side (this inert block satisfies
// the #agent framework, which runs every #agent/* item as an agent item)
```

The legacy route `#agent/native` remains a read alias indefinitely: dormant conversations under the old tag keep working, but new items should use `#agent/vault`.

Status: **live**. The v2 dispatcher (`bin/mind_bridge_v2.py` in the vault repo, registry in `agents/bridge.toml`) has run in production on the vault host since 2026-08-30 (owner-started, explicit `--production` mode with service-account credentials, per-account hard checks, and a domain lock), dispatching real persona runs and appending signed replies as readable inert regions (the `<!--inert-->` format, cut over 2026-08-31). The original echo PoC executor (`bin/mind_bridge.py`) and its emulator e2e listener rows are retired; end-to-end evidence lives in the vault's Firestore-emulator component smoke and the recorded production canary.