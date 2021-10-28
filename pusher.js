function _on_welcome() {
  init_pusher()
}

// TODO: implement pusher based on (simplified) #github, refactoring common code later into another item, perhaps #github.
// TODO: would be nice if pusher can handle side-push more gracefully, live-tracking changes across devices/tabs like regular pushes

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
  // we store commit_sha and tree_sha in global_store for efficiency
  let start = Date.now()
  const resp = await github.repos.getBranch({
    owner,
    repo,
    branch: 'master',
  })
  const commit_sha = resp.data.commit?.sha
  const tree_sha = resp.data.commit?.commit?.tree?.sha
  if (!commit_sha || !tree_sha) {
    _this.error(
      `disabled due to empty repo ${dest}; ` +
        `${_this.name} does not do "root" commits for safety; ` +
        `try reloading after committing a file (e.g. README.md)`
    )
    delete _this.store.github // clean up since disabled
    return
  }
  _this.global_store.commit_sha = commit_sha
  _this.global_store.tree_sha = tree_sha
  const {
    data: { tree },
  } = await github.git.getTree({
    owner,
    repo,
    tree_sha,
    recursive: true,
  })
  const path_sha = new Map(tree.map(n => [n.path, n.sha]))
  _this.log(
    `retrieved tree (${path_sha.size} nodes) in ${Date.now() - start}ms`
  )

  // initialize store.items
  start = Date.now()
  _this.store.items = {}
  for (let item of _items()) {
    if (!item.saved_id) {
      _this.warn('skipped unsaved item')
      continue
    }
    const path = `items/${item.saved_id}.md`
    const remote_sha = path_sha.get(path)
    const sha = github_sha(item.text)
    _this.store.items[item.saved_id] = {
      sha: github_sha(item.text),
      remote_sha: path_sha.get(path),
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
  update_branch('last_init')

  _this.log(`initialized`)
}

// updates/creates non-master branch to coincide with master branch
// returns 'updated' or 'created' depending on action taken
async function update_branch(name) {
  if (name == 'master') throw new Error('can not create master branch')
  if (!_this.global_store.dest) throw new Error('missing destination')
  if (!_this.store.github) throw new Error('missing github client')
  const [owner, repo] = _this.global_store.dest.split('/')
  const github = _this.store.github
  // get master branch sha
  const sha = (
    await github.repos.getBranch({
      owner,
      repo,
      branch: 'master',
    })
  )?.data?.commit?.sha
  if (!sha) throw new Error(`can not branch empty repo ${owner}/${repo}`)
  // update branch if it exists, create new otherwise
  try {
    await github.git.updateRef({ owner, repo, ref: 'heads/' + name, sha })
    return 'updated'
  } catch (e) {
    // rethrow anything other than a 'does not exist' error
    if (e.message != 'Reference does not exist') throw e
    await github.git.createRef({ owner, repo, ref: 'refs/heads/' + name, sha })
    return 'created'
  }
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

// decodes base64 w/ unicode character support (unlike plain atob)
// from https://stackoverflow.com/a/30106551
function decodeBase64(str) {
  // bytestream -> percent-encoding -> original string
  return decodeURIComponent(
    atob(str)
      .split('')
      .map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      })
      .join('')
  )
}

// pushes item to github
function push_item(item) {
  if (!_this.store.items) throw new Error('can not push yet')
  if (!item.saved_id) throw new Error(`can not push unsaved item ${item.name}`)
  if (!_this.store.github) throw new Error('missing github client')
  if (!_this.global_store.dest) throw new Error('missing destination')
  if (!_this.global_store.commit_sha) throw new Error('missing commit')
  if (!_this.global_store.tree_sha) throw new Error('missing tree')
  const dest = _this.global_store.dest
  const [owner, repo] = dest.split('/')
  const github = _this.store.github

  // we sequentialize all github access via window._github
  // helps reduce conflict errors and rate-limit violations
  // we use window instead of item store to share across items (e.g. #updater)
  // we use allSettled to resume the chain on errors/rejects
  return (window._github = Promise.allSettled([window._github]).then(
    async () => {
      let start = Date.now()
      const state = _this.store.items[item.saved_id]
      const text_sha = github_sha(item.text)
      if (state.remote_sha == text_sha) {
        state.sha = text_sha // resume auto-push
        return
      }
      try {
        const path = `items/${item.saved_id}.md`
        const commit_sha = _this.global_store.commit_sha
        const tree_sha = _this.global_store.tree_sha

        // create tree based off the tree of the latest commit
        // tree contains item file and symlink iff item is named
        // NOTE: drop base_tree for root commit on empty repo
        const { data: { ...tree } = {} } = await github.git.createTree({
          owner,
          repo,
          base_tree: tree_sha,
          tree: [
            { path, mode: '100644', type: 'blob', content: item.text },
            ...(() => {
              if (!item.name.startsWith('#')) return []
              const name = item.name.slice(1)
              const symlink = name.replace(/[^/]+/g, '..') + '/' + path
              return [
                {
                  path: `names/${name}.md`,
                  mode: '120000' /*symlink*/,
                  type: 'blob',
                  content: symlink,
                },
              ]
            })(),
          ],
        })
        // create commit for this tree based off the last commit
        // NOTE: drop parents for root commit on empty repo
        const { data: { ...commit } = {} } = await github.git.createCommit({
          owner,
          repo,
          message: item.name,
          parents: [commit_sha],
          tree: tree.sha,
        })
        // update master to point to this commit
        try {
          await github.git.updateRef({
            owner,
            repo,
            ref: 'heads/master',
            sha: commit.sha,
          })
        } catch (e) {
          // TODO: investigate "Reference cannot be updated" error, and consider allowing that also, and perhaps introducing a delay before retries ...
          if (e.message == 'Update is not a fast forward') {
            _this.warn(
              `push failed for ${item.name} due to unknown (external) ` +
                `commits; retrying after fetching latest commit ...`
            )
            const resp = await github.repos.getBranch({
              owner,
              repo,
              branch: 'master',
            })
            const commit_sha = resp.data.commit?.sha
            const tree_sha = resp.data.commit?.commit?.tree?.sha
            if (!commit_sha || !tree_sha)
              throw new Error(`can not push to empty repo ${dest}`)
            _this.global_store.commit_sha = commit_sha
            _this.global_store.tree_sha = tree_sha
            setTimeout(() => push_item(item)) // retry
            return
          }
          throw e
        }
        _this.global_store.commit_sha = commit.sha
        _this.global_store.tree_sha = tree.sha
        state.sha = state.remote_sha = text_sha // resume auto-push
        _this.log(`pushed ${item.name} to ${dest} in ${Date.now() - start}ms`)

        // TODO: side-push to other repos?
      } catch (e) {
        // state.remote_sha = undefined // disable auto-push until reload
        _this.error(`push failed for ${item.name}: ${e}`)
        throw e
      }
    }
  ))
}

// auto-push consistent items on change
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // ignore dependency change (item text unchanged)
  if (deleted) return // ignore deletion (keep on github under deleted id)
  const item = _item(id)
  if (remote) {
    // update local state assuming remote auto-push
    const sha = github_sha(item.text)
    _this.store.items[item.saved_id] = { sha, remote_sha: sha }
    return
  }
  auto_push_item(item)
}

// auto-pushes item, retrying if item is not saved yet
function auto_push_item(item) {
  if (!item.saved_id) {
    // retry in 1s
    setTimeout(() => auto_push_item(item), 1000)
    return
  }
  // if state is missing, create it w/ sha==remote_sha==undefined
  const state =
    _this.store.items[item.saved_id] || (_this.store.items[item.saved_id] = {})

  // cancel auto-push w/ warning if item is inconsistent/missing in dest
  if (state.sha != state.remote_sha) {
    const dest = _this.global_store.dest
    _this.warn(
      `unable to auto-push item ${item.name} that is inconsistent or missing in ${dest}; manual /push or /pull is required`
    )
    return
  }

  // skip auto-push if state.sha is same as current sha of item; this means auto-push was triggered without a change OR due to a change that was pulled from github (see pull_item)
  if (state.sha == github_sha(item.text)) return

  push_item(item).catch(e => {}) // errors already logged
}

async function pull_item(item) {
  if (!_this.store.items) throw new Error('can not pull yet')
  if (!item.saved_id) throw new Error(`can not pull unsaved item ${item.name}`)
  if (!_this.store.github) throw new Error('missing github client')
  if (!_this.global_store.dest) throw new Error('missing destination')
  const dest = _this.global_store.dest
  const [owner, repo] = dest.split('/')
  const github = _this.store.github
  // if state is missing, create it w/ sha==remote_sha==undefined
  const state =
    _this.store.items[item.saved_id] || (_this.store.items[item.saved_id] = {})
  if (state.sha == state.remote_sha) return // nothing to pull

  const start = Date.now()
  try {
    const path = `items/${item.saved_id}.md`
    let { data } = await github.repos.getContent({ owner, repo, path })
    const text = decodeBase64(data.content)
    const sha = github_sha(text)
    state.sha = state.remote_sha = sha
    item.write(text, '')
    _this.log(`pulled ${item.name} from ${dest} in ${Date.now() - start}ms`)
  } catch (e) {
    _this.error(`pull failed for ${item.name}: ${e}`)
    throw e
  }
}

// command /push [label]
async function _on_command_push(label) {
  try {
    const items = _items(label)
    const s = items.length > 1 ? 's' : ''
    if (items.length == 0) {
      alert(`/push: ${label} not found`)
      return '/push ' + label
    }
    _modal({
      content: `Pushing ${items.length} item${s} ...`,
      background: 'block',
    })
    for (const [i, item] of items.entries()) {
      _modal_update({
        content: `Pushing ${i + 1}/${items.length} (${item.name}) ...`,
      })
      await push_item(item)
    }
    update_branch('last_push')
    await _modal_update({
      content: `Pushed ${items.length} item${s}`,
      confirm: 'OK',
      background: 'confirm',
    })
  } finally {
    _modal_close()
  }
}

// command /pull [label]
async function _on_command_pull(label) {
  try {
    const items = _items(label)
    const s = items.length > 1 ? 's' : ''
    if (items.length == 0) {
      alert(`/pull: ${label} not found`)
      return '/pull ' + label
    }
    _modal({
      content: `Pulling ${items.length} item${s} ...`,
      background: 'block',
    })
    for (const [i, item] of items.entries()) {
      _modal_update({
        content: `Pulling ${i + 1}/${items.length} (${item.name}) ...`,
      })
      await pull_item(item)
    }
    update_branch('last_pull')
    await _modal_update({
      content: `Pulled ${items.length} item${s}`,
      confirm: 'OK',
      background: 'confirm',
    })
  } finally {
    _modal_close()
  }
}

// command /history name
async function _on_command_history(name) {
  if (!name) {
    alert(`usage: /history name`)
    return '/history '
  }
  const item = _item(name)
  if (!item) {
    alert(`item '${name}' missing or ambiguous`)
    return '/history ' + name
  }
  if (!item.saved_id) {
    alert(`history not available for unsaved ${name}`)
    return '/history ' + name
  }
  if (!_this.global_store.dest) {
    alert(`history for ${name} not available due to disabled ${_this.name}`)
    return '/history ' + name
  }
  const [owner, repo] = _this.global_store.dest.split('/')
  window.open(
    `https://github.com/${owner}/` +
      `${repo}/commits/master/items/${item.saved_id}.md`
  )
}

// command /branch name
async function _on_command_branch(name) {
  if (!name) {
    alert(`usage: /branch name`)
    return '/branch '
  }
  if (!_this.global_store.dest) {
    alert(`branching not available due to disabled ${_this.name}`)
    return '/branch ' + name
  }
  const [owner, repo] = _this.global_store.dest.split('/')
  const action = await update_branch(name)
  alert(`${action} branch ${name}`)
}

// command /compare base
async function _on_command_compare(base) {
  if (!base) base = 'last_init'
  if (!_this.global_store.dest) {
    alert(`comparison not available due to disabled ${_this.name}`)
    return '/compare ' + base
  }
  const [owner, repo] = _this.global_store.dest.split('/')
  window.open(`https://github.com/${owner}/${repo}/compare/${base}...master`)
}

// TODO: implement side-push, then delete #github
