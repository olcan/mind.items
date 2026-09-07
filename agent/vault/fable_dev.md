#agent/vault/fable_dev is the _dev_ `fable_dev` persona of the [vault chat agent](#agent/vault): the writable `fable_wt` profile (Claude Fable 5.1 at maximum effort; file, edit, and a shell that waits for each command; the chat item's own git worktree `worktrees/chat_<item>`; nothing reaches `main` without the owner's merge) plus the vault's `search_web` and `read_web` tools as its only network path (the shell stays offline; it is told not to push or deploy, git metadata being read-only and the owner's credential locations hidden) and the app submodules `external/mind.page` and `external/mind.items` populated in its worktree before each run, each with a `node_modules` copied from the main checkout's, so it can read, change, type-check, and unit-test the app and the items (registry `agents/bridge.toml` `[fable_dev]`, cost limit $30). Use `/fable_dev <msg>` (item #chat/fable_dev); merge or retire its worktree afterwards.

```js_input_removed
// vault agents run on the vault host, which listens for requests and appends
// replies via firestore sync; nothing runs web-side (this inert block satisfies
// the #agent framework, which runs every #agent/* item as an agent item)
```