function _on_welcome() {
  init_pusher()
}

// TODO: implement pusher based on (simplified) #github, refactoring common code later into another item, perhaps #github.
// TODO: pusher should ALSO push items by name under names, keeping in mind there is no delete/move, so names can get outdated
// TODO: would be nice if pusher can handle side-push more gracefully, live-tracking changes across devices/tabs like regular pushes
// TODO: can define commands like /push, /pull, etc in this file!

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
  const [owner, repo] = dest.split('/')
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
      content: `${_this.name} needs your [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) to push items to your private repo ${dest}.`,
      confirm: 'Use Token',
      cancel: 'Disable',
      input: '',
    }))
  if (!token) {
    _this.warn(`disabled due to missing token`)
    return
  }

  // initialize pusher
  _this.log(`initializing for repo ${dest}, token ${token} ...`)
  const github = (_this.store.github = new Octokit({ auth: token }))

  // retrieve repo tree (not limited to 1000 files unlike getContent)
  let start = Date.now()
  const {
    data: {
      commit: { sha },
    },
  } = await github.repos.getBranch({
    owner,
    repo,
    branch: 'master',
  })
  const {
    data: { tree },
  } = await github.git.getTree({
    owner,
    repo,
    tree_sha: sha,
    recursive: true,
  })
  const tree_sha = new Map(tree.map(n => [n.path, n.sha]))
  _this.log(
    `retrieved tree (${tree_sha.size} nodes) in ${Date.now() - start}ms`
  )

  // initialize store.items
  start = Date.now()
  _this.store.items = {}
  for (let item of _items()) {
    if (!item.saved_id) {
      _this.warn('skipped unsaved item')
      continue
    }
    const path = `items/${item.saved_id}.markdown`
    const remote_sha = tree_sha.get(path)
    const sha = github_sha(item.text)
    _this.store.items[item.saved_id] = {
      path,
      sha: github_sha(item.text),
      remote_sha: tree_sha.get(path),
    }
  }
  _this.log(
    `verified sha for ${_items().length} items in ${Date.now() - start} ms`
  )

  // report inconsistent/missing items
  let count = 0,
    names = []
  for (let [id, { sha, remote_sha }] of Object.entries(_this.store.items)) {
    const item = _item(id)
    if (sha == remote_sha) continue // item good for auto-push
    if (names.length < 10) names.push(item.name)
    count++
  }
  if (count)
    _this.warn(
      `${count} items inconsistent or missing in ${dest} and require manual` +
        ` /push or /pull; most recent ${names.length} are: ` +
        `${names.join(' ')}${count > names.length ? ' ...' : ''}`
    )

  // create branch last_init for comparisons
  create_branch('last_init')

  _this.log(`initialized`)
}

// creates branch with given name
// deletes/replaces any existing branch
async function create_branch(name) {
  if (name == 'master') throw new Error('can not create master branch')
  if (!_this.global_store.dest) throw new Error('pusher missing destination')
  if (!_this.store.github) throw new Error('pusher missing github client')
  const [owner, repo] = _this.global_store.dest.split('/')
  const github = _this.store.github
  // get master branch sha
  const {
    data: [
      {
        object: { sha },
      },
    ],
  } = await github.git.listMatchingRefs({
    owner,
    repo,
    ref: 'heads/master',
  })
  // delete branch in case it exists
  try {
    await github.git.deleteRef({ owner, repo, ref: 'heads/' + name })
  } catch (e) {
    // warn if anything other than a 'missing ref' error
    if (e.message != 'Reference does not exist')
      _this.warn(`delete failed for branch ${name}: ${e}`)
  }
  // (re-)create branch
  await github.git.createRef({ owner, repo, ref: 'refs/heads/' + name, sha })
}

// computes github sha, see https://stackoverflow.com/a/39874235
function github_sha(text) {
  const utf8_text = new TextEncoder().encode(text)
  const utf8_prefix = new TextEncoder().encode(`blob ${utf8_text.length}\0`)
  const utf8 = new Uint8Array(utf8_prefix.length + utf8_text.length)
  utf8.set(utf8_prefix)
  utf8.set(utf8_text, utf8_prefix.length)
  // const sha_buffer = await crypto.subtle.digest('SHA-1', utf8)
  const sha_buffer = sha1.arrayBuffer(utf8)
  return Array.from(new Uint8Array(sha_buffer), b =>
    b.toString(16).padStart(2, '0')
  ).join('')
}

// TODO: push_item(item) synchronizing through store.last_push
// TODO: _on_command_push() to replace /push command
// TODO: _on_command_pull() to replace /pull command

// encodes base64 w/ unicode character support (unlike plain btoa)
// from https://stackoverflow.com/a/30106551
function encodeBase64(str) {
  // original string -> percent-encoding -> bytestream
  return btoa(
    encodeURIComponent(str).replace(
      /%([0-9A-F]{2})/g,
      function toSolidBytes(match, p1) {
        return String.fromCharCode('0x' + p1)
      }
    )
  )
}

// pushes item to github
function push_item(item) {
  if (!_this.store.items) throw new Error('can not push yet')
  if (!item.saved_id) throw new Error(`can not push unsaved item ${item.name}`)
  if (!_this.global_store.dest) throw new Error('pusher missing destination')
  if (!_this.store.github) throw new Error('pusher missing github client')
  const [owner, repo] = _this.global_store.dest.split('/')
  const github = _this.store.github

  // to avoid github conflict (409) and sha mismatch errors, we serialize pushes by chaining promises through store.last_push; optionally we can also enforce a delay which would serve as a debounce period that squashes changes into a single commit
  return (_this.store.last_push = Promise.resolve(_this.store.last_push)
    // .then(()=>_delay(1000))
    .then(async () => {
      let start = Date.now()
      const state = _this.store.items[item.saved_id]
      const text_sha = github_sha(item.text)
      const text_base64 = encodeBase64(item.text)
      if (text_sha == state.remote_sha) {
        // nothing to push
        state.sha = text_sha // ensure auto-push can resume
        return
      }
      try {
        const path = state.path
        const sha = state.remote_sha // can be undefined
        await github.repos.createOrUpdateFileContents({
          owner,
          repo,
          path,
          sha,
          message: item.name,
          content: text_base64,
        })
        state.sha = state.remote_sha = text_sha // resume auto-push
        _this.log(`pushed ${item.name} in ${Date.now() - start}ms`)

        // TODO: side-push
      } catch (e) {
        // state.remote_sha = undefined // disable auto-push until reload
        _this.error(`push failed for ${item.name}: ${e}`)
        throw e
      }
    }))
}

// command /push [name]
async function _on_command_push(name) {
  try {
    if (name) {
      // push named item only
      if (!_exists(name)) {
        alert(`item ${name} not found`)
        return '/push ' + name
      }
      _modal({ content: `Pushing ${name} ...`, background: 'block' })
      await push_item(_item(name))
      await _modal_update({
        content: `Pushed ${name}`,
        confirm: 'OK',
        background: 'confirm',
      })
    } else {
      // push all items
      // TODO: indicate progress and item name!
      _modal({
        content: `Pushing ${_items().length} items ...`,
        background: 'block',
      })
      for (let item of _items()) await push_item(item)
      create_branch('last_push')
      await _modal_update({
        content: `Pushed all ${_items().length} items`,
        background: 'confirm',
      })
    }
  } finally {
    _modal_close()
  }
}
