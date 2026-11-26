const _chat = _item('$id')

// is `item` a chat item?
// chat items have `#chat` as their first dependency
const is_chat_item = item =>
  item &&
  equal(item.dependencies.slice(0, _chat.dependencies.length + 1), [
    ..._chat.dependencies,
    _chat.id,
  ])

// parse_messages(item|text = _this)
// parse messages in `item` or `text`
// for `item`, messages from dependencies are included as prefix
// messages are delimited by macros, end of item, or `_output|_log` blocks
// if message ends in `message|msg` block, raw message JSON is parsed from that
// if message ends in `agent` block, agent config object (js) is parsed from that
// currently allowed delimiter macros are `system|user|_?agent|tool`
// valid parsed messages have form `{ role, [content, name, item, agent] }`
// does _not_ eval macros in message content
// maintains whitespace in message content
// the message boundaries of a transcript, shared by parse_messages and parse_last_turn: a role
// opener at a line start (spaces allowed), then the message's content up to the next opener,
// the end of the text, or an _output|_log block; groups: role, name argument, content
const _message_regex =
  /(?:^|\n) *\<< *(system|user|_?agent|tool)(?: *\( *([^\n]*) *\))? *>>(.*?)(?=$|\n *\<< *(?:system|user|_?agent|tool)(?: *\([^\n]*\))? *>>| *```(?:_output|_log)\s*\n)/gis
// `chain` is internal: the items whose transcripts are being assembled below this one, so a
// chat parent that leads back to one of them (two items naming each other) fails instead of
// recursing without end
function parse_messages(arg = _this, chain = []) {
  if (!defined(arg)) fatal('missing item|text')
  let item, text
  if (is_item(arg)) {
    item = arg
    text = item.read()
  } else if (is_string(arg)) text = arg
  else fatal('invalid item|text: ', arg)
  if (item && !is_chat_item(item)) fatal(`item ${item.name} is not a chat item`)
  if (item?.read('_log|_output'))
    fatal(`chat item ${item.name} has _log|_output`)

  // parse messages delimited by macros, end of item, or _output/_log blocks
  let messages = Array.from(
    text.matchAll(_message_regex),
    ([m, role, name, content]) => {
      if (name) {
        try {
          name = __eval(name)
        } catch {} // attempt eval, ignore errors
        if (!is_string(name))
          fatal(`invalid non-string name argument '${name}' for delimiter`)
      }
      // if content ends with a 'message|msg' block, parse as JSON, ignore prefix
      // used for _agent|tool but can also be used for testing/debugging
      let regex =
        /^.*```(?:json:)?(?:message|msg)(?:_removed|_hidden)? *\n( *|.*?\n *)```\s*$/is
      if (content.match(regex)) {
        // remove block wrapper, trim, take '' as '{}', parse as JSON
        const msg = JSON.parse(content.replace(regex, '$1').trim() || '{}')
        // log missing role as an error (content is optional for aux messages)
        if (!msg.role) {
          ;(item ?? _this).error(`message block (json) missing role`, msg)
          item?.write_log()
        }
        return msg
      }
      // if content ends with a 'agent' block, eval as js and store as 'agent'
      regex =
        /(^.*?)\s*(?:---+\s*)?```(?:js:)?agent(?:_removed|_hidden)? *\n( *|.*?\n *)```\s*$/is
      let agent
      if (content.match(regex)) {
        try {
          // remove block wrapper, trim, take '' as '{}'
          let js = content.replace(regex, '$2').trim() || '{}'
          // trim comments in the tail (assume trimmed and trim again)
          // note this allows comments _outside_ object scope {…}
          js =
            js
              .replace(/(^|\s|[})\]])(?:\/\/[^\n]*|\/\*.*?\*\/)$/s, '$1')
              .trim() || '{}'
          agent = (item ?? _this).eval('(' + js + ')') // wrap in (…) to return object
          if (!is_plain_object(agent))
            fatal('invalid return from agent block:', agent)
        } catch (e) {
          ;(item ?? _this).error(`agent block eval failed`, e)
          item?.write_log()
        }
        // remove block from 'content' to be included separately as 'agent'
        // note we also remove hr/whitespace before block (see regex above)
        content = content.replace(regex, '$1')
      }
      return {
        role: lower(role),
        content,
        // exclude falsy 'name' or 'agent'
        ...(name ? { name } : {}),
        ...(agent ? { agent } : {}),
      }
    }
  )

  // if parsing from item, prepend any messages in _direct_ dependencies
  // the transcript continues its ONE chat parent (chat_parent below); we also include item name
  // as 'item' in all messages
  if (item) {
    each(messages, msg => (msg.item = item.name))
    if (chain.includes(item.id)) fatal('chat dependency cycle through', item.name)
    const { parent, ambiguous } = chat_parent(item)
    if (ambiguous) fatal('multiple chat dependencies:', ambiguous.map(dep => dep.name).join(', '))
    if (parent) {
      const dep_messages = parse_messages(parent, chain.concat(item.id))
      if (dep_messages.length) messages = dep_messages.concat(messages)
    }
  }
  return messages
}

// chat_parent(item)
// the chat item whose transcript `item` CONTINUES (its messages are the prefix of item's), as
// `{ parent }` (null for a standalone transcript) or `{ ambiguous: [items] }`: over item's
// dependencies (its ordered closure, one entry per item, item itself never among them) the chat
// items named by item's own hidden tags are the tag-named candidates and item's immediate
// label-prefix parent, when a chat item among the dependencies, the prefix candidate (nesting
// under #_autodep); exactly one tag-named candidate is the parent whatever the prefix candidate
// (a renamed node, `#p/plan-b #_p/0/0`: the tag names the parent, the label only the place),
// none leaves the prefix candidate, two or more are the ambiguity. The one rule of the chat
// tree, shared by parse_messages and the header's descendant deletion, and the bridge's
// resolve_chain (lib/mindpage_lineage.py); labels resolve case-insensitively (the app's and
// the vault's resolvers alike), hidden tags are lowercase already
const chat_parent = item => {
  const label = lower(item.label ?? '')
  const prefix_label = label.includes('/') ? label.slice(0, label.lastIndexOf('/')) : ''
  const hidden = new Set(item.tags_hidden.map(lower))
  const tagged = []
  let prefix = null
  for (const id of item.dependencies) {
    const dep = _item(id)
    if (!is_chat_item(dep)) continue // not a chat item
    const dep_label = lower(dep.label ?? '')
    if (hidden.has(dep_label)) tagged.push(dep)
    else if (prefix_label && dep_label == prefix_label) prefix = dep
  }
  if (tagged.length > 1) return { parent: null, ambiguous: tagged }
  return { parent: tagged[0] ?? prefix, ambiguous: null }
}

// inheriting_chats(item = _this)
// the descendant chat items that INHERIT `item`'s messages (a truncation's deleted and rerun
// messages included) as their transcript prefix, transitively: the chats whose chat_parent is
// `item`, theirs, ...; a chat item that merely depends on `item` some other way (through a
// note, a shared utility, a hidden tag beside its real parent) inherits nothing and is not one,
// nor is a chat whose parent is ambiguous (it has no transcript to inherit with). NOT
// evaluating anything (the dependency closure and the labels only)
function inheriting_chats(item = _this) {
  // each candidate's chat parent selected once (the passes below only look it up)
  const candidates = (item.dependents ?? [])
    .map(id => _item(id, { silent: true }))
    .filter(d => d && is_chat_item(d))
    .map(d => ({ item: d, parent: chat_parent(d).parent }))
  const kept = new Map([[item.id, item]])
  let grew = true
  while (grew) {
    grew = false
    for (const { item: d, parent } of candidates) {
      if (kept.has(d.id)) continue
      if (parent && kept.has(parent.id)) {
        kept.set(d.id, d)
        grew = true
      }
    }
  }
  kept.delete(item.id)
  return Array.from(kept.values())
}

// own_message_count(text)
// the number of messages in `text` itself (no dependency prefix), WITHOUT evaluating anything
const own_message_count = text => Array.from(text.matchAll(_message_regex)).length

// parse_last_turn(text)
// the last message of `text` as `{ role, content }` WITHOUT evaluating or reinterpreting
// anything (the delimiter's name argument, a trailing `agent` block, a `message|msg` block stay
// text), or `null` for a text without messages: an observer's reading of a transcript (the
// #vault item's save-time mark decides a pending request on it, as the bridge does on its own
// restored transcript), at the same boundaries as parse_messages (_message_regex)
function parse_last_turn(text) {
  let last = null
  for (const [, role, , content] of text.matchAll(_message_regex)) last = { role: lower(role), content }
  return last
}

async function _delete_agent_messages_below(e) {
  e.preventDefault()
  e.stopPropagation()
  const message = e.target.closest('.message')
  if (!message) return
  const content = e.target.closest('.item > .content')
  const messages = content.querySelectorAll('div.message')
  let index = find_index(messages, e => e.isSameNode(message))
  // FAIL CLOSED when the app's _vault_edit seam is absent (review 149 §2): a stale tab's
  // raw fallback could persist opaque markers or parse a candidate's fake delimiters into
  // this destructive truncation -- ask for a reload instead (before any dialog)
  const grammar = window._grammar
  if (!(grammar?.version >= 2)) {
    _modal_alert('please reload to delete messages (app update required)')
    return
  }
  // verify dom against parsed messages (read() is the grammar view); the RAW text the write
  // rewrites is captured here too, before the dialog
  const raw = _this.text
  let text = read()
  let parsed = parse_messages(text)
  if (parsed.length != messages.length)
    fatal('inconsistent parsed messages', parsed, messages)
  // increment index if clicked message is a user|system message
  // i.e. interpret as "everything _below_ this user|system message"
  if (['user', 'system'].includes(parsed[index].role)) index++
  if (index > parsed.length) fatal('invalid index', index)
  if (index == parsed.length) {
    _modal_alert('nothing to remove below this message')
    return // nothing to remove
  }
  // index-sensitive whole-item rewrite: route through the app's _vault_edit seam so the
  // truncation runs over the grammar view (message boundaries are exact, a candidate's
  // fake delimiters cannot shift them) and the raw vault_result envelopes are RESTORED
  // rather than persisted as opaque markers (review 148 §2)
  const truncate = grammar => {
    let out = grammar
    let count = parse_messages(out).length
    while (count > index) {
      out = out.replace(
        /^(.*)\n *\<< *(?:system|user|_?agent|tool)(?: *\([^\n]*\))? *>>.*?$/is,
        '$1'
      )
      const removed = parse_messages(out).length
      if (removed >= count) fatal('failed to remove last message')
      count = removed
    }
    return out
  }
  // a destructive rewrite that also reruns the chat from the kept last user message: the
  // owner confirms it first (2026-09-27: a stray click on a header truncated a chat). The
  // descendants that INHERIT the removed messages (inheriting_chats: the chat items carrying
  // this transcript as their prefix) are deleted with it, each named with its own message
  // count and the total said, since a truncation would rewrite their history from under them
  // (the owner, 2026-09-27)
  const doomed = inheriting_chats()
  const captured = new Map(doomed.map(d => [d.id, d.text])) // their raw texts, before the dialog
  const own = new Map(doomed.map(d => [d.id, own_message_count(d.read())]))
  const plural = (n, word) => `${n} ${word}${n == 1 ? '' : 's'}`
  const listed = doomed.map(d => `${d.name} with ${plural(own.get(d.id), 'message')}`).join(', ')
  const removed = parsed.length - index
  const total = removed + Array.from(own.values()).reduce((a, b) => a + b, 0)
  const kept = parsed[index - 1]?.role ?? parsed[index].role
  if (
    !(await _modal_confirm(
      `Remove ${plural(removed, 'message')} below this ${kept} message` +
        (doomed.length
          ? `, and the ${doomed.length == 1 ? 'chat' : plural(doomed.length, 'chat')} below it ` +
            `inheriting them (${listed})? ${plural(total, 'message')} in total.`
          : '?') +
        ` The chat continues from there.`
    ))
  )
    return
  // the dialog stops no other tab's edit and no arriving reply (app_tweaks review 0): the
  // index was decided over the text the dialog asked about, so the write goes over THAT text
  // only; a vanished item (its id no longer resolves; its text getter would throw), a changed
  // text or a changed set of descendants is refused and the owner clicks the header again
  const self = _item(_this.id, { silent: true })
  if (!self) {
    _modal_alert('the chat was deleted while the dialog was open')
    return
  }
  if (self.text !== raw) {
    _modal_alert('the chat changed while the dialog was open; click the header again')
    return
  }
  // the same inheriting chats with the same raw texts (a reply that arrived in one of them,
  // an edit in another tab, a same-count change: the owner confirmed THESE contents)
  const below = inheriting_chats()
  const same =
    below.length == doomed.length &&
    below.every(d => captured.has(d.id) && captured.get(d.id) === d.text)
  if (!same) {
    _modal_alert('the chats below this one changed while the dialog was open; click the header again')
    return
  }
  // the parent FIRST: its write can be declined (the app's own prompt for a large text) or the
  // transformation can fail, and neither may leave the inheriting chats already deleted; they
  // go only once the parent's write was accepted, the deepest first (a child never outlives
  // its parent chat), in an order fixed BEFORE the write (the removed text may hold the tag
  // the descendants' dependency lists came from; review 3)
  const order = below.sort((a, b) => b.dependencies.length - a.dependencies.length)
  const out = grammar.edit(raw, truncate, { allowDrop: true })
  if (write(out, '') === false) return // declined: nothing changed, nothing deleted
  for (const d of order) d.delete(false /*confirm: the dialog above was the confirmation*/)
}

// hide_first_user_row(text, name)
// whether a chat item's first user row is hidden, so that its message starts beside the item's
// name tag: `text` begins with the tag `name`, the rest of the name's line holds hidden tags at
// most, and only blank lines stand between that line and the first user delimiter
function hide_first_user_row(text, name) {
  const raw = String(text ?? '')
  const item = String(name ?? '')
  if (!raw || !item) return false

  const tag = item.startsWith('#') ? item : '#' + item
  if (raw.slice(0, tag.length).toLowerCase() !== tag.toLowerCase()) return false

  // refuse a longer tag that merely begins with the name
  const after = raw[tag.length]
  if (after != null && !/\s/.test(after)) return false

  // the name's line: after the name only hidden tags, written as whole words (a hash and an
  // underscore; a second hash glued to one, or a box-drawing bar inside one, makes the app draw
  // text there). The app writes a chat's hidden tags on this line. Whatever the app makes of
  // them, they stand in the name's own paragraph, which is never hidden
  const hidden_tag = /^#_[^#\s<>&?!,.;:"'`(){}\[\]\u2502]+$/
  const name_end = raw.indexOf('\n', tag.length)
  if (name_end < 0) return false // no later line, so no delimiter
  if (!raw.slice(tag.length, name_end).split(/\s+/).filter(word => word).every(word => hidden_tag.test(word))) return false

  // the lines after it, up to the first line that is the bare user delimiter (0-3 leading
  // spaces, so that Marked parses its html block and not an indented one; a delimiter with an
  // argument draws no user row): every one of them blank. The stylesheet hides the paragraphs
  // between the name's paragraph and a hidden row, so only blank lines may make them: a tag on
  // a line of its own can be drawn as text (after a line of four spaces the app reads it as
  // code), and would vanish with the row (reviews 0 and 1 of the thread first_user_row). Walked
  // by offsets, so that the decision reads the lines before the delimiter and not the whole
  // chat. NOTE: this file is embedded in the chat item's own text, where the app expands an
  // unescaped macro opener that has its closer on the same line, also in code and comments:
  // this item's three embedded files keep every opener escaped, and no comment writes a tag
  for (let start = name_end + 1; start <= raw.length; ) {
    let end = raw.indexOf('\n', start)
    if (end < 0) end = raw.length
    const line = raw.slice(start, end)
    if (/^ {0,3}\<< *user *>>/.test(line)) return true
    if (line.trim()) return false
    start = end + 1
  }
  return false // no user delimiter
}

// generic delimiter macro reused by role-specific macros defined below
const _delimiter = (role, name = role, ...args) => {
  if (name && !is_string(name))
    throw new Error(`invalid non-string name argument '${name}'`)
  if (args.length > 0) throw new Error(`invalid extra arguments '${args}'`)

  // the item's first macro alone can be its first user row: the renderer and the cached read
  // both name it `macro_0` (an evaluation without a trigger draws no row of the item). For it,
  // read raw `_this.text` (not the grammar view `read()`) and `_this.label` (not `_name`, which
  // becomes `id:...` on duplicate labels)
  const first_macro = role === 'user' && typeof __trigger === 'string' && __trigger === 'macro_0'
  const raw = first_macro && typeof _this !== 'undefined' && typeof _this?.text === 'string' ? _this.text : ''
  const label = first_macro && typeof _this !== 'undefined' && typeof _this?.label === 'string' ? _this.label : ''
  const hide_first = first_macro && hide_first_user_row(raw, label)
  const state = hide_first ? 'hideFirstUserRow' : ''

  return html(
    _item('$id')
      .read('html') // see html block below
      .replace(/%role/g, role)
      .replace(/ ?%state/g, state ? ' ' + state : '') // before the name, which may hold that word
      .replace(/%name/g, name)
  )
}

// system message
const system = _delimiter('system')

// user message
const user = _delimiter('user')

// agent([name])
// agent message
// `name` is any helpful identifier
const agent = (...args) => _delimiter('agent', ...args)

// tool([name])
// tool message
// `name` is any helpful identifier
// message should end in a `msg` block containing JSON for tool output
const tool = (...args) => _delimiter('tool', ...args)

// internal macro for intermediate agent messages for tool use
const _agent = (name = 'tools', ...args) => _delimiter('_agent', name, ...args)

// shared post-creation init for chat commands (_chat_command and chat/vault's _on_command_vault):
// where a creation opens the new item's editor (shift held), its caret stands at the END of the
// text, where the message goes on (after a plain command, one space after the user macro), as a
// child created under a chat has it: the app puts the caret of an item that a command generated
// at its start. The app focuses the editor's own field and sets that caret in ONE step of the
// page's update, so this waits for that field's focus and moves the caret right after that step,
// before the page can take a key (a job queued at the focus runs when the step that focused
// ends): a first character typed at once goes where the caret is seen, and a selection made
// later is never moved. Only the editor's own field, by its id: a field in the item's drawn
// text is left alone. Asked for only where the creation opened the editor (the item is being
// edited when the app hands it over); the wait for the focus ends with the page's update
// (_update_dom: the app's step, then two frames)
function _chat_command_init(item) {
  if (!item) return // (a creation that was refused: the app has said so, and there is no item to name)
  if (item.editing) {
    // (only the edit this creation opened: a later edit of the item keeps its own caret)
    const id = 'textarea-' + item.id
    const done = () => document.removeEventListener('focusin', focused, true)
    const focused = e => {
      const field = e.target
      if (field?.id != id) return
      done()
      queueMicrotask(() => void (field.selectionStart = field.selectionEnd = field.value.length))
    }
    document.addEventListener('focusin', focused, true)
    _update_dom().then(done)
  }
  if (MindBox.get().trim().toLowerCase() == item.name.toLowerCase() || window['__item']?.(item.id)?.target) {
    MindBox.elem.blur() // leave the box unfocused as MindBox.set did (avoids debouncing later changes)
    MindBox.scroll_to_target() // creation runs with layout scrolling disabled, so scroll explicitly once rendered
  } else {
    MindBox.set(item.name, { scroll: true }) // command ran without the box (e.g. a clicked link): navigate as before
  }
}

// common logic for chat commands, e.g. /gpt hello
function _chat_command(msg) {
  let suffix = 0
  while (_exists(_name + '/' + suffix)) suffix++
  const name = _name + '/' + suffix
  return {
    text: [name, `\<<user>> ` + msg].join('\n'),
    edit: window['_mindbox_event']?.shiftKey, // edit if shift held
    mindbox_text: name, // apply the new chat's query in the same step as creation (avoids MindBox.set debounce)
    // skip save if editing as it can interfere with agent saving response
    // TODO: is this still true since we revamped (now promise-based) saving
    // save: !window['_mindbox_event']?.shiftKey,
    init: _chat_command_init,
  }
}
