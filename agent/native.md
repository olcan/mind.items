#agent/native is a _native chat agent_: the request/reply protocol of a _[chat](#chat) agent_, with a vault host behind it instead of a model api. Tag a chat item `#agent/native` (visible or hidden) and end it with a `\<<user>>` message; a listener on the vault host appends a signed reply, e.g. `\<<agent('native/default')>>`. Personas (e.g. `#agent/native/opus`) are sub-tags that select vault-side authority — agent config, sandbox profile, cost limit — from a registry on the trusted side; the web side only ever selects a name, and unknown personas get an error reply listing available ones. Failures are replies too, so no request dies silently.

```js_input_removed
// native agents run on the vault host, which listens for requests and appends
// replies via firestore sync; nothing runs web-side (this inert block satisfies
// the #agent framework, which runs every #agent/* item as an agent item)
```

Status: **proof of concept**, certified end-to-end against the Firestore emulator (`tests/e2e/bridge.spec.ts` in mind.page). The listener (`bin/mind_bridge.py` in the vault repo, registry in `agents/bridge.toml`) is emulator-only and replies with an `echo` handler; production credentials and real agent dispatch are phase 2. Requests in live accounts are not answered until then.
