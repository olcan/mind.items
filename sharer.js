// define #share/<key>(/<index>) tags as special
// must return list of aliases to use for dependencies & navigation
// must return array of tags for matching tags, falsy for non-matching tags
const _share_tag_regex = /^#share\/[\w-]+(?:\/\d+)?$/
const _special_tag_aliases = tag =>
  tag?.match(_share_tag_regex) ? ['#features/_share'] : null

function _on_welcome() {
  each(_items(), update_sharing)
}

function update_sharing(item) {
  const share_tags = item.tags.filter(t => t.match(_share_tag_regex))
  if (!item.attr?.shared && empty(share_tags)) return // nothing to do

  each(share_tags, tag => {
    const [m, key, index] = tag.match(/^#share\/([\w-]+)(?:\/(\d+))?$/)
    // debug(tag, item.name)
    if (
      !item.attr?.shared?.keys.includes(key) ||
      item.attr.shared.indices?.[key] != index
    ) {
      const index_str = defined(index) ? ` at index ${index}` : ''
      warn(`sharing ${item.name} on '${key}'${index_str} (tag ${tag})`)
      try {
        item.share(key, defined(index) ? parseInt(index) : undefined)
      } catch (e) {
        error(`failed to share ${item.name} on '${key}'${index_str}; ${e}`)
      }
    }
  })

  each(item.attr?.shared?.keys ?? [], key => {
    const index = item.attr.shared.indices?.[key]
    const tag = '#share/' + key + (defined(index) ? '/' + index : '')
    // debug('attr', tag, item.name)
    if (!share_tags.includes(tag)) {
      warn(`unsharing ${item.name} on '${key}' (missing tag ${tag})`)
      try {
        item.unshare(key)
      } catch (e) {
        error(`failed to unshare ${item.name} on '${key}'; ${e}`)
      }
    }
  })
}

// detect any changes to todo items & re-render widgets as needed
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // ignore dependency changes
  // note ignoring remote changes is important to avoid feedback loops
  // (i.e. due to syncing of changes via attr in _both_ directions)
  if (remote) return // remote changes should be handled locally
  const item = _item(id, false) // can be null if item deleted
  if (item) update_sharing(item)
}
