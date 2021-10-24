// init updater on welcome, i.e. after page is fully rendered
// ensures page is ready to display modals, e.g. for token prompts
// also allows existing items to initialize before being updated
function _on_welcome() {
  init_updater()
}

let modified_ids = []
let pending_updates

async function init_updater() {
  _this.log(`initializing ...`)
  // check for updates on page init
  for (let item of installed_named_items()) {
    const has_updates = await check_updates(item)
    if (has_updates) await update_item(item)
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
        _this.debug(
          `github_webhook commit sha ${body.after} ` +
            `in ${owner}/${repo}/${branch} (was ${body.before})`
        )

        const commits = (body.commits ?? []).filter(c => c.modified?.length)
        if (commits.length == 0) return // no commits w/ modifications

        // scan items for installed items w/ modified paths
        for (let item of installed_named_items()) {
          if (
            item.attr.owner != owner ||
            item.attr.repo != repo ||
            item.attr.branch != branch
          )
            return // item not from modified repo/branch
          // calculate item paths, including any embeds, removing slash prefixes
          let paths = [
            item.attr.path,
            ...(item.attr.embeds?.map(e => e.path) ?? []),
          ].map(path => path.replace(/^\//, ''))
          // update item if any paths were modified in any commits
          if (
            commits.some(commit =>
              paths.some(path => commit.modified.includes(path))
            )
          ) {
            _this.debug(
              `github_webhook commit modified ${item.name} in ` +
                `${owner}/${repo}/${branch}`
            )
            // push to back of queue if not already in queue
            if (!modified_ids.includes(item.id)) modified_ids.push(item.id)
          }
        }

        // update modified items
        // sequentialize across firebase events (via pending_updates)
        // also sequentialize with pushes via window._github_pending_push
        //   prevents interleaving of pulls and pushes across an item+embeds
        //   note an update is needed to pull the latest commit shas even if
        //     the content was pushed from the item being updated, though
        //     update_item should consider text may be unchanged
        pending_updates = window._github_pending_push = Promise.all([
          pending_updates,
          window._github_pending_push,
        ])
          .then(async () => {
            while (modified_ids.length)
              await update_item(_item(modified_ids.shift()))
          })
          .finally(() => (pending_updates = window._github_pending_push = null))
      })
    })
}

// returns items that are installed and named (i.e. uniquely labeled)
const installed_named_items = () =>
  _labels((_, ids) => ids.length == 1)
    .map(_item)
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
// prefers item.attr.token, falls back to localStorage
// prompts user for token if none is found
// returns null if no token is available
async function github_token(item) {
  let token = item.attr.token ?? localStorage.getItem('mindpage_github_token')
  if (!token) {
    token = await _modal({
      content: `${_this.name} needs your [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) for auto-updating items from GitHub. Token is optional for public repos but is strongly recommended as token-free access can be severely throttled by GitHub.`,
      confirm: 'Use Token',
      cancel: 'Skip',
      input: '',
      password: false,
    })
    if (token) localStorage.setItem('mindpage_github_token', token)
  }
  return token
}

// checks for updates to item, returns true iff updated
// similar to /_updates command defined in index.svelte in mind.page repo
async function check_updates(item) {
  const attr = item.attr
  const { owner, repo, branch, path } = attr
  _this.log(
    `checking for updates to ${item.name} ` +
      `from ${owner}/${repo}/${branch}/${path} ...`
  )
  const token = await github_token(item)
  const github = token ? new Octokit({ auth: token }) : new Octokit()
  try {
    // check for change to item
    const {
      data: [{ sha }],
    } = await github.repos.listCommits({
      ...attr,
      sha: attr.branch,
      per_page: 1,
    })
    if (sha != attr.sha) return true

    // check for changes to embeds
    if (attr.embeds) {
      for (let embed of attr.embeds) {
        const {
          data: [{ sha }],
        } = await github.repos.listCommits({
          ...attr,
          path: embed.path,
          sha: attr.branch,
          per_page: 1,
        })
        if (sha != embed.sha) return true
      }
    }
  } catch (e) {
    _this.error(`failed to check for updates to ${item.name}: ` + e)
  }
  _this.log(
    `no updates to ${item.name} from ${owner}/${repo}/${branch}/${path}`
  )
  return false // no updates
}

// updates item from github source
// similar to /_update command defined in index.svelte in mind.page repo
// main difference is that this is intended as an auto-update in background
// allows item to be renamed with a warning to console
async function update_item(item) {
  const start = Date.now()
  const attr = item.attr
  const { owner, repo, branch, path } = attr
  const token = await github_token(item)
  const github = token ? new Octokit({ auth: token }) : new Octokit()
  _this.log(
    `auto-updating ${item.name} from ` +
      `${owner}/${repo}/${branch}/${path} ...`
  )
  try {
    // retrieve commit sha (allows comparison to later versions)
    const {
      data: [{ sha }],
    } = await github.repos.listCommits({
      owner,
      repo,
      sha: branch,
      path,
      per_page: 1,
    })
    _this.debug(`listCommits(${path}) sha: ${sha}`)
    // retrieve text at this commit sha
    const { data } = await github.repos.getContent({
      owner,
      repo,
      ref: sha, // content in latest commit
      path,
    })
    let text = decodeBase64(data.content)

    // update attributes, to be saved on item.write below
    attr.sha = sha // new commit sha
    attr.embeds = null // new embeds filled in below (in case embeds changed)
    attr.token = token // token for future updates

    // pre-process text for whitespace and embeds
    text = text.trim() // trim any spaces (github likes to add extra line)
    // extract colon-suffixed embed path in block types
    let embeds = []
    text = text.replace(/```\S+:(\S+?)\n(.*?)\n```/gs, (m, sfx, body) => {
      if (sfx.includes('.')) {
        // process & drop suffix as embed path
        let path = sfx // may be relative to container item path (attr.path)
        if (!path.startsWith('/') && attr.path.includes('/', 1))
          path = attr.path.substr(0, attr.path.indexOf('/', 1)) + '/' + path
        embeds.push(path)
      }
      return m
    })

    // fetch embed text and latest commit sha
    let embed_text = {}
    for (let path of _.uniq(embeds)) {
      try {
        const {
          data: [{ sha }],
        } = await github.repos.listCommits({
          owner,
          repo,
          sha: branch,
          path,
          per_page: 1,
        })
        _this.debug(`listCommits(${path}) sha: ${sha}`)
        const { data } = await github.repos.getContent({
          owner,
          repo,
          ref: sha, // content in latest commit
          path,
        })
        embed_text[path] = decodeBase64(data.content)
        attr.embeds = (attr.embeds ?? []).concat({ path, sha })
      } catch (e) {
        throw new Error(`failed to embed '${path}'; error: ${e}`)
      }
    }

    // replace embed block body with embed contents
    text = text.replace(
      /```(\S+):(\S+?)\n(.*?)\n```/gs,
      (m, pfx, sfx, body) => {
        if (sfx.includes('.')) {
          let path = sfx // may be relative to container item path (attr.path)
          if (!path.startsWith('/') && attr.path.includes('/', 1))
            path = attr.path.substr(0, attr.path.indexOf('/', 1)) + '/' + path
          // store original body in attr.embeds
          // only last body is retained for multiple embeds of same path
          attr.embeds.find(e => e.path == path).body = body
          return '```' + pfx + ':' + sfx + '\n' + embed_text[path] + '\n```'
        }
        return m
      }
    )

    // trigger install command for missing dependencies based on new text
    // dependency paths MUST match the (resolved) hidden tags
    const label = _parse_label(text)
    if (label) {
      const deps = _resolve_tags(
        label,
        _parse_tags(text).hidden.filter(t => !_special_tag(t))
      )
      for (let dep of deps) {
        if (_exists(dep)) {
          // ignore existing dep
          if (!_exists(dep, false /*allow_multiple*/))
            _this.warn(`invalid (ambiguous) dependency ${dep} for ${label}`)
          continue
        }
        _this.log(`installing dependency ${dep} for ${label} ...`)
        const dep_path = dep.slice(1) // path assumed same as tag
        const command = `/_install ${dep_path} ${repo} ${branch} ${owner} ${
          token || ''
        }`
        window._pending_install = null
        const install = MindBox.create(command) // trigger install
        if (!(install instanceof Promise))
          throw new Error(`invalid return from /_install command`)
        const item = await install
        if (!item)
          throw new Error(`failed to install dependency ${dep} for ${label}`)
        if (item.name.toLowerCase() != dep.toLowerCase())
          throw new Error(
            `invalid name ${item.name} for installed ` +
              `dependency ${dep} of ${label}`
          )
        _this.log(`installed dependency ${dep} for ${label}`)
      }
    }

    // write new text to item (also triggers save of modified attributes)
    // keep_time to avoid bringing up items due to auto-updates
    // note item text/deephash may be unchanged (e.g. if the update was
    //   triggered by a push from the same item), so keeping the time
    //   helps avoid any redundant re-rendering of the item
    // log warning if auto-update changed item name
    const prev_name = item.name
    item.write(text, '', { keep_time: true })
    if (item.name != prev_name)
      _this.warn(
        `auto-update for ${item.name} (was ${prev_name})` +
          ` from ${owner}/${repo}/${branch}/${path} renamed item`
      )

    // invoke _on_update() if it exists
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

    _this.log(
      `auto-updated ${item.name} from ${owner}/${repo}/${branch}/${path} ` +
        `in ${Date.now() - start}ms`
    )
  } catch (e) {
    _this.error(
      `failed to auto-update ${item.name} ` +
        `from ${owner}/${repo}/${branch}/${path}: ${e}`
    )
  }
}
