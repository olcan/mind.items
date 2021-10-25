function _on_welcome() {
  init_pusher()
}

// TODO: implement pusher based on (simplified) #github, refactoring common code later into another item, perhaps #github.
// TODO: pusher should ALSO push items by name under names, keeping in mind there is no delete/move, so names can get outdated
// TODO: would be nice if pusher can handle side-push more gracefully, live-tracking changes across devices/tabs like regular pushes
// TODO: can define commands like /push, /pull, etc in this file!

async function init_pusher() {
  // fetch github token from global store, or from user prompt
  // if token is missing, cancel init (i.e. disable) with warning
  const token =
    _this.global_store.token ||
    (_this.global_store.token = await _modal({
      content: `${_this.name} needs your [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) to push items to your private GitHub repo.`,
      confirm: 'Use Token',
      cancel: 'Disable',
      input: '',
    }))
  if (!token) {
    _this.warn(`disabled due to missing token`)
    return
  }
}

// TODO: ask for github _private_ repo, store in global_store
