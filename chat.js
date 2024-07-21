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
function parse_messages(arg = _this) {
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
    text.matchAll(
      /(?:^|\n) *\<< *(system|user|_?agent|tool)(?: *\( *([^\n]*) *\))? *>>(.*?)(?=$|\n *\<< *(?:system|user|_?agent|tool)(?: *\([^\n]*\))? *>>| *```(?:_output|_log)\s*\n)/gis
    ),
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
          js = js.replace(/(?:\/\/[^\n]*|\/\*.*?\*\/)$/s, '').trim() || '{}'
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
  // only a single direct chat dependency is allowed to avoid ambiguity
  // we also include item name as 'item' in all messages
  if (item) {
    each(messages, msg => (msg.item = item.name))
    let chat_dep // chat dependency item name
    for (const id of item.dependencies) {
      const dep = _item(id)
      if (!is_chat_item(dep)) continue // not a chat item
      // also skip if chat item is not a direct dependency
      // need to consider nesting also due to #_autodep (on #chat)
      if (
        !item.tags_hidden.includes(dep.label) &&
        (!item.label.startsWith(dep.label + '/') ||
          item.label.substring(dep.label.length + 1).includes('/'))
      )
        continue // not a direct dependency
      if (chat_dep)
        fatal('multiple chat dependencies:', dep.name, chat_dep.name)
      chat_dep = dep
      const dep_messages = parse_messages(dep)
      if (dep_messages.length) messages = dep_messages.concat(messages)
    }
  }
  return messages
}

function _delete_agent_messages_below(e) {
  e.preventDefault()
  e.stopPropagation()
  const message = e.target.closest('.message')
  if (!message) return
  const content = e.target.closest('.item > .content')
  const messages = content.querySelectorAll('div.message')
  let index = find_index(messages, e => e.isSameNode(message))
  // verify dom against parsed messages
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
  while (parsed.length > index) {
    text = text.replace(
      /^(.*)\n *\<< *(?:system|user|_?agent|tool)(?: *\([^\n]*\))? *>>.*?$/is,
      '$1'
    )
    const removed = parse_messages(text)
    if (removed.length >= parsed.length) fatal('failed to remove last message')
    parsed = removed
  }
  write(text, '')
}

// generic delimiter macro reused by role-specific macros defined below
const _delimiter = (role, name = role, ...args) => {
  if (name && !is_string(name))
    throw new Error(`invalid non-string name argument '${name}'`)
  if (args.length > 0) throw new Error(`invalid extra arguments '${args}'`)
  return html(
    _item('$id')
      .read('html') // see html block below
      .replace(/%role/g, role)
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

// common logic for chat commands, e.g. /gpt hello
function _chat_command(msg) {
  let suffix = 0
  while (_exists(_name + '/' + suffix)) suffix++
  const name = _name + '/' + suffix
  return {
    text: [name, `\<<user>> ` + msg].join('\n'),
    mindbox_text: name, // select new item
    save: false, // can interfere with agent saving response
    edit: window['_mindbox_event']?.shiftKey, // edit only if shift held
  }
}
