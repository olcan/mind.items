#todoer helps manage todo items.  
- Try <<link_eval(_this, 'create_pinned_item()', 'creating a pinned item')>> with a drag-and-drop widget.
- Try using the `/todo [text]` command to quickly create new items.
- Delegate a todo to the vault agent by dragging it to the widget's agent bin (or `/delegate`; `/delegate text` creates `#todo text` and delegates it, a `#todo` first word kept as written); it moves to the delegated list below the main one, and comes back when the agent hands it back (design: the vault's `notes/design/mind_task_agents.md`).
- A pinned item created before the delegated list exists shows only the main widget: add `\<<todoer_widget({delegated: true})>>` below it (new pins carry both).
- `/notify on` asks for desktop notifications when a task comes back to the main list waiting on you (`question`, `blocked`, `proposal`, `budget`, `done`) and when a vault or task chat gets the agent's reply (`reply`): one per device, from the window you used last, kept on screen until you click it (the click opens the item or the chat); `/notify on taken` adds a reason (`interrupted`, `taken`, or `all`) and asks the permission too (the way to grant a second device without resetting a custom set, since `/notify on` alone resets it to the six), `/notify off done` removes one, `/notify off` turns them off everywhere, `/notify test` shows one, `/notify` shows the setting and this device's permission.
#### Commands
<< command_table() >>
#### Functions
<< js_table() >>

```js_removed:todoer.js
// todoer.js
```

```html_widget_removed:todoer-widget.html
// todoer-widget.html
```

```html_snooze_modal_removed:todoer-snooze-modal.html
// todoer-snooze-modal.html
```

```js:js_init_removed
// the child-customization hook (the vault's notes/design/mind_task_chat.md, section 3): the app
// calls window._customize_child(parent, text) after it allocates a child's label (Ctrl/Shift+Enter
// on a unique label) and APPENDS what it returns after the label. A child of a #todo becomes a
// TASK CHAT (the route tag and #_autodep on the label's line, the first user turn on the next:
// the app's #_autodep applies to the carrier's DESCENDANTS, 2026-09-27, so the chat's own tag
// never makes it depend on the todo; only the todo or one of its unique label ancestors
// carrying the tag would, while
// every item beneath the chat depends on its parent by label prefix); a child of a VAULT CHAT
// becomes its continuation (the first user turn on the next line; the parent's label as a
// hidden tag beside the label only when no label-prefix ancestor carries #_autodep: a chat
// made before that tag, or a label-ancestor scan that exhausts the lookup bound after a valid
// lineage), a vault chat being
// a chat item whose direct-chat lineage (the app's own rule, as agent/chat.js walks it and the
// bridge's resolve_chain resolves it: the ONE chat dependency named by a hidden tag or by the
// item's label prefix) is VALID TO ITS ROOT (an ambiguous step or a cycle anywhere on it, a
// routed item included, gives nothing: the bridge could not resolve such a chat either) and
// carries an item the app's grammar view routes to the vault (window._grammar.routed); any
// other parent is left as the app makes it. The walk takes one parent per step, never revisits
// an item, and looks an item up at most once (a memo, a label aliased to its id), at most
// LOOKUPS uncached lookups for the lineage walk and the label-ancestor scan together: a lineage
// past the bound stops at once with nothing and one console warning, whatever it had found; a
// scan past it after a valid lineage names the parent explicitly, with one warning. The app
// runs _init before its first render, so the hook is defined before any child can be created;
// its tag views drop the hiding underscore (a #_chat/vault line reads as #chat/vault) and its
// labels keep their #.
function _init() {
  const LOOKUPS = 64
  const label_of = item => (item?.label ?? '').replace(/^#/, '').toLowerCase()
  const lookup = (ref, budget) => {
    if (budget.seen.has(ref)) return budget.seen.get(ref)
    if (budget.left <= 0) {
      budget.exhausted = true
      return null
    }
    budget.left--
    let found = null
    try {
      found = _item(ref, { silent: true }) ?? null
    } catch (e) {
      found = null
    }
    budget.seen.set(ref, found)
    if (found?.id != null) budget.seen.set(found.id, found) // a label aliased to its id
    return found
  }
  const chat_root = budget => {
    try {
      return _exists('#chat', false) ? lookup('#chat', budget) : null
    } catch (e) {
      return null
    }
  }
  // the app's chat-item rule (chat.js): the dependencies begin with #chat's own, then #chat
  const is_chat_item = (item, root) => {
    const deps = item?.dependencies ?? []
    const prefix = [...(root.dependencies ?? []), root.id]
    return deps.length >= prefix.length && prefix.every((id, i) => deps[i] == id)
  }
  const AMBIGUOUS = Symbol('ambiguous')
  const EXHAUSTED = Symbol('exhausted')
  // the ONE chat parent (chat.js's chat_parent, the bridge's resolve_chain): among the chat
  // items of the dependencies, those named by the item's hidden tags are the tag-named
  // candidates and the label's parent by one segment the prefix candidate; one tag-named
  // candidate is the parent whatever the prefix candidate (a renamed node, `#p/plan-b
  // #_p/0/0`), none leaves the prefix candidate, two are the ambiguity; a scan the lookup
  // bound cuts short decides nothing (a provisional parent is discarded)
  const direct_parent = (item, root, budget) => {
    const label = label_of(item)
    const prefix_label = label.includes('/') ? label.slice(0, label.lastIndexOf('/')) : ''
    const hidden = (item.tags_hidden ?? []).map(tag => tag.toLowerCase())
    let tagged = null
    let prefix = null
    for (const id of item.dependencies ?? []) {
      const dep = lookup(id, budget)
      if (budget.exhausted) return EXHAUSTED
      if (!dep || !is_chat_item(dep, root)) continue
      const dep_label = label_of(dep)
      if (hidden.includes('#' + dep_label)) {
        if (tagged) return AMBIGUOUS
        tagged = dep
      } else if (prefix_label && dep_label == prefix_label) prefix = dep
    }
    return tagged ?? prefix
  }
  const vault_chat = (parent, budget) => {
    const root = chat_root(budget)
    if (!root || !is_chat_item(parent, root)) return false
    const visited = new Set()
    let item = parent
    let routed = false
    while (item) {
      if (visited.has(item.id)) return false // a cycle: no lineage the bridge could resolve
      visited.add(item.id)
      routed = routed || !!window._grammar?.routed?.(item.text ?? '')
      const next = direct_parent(item, root, budget)
      if (next === AMBIGUOUS) return false // two direct parents anywhere: nothing
      if (next === EXHAUSTED) {
        console.warn(`_customize_child: the chat lineage of ${parent.label} needs more than ${LOOKUPS} lookups; left as the app makes it`)
        return false
      }
      item = next // null: the chain's root
    }
    return routed // the whole chain valid: a vault chat when a link of it is routed
  }
  // whether a child of `parent` adopts it as its first dependency by the app's autodep rule: an
  // ancestor of the child in the app's tree (the parent, or one of the parent's own: the item
  // view's `ancestors`, the label prefixes with the tag parents of renamed nodes spliced in;
  // the label prefixes alone on an app without the view) carries #_autodep (the hidden-tag view
  // drops the underscore); each ancestor one lookup from the SAME bound as the lineage walk
  // (64 uncached lookups for both together); past the bound the walk stops with a warning and
  // the child keeps the explicit parent tag (its binding intact)
  const autodep_ancestor = (parent, budget) => {
    const carries = item => (item?.tags_hidden ?? []).some(tag => tag.toLowerCase() == '#autodep')
    if (carries(parent)) return true
    let levels = parent.ancestors
    if (!Array.isArray(levels)) {
      levels = []
      let label = label_of(parent)
      while (label.includes('/')) levels.push('#' + (label = label.slice(0, label.lastIndexOf('/'))))
    }
    for (const level of levels) {
      const ancestor = lookup(level.toLowerCase(), budget)
      if (budget.exhausted) {
        console.warn(`_customize_child: the label ancestors of ${parent.label} need more than ${LOOKUPS} lookups with its lineage; the parent is named explicitly`)
        return false
      }
      if (carries(ancestor)) return true
    }
    return false
  }
  window._customize_child = (parent, text) => {
    if (!parent || typeof text != 'string') return null
    // the macro opener is escaped for the app (an item's text is a macro source, code blocks
    // included: an unescaped opener here evaluated `user` in the todoer's own context on every
    // render, 2026-09-26); JavaScript reads `\<` as `<`, so the appended text is the plain turn
    if ((parent.tags ?? []).includes('#todo')) return ' #_chat/vault #_autodep\n\<<user>> '
    const budget = { left: LOOKUPS, seen: new Map(), exhausted: false } // both walks share it
    if (vault_chat(parent, budget)) {
      // under an autodep ancestor the app makes the parent the child's first dependency by
      // itself; a chat made before the tag keeps the explicit reference to its parent
      if (autodep_ancestor(parent, budget)) return '\n\<<user>> '
      return ` #_${(parent.label ?? '').replace(/^#/, '')}\n\<<user>> `
    }
    return null
  }
}
```

#_load #_listen #_welcome #_init #_util/core