#todoer helps manage todo items.  
- Try <<link_eval(_this, 'create_pinned_item()', 'creating a pinned item')>> with a drag-and-drop widget.
- Try using the `/todo [text]` command to quickly create new items.
- Delegate a todo to the vault agent by dragging it to the widget's agent bin (or `/delegate`; `/delegate text` creates `#todo text` and delegates it, a `#todo` first word kept as written); it moves to the delegated list below the main one, and comes back when the agent hands it back (design: the vault's `notes/design/mind_task_agents.md`).
- A pinned item created before the delegated list exists shows only the main widget: add `\<<todoer_widget({delegated: true})>>` below it (new pins carry both).
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
// TASK CHAT (the route tag on the label's line, the first user turn on the next); a child of a
// VAULT CHAT becomes its continuation (the parent's label as a hidden tag beside the label, the
// first user turn on the next line), a vault chat being
// a chat item whose direct-chat lineage (the app's own rule, as agent/chat.js walks it and the
// bridge's resolve_chain resolves it: the ONE chat dependency named by a hidden tag or by the
// item's label prefix) is VALID TO ITS ROOT (an ambiguous step or a cycle anywhere on it, a
// routed item included, gives nothing: the bridge could not resolve such a chat either) and
// carries an item the app's grammar view routes to the vault (window._grammar.routed); any
// other parent is left as the app makes it. The walk takes one parent per step, never revisits
// an item, and looks an item up at most once (a memo, a label aliased to its id), at most
// LOOKUPS uncached lookups in all: past that bound the walk stops at once with nothing and one
// console warning, whatever it had found. The app
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
  // the ONE direct chat dependency (agent/chat.js, the bridge's resolve_chain): a chat item
  // among the dependencies named by a hidden tag, or the label's parent by one segment; a
  // scan the lookup bound cuts short decides nothing (a provisional parent is discarded)
  const direct_parent = (item, root, budget) => {
    const label = label_of(item)
    const hidden = (item.tags_hidden ?? []).map(tag => tag.toLowerCase())
    let found = null
    for (const id of item.dependencies ?? []) {
      const dep = lookup(id, budget)
      if (budget.exhausted) return EXHAUSTED
      if (!dep || !is_chat_item(dep, root)) continue
      const dep_label = label_of(dep)
      const direct =
        hidden.includes('#' + dep_label) ||
        (label.startsWith(dep_label + '/') && !label.slice(dep_label.length + 1).includes('/'))
      if (!direct) continue
      if (found) return AMBIGUOUS
      found = dep
    }
    return found
  }
  const vault_chat = parent => {
    const budget = { left: LOOKUPS, seen: new Map(), exhausted: false }
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
  window._customize_child = (parent, text) => {
    if (!parent || typeof text != 'string') return null
    // the macro opener is escaped for the app (an item's text is a macro source, code blocks
    // included: an unescaped opener here evaluated `user` in the todoer's own context on every
    // render, 2026-09-26); JavaScript reads `\<` as `<`, so the appended text is the plain turn
    if ((parent.tags ?? []).includes('#todo')) return ' #_chat/vault\n\<<user>> '
    if (vault_chat(parent)) return ` #_${(parent.label ?? '').replace(/^#/, '')}\n\<<user>> `
    return null
  }
}
```

#_load #_listen #_welcome #_init #_util/core