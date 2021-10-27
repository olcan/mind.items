#pusher auto-pushes items to your _private_ repo on [GitHub](https://github.com) and provides the following commands:
- `/push [label]` pushes items to your repo.
- `/pull [label]` pulls items from your repo.
- `/history name` opens change history for item `name`.
- `/branch name` creates branch `name`, after _deleting_ if already exists.
command /compare [branch] opens a comparison from/since branch (acting as base) to latest master in the private sync repo on github. Specified branch can be any branch in sync repo, including:
last_init (default) for changes since page init/reload
last_push for changes since last manual push
last_pull for changes since last manual pull
any branch created using branch command- 

```js_removed:pusher.js
// pusher.js
```

#_welcome #_listen