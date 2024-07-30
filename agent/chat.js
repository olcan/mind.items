// run chat agent on `messages`
// must return agent message text, optionally prefixed as `\<<agent(…)>> …`
// `messages` is array of messages; see `parse_messages(…)` in #chat for schema
// `config` is agent-specific, but `config.name` is reserved for agent name
// other (specific) chat agents should define their own `run_chat_agent`
async function run_chat_agent(messages, config = {}) {
  await _delay(config.delay ?? Math.random() * 1000) // default delay is random
  return (
    `hello world!` +
    (empty(config)
      ? ''
      : '\n' + block('json_config_removed', stringify(config)))
  )
}

// run_on_chat_item([item|name = _this], [msg])
// run chat agent on chat `item` (`name`)
// `item` must not be _running_, and have no `_log|_output` blocks
// ignores item w/o messages or w/ last message empty/whitespace
// ignores item if last message is `agent` or `system` message
// can _resume_ from (internal) `_agent` or `tool` messages
// can also resume from custom message roles like `function`
// drops `user|system` messages w/o content (except agent config)
// drops `<!--comments-->` (and preceding whitespace) in all string `content`
// evaluates macros (incl. placeholders) in all `user` messages w/ string `content`
// if item is _editing_, saves changes, then appends `\<<user>>` section w/o saving
// if custom last `msg` is given, just returns agent message text w/o touching `item`
// `msg` can be user message text (string) or custom message object (role required)
// custom `msg` can have any role, including `agent` or `system`
async function run_on_chat_item(item = _this, msg = undefined) {
  if (is_string(item)) item = _item(item) // look up item by name
  if (!is_chat_item(item)) fatal(`non-chat item ${item.name}`)
  if (item.running) fatal(`item ${item.name} marked running (another agent?)`)
  if (item.read_deep('_log|_output'))
    fatal(`chat item ${item.name} has _log|_output`)

  // process custom last msg if given
  if (is_string(msg)) msg = { role: 'user', content: msg }
  if (msg && !msg.role) fatal(`invalid msg w/ missing role`)

  try {
    let messages = parse_messages(item)
    if (msg) messages.push(msg) // append custom last msg if given

    // check last message to see if agent should reply
    // skip checks if using custom last msg
    if (!msg) {
      if (empty(messages)) return // no messages
      if (!last(messages).content.trim()) return // last message is empty/whitespace
      if (last(messages).role == 'agent') return // last message is agent
      if (last(messages).role == 'system') return // last message is system
    }

    // try block to ensure running/status is cleared
    try {
      // update item running/status, skip if using custom last msg
      // note this is after all checks to avoid unnecessary changes
      //   since these changes can trigger re-ranking/rendering of items
      if (!msg) {
        item.running = true
        item.status = `waiting for ${_name} ...`
      }

      // extract (merge & delete) 'agent' field into 'config'
      const config = {}
      each(messages, msg => {
        merge(config, msg.agent)
        delete msg.agent
      })

      // drop user|system messages w/o content (presumably used for config only)
      remove(
        messages,
        msg => ['user', 'system'].includes(msg.role) && !msg.content
      )
      if (empty(messages)) return // no messages left, nothing to do

      // eval macros in user messages w/ string content
      // include placeholder macros in template items via 'expanded' context
      // drop <!--comments--> (and preceding whitespace) from message contents
      each(messages, msg => {
        if (!is_string(msg.content)) return // can be e.g. array for claude
        msg.content = msg.content.replace(/\s*<!--.*?-->/gs, '')
        msg.content = item.eval_macros(msg.content, { context: 'expanded' })
      })

      // run chat agent to get agent message text
      // note we get `run_chat_agent` by evaluating (async) on chat item
      const run_chat_agent = await item.eval('run_chat_agent', {
        async: true,
        async_simple: true,
      })
      let agent_text = await run_chat_agent(messages, config)

      // prepend delimiter macro if missing, use config.name if specified
      if (!agent_text.startsWith('<<'))
        agent_text = `\<<agent('${config.name || _name}')>> ` + agent_text

      if (msg) return agent_text // just return agent message text, keep item untouched

      // stop if item already ends in an agent message
      // this can happen due to concurrent runs of the agent across instances
      if (last(parse_messages(item)).role == 'agent') return

      // append agent message and save item
      let text = item.read()
      if (!text.endsWith('\n')) text += '\n'
      item.write(text + agent_text, '')
      await item.save()

      // if item is being edited, append \<<user>> w/o saving again
      if (item.editing) {
        await _update_dom()
        // __item(item.id).text += '\n\<<user>> '
        const textarea = item.elem?.querySelector('textarea')
        if (textarea) {
          textarea.focus()
          textarea.selectionStart = textarea.value.length
          document.execCommand('insertText', false, `\n\<<user>> `)
          textarea.selectionStart = textarea.value.length - 10
        }
      }
    } finally {
      // ensure running/status is cleared
      if (!msg) {
        item.running = false
        item.status = ''
      }
    }
  } catch (e) {
    if (!msg) {
      item.error(e)
      item.write_log()
    } else throw e // just rethrow
  }
}

// run chat agent on _all_ dependent chat items
// skips dependents that are _running_ or have `_log|_output` blocks
async function run_on_dependents(agent = _this) {
  await attach(
    Promise.all(
      agent.dependents.map(
        attach(async id => {
          const item = _item(id)
          if (!is_chat_item(item)) return // non-chat item
          if (item.running) return // marked running (another agent?)
          if (item.read_deep('_log|_output')) return // has _log|_output
          await run_on_chat_item(_item(id))
        })
      )
    )
  )
}
