function _on_welcome() {
  init_pusher()
}

// TODO: implement pusher based on (simplified) #github, refactoring common code later into another item, perhaps #github.
// TODO: pusher should ALSO push items by name under names, keeping in mind there is no delete/move, so names can get outdated
// TODO: would be nice if pusher can handle side-push more gracefully, live-tracking changes across devices/tabs like regular pushes
// TODO: can define commands like /push, /pull, etc in this file!
let owner, repo

async function init_pusher() {
  // look up push destination from global store, or from user prompt
  // if destination is missing, cancel init (i.e. disable) with warning
  const dest =
    _this.global_store.dest ||
    (_this.global_store.dest = await _modal({
      content: `${_this.name} needs the name of your _private_ GitHub repo to push your items to. Please enter in \`<owner>/<repo>\` format, e.g. \`olcan/mind.page\`.`,
      confirm: 'Use Repo',
      cancel: 'Disable',
      input: '',
    }))
  if (!dest) {
    _this.warn(`disabled due to missing destination`)
    return
  }
  // if destination is invalid, clear global store and try again or disable
  ;[owner, repo] = dest.split('/')
  if (!owner || !repo) {
    _this.error(`invalid destination '${dest}'`)
    delete _this.global_store.dest
    const try_again = await _modal({
      content: `${_this.name}: invalid repo name \`${dest}\`. Should be in \`<owner>/<repo>\` format, e.g. \`olcan/mind.page\`.`,
      confirm: 'Try Again',
      cancel: 'Disable',
    })
    if (try_again) {
      _this.log(`trying again ...`)
      setTimeout(init_pusher)
    } else {
      _this.warn(`disabled due to missing destination`)
    }
    return
  }
  // fetch github token from global store, or from user prompt
  // if token is missing, cancel init (i.e. disable) with warning
  const token =
    _this.global_store.token ||
    (_this.global_store.token = await _modal({
      content: `${_this.name} needs your [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) to push items to your private repo ${owner}/${repo}.`,
      confirm: 'Use Token',
      cancel: 'Disable',
      input: '',
    }))
  if (!token) {
    _this.warn(`disabled due to missing token`)
    return
  }

  _this.log(`initializing for repo ${owner}/${repo}, token ${token} ...`)
}
