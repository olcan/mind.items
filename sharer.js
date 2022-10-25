// define #share/<key>(/<index>) tags as special
// must return list of aliases to use for dependencies & navigation
// must return array of tags for matching tags, falsy for non-matching tags
// containing file can not perform item lookup or other ops in global scope
const _share_tag_regex = /^#share\/[\w-]+(?:\/\d+)?$/
const _special_tag_aliases = tag =>
  tag?.match(_share_tag_regex) ? ['#features/_share'] : null

function _on_welcome() {
  // note we can skip unshares since update_shared_deps handles them
  each(_items(), item => update_shared(item, { skip_unshares: true }))
  update_shared_deps()
}

// updates item's 'shared' attribs to sync w/ its #share/... tags
// always removes any sharing keys added to dependencies (w/o tags)
// can auto-update dependencies if item is/was shared
// returns array of share tags (if any) on item
function update_shared(
  item,
  { skip_unshares = false, update_deps = false, silent = false } = {}
) {
  const share_tags = item.tags.filter(t => _share_tag_regex.test(t))
  // return immediately if item is not shared by attributes or tags
  if (!item.shared && empty(share_tags)) return // nothing to do

  each(share_tags, tag => {
    const [m, key, index] = tag.match(/^#share\/([\w-]+)(?:\/(\d+))?$/)
    // debug(tag, item.name)
    if (
      !item.shared?.keys.includes(key) ||
      item.shared.indices?.[key] != index
    ) {
      const index_str = defined(index) ? ` at index ${index}` : ''
      if (!silent)
        print(`sharing ${item.name} on '${key}'${index_str} (tag ${tag})`)
      try {
        item.share(key, defined(index) ? parseInt(index) : undefined)
      } catch (e) {
        error(`failed to share ${item.name} on '${key}'${index_str}; ${e}`)
      }
    }
  })

  if (!skip_unshares) {
    each(item.shared?.keys ?? [], key => {
      const index = item.shared.indices?.[key]
      const tag = '#share/' + key + (defined(index) ? '/' + index : '')
      // debug('attr', tag, item.name)
      if (!share_tags.includes(tag)) {
        if (!silent)
          print(`unsharing ${item.name} on '${key}' (missing tag ${tag})`)
        try {
          item.unshare(key)
        } catch (e) {
          error(`failed to unshare ${item.name} on '${key}'; ${e}`)
        }
      }
    })
  }

  // update dependencies if requested (and only for shared items)
  if (update_deps) update_shared_deps()

  return share_tags
}

// shares dependencies recursively
// dependencies may include visible tags + #sharer (for handling share tags)
// attributes are used to avoid dependency cycles (as already-shared keys)
// returns names of all shared deps, including indirect deps, across all keys
function share_deps(item) {
  const deps = []
  each(item.shared.keys, key => {
    // include visible tags + #sharer if item is visible, exclude otherwise
    const names = item.shared.indices
      ? _resolve_tags(
          item.label,
          item.tags.filter(t => t != item.label && !_special_tag(t))
        ).concat('#sharer')
      : item.dependencies
    each(names, name => {
      const dep = _item(name, { silent: true }) // null if missing or ambiguous
      if (!dep) return // skip missing dependency
      if (dep.shared?.keys.includes(key)) return // already shared under key
      dep.share(key)
      deps.push(dep.name, ...share_deps(dep, key))
    })
  })
  return uniq(deps)
}

// updates items that should be shared as dependencies
// requires two full passes over all shared items (by attribute)
// note incremental updates are possible but likely not worth complexity
// e.g. requires redundant tracking of sharing attributes in case items deleted
// note item.attr updates are async, allowing unshares/shares to cancel out
function update_shared_deps() {
  const start = Date.now()
  // unshare existing dependencies (silently since changes are expected)
  let deps_prev = []
  each(_items(), item => {
    if (!item.shared) return
    const tags = update_shared(item, { silent: true })
    if (!tags.length) deps_prev.push(item.name)
  })
  // share dependencies (recursively) for all shared items
  let deps = []
  each(_items(), item => {
    if (!item.shared) return
    deps.push(...share_deps(item))
  })
  deps = uniq(deps)
  deps_prev = uniq(deps_prev)
  const dels = diff(deps_prev, deps)
  const adds = diff(deps, deps_prev)
  if (dels.length) print(`unshared ${dels.length} deps: ${dels.join(' ')}`)
  if (adds.length) print(`shared ${adds.length} deps: ${adds.join(' ')}`)
  debug(`updated shared deps in ${Date.now() - start}ms`)
}

// detect any changes to todo items & re-render widgets as needed
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // ignore dependency changes
  // note ignoring remote changes is important to avoid feedback loops
  // (i.e. due to syncing of changes via attr in _both_ directions)
  if (remote) return // remote changes should be handled locally
  const item = _item(id, { silent: true }) // can be null if item deleted
  if (item) update_shared(item, { update_deps: true })
  else update_shared_deps() // can be affected by deletions
}

// sharer widget macro for listing shared items
function sharer_widget(options = {}) {
  const pages = {}
  each(_items(), item => {
    if (!item.shared) return
    each(item.shared.keys, key => (pages[key] ??= []).push(item))
  })
  const lines = []
  each(entries(pages), ([key, items]) => {
    sort_by(
      items,
      item => item.shared.indices?.[key] ?? Infinity,
      item => -sum_by(item.tags, t => (_share_tag_regex.test(t) ? 1 : 0))
    )
    const line = [`[${key}](https://${location.host}?shared=${key})`]
    for (const [j, item] of items.entries()) {
      const index = item.shared.indices?.[key]
      const tagged = item.tags.some(t => _share_tag_regex.test(t))
      if (index != undefined) line.push(item.name /* + `[${index}]`*/)
      else if (tagged) line.push(item.name)
      else {
        line.push(
          `<span style="font-size:80%">+${items.length - j} dependencies</span>`
        )
        break
      }
    }
    lines.push(line.join(' '))
  })
  return lines.join('\n')
}
