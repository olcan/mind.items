#pusher auto-pushes items to your _private_ repo on [GitHub](https://github.com) and provides the following commands:
- `/push [label]` pushes items to your repo.
- `/pull [label]` pulls items from your repo.
- `/history [name]` opens change history for item `name` (or all items).
- `/branch name` creates/updates branch `name` from master branch.
- `/compare [base]` opens comparison (diff) of all changes (in master branch) since branch `base`. Base can be any branch in the repo, including one of the following auto-generated branches:
  - `last_init` (_default_) for changes since page init/reload
  - `last_push` for changes since last manual `/push`
  - `last_pull` for changes since last manual `/pull`

```js_removed:pusher.js
// pusher.js
```

#_welcome #_listen