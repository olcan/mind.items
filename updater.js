// init updater on welcome, i.e. after page is fully rendered
// ensures page is ready to display modals, e.g. for token prompts
// also allows existing items to initialize before being updated
function _on_welcome() {
  init_updater()
}

async function init_updater() {
  _this.log(`initializing ...`)
  const store = _this.store
  const modified_ids = (store.modified_ids = []) // modified item id queue
  const pending_updates = (store.pending_updates = {}) // pending update commit shas
  store.update_modal = null // visible update modal (if any)

  // check for updates on page init
  // stop on errors fatal to all items (rate limit / auth / network), which
  // would otherwise fail (and log an error for) every remaining item;
  // the next page load retries
  try {
    for (let item of installed_named_items()) {
      const updates = await check_updates(item, true /* mark_pushables */)
      if (updates) await update_item(item, updates)
    }
  } catch (e) {
    _this.warn(`stopped update checks: ${e}`)
  }

  // listen for updates through firebase
  _this.log(`listening for updates ...`)
  const { getFirestore, query, collection, where, onSnapshot } =
    firebase.firestore
  onSnapshot(
    query(
      collection(getFirestore(firebase), 'github_webhooks'),
      where('time', '>', Date.now())
    ),
    snapshot => {
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
                _modal_update(
                  store.update_modal,
                  `${_this.name} is ready to update ${modified_ids.length} ` +
                    `installed item${s}: ${modified_names.join(', ')}`
                )
              }
            }
          }
        }
      })

      // update modified items
      // serialize updates via _this.store._update
      // also coordinate w/ #pusher via #pusher.store._push
      // helps reduce conflict errors and rate-limit violations
      // confirmation dialog further serializes updates across tabs/devices
      _this.store._update = Promise.allSettled([
        _this.store._update,
        _item('#pusher', { silent: true })?.store._push,
      ]).then(async () => {
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
        try {
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
        } catch (e) {
          // stop on errors fatal to all items; remaining items update on
          // the next webhook, /update command, or page load
          _this.error(`stopped update batch: ${e}`)
        }
      })
    }
  )
}

// detect remote updates and cancel unnecessary local updates
function _on_global_store_change(id, remote) {
  if (!remote) return // not a remote change
  const item = _item(id)
  if (!item.attr?.source) return // not an installed item
  if (!item.name.startsWith('#')) return // not a named item
  // if item is pending update, check for remote update
  let { modified_ids, pending_updates } = _this.store
  if (!pending_updates?.[id]) return // not pending any updates
  // if last update in global store contains pending update, cancel locally
  const last_update = item.global_store._updater?.last_update
  if (values(last_update).includes(pending_updates[id])) {
    _this.log(`detected remote update for ${item.name}`)
    // remove item/update from local update queue
    modified_ids.splice(modified_ids.indexOf(item.id), 1)
    delete pending_updates[id]
    // update modal if visible, close if no other updates pending
    if (_this.store.update_modal) {
      const modified_names = modified_ids.map(id => _item(id).name)
      const s = modified_ids.length > 1 ? 's' : ''
      _modal_update(
        _this.store.update_modal,
        `${_this.name} is ready to update ${modified_ids.length} ` +
          `installed item${s}: ${modified_names.join(', ')}`
      )
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
    .filter(item => item.attr?.source)

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

// single github client, reused while the token is unchanged
let _github_client, _github_client_token
function github_client(token) {
  if (token != _github_client_token) {
    _github_client_token = token
    _github_client = token ? new Octokit({ auth: token }) : new Octokit()
  }
  return _github_client
}

// spacing between github api calls to stay under secondary (burst) rate limits;
// exceeding them fails calls with opaque network/CORS errors in browsers, since
// the error responses can lack CORS headers, hiding status and Retry-After
let _last_github_call_time = 0
async function pace_github_call() {
  const wait = _last_github_call_time + 400 + 200 * Math.random() - Date.now()
  if (wait > 0) await _delay(wait)
  _last_github_call_time = Date.now()
}

// is error fatal to all subsequent github calls (vs specific to an item)?
// network/CORS failures (usually secondary rate limits) can be status-less
// (plain fetch TypeError), wrapped by Octokit as status 500, or best detected
// by message across browsers ('Failed to fetch' chrome, 'Load failed' safari,
// 'NetworkError ...' firefox); 5xx also covers transient github server errors
const is_infra_error = e =>
  !e?.status ||
  e.status >= 500 ||
  [401, 403, 429].includes(e.status) ||
  /failed to fetch|load failed|networkerror/i.test(e?.message ?? '')

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
  if (!token) token = _item('#pusher', { silent: true })?.global_store.token
  // if still missing, prompt user for token and store in local storage
  if (!token) {
    token = await _modal({
      content: `${_this.name} needs your [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) for updating items from GitHub. Token is required even for public repos to avoid strict rate limits imposed on token-free access by GitHub.`,
      confirm: 'Use Token',
      cancel: 'Cancel',
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
  // guard against non-installed items: without a github source there is
  // nothing to check, and attempting one would throw (null attr) or fire a
  // junk api request (undefined owner/repo -> 404) that burns rate limits
  if (!attr?.source) return null
  const { owner, repo, branch, path } = attr
  const source = `${owner}/${repo}/${branch}`
  // _this.log(`checking for updates to ${item.name} from ${source}/${path} ...`)
  // EARLY refusals before token/network work (reviews 152 §2.2, 153 §2): a stale
  // runtime cannot scan (read() is raw, so the marker prefix can never match) -- refuse
  // the embed-bearing pushable check outright rather than after github calls
  const app_grammar = window._grammar
  if (item.attr?.embeds && !(app_grammar?.version >= 2)) {
    // the fence covers EVERY grammar-sensitive embed path (review 180 §3.2), not only
    // mark_pushables: the marker preflight below must warn-and-return on a stale app,
    // never throw, and never reach token/network work
    _this.warn(`skipping update check for ${item.name}: app update required (reload)`)
    return false
  }
  // real-embed marker preflight: a REAL embed whose grammar-view body holds a vault
  // result refuses the check before any token or github work
  if (item.attr?.embeds)
    for (const [m, pfx, sfx, body] of item.read().matchAll(/```(\S+):(\S+?)\n(.*?)\n```/gs)) {
      if (!sfx.includes('.')) continue // not path
      if (app_grammar.containsOpaqueMarker(body)) {
        _this.warn(`embed ${sfx} in ${item.name} contains a vault result; skipping update check`)
        return false
      }
    }
  const token = await github_token(item)
  if (!token) {
    _this.warn(
      `unable to check for updates to ${item.name} from ` +
        `${source}/${path} due to missing token`
    )
    return false
  }
  const github = github_client(token)
  const updates = {} // path->hash object of available updates
  try {
    // check for change to item
    await pace_github_call()
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
      await pace_github_call()
      const {
        data: { files },
      } = await github.repos.getCommit({ ...attr, ref: attr.sha })
      const file_sha = files.find(f => f.filename == path)?.sha
      let text = item.text
      // PRE-UNDO concurrent-marker scan (review 153 §2): a real-embed candidate that
      // ARRIVED during the awaited getCommit would be dropped by the undo below, so
      // _vault_edit would throw its postcondition error before the explicit fill scan --
      // and the generic catch could then return the already-recorded update. three
      // deliberate scans mark three distinct race boundaries: entry state (top),
      // this awaited-arrival boundary, and the update_item capture-time fill.
      if (attr.embeds)
        for (const [m2, pfx2, sfx2, body2] of item.read().matchAll(/```(\S+):(\S+?)\n(.*?)\n```/gs)) {
          if (!sfx2.includes('.')) continue // not path
          if (app_grammar.containsOpaqueMarker(body2)) {
            _this.warn(`embed ${sfx2} in ${item.name} contains a vault result; skipping update check`)
            return false
          }
        }
      // undo embeds based on original bodies in attr.embeds[].body -- over the GRAMMAR
      // VIEW, restoring raw vault_result envelopes (review 149 §2)
      if (attr.embeds) {
        const undo = grammar =>
          grammar.replace(/```(\S+):(\S+?)\n(.*?)\n```/gs, (m, pfx, sfx, body) => {
            if (!sfx.includes('.')) return m // not path
            const path = resolve_embed_path(sfx, attr)
            body = item.attr.embeds.find(e => e.path == path)?.body
            if (!defined(body))
              _this.fatal(`missing body for embed ${item.name}:${path}`, str(item.attr))
            return '```' + pfx + ':' + sfx + '\n' + body + '\n```'
          })
        // FAIL CLOSED on a stale runtime (review 150 §2.4): raw undo would parse and
        // mutate candidate bytes; skip the pushable comparison until this tab reloads
        if (!(app_grammar?.version >= 2)) {
          _this.warn(`skipping pushable check for ${item.name}: app update required (reload)`)
          return false // no update information; nothing marked
        }
        text = app_grammar.edit(text, undo)
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
        // over the GRAMMAR VIEW (review 150 §2.2): a candidate-body `type:path.ext`
        // block must not feed sha comparison or mark the item pushable. a REAL embed
        // whose body holds a vault result is refused outright (review 151 §2.2): its
        // marker-domain sha is meaningless and the item cannot be pushed or updated
        for (let [m, pfx, sfx, body] of item.read().matchAll(/```(\S+):(\S+?)\n(.*?)\n```/gs)) {
          if (!sfx.includes('.')) continue // not path
          if (app_grammar.containsOpaqueMarker(body)) {
            _this.warn(`embed ${sfx} in ${item.name} contains a vault result; skipping update check`)
            return false
          }
          const path = resolve_embed_path(sfx, attr)
          embed_text[path] = body
        }
      }

      for (const embed of attr.embeds) {
        // NOTE: there may be no commit/sha for new embeds
        await pace_github_call()
        const sha = (
          await github.repos.listCommits({
            ...attr,
            path: embed.path,
            sha: attr.branch,
            per_page: 1,
          })
        )?.data[0]?.sha
        // _this.debug(`listCommits returned sha ${sha} for ${embed.path}`)
        if (sha && sha != embed.sha) updates[embed.path] = sha

        if (mark_pushables) {
          if (!embed.sha) {
            // new embed
            item.pushable = true // mark pushable until pushed to source
          } else {
            // compare embed text sha to last update/install
            await pace_github_call()
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
    }
  } catch (e) {
    // rethrow errors fatal to all items so callers can stop instead of
    // failing (and logging an error for) every remaining item
    if (is_infra_error(e)) throw e
    _this.error(`failed to check for updates to ${item.name}: ` + e)
  }
  if (empty(updates)) {
    // _this.log(`no updates to ${item.name} from ${source}/${path}`)
    return null
  } else {
    _this.log(
      `found ${size(updates)} updates to ${item.name} from ` +
        `${source} at paths: ${keys(updates).join(', ')}`
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
// returns true iff the update fully completed; a false return can follow an ACCEPTED
// write when post-write housekeeping fails -- the text/metadata and the once-per-accepted-
// write global_store._updater marker are then retained (published only at acceptance,
// never up front, so pre-write failures need no marker restoration)
async function update_item(item, updates) {
  // the _updater.last_update marker is published once per ACCEPTED write (review 144
  // SS3, wording per 146 SS5: acceptance is the synchronous writer result -- the queued
  // save settles later): publishing it up front made it durable and visible to other
  // tabs while the overwrite modal was still open -- _on_global_store_change consumes
  // it as an applied remote update and deletes its own pending entry, which no local
  // restore can recreate. later post-write housekeeping errors must not revoke it.
  const fail_update = why => {
    _this.warn(why)
    return false
  }

  const start = Date.now()
  const attr = item.attr
  const { owner, repo, branch, path } = attr
  const source = `${owner}/${repo}/${branch}`
  // pre-call CAPABILITY FENCE (review 146 SS3): only the new app runtime's writer
  // reports boolean acceptance. a stale runtime performs side effects (zwsp
  // normalization, time bump, queued item/history saves) BEFORE any result could be
  // inspected, so it must not be called at all -- fail closed until this tab reloads
  // into the new app. mind.items can therefore publish independently of app activation.
  const app_grammar = window._grammar
  if (item.write_accepts !== true || !(app_grammar?.version >= 2))
    return fail_update(
      `update requires app reload for ${item.name} (writer acceptance or vault edit capability missing)`
    )
  // EARLY real-embed marker preflight (review 152 §2.2): a REAL embed whose grammar-view
  // body holds a vault result refuses the update BEFORE token acquisition, repository
  // fetches, or dependency installation can side-effect; the late fill check remains to
  // catch a concurrent edit landing during the awaited work
  if (attr.embeds)
    for (const [m, pfx, sfx, body] of item.read().matchAll(/```(\S+):(\S+?)\n(.*?)\n```/gs)) {
      if (!sfx.includes('.')) continue // not path
      if (app_grammar.containsOpaqueMarker(body))
        return fail_update(`embed ${sfx} in ${item.name} contains a vault result; cannot update`)
    }
  const token = await github_token(item)
  if (!token)
    return fail_update(
      `update cancelled for ${item.name} from ${source}/${path} due to missing token`
    )
  const github = github_client(token)
  _this.log(`updating ${item.name} from ${source}/${path} ...`)
  try {
    // compute updated text, reusing existing text if no updates
    // note retrieved text is pre-embed, existing text is post-embed
    let sha, text
    let text_is_current = false // else-branch: text is the current item, not the trusted repo file
    let grammar_text // the current item's (undone) grammar view, for masked path discovery
    if (updates[path]) {
      sha = updates[path]
      await pace_github_call()
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
      // CURRENT-ITEM branch (review 150 §2.2): all further parsing of `text` must be
      // over the grammar view -- a candidate can carry fake `type:path.ext` blocks.
      // (the fetched-repository branch above is the trusted-owner raw carveout)
      text_is_current = true
      // undo embeds based on original bodies in attr.embeds[].body (necessary since we
      // update attr.embeds[] w/ orig bodies below) -- over the GRAMMAR VIEW; the undone
      // grammar is captured for the path discovery below (candidates masked)
      if (attr.embeds) {
        const undo = grammar =>
          grammar.replace(/```(\S+):(\S+?)\n(.*?)\n```/gs, (m, pfx, sfx, body) => {
            if (!sfx.includes('.')) return m // not path
            const path = resolve_embed_path(sfx, attr)
            body = item.attr.embeds.find(e => e.path == path).body
            return '```' + pfx + ':' + sfx + '\n' + body + '\n```'
          })
        text = app_grammar.edit(item.text, grammar => (grammar_text = undo(grammar)))
      } else {
        app_grammar.edit(item.text, grammar => (grammar_text = grammar)) // capture only
      }
    }

    // install missing dependencies based on updated text
    // all tags (not just hidden tags) are considered dependencies
    // dependency paths MUST match the (resolved) hidden tags
    // confirmation is required to prevent installs at multiple tabs/devices
    // dependencies are rechecked and update is checked and restarted as needed
    // this must be done before any changes to attr (e.g. attr.sha) below
    if (updates[path]) {
      const label = _parse_label(text)
      if (label) {
        const deps = _resolve_tags(
          label,
          _parse_tags(text).all.filter(t => t != label && !_special_tag(t))
        )
        let missing_deps = deps.filter(dep => !_exists(dep))
        // close the runtime autodep edge (see install_deps in the mind.page repo): once no
        // TEXT dependencies are missing — so the decision sees post-dependency local state,
        // matching the app's two-phase install order (the restart below re-enters here after
        // text deps install) — ask the app for the label-prefix parent that belongs in this
        // item's closure; a missing parent rides the same confirm/install/restart flow below.
        // guarded so stale app clients without the seam keep the old text-tags-only behavior
        if (empty(missing_deps) && typeof _autodep_parent == 'function') {
          const parent = await _autodep_parent({ label, text, owner, repo, branch, path, token })
          if (parent && !_exists(parent)) {
            deps.push(parent) // installed by the deps loop below
            missing_deps = [parent]
          }
        }
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
            if (!is_promise(install))
              throw new Error(`invalid return from /_install command`)
            const item = await install
            if (!item)
              throw new Error(
                `failed to install dependency ${dep} for ${label}`
              )
            // name/path consistency should be enforced by _install for dependency
            if (lower(item.name) != lower(dep))
              throw new Error(
                `invalid name ${item.name} for installed ` +
                  `dependency ${dep} of ${label}`
              )
            _this.log(`installed dependency ${dep} for ${label}`)
          }
          // trigger another update (recursively) if still needed
          // skip if already in queue for another update
          const updates = await check_updates(item)
          if (updates && !_this.store.modified_ids.includes(item.id)) {
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

    // NOTE: attr.sha/token are assigned AFTER the pushable-overwrite confirm below
    // (2026-08-30): assigning here mutated the live attr before a possible Cancel, and any
    // later attr save (e.g. the pusher marking the item pushable) then persisted the NEW sha
    // with the OLD text -- a stuck item the updater considers current and the pusher considers
    // locally modified, unable to self-heal

    // extract existing embed text from current item text
    // to avoid retrieving text for embeds w/o updates
    let embed_text = {}
    if (attr.embeds) {
      // over the GRAMMAR VIEW (review 149 §2): a candidate-nested `type:path.ext` block
      // must not be extracted as an embed of the current item. REFUSE a marker-bearing
      // REAL embed body (review 151 §2.2, same policy as pusher): embed_text is a side
      // channel later spliced verbatim into the fetched main text and persisted --
      // restoration never applies to captured values, so a candidate inside a real
      // embed would ship as a literal marker
      for (let [m, pfx, sfx, body] of item.read().matchAll(/```(\S+):(\S+?)\n(.*?)\n```/gs)) {
        if (!sfx.includes('.')) continue // not path
        if (app_grammar.containsOpaqueMarker(body))
          return fail_update(`embed ${sfx} in ${item.name} contains a vault result; cannot update`)
        const path = resolve_embed_path(sfx, attr)
        embed_text[path] = body
      }
    }

    // extract embed paths from updated text -- for the current-item branch over its
    // UNDONE GRAMMAR (candidates masked, review 150 §2.2); the fetched repository file
    // is trusted-owner raw. number of embeds can change here if item text is updated.
    let embeds = []
    const discovery_text = text_is_current ? grammar_text : text
    for (let [m, sfx, body] of discovery_text.matchAll(/```\S+:(\S+?)\n(.*?)\n```/gs))
      if (sfx.includes('.')) embeds.push(resolve_embed_path(sfx, attr))

    // build the NEXT embeds array in LOCAL objects (2026-08-30): mutating live attr
    // across the awaited github calls left partial embed metadata behind on a later
    // Cancel/error -- the same stuck class as the main-file sha bug (new embed sha over
    // old inlined text). the live attr commits atomically after the confirm below.
    const prev_embeds = attr.embeds
    let next_embeds = null // start w/ null = no embeds
    for (let path of uniq(embeds)) {
      try {
        // start w/ sha of existing embed, or undefined if missing
        let sha = prev_embeds?.find(e => e.path == path)?.sha
        if (!sha /* new embed*/ || updates[path] /* updated */) {
          sha = updates[path]
          await pace_github_call()
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
        next_embeds = (next_embeds ?? []).concat({ path, sha })
      } catch (e) {
        const error = new Error(`failed to embed '${path}': ${e}`)
        error.status = e?.status // preserve for is_infra_error classification
        throw error
      }
    }

    // replace embed block body with (updated) embed text -- through the edit seam for
    // the current-item branch so a candidate's exact source is never mutated
    const replace_embeds = target =>
      target.replace(/```(\S+):(\S+?)\n(.*?)\n```/gs, (m, pfx, sfx, body) => {
        if (!sfx.includes('.')) return m // not path
        const path = resolve_embed_path(sfx, attr)
        // store original body in next_embeds (committed to attr after the confirm)
        // only last body is retained for multiple embeds of same path
        next_embeds.find(e => e.path == path).body = body
        return '```' + pfx + ':' + sfx + '\n' + embed_text[path] + '\n```'
      })
    text = text_is_current ? app_grammar.edit(text, replace_embeds) : replace_embeds(text)

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
      if (!overwrite)
        return fail_update(
          `update cancelled for ${item.name} from ${source}/${path} due to unpushed changes`
        )
    }

    // COMMIT the staged metadata, to be saved on item.write below (and consulted by
    // the post-write check_updates); mutated only after the last cancel surface above
    // NOTE: attr is generally considered read-only and permanent; this is a rare exception and it works because it does not affect rendering/ranking so it does not require special handling during firestore sync
    const prev_sha = attr.sha
    const prev_token = attr.token
    attr.sha = sha // new commit sha
    attr.token = token // token for future updates
    attr.embeds = next_embeds

    // write new text to item (also triggers save of modified attributes)
    // note item text/deephash may be unchanged
    //   (e.g. if the update was triggered by a push from the same item)
    // log warning if auto-update changed item name (should not happen)
    const prev_name = item.name
    // the writer itself can still REFUSE (read-only mode; the large-write prompt being
    // cancelled) -- and text EQUALITY is no success signal for legitimate same-text
    // updates -- so use write()'s explicit acceptance result (review 144 SS4). a refusal
    // rolls the staged metadata back; once accepted, the write is COMMITTED, the marker
    // publishes exactly once, and no later housekeeping error rolls anything back.
    let write_committed = false
    try {
      // the capability fence above guarantees the boolean acceptance contract, so
      // === true is the only success rule (review 146 SS3: no legacy inference -- an
      // old writer's own synchronous transforms, e.g. zwsp normalization, made every
      // post-call predicate unsound)
      write_committed = item.write(text, '') === true
    } finally {
      if (!write_committed) {
        attr.sha = prev_sha
        attr.token = prev_token
        attr.embeds = prev_embeds
      }
    }
    if (!write_committed)
      return fail_update(
        `update write refused for ${item.name} from ${source}/${path} (read-only or cancelled)`
      )
    item.global_store._updater = { last_update: updates } // published ONCE, at success
    if (item.name != prev_name)
      _this.warn(
        `renaming update for ${item.name} (was ${prev_name})` +
          ` from ${source}/${path}`
      )

    // invoke _on_update() on item if defined as function
    if (item.read().includes('_on_update')) {
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
    // also perform another update check with mark_pushables=true
    // this can detect a partial push/update where item remains pushable
    item.pushable = false
    updates = await check_updates(item, true /* mark_pushables */)
    if (item.pushable) {
      _this.warn(
        `update for ${item.name} from ${source}/${path} ` +
          `left unpushed changes; likely partial push/update`
      )
    }
    if (updates && !_this.store.modified_ids.includes(item.id)) {
      _this.warn(
        `additional updates found for ${item.name} from ` +
          `${source}/${path}; performing another update recursively ...`
      )
      return await update_item(item, updates)
    }

    _this.log(
      `updated ${item.name} from ${source}/${path} ` +
        `in ${Date.now() - start}ms`
    )
    return true
  } catch (e) {
    // no marker handling here: the marker publishes only at success (above), so a
    // pre-success failure never wrote it and a post-success failure must not revoke it
    // rethrow errors fatal to all items so callers can stop instead of
    // failing (and logging an error for) every remaining item
    if (is_infra_error(e)) throw e
    _this.error(`update failed for ${item.name} from ${source}/${path}: ${e}`)
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
  if (!item.attr?.source) {
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

// => /update [items]
// update installed items
// `items` can be specific `#label` or id
// paced against github (secondary) rate limits
// stops (w/ report) on errors fatal to all items, e.g. rate limits
// can be cancelled via progress modal
async function _on_command_update(label) {
  let modal // modal promise if open
  let cancelled = false // set on cancel via progress modal button
  try {
    // update installed items only: non-installed items have no github source
    // (attr.source), so checking them just fails (and logs an error) per item
    let items = label ? _items(label) : installed_named_items()
    const skipped = items.filter(item => !item.attr?.source)
    items = items.filter(item => item.attr?.source)
    if (label && skipped.length)
      _this.warn(
        `/update skipping non-installed item${skipped.length > 1 ? 's' : ''}: ` +
          skipped.map(item => item.name).join(', ')
      )
    const s = items.length > 1 ? 's' : ''
    if (items.length == 0) {
      alert(`/update: no installed items${label ? ` matching ${label}` : ''}`)
      return label ? '/update ' + label : '/update'
    }
    modal = _modal({
      content: `Updating ${items.length} item${s} ...`,
      cancel: 'Cancel',
      background: 'block',
    })
    // modal resolves early only via its cancel button (see final confirm below)
    modal.then(() => (cancelled = true))
    await (_this.store._update = Promise.allSettled([
      _this.store._update,
      _item('#pusher', { silent: true })?.store._push,
    ]).then(async () => {
      let updated = 0
      for (const [i, item] of items.entries()) {
        if (cancelled) {
          // modal already closed by cancel button
          modal = null
          _this.warn(`/update cancelled at ${item.name}`)
          alert(
            `/update cancelled at ${i}/${items.length}; ` +
              `updated ${updated} item${updated == 1 ? '' : 's'}`
          )
          return
        }
        _modal_update(modal, {
          content: `Updating ${i + 1}/${items.length} (${item.name}) ...`,
        })
        try {
          const updates = await check_updates(item)
          if (updates && (await update_item(item, updates))) updated++
        } catch (e) {
          // stop and report: error is fatal to all items (see is_infra_error),
          // so continuing would just fail (and log an error) for every item;
          // network/CORS failures are usually github secondary rate limits,
          // whose error responses lack CORS headers (hiding status/Retry-After)
          const network = !e?.status || /failed to fetch|load failed|networkerror/i.test(e?.message ?? '')
          const hint = network || e?.status == 403 || e?.status == 429
            ? ' — likely github rate limit, wait a minute and retry'
            : ''
          _this.error(`/update stopped at ${item.name}: ${e}`)
          await _modal_update(modal, {
            content:
              `Update stopped at ${i + 1}/${items.length} (${item.name}) ` +
              `after updating ${updated} item${updated == 1 ? '' : 's'}: ${e}${hint}`,
            confirm: 'OK',
            background: 'confirm',
          })
          modal = null // closed by await
          return
        }
      }
      await _modal_update(modal, {
        content: `Updated ${updated} of ${items.length} item${s}`,
        confirm: 'OK',
        background: 'confirm',
      })
      modal = null // closed by await
    }))
  } finally {
    if (modal) _modal_close(modal) // close if left open
  }
}
