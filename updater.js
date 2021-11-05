// init updater on welcome, i.e. after page is fully rendered
// ensures page is ready to display modals, e.g. for token prompts
// also allows existing items to initialize before being updated
function _on_welcome() {
  init_updater() // test
}

async function init_updater() {
  _this.log(`initializing ...`)
  const store = _this.store
  const modified_ids = (store.modified_ids = []) // modified item id queue
  const pending_updates = (store.pending_updates = {}) // pending update commit shas
  store.update_modal = null // visible update modal (if any)

  // check for updates on page init
  for (let item of installed_named_items()) {
    const updates = await check_updates(item, true /* mark_pushables */)
    if (updates) await update_item(item, updates)
  }

  // listen for updates through firebase
  _this.log(`listening for updates ...`)
  firebase
    .firestore()
    .collection('github_webhooks')
    .where('time', '>', Date.now())
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type != 'added') return // new documents only
        const body = change.doc.data().body
        if (!body?.ref?.startsWith('refs/heads/')) return // branch update only
        const branch = body.ref.replace('refs/heads/', '')
        const repo = body.repository.name
        const owner = body.repository.owner.login
        const source = `${owner}/${repo}/${branch}`
        _this.debug(
          `github_webhook for commit sha ${body.after} ` +
            `in ${source} (was ${body.before})`
        )
        let commits = body.commits ?? []
        // drop commits w/o modified items
        commits = commits.filter(c => c.modified?.length)
        // drop commits pushed via #pusher
        commits = commits.filter(c => !c.message.endsWith('(via #pusher)'))
        // drop merge commits since they are skipped by listCommits
        // otherwise they cause unnecessary check_update and modal prompts
        // merges can be disabled via git config --global pull.rebase true
        //   .git/config files can override: [pull] rebase=false
        commits = commits.filter(c => !c.message.startsWith('Merge branch'))

        if (commits.length == 0) return // no commits w/ modifications

        // scan items for installed items w/ modified paths
        for (let item of installed_named_items()) {
          const attr = item.attr
          if (attr.owner != owner || attr.repo != repo || attr.branch != branch)
            return // item not from modified repo/branch
          // calculate item paths, including any embeds, removing slash prefixes
          let paths = [attr.path, ...(attr.embeds?.map(e => e.path) ?? [])].map(
            path => path.replace(/^\//, '')
          )
          // update item if any paths were modified in any commits
          // first such commit id (sha) is stored in pending_updates for item
          // we do not use body.after since that could be a dropped commit
          const update_commit = commits.find(commit =>
            paths.some(path => commit.modified.includes(path))
          )
          if (update_commit) {
            _this.debug(
              `github_webhook commit ${update_commit.id} modified ` +
                `${item.name} in ${owner}/${repo}/${branch}`
            )
            // record latest update commit sha for modified item
            pending_updates[item.id] = update_commit.id
            // push to back of queue if not already in queue
            if (!modified_ids.includes(item.id)) {
              modified_ids.push(item.id)
              // update modal if visible
              if (store.update_modal) {
                const modified_names = modified_ids.map(id => _item(id).name)
                const s = modified_ids.length > 1 ? 's' : ''
                _modal_update(store.update_modal, {
                  content:
                    `${_this.name} is ready to update ${modified_ids.length} ` +
                    `installed item${s}: ${modified_names.join(', ')}`,
                })
              }
            }
          }
        }
      })

      // update modified items
      // sequentialize via global window._github
      // use allSettled to resume the chain on errors/rejects
      // confirmation dialog is important to sequentialize across tabs/devices
      window._github = Promise.allSettled([window._github]).then(async () => {
        if (modified_ids.length == 0) return // nothing to do
        const modified_names = modified_ids.map(id => _item(id).name)
        const s = modified_ids.length > 1 ? 's' : ''
        if (window._init_time == _this.global_store.auto_updater_init_time) {
          _this.log(`skipping confirmation on this instance (${_init_time})`)
        } else {
          store.update_modal = _modal({
            content:
              `${_this.name} is ready to update ${modified_ids.length} ` +
              `installed item${s}: ${modified_names.join(', ')}`,
            confirm: 'Update',
            cancel: 'Skip',
          })
          const update = await store.update_modal
          store.update_modal = null // modal dismissed
          if (!update) {
            // warn about skipped updates
            if (modified_ids.length) {
              _this.warn(
                `updates skipped for ${modified_ids.length} ` +
                  `installed items: ${modified_names.join(', ')}`
              )
              // clear update queue
              while (modified_ids.length)
                delete pending_updates[modified_ids.shift()]
            }
            return
          }
        }
        while (modified_ids.length) {
          const item = _item(modified_ids.shift())
          const update = pending_updates[item.id]
          delete pending_updates[item.id] // no longer pending
          const updates = await check_updates(item)
          if (updates) {
            // record _init_time for app instance that can skip confirmation
            _this.global_store.auto_updater_init_time = window._init_time
            await update_item(item, updates)
          } else _this.log(`update no longer needed for ${item.name}`)
        }
      })
    })
}

// detect remote updates and cancel unnecessary local updates
function _on_global_store_change(id, remote) {
  if (!remote) return // not a remote change
  const item = _item(id)
  if (!item.attr) return // not an installed item
  if (!item.name.startsWith('#')) return // not a named item
  // if item is pending update, check for remote update
  let { modified_ids, pending_updates } = _this.store
  if (!pending_updates[id]) return // not pending any updates
  // if last update in global store contains pending update, cancel locally
  const last_update = item.global_store._updater?.last_update
  if (_.values(last_update).includes(pending_updates[id])) {
    _this.log(`detected remote update for ${item.name}`)
    // remove item/update from local update queue
    modified_ids.splice(modified_ids.indexOf(item.id), 1)
    delete pending_updates[id]
    // update modal if visible, close if no other updates pending
    if (_this.store.update_modal) {
      const modified_names = modified_ids.map(id => _item(id).name)
      const s = modified_ids.length > 1 ? 's' : ''
      _modal_update(_this.store.update_modal, {
        content:
          `${_this.name} is ready to update ${modified_ids.length} ` +
          `installed item${s}: ${modified_names.join(', ')}`,
      })
      // if no updates pending, close modal
      // closing resolves modal promise as undefined (see await above)
      // closing modal should trigger setting of store.update_modal to null
      if (modified_ids.length == 0) {
        _this.log(`closing update modal since all updates were done remotely`)
        _modal_close(_this.store.update_modal)
      }
    }
  }
}

// returns items that are installed and named (i.e. uniquely labeled)
const installed_named_items = () =>
  _labels((_, ids) => ids.length == 1)
    .map(label => _item(label))
    .filter(item => item.attr)

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

// return auth token for updating item from github source
// returns null if no token is available
async function github_token(item) {
  // try in this order:
  // item.attr.token (preferred since token may be specialized to item)
  // local storage (mindpage_github_token, also used by /_update)
  // #updater (_this) global store
  // #pusher global store
  let token = item.attr.token
  if (!token) token = localStorage.getItem('mindpage_github_token')
  if (!token) token = _this.global_store.token
  if (!token) token = _item('#pusher', false)?.global_store.token
  // if still missing, prompt user for token and store in local storage
  if (!token) {
    token = await _modal({
      content: `${_this.name} needs your [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) for updating items from GitHub. Token is optional for public repos but is strongly recommended as token-free access can be severely throttled by GitHub.`,
      confirm: 'Use Token',
      cancel: 'Skip',
      input: '',
    })
    if (token) localStorage.setItem('mindpage_github_token', token)
  }
  // save token in global store if missing there
  return token ? (_this.global_store.token = token) : null
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

// checks for updates to item, returns path->hash object of updates or null
// similar to /_updates command defined in index.svelte in mind.page repo
async function check_updates(item, mark_pushables = false) {
  const attr = item.attr
  const { owner, repo, branch, path } = attr
  const source = `${owner}/${repo}/${branch}`
  // _this.log(`checking for updates to ${item.name} from ${source}/${path} ...`)
  const token = await github_token(item)
  const github = token ? new Octokit({ auth: token }) : new Octokit()
  const updates = {} // path->hash object of available updates
  try {
    // check for change to item
    const {
      data: [{ sha }],
    } = await github.repos.listCommits({
      ...attr,
      sha: attr.branch,
      per_page: 1,
    })
    // _this.debug(`listCommits returned sha ${sha} for ${path}`)
    if (sha != attr.sha) updates[path] = sha
    if (mark_pushables) {
      // compare item text sha to last update/install
      const {
        data: { files },
      } = await github.repos.getCommit({ ...attr, ref: attr.sha })
      const file_sha = files.find(f => f.filename == path)?.sha
      let text = item.text
      // undo embeds based on original bodies in attr.embeds[].body
      if (attr.embeds) {
        text = text.replace(
          /```(\S+):(\S+?)\n(.*?)\n```/gs,
          (m, pfx, sfx, body) => {
            if (!sfx.includes('.')) return m // not path
            const path = resolve_embed_path(sfx, attr)
            body = item.attr.embeds.find(e => e.path == path).body
            return '```' + pfx + ':' + sfx + '\n' + body + '\n```'
          }
        )
      }
      if (file_sha != github_sha(text)) {
        _this.warn(`${item.name} is inconsistent with source ${source}/${path}`)
        item.pushable = true // mark pushable until pushed to source
      }
    }

    // check for changes to embeds
    if (attr.embeds) {
      // if we are marking pushables, we need to extract embed text from item
      let embed_text = {}
      if (mark_pushables) {
        for (let [m, pfx, sfx, body] of item.text.matchAll(
          /```(\S+):(\S+?)\n(.*?)\n```/gs
        )) {
          if (!sfx.includes('.')) continue // not path
          const path = resolve_embed_path(sfx, attr)
          embed_text[path] = body
        }
      }

      for (let embed of attr.embeds) {
        const {
          data: [{ sha }],
        } = await github.repos.listCommits({
          ...attr,
          path: embed.path,
          sha: attr.branch,
          per_page: 1,
        })
        // _this.debug(`listCommits returned sha ${sha} for ${embed.path}`)
        if (sha != embed.sha) updates[embed.path] = sha
        if (mark_pushables) {
          // compare embed text sha to last update/install
          const {
            data: { files },
          } = await github.repos.getCommit({ ...attr, ref: embed.sha })
          const file_sha = files.find(f => f.filename == embed.path)?.sha
          if (file_sha != github_sha(embed_text[embed.path])) {
            _this.warn(
              `embed ${item.name}:${embed.path} is inconsistent with ` +
                `source ${source}/${embed.path} and requires manual ` +
                `/push or /_update`
            )
            item.pushable = true // mark pushable until pushed to source
          }
        }
      }
    }
  } catch (e) {
    _this.error(`failed to check for updates to ${item.name}: ` + e)
  }
  if (_.isEmpty(updates)) {
    // _this.log(`no updates to ${item.name} from ${source}/${path}`)
    return null
  } else {
    _this.log(
      `found ${_.size(updates)} updates to ${item.name} from ` +
        `${source} at paths: ${_.keys(updates).join(', ')}`
    )
  }
  return updates
}

// resolves embed path relative to container item (attr) path
function resolve_embed_path(path, attr) {
  if (path.startsWith('/') || !attr.path.includes('/', 1)) return path
  return attr.path.substr(0, attr.path.lastIndexOf('/')) + '/' + path
}

// updates item from github source
// applies specific updates (path->sha map) returned by check_updates
// similar to /_update command defined in index.svelte in mind.page repo
// allows item to be renamed with a warning to console
// returns true iff item was updated successfully
async function update_item(item, updates) {
  // record updates as item.global_store._updater.last_update
  // enables detection of remote updates in _on_global_store_change above
  // previous state is restored on failure (when false is returned)
  const prev_updater_state = item.global_store._updater
  item.global_store._updater = { last_update: updates }

  const start = Date.now()
  const attr = item.attr
  const { owner, repo, branch, path } = attr
  const source = `${owner}/${repo}/${branch}`
  const token = await github_token(item)
  const github = token ? new Octokit({ auth: token }) : new Octokit()
  _this.log(`updating ${item.name} from ${source}/${path} ...`)
  try {
    // compute updated text, reusing existing text if no updates
    // note retrieved text is pre-embed, existing text is post-embed
    let sha, text
    if (updates[path]) {
      sha = updates[path]
      text = decodeBase64(
        (
          await github.repos.getContent({
            owner,
            repo,
            ref: sha, // content in latest commit
            path,
          })
        )?.data?.content ?? ''
      )
      // trim spaces, esp. since github likes to add an extra line
      // this is fine since we use commit sha to detect changes
      text = text.trim()

      // disallow renames during auto-updates
      const parsed_label = _parse_label(text)
      if (parsed_label != item.name) {
        throw new Error(
          `parsed label '${parsed_label}' does not match current name ` +
            `${item.name} for auto-update from ${source}/${path}; ` +
            `renaming updates can break dependencies and ` +
            `require manual /_update`
        )
      }
    } else {
      sha = attr.sha
      text = item.text
      // undo embeds based on original bodies in attr.embeds[].body
      // necessary since we update attr.embeds[] (w/ orig bodies) below
      if (attr.embeds) {
        text = text.replace(
          /```(\S+):(\S+?)\n(.*?)\n```/gs,
          (m, pfx, sfx, body) => {
            if (!sfx.includes('.')) return m // not path
            const path = resolve_embed_path(sfx, attr)
            body = item.attr.embeds.find(e => e.path == path).body
            return '```' + pfx + ':' + sfx + '\n' + body + '\n```'
          }
        )
      }
    }

    // install missing dependencies based on updated text
    // dependency paths MUST match the (resolved) hidden tags
    // confirmation is required to prevent installs at multiple tabs/devices
    // dependencies are rechecked and update is checked and restarted as needed
    // this must be done before any changes to attr (e.g. attr.sha) below
    if (updates[path]) {
      const label = _parse_label(text)
      if (label) {
        const deps = _resolve_tags(
          label,
          _parse_tags(text).hidden.filter(t => !_special_tag(t))
        )
        const missing_deps = deps.filter(dep => !_exists(dep))
        if (missing_deps.length) {
          _this.log(
            `confirming installation of ${missing_deps.length}` +
              ` missing dependencies (${missing_deps.join(', ')})` +
              ` to continue updating ${item.name} from ${source}/${path} ...`
          )
          const confirmed = await _modal({
            content:
              `${_this.name} needs to install ${missing_deps.length}` +
              ` missing dependencies (${missing_deps.join(', ')})` +
              ` to continue updating ${item.name} from ${source}/${path} ...`,
            confirm: 'Continue',
            cancel: 'Cancel',
          })
          if (!confirmed) {
            _this.warn(
              `update cancelled for ${item.name} from ` +
                `${source}/${path} due to missing dependencies`
            )
            item.global_store._updater = prev_updater_state
            return false
          }
          for (let dep of deps) {
            if (_exists(dep)) {
              if (!_exists(dep, false /*allow_multiple*/))
                _this.warn(`invalid (ambiguous) dependency ${dep} for ${label}`)
              continue
            }
            _this.log(`installing dependency ${dep} for ${label} ...`)
            const dep_path = dep.slice(1) // path assumed same as tag
            const command = `/_install ${dep_path} ${repo} ${branch} ${owner} ${
              token || ''
            } <- ${label}`
            const install = MindBox.create(command) // trigger install
            if (!(install instanceof Promise))
              throw new Error(`invalid return from /_install command`)
            const item = await install
            if (!item)
              throw new Error(
                `failed to install dependency ${dep} for ${label}`
              )
            // name/path consistency should be enforced by _install for dependency
            if (item.name.toLowerCase() != dep.toLowerCase())
              throw new Error(
                `invalid name ${item.name} for installed ` +
                  `dependency ${dep} of ${label}`
              )
            _this.log(`installed dependency ${dep} for ${label}`)
          }
          // trigger another update (recursively) if still needed
          // skip if already in queue for another update
          const has_updates = await check_updates(item)
          if (has_updates && !_this.store.modified_ids.includes(item.id)) {
            _this.log(
              `update restarted for ${item.name} from ` +
                `${source}/${path} after dependencies installed`
            )
            return await update_item(item, updates)
          } else {
            _this.log(
              `update no longer needed for ${item.name} from ` +
                `${source}/${path} after dependencies installed`
            )
            return true // updated
          }
        }
      }
    }

    // update attributes, to be saved on item.write below
    // NOTE: attr is generally considered read-only and permanent; this is a rare exception and it works because it does not affect rendering/ranking so it does not require special handling during firestore sync
    attr.sha = sha // new commit sha
    attr.token = token // token for future updates

    // extract existing embed text from current item text
    // to avoid retrieving text for embeds w/o updates
    let embed_text = {}
    if (attr.embeds) {
      for (let [m, pfx, sfx, body] of item.text.matchAll(
        /```(\S+):(\S+?)\n(.*?)\n```/gs
      )) {
        if (!sfx.includes('.')) continue // not path
        const path = resolve_embed_path(sfx, attr)
        embed_text[path] = body
      }
    }

    // extract embed paths from updated text
    // number of embeds can change here if item text is updated
    let embeds = []
    for (let [m, sfx, body] of text.matchAll(/```\S+:(\S+?)\n(.*?)\n```/gs))
      if (sfx.includes('.')) embeds.push(resolve_embed_path(sfx, attr))

    // update attr.embeds array
    const prev_embeds = attr.embeds
    attr.embeds = null // start w/ null = no embeds
    for (let path of _.uniq(embeds)) {
      try {
        // start w/ sha of existing embed, or undefined if missing
        let sha = prev_embeds?.find(e => e.path == path)?.sha
        if (!sha /* new embed*/ || updates[path] /* updated */) {
          sha = updates[path]
          embed_text[path] = decodeBase64(
            (
              await github.repos.getContent({
                owner,
                repo,
                ref: sha, // content in latest commit
                path,
              })
            )?.data?.content ?? ''
          )
        }
        attr.embeds = (attr.embeds ?? []).concat({ path, sha })
      } catch (e) {
        throw new Error(`failed to embed '${path}': ${e}`)
      }
    }

    // replace embed block body with (updated) embed text
    text = text.replace(
      /```(\S+):(\S+?)\n(.*?)\n```/gs,
      (m, pfx, sfx, body) => {
        if (!sfx.includes('.')) return m // not path
        const path = resolve_embed_path(sfx, attr)
        // store original body in attr.embeds
        // only last body is retained for multiple embeds of same path
        attr.embeds.find(e => e.path == path).body = body
        return '```' + pfx + ':' + sfx + '\n' + embed_text[path] + '\n```'
      }
    )

    // confirm if updating "pushable" item w/ unpushed changes
    if (item.pushable && item.text != text) {
      _this.log(
        `confirming overwrite of unpushed changes ` +
          `to continue updating ${item.name} from ${source}/${path} ...`
      )
      const overwrite = await _modal({
        content: `Overwrite unpushed changes in ${item.name}?`,
        confirm: 'Overwrite',
        cancel: 'Cancel',
        background: 'cancel',
      })
      if (!overwrite) {
        _this.warn(
          `update cancelled for ${item.name} from ` +
            `${source}/${path} due to unpushed changes`
        )
        return false
      }
    }

    // write new text to item (also triggers save of modified attributes)
    // keep_time to avoid bringing up items due to auto-updates
    // note item text/deephash may be unchanged (e.g. if the update was
    //   triggered by a push from the same item), so keeping the time
    //   helps avoid any redundant re-rendering of the item
    // log warning if auto-update changed item name
    const prev_name = item.name
    item.write(text, '' /*, { keep_time: true }*/)
    if (item.name != prev_name)
      _this.warn(
        `renaming update for ${item.name} (was ${prev_name})` +
          ` from ${source}/${path}`
      )

    // invoke _on_update() on item if defined as function
    if (item.text.includes('_on_update')) {
      try {
        _item(item.id).eval(
          `if (typeof _on_update == 'function') ` +
            `_on_update(_item('${item.id}'))`,
          {
            trigger: 'updater',
          }
        )
      } catch (e) {} // already logged, just continue
    }

    // clear pushable flag to resume auto-side-push to source
    item.pushable = false

    _this.log(
      `updated ${item.name} from ${source}/${path} ` +
        `in ${Date.now() - start}ms`
    )
    return true
  } catch (e) {
    _this.error(`update failed for ${item.name} from ${source}/${path}: ${e}`)
    item.global_store._updater = prev_updater_state
    return false
  }
}
// => /edit item [editor=github]
// opens `item` for editing in `editor`
// | `item`   | item `#name` or id
// | `editor` | `github` (default), `vscode`, or `mindpage`
async function _on_command_edit(args, name, editor = 'github') {
  if (!name) {
    alert(`usage: /edit item [editor=github]`)
    return '/edit '
  }
  const item = _item(name)
  if (!item) {
    alert(`/edit: ${name} missing or ambiguous`)
    return `/edit ${args}`
  }
  if (!item.attr) {
    alert(`/edit: ${name} not an installed item`)
    return `/edit ${args}`
  }
  const { owner, repo, branch, path } = item.attr
  if (editor == 'github') {
    window.open(`https://github.com/${owner}/${repo}/edit/${branch}/${path}`)
  } else if (editor == 'vscode') {
    window.open(`https://github.dev/${owner}/${repo}/blob/${branch}/${path}`)
  } else if (editor == 'mindpage') {
    item.editable = true // make it editable (if not already)
    // edit item ...
    _update_dom().then(() => {
      const container = item.elem?.querySelector('.container')
      container?.dispatchEvent(new Event('mousedown'))
      container?.dispatchEvent(new Event('click'))
      // focus on editor textarea ...
      _update_dom().then(() => container?.querySelector('textarea')?.focus())
    })
    return item.name // focus on item
  } else {
    alert(`/edit: unknown editor '${editor}'`)
    return `/edit ${args}`
  }
}
