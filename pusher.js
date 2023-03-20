function _on_welcome() {
  init_pusher()
}

async function init_pusher() {
  _this.store.items = {} // init first, in case there are errors below

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

  // init (fill) store.items
  start = Date.now()
  let pushed_items_found = false
  for (let item of _items()) {
    if (!item.saved_id) {
      _this.warn('skipped unsaved item')
      continue
    }
    const path = `items/${item.saved_id}.md`
    const remote_sha = path_sha.get(path)
    const sha = github_sha(item.text)
    _this.store.items[item.saved_id] = { sha, remote_sha }
    if (remote_sha) pushed_items_found = true
  }

  // report inconsistent/missing items
  // mark inconsistent items pushable
  // also mark missing items pushable, unless ALL are missing
  // NOTE: side-push inconsistencies for installed items are checked by #updater
  let count = 0
  let names = []
  let pushables = new Set()
  for (let [id, { sha, remote_sha }] of Object.entries(_this.store.items)) {
    const item = _item(id)
    if (sha == remote_sha) continue // item good for auto-push
    // mark "pushable" if inconsistent or missing (and not all missing)
    if (remote_sha || pushed_items_found) pushables.add(id)
    if (names.length < 10) names.push(item.name)
    count++
  }
  // mark pushable items
  // fetch latest remote_sha using list/getCommit before marking
  // (getTree is more scalable but can take time to reflect recent commits)
  for (let id of pushables) {
    const item = _item(id)
    const state = _this.store.items[id]
    // recompute remote_sha using latest commit for path
    const start = Date.now()
    let remote_sha
    const dest = { owner, repo, path: `items/${id}.md`, branch: 'master' }
    const {
      data: [commit],
    } = await github.repos.listCommits({ ...dest, per_page: 1 })
    if (commit) {
      _this.log(`latest commit for ${item.name} is ${commit.sha}`)
      const {
        data: { files },
      } = await github.repos.getCommit({ ...dest, ref: commit.sha })
      remote_sha = files.find(f => f.filename == dest.path)?.sha
    }
    const sha = github_sha(item.text)
    _this.log(`fetched remote_sha for ${item.name} in ${Date.now() - start} ms`)
    // fix stored remote_sha if inconsistent
    if (state.remote_sha != remote_sha) {
      state.remote_sha = remote_sha
      _this.warn(`fixed inconsistent remote_sha for ${item.name}`)
    }
    if (state.sha != remote_sha) {
      item.pushable = true
      _this.warn(
        `marked ${item.name} pushable as sha ` +
          `${state.sha} != remote_sha ${remote_sha}`
      )
    } else {
      item.pushable = false
      _.pull(names, item.name)
      count--
    }
  }
  // clear any unnecessary pushable flags
  for (let item of _items()) {
    if (item.pushable && !pushables.has(item.saved_id)) item.pushable = false
  }
  if (count)
    _this.warn(
      `${count} items inconsistent or missing in ${dest} and require manual` +
        ` /push or /pull; most recent ${names.length} are: ` +
        `${names.join(' ')}${count > names.length ? ' ...' : ''}`
    )

  _this.log(
    `verified sha for ${_items().length} items in ${Date.now() - start} ms`
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
  return _hash_160_sha1(utf8)
  // const sha_buffer = await crypto.subtle.digest('SHA-1', utf8)
  // return Array.from(new Uint8Array(sha_buffer), b =>
  //   b.toString(16).padStart(2, '0')
  // ).join('')
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
function push_item(item, manual = false) {
  if (!item.saved_id) throw new Error(`can not push unsaved item ${item.name}`)
  if (!_this.store.github) throw new Error('missing github client')
  if (!_this.global_store.dest) throw new Error('missing destination')
  if (!_this.global_store.commit_sha) throw new Error('missing commit')
  if (!_this.global_store.tree_sha) throw new Error('missing tree')
  const dest = _this.global_store.dest
  const [owner, repo] = dest.split('/')
  const github = _this.store.github

  // serialize pushes via _this.store._push
  // also coordinate w/ #updater via #updater.store._update
  // helps reduce conflict errors and rate-limit violations
  return (_this.store._push = Promise.allSettled([
    _this.store._push,
    _item('#updater', { silent: true })?.store._update,
  ]).then(async () => {
    let start = Date.now()
    const state = _this.store.items[item.saved_id]
    const text_sha = github_sha(item.text)
    if (state.remote_sha == text_sha) {
      state.sha = text_sha // resume auto-push
      // for manual push, side-push even if push is skipped
      if (manual) await _side_push_item(item, manual)
      return
    }
    // _this.log(
    //   `pushing item ${item.name} (sha ${github_sha(item.text)}) ...`
    //   // item.text
    // )
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
        if (e.message == 'Update is not a fast forward') {
          if (!manual) {
            _this.warn(
              `push failed for ${item.name} due to unknown (external) ` +
                `commits in ${dest}; manual /push or /pull is required`
            )
            state.remote_sha = undefined // lost track, disable auto-push
            item.pushable = true // mark pushable again (if not already)
            return
          }
          _this.warn(
            `push failed for ${item.name} due to unknown (external) ` +
              `commits in ${dest}; retrying after fetching latest commit ...`
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
          setTimeout(() => push_item(item, true /*manual*/)) // retry
          return
        }
        throw e
      }
      _this.global_store.commit_sha = commit.sha
      _this.global_store.tree_sha = tree.sha
      state.sha = state.remote_sha = text_sha // resume auto-push

      // invoke _on_push() on item if defined as function
      // _on_push is invoked on both internal and external updates
      if (item.text.includes('_on_push')) {
        try {
          _item(item.id).eval(
            `if (typeof _on_push == 'function') _on_push(_item('${item.id}'))`,
            {
              trigger: 'pusher',
            }
          )
        } catch (e) {} // already logged, just continue
      }

      _this.debug(
        `pushed ${item.name} to ${dest} in ${Date.now() - start}ms (commit ${
          commit.sha
        })`
      )
      await _side_push_item(item, manual)
    } catch (e) {
      _this.error(`push failed for ${item.name}: ${e}`)
      throw e
    }
  }))
}

// resolves embed path relative to container item (attr) path
function resolve_embed_path(path, attr) {
  if (path.startsWith('/') || !attr.path.includes('/', 1)) return path
  return attr.path.substr(0, attr.path.lastIndexOf('/')) + '/' + path
}

const _push_button =
  `<img src=/arrow.up.svg ` +
  `style="filter:invert(100%); height:14px; ` +
  `vertical-align:baseline; margin:0 3px">`

// side-pushes item to other (private or public) repos on github
// owner, repo, path are required, branch is optional (default master)
// destinations can be specified in item.global_store._pusher.sidepush
// installed items are auto-side-pushed to source
// can push whole item or specified block as own file, e.g. for embedding
// block is read as item.read(block), so split blocks are merged
// side-push is always "forced", i.e. replaces anything at destination
// side-pushes are coordinated w/ #updater to skip as local changes
// side-push may need modals for commit messages, will force-close others
async function _side_push_item(item, manual = false) {
  // side-push is invoked internally, so we can skip the checks in push_item
  const github = _this.store.github

  // NOTE: if listCommits/getCommit requests (2 calls per item+embeds) are too much on every change to item (on top of committing those changes via push), then we can simply return here whenever item is marked pushable; auto-side-push will then resume on manual /push or if item is updated to overwrite unpushed changes
  // if (item.pushable) return

  let found_changes = false
  let attr_modified = false
  const attr = item.attr?.source ? item.attr : null // null if not installed
  try {
    let dests = compact(flat(item.global_store._pusher?.sidepush))
    const source_dest = pick(attr, ['owner', 'repo', 'path', 'branch'])
    if (attr) dests.push(source_dest)
    // embed block text & type by path (last block for each path)
    const embed_text = {}
    const embed_type = {}
    for (let dest of dests) {
      if (!dest.owner || !dest.repo || !dest.path) {
        _this.error('invalid side-push destination: ' + JSON.stringify(dest))
        continue
      }
      if (!dest.branch) dest.branch = 'master'
      const dest_str = `${dest.owner}/${dest.repo}/${dest.branch}/${dest.path}`
      // determine side-push content (whole item or block)
      let sidepush_text = dest.block ? item.read(dest.block) : item.text
      // restore any embed blocks before pushing back installed item
      if (attr.embeds) {
        sidepush_text = sidepush_text.replace(
          /```(\S+):(\S+?)\n(.*?)\n```/gs,
          (m, pfx, sfx, body) => {
            if (sfx.includes('.')) {
              const path = resolve_embed_path(sfx, attr)
              embed_text[path] = body // for push below
              embed_type[path] = pfx + ':' + sfx // for commit prompt below
              body = attr.embeds.find(e => e.path == path).body
              return '```' + pfx + ':' + sfx + '\n' + body + '\n```'
            }
            return m
          }
        )
      }
      // get file sha (if exists) from latest commit for path
      let sha
      const {
        data: [commit],
      } = await github.repos.listCommits({ ...dest, per_page: 1 })
      if (commit) {
        const {
          data: { files },
        } = await github.repos.getCommit({ ...dest, ref: commit.sha })
        sha = files.find(f => f.filename == dest.path)?.sha
      }
      if (sha == github_sha(sidepush_text))
        _this.log(
          `side-push redundant (no change) for ${item.name} to ${dest_str}`
        )
      else {
        found_changes = true
        // prompt user for commit message on manual push
        let message
        if (manual) {
          message = item.name
          await _modal_close() // force-close all modals to avoid deadlock
          message = await _modal({
            content:
              `Enter commit message to push \`${item.name}\` to its source file ` +
              `[${dest.path}](${attr.source}). Skip to push later via ` +
              `\`/push\` command or ${_push_button} button.`,
            confirm: 'Push',
            cancel: 'Skip',
            input: message,
          })
        }
        if (!message) {
          _this.warn(`side-push skipped for ${item.name} to ${dest_str}`)
          item.pushable = true // mark pushable again (if not already)
        } else {
          const start = Date.now()
          const { data } = await github.repos.createOrUpdateFileContents({
            ...dest,
            sha,
            message: message.trim() + ' (via #pusher)',
            content: encodeBase64(sidepush_text),
          })

          // update attr with new commit sha
          attr.sha = data.commit.sha
          attr_modified = true // trigger save via touch below

          _this.log(
            `side-pushed ${item.name} (commit ${data.commit.sha}) ` +
              `to ${dest_str} in ${Date.now() - start}ms`
          )
        }
      }
    }

    // if installable w/ embeds, also side-push embeds
    if (attr?.embeds) {
      for (let embed of attr.embeds) {
        const dest = assign(source_dest, { path: embed.path })
        const dest_str = `${dest.owner}/${dest.repo}/${dest.branch}/${dest.path}`
        // get sidepush text from embed_text, which should be populated above
        const sidepush_text = embed_text[embed.path]
        if (typeof sidepush_text != 'string')
          throw new Error('missing body for embed path ' + embed.path)
        // get file sha (if exists) from latest commit for path
        let sha
        const {
          data: [commit],
        } = await github.repos.listCommits({ ...dest, per_page: 1 })
        if (commit) {
          const {
            data: { files },
          } = await github.repos.getCommit({ ...dest, ref: commit.sha })
          sha = files.find(f => f.filename == dest.path)?.sha
        }
        if (sha == github_sha(sidepush_text))
          _this.log(
            `side-push of embed redundant (no change) for ` +
              `${item.name}:${embed.path} to ${dest_str}`
          )
        else {
          found_changes = true
          // prompt user for commit message on manual push
          let message
          if (manual) {
            message = item.name + ':' + embed.path
            const embed_source =
              `https://github.com/${attr.owner}/${attr.repo}/` +
              `blob/${attr.branch}/${embed.path}`
            await _modal_close() // force-close all modals to avoid deadlock
            message = await _modal({
              content:
                `Enter commit message to push embed block ` +
                `\`${embed_type[embed.path]}\` in \`${item.name}\` ` +
                `back to its source file [${dest.path}](${embed_source}). ` +
                `Skip to push later via \`/push\` command or ` +
                `${_push_button} button.`,
              confirm: 'Push',
              cancel: 'Skip',
              input: message,
            })
          }
          if (!message) {
            _this.warn(
              `side-push of embed skipped for ` +
                `${item.name}:${embed.path} to ${dest_str}`
            )
            item.pushable = true // mark pushable again (if not already)
          } else {
            const start = Date.now()
            const { data } = await github.repos.createOrUpdateFileContents({
              ...dest,
              sha,
              message: message.trim() + ' (via #pusher)',
              content: encodeBase64(sidepush_text),
            })

            // update embed with new commit sha
            embed.sha = data.commit.sha
            attr_modified = true // trigger save via touch below

            _this.log(
              `side-pushed embed ${item.name}:${embed.path} ` +
                `(commit ${data.commit.sha}) to ${dest_str} ` +
                `in ${Date.now() - start}ms`
            )
          }
        }
      }
    }

    // if found no changes to pushable item, clear pushable flag
    // this resumes auto-side-push w/ commit message prompts
    if (!found_changes) item.pushable = false

    // touch item to trigger saving of changes to attr(.embeds[]).sha above
    // important for #updater to skip a redundant update even after reload
    if (attr_modified) item.touch(true /*save*/)
  } catch (e) {
    _this.error(`side-push failed for ${item.name}: ${e}`)
    throw e
  }
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
  // skip if item is deleted
  if (!_exists(item.id)) return
  // skip if auto-push is disabled for item
  if (item.store._pusher?.auto_push_disabled) return

  // retry in 1s if item is not saved yet
  if (!item.saved_id) return setTimeout(() => auto_push_item(item), 1000)

  // if state is missing, create it w/ sha==remote_sha==undefined
  const state = (_this.store.items[item.saved_id] ??= {})

  // cancel auto-push w/ warning if item is inconsistent/missing in dest
  if (state.sha != state.remote_sha) {
    const dest = _this.global_store.dest
    _this.warn(
      `unable to auto-push item ${item.name} that is inconsistent or missing in ${dest}; manual /push or /pull is required`
    )
    item.pushable = true // mark pushable again (if not already)
    return
  }

  // skip auto-push if state.sha is same as current sha of item; this means auto-push was triggered without a change OR due to a change that was pulled from github (see pull_item)
  if (state.sha == github_sha(item.text)) return

  // _this.log(
  //   `auto-pushing item ${item.name} (sha ${github_sha(item.text)}) ...`,
  //   item.text
  // )
  push_item(item).catch(e => {}) // errors already logged
}

function suspend_auto_push(item) {
  item.store._pusher = merge(item.store._pusher, { auto_push_disabled: true })
}

function resume_auto_push(item) {
  item.store._pusher.auto_push_disabled = false
  auto_push_item(item)
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

// => /push [items]
// pushes items to your repo
// `items` can be `pushables`, `all`, or specific `#label` or id
// default is `pushables` if any exist, or `all` otherwise
async function _on_command_push(label) {
  try {
    let items
    if (label == 'all') {
      items = _items()
      label = ''
    } else if (label == 'pushables') {
      const pushables = items.filter(item => item.pushable)
      if (!pushables.length) {
        alert(`/push: no pushable items found`)
        return '/push ' + label
      }
      items = pushables
      label = ''
    } else {
      items = _items(label)
      if (items.length == 0) {
        if (label) alert(`/push: ${label} not found`)
        else alert(`/push: no items found`)
        return '/push ' + label
      }
      if (!label) {
        const pushables = items.filter(item => item.pushable)
        if (pushables.length) items = pushables
      }
    }
    const s = items.length > 1 ? 's' : ''
    for (const [i, item] of items.entries()) {
      // show new modal in case side-push force-closes modal for commit prompt
      await _modal_close() // force-close all modals
      _modal({
        content: `Pushing ${i + 1}/${items.length} (${item.name}) ...`,
        background: 'block',
      })
      item.pushable = false // clear warning, resume side-push
      // perform "manual" push allowing full push and side-push
      await push_item(item, true /*manual*/)
    }
    update_branch('last_push')
    await _modal_close() // force-close all modals
    // await _modal({
    //   content: `Pushed ${items.length} item${s}`,
    //   confirm: 'OK',
    //   background: 'confirm',
    // })
  } finally {
    _modal_close() // force-close all modals
  }
}

// => /pull [items]
// pulls items from your repo
// `items` can be specific `#label` or id
async function _on_command_pull(label) {
  let modal // modal promise if open
  try {
    const items = _items(label)
    const s = items.length > 1 ? 's' : ''
    if (items.length == 0) {
      alert(`/pull: ${label} not found`)
      return '/pull ' + label
    }
    modal = _modal({
      content: `Pulling ${items.length} item${s} ...`,
      background: 'block',
    })
    for (const [i, item] of items.entries()) {
      _modal_update(modal, {
        content: `Pulling ${i + 1}/${items.length} (${item.name}) ...`,
      })
      await pull_item(item)
      item.pushable = false // clear warning, resume side-push
    }
    update_branch('last_pull')
    // await _modal_update(modal, {
    //   content: `Pulled ${items.length} item${s}`,
    //   confirm: 'OK',
    //   background: 'confirm',
    // })
    modal = null // closed by await
  } finally {
    if (modal) _modal_close(modal) // close if left open
  }
}

// => /history [item]
// opens change history for master branch
// `item` can be specific `#name` or id
async function _on_command_history(name) {
  if (!_this.global_store.dest) {
    alert(`history for ${name} not available due to disabled ${_this.name}`)
    return '/history ' + name
  }
  const [owner, repo] = _this.global_store.dest.split('/')
  if (!name) {
    // open history for all items
    window.open(`https://github.com/${owner}/${repo}/commits/master`)
    return
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
  window.open(
    `https://github.com/${owner}/` +
      `${repo}/commits/master/items/${item.saved_id}.md`
  )
}

// => /branch name
// creates/updates branch `name` from master branch
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

// => /compare [base=last_init]
// opens diff for all changes (in master) since `base`
// `base` can be any branch in repo, including:
// | `last_init` | changes since page init/reload
// | `last_push` | changes since last manual `/push`
// | `last_pull` | changes since last manual `/pull`
// &nbsp; ↑ special branches auto-updated by #pusher
async function _on_command_compare(base) {
  if (!base) base = 'last_init'
  if (!_this.global_store.dest) {
    alert(`comparison not available due to disabled ${_this.name}`)
    return '/compare ' + base
  }
  const [owner, repo] = _this.global_store.dest.split('/')
  window.open(`https://github.com/${owner}/${repo}/compare/${base}...master`)
}
