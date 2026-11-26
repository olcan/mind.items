const _todoer = _item('$id')

// HOW THE LISTS BEHAVE, in the words the item's text had until 2026-11-25 (the owner: "its
// visible text should be simplified significantly"). The text now has the short version and
// the two tables the commands' and the macro's forms; this is the reference:
// - Delegate a todo to the vault agent by dragging it to the widget's agent bin (or `/delegate`;
//   `/delegate text` creates `#todo text` and delegates it, a `#todo` first word kept as written);
//   it moves to the delegated list below the main one, and comes back when the agent hands it back
//   (design: the vault's `notes/design/mind_task_agents.md`).
// - A pinned item created before the delegated list exists shows only the main widget: add
//   `todoer_widget({delegated: true})` below it (new pins carry both).
// - Snooze a todo by dropping it on the widget's snooze bin and picking a time; a snoozed list
//   (`todoer_widget({snoozed: true})`) shows them until their time, each row starting with a
//   coarse mark of the time left (rounded up, tooltip giving the end time), and a drop on its
//   snooze bin brings one back now. A snoozed todo comes back at its time: within about a second while the
//   account's most recently used tab (the one that brings todos back) is visible, within about a
//   minute while that tab is hidden (Chrome wakes a hidden tab about once a minute; Safari wakes it
//   less often the longer it stays hidden, not measured), and two minutes after the device wakes
//   from sleep or the tab from a freeze (the tab first lets its copies catch up); if that tab is on
//   a device that went to sleep, a tab you focus takes over at once (on a phone or a tablet, within
//   a minute of your first touch or key press there), an unattended one within about three minutes.
//   Check **notify on unsnooze** in the snooze dialog (it starts unchecked) for a desktop
//   notification when the snooze time comes (`[unsnoozed]` and the todo's text, kept on screen
//   until you click it, which opens the todo; one per device, from the window you used last). The
//   box is that todo's own opt-in, whatever `/notify` is set to; checking it asks this device's
//   permission if the browser never asked, and the hint beside it shows this device's permission
//   when it is not granted (every device whose permission is granted shows the notification). A
//   todo you bring back by hand, or one the agent hands back before its time (on a device that sees
//   the hand-back before then), shows no such notification.
// - `/notify on` asks for desktop notifications when a task comes back to the main list waiting on
//   you (`question`, `blocked`, `proposal`, `budget`, `done`), when a vault or task chat gets the
//   agent's reply (`reply`), and when an agent creates or edits an item with the item tool (`item`,
//   stamped into the todoer's own store; when a tab opens, it skips writes it already knows about,
//   and a tab that opens from its cache can still notify you about a recent write that arrives
//   afterward): one per device, from the window you used last, shown through the app's service
//   worker so it outlives a page reload (falling back to a page notification when no worker with
//   click relay is active), kept on screen until you click it (the click focuses the window that
//   takes it — waiting if a window is reloading — or opens the app and selects the item or chat);
//   an existing saved set from before `item` existed lacks it until you run `/notify on` (or
//   `/notify on item`) again; `/notify on taken` adds a reason (`interrupted`, `taken`, `checkin`
//   for a delegated todo whose agent has something for you to look at while it goes on working, or
//   `all`) and asks the permission too (the way to grant a second device without resetting a custom
//   set, since `/notify on` alone resets it to the seven), `/notify off done` removes one, `/notify
//   off` turns them off everywhere (a todo snoozed with **notify on unsnooze** keeps its own),
//   `/notify test` shows one, `/notify test [item]` shows a sample notification for that item five
//   seconds later (time to switch to another window), delivered and clicked as a real one is: its
//   click selects the item, it comes from this window whichever is elected and whatever `/notify`
//   is set to, and a real event's can differ in its bracket word and in whether it stays on screen,
//   `/notify` shows the setting and this device's permission. After an update of this item, reload
//   every open tab that takes part: a tab keeps the notifier and click listener it started with
//   until then.
// - A vault or task chat whose last turn is the agent's reply (since this list began in the
//   account) shows in the main list with a `reply` bell, its name and the reply's first line. Click
//   the row to open the chat, or click the bell (or drop the row on the done bin) to clear the row
//   without changing the chat's text; answering in the chat clears it too, and a later reply brings
//   it back. On such a row, the cancel bin deletes the chat after asking; the snooze and agent bins
//   are for todos and put the row back (add `#todo` after the chat's name to make it one). A chat
//   that became a todo shows the start of its first user turn after its name, and a second click on
//   its row opens the editor with that stretch selected.
// - A non-todo item an agent wrote with the item tool (past this kind's baseline in the account,
//   within the stamp map's latest hundred items) shows in the main list with an `item` bell, its
//   name and its first line until cleared (`b`, the bell, or the done bin), edited, or evicted by
//   newer stamped items; a chat that waits both ways keeps its `reply` row. On a waiting reply's
//   row, where it shows the reply's first line as written (cut at most at its end), wiki links
//   outside inline code open as links (clicking one opens the file without selecting the row)
//   while tags, markdown links, addresses, and markup stay plain text (wiki links skip inline code
//   on todo rows too, decided before clipping and left opaque to later passes); an `item` row's
//   line stays plain text.
// - A todo that came up for you carries a bell with its kind (its reason in the main list, or
//   `checkin` on a delegated todo whose agent checked in while going on working). The bell stays
//   even after a check-in's marker returns to working; click the bell to clear it while keeping the
//   row (delegating or snoozing clears it too), and it rings again if the todo comes up another
//   time; a ringing bell unsnoozes a snoozed todo (primary tab, no unsnooze reminder).
// - Selecting a listed item — or any todo whose list is not on the page — shows buttons for its
//   list's bins (and its bell, where it carries one; a reply's row shows only **up**, **down**, and
//   its **bell**, with none of the bins' buttons, telling a notification from a todo — dropping it
//   on the done or cancel bin still works as before; a row of an item an agent wrote also shows a
//   **history** button right after its bell where the pusher is on with a destination and the item
//   is saved, opening the pusher's commit-history address without clearing or selecting anything)
//   on the key buttons item's bar (or on a second row above the bar's left end in a narrow window
//   and on a phone; without that item, at the page's lower left). A press does what a drag to that
//   bin does, except that the delete button always asks first (refused while text typed in the
//   item's open editor is not saved); after any action that takes a row out of its list, by drag or
//   by button, the next row is selected (or the one before it after the last row; with no row on
//   the page, the todo stays selected and its buttons update for its list now).
// - **Up** and **down** buttons stand first among a selected item's buttons, and plain **`k`** and
//   **`j`** do the same when no field has the focus: they cycle in page order through every row
//   carrying a bell (in any mounted list) together with every row of the main list, passing over
//   unbelled rows of other lists (from a selected unbelled row in another list, **`j`** goes to the
//   nearest row of the sequence after it and **`k`** to the nearest before, wrapping at the ends;
//   with no row on the page, **`j`** / **down** selects the sequence's first row and **`k`** /
//   **up** its last; the two buttons are dimmed only where their press would select nothing). With
//   a listed row or any todo selected and no field focused, plain keys press the buttons it has
//   (shown in their tooltips, once per press while held): **`a`** delegates to the agent, **`d`**
//   marks a todo done, **`s`** snoozes (or unsnoozes when snoozed), **`x`** deletes after asking,
//   **`b`** clears its bell, **`h`** opens the item's history on a row of an item an agent wrote
//   (where the pusher has a destination), and **`u`** takes it back from the agent. Because a
//   waiting row has no bin buttons, none of the bin keys (`a`, `d`, `s`, `x`, `u`) act on it and
//   **`b`** clears it; any key it does not take goes on to any prior key hook.
// - With a second window of the app open, **`w`** (or the two-panes button) links them: a window
//   without a target stays the list, keeping its query and scroll while marking the row of the item
//   the other window shows and acting on it through its buttons and keys; a window with a target
//   keeps its own target (if the other window has none, a row selection here opens here and moves
//   the other's mark); if both windows have targets, selecting a row gives this window's target up
//   (to the default list query, or the empty query when that tag names a single item; for a
//   nonempty release query Back returns to a finalized target while a typed, unfinalized target is
//   replaced with no step, and for the empty release query clearing a shown target makes and
//   finalizes a new step even from a typed, unfinalized target) and shows the item in the other;
//   if neither has a target, the window selected in stays the list. **`w`** in either window ends
//   the link.

function _extract_template_options(options = {}) {
  const props = ['height', 'style', 'styles', 'classes']
  let {
    height = 'auto',
    style = '',
    styles = '',
    classes = '',
  } = pick(options, props)
  options = omit(options, props) // remove props from options
  if (is_number(height)) height += 'px'
  style = `height:${height};${style}`
  style = `style="${style}"`
  styles = flat(styles).join('\n')
  return { style, styles, classes, ...options }
}

// drag-and-drop widget macro
// | `todoer_widget()` | the main list
// | `todoer_widget({delegated: true})` | the todos the vault agent holds
// | `todoer_widget({snoozed: true})` | the snoozed todos, until their time
// | `height`, `style`, `styles`, `classes` | the widget's size and look
// | `tags`, `storage_key` | only the todos that carry these tags too; the name a list's order is saved under
function todoer_widget(options = {}) {
  // note this macro structure follows that of _plot in #util/plot
  const { style, styles, classes, ...widget_options } =
    _extract_template_options(options)
  // pass along options via item store keyed by macro cid
  // macro cid is also passed to html via template string __cid__
  // macro cid is preferred to html script cid for consistency
  _this.store['todoer-widget-$cid'] = { options: widget_options }
  return block(
    '_html',
    _todoer
      .read('html_widget')
      .replace(/__classes__/g, classes)
      .replace(/__style__/g, style)
      .replace(/\/\* *__styles__ *\*\//g, styles)
      .replace(/#widget\b/g, `#todoer-widget-__cid__`)
      .replace(/__cid__/g, '$cid')
  )
}

// one character of a url in html-escaped text (escapedUrlChar in util.js in mind.page repo):
// an `&` is a url character only in `&amp;` (a real `&` in a query string), while every other
// entity (`&quot;`, `&#34;`, `&lt;`, `&gt;`, `&#39;`) ends the url instead of riding into it
const _url_char = c => `(?:&amp;|(?!&)${c})`

// helper function to linkify urls (regex from util.js in mind.page repo)
// we use _replace_tags to exclude code blocks, html tags, etc
// we apply after link_markdown_links so they are excluded (as html tags)
// the row text is html-escaped, so this is the escaped-html rule (see _url_char above): the
// closing quote of a quoted title arrives as `&quot;` and used to ride into the link whole
function _link_urls(text) {
  return _replace_tags(
    text,
    new RegExp(
      `(^|\\s|\\()([a-z](?:[-a-z0-9\\+\\.])*://${_url_char('[^\\s)<"/]')}+/?` +
        `${_url_char('[^\\s)<:"]')}*${_url_char('[^\\s)<:,."]')})`,
      'g'
    ),
    (m, pfx, url) => `${pfx}<a>${url}</a>`
  )
}

// the tag marks of a row's escaped snippet (the tag regex of util.js in the mind.page repo)
function _mark_tags(text) {
  return text.replace(/(^|\s|\()(#[^#\s<>&\?!,.;:"'`(){}\[\]]+)/g, '$1<mark>$2</mark>')
}

// the markdown links of a row's escaped snippet as anchors. A label ends at its OWN closing
// bracket, so a completed `[marker]` or `[note]` earlier in the row is no part of a later link's
// label. Inside a label, a complete code span and a backslash escape are text whatever they hold
// (a bracket in code, an escaped bracket), and a bracket of the label's own must be one of a
// matched pair, one level deep. A backtick or a backslash is never ordinary text, so a code span
// or an escape cannot be taken apart on a second try (no false link out of a span's inside, and
// one way only to read a label); a backtick with no partner after it is text by its own branch
function _link_markdown_links(text) {
  const piece = /`[^`]*`|`(?![^`]*`)|\\.|[^\[\]`\\]/.source
  const label = new RegExp(`\\[\\s*((?:${piece}|\\[(?:${piece})*\\])*?)\\s*\\]\\(\\s*(.*?)\\s*\\)`, 'g')
  return text.replace(label, (m, text, href) => `<a href="${_.escape(href)}">${text}</a>`)
}

// tests whether an offset in an escaped line lies inside inline code: backticks pair from the
// left, an odd count in `head` opens code from the start, and an unpaired last backtick closes
// at the end only when `tail` holds a backtick or `more` is set (else it opens nothing)
function _inline_code_test(text, cut) {
  const { head = '', tail = '', more = false } = cut ?? {}
  const open = (head.match(/`/g)?.length ?? 0) % 2 == 1
  if (!open && !text.includes('`')) return () => false
  const ticks = open ? [-1] : []
  for (let i = 0; i < text.length; i++) if (text[i] == '`') ticks.push(i)
  if ((more || tail.includes('`')) && ticks.length % 2 == 1) ticks.push(text.length)
  const spans = []
  for (let i = 0; i + 1 < ticks.length; i += 2) spans.push([ticks[i], ticks[i + 1]])
  return offset => spans.some(([start, end]) => offset > start && offset < end)
}

// the wiki links of an escaped row stretch (the app's grammar and builder; the vault's design
// notes/design/wiki_links.md 2.3): a `[[path]]` or `[[path|text]]` reference outside inline code
// becomes the app's anchor under the refs carrier; one that begins inside inline code leaves as
// decimal character references (non-alphanumeric, non-space) so later passes cannot read it, and
// a refused reference stays as written. Shared by todo rows and waiting reply rows
function _link_wiki(text, in_code) {
  const regexp = window._wiki_link_regexp?.()
  const build = window._wiki_link_html
  if (!regexp || !build || !text.includes('[[')) return text
  const test = in_code ?? _inline_code_test(text)
  const refs = s => [...s].map(c => (/[A-Za-z0-9 ]/.test(c) ? c : `&#${c.codePointAt(0)};`)).join('')
  return text.replace(regexp, (m, embed, target, alias, offset) =>
    test(offset)
      ? refs(_.unescape(m))
      : (build(_.unescape(target), alias == null ? null : _.unescape(alias), { refs: true }) ?? m)
  )
}

// wiki links for a waiting reply row's line: links references outside inline code only where the
// row shows the reply's first line as written (`raw`, trimmed, cut at most at its end); inline
// code is paired on that whole trimmed line so clipping past 120 chars cannot expose a code span
function _link_waiting_wiki(line, raw) {
  const escaped = _.escape(line ?? '')
  if (raw == null || !escaped.includes('[[')) return escaped
  const written = String(raw).trim()
  if (!written.startsWith(String(line).replace(/…$/, ''))) return escaped
  return _link_wiki(escaped, _inline_code_test(_.escape(written)))
}

// the row's html: an escaped stretch through the wiki-link, tag, markdown-link and url passes
function _row_html(shown, cut) {
  const escaped = _.escape(shown)
  // (the code spans are worked out only for a row that holds a wiki opener)
  const in_code = escaped.includes('[[') ? _inline_code_test(escaped, cut) : null
  return _link_urls(_link_markdown_links(_mark_tags(_link_wiki(escaped, in_code))))
}

// the anchors of a rendered row (`div`): a wiki link's anchor (data only, the app's builder) gets
// the click stop alone and NO target, so the editor url opens in place, as the marker's review
// anchor does (the vault's design notes/design/wiki_links.md 2.4; a target would leave an empty
// tab behind); an anchor that carries its own inline onclick is authored, and is left exactly as
// written — the app's own passes over item content read the attribute the same way
// (Item.svelte). The task marker's review anchor is #vault's (its href, tooltip and click stop,
// no target), so a click on it takes #vault's path: the browser's in-place navigation hands the
// vscode: url straight to the editor. The rewriting is for the row's PLAIN web links, which do
// want a new tab (and the shortened text)
function _wire_row_links(div) {
  div.querySelectorAll('a').forEach(elem => {
    if (elem.hasAttribute('data-wiki-link')) {
      elem.onclick = e => e.stopPropagation()
      return
    }
    if (elem.getAttribute('onclick')) return
    const url = elem.href || elem.innerText
    elem.title ||= url // default title is url
    // simplify naked url links by trimming out protocol & path/query/fragment
    if (elem.innerText == url)
      elem.innerText = url
        .replace(/(:\/\/.+?)\/(.+)/, '$1/…')
        .replace(/^.*:\/\//, '')
    // note setting href/target on <a> ausually works better than window.open
    // e.g. avoids an extra tab if launching other apps (e.g. mail) in safari
    elem.href = url
    elem.target = '_blank'
    elem.onclick = e => e.stopPropagation()
  })
}

// internal helper for _render_todoer_widget, assumes Sortable loaded
function __render(widget, widget_item) {
  if (!widget) fatal(`invalid/missing widget`)
  // if ANY widget on the page is dragging, set the flag and return to avoid breaking the drag
  // (2026-09-25; before, only the dragging widget's own render waited): Sortable 1.15 keeps the
  // drag's state (the dragged row, its ghost and clone, the root list) in variables shared by
  // every instance, and destroying an instance, this render's first step for the old list and
  // bins, ends the drag WITHOUT its events and nulls that state: the release then finds no
  // drag to end, the ghost row stays, unchoose never fires and the dragging widget keeps its
  // class for good. the deferred renders run at the drag's end (onUnchoose), each with the
  // item it was asked for
  // a press pending on a widget's row defers the render the same way (2026-10-28): Sortable
  // 1.15's static `dragged` names the row of a press from the pointer's down to its release (a
  // touch awaiting its delay, a chosen row awaiting the move that starts the drag), and
  // destroying an instance releases that press without events (destroy calls _onDrop with no
  // event), so the drag it was about to start finds nothing: the tasks lane's snooze drag lost
  // its grabbed row this way to the pinned item's re-render landing between the grab and the
  // drag's first move. a press ends in a release that dispatches unchoose whether a drag
  // started or not (a tap, and a touch scroll that began on a row, included), which runs the
  // renders deferred; the sideways grab releases a press without events itself and presses
  // again, so it runs them when the second press fails (_grab_on_sideways_touch)
  if (
    widget.classList.contains('dragging') ||
    document.querySelector('.todoer-widget.dragging') ||
    Sortable.dragged?.closest('.todoer-widget')
  ) {
    debug('delaying render due to dragging or pending press')
    widget._renderPendingDragging = widget_item
    return
  }
  widget.querySelectorAll(':is(.list,.bin)')?.forEach(col => {
    col.sortable.destroy() // important, prevents flickering, see note below
    col.remove()
  })

  const list = document.createElement('div')
  list.className = 'list'
  widget.appendChild(list)

  // parse widget options for required tags & storage key
  const options = widget_item.store[widget.id]?.options ?? {}
  let { tags = [], snoozed, delegated, storage_key } = options
  widget._snoozed = !!snoozed // read by a bin button's press (its snooze button brings a snoozed todo back)
  widget._delegated = !!delegated // with _snoozed: neither says the main list (the rows' keys start there)
  if (typeof _watch_list_visibility == 'function') _watch_list_visibility(widget)

  // the bins: the AGENT bin (a delegation) comes FIRST on every widget, followed by
  // done/snooze/cancel on the main and snoozed lists; the delegated list (design 2.2) has the
  // agent bin (a re-delegation) and the OWNER bin (a take-back) only (_LIST_BINS, shared with
  // _todo_buttons so a widget and a no-row todo cannot drift apart).
  // NOTE: the widget is a flex row (the list, then the bins) while a row is dragged, so the append
  // order below is the row order; the bins' rounded outer edges and drag margins in todoer-widget.html follow it
  const bins = {}
  for (const name of _LIST_BINS[delegated ? 'delegated' : snoozed ? 'snoozed' : 'main']) {
    const elem = document.createElement('div')
    elem.className = `${name} bin`
    widget.appendChild(elem)
    bins[name] = elem
  }
  const { agent: agent_bin = null, done: done_bin = null, snooze: snooze_bin = null, cancel: cancel_bin = null, owner: owner_bin = null } = bins
  if (is_string(tags)) tags = tags.split(/[,;\s]+/).filter(t => t)
  tags = tags.map(tag => {
    if (tag.match(/^[^#!-]/)) return '#' + tag // tag w/o # or negation
    if (tag.match(/^[!-][^#]/)) return tag[0] + '#' + tag // negation w/o #
    return tag // valid tag or negation: #tag | -#tag | !#tag
  })
  tags = uniq(['#todo', ...tags]) // prepend #todo & remove duplicates
  if (!tags.every(tag => tag.match(/^[!-]?#[^#\s<>&\?!,.;:"'`(){}\[\]]+$/)))
    fatal(`invalid tags ${tags}`)
  // use comma-separated tags as default storage key; the delegated list keeps its own order
  // under its own key (design 6: separate orders)
  // note snoozed flag can be excluded since snooze lists are not saved
  storage_key ??= delegated ? 'delegated' : tags.join(',')
  if (storage_key == 'version') fatal(`storage_key 'version' is reserved (the todoer's build stamp)`)

  // console.debug(`rendering list ${storage_key} in ${widget.id} ...`)

  // initialize this widget's set of todo items in session-lived store (membership is tracked
  // PER WIDGET: the main and delegated widgets of one pinned item hold different items)
  widget_item.store._todoer ??= { items: {} }
  widget_item.store._todoer.items ??= {}
  const members = (widget_item.store._todoer.items[widget.id] = new Set())

  // the selected item of this window (its own target where it has one, else the item the linked
  // other window shows): its row is marked selected
  const selected = _selected_item(undefined, { mounted: false })?.id
  // insert all todo items into list
  let have_unsnoozed = false
  let review_anchor // the #vault item's review-anchor builder, resolved at the first task row that needs it
  for (const item of _items()) {
    // a todo by its VISIBLE tags: the status tag is the item's own #todo, never a hidden
    // dependency on it (#_todo, which item.tags lists as #todo too). a completed todo that
    // keeps one must not come back as a row (review 2 of 2026-11-17: it did at the next
    // render, its snippet taken from a lower-case #todo that the completion rightly left, a
    // selector in a stylesheet written in capitals). the widget's other tags are matched
    // over all of the item's tags, hidden ones included, as before
    if (!item.tags_visible.includes('#todo')) {
      // an item that waits on the owner without being a todo (_waits) has a row of its own in the
      // main list of a widget with no tags of its own: a bell mark that names what it waits for,
      // the item's name, the reply's first line. A drop on the done bin clears it (onEnd); the
      // item's text is never written for it. Its place in the list is saved as a todo's is
      const waits = !snoozed && !delegated && tags.length == 1 ? _waits(item) : null
      if (!waits) continue
      members.add(item.id)
      const container = document.createElement('div')
      container.className = 'list-item-container'
      container.setAttribute('data-id', item.id) // used for saving below
      container.setAttribute('data-waits', waits)
      if (item.id == selected) container.classList.add('selected')
      const div = document.createElement('div')
      div.className = 'list-item'
      const [name, line, raw] = _waiting_parts(item, waits)
      // what this row shows (the reply or the write stamp), kept on the row: a clear made from it
      // (the bell, a bin) is of THIS one, also when a newer one has arrived while held or dragged
      const key = _wait_key_of(item, waits)
      container.setAttribute('data-wait-key', key)
      container.title = `${waits}: waits on you; click the bell or drop it on done to clear it\n${[name, line].join(' ').trim()}`
      // the name as a tag, then the escaped line (with wiki links alone on a reply row showing the
      // reply's first line as written, cut at most at its end; an item row stays text)
      div.innerHTML =
        `<mark class="waits">${waits}</mark> ` +
        (name ? _mark_tags(_.escape(name)) + ' ' : '') +
        _link_waiting_wiki(line, raw)
      // the bell's own click clears the row (as its drop on the done bin does), not the row's
      const bell = div.querySelector?.('mark.waits')
      if (bell)
        bell.onclick = e => {
          e.stopPropagation()
          e.preventDefault()
          if (_clear_waiting(item, key)) _rerender_todoer_widgets()
        }
      _wire_row_links(div)
      div.onclick = e => {
        e.stopPropagation() // do not propagate click to item
        e.preventDefault()
        // ignore clicks too close to an item being let go (as a todo's row does)
        if (Date.now() - last_unchoose_time < 250 && Date.now() - last_choose_time > 500) return
        _select_item(item, null)
      }
      container.appendChild(div)
      list.appendChild(container)
      continue
    }
    if (
      !tags.every(tag => {
        if (tag[0] == '#') return item.tags.includes(tag)
        else return !item.tags.includes(tag.substr(1)) // negation via ^[!-]
      })
    )
      continue // filtered out based on tags
    if (item.tags.includes('#menu')) continue // skip menu items
    // the list a task belongs to (design 2.2): the bridge's projection, overlaid by this tab's
    // pending command until the bridge acknowledges it; an agent-held (or pending-delegate)
    // task sits in the delegated list only, whatever its snooze state
    const state = _task_state(item)
    let pending = _pending_commands()[item.id]
    if (pending && state?.acked?.[pending.id]) {
      delete _pending_commands()[item.id] // acknowledged: the projection decides from here
      pending = null
    }
    // a bound child's list reads its parent's projection too (the standing /land, design 2.9)
    const parent_item = state?.parent ? _item(state.parent, { silent: true }) : null
    const parent_state = parent_item ? _task_state(parent_item) : null
    const task_list = _task_list(state, pending, parent_state)
    if (delegated) {
      if (task_list != 'delegated') continue
    } else {
      if (task_list == 'delegated') continue
      // skip based on snoozed state (via metadata in item's own global store)
      if (!!snoozed != !!item._global_store._todoer?.snoozed) continue
    }
    // record if we have unsnoozed items to trigger a sort & save below
    if (item._global_store._todoer?.unsnoozed) have_unsnoozed = true

    // read text and determine todo tag positions
    const cut = {} // what the snippet's truncation left out, read by the tooltip (_row_title)
    let text = _extract_todo_snippet(item, cut)
    if (!text) continue // no #todo tag found (should have logged error)
    // a chat that became a todo: its row would show its name alone, so the start of its first
    // user turn follows the name (see _row_question)
    const question = _row_question(item, text)
    // a project's bound child (its projection carries `parent`): the row is marked ↳ and its
    // tooltip names the parent (vault project design 2.7); presentation only
    const parent = state?.parent ? _parent_of(state.parent) : null

    members.add(item.id)
    const div = document.createElement('div')
    div.className = 'list-item'
    const container = document.createElement('div')
    container.className = 'list-item-container'
    if (pending) container.setAttribute('data-pending', pending.kind) // the overlay, until acked
    if (item.id == selected) container.classList.add('selected')
    list.appendChild(container)
    container.appendChild(div)
    container.setAttribute('data-id', item.id) // used for saving below
    if (!item.saved_id) {
      div.style.opacity = 0.5 // indicate unsaved state
      dispatch_task(
        `detect_save.${item.id}`,
        () => {
          if (!_exists(item.id)) return null // item deleted
          if (!item.saved_id) return // still unsaved, try again later
          div.style.opacity = 1 // indicate saved state
          return null // finish repeating task
        },
        250,
        250
      ) // try every 250ms until saved
    }

    // the row shows the snippet's visible text (_visible) on one line, its tooltip the same in
    // its lines (_row_title), under the tooltip's own first lines: a snoozed todo's time, a
    // child's parent. the done bin logs the row's text under those lines, as it always has
    const snoozed_until = snoozed ? item._global_store?._todoer?.snoozed : undefined
    const snoozed_at = snoozed ? new Date(snoozed_until).toLocaleString() : ''
    const first_lines =
      (snoozed ? snoozed_at + '\n' : '') +
      (parent ? `child of ${parent}\n` : '')
    const snippet_shown = _visible(text).replace(/\s+/g, ' ')
    const asked = question ? _visible(question.raw) + (question.more ? ' …' : '') : ''
    const asked_shown = asked.replace(/\s+/g, ' ').trimStart()
    container.title = first_lines + _row_title(text, cut) + (asked ? '\n' + asked : '')
    const shown = asked_shown ? snippet_shown.trimEnd() + ' ' + asked_shown : snippet_shown
    container._log_text = (first_lines + shown).replace(/\s+/g, ' ')
    // a projection change this tab has not notified yet (the hook notifies first; a render
    // catches a delivery the hook did not see, see _notify_change)
    _notify_change(item, { state, list: task_list, parent })

    // the row's html: the escaped snippet (and a chat-todo's question, paired separately against
    // its own clip) through the wiki-link, tag, markdown-link and url passes (_row_html), then a
    // task's marker linked to its worktree's review (design 2.4: presentation only, the text keeps
    // its one bracketed word; the vault item's builder, resolved once per render) and a NAMED
    // item's label first (_row_label)
    let html = asked_shown
      ? _row_html(snippet_shown.trimEnd(), cut) + ' ' + _row_html(asked_shown, { more: question.more })
      : _row_html(snippet_shown, cut)
    if (state?.worktree && review_anchor === undefined) review_anchor = _review_anchor_builder()
    html = _decorate_row(html, text, state, review_anchor, parent, _row_label(item, shown))

    // determine suffix vs prefix snippet based on #todo suffix match
    // (a row that ends in its question reads from the left, as a suffix snippet does)
    if (question || !text.match(/(?:^|\s|\()#todo$/)) {
      if (!question && !text.startsWith('#todo')) fatal('missing #todo prefix') // sanity check
      div.innerHTML = html
    } else {
      // use direction=rtl on an inner span to truncate (and add ellipsis) on the left while
      // keeping marks prepended to .list-item (age, time-left, bell) visible at the left edge
      div.classList.add('rtl')
      const span = document.createElement('span')
      span.className = 'rtl-text'
      span.style.direction = 'rtl'
      span.style.textAlign = 'left'
      // set title on container to avoid &lrm in title text

      // clip on Safari since text-overflow:ellipsis truncates wrong end for rtl
      // it only ~works if original whitespace is maintained (by dropping lines)
      // see webkit bug at https://bugs.webkit.org/show_bug.cgi?id=164999
      if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent))
        span.style.textOverflow = 'clip'

      // use &lrm; to avoid non-alphanumeric prefixes being treated as ltr
      // see https://stackoverflow.com/a/27961022
      span.innerHTML = '&lrm;' + html
      div.appendChild(span)
    }

    // the bell of a todo that came up since the owner last cleared it (_bell): its kind, and a
    // click of its own that clears it (the row stays)
    const rings = _bell(item, state, delegated ? 'delegated' : 'main')
    if (rings) {
      const bell = document.createElement('mark')
      bell.className = 'waits'
      bell.innerText = rings
      bell.title = `${rings}: came up for you; click the bell to clear it`
      const came_up = state.surfaced // the count this bell shows: its click clears that one
      bell._came_up = came_up
      bell.onclick = e => {
        e.stopPropagation()
        e.preventDefault()
        if (_clear_bell(item, came_up)) _rerender_todoer_widgets()
      }
      div.prepend(bell, ' ')
    }

    if (delegated) {
      const updated = state?.updated
      const age = document.createElement('mark')
      age.className = 'age'
      // the age since the last state change, then the stats the bridge projects (vault design
      // mind_task_agents 9.6): workers started and the summed nominal cost, when present
      const label = _age(updated, Date.now()) + _stats_suffix(state?.stats) + _wake_suffix(state?.wake, Date.now())
      age.innerText = label
      // on a row that is cut on the left a narrow window cuts this mark at its end: its tooltip
      // then begins with the whole label, so what the ellipsis hides can still be read
      age.title = (div.classList.contains('rtl') ? label + '\n' : '') + _age_title(updated, state?.stats, state?.wake)
      div.prepend(age, ' ')
    } else if (snoozed) {
      const left = _snooze_left(snoozed_until, Date.now())
      if (left) {
        const age = document.createElement('mark')
        age.className = 'age'
        age.innerText = left
        age.title = snoozed_at
        div.prepend(age, ' ')
      }
    }

    // handle clicks and modify styling for non-todo tags (the age mark is not a tag; a named
    // item's label mark is one, and its click targets the label as the row's own click does)
    div.querySelectorAll('mark:not(.age):not(.waits)').forEach(elem => {
      let tag = elem.innerText.replace(/#_/, '#')
      if (item.label) tag = _resolve_tag(item.label, tag) ?? tag
      elem.title = tag
      // if (elem.innerText.toLowerCase() == '#todo') return
      elem.onclick = e => {
        e.stopPropagation()
        e.preventDefault()
        MindBox.set(tag, { scroll: true })
      }
    })

    // handle clicks on urls
    _wire_row_links(div)

    // handle click on list item
    div.onclick = e => {
      // debug('onclick')
      e.stopPropagation() // do not propagate click to item
      e.preventDefault()

      // ignore clicks too close to an item being let go
      // except when the item was also just grabbed, in which case the click should be handled
      if (
        Date.now() - last_unchoose_time < 250 &&
        Date.now() - last_choose_time > 500
      )
        return

      // if clicked item is already target, then edit, otherwise we just target & scroll
      // if we skip edit, then we still select text in case item is clicked directly to edit
      const target = document.querySelector('.container.target')
      const edit = target?.getAttribute('data-item-id') == item.id
      // the selection is the todo LINE (raw bytes in the item), not the row's snippet: the
      // snippet is a display slice, up to 200 characters across lines with the bridge's _log
      // block dropped, which a task's tree and log make non-contiguous in the item's text (the
      // app then logged "could not find text" on a [done] task's row and selected nothing)
      // (a chat that became a todo: the stretch of its question that the row shows)
      // by its PLACE in the item's text: the words of a question can stand in the item's name
      // too, and a selection by text takes the first occurrence. Where the place is not found,
      // nothing is selected (the item is still selected, or opened, by the same checked path)
      const selection = question ? _question_range(item, question.raw) : _todo_line(text)
      // the item is targeted by its NAME (the app's: the unique label when it has one, else the
      // id reference): under its label the app lists the item's children below it and its
      // keyboard navigation and child creation work, which an id reference never gives.
      // the target's row EDITS it where it is (_edit_item); any other row SELECTS its item
      // (_select_item)
      // (linked with another window or not: the row of the item THIS window shows edits it here.
      // the owner, 2026-11-26, of a link under which that click only selected: "is that
      // intentional"; one rule for a window in either role, since the list's window shows no item)
      if (edit) _edit_item(item, selection, !!question)
      else _select_item(item, selection, !!question)
    }
  }

  const item_for_elem = e => _item(e.getAttribute('data-id'))
  if (snoozed) {
    // reorder snooze list items based on snooze times
    sort_by(
      Array.from(list.children),
      e => item_for_elem(e)._global_store._todoer.snoozed
    ).forEach(e => list.appendChild(e))
  } else if (have_unsnoozed) {
    // reoder unsnoozed items to top based on negative unsnooze time
    sort_by(
      Array.from(list.children),
      e => -(item_for_elem(e)._global_store._todoer?.unsnoozed ?? 0)
    ).forEach(e => list.appendChild(e))
    // trigger a save to remove unsnooze times and switch to custom ordering
    // setTimeout(() => list.sortable.save())
  }

  // trigger save in each render in case new items/ordering have changed
  // also removes unsnooze times & switches snoozed items to custom ordering
  setTimeout(() => list.sortable.save())

  _suppress_touch_context_menu(list) // a touch long press must not open the context menu
  _grab_on_sideways_touch(list) // a quick sideways touch grabs its row without the delay

  // track unchoose (i.e. "ungrab") time to ignore click events too close to it
  // NOTE: this requires positive "delay" option (including non-touch devices)
  let last_choose_time = 0
  let last_unchoose_time = 0
  let chosen = false // also track chosen state to ignore unchoose-only events

  // initialize sortable objects attached to list elements
  // we destroy objects as elements are removed on re-render (see above)
  // otherwise dragging items on a re-rendered list can cause flickering
  list.sortable = Sortable.create(list, {
    group: widget.id,
    sort: !snoozed, // no reordering for snoozed list
    animation: 150,
    delay: 250,
    delayOnTouchOnly: true,
    // delay: navigator.maxTouchPoints > 0 ? 250 : 150, // faster on non-touch
    fallbackTolerance: 5, // fixes undesired drag during click on short-delay settings, see doc
    // touchStartThreshold: 5, // for touch devices only, see docs
    store: snoozed
      ? null /* disabled for snooze list */
      : {
          get: () => {
            const ids =
              widget_item._global_store._todoer?.[storage_key]?.split(',') ?? []
            if (snoozed)
              sort_by(
                ids,
                id =>
                  _item(id, { silent: true })?._global_store._todoer?.snoozed
              )
            else
              sort_by(
                ids,
                id =>
                  -(
                    _item(id, { silent: true })?._global_store._todoer
                      ?.unsnoozed ?? 0
                  )
              )
            // convert back to temp ids (if any) as used in list elem attribs
            apply(ids, id => _item(id, { silent: true })?.id ?? id)
            return ids
          },
          set: sortable => {
            // dispatch task to ensure that all items have been saved
            dispatch_task(
              `save.${widget.id}.${storage_key}`,
              () => {
                if (list.parentElement != widget) return null // cancel (removed)
                // console.debug(`saving list ${storage_key} in ${widget.id}`)

                // determine saved (permanent) ids for global store
                const saved_ids = sortable
                  .toArray()
                  .map(id => _item(id).saved_id)
                const gs = widget_item._global_store // saved manually below
                gs._todoer ??= {}
                // one decision per turn (see _order_save_step): the writes below wait for the
                // server-confirmed, currently served corpus, past a resume hold, with every
                // listed item saved
                const step = _order_save_step({ confirmed: _corpus_current(window), held: _held(), saved_ids, todoer_store: gs._todoer })
                if (step == 'wait') return // try again later
                if (step == 'blocked') {
                  // a newer build wrote the store: this one stops writing orders (once told;
                  // logged every time, so a trace shows the refusal); null ends the save task
                  // (a later render schedules the next attempt)
                  debug(`order save of ${storage_key} refused: a newer build wrote the store`)
                  if (!_todoer.store.reload_notice) {
                    _todoer.store.reload_notice = true
                    alert('please reload to keep your todo order (todoer update required)')
                  }
                  return null
                }

                // store the merged order under storage_key (ids this tab does not show are
                // kept in place: see _merged_order), never pruned by what this tab has loaded
                const prev_state = clone_deep(gs._todoer) // to detect changes
                gs._todoer[storage_key] = _merged_order(saved_ids, gs._todoer[storage_key])
                gs._todoer = pick_by(gs._todoer, v => typeof v != 'string' || v.length > 0)
                gs._todoer.version = TODOER_VERSION

                // clear unsnoozed flags/times to prevent custom order override
                each(saved_ids, id => {
                  if (
                    _item(id, { silent: true })?._global_store._todoer
                      ?.unsnoozed
                  )
                    delete _item(id).global_store._todoer.unsnoozed
                })

                // save changes (if any) to global store
                // note invalidation is unnecessary since element controls storage
                if (!equal(prev_state, gs._todoer)) {
                  console.debug(`saving list ${storage_key} in ${widget.id}`)
                  widget_item.save_global_store({
                    invalidate_elem_cache: false,
                  })
                }
                delete widget._orderAfterDrag // the drag's order is persisted (or was already)
                return null // finish repeating task
              },
              0,
              1000
            ) // try now and every 1s until saved
          },
        },
    forceFallback: true, // fixes dragging behavior, see https://github.com/SortableJS/Sortable/issues/246#issuecomment-526443179
    onChoose: e => {
      // debug('onChoose', e.originalEvent.clientX, e.originalEvent.clientY)
      chosen = true
      last_choose_time = Date.now()
      // widget.classList.add('dragging')
    },
    onStart: e => {
      // debug('onStart', e.originalEvent.clientX, e.originalEvent.clientY)
      widget.classList.add('dragging')
    },
    onUnchoose: e => {
      // debug('onUnchoose')
      // note on a regular click, onUnchoose is called w/o onChoose (may be bug)
      if (chosen) last_unchoose_time = Date.now()
      chosen = false
      const dragged = widget.classList.contains('dragging') // a drag started (onStart), not a mere press or click
      widget.classList.remove('dragging')
      // the drag's result, for every render of this widget until a save persists it (see
      // __render and the save task's end), for a drop back INTO the list only: a rebuilt list
      // would otherwise hand the save the STORED order (the renders pending from the drag run
      // after Sortable's end and the old instance's save(), timers; the old save task cancels
      // itself on its detached list), and a save that waits (an unconfirmed or held corpus)
      // would lose the drag to any render meanwhile. a bin took the row otherwise, and a
      // refused or cancelled bin drop restores it, which a hint without it would move to the head.
      // a started drag only: Sortable fires unchoose for a plain click too (a press without a
      // move), which saves nothing, so a hint recorded then would outlive it and a later remote
      // reorder's render would apply it and persist it (review 0)
      if (dragged && e.to == list) widget._orderAfterDrag = list.sortable.toArray()
      // trigger the pending renders, this widget's and every other widget's deferred by this
      // drag or press (see __render), each with the item it was asked for
      _run_deferred_renders()
    },
    onEnd: e => {
      // debug('onEnd')
      // widget.classList.remove('dragging')
      const id = e.item.getAttribute('data-id')
      const item = _item(id)
      // (the dragged row has left the list by now: the row at its old place is the one that followed it)
      const next = e.to == list ? null : _next_listed(list, e.oldIndex)
      if (e.item.getAttribute('data-waits')) {
        // a row that is not a todo. The done bin clears it, with nothing written into the item.
        // The cancel bin deletes the item, always after the app's question. The snooze and the
        // agent bin are a todo's: the row goes back where it was, with the word a todo's bins
        // have for an item that is none (_task_target). A refusal puts the row back too
        if (e.to == list) return
        e.to.firstChild.remove()
        if (!item) return // gone while its row was held: the list is drawn again without it
        const back = () => void list.insertBefore(e.item, list.children[e.oldIndex])
        const key = e.item.getAttribute('data-wait-key') // the reply the row showed
        if (e.to == done_bin) _clear_waiting(item, key) ? _select_next(next, true) : back()
        else if (e.to == cancel_bin) _delete_listed(item, true) ? _select_next(next, true) : back()
        else {
          if (e.to == agent_bin || e.to == snooze_bin) _task_target(item, e.to == agent_bin ? 'delegate' : 'snooze')
          back()
        }
        return
      }
      if (e.to == agent_bin) {
        // a delegation (or a re-delegation from the delegated list): the command document is
        // the acceptance; the row moves through the overlay once it is enqueued
        agent_bin.firstChild.remove()
        _select_next(
          delegated ? null : next, // (asked again from the delegated list, the row stays in it: nothing to select after it)
          _delegate(item).then(ok => {
            if (!ok) list.insertBefore(e.item, list.children[e.oldIndex])
            return ok
          })
        )
      } else if (e.to == owner_bin) {
        owner_bin.firstChild.remove()
        _select_next(
          next,
          _takeback(item).then(ok => {
            if (!ok) list.insertBefore(e.item, list.children[e.oldIndex])
            return ok
          })
        )
      } else if (e.to == cancel_bin) {
        cancel_bin.firstChild.remove()
        // (a deletion refused or declined leaves the item: its row goes back, as a reply's row does)
        if (!_delete_listed(item)) list.insertBefore(e.item, list.children[e.oldIndex])
        else _select_next(next, true)
        // alternative (not enabled): delete only a todo whose snippet is whole, else keep it:
        // item.write(item.text.replace(/#todo\b/g, '#cancelled'), '')
        // // log if logger exists
        // if (_exists('#logger'))
        //   MindBox.create('/log cancelled ' + e.item._log_text)
      } else if (e.to == done_bin) {
        _select_next(
          next,
          _complete_todo(item, e.item._log_text, {
            back: () => void list.insertBefore(e.item, list.children[e.oldIndex]),
            gone: () => void done_bin.firstChild.remove(),
          })
        )
      } else if (e.to == snooze_bin) {
        snooze_bin.firstChild.remove()
        item.global_store._todoer ??= {}
        if (snoozed) {
          _unsnooze(item, true) // the owner's own drag out of the snoozed list
          _select_next(next, true)
        } else {
          // the answer is the time and the dialog's box ({time, notify}, see _snooze_close). The
          // next row's selection is asked for here, at the drop, with the dialog's outcome to come
          // (as the agent's and the owner's bin do): asked for after the dialog, it would take
          // the gesture's intent when the drop is long over
          _select_next(
            next,
            _snooze_dialog().then(answer => {
              if (!is_number(answer?.time)) return void list.insertBefore(e.item, list.children[e.oldIndex]) ?? false
              _snooze(item, answer)
              return true
            })
          )
        }
      }
    },
  })

  for (const elem of Object.values(bins)) elem.sortable = Sortable.create(elem, { group: widget.id })

  // a drag's order not yet persisted (see onUnchoose) puts the rows in that order at every
  // render until the list's save persists it (the save task deletes it); rows the order lacks
  // (a row a bin took, a row that arrived meanwhile) stay ahead of it, as Sortable's sort
  // leaves them
  if (widget._orderAfterDrag && !snoozed) list.sortable.sort(widget._orderAfterDrag)

  // reconcile marks, visibility observer, and strip buttons when Item.svelte restores this cached
  // widget from cache-div after a query change that removed and re-mounted it
  widget._resize = () => {
    if (typeof window != 'undefined' && typeof window._todoer_vis_refresh == 'function') return void window._todoer_vis_refresh(widget)
    if (typeof _watch_list_visibility == 'function') _watch_list_visibility(widget)
    if (typeof _sync_marks == 'function') _sync_marks()
    if (typeof _bin_buttons == 'function') _bin_buttons(_selected_item())
  }

  // the bin buttons follow the list as drawn: a row that came or went for the selected item
  if (typeof _bin_buttons == 'function') _bin_buttons(_selected_item())

  // NOTE: this is no longer needed w/ 'dragging' class moved to onStart instead of onChoose, preventing the list item div from being shrunk under the cursor prematurely, sending clicks to the widget instead
  // widget.onclick = e => {
  //   // ignore clicks on background (widget) too close to an item being let go
  //   if (Date.now() - last_unchoose_time < 250) {
  //     e.stopPropagation()
  //     e.preventDefault()
  //   }
  // }
}

// logs a completed todo directly through the logger item's _on_command_log without MindBox
// command dispatch (keeping the box's text and history untouched): appends into an existing daily
// log item, or creates today's daily log item via programmatic window._create and runs its init.
// Errors are written to the console and never fail the completion
function _log_done(log_text) {
  try {
    const logger = _item('#logger', { silent: true })
    if (!logger || typeof logger.eval != 'function') return
    const log = logger.eval("typeof _on_command_log == 'function' ? _on_command_log : null")
    if (typeof log != 'function') return
    const res = log('done ' + log_text)
    if (res && typeof res.text == 'string') {
      const created = window._create(res.text, { edit: false })
      if (created && typeof res.init == 'function') res.init(created)
    }
  } catch (e) {
    console.error(`todoer: logging completed todo failed: ${e?.message ?? e}`)
  }
}

// completes a todo: what a drop of its row on the done bin does, and a press on the done button.
// `log_text` is what the row logs; `back` puts a dragged row back where it was (before any word
// to the owner) and `gone` takes it out of the bin, each called where the drop's own code did it;
// a press has no row to move. True where the todo is completed, or was completed already
function _complete_todo(item, log_text, { back = () => {}, gone = () => {} } = {}) {
  // a todo dropped on the done bin is NEVER deleted (the owner, 2026-11-17): its todo
  // tag becomes #done whatever its length and whether the item is named, and the item
  // stays with all it holds. until then only a row whose snippet had been cut was
  // rewritten and every other one was deleted: a task with its agent's tree and log
  // (the snippet reads the tree as a token and drops the log), a saved item with a
  // unique label after the app's "Delete ...?". no deletion, so that question is gone;
  // the app's own question before a whole-item write of 262,144 UTF-16 units or more
  // is still asked (write() below).
  // gate ALL side effects (DOM removal, /log) on an ACCEPTED mutation (review 151
  // §2.4): the fail-closed branch must not report completion, and item.write's
  // boolean result is the acceptance signal (a refused write must not log as done)
  const grammar = window._grammar
  const refusal = _complete_refusal(item)
  if (refusal) {
    // without the grammar: FAIL CLOSED, never raw (review 150 §2.4), for every todo now: a raw
    // rewrite could alter #todo bytes inside a vault_result candidate. With an open editor that
    // holds the owner's draft (item.text is assigned when editing ends): a whole-item write would
    // replace the editor's text, so nothing is written; with nothing typed there is no draft to
    // lose, and the write below is saved at once (the owner, 2026-11-24: refused only when what
    // is typed differs from what is saved). Either way the dragged row is restored (the snooze
    // branch's cancellation idiom), so that the widget matches the unchanged item
    back()
    alert(refusal)
    return false
  }
  // over the GRAMMAR VIEW (review 149 §2): a #todo inside a vault_result candidate
  // must not be rewritten, and the raw envelope must survive. the todo TAG and nothing
  // else (reviews 0 to 2 of 2026-11-17): the VISIBLE tags the app indexes as #todo
  // become #done, through the app's tag grammar (_replace_tags), so a longer tag
  // (#todo-list, which can be the item's own label), a code span or block (the
  // bridge's _log) and a url's fragment are left as written. the app parses tags from
  // the LOWERCASED view, so the tags are matched over a copy of the view with its ASCII
  // capitals folded (the same length, so an offset in it is the view's; toLowerCase()
  // would not do: it makes two characters of an İ) and edited in the view itself: the
  // tag in any case (#ToDo), and a stylesheet or script written in capitals (<STYLE>)
  // skipped as the parser skips it (the replacer's exclusions name those elements in
  // lower case). the parser also ends a tag at a `#` (#todo#x is the tag #todo), which
  // the replacer's delimiter does not list: in the copy that `#` reads as a `.`, a
  // delimiter of the same width, so the tag is matched and the text after it is read as
  // the parser reads it (#done#x; an eval macro that starts right after that `#` is
  // skipped: a pattern that took the `#` suffix took the macro's first character with
  // it, and the macro's own text was edited). the HIDDEN form #_todo is kept on
  // purpose: the parser records it as a hidden dependency on #todo, which #_done would
  // retarget (the render takes an item for a todo by its visible tags).
  // two cases wait for the app's parser and its replacer to agree: a stylesheet whose
  // element has attributes (<style media="print"> #todo {} </style>) is still changed,
  // since the app itself indexes that selector as the tag; and a tag glued to an eval
  // macro whose text holds a #todo keeps a visible #todo in the index, the macro being
  // preserved
  let tags = 0
  const text = grammar.edit(item.text, view => {
    const spans = [] // where each todo tag starts in the view
    _replace_tags(
      view.replace(/[A-Z]/g, c => c.toLowerCase()).replace(/#todo#/g, '#todo.'),
      '(^|\\s|\\()#todo',
      (m, pfx, offset) => void spans.push(offset + pfx.length)
    )
    tags = spans.length
    const kept = [] // the view's text around the tags, joined by the new tag once
    let end = 0
    for (const at of spans) {
      kept.push(view.slice(end, at))
      end = at + 5
    }
    return [...kept, view.slice(end)].join('#done')
  })
  if (!tags) {
    // no todo tag left: completed elsewhere while this row was dragged (another tab,
    // the bridge; the widgets' renders wait for the drag's end). nothing to write, and
    // no second completion to log: the row just goes
    gone()
    return true
  }
  // write() returns false in read-only mode, or when the app's question before a
  // large write (above) is declined. The save is asked for: the app leaves a write into an
  // item whose editor is open unsaved by default (the owner decides when an edited item is
  // saved), and here that editor holds no draft
  const completed = item.write(text, '', { skip_save: false }) === true
  if (!completed) {
    back()
    alert(`could not complete todo (mutation refused) for ${item.name}`)
    return false
  }
  // a completed todo's snooze and its reminder (the snooze dialog's box) are cleared:
  // the sweep walks every item, and at the snooze time it would unsnooze the kept item
  // and could show its reminder for work already done. not through _unsnooze, which
  // marks the item unsnoozed and calls the unsnooze listeners
  const snooze = item._global_store._todoer
  if (snooze?.snoozed || snooze?.notify) {
    const store = item.global_store._todoer // reading global_store saves the store
    store.snoozed = 0
    delete store.notify
  }
  gone()
  // log directly through the logger item if installed (never through MindBox command dispatch)
  _log_done(log_text)
  return true
}

Date.prototype.toInputValue = function () {
  // from https://stackoverflow.com/a/16010247
  let local = new Date(this)
  local.setMinutes(this.getMinutes() - this.getTimezoneOffset())
  return local.toJSON().slice(0, 16)
}

// pure movement over the snooze dialog's rows of horizontal middles: nothing lit starts at the
// first button on any arrow; left and right stop at each row's ends; up and down take the stop
// nearest by horizontal middle in the adjacent row
function _snooze_move(rows, pos, dir) {
  if (!rows.length || !rows[0]?.length) return null
  if (!pos) return dir == 'ArrowLeft' || dir == 'ArrowRight' || dir == 'ArrowUp' || dir == 'ArrowDown' ? [0, 0] : null
  const [r, c] = pos
  if (dir == 'ArrowLeft') return [r, Math.max(0, c - 1)]
  if (dir == 'ArrowRight') return [r, Math.min(rows[r].length - 1, c + 1)]
  const nr = dir == 'ArrowUp' ? r - 1 : dir == 'ArrowDown' ? r + 1 : -1
  if (nr < 0 || nr >= rows.length) return [r, c]
  const x = rows[r][c]
  let best = 0
  for (let i = 1; i < rows[nr].length; i++) if (Math.abs(rows[nr][i] - x) < Math.abs(rows[nr][best] - x)) best = i
  return [nr, best]
}

// the snooze dialog's stops grouped by row, in order: the two rows of time buttons, the date
// field with its snooze button, and the notify box
function _snooze_rows() {
  const root = document.querySelector('.snooze-modal')
  if (!root) return []
  const rows = [...root.querySelectorAll('.row')].map(r => [...r.querySelectorAll('.button')])
  const custom = [root.querySelector('.custom input'), root.querySelector('.custom .button.snooze')].filter(Boolean)
  const notify = [root.querySelector('.notify input')].filter(Boolean)
  return [...rows, custom, notify].filter(r => r.length)
}

// the snooze dialog, opened for a row dropped on the snooze bin: resolves to the answer, the time
// and the dialog's box ({time, notify}, see _snooze_close), or to nothing when it is dismissed
function _snooze_dialog() {
  _todoer.store._snooze_cleanup?.()
  const modal = (_todoer.store._snooze_modal = _modal(
    _todoer
      .read('html_snooze_modal')
      .replaceAll('__onclick__', `_item('#todoer').eval('_on_snooze(event)')`)
      .replaceAll('__onchange__', `_item('#todoer').eval('_on_snooze_input_change(event)')`)
      .replaceAll('__onnotify__', `_item('#todoer').eval('_on_snooze_notify(event)')`),
    {
      canConfirm: () => false, // toggled in _on_snooze_input_change
      onConfirm: () => _snooze_close(_snooze_input()),
    }
  ))
  let pos = null
  let lit_el = null
  let shown = false
  let closed = false
  const clear_lit = () => {
    lit_el?.classList.remove('lit')
    lit_el = null
    document.querySelectorAll?.('.snooze-modal .lit')?.forEach(el => el.classList.remove('lit'))
  }
  clear_lit()
  const stop = e => {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation?.()
  }
  const cleanup = () => {
    if (closed) return
    closed = true
    window.removeEventListener('keydown', on_key, true)
    clear_lit()
    if (_todoer.store._snooze_cleanup === cleanup) delete _todoer.store._snooze_cleanup
  }
  // capture-phase handler on window for the dialog's lifetime: runs before Modal.svelte's bubble
  // listener so Enter on a lit stop never confirms twice and Escape from a focused date field
  // returns keys to the dialog without closing it
  const on_key = e => {
    if (!_modal_visible(modal)) {
      if (shown) cleanup()
      return
    }
    shown = true
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const key = e.key
    const root = document.querySelector('.snooze-modal')
    if (!root) return
    const date = root.querySelector('.custom input')
    const rows = _snooze_rows()
    const lit = pos ? rows[pos[0]]?.[pos[1]] ?? null : null
    if (date && document.activeElement === date) {
      if (lit !== date) return
      if (key == 'Escape' && !e.shiftKey) {
        stop(e)
        date.blur()
        return
      }
      if (key == 'Enter' && !e.shiftKey) {
        stop(e)
        if (!e.repeat) {
          const time = _snooze_input()
          if (time >= Date.now()) _snooze_close(time)
        }
        return
      }
      if (key == 'Tab') {
        setTimeout(() => {
          if (!closed && _modal_visible(modal) && document.activeElement && document.activeElement !== date) document.activeElement.blur?.()
        })
      }
      return
    }
    if (e.shiftKey) return
    if (key == 'ArrowLeft' || key == 'ArrowRight' || key == 'ArrowUp' || key == 'ArrowDown') {
      stop(e)
      const middles = rows.map(r =>
        r.map(el => {
          const b = el.getBoundingClientRect()
          return (b.left + b.right) / 2
        })
      )
      pos = _snooze_move(middles, pos, key)
      const next = pos ? rows[pos[0]]?.[pos[1]] ?? null : null
      if (next !== lit) {
        lit?.classList.remove('lit')
        next?.classList.add('lit')
        lit_el = next
        if (next && next === date) next.focus()
        else if (document.activeElement && root.contains?.(document.activeElement)) document.activeElement.blur?.()
      }
      return
    }
    if (!lit) return
    if (key == 'Enter') {
      stop(e)
      if (e.repeat) return
      const notify = root.querySelector('.notify input')
      if (lit === notify) return
      const snooze = root.querySelector('.custom .button.snooze')
      if (lit === date || lit === snooze) {
        const time = _snooze_input()
        if (time >= Date.now()) _snooze_close(time)
        return
      }
      _on_snooze({ target: lit })
      return
    }
    if (key == ' ') {
      stop(e)
      if (e.repeat) return
      const notify = root.querySelector('.notify input')
      if (lit === notify) {
        notify.checked = !notify.checked
        _on_snooze_notify({ target: notify })
      }
    }
  }
  window.addEventListener('keydown', on_key, true)
  _todoer.store._snooze_cleanup = cleanup
  modal?.then?.(cleanup, cleanup)
  _update_dom().then(() => {
    if (closed || !_modal_visible(modal)) return
    shown = true
    document.querySelector('.snooze-modal .custom input').value = new Date().toInputValue()
    const notify_box = document.querySelector('.snooze-modal .notify input')
    if (notify_box) notify_box.checked = false // the modal keeps an unchanged {@html} DOM across openings
    _snooze_hint() // this device's permission beside the box (the box starts unchecked, reset above)
    // force trigger input change call now & every second (for Date.now)
    _todoer.dispatch_task(
      'snooze-modal-update',
      () => {
        if (!_modal_visible(_todoer.store._snooze_modal)) return null
        _on_snooze_input_change()
      },
      0,
      1000
    )
  })
  return modal
}

function _snooze_time(label) {
  switch (label) {
    case '3h':
      return Date.now() + 3 * 60 * 60 * 1000
    case '6h':
      return Date.now() + 6 * 60 * 60 * 1000
    case '1d':
      return Date.now() + 24 * 60 * 60 * 1000
    case '3d':
      return Date.now() + 3 * 24 * 60 * 60 * 1000
    case '7d':
      return Date.now() + 7 * 24 * 60 * 60 * 1000
    case '28d':
      return Date.now() + 28 * 24 * 60 * 60 * 1000
    case 'tomorrow':
      return _snooze_tomorrow().getTime()
    case 'weekend':
      return _snooze_weekend().getTime()
    case 'next week':
      return _snooze_next_week().getTime()
    case 'snooze':
      return _snooze_input()
    default:
      fatal('unknown snooze label', label)
  }
}

function _on_snooze(e) {
  const label = e.target.innerText
  const time = _snooze_time(label)
  if (time < Date.now()) alert('future date/time required for snooze')
  else _snooze_close(time)
}

function _snooze_input() {
  const input = document.querySelector('.snooze-modal .custom input')
  return input.valueAsNumber + new Date().getTimezoneOffset() * 60 * 1000
}

function _on_snooze_input_change() {
  const can_confirm = _snooze_input() >= Date.now()
  _modal_update(_todoer.store._snooze_modal, { canConfirm: () => can_confirm })
  document
    .querySelector('.snooze-modal .button.snooze')
    .classList.toggle('disabled', !can_confirm)
}

// the snooze dialog's answer, read before it closes: the time and its box ("notify on
// unsnooze"), {time, notify}, which the drop's handler writes on the todo (_snooze)
function _snooze_close(time) {
  const notify = !!document.querySelector('.snooze-modal .notify input')?.checked
  _todoer.store._snooze_cleanup?.()
  _modal_close(_todoer.store._snooze_modal, { time, notify })
}

// a todo snoozed until `time` with the dialog's box written beside it as `notify` (a desktop
// notification when the snooze ends by its time, see _notify_unsnooze), and any surfaced count
// recorded as seen on `bell` (what _clear_bell writes), all in the SAME save of the todo's own
// store (every device sees them together); an unchecked box removes a flag an earlier snooze left
function _snooze(item, { time, notify }) {
  const store = (item.global_store._todoer ??= {})
  store.snoozed = time
  if (notify) store.notify = true
  else delete store.notify
  const count = _task_state(item)?.surfaced
  if (count > 0 && !(store.bell >= count)) store.bell = count
}

// the snooze dialog's box changed: a check asks THIS device's notification permission when the
// browser has not asked yet (the box's click is the gesture a browser prompts from; the box is
// the todo's own opt-in, no /notify reason needed), the hint beside the box following the answer
function _on_snooze_notify(e) {
  if (e?.target?.checked && _notify_permission() == 'default') Promise.resolve(Notification.requestPermission()).then(_snooze_hint, _snooze_hint)
  else _snooze_hint()
}

// the hint beside the snooze dialog's box: this device's permission unless granted, or not asked
// yet while the box is unchecked (a check asks); the notification shows on every device whose
// permission is granted, from its last-used window, so the box stands whatever the hint says
function _snooze_hint() {
  const hint = document.querySelector('.snooze-modal .notify .hint')
  const checked = !!document.querySelector('.snooze-modal .notify input')?.checked
  const permission = _notify_permission()
  if (hint) hint.innerText = permission == 'granted' || (permission == 'default' && !checked) ? '' : `this device: ${permission}`
}

function _snooze_tomorrow() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(8, 0, 0, 0)
  return date
}
function _snooze_weekend() {
  const date = new Date()
  do {
    date.setDate(date.getDate() + 1)
  } while (date.getDay() != 6)
  date.setHours(8, 0, 0, 0)
  return date
}
function _snooze_next_week() {
  const date = new Date()
  do {
    date.setDate(date.getDate() + 1)
  } while (date.getDay() != 1)
  date.setHours(8, 0, 0, 0)
  return date
}

// unsnooze todo item: the sweep's unsnooze once its time came, or an early end (`manual`: the
// owner's own drag/button/key out of the snoozed list, or a ringing bell's unsnooze), which also
// removes the snooze dialog's flag in the same save (an early end notifies no reminder on any
// device, see _notify_unsnooze); the deadline sweep keeps the flag, which every device's notifier reads
function _unsnooze(item, manual = false) {
  const store = item.global_store._todoer
  merge(store, { snoozed: 0, unsnoozed: Date.now() })
  if (manual) delete store.notify
  // invoke unsnooze listeners for each unsnoozed todo item
  // listeners must register on object item('#todoer').store.on_unsnooze
  each(values(_todoer.store.on_unsnooze ?? {}), f =>
    f(item, _extract_todo_snippet(item))
  )
}

// whether the snippet runs forward from the #todo tag at `todo_offset` (suffix mode) or backward
// (prefix mode): we prefer suffix, but switch to prefix if it looks "cleaner" (clean means
// alphanumeric for suffix, alphanumeric+punctuation for prefix); the WHOLE text after and before
// the tag decides, and a bracketed marker word right after the tag ([question] etc., the vault
// design 2.4) keeps suffix mode; the marker writer uses the same rule
function _snippet_uses_suffix(text, todo_offset) {
  return (
    !!text.substring(todo_offset + 5).match(/^\s*(\[[a-z]+\]|[\p{L}\d])/u) ||
    !text.substring(0, todo_offset).match(/[\p{P}\p{L}\d]\s*$/u)
  )
}

// the offset of the first #todo tag over the widget's own grammar view, or -1
function _todo_offset(text) {
  let todo_offset = -1
  _replace_tags(text, '(?:^|\\s|\\()#todo', (m, offset) => {
    if (todo_offset < 0) todo_offset = offset
  })
  if (todo_offset < 0) return -1
  while (text[todo_offset] != '#') todo_offset++ // skip leading delimiter
  return todo_offset
}

// the text without its fenced _log blocks (the bridge's task log; the app's opener grammar)
function _without_log(text) {
  return text.replace(/(?:^|\n)[ \t]*```(?:\S+:)?_log(?:_hidden|_removed)?(?::\S*\.\S*)?(?:[ \t][^\n]*)?(?:\n[\s\S]*?)?\n[ \t]*```[ \t]*(?=\n|$)/gi, '')
}

// the todoer build's store stamp (`_todoer.version`, a reserved key): a saved list order carries
// it, and a build older than the one that last wrote the store (the owner's other device, updated
// first) stops writing orders and asks for a reload instead of fighting the newer build's
// membership rules (two writers with different rules re-asserting one key on every delivery
// thrash every tab's order each second). Best effort: the check reads the store this tab holds
// when its save runs, so a save accepted before the newer stamp arrived can still land; increment
// it with every incompatible change to what an order key holds
const TODOER_VERSION = 1

// the order to save for a list: this tab's rows in their DOM order, with the ids the stored
// order carries that this tab does not show (not loaded here, another list, another build's
// membership) kept in place after the known id they followed; never dropped, so a tab holding
// part of the items (a stale device mid-sync) cannot rewrite the others' order, and a render
// caused by a delivery of a settled order (every displayed id already occurs in the delivered
// order, no resurfacing, the stamp already there) reproduces the delivered string, which is
// then not written at all
function _merged_order(dom_ids, stored) {
  const known = new Set(dom_ids)
  const leading = []
  const after = new Map() // known id -> the unknown ids that followed it in the stored order
  let last = null
  for (const id of (stored ?? '').split(',').filter(id => id)) {
    if (known.has(id)) last = id
    else if (last === null) leading.push(id)
    else (after.get(last) ?? after.set(last, []).get(last)).push(id)
  }
  const out = [...leading]
  for (const id of dom_ids) out.push(id, ...(after.get(id) ?? []))
  return out.join()
}

// whether this build must not write orders: the store was last written by a newer build
function _order_blocked(todoer_store) {
  return (todoer_store?.version ?? 0) > TODOER_VERSION
}

// one turn of a widget's order save (its store.set task, polled every second): the corpus must
// be SERVER-CONFIRMED first (window._server_confirmed: a current server revision applied; a
// secondary tab of the shared persistent cache confirms on its own, which the app's editor2 row
// pins), since the save writes the pinned item's store and every listed item's
// cleared unsnooze flag WHOLE from this tab's copies, and until the confirmation those copies
// are whatever the cache last saw: a phone returning after days wrote its stale copies over
// snoozes made elsewhere meanwhile (2026-09-25). a tab loaded offline or on a slow link waits
// as long as it takes, and a drag made before the confirmation keeps its order through the
// renders meanwhile (the order hint, see onUnchoose) and is saved when the wait ends; the
// corpus must also be currently served and past a resume hold (see _corpus_current, _held).
// then every listed item must be saved (an id), and a store stamped by a newer build blocks
// this one (see _order_blocked)
function _order_save_step({ confirmed, held, saved_ids, todoer_store }) {
  if (!confirmed || held) return 'wait'
  if (saved_ids.includes(null)) return 'wait'
  if (_order_blocked(todoer_store)) return 'blocked'
  return 'save'
}

// one tick of the unsnooze sweep (_sweep, the task _on_welcome starts): only the primary instance
// (the most recently focused live tab of the account, across devices) sweeps, and only on a
// server-confirmed corpus while the device reports online, since an unsnooze writes the item's
// store whole from this tab's copy and a stale or offline-queued write lands over a snooze made
// elsewhere meanwhile (2026-09-25); 'wait' tries again at the next tick
function _sweep_step({ primary, confirmed, online, held }) {
  if (!primary) return 'skip'
  if (!confirmed || !online || held) return 'wait'
  return 'sweep'
}

// the sweep's cadence (2026-10-23): a tick at every whole minute of the clock at the latest,
// sooner at a snooze time or a resume hold's end ahead, and in a hidden page at most
// SWEEP_HIDDEN_MS after the tick that schedules it (_sweep_delay)
const SWEEP_PERIOD_MS = 60 * 1000
const SWEEP_HIDDEN_MS = 20 * 1000

// the delay to the sweep's next tick, the number its task returns (the app's dispatch_task runs
// the task again that many ms later): the next whole minute of the clock (the snooze dialog's
// time input sets whole minutes), or sooner the earliest snooze time or resume hold end still
// ahead (`snoozes`, `hold_until`), so a visible page unsnoozes at the time itself; a timer that
// fires a little early on this clock sees the time ahead and ticks again at it, and a time
// already past (a sweep that waited) is retried at the next minute. In a hidden page (`hidden`)
// at most SWEEP_HIDDEN_MS: Chrome's intensive throttling (a loaded page hidden over a minute; a
// chain's timers from its 7th on, a promise's callbacks inside a timer's task included) runs
// them at one wake-up a minute on a fixed grid the page cannot see, and the app's macro
// expansion loop (every 250 ms) wakes the page at every point of it, so a timer due even a few
// ms past one waits for the next: a timer runs up to a minute after it is due, and the gap
// between two ticks stays under SWEEP_PERIOD_MS + SWEEP_HIDDEN_MS, under the resume hold's
// threshold whatever the grid's phase. The old chain (60 s from the end of each run) ticked
// every 120 s there, and every tick re-armed the hold (measured in Chrome 151, 2026-10-23); a
// cap near a whole period still slips once from a tick off the grid (a chain's first throttled
// timer: each re-dispatch starts a new chain), 112 s measured with 55 s
function _sweep_delay({ now, snoozes = [], hold_until = 0, hidden = false }) {
  let next = (Math.floor(now / SWEEP_PERIOD_MS) + 1) * SWEEP_PERIOD_MS
  for (const time of [...snoozes, hold_until]) if (time > now && time < next) next = time
  return hidden ? Math.min(next - now, SWEEP_HIDDEN_MS) : next - now
}

// the corpus this tab's copies come from is server-confirmed AND currently served: the app's
// sticky `_server_confirmed` (a current server revision applied once) and its live
// `_server_current` (the latest items snapshot from the server, not the cache: it drops when
// the SDK notices a dead stream and rises with the catch-up; absent on an app build before
// 2026-09-26, then the confirmation alone decides)
function _corpus_current(w) {
  return !!w._server_confirmed && (w._server_current ?? true)
}

// the RESUME HOLD (2026-09-26): a gap longer than RESUME_GAP_MS between OBSERVATIONS (the
// sweep's tick, and every turn of an order save task) means the page was frozen or the device
// asleep, and its copies may be missing what other tabs wrote meanwhile until the SDK notices
// the dead stream and catches up (seconds to a minute); the housekeeping writers wait
// RESUME_HOLD_MS from the observation that saw the gap. A throttled hidden page observes at
// least every 80 s: Chrome runs its chained timers at one wake-up a minute, a timer up to a
// minute after it is due, and the sweep's tick is due within 20 s (see _sweep_delay; until
// 2026-10-23 its chain slipped to every 120 s there, and every tick re-armed this hold, so a
// long-hidden page never swept and a return waited up to two minutes more); a starved page
// (Chrome's 1% CPU budget for a hidden page's timers, used up) earns a harmless hold. both
// writers observe (review 0: the order save's one-second task could wake before the sweep after
// a second suspension and see an expired hold), so the gap threshold sits under the hold's span
// and over the sweep's period. returns the hold's end
const RESUME_GAP_MS = 90 * 1000
const RESUME_HOLD_MS = 2 * 60 * 1000
function _resume_hold({ last_tick, now, hold_until }) {
  if (last_tick != null && now - last_tick > RESUME_GAP_MS) return now + RESUME_HOLD_MS
  return hold_until ?? 0
}
// whether the writers are held now: ONE observation of the clock (see _resume_hold), by
// whichever writer runs first after a gap; a hold it starts is told on the console, the gap seen
// and the hold's end, so that a needless hold shows in a report
function _held() {
  const now = Date.now()
  const { last_tick, hold_until = 0 } = _todoer.store
  const until = _resume_hold({ last_tick, now, hold_until })
  _todoer.store.hold_until = until
  _todoer.store.last_tick = now
  if (until != hold_until)
    console.info(`todoer: writers held until ${new Date(until).toLocaleTimeString()}, after a gap of ${Math.round((now - last_tick) / 1000)} s`)
  return now < until
}

// a long press on a touch screen should start the delayed drag (Sortable's delayOnTouchOnly),
// but on the owner's touch-screen laptop under Chrome it opened the context menu instead (Chrome
// opens it on a long press; the rows' -webkit-touch-callout CSS quiets only iOS, and Sortable
// 1.15 prevents no context menu of its own). So the list prevents the context menu after a press
// that came from touch, and keeps every other one (a mouse right-click, a keyboard menu, a pen).
// Where the contextmenu event carries the gesture's pointer type (Chromium: '' for a keyboard
// menu) that decides; elsewhere the last press's origin does, recorded by pointerdown (or by
// touchstart where pointer events are absent, never overriding a pointer classification) and
// cleared by a keydown (a keyboard menu request) or a mousedown, which a touch's compatibility
// mouse events send too, so that fallback is best effort; Chromium's own-event path is unaffected
function _suppress_touch_context_menu(list) {
  let touch = false // the last press came from touch (the fallback classification)
  let pointer = false // pointer events classify presses here (touchstart must not override)
  list.addEventListener(
    'pointerdown',
    e => {
      pointer = true
      touch = e.pointerType == 'touch'
    },
    true
  )
  list.addEventListener('touchstart', () => (touch = pointer ? touch : true), { capture: true, passive: true })
  list.addEventListener('keydown', () => (touch = false), true)
  list.addEventListener('mousedown', e => (touch = e.pointerType == 'touch' ? touch : false), true)
  list.addEventListener('contextmenu', e => {
    const type = typeof e.pointerType == 'string' ? e.pointerType : null
    if (type !== null ? type == 'touch' : touch) e.preventDefault()
  })
}

// a quick sideways touch grabs its row at once (2026-09-12). The delayed touch drag (Sortable's
// delay with delayOnTouchOnly) exists so that a touch moving up or down scrolls the page instead
// of grabbing a row, but the page never pans sideways, so a touch that moves mostly sideways
// before its row is chosen (the delay pending, or cancelled by Sortable on a jitter) can only
// mean a drag: the list presses the row again without the delay, at the touch's position. The
// touch is followed through pointer events (a browser withholds touchmove events inside its tap
// slop, Chromium among them, but streams pointermove events from the start; a browser without
// pointer events keeps the delayed drag only): pointerdown records the primary touch, pointermove
// classifies it once it has moved HGRAB_RADIUS px on either axis (mostly sideways by HGRAB_RATIO:
// grab; otherwise left alone for the rest of that touch, the browser's scroll included), and
// pointerup or pointercancel (the browser took the touch for a scroll) ends it. The list's
// touch-action (pan-y pinch-zoom, todoer-widget.html) keeps the browser from taking a touch that crosses
// its slop mostly sideways, and from the grab on the list prevents that touch's cancelable
// touchmove events (the first one past the slop is the browser's last chance to start a scroll,
// before Sortable's own prevention takes over with the drag). A second finger on this list, a
// row already chosen (the delay ended), or a touch that pressed no row of this list grab
// nothing (a second finger elsewhere is not seen here). The press
// again goes through Sortable 1.15's press path by its private names (_disableDelayedDrag and
// _onDrop release the pending press without events, _onTapStart with delay 0 presses at the
// touch's position); a Sortable without them keeps the delayed drag only
const HGRAB_RADIUS = 10 // px moved on either axis before a pending touch press is classified
const HGRAB_RATIO = 2 // the sideways move must be at least this multiple of the vertical one

// classifies a touch that moved (dx, dy) since its press: true (mostly sideways: grab), false
// (leave to the browser and Sortable), null (not moved HGRAB_RADIUS px yet)
function _sideways(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < HGRAB_RADIUS) return null
  return Math.abs(dx) >= HGRAB_RATIO * Math.abs(dy)
}

function _grab_on_sideways_touch(list) {
  if (typeof PointerEvent == 'undefined') return // the delayed drag only
  let press = null // the primary touch pressed on the list, until classified or ended
  let grabbed = false // this touch grabbed a row: its moves are the drag's, never a scroll
  const ended = () => ((press = null), (grabbed = false))
  list.addEventListener(
    'pointerdown',
    e => {
      if (e.pointerType != 'touch') return
      if (!e.isPrimary) return (press = null) // a second finger: no grab for this touch
      grabbed = false
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, target: e.target }
    },
    true
  )
  list.addEventListener(
    'pointermove',
    e => {
      if (!press || e.pointerId != press.id) return
      const sideways = _sideways(e.clientX - press.x, e.clientY - press.y)
      if (sideways === null) return
      const { target } = press
      press = null // classified either way
      const sortable = list.sortable
      const row = Sortable.dragged // the row of the pending (or cancelled) press, if any
      if (!sideways || !sortable || row?.parentNode !== list) return
      if (row.classList.contains(sortable.options.chosenClass)) return // the delay ended
      if (!['_disableDelayedDrag', '_onDrop', '_onTapStart'].every(name => typeof sortable[name] == 'function')) return
      grabbed = true
      sortable._disableDelayedDrag() // Sortable's own move handler may have done this already
      sortable._onDrop() // no event: the pending press is released without unchoose or end
      const delay = sortable.option('delay')
      sortable.option('delay', 0)
      try {
        const { clientX, clientY } = e
        sortable._onTapStart({ type: 'pointerdown', pointerType: 'touch', button: 0, cancelable: true, target, clientX, clientY })
      } finally {
        sortable.option('delay', delay)
      }
      // the release above dispatched no unchoose: a second press that did not take (a row still
      // animating) leaves the renders deferred for the first press (see __render) to run here
      if (!Sortable.dragged) _run_deferred_renders()
    },
    true
  )
  list.addEventListener('pointerup', ended, true)
  list.addEventListener('pointercancel', ended, true)
  list.addEventListener('touchmove', e => grabbed && e.cancelable && e.preventDefault(), { capture: true, passive: false })
}

// the todo line of a snippet, trimmed of whitespace and the truncation ellipsis: the first line
// when the snippet starts with the complete tag (a suffix snippet; its later text may end in
// another tag, which decides nothing: the first tag does, as for the extractor and the marker
// writer), the last line otherwise (a prefix snippet ends at the tag); what a row click selects
// in the item (the line is raw bytes there, the snippet need not be)
function _todo_line(snippet) {
  const lines = snippet.split('\n')
  const line = _todo_offset(snippet) === 0 ? lines[0] : lines[lines.length - 1]
  return line.replace(/^[\s…]+|[\s…]+$/g, '')
}

// extract todo snippet from item; `cut`, when given, receives the text that a truncation
// left out (`tail` behind a suffix snippet, `head` before a prefix one), for the row's tooltip
function _extract_todo_snippet(item, cut = {}) {
  // read text and determine todo tag positions (the mode is decided on the text as read, as
  // the marker writer decides it; the bridge's _log block is dropped from the chosen slice)
  let text = item.read()
  let todo_offsets = []

  // note trailing delimiter is added automatically by _replace_tags
  _replace_tags(text, '(?:^|\\s|\\()#todo', (m, offset) =>
    todo_offsets.push(offset)
  )
  if (todo_offsets.length == 0) {
    error(`could not locate #todo tag in todo item '${item.name}'`)
    return // falsy return can be detected by caller
  }
  if (todo_offsets.length > 1) {
    warn(
      `found multiple (${todo_offsets.length}) #todo tags in ` +
        `item '${item.name}'; using only first occurrence for snippet`
    )
  }
  let todo_offset = todo_offsets[0]
  while (text[todo_offset] != '#') todo_offset++ // skip leading delimiter

  // determine if we should use suffix or prefix (the rule shared with the marker writer)
  const use_suffix = _snippet_uses_suffix(text, todo_offset)

  if (use_suffix) {
    // use suffix (without the log), truncate on right
    text = _without_log(text.substring(todo_offset))
    if (text.length > 200) {
      // truncate on first whitespace in tail (index > 200)
      // note we only truncate on whitespace to avoid breaking tags or urls
      const cutoff = text.substr(200).search(/\s/)
      if (cutoff >= 0) {
        cut.tail = text.substr(200 + cutoff)
        text = text.substr(0, 200 + cutoff) + ' …'
      }
    }
  } else {
    // use prefix (without the log), truncate (and align) on left
    text = _without_log(text.substring(0, todo_offset + 5))
    if (text.length > 200) {
      // truncate on _last_ whitespace in head (index < end - 200)
      // note we only truncate on whitespace to avoid breaking tags or urls
      const cutoff = text.substr(0, text.length - 200).search(/\s[^\s]*$/)
      if (cutoff >= 0) {
        cut.head = text.substr(0, cutoff + 1)
        text = '… ' + text.substr(cutoff + 1)
      }
    }
  }

  return text
}

// runs the renders deferred by a drag or a pending press (see __render), each widget's with
// the item it was asked for; called at the release (onUnchoose) and after a failed re-press
function _run_deferred_renders() {
  document.querySelectorAll('.todoer-widget').forEach(w => {
    const item = w._renderPendingDragging
    if (!item) return
    delete w._renderPendingDragging
    setTimeout(() => __render(w, item))
  })
}

// render widget in item
function _render_todoer_widget(widget, item = _this) {
  if (window.Sortable) return __render(widget, item)
  const url = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js'
  return (_todoer.store.loading ??= _load(url)).then(() => {
    if (!window.Sortable) fatal('failed to load sortable')
    delete _todoer.store.loading
    return __render(widget, item)
  })
}

// create pinned item w/ widget
function create_pinned_item() {
  const item = _create()
  item.write_lines(
    `#_pin `,
    `\<<todoer_widget()>>`,
    `\<<todoer_widget({delegated: true})>>`, // the delegated list (design 2.2), below the main one
    `#_todoer`
  )
}

// => /todo [text]
// create `#todo` item w/ `text`
function _on_command_todo(text) {
  // log if logger exists
  // if (_exists('#logger'))
  //   MindBox.create('/log todo ' + text)
  return { text: '#todo ' + text, edit: false }
}

// detect any changes to todo items & re-render widgets as needed; a text change of any item is
// compared for a bridge reply first (a vault or task chat's new agent turn, _notify_reply: a
// remote one may notify, a local one moves the baseline) and for an unseen item write stamp in
// `#todoer`'s own store (when the item arrived or updated after its stamp)
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // ignore dependency changes
  const item = _item(id, { silent: true }) // can be null if item deleted
  if (item) {
    _notify_reply(item, remote)
    if (!deleted) {
      const key = item.saved_id ?? item.id
      const wrote = _item_writes()
      const entry = wrote && Object.prototype.hasOwnProperty.call(wrote, key) ? wrote[key] : null
      if (entry && _todoer.store.item_seen?.[key] !== entry.at) _notify_item(key, item)
    }
  }
  // item must exist and be tagged with #todo (to be added or updated)
  // OR it must listed in a widget on a dependent (to be removed)
  const is_todo_item = item?.tags.includes('#todo')
  const waits = !!item && !is_todo_item && !!_waits(item) // a row that is not a todo (to be added)
  each(_this.dependents, dep => {
    const item = _item(dep)
    if (is_todo_item || waits || _listed(item, id)) {
      item.elem?.querySelectorAll('.todoer-widget').forEach(widget => {
        _render_todoer_widget(widget, item)
      })
    }
  })
  // reconcile the strip on every item change (a remote rename leaving the box naming nobody,
  // another item taking the selected label and making it ambiguous, or an off-list todo's edit):
  // __bin_buttons compares `drawn` and writes nothing when the displayed buttons did not change
  if (typeof _bin_buttons == 'function') _bin_buttons(_selected_item())
}

// whether any widget of a pinned item lists the todo (membership is tracked per widget)
function _listed(pinned, id) {
  return Object.values(pinned.store._todoer?.items ?? {}).some(set => set.has(id))
}

// detect any changes to global stores: todoer's own store carries agent item write stamps
// (`_agent.wrote`), checked before everything else; on todo items, a ringing bell unsnoozes a
// snoozed todo first (primary tab, sweep rules), then the desktop notification of a projection
// change (independent of any widget on the page; a project's bound children follow its
// projection, so they are compared too), then the widgets' re-render. The vault item's store is
// the one other store the rows read (the bridge's listing, for a marker's review link): a change
// of what they read of it renders every mounted widget again
function _on_global_store_change(id, remote) {
  if (id != null && id == _todoer.id) _notify_items()
  const item = _item(id, { silent: true }) // can be null if item deleted
  if (_listing_changed(item)) return _rerender_todoer_widgets()
  if (!item?.tags.includes('#todo')) {
    // a row that is not a todo follows its item's store: a clear made here or on another device;
    // any other store change still reconciles the strip (a no-op when `drawn` is unchanged)
    if (item && (_waits(item) || (_todoer.dependents ?? []).some(dep => _listed(_item(dep), id)))) _rerender_todoer_widgets()
    else if (typeof _bin_buttons == 'function') _bin_buttons(_selected_item())
    return
  }
  _unsnooze_for_bell(item)
  _notify_change(item)
  _notify_children(item)
  _on_item_change(id)
}

// whether a store change of the #vault item changed what the rows' marker links read of the
// bridge's listing (_review_anchor_builder): the vault root, or the SET of worktree names it
// lists. A marker is linked only for a listed worktree, and the bridge publishes its listing
// AFTER the todo's own text and projection (a retry or a reconnect can delay it further), so
// without this a row already on the page kept a plain marker until its todo changed again, and
// kept a link after its worktree was delisted. A run's log, a status and the listing's
// timestamps change neither, so those deliveries render nothing. The last value seen is this
// tab's (the #todoer item's per-tab store); the first delivery of a session renders once
function _listing_changed(item) {
  if (!item || item.id != _item('#vault', { silent: true })?.id) return false
  const bridge = item._global_store?._bridge
  const seen = JSON.stringify([bridge?.root ?? null, Object.keys(bridge?.worktrees ?? {}).sort()])
  if (seen == _todoer.store.listing) return false
  _todoer.store.listing = seen
  return true
}

// this window's query target (index.svelte: first term naming a unique label other than the log
// tag, or any id: term; a / command targets nothing). Reads MindBox.get() directly (live during
// the 500 ms typing debounce; case-sensitive id: lookup per _item; when a query names several
// targets at once, picks the listing or the first resolving id:; compound queries also count for
// marks and keys when unlinked)
function _window_target(text = typeof MindBox != 'undefined' ? MindBox.get?.() : '') {
  if (typeof text != 'string' || text.startsWith('/')) return null
  const terms = text.trim().split(/\s+/).filter(Boolean)
  const listed = terms[0]?.startsWith('#') && terms[0].toLowerCase() != '#log' ? _item(terms[0], { silent: true }) : null
  if (listed) return listed
  for (const t of terms) if (t.toLowerCase().startsWith('id:')) { const it = _item('id:' + t.slice(3), { silent: true }); if (it) return it }
  return null
}

// this window's selected item: own target where it has one, else while linked (or during an
// active row handoff) the optimistic row or the current linked partner's reported saved target
// (where this window has a mounted row for it, unless `mounted` is false)
function _selected_item(text = typeof MindBox != 'undefined' ? MindBox.get?.() : '', { mounted = true } = {}) {
  const own = _window_target(text)
  if (own) return own
  const windows = typeof window != 'undefined' ? window._todoer_windows : null
  if (!windows) return null
  const pending = windows.pending
  const optimistic = (pending?.kind == 'ask' && pending.fallback) || (pending?.kind == 'save' && pending.ask)
  const partner = typeof _send_partner == 'function' ? _send_partner() : null
  const pt = partner ? windows.peers?.get(partner)?.target : null
  const id = optimistic ? windows.shown : typeof pt == 'string' ? pt : null
  if (!id) return null
  const item = _item(id, { silent: true })
  return item && (!mounted || (typeof _bin_row == 'function' && _bin_row(item))) ? item : null
}

// moves .selected across mounted widgets without rebuilding lists; hidden/cached widgets hold none
function _sync_marks(item = _selected_item(undefined, { mounted: false })) {
  const id = item?.id ?? null
  const mounted = typeof _mounted_lists == 'function' ? new Set(_mounted_lists()) : null
  document.querySelectorAll('.todoer-widget').forEach(w => {
    const on = !mounted || mounted.has(w)
    w.querySelectorAll('.list-item-container').forEach(r => {
      const hit = !!(on && id && r.getAttribute('data-id') == id)
      r.classList?.toggle ? r.classList.toggle('selected', hit) : r.classList?.[hit ? 'add' : 'remove']?.('selected')
    })
  })
}

// detect query changes: update buttons, announce target (or none) to partner, and sync marks
function _on_search(text) {
  const target_item = _window_target(text)
  const windows = typeof window != 'undefined' ? window._todoer_windows : null
  if (typeof _send_selected == 'function') _send_selected(target_item)
  if (windows) {
    if (target_item) windows.shown = null
    else if (!((windows.pending?.kind == 'ask' && windows.pending.fallback) || (windows.pending?.kind == 'save' && windows.pending.ask))) {
      const pt = typeof _send_partner == 'function' ? windows.peers.get(_send_partner())?.target : null
      windows.shown = typeof pt == 'string' ? pt : null
    }
  }
  const selected = _selected_item(text, { mounted: false })
  if (typeof _bin_buttons == 'function') _bin_buttons(_selected_item(text)) // (a table loads this function alone)
  if (!selected && !document.querySelector('.todoer-widget .list-item-container.selected')) return
  _sync_marks(selected)
}

// THE BIN BUTTONS (the owner, 2026-11-24: "drag/drop is becoming a bottleneck"): one button per
// bin of the list that holds the row of the item the box names, in the bins' order and colours,
// and before them a bell where that row carries one. A press does what a drop of the row on
// that bin does (_bin_act); the bell's, what a click on the row's own bell does. They are handed
// to the key buttons' strip as a group at its left end (key_buttons.js, self.guest; the owner:
// "in the same bar on the left, spaced out from existing button groups as we already do between
// groups"). Without that item, or with one that takes no guests yet, they stand on a glass piece
// of their own at the page's lower left, in the strip's look (round 24 px buttons on the
// sparkle's dark grey, 16 px icons, a 44 px high piece of frosted glass with a 12 px corner).
// The names start with an underscore, and no comment here holds a hash word: the item's page
// draws its table of definitions from this file's comments (js_table), where a colour written
// with its hash sign is read as a tag that no item carries (seen on a test page, 2026-11-24)
// the bins of each list, in their order: shared by the widget's render (__render) and a selected
// todo whose list is not on the page (_todo_buttons), so the two cannot drift apart
const _LIST_BINS = { main: ['agent', 'done', 'snooze', 'cancel'], snoozed: ['agent', 'done', 'snooze', 'cancel'], delegated: ['agent', 'owner'] }

const _BIN_BUTTONS = [
  // the row before and the row after the selected one, in its list (the keys k and j do the same)
  { name: 'up', title: 'Previous row (k)', color: '#fff', icon: 'M3.5 10l4.5-4.5 4.5 4.5' },
  { name: 'down', title: 'Next row (j)', color: '#fff', icon: 'M3.5 6l4.5 4.5 4.5-4.5' },
  // the list's own bell (todoer-widget.html, mark.waits), filled, in the yellow the snooze bin had (the owner: "keep yellow for notifs, use orange for snooze")
  { name: 'bell', title: 'Clear the notification (b)', color: '#ff6', fill: true, box: 24, icon: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z' },
  // the pusher's commit-history address for a row of an item an agent wrote (a clock with an arrow turning back)
  { name: 'history', title: 'Open item history (h)', color: '#ccc', icon: 'M2.8 9.4a5.4 5.4 0 1 0 1.2-5.1L2.7 5.5M2.7 2.8v2.7h2.7M8 5v3.2l2.1 1.3' },
  { name: 'agent', title: 'Delegate to the agent (a)', color: '#6af', fill: true, icon: 'M8 0.5l1.9 5.6 5.6 1.9-5.6 1.9L8 15.5l-1.9-5.6L0.5 8l5.6-1.9z' }, // the vault item's sparkle
  { name: 'done', title: 'Done (d)', color: '#6f6', icon: 'M3 8.5l3.5 3.5L13 4.5' }, // the key buttons' tick
  { name: 'snooze', title: 'Snooze (s)', color: '#fa4', icon: 'M8 2.6a5.4 5.4 0 1 0 0 10.8a5.4 5.4 0 1 0 0-10.8M8 5v3.2l2.1 1.3' },
  { name: 'cancel', title: 'Delete (x)', color: '#f66', icon: 'M3 4.6h10M6.4 4.6V3h3.2v1.6M4.4 4.6l.6 8.4h6l.6-8.4M6.8 7v3.6M9.2 7v3.6' },
  { name: 'owner', title: 'Take back from the agent (u)', color: '#ccc', icon: 'M6.2 3.4L3 6.6l3.2 3.2M3 6.6h6.2a3.4 3.4 0 0 1 0 6.8H7.4' },
  // the windows' link (_window_button): this window and another one of the app keep one selection; two panes,
  // lit whole in both linked windows and dim while unlinked.
  // The last of these buttons, shown whether or not a row is selected, while another window is there or the link is on
  { name: 'window', title: 'Link with the other window (w)', color: 'rgba(255, 255, 255, 0.25)', icon: 'M1.5 3.5h5.5v9h-5.5zM9 3.5h5.5v9H9z' },
]
const _BIN_BUTTONS_CSS = `
.todoer-bin-buttons { position: fixed; left: 0; bottom: 0; z-index: 88; display: flex; align-items: center; gap: 18px; box-sizing: border-box; height: 44px; margin: 0; padding: 0 14px; border-top: 1px solid rgba(255, 255, 255, 0.09); border-right: 1px solid rgba(255, 255, 255, 0.09); border-top-right-radius: 12px; background: rgba(17, 17, 17, 0.65); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); box-shadow: 0 0 12px rgba(0, 0, 0, 1) }
.todoer-bin-buttons[hidden] { display: none }
.todoer-bin-buttons > button { flex: none; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: #222; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); cursor: pointer; -webkit-tap-highlight-color: transparent }
.todoer-bin-buttons > button:focus { outline: none }
.todoer-bin-buttons > button:focus-visible { outline: 1px solid currentColor }
.todoer-bin-buttons > button:active { background: #555 }
.todoer-bin-buttons > button > svg { display: block; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; pointer-events: none }
.todoer-bin-buttons > button.fill > svg { fill: currentColor; stroke: none }
`

// draws the buttons for the item the box names (null: none of a row's; the windows' link has its
// button with or without a row, _window_button), from the first mounted list that
// holds its row (_bin_row): its bell, then that list's bins, in their order. A row that is not a
// todo's (a reply's) has its bell and none of the bins' buttons (_row_buttons)
function _bin_buttons(target) {
  try {
    _row_keys()
    __bin_buttons(target)
  } catch (e) {
    console.error(`bin buttons: ${e}`) // a fault of these buttons must never stop a list's render
  }
}

// the surfaced bell count the strip last drew for `id`, or 0 where no count was drawn for it:
// read by both the bell button and the `b` key so both act on the notification shown to the owner
function _shown_bell(id) {
  return id != null && window._todoer_bin_bell?.id === id ? window._todoer_bin_bell.count : 0
}

function __bin_buttons(target) {
  const found = target ? _bin_row(target) : null
  const list = found ? null : target ? _todo_list(target) : null
  const snoozed = found ? !!found.widget._snoozed : list == 'snoozed'
  const shown = found ? _row_buttons(found) : list ? _todo_buttons(target, list) : []
  const bell_mark = found?.row.querySelector('mark.waits')
  const reply = !!found?.row.getAttribute('data-waits')
  const has_bell = shown.some(b => b.name == 'bell')
  const came_up = !reply && has_bell ? bell_mark?._came_up ?? _task_state(target)?.surfaced ?? 0 : 0
  window._todoer_bin_bell = target && came_up > 0 ? { id: target.id, count: came_up } : null
  const walk = shown.some(b => b.name in _ROW_STEP) ? _row_sequence() : null
  // (a row button is dim exactly where its press would select nothing)
  const specs = shown.map(b =>
    b.name in _ROW_STEP
      ? { ...b, color: _row_beside(found?.row ?? null, _ROW_STEP[b.name], walk) ? b.color : 'rgba(255, 255, 255, 0.25)', press: () => void (_pressed_item(b.name, target.id) && _row_step(target.id, _ROW_STEP[b.name])) }
      : { ...b, title: b.name == 'snooze' && snoozed ? 'Unsnooze (s)' : b.title, press: () => _bin_press(b.name, target.id) }
  )
  const link = _window_button()
  if (link) specs.push(link)
  // what is drawn, as one text: every render of a list comes through here, and buttons that
  // are the same are left standing (a button replaced between a press's two halves would lose
  // its click). This item's own code is part of it: an update draws them anew, with its presses
  const drawn = JSON.stringify([_todoer?.deephash ?? null, target?.id ?? null, came_up, specs.map(spec => [spec.name, spec.title, spec.color])])
  let piece = document.querySelector('.todoer-bin-buttons')
  // handed over on the window in every case: a strip that is drawn later (its item installed or
  // updated after this) takes them from there and says so (`taken`: the piece of their own goes)
  const changed = window._key_buttons_guests?.drawn !== drawn
  if (changed) window._key_buttons_guests = { drawn, buttons: specs, taken: () => void document.querySelector('.todoer-bin-buttons')?.remove() }
  const strip = window._key_buttons
  if (typeof strip?.guest == 'function') {
    piece?.remove() // a piece of their own, drawn before the strip could take them
    if (changed) strip.guest()
    return
  }
  if (!specs.length && !piece) return
  let style = document.getElementById('todoer-bin-buttons-style')
  if (!style) {
    style = document.createElement('style')
    style.id = 'todoer-bin-buttons-style'
    document.head.appendChild(style)
  }
  if (style.textContent != _BIN_BUTTONS_CSS) style.textContent = _BIN_BUTTONS_CSS // an update of this item brings its look
  if (!piece) {
    piece = document.createElement('div')
    piece.className = 'todoer-bin-buttons'
    piece.hidden = true
    document.body.appendChild(piece)
  }
  if (piece._drawn !== drawn) {
    piece._drawn = drawn
    piece.replaceChildren(
      ...specs.map(spec => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = spec.fill ? spec.name + ' fill' : spec.name
        button.style.color = spec.color
        button.title = spec.title
        button.setAttribute('aria-label', spec.title)
        button.innerHTML = `<svg viewBox="0 0 ${spec.box ?? 16} ${spec.box ?? 16}" aria-hidden="true"><path d="${spec.icon}"/></svg>`
        button.onmousedown = e => e.preventDefault() // the focus stays where it is (an open editor keeps its caret)
        button.onclick = spec.press
        return button
      })
    )
  }
  _bin_buttons_room()
}

// watches each mounted widget's own .super-container for class toggles (.hidden on a folded
// pinned dot item or hideIndex cutoff) so the strip's up/down arrows stay current across fold
// and unfold without observing the rest of the page; one page-level observer, kept across code
// updates by delegating to window._todoer_vis_refresh
function _watch_list_visibility(widget) {
  if (typeof window == 'undefined' || typeof MutationObserver != 'function') return
  const host = widget?.closest?.('.super-container')
  if (!host || host.closest?.('#cache-div, .column.hidden')) return
  if (window._todoer_vis_refresh?._fn !== _bin_buttons) {
    const refresh = w => {
      if (w && typeof _watch_list_visibility == 'function') _watch_list_visibility(w)
      if (typeof _sync_marks == 'function') _sync_marks()
      if (typeof _bin_buttons == 'function') _bin_buttons(_selected_item())
    }
    refresh._fn = _bin_buttons
    window._todoer_vis_refresh = refresh
  }
  let state = window._todoer_vis_obs
  if (!state) {
    state = { seen: new WeakSet(), obs: new MutationObserver(() => void window._todoer_vis_refresh?.()) }
    window._todoer_vis_obs = state
  }
  if (state.seen.has(host)) return
  state.seen.add(host)
  state.obs.observe(host, { attributes: true, attributeFilter: ['class'] })
}

// the lists that are on the page: a widget that the app has parked while its item is not drawn
// (in cache-div), in the hidden measurement column (.column.hidden), or in a folded or cutoff
// item (.super-container.hidden) is none of them; a visible list scrolled out of the viewport
// has none of those ancestors and stays included
function _mounted_lists() {
  return [...document.querySelectorAll('.todoer-widget')].filter(widget => {
    if (typeof _watch_list_visibility == 'function') _watch_list_visibility(widget)
    return !widget.closest?.('#cache-div, .column.hidden, .super-container.hidden')
  })
}

// the first mounted list that holds the item's row, with that row: { widget, row }, or null
function _bin_row(item) {
  let found = null
  _mounted_lists().forEach(widget => {
    const row = found ? null : [...widget.querySelectorAll('.list-item-container')].find(e => e.getAttribute('data-id') == item.id)
    if (row) found = { widget, row }
  })
  return found
}

// the window's switch as a button, or null where it is not shown: it is shown while this window
// could be linked (another window of the app is there) or is (its switch is on), whether or not
// a row is selected: what it does reaches beyond the rows (the owner, 2026-11-25: "the toggle
// button should probably only appear when there is a second window that could be linked. and
// since it takes effect outside of todoer items, it should probably be detached from its
// buttons and remain visible even when no todoer item is selected")
function _window_button() {
  if (_notify_fixed_view()) return null
  const linked = _send_linked()
  if (!linked && !_send_peer()) return null
  const spec = _BIN_BUTTONS.find(b => b.name == 'window')
  return { ...spec, ...(linked ? { title: 'Linked with the other window. Unlink (w)', color: 'rgb(102, 255, 255)' } : {}), press: () => void _send_press() }
}

// the row buttons and their keys: which way each goes in its list
const _ROW_STEP = { up: -1, down: 1 }

// the keys of a row's other buttons, by the key's code: the first letter of what each button
// says, x for the delete button (the owner, 2026-11-25, of this suggestion: "i want them")
const _BIN_KEYS = { KeyA: 'agent', KeyD: 'done', KeyS: 'snooze', KeyX: 'cancel', KeyB: 'bell', KeyH: 'history', KeyU: 'owner' }

// the github history address the pusher opens for an item (pusher.js, _on_command_history),
// read from its own store without saving or prompting; null where the pusher item is absent or
// its commands are off, where it has no destination of two path-safe names, or where the item is
// not saved yet (a destination is enough: the pusher's own history command asks for no token)
function _history_url(item) {
  if (!item?.saved_id) return null
  const pusher = _item('#pusher', { silent: true })
  if (!pusher) return null
  if (Array.isArray(pusher.tags_raw) && (pusher.tags_raw.includes('#_debug') || !pusher.tags_raw.includes('#_listen'))) return null
  const dest = pusher._global_store?.dest
  if (typeof dest != 'string') return null
  // two path-safe name parts alone: a query, a fragment or a dot segment in the destination would
  // change which page the address opens (the pusher's own prompt takes any two nonempty parts)
  const parts = dest.trim().split('/')
  if (parts.length != 2 || !parts.every(part => /^[A-Za-z0-9._-]+$/.test(part) && part != '.' && part != '..')) return null
  const [owner, repo] = parts
  return `https://github.com/${owner}/${repo}/commits/master/items/${item.saved_id}.md`
}

// the buttons that the row of a listed item has ({ widget, row }, from _bin_row), in their order:
// the two row buttons, its bell where it has one, history right after the bell on a row of an item
// an agent wrote where the pusher has a destination and the item is saved, then its list's bins.
// A row that is not a todo's has none of the bins' buttons: its bell clears it, and a row with no
// bin buttons is seen to be a notification and no todo (the owner, 2026-11-25: "let's try removing
// both the button and its shortcut, and let's remove the delete button (and shortcut) also",
// "i need some way to tell when i'm looking at a notification and not a todo item"). A drop of
// such a row on the done or the delete bin does what it did
function _row_buttons(found) {
  const waits = found.row.getAttribute('data-waits')
  const history_item = waits == 'item' ? _item(found.row.getAttribute('data-id'), { silent: true }) : null
  return _BIN_BUTTONS.filter(b =>
    b.name == 'window'
      ? false
      : b.name in _ROW_STEP
        ? true
        : b.name == 'bell'
          ? !!found.row.querySelector('mark.waits')
          : b.name == 'history'
            ? !!_history_url(history_item)
            : !waits && !!found.widget.querySelector('.bin.' + b.name)
  )
}

// which list a todo belongs to by its own state ('main', 'snoozed', or 'delegated'), or null for
// an item that is no todo (by its visible tags, skipping menu items, as __render decides)
function _todo_list(item) {
  if (!item?.tags_visible?.includes('#todo') || item.tags?.includes('#menu')) return null
  // (no list has a row for an item whose todo tag yields no snippet, a tag written with capitals
  // or with a suffix: it gets no buttons of a list either)
  if (!_extract_todo_snippet(item)) return null
  const state = _task_state(item)
  if (_list_of(item, state) == 'delegated') return 'delegated'
  return item._global_store?._todoer?.snoozed ? 'snoozed' : 'main'
}

// the buttons for a todo whose list is not on the page, in their order: the two row buttons
// (drawn dim where the walk's sequence is empty), its bell where _bell rings for it, then the bins
// of its list (_LIST_BINS)
function _todo_buttons(item, list = _todo_list(item)) {
  if (!list) return []
  const bins = _LIST_BINS[list]
  const state = _task_state(item)
  const rings = !!_bell(item, state, list == 'delegated' ? 'delegated' : 'main')
  return _BIN_BUTTONS.filter(b => (b.name in _ROW_STEP ? true : b.name == 'bell' ? rings : bins.includes(b.name)))
}

// what the done bin logs for a todo item when no row on the page holds it: the same text
// __render builds for container._log_text (snooze time and parent prefix, then the visible
// snippet and any chat-todo question)
function _todo_log_text(item, snoozed = false) {
  const state = _task_state(item)
  const parent = state?.parent ? _parent_of(state.parent) : null
  const text = _extract_todo_snippet(item) ?? ''
  const question = text ? _row_question(item, text) : null
  const first_lines =
    (snoozed && item._global_store?._todoer?.snoozed ? new Date(item._global_store._todoer.snoozed).toLocaleString() + '\n' : '') +
    (parent ? `child of ${parent}\n` : '')
  const asked = question ? _visible(question.raw) + (question.more ? ' …' : '') : ''
  const shown = text ? (_visible(text) + (asked ? ' ' + asked : '')).replace(/\s+/g, ' ') : item.name
  return (first_lines + shown).replace(/\s+/g, ' ')
}

// the mounted rows in page order, and the walk's sequence among them: every row that carries a
// bell (mark.waits, in any mounted list) and every row of the main list (a mounted widget that is
// neither snoozed nor delegated), each once, in document order
function _row_sequence() {
  const all = []
  const seq = []
  const seen = new Set()
  for (const widget of _mounted_lists()) {
    const main = !widget._snoozed && !widget._delegated
    for (const row of widget.querySelectorAll('.list .list-item-container[data-id]')) {
      const id = row.getAttribute('data-id')
      const item = id ? _item(id, { silent: true }) : null
      const ok = !!item && (main || !!row.querySelector('mark.waits')) && !seen.has(id)
      if (ok) seen.add(id)
      const entry = { row, id, item, in_seq: ok }
      all.push(entry)
      if (ok) seq.push(entry)
    }
  }
  return { all, seq }
}

// the item the walk moves to from `row` (a mounted row, or null with no row on the page) for
// `by` (1: j / down, -1: k / up), cycling over _row_sequence()'s sequence: from a row in it to
// the next/previous (wrapping at the ends), from a row outside it to the nearest after/before
// (wrapping past the ends), and from no row to the first/last; null where nothing else stands
// in the sequence (empty sequence, or its only item is already selected)
function _row_beside(row, by, walk = _row_sequence()) {
  const { all, seq } = walk
  if (!seq.length) return null
  if (!row) return (by > 0 ? seq[0] : seq[seq.length - 1]).item
  const cur_id = row.getAttribute('data-id')
  const idx = seq.findIndex(e => e.row === row || (cur_id && e.id === cur_id))
  if (idx >= 0) {
    if (seq.length < 2) return null
    if (by > 0) return (seq[idx + 1] ?? seq[0]).item
    return (seq[idx - 1] ?? seq[seq.length - 1]).item
  }
  const pos = all.findIndex(e => e.row === row)
  if (pos < 0) return (by > 0 ? seq[0] : seq[seq.length - 1]).item
  for (let i = pos + by; i >= 0 && i < all.length; i += by) {
    if (all[i].in_seq) return all[i].item
  }
  return (by > 0 ? seq[0] : seq[seq.length - 1]).item
}

// the selection moves to the next item of the walk (_row_beside, for the up and the down button):
// from the item's mounted row, or from no row on the page to the sequence's first/last; nothing
// where the walk has nowhere to go. True where it moved
function _row_step(id, by) {
  const item = _item(id, { silent: true })
  const next = item ? _row_beside(_bin_row(item)?.row ?? null, by) : null
  if (!next) return false
  _select_item(next)
  return true
}

// the keys j and k, handed on by the app where nobody took them (window._on_key): they cycle in
// page order through _row_sequence()'s union of every row carrying a bell (in any mounted list)
// and every row of the main list (the owner, 2026-11-25: "cycle through the union of notified
// items ... and main list items, in order of their visibility on the page", "they should cycle,
// not stop"). From a row outside the sequence, j goes to the nearest row of the sequence after it
// and k to the nearest before (wrapping past the ends); with no row on the page for what the box
// names, j selects the first row of the sequence and k its last. Where nothing else stands in the
// sequence, the key is still the rows' if a row is selected and goes on to any prior hook if none
// is. And the keys of a row's other buttons (_BIN_KEYS): with a listed row or off-list todo named
// by the box that has the key's button, the key is that button's press, once for a key held down;
// otherwise the key is not the rows' and goes on to whoever held the hook before. So the bins'
// keys are a todo's alone: a reply's row has its bell and no other of these buttons (_row_buttons),
// and the done key never becomes the way to clear a bell (the owner, 2026-11-25: "i don't want to
// accidentally remove an actual task row, since clearing a notification is a much lighter
// operation"). Only a plain press counts, and never while a field has the focus. True where the
// key was the rows'
function _on_row_key(key, e) {
  const by = key == 'KeyJ' ? 1 : key == 'KeyK' ? -1 : 0
  const bin = !by && Object.hasOwn(_BIN_KEYS, key) ? _BIN_KEYS[key] : null
  const win = key == 'KeyW' // the window's switch, wherever its button shows
  if ((!by && !bin && !win) || e?.metaKey || e?.ctrlKey || e?.altKey || e?.shiftKey) return false
  const active = document.activeElement
  if (active && (active.isContentEditable || ['TEXTAREA', 'INPUT', 'SELECT'].includes(active.tagName))) return false
  if (bin) {
    const { named, found, shown } = _row_now()
    if (!shown.some(b => b.name == bin)) {
      // a silent bridge update can raise a todo's bell while no bell is drawn (off-list strip or
      // mounted row); a plain b still forwards, and refreshes what the owner sees for the next press
      if (bin == 'bell' && !e?.repeat && shown.length && !found?.row.getAttribute('data-waits') && _bell(named)) {
        if (_mounted_lists().length) _rerender_todoer_widgets()
        else _bin_buttons(named)
      }
      return false
    }
    if (!e?.repeat) _bin_press(bin, named.id)
    return true
  }
  if (win) {
    if (_notify_fixed_view() || (!_send_linked() && !_send_peer())) return false
    if (!e?.repeat) _send_press()
    return true
  }
  const named = _selected_item()
  const found = named ? _bin_row(named) : null
  const next = _row_beside(found?.row ?? null, by)
  if (!next) return !!found // (with a row selected, nothing to go to is still the rows'; with none, it goes on)
  _select_item(next)
  return true
}

// what the rows' keys act on at this moment, as _on_row_key reads it: the selected item
// (`named`: this window's own target, else the item the linked window shows where listed here),
// its row in the first mounted list that holds it (`found`: { widget, row }, or null),
// the buttons it has (`shown`: its row's, or those of a todo whose list is not on the page — with
// its bell included only when drawn for this item on the strip, so a silent arrival stays ringing
// until shown), and whether it is a snoozed todo (by its row's list, or by its own state where it
// has no row)
function _row_now() {
  const named = _selected_item()
  const found = named ? _bin_row(named) : null
  const list = named && !found ? _todo_list(named) : null
  const drawn_bell = typeof _shown_bell == 'function' && _shown_bell(named?.id) > 0
  const shown = found ? _row_buttons(found) : list ? _todo_buttons(named, list).filter(b => b.name != 'bell' || drawn_bell) : []
  return { named, found, shown, snoozed: found ? !!found.widget._snoozed : list == 'snoozed' }
}

// whether the key of a button is the rows' now: the selected row has the button, or the selected
// todo whose list is not on the page has it
const _row_has = name => _row_now().shown.some(b => b.name == name)

// whether a press of the named button would be CARRIED OUT now, for the selected item: it has
// the button (_row_has: the key is the rows' then), no earlier press is still being carried out
// (_bin_press takes one at a time, and says so in the console), and the press's own action would
// not refuse it out of hand (_BIN_REFUSAL: an unsaved edit in the item's open editor for the
// four presses of _BIN_DRAFT; for a delegation also a todo that is not saved yet and a take-back
// not yet acknowledged). It reads and changes nothing: the shortcuts' menu asks it, and a press
// refuses by these same functions
function _row_can(name) {
  if (!_row_has(name) || window._todoer_bin_busy) return false
  return !(Object.hasOwn(_BIN_REFUSAL, name) && _BIN_REFUSAL[name](_selected_item()))
}

// whether j (`by` 1) or k (-1) would select another row now, as _on_row_key decides it
// (_row_beside: the walk through the rows with a bell and the main list's): from the selected row
// (`selected`), or with no row selected
function _row_goes(by, selected) {
  const found = _row_now().found
  return !!found == !!selected && !!_row_beside(found?.row ?? null, by)
}

// what the menu of the shortcuts item lists for this item (shortcuts.js: an item writes a list
// under a section's name on the window; without that item nothing reads it). Each entry's test
// says whether its key would do something now (_row_goes: there is a row to go to; _row_can: the
// press would be carried out): the menu opens on those alone. The words (`when`) say the
// standing condition: which row, of which list, an unsaved edit (delegating is
// every list's, done, delete and snooze the main and the snoozed list's, taking back the
// delegated list's: the lists' bins). They leave out the one
// that passes by itself: while an earlier press on a row is still being carried out (its
// dialog open, a delegation under way) no other button's key is carried out
const _ROW_SAVED = ', with no unsaved edit in it'
const _ROW_SHORTCUTS = [
  { keys: 'j', does: 'the next row', when: 'a row is selected: through the rows with a bell and the main list, round and round', active: () => _row_goes(1, true) },
  { keys: 'j', does: 'the first row', when: 'no row is selected: of the rows with a bell and the main list', active: () => _row_goes(1, false) },
  { keys: 'k', does: 'the previous row', when: 'a row is selected: through the rows with a bell and the main list, round and round', active: () => _row_goes(-1, true) },
  { keys: 'k', does: 'the last row', when: 'no row is selected: of the rows with a bell and the main list', active: () => _row_goes(-1, false) },
  { keys: 'a', does: 'delegate to the agent', when: 'a todo is selected' + _ROW_SAVED, active: () => _row_can('agent') },
  { keys: 'd', does: 'done', when: 'a todo of the main or the snoozed list is selected' + _ROW_SAVED, active: () => _row_can('done') },
  { keys: 's', does: 'snooze', when: 'a todo of the main list is selected', active: () => _row_can('snooze') && !_row_now().snoozed },
  { keys: 's', does: 'unsnooze', when: 'a snoozed todo is selected', active: () => _row_can('snooze') && _row_now().snoozed },
  { keys: 'x', does: 'delete, after a question', when: 'a todo of the main or the snoozed list is selected' + _ROW_SAVED, active: () => _row_can('cancel') },
  { keys: 'b', does: 'clear the bell', when: 'a row or todo with a bell is selected', active: () => _row_can('bell') },
  { keys: 'h', does: 'open item history', when: 'a row of an item an agent wrote is selected, and the pusher has a destination', active: () => _row_can('history') },
  { keys: 'u', does: 'take back from the agent', when: 'a delegated todo is selected' + _ROW_SAVED, active: () => _row_can('owner') },
  // (the window's key, as _on_row_key and _send_press decide it: no row need be selected)
  { keys: 'w', does: 'link with the other window', when: 'another window of the app is open, and this window is not linked', active: () => !_send_linked() && !!_send_peer() },
  { keys: 'w', does: 'unlink from the other window', when: 'this window is linked with the other window', active: () => _send_linked() },
]

// takes the app's key hook for the rows' keys, once per evaluation of this item; a key that is
// not the rows' goes on to whoever held the hook before
function _row_keys() {
  if (typeof window == 'undefined') return
  ;(window._shortcuts ??= {}).todoer = _ROW_SHORTCUTS // (what the shortcuts item's menu lists for this item)
  if (window._on_key?._todoer_keys === _on_row_key) return
  const before = window._on_key?._todoer_keys ? window._on_key._todoer_before : window._on_key
  const hook = (key, e) => (_on_row_key(key, e) ? void e?.preventDefault?.() : typeof before == 'function' ? before(key, e) : undefined)
  hook._todoer_keys = _on_row_key
  hook._todoer_before = before
  window._on_key = hook
}

// the item of the row that follows the given place in a list, else of the one before it: what
// the box names once the row that stood there has left the list
function _next_listed(list, index) {
  const row = list?.children?.[index] ?? list?.children?.[index - 1]
  const id = row?.getAttribute?.('data-id')
  return id ? _item(id, { silent: true }) : null
}

// after an action that took an item out of its list (a drop of its row on a bin, a press of a
// bin's button), the box names the item that followed it, so that the next action is one press
// away (the owner, 2026-11-24: "when i take an action (via drag or button) on a todoer item,
// select the next one"). `outcome` is the action's own result or a promise of it, and only
// true counts: a refusal, a declined question and a row that stays where it is change nothing.
// The selection is the gesture's own: its intent is taken here, at the gesture, and carried over
// the action's wait (the app's window._carry_input, as _carried_write does for a delegation's
// write). Made after a wait without it, the selection came from no input, and the app wrote it
// over the history's entry in place of a step of its own, so that Back passed the item over.
// For an awaited action (`outcome` is a thenable: delegation, take-back, snooze picker), what the
// box says is read here too, at the gesture: where the box says something else when the wait ends,
// its owner has gone on meanwhile, and that selection stays (the review, 2026-11-24: with a
// delegation held, Up selected another row, and the selection then jumped). Synchronous outcomes
// (delete, complete, unsnooze, reply bell) have no wait for the owner to navigate during, and
// Svelte flushes deleteItem's own clearing of editorText to MindBox.elem.value in a microtask
// ahead of Promise.resolve(outcome).then(...)
function _select_next(next, outcome) {
  const select = item => void _select_item(item)
  const carried = typeof window._carry_input == 'function' ? window._carry_input(select) : select
  const waited = typeof outcome?.then == 'function'
  const said = waited ? MindBox.get() : null
  const sel = waited ? _selected_item(undefined, { mounted: false })?.id ?? null : null
  return Promise.resolve(outcome)
    .catch(() => false)
    .then(ok => {
      const same = !waited || (MindBox.get() === said && (_selected_item(undefined, { mounted: false })?.id ?? null) === sel)
      const item = ok === true && next && same ? _item(next.id, { silent: true }) : null
      if (item) carried(item)
      return ok
    })
}

// the item a button was drawn for, where it is still the selected item at the press (own target
// or linked-window selection). The buttons are drawn when the app reports a search, which for a
// name typed into the box is half a second after the typing: until then the buttons on the page
// are those of the item selected before, and a press on them is not taken, and says so (the
// review, 2026-11-24: Done completed the earlier item). Null where another item or none is selected
function _pressed_item(name, id) {
  const named = _selected_item()
  if (named?.id === id) return named
  console.warn(`todoer: the press on "${name}" was not taken: the box ${named ? 'names another item now' : 'no longer names its item'}`)
  return null
}

// a button's press: the action for the item as its row stands now (the row may have gone, or
// moved to another list, since the buttons were drawn), one at a time: a second press while the
// first's dialog or save is open does nothing
function _bin_press(name, id, bell_count) {
  // a press that is not taken says so in the console: nothing else would tell its owner
  if (window._todoer_bin_busy) return void console.warn(`todoer: the press on "${name}" was not taken: an earlier press is still being carried out`)
  const item = _pressed_item(name, id)
  if (!item) return
  const found = _bin_row(item)
  const list = found ? null : _todo_list(item)
  if (!found && !list) return void console.warn(`todoer: the press on "${name}" was not taken: its item is in no list`)
  if (!found && !_todo_buttons(item, list).some(b => b.name == name))
    return void console.warn(`todoer: the press on "${name}" was not taken: its list has no "${name}" button now`)
  window._todoer_bin_busy = true
  // the row that follows is selected after a press that takes the row out of its list, and only
  // then (the owner, 2026-11-24: "it should only advance if the action removes the row"). The
  // bell's press removes a reply's row (it waits by its bell alone) and leaves a todo's row
  // where it is, selected; a delegation asked again from the delegated list leaves its row in
  // that list (the review, 2026-11-24); and with no row on the page there is nothing to follow
  const rows = found ? [...(found.row.parentElement?.children ?? [])] : []
  const stays = !found || name == 'history' || (name == 'bell' && !found.row.getAttribute('data-waits')) || (name == 'agent' && !!found.widget._delegated)
  const next = stays ? null : _next_listed({ children: rows.filter(row => row != found.row) }, rows.indexOf(found.row))
  if (name == 'bell' && bell_count == null && typeof _shown_bell == 'function') bell_count = _shown_bell(item.id)
  let acted
  try {
    acted = _bin_act(name, item, found?.row ?? null, found ? !!found.widget._snoozed : list == 'snoozed', bell_count) // within the press: a delegation reads the gesture
  } finally {
    acted = _select_next(next, acted).then(() => {
      window._todoer_bin_busy = false
      if (!found || name == 'bell' || name == 'history') _bin_buttons(_selected_item())
    })
  }
  return acted // settles when the press's work is done: the button that took it stays lit until then
}

// what a drop of the item's row on the named bin does (the list's onEnd in __render), without a
// row to move: nothing is put back after a refusal, and the list is drawn again by the item's
// own change. `row` is the row the list shows for the item (or null when the todo's list is not
// on the page, in which case the bell and log text come from the item itself) and `snoozed`
// whether its list is the snoozed one. A row that is not a todo's has the done and the delete
// bin alone, as its drop. The bell's press clears only a count that was drawn for the todo (its
// row's own bell or the strip's _shown_bell record): where no count was drawn, it clears nothing
// and lets _bin_press redraw the strip so a newly arrived bell stays ringing for the next press;
// a reply or agent-written item's row (data-waits) clicks its row's own bell as before
function _bin_act(name, item, row, snoozed, bell_count) {
  if (name == 'bell') {
    if (row) {
      const bell = row.querySelector('mark.waits')
      if (!bell) return false
      const count = bell_count > 0 ? bell_count : bell._came_up ?? 0
      if (row.getAttribute('data-waits') || !(count > 0) || (bell._came_up ?? _task_state(item)?.surfaced) === count) {
        bell.click()
        return true
      }
      const state = _task_state(item)
      if (!_bell(item, state)) return false
      if (!_clear_bell(item, Math.min(count, state.surfaced))) return false
      _rerender_todoer_widgets()
      return true
    }
    if (!(bell_count > 0)) return false
    const state = _task_state(item)
    if (!_bell(item, state)) return false
    if (!_clear_bell(item, Math.min(bell_count, state.surfaced))) return false
    _rerender_todoer_widgets()
    return true
  }
  if (name == 'history') {
    if (row?.getAttribute('data-waits') != 'item') return false
    const url = _history_url(item)
    if (!url) return false
    window.open(url)
    return true
  }
  if (row?.getAttribute('data-waits')) {
    if (name == 'cancel') return _delete_listed(item, true)
    if (name != 'done' || !_clear_waiting(item, row.getAttribute('data-wait-key'))) return false
    _rerender_todoer_widgets() // the row goes, as after its bell's click (a drop takes the row out itself)
    return true
  }
  if (name == 'agent') return _delegate(item)
  if (name == 'owner') return _takeback(item)
  // (a button's press always asks: by itself the app asks only for an item with a name of its
  // own, and a todo that has none, as `/todo buy milk` makes one, went at one tap; the review,
  // 2026-11-24. A drop on the delete bin asks as the app asks, as it always has)
  if (name == 'cancel') return _delete_listed(item, true)
  if (name == 'done') return _complete_todo(item, row ? row._log_text : _todo_log_text(item, snoozed))
  if (name != 'snooze') return false
  item.global_store._todoer ??= {}
  if (snoozed) return _unsnooze(item, true), true // out of the snoozed list, as the owner's own drag
  return _snooze_dialog().then(answer => (is_number(answer?.time) ? (_snooze(item, answer), true) : false))
}

// whether the item's open editor holds text that is not saved: what a write into the item, or
// its deletion, would lose. The app's own test for unsaved changes compares the same two texts,
// each without the zero-width spaces its editor adds (index.svelte, unsaved). An editor that
// cannot be read counts as holding a draft
function _draft(item) {
  if (!item.editing) return false
  const textarea = item.elem?.querySelector('textarea')
  const bare = text => String(text ?? '').split(String.fromCharCode(0x200b)).join('')
  return !textarea || bare(textarea.value) != bare(item.text)
}

// the presses that such a draft refuses, each with the word its refusal says (_draft_word): they
// write into the item's text, or delete it. A snooze, an unsnooze and the clearing of a bell
// leave the text alone and are carried out over a draft. One table for the refusals and for
// what the shortcuts' menu lists (_row_can), so that the two cannot say different things
const _BIN_DRAFT = { agent: 'delegate', done: 'complete', cancel: 'delete', owner: 'take back' }

// the word for an action refused because of such a draft, or null where there is none (the
// owner, 2026-11-24: refused only when what is typed differs from what is saved)
function _draft_word(item, what) {
  return _draft(item) ? `can not ${what} ${item.name} with unsaved changes: save or cancel your edit first` : null
}

// deletes the item of a row (a drop on the delete bin, a press on the delete button), unless its
// open editor holds a draft; `sure` asks the app's question whatever the item (a row that is not
// a todo's, and every press of the button). True where it was deleted
function _delete_listed(item, sure = false) {
  const word = _delete_refusal(item)
  if (word) {
    alert(word)
    return false
  }
  return (sure ? item.delete(true) : item.delete()) === true
}

// shows the piece of their own where it has buttons and room at the lower left: all of the edge
// without the key buttons, and none where their glass spans the window (a phone, a narrow
// window) or stands in the way
function _bin_buttons_room() {
  const piece = document.querySelector('.todoer-bin-buttons')
  if (!piece) return
  piece.hidden = !piece.childElementCount
  if (piece.hidden) return
  const glass = document.querySelector('.key-buttons-bg:not([hidden])')
  const taken = !glass ? 0 : glass.classList.contains('split') ? (glass.querySelector('.key-buttons-bg-pane')?.getBoundingClientRect().width ?? 0) : Infinity
  piece.hidden = piece.getBoundingClientRect().width > window.innerWidth - taken
}

// start the unsnooze sweep on welcome, and run it again at once when the page shows or hides,
// gains focus or goes online: a return finds a todo whose time passed meanwhile back without
// waiting for the tick (a held sweep stays held: _held observes the gap first), and a hide
// trades the visible delay pending (up to a minute, the one timer the hidden cap does not bound)
// for a hidden one on a new chain: left pending, a delay set by a visible tick just before the
// hide could fall due just as Chrome's intensive throttling starts (a minute after the hide) and
// wait for the next point of its minute grid, one gap of about 120 s and a needless hold (the
// review of 2026-10-23); the listeners once per page (an update of this item re-evaluates the
// script; the first evaluation's keep working), as _start_notifier's
function _on_welcome() {
  _start_sweep()
  if (!window._todoer_bin_buttons) {
    window._todoer_bin_buttons = true
    window.addEventListener('resize', () => void _bin_buttons_room())
  }
  if (!window._todoer_sweeper) {
    window._todoer_sweeper = true
    document.addEventListener('visibilitychange', () => void _start_sweep())
    window.addEventListener('focus', () => void _start_sweep())
    window.addEventListener('online', () => void _start_sweep())
  }
  _start_notifier()
  if (typeof _watch_list_visibility == 'function') document.querySelectorAll('.todoer-widget').forEach(_watch_list_visibility)
  if (typeof _bin_buttons == 'function') _bin_buttons(_selected_item())
}

// the sweep's task, dispatched now: the app's dispatch_task replaces a pending tick of the same
// name and serializes the runs (one in progress finishes first), so a second sweep never runs
// beside it; each run returns the delay to the next (see _sweep_delay)
function _start_sweep() {
  _todoer.dispatch_task('unsnooze', _sweep, 0, SWEEP_PERIOD_MS)
}

// unsnoozes a snoozed todo whose bell rings, under the sweep's own rules (_sweep_step): called
// from _on_global_store_change as soon as this tab observes a ringing bell, and from _sweep
// (passing its pass's step) for one that already stands snoozed with a bell. While a remote
// snapshot is applying, the app holds window._server_current false until the snapshot's lease
// seals (a microtask later), so a direct call that waits there kicks _start_sweep() for the next
// turn once the live signal rises (still gated by _sweep_step). Clears the reminder flag in the
// same store save (`manual = true`) so an early bell-triggered unsnooze within UNSNOOZE_SKEW_MS
// of the deadline never emits an unsnoozed reminder over the actionable notification
function _unsnooze_for_bell(item, step = null) {
  if (!item?._global_store?._todoer?.snoozed) return false
  if (!(item.tags_visible ?? item.tags)?.includes('#todo')) return false
  if (!_bell(item)) return false
  const direct = step == null
  step ??= _sweep_step({ primary: _primary, confirmed: _corpus_current(window), online: navigator.onLine, held: _held() })
  if (step != 'sweep') {
    if (direct && step == 'wait' && !_corpus_current(window)) _start_sweep()
    return false
  }
  _unsnooze(item, true)
  return true
}

// one tick of the unsnooze sweep: every todo whose snooze time passed, or whose bell rings, is
// unsnoozed when the step allows it (_sweep_step), its unsnooze observed at once (the reminder,
// _notify_change: the store's own hook runs from the store's save task, which a throttled hidden
// page runs up to a minute later, 60 s measured; the records keep it to one; a throw of it is
// logged, so that it neither stops the pass, leaving the later due todos snoozed, nor ends the
// task, as the app's dispatch_task ends a task whose function throws), and the delay to the next
// tick is returned, from the clock reading the pass decided by: a second reading after the pass
// saw a time this tick woke a millisecond early for as past and slept to the next minute (60 s late)
function _sweep() {
  const step = _sweep_step({ primary: _primary, confirmed: _corpus_current(window), online: navigator.onLine, held: _held() })
  const now = Date.now()
  const snoozes = [] // the snooze times left
  each(_items(), item => {
    const snoozed = item._global_store?._todoer?.snoozed
    if (!snoozed) return
    const due = step == 'sweep' && now >= snoozed
    if ((due && (_unsnooze(item), true)) || _unsnooze_for_bell(item, step)) {
      try {
        _notify_change(item)
      } catch (e) {
        console.error(`todoer: unsnooze reminder failed for ${item.name}: ${e?.message ?? e}`)
      }
    } else snoozes.push(snoozed)
  })
  return _sweep_delay({ now, snoozes, hold_until: _todoer.store.hold_until, hidden: document.visibilityState == 'hidden' })
}


// ---- tasks (design notes/design/mind_task_agents.md, 2.2 and 2.3) -------------------------

// the task projection the bridge writes into the item's store, or null for a todo the bridge
// never held ({held, reason, epoch, rev, updated, worktree, phase, acked}); `worktree` is the
// worktree of the task's proposal: the bridge's own, or an agent's own that its hand-back named
function _task_state(item) {
  const state = item._global_store?._agent?.state
  return state && typeof state == 'object' ? state : null
}

// this tab's pending commands by item id ({id, kind}): the overlay from the enqueue until the
// bridge's `acked` names the id (a stale, refused, or invalidated disposition clears it too)
const _pending_commands = () => (_todoer.store.pending ??= {})
const SAVE_WAIT_MS = 30_000 // /delegate text waits this long for the created todo's save
const SAVE_POLL_MS = 250 // polled as the widget's detect_save task polls

// where a todo belongs (design 2.2; projects: the vault's notes/design/mind_project_agent.md 2.4
// and 4): the pending command first (a take-back puts the item in the main list, a delegate in
// the delegated list); then an agent-held item: a PROJECT asking (`question`), blocked or out of
// budget goes to the main list (the owner must act while its work continues), else delegated;
// then an owner-held item: a project's bound child (`parent`) stays in the delegated list (its
// parent decides), else main
function _task_list(state, pending, parent_state = null) {
  if (pending && !state?.acked?.[pending.id]) return pending.kind == 'takeback' ? 'main' : 'delegated'
  if (state?.held == 'agent') return state.project && ['question', 'blocked', 'budget'].includes(state.reason) ? 'main' : 'delegated'
  if (!state?.parent) return 'main'
  // a bound child (the vault's project design 2.9): its parent decides on it, so it sits in the
  // delegated list, EXCEPT in the two states only the owner can resolve: a proposal on a project
  // without a standing /land (the owner accepts it on the child), and blocked after a FINAL
  // refusal of its landing (the protected-path guard, a conflict: the owner's review)
  if (state.reason == 'proposal' && !parent_state?.standing_land) return 'main'
  if (state.reason == 'blocked' && state.final) return 'main'
  return 'delegated'
}

// a task row's decorations over its linked html: the marker linked to its worktree's review
// FIRST (design 2.4: the link reads the row's start, `#todo [word]`, so nothing may precede it),
// then a named item's label (_row_label) as a tag mark, the form the row's tag pass gives every
// tag (the render's mark wiring gives it the tag click), then a child's ↳ prefix (the vault's
// project design 2.7); presentation only
function _decorate_row(html, text, state, anchor_builder, parent, label = null) {
  const marker = state?.worktree ? _marker_of(text) : null
  if (marker) {
    const anchor = anchor_builder?.(state.worktree, marker.word, `${state.worktree} · its changes against main in VS Code`)
    if (anchor) html = _link_marker(html, marker, anchor)
  }
  if (label) html = `<mark>${_.escape(label)}</mark> ${html}`
  return parent ? '↳ ' + html : html
}

// the label a row shows FIRST when its item is NAMED (the app's name: the unique label when the
// item has one, else the id reference): the row's click targets a named item by its label (since
// 2026-09-26), under which the app lists its children, and a suffix snippet (from the #todo tag
// on) never shows it. The label as the owner wrote it (`item.label` is the app's case-preserving
// text; a label is the text's first VISIBLE tag, so nothing hidden is shown); null for an unnamed
// item (its label shared, or none) or when the row already starts with the label as a whole tag
// (a prefix snippet that begins where the text does, or the label #todo itself)
function _row_label(item, shown) {
  const label = item.label
  if (!label || item.name != label) return null // unnamed: the name is the id reference
  const head = shown.substring(0, label.length)
  const rest = shown.substring(label.length)
  if (head.toLowerCase() == label.toLowerCase() && /^(?:$|[#\s<>&?!,.;:"'`(){}\[\]])/.test(rest)) return null
  return label
}

// a row's tooltip: the snippet in its lines, each by the row's own rule of what is visible
// (_visible). A line that the rule leaves empty goes (it held only hidden parts), blank lines
// go at the two ends, and the ellipsis stands only where the truncation left out something
// visible (`head`, `tail`: what it left out, see _extract_todo_snippet)
function _row_title(snippet, { head = '', tail = '' }) {
  // a text's lines by that rule: those that show something, and those that were blank already
  const lines = text => text.split('\n').flatMap(line => (_visible(line).trim() || !line.trim() ? [_visible(line)] : []))
  const shows = text => lines(text).some(line => line.trim())
  const kept = lines(snippet.slice(head ? 2 : 0, tail ? -2 : undefined)) // without the truncation's own marks
  while (kept.length && !kept[0].trim()) kept.shift()
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop()
  return (shows(head) ? '… ' : '') + kept.join('\n') + (shows(tail) ? ' …' : '')
}

// the parent project's snippet for a child's tooltip (the item resolved silently), or its id
function _parent_of(id) {
  const parent = _item(id, { silent: true })
  const snippet = parent ? _extract_todo_snippet(parent) : null
  return snippet ? snippet.replace(/\s+/g, ' ').trim() : id
}

// a coarse age as of now (`<1m`, `5m`, `2h`, `3d`), or `?` without a projection
function _age(updated, now) {
  if (!updated) return '?'
  const s = Math.max(0, Math.floor((now - updated) / 1000))
  if (s < 60) return '<1m'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h'
  return Math.floor(s / 86400) + 'd'
}

// coarse time left until a snooze ends, rounded up (`<1m`, `1m`..`60m`, `2h`..`24h`, `2d`..),
// `<1m` once passed, or '' without a snooze time
function _snooze_left(until, now) {
  if (!(typeof until == 'number' && Number.isFinite(until) && until > 0)) return ''
  const ms = until - now
  if (ms < 60_000) return '<1m'
  if (ms <= 3_600_000) return Math.ceil(ms / 60_000) + 'm'
  if (ms <= 86_400_000) return Math.ceil(ms / 3_600_000) + 'h'
  return Math.ceil(ms / 86_400_000) + 'd'
}

// the rendered cost (the twin of the vault's format_money, design 9.6): the known sum, `+?`
// when some paid work's cost is unknown, `$?` when only unknown costs exist; then the
// subscription runtime's share as the chat footer's qualifier (` (sub)` when every known
// dollar is the runtime's, ` (sub $2.00)` for a part, nothing when none is); '' when all are zero
function _cost_text(cost, sub, unknown) {
  const known = typeof cost == 'number' && Number.isFinite(cost) && cost > 0
  const has_unknown = typeof unknown == 'number' && Number.isFinite(unknown) && unknown > 0
  // the cents rule of the vault's format_cost (the scaled float, rounded half-up): a bare
  // toFixed(2) rounds the exact binary value, so 1.115 would give $1.11 here and $1.12 there,
  // and the all/part decision below would flip with it
  const cents = x => (Math.floor(x * 100 + 0.5) / 100).toFixed(2)
  if (known) {
    const total = cents(cost)
    let text = '$' + total + (has_unknown ? '+?' : '')
    const sub_val = typeof sub == 'number' && Number.isFinite(sub) && sub > 0 ? sub : 0
    const sub_text = sub_val > 0 ? cents(sub_val) : '0.00'
    const all = sub_val >= cost || sub_text == total
    if (sub_text != '0.00') text += all ? ' (sub)' : ' (sub $' + sub_text + ')'
    return text
  }
  return has_unknown ? '$?' : ''
}

// the row's stats suffix (design 9.6): ` · 2w · $14.50` from the projection's stats (workers
// started, the summed nominal cost; a project's active children ahead, ` · 3c · 5w · $41.20`,
// the vault's project design 2.5), nothing for a projection without them
function _stats_suffix(stats) {
  if (!stats || typeof stats != 'object') return ''
  const parts = []
  // a project's active children first (the vault's project design 2.5), then the workers
  if (typeof stats.children == 'number' && stats.children > 0) parts.push(stats.children + 'c')
  if (typeof stats.workers == 'number' && stats.workers > 0) parts.push(stats.workers + 'w')
  const cost = _cost_text(stats.cost, stats.sub, stats.unknown)
  if (cost) parts.push(cost)
  return parts.length ? ' · ' + parts.join(' · ') : ''
}

// the age mark's tooltip: the absolute time of the last state change, the first delegation,
// the next wake (when armed), and who worked on the todo (design 9.6: stats.agents)
function _age_title(updated, stats, wake = undefined) {
  const lines = [updated ? new Date(updated).toLocaleString() : 'not acknowledged yet']
  if (stats && typeof stats == 'object' && typeof stats.since == 'number' && stats.since > 0)
    lines.push('delegated ' + new Date(stats.since).toLocaleString())
  if (typeof wake == 'number' && wake > 0) lines.push('next wake ' + new Date(wake).toLocaleString())
  if (stats && typeof stats == 'object' && Array.isArray(stats.agents)) {
    const nonneg = x => typeof x == 'number' && Number.isFinite(x) && x >= 0
    for (const entry of stats.agents) {
      if (!Array.isArray(entry) || (entry.length != 3 && entry.length != 6)) continue
      const [raw_name, raw_model, count] = entry
      if (typeof raw_name != 'string' || typeof raw_model != 'string') continue
      if (!Number.isInteger(count) || count <= 0) continue
      let cost_str = ''
      if (entry.length == 6) {
        const [, , , cost, sub, unknown] = entry
        if (!nonneg(cost) || !nonneg(sub) || !nonneg(unknown)) continue
        cost_str = _cost_text(cost, sub, unknown)
      }
      const name = raw_name.replace(/\s+/g, ' ').trim()
      const model = raw_model.replace(/\s+/g, ' ').trim()
      let line
      if (!name && !model) {
        line = 'and ' + count + (count == 1 ? ' other' : ' others')
      } else {
        const label = name && model ? name + ' · ' + model : name || model
        line = count > 1 ? label + ' ×' + count : label
      }
      lines.push(cost_str ? line + ' · ' + cost_str : line)
    }
  }
  return lines.join('\n')
}

// a project's next wake as a row suffix (the projection's `wake`, the vault's project design
// 2.10): ` · ⏰ 18:14` for a wake later today, ` · ⏰ 10/1 18:14` on another day, ` · ⏰ due` when
// rendered after its deadline (the suffix describes the clock at render time; the bridge's tick
// clears the wake as it claims the turn); nothing without one; the browser's zone (the owner's,
// assumed the bridge host's). Without it a project between turns looked like one mid-turn:
// `[working]` with no run in `#vault` (the owner, 2026-09-30)
function _wake_suffix(wake, now) {
  if (typeof wake != 'number' || !(wake > 0)) return ''
  if (wake <= now) return ' · ⏰ due'
  const at = new Date(wake), today = new Date(now)
  const hhmm = String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0')
  const same_day = at.getFullYear() == today.getFullYear() && at.getMonth() == today.getMonth() && at.getDate() == today.getDate()
  return ' · ⏰ ' + (same_day ? hhmm : `${at.getMonth() + 1}/${at.getDate()} ${hhmm}`)
}

// a fresh command id (the wrapper name suffix; the bridge disposes of every id it observes once)
const _command_id = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('')

// the marker token adjacent to the #todo tag on its snippet side (design 2.4): written (or
// replaced, or removed with word=null) on the todo line only, over the widget's own grammar
// view of the tag; every other byte of the text is preserved
function _set_marker(text, word) {
  const todo_offset = _todo_offset(text)
  if (todo_offset < 0) return text
  const tag_end = todo_offset + 5
  const line_start = text.lastIndexOf('\n', todo_offset) + 1
  let line_end = text.indexOf('\n', todo_offset)
  if (line_end < 0) line_end = text.length
  const after = text.substring(tag_end, line_end) // the todo line's own suffix (the edit site)
  const before = text.substring(line_start, todo_offset) // the todo line's own prefix
  const use_suffix = _snippet_uses_suffix(text, todo_offset) // the snippet's own decision
  const marker = word ? `[${word}]` : ''
  if (use_suffix) {
    const m = after.match(/^ \[[a-z]+\]/)
    const rest = m ? after.substring(m[0].length) : after
    return text.substring(0, tag_end) + (marker ? ' ' + marker : '') + rest + text.substring(line_end)
  }
  const m = before.match(/\[[a-z]+\] $/)
  const head = m ? before.substring(0, before.length - m[0].length) : before
  return text.substring(0, line_start) + head + (marker ? marker + ' ' : '') + text.substring(todo_offset)
}

// the marker a snippet carries where the writer places it (design 2.4): `#todo [word]` at the
// start of a suffix snippet, `[word] #todo` at the end of a prefix one; {word, suffix}, or null
// when the todo line carries none (the owner removed it; a bracketed word elsewhere is theirs)
function _marker_of(snippet) {
  const suffix = snippet.match(/^#todo \[([a-z]+)\]/)
  if (suffix) return { word: suffix[1], suffix: true }
  const prefix = snippet.match(/\[([a-z]+)\] #todo$/)
  return prefix ? { word: prefix[1], suffix: false } : null
}

// the marker word linked over the row's html (escaped, its passes applied) by `anchor_html` —
// #vault's own review anchor for the worktree, built around the marker word: the anchor wraps
// the word, the brackets stay text, and the slot is found on the tag's own <mark>#todo</mark>
// (the writer's position: a bracketed word elsewhere is never linked, and owner text cannot
// spoof the mark). The anchor carries its own click stop, which is also what keeps the row's
// anchor pass off it (no target, so the vscode: url opens in place, as #vault's link does).
// The html comes back unchanged when the slot is not there (the markdown pass consumed it)
function _link_marker(html, marker, anchor_html) {
  const tag = '<mark>#todo</mark>'
  const anchor = `[${anchor_html}]`
  if (marker.suffix) {
    const head = `${tag} [${marker.word}]`
    return html.startsWith(head) ? `${tag} ${anchor}${html.substring(head.length)}` : html
  }
  const tail = `[${marker.word}] ${tag}`
  return html.endsWith(tail) ? html.substring(0, html.length - tail.length) + `${anchor} ${tag}` : html
}

// the review-anchor builder for a task's worktree ((name, text, title) => anchor html, or
// null), from the #vault item (design mind_vault_item 10): its `vault_review_anchor` — the ONE
// anchor form of the review url, so a marker click takes the same path as a click on the
// #vault row's link — reached through the app's eval in that item's own scope (an item's
// functions are in scope for its dependents only, and #vault is nobody's dependency), over the
// vault root its listing carries (`_bridge.root`), for the worktrees the listing names (the
// undecided ones that exist: the projection keeps a retired worktree's name, so the listing
// decides, as it does for #vault's own links; by the listing's OWN keys, since a worktree can
// be named as an inherited property is, `constructor`). Null without the item, its builder, or
// a root: the marker stays plain text
function _review_anchor_builder() {
  try {
    const vault = _item('#vault', { silent: true })
    const bridge = vault?._global_store?._bridge
    if (!bridge?.root) return null
    const build = vault.eval("typeof vault_review_anchor == 'function' ? vault_review_anchor : null")
    if (typeof build != 'function') return null
    return (name, text, title) =>
      Object.hasOwn(bridge.worktrees ?? {}, name) ? build(name, bridge.root, 'review', text, title) || null : null
  } catch (e) {
    return null // a #vault that cannot evaluate (a missing dependency): no link
  }
}

// re-render every todoer widget (the overlay changed)
function _rerender_todoer_widgets() {
  each(_todoer.dependents, dep => {
    const item = _item(dep)
    item.elem?.querySelectorAll('.todoer-widget').forEach(widget => _render_todoer_widget(widget, item))
  })
  if (typeof _bin_buttons == 'function') _bin_buttons(_selected_item())
}

// enqueue a command document through the app's narrow operation (design 2.2, 3.1): the overlay
// begins at the enqueue; a terminal create failure is retried ONCE with the same id, then
// reported and the overlay cleared
async function _enqueue_command(item, command, retry_id = null) {
  let enqueued
  try {
    enqueued = await window._enqueue_hidden_document('task_command_' + command.id, command, retry_id)
  } catch (e) {
    _clear_pending(item, command.id) // a retry that could not be prepared: its overlay goes
    alert(`could not ${command.kind} ${item.name}: ${e?.message ?? e}`)
    return false
  }
  // the FIRST enqueue takes the overlay; a retry keeps whatever gesture is pending now (a
  // newer take-back must not be replaced by an older delegate's transport)
  if (!retry_id) {
    _pending_commands()[item.id] = { id: command.id, kind: command.kind }
    _rerender_todoer_widgets()
  }
  enqueued.written.catch(e => {
    if (!retry_id) {
      console.warn(`retrying ${command.kind} ${command.id} of ${item.name} once: ${e?.message ?? e}`)
      return _enqueue_command(item, command, enqueued.id)
    }
    _clear_pending(item, command.id) // only this command's own overlay
    alert(`${command.kind} of ${item.name} was not saved: ${e?.message ?? e}`)
  })
  return true
}

// clear the item's pending overlay when it belongs to the given command (never a newer one)
function _clear_pending(item, command_id) {
  const pending = _pending_commands()
  if (pending[item.id]?.id != command_id) return
  delete pending[item.id]
  _rerender_todoer_widgets()
}

// why a gesture on `item` is refused out of hand, as the word that says so, or null: the checks
// every gesture shares
function _task_refusal(item, kind) {
  if (!item.tags.includes('#todo')) return `cannot ${kind} ${item.name}: not a #todo item`
  if (!item.saved_id) return `cannot ${kind} ${item.name}: item not saved yet`
  return null
}

// the checks every gesture shares; returns the target item or null (reported)
function _task_target(item, kind) {
  if (!item) return null
  const word = _task_refusal(item, kind)
  if (word) alert(word)
  return word ? null : item
}

// WHY A PRESS WOULD BE REFUSED before anything is asked of the bridge or written, as the word
// that says so, or null: one function for each press that has such refusals, read by the action
// itself (which says the word) and by what the shortcuts' menu lists (_row_can), so that the
// menu cannot offer a press that its action refuses. They read and change nothing.
// A delegation: no todo, not saved yet (a todo just made has a row before its first save), an
// unsaved edit in its open editor, a take-back that the bridge has not acknowledged yet (the
// todo stands in the main list by then, with the delegate button), an app without the grammar
function _delegate_refusal(item) {
  const word = _task_refusal(item, 'delegate') ?? _draft_word(item, _BIN_DRAFT.agent) // (the marker's write would replace what the editor holds)
  if (word) return word
  const pending = _pending_commands()[item.id]
  if (pending?.kind == 'takeback' && !_task_state(item)?.acked?.[pending.id]) return `take-back of ${item.name} pending; delegate again after it is acknowledged`
  return window._grammar?.version >= 2 ? null : 'please reload to delegate todos (app update required)'
}

// a take-back: no todo, not saved yet, an unsaved edit (the bridge's write of its marker follows)
function _takeback_refusal(item) {
  return _task_refusal(item, 'take back') ?? _draft_word(item, _BIN_DRAFT.owner)
}

// a completion: an app without the grammar, an unsaved edit (a whole-item write would replace
// what the editor holds)
function _complete_refusal(item) {
  return window._grammar?.version >= 2 ? _draft_word(item, _BIN_DRAFT.done) : 'please reload to complete todos (app update required)'
}

// a deletion: an unsaved edit
function _delete_refusal(item) {
  return _draft_word(item, _BIN_DRAFT.cancel)
}

const _BIN_REFUSAL = { agent: _delegate_refusal, done: _complete_refusal, cancel: _delete_refusal, owner: _takeback_refusal }

// the presentation write of a delegation, bound to the gesture that asks for it. It is the gesture's (a drop
// into the agent bin, a command): its intent is captured when this is called, at the gesture and BEFORE any
// wait (the created todo's save, the command's enqueue), and the write made through it afterwards is the
// user's (the app's window._carry_input: a write that re-orders the list is a history step only as the user's
// own; captured after a wait it came from no input). An app without the carry writes as before
function _carried_write() {
  const write = (item, text) => item.write(text, '', { skip_save: false }) // saved in an open editor too (it holds no draft: _delegate)
  return typeof window._carry_input == 'function' ? window._carry_input(write) : write
}

// delegate a todo (design 2.3): the body is captured BEFORE the presentation edits (the route
// tag and the [delegated] marker) so the instruction is exactly what the owner wrote; a refused
// enqueue (the size gate) reports and changes nothing; a pending take-back refuses the gesture
async function _delegate(item, write = _carried_write()) {
  if (!item) return false
  const refusal = _delegate_refusal(item)
  if (refusal) {
    alert(refusal)
    return false
  }
  const state = _task_state(item)
  const came_up = state?.surfaced // what the owner has seen of it at this gesture (its bell is cleared below); nothing where the bridge held none
  // the capture is the RAW text (item.text): item.read() is the grammar view, whose inert
  // regions (the agent's answers and plans) are tokens, never the bytes the bridge must see
  const grammar = window._grammar
  const command = {
    task: item.saved_id,
    id: _command_id(),
    kind: 'delegate',
    epoch: state?.epoch ?? 0,
    at: Date.now(),
    body: item.text,
  }
  if (!(await _enqueue_command(item, command))) return false
  // the owner has acted on what came up, whatever its bell showed: a take-back raises the count
  // without a bell (their own act), and the delegation that follows must not ring as a check-in
  _clear_bell(item, came_up)
  // the presentation: the marker at every delegation and the route tag once, planned over the
  // grammar view of the CURRENT raw text (an edit made during the await is kept; the inert
  // regions survive the rewrite); a refused write is repaired by the bridge at the next state change
  // An edit TYPED into the item's open editor during the enqueue's wait is a draft by now, and
  // the write would put its text in the draft's place: the command is accepted, the delegation
  // stands, and the presentation is left to the bridge (the review, 2026-11-24)
  if (_draft(item)) console.warn(`delegate: ${item.name} holds an edit made since; the marker is left to the bridge`)
  else {
    const text = grammar.edit(item.text, view => _delegated_view(view))
    if (write(item, text) !== true) console.warn(`delegate: presentation write refused for ${item.name}`)
  }
  // a delegated item cannot be snoozed: delegating a snoozed one clears its snooze (design 2.3)
  if (item._global_store._todoer?.snoozed) item.global_store._todoer.snoozed = 0
  return true
}

// the grammar view of a delegated item: the [delegated] marker on the todo line and the route
// tag once (checked on the text: hidden tags are not in item.tags)
function _delegated_view(view) {
  view = _set_marker(view, 'delegated')
  if (!view.match(/(^|\s)#_agent\/vault(?=[\s<>&?!,.;:"'`(){}\[\]]|$)/)) view = view.replace(/\s*$/, '\n#_agent/vault\n')
  return view
}

// take a delegated todo back (design 2.3): the command alone; the bridge writes [taken]
async function _takeback(item) {
  if (!item) return false
  const refusal = _takeback_refusal(item)
  if (refusal) {
    alert(refusal)
    return false
  }
  const state = _task_state(item)
  const command = { task: item.saved_id, id: _command_id(), kind: 'takeback', epoch: state?.epoch ?? 0, at: Date.now() }
  return _enqueue_command(item, command)
}

// the item a command names, else the targeted (selected) item; null when neither resolves
function _command_target(name, command) {
  const id = name || document.querySelector('.container.target')?.getAttribute('data-item-id')
  const item = id ? _item(id, { silent: true }) : null
  if (!item) alert(`${command}: ${name ? name + ' missing or ambiguous' : 'no target item'}`)
  return item
}

// => /delegate [item|text]
// delegate a todo to the vault agent: its task starts or resumes
// | `/delegate` | the targeted item
// | `/delegate item` | that item
// | `/delegate text` | a new todo with that text (a `#todo` first word is kept as written)
async function _on_command_delegate(args, name) {
  // a reference is an empty argument (the target), a `#name` or `id:` first word (the todoer's own
  // reference syntax) or a whole argument _item resolves (a bare id); any other text is a new todo,
  // the exact first word `#todo` (the tag itself, never a name) included: that text is created as written
  const tagged = name == '#todo'
  if (args && (tagged || (!name?.startsWith('#') && !name?.startsWith('id:') && !_exists(args)))) return _delegate_text(args, tagged)
  const item = _command_target(name, '/delegate')
  // a refused gesture (reported in a dialog) leaves the command in the box, as /edit does; a
  // handled one returns nothing, and the app then clears the box (a null return left the
  // command in it; the owner, 2026-11-16)
  if (!item || !(await _delegate(item))) return `/delegate ${args}`
}

// the plain-text form: the todo is created as /todo creates it (the app's {text} return, its
// init hook handing the created item over) and delegated once its save gives it the id the
// command names; a `tagged` text (its first word the tag) is created as written, never tagged
// twice; the grammar gate is checked BEFORE the creation (a refusal leaves the command in the
// box), and after it the command never comes back (a retry would create a second todo)
function _delegate_text(text, tagged = false) {
  if (!(window._grammar?.version >= 2)) {
    alert('please reload to delegate todos (app update required)')
    return `/delegate ${text}`
  }
  return { text: tagged ? text : '#todo ' + text, edit: false, init: item => _delegate_created(item) }
}

// delegate a todo created a moment ago, once saved (bounded): a save that does not come is
// reported (the gesture reports its own refusals) and the todo stays on the main list
async function _delegate_created(item, wait = SAVE_WAIT_MS) {
  if (!item) return null // not created (reported by the app)
  const write = _carried_write() // the command's intent, before the wait for the save
  const saved = await _wait_for_save(item, wait)
  if (!_exists(item.id)) return null // deleted meanwhile
  if (!saved) alert(`cannot delegate ${item.name}: not saved after ${wait / 1000}s; delegate it once it is`)
  else await _delegate(item, write)
  return null
}

// wait for the item's saved id (the id a command names), polling as the widget's detect_save
// task does; false once the wait runs out or the item is gone
async function _wait_for_save(item, wait = SAVE_WAIT_MS, poll = SAVE_POLL_MS) {
  const deadline = Date.now() + wait
  while (!item.saved_id) {
    if (!_exists(item.id) || Date.now() >= deadline) return false
    await new Promise(resolve => setTimeout(resolve, poll))
  }
  return true
}

// => /takeback [item]
// take `item` (default: the targeted item) back from the vault agent
async function _on_command_takeback(args, name) {
  const item = _command_target(name, '/takeback')
  // handled, it returns nothing: the box is cleared, as after /delegate
  if (!item || !(await _takeback(item))) return `/takeback ${args}`
}


// ---- desktop notifications (the vault's notes/design/mind_task_agents.md 2.7, 2026-10-03) ----

// the snippet's VISIBLE text: without its hidden tags (#_…, hidden everywhere else in the app; a
// task's route tag is not part of what the owner wrote) and without the grammar view's
// inert-region tokens (⟦…⟧: the agent's answers and plans read as tokens)
function _visible(text) {
  return text.replace(/(^|\s)#_[^#\s<>&?!,.;:"'`(){}\[\]]+/g, '$1').replace(/⟦[^⟧]*⟧/g, '')
}

// the reasons that wait on the owner (the default set; their notification stays on screen until
// clicked): the hand-back reasons, `done` included since the todo then waits to be closed,
// `reply`, a bridge reply on a vault or task chat (the owner's ask of 2026-10-04), and `item`, an
// item an agent created or edited with the item tool (the owner's ask of 2026-11-23); then the
// other reasons an owner may add (their notification shows for the shell's default; `all` names
// every one)
const NOTIFY_ATTENTION = ['question', 'blocked', 'proposal', 'budget', 'done', 'reply', 'item']
const NOTIFY_REASONS = [...NOTIFY_ATTENTION, 'interrupted', 'taken', 'checkin']
const NOTIFIER_KEY = 'mindpage_todoer_notifier' // localStorage: the device's elected window
const NOTIFIER_STALE_MS = 5 * 60 * 1000 // an election not refreshed for this long is vacant
const NOTIFIER_REFRESH_MS = 60 * 1000 // the elected window's heartbeat, and its gesture stamps' spacing
const UNSNOOZE_SKEW_MS = 60 * 1000 // a snooze that ended this close before its time ended by it (the devices' clocks differ)
const ITEM_STAMP_MAX_AGE_MS = 10 * 60 * 1000 // an agent write stamp further than this from this device's clock (either direction) never notifies
const NOTIFY_CLICK_TYPE = 'mindpage:notificationclick' // app service-worker contract: click relay
const NOTIFY_CLICK_RELAY = 'mindpage:notificationclick:relay' // app service-worker contract: confirmed worker event
const NOTIFY_CLICK_READY = 'mindpage:notificationclick:ready' // app service-worker contract: drain pending clicks
const NOTIFY_CLICK_RECEIVED = 'mindpage:notificationclick:received' // app service-worker contract: acknowledge click receipt
const NOTIFY_SW_WAIT_MS = 1500 // short wait for an active service worker before falling back to new Notification

// => /notify [on [reason...]|off [reason...]|test [item]]
// desktop notifications for what waits on you: todos, replies, an agent's writes
// | `/notify` | the setting, and this device's permission
// | `/notify on` | on for what waits on you (a custom set is reset); asks the permission
// | `/notify on reason...` | adds reasons, or `all`, to the set (from off: to the seven); extra ones: `interrupted`, `taken`, `checkin`; asks too
// | `/notify off reason...` | removes reasons
// | `/notify off` | off on every device
// | `/notify test` | shows one
// | `/notify test item` | a sample for that item, five seconds later
async function _on_command_notify(args) {
  const parsed = _parse_notify(args)
  if (parsed.error) {
    alert(`/notify: ${parsed.error}`)
    return `/notify ${args}`
  }
  // a handled command returns nothing: the app then clears the box (a null return would leave the
  // command in it; the owner, 2026-10-05); a refused word returns the command, which stays
  const store = _todoer._global_store
  if (parsed.status) {
    alert(`notifications: ${_notify_text(store.notify)}; this device: ${_notify_permission()}`)
    return
  }
  if (parsed.test) {
    if (_notify_permission() != 'granted') alert(`notifications: this device's permission is ${_notify_permission()} (/notify on asks for it)`)
    else if (parsed.name) {
      const item = _item(parsed.name, { silent: true })
      if (!item) {
        alert(`/notify: no item is named ${parsed.name}`)
        return `/notify ${args}`
      }
      // (an item deleted during the wait shows nothing, and neither does a page whose account was
      // left meanwhile: a refusal's alert is for a browser that refused)
      setTimeout(() => {
        const live = _item(item.id, { silent: true })
        if (!live || _notify_account_left()) return
        void Promise.resolve(_notify_test(live)).then(step => void (step == 'notify' || alert('notification refused by the browser')))
      }, NOTIFY_TEST_DELAY_MS)
    } else if (!(await _notify_show({ reason: 'question', shown: '#todo [question] a test of the desktop notifications', label: null, parent: null, id: 'test', item: null }, () => window.focus()))) alert('notification refused by the browser')
    return
  }
  // this device's permission is asked from the command's own gesture (the browser prompts only
  // then), the setting saved meanwhile: it is the account's, the permission each device's own
  const asked = parsed.on && _notify_permission() == 'default' ? Notification.requestPermission() : null
  const setting = _notify_setting(store.notify, parsed)
  if (setting) store.notify = setting
  else delete store.notify
  _todoer.save_global_store({ invalidate_elem_cache: false })
  if (parsed.off) {
    alert(`notifications: ${_notify_text(setting)}`)
    return
  }
  const permission = asked ? await asked : _notify_permission()
  alert(`notifications: ${_notify_text(store.notify)}; this device: ${permission}` + (permission == 'denied' ? ' (allow notifications for this site in the browser, then /notify on again)' : ''))
}

// the words of /notify: nothing (the status), `on [reason...]`, `off [reason...]`, `test` alone
// or with one item's name; the reasons validated (`all` names every one): {status} |
// {on, reasons} | {off, reasons} | {test} | {test, name} | {error}, `reasons` the named ones
// (every one for `all`), or null when none was named
function _parse_notify(args) {
  const [word, ...rest] = String(args ?? '').trim().split(/\s+/).filter(w => w)
  if (!word) return { status: true }
  if (word == 'test') return rest.length > 1 ? { error: "test takes one item's name at most" } : rest.length ? { test: true, name: rest[0] } : { test: true }
  if (word != 'on' && word != 'off') return { error: `unknown word ${word} (usage: /notify [on [reason...]|off [reason...]|test [item]])` }
  const unknown = rest.filter(r => r != 'all' && !NOTIFY_REASONS.includes(r))
  if (unknown.length) return { error: `unknown reason ${unknown.join(', ')} (one of ${NOTIFY_REASONS.join(', ')}, or all)` }
  const reasons = rest.includes('all') ? NOTIFY_REASONS : rest.length ? [...new Set(rest)] : null
  return { [word]: true, reasons }
}

// the setting after a /notify word over the current one: `on` alone the default set (the
// attention reasons), `on <reasons>` the current set (the default when off) plus the named ones,
// `off <reasons>` the current set minus the named ones, `off` alone none; the reasons kept in
// their canonical order; null for none left
function _notify_setting(current, parsed) {
  if (parsed.off && !parsed.reasons) return null
  const base = current?.reasons?.length ? current.reasons : NOTIFY_ATTENTION
  let reasons
  if (parsed.on) reasons = parsed.reasons ? [...base, ...parsed.reasons] : NOTIFY_ATTENTION
  else reasons = (current?.reasons ?? []).filter(r => !parsed.reasons.includes(r))
  reasons = NOTIFY_REASONS.filter(r => reasons.includes(r))
  return reasons.length ? { reasons } : null
}

const _notify_text = setting => (setting?.reasons?.length ? `on for ${setting.reasons.join(', ')}` : 'off')
// this device's notification permission: granted, denied, default, or unsupported (no API)
const _notify_permission = () => (typeof Notification == 'undefined' ? 'unsupported' : Notification.permission)

// the projection facts a notification keys on: possession, reason, epoch and the count of
// resurfacings published (`surfaced`, the bridge's since 2026-10-03: a hand-back advances the
// epoch, a check-in the count, so a project's second question under one epoch is told apart; a
// projection from an older bridge carries no count and reads as before); a stats refresh or the
// widget's own save changes none of them; '' without a projection. A bridge repair restores the
// authoritative fields: against a current projection it changes nothing, but where an older
// store delivery had rolled this tab's view back it restores a key already notified, which
// alerts again (duplicate suppression is a backfill)
function _state_key(state) {
  return state ? `${state.held ?? ''}:${state.reason ?? ''}:${state.epoch ?? ''}:${state.surfaced ?? ''}` : ''
}

// one decision for a todo whose projection this tab compares (the setting's reasons, the seen
// record against the current one, the row's list, the reason, this device's permission):
// 'notify', or the cause of the skip
function _notify_step({ setting, prev, key, list, reason, permission, checkin = false }) {
  if (!setting?.reasons?.length) return 'off'
  if (prev === key) return 'unchanged'
  if (checkin) return _notify_gate({ setting, reason: 'checkin', permission })
  if (list != 'main') return 'not in the main list'
  return _notify_gate({ setting, reason, permission })
}

// whether a todo's change from the record this tab held of it (_seen_record) is a check-in: it is
// the agent's, in the delegated list, and its count of times it came up (`surfaced`) went up. The
// agent goes on working, so nothing waits on the owner: the reason `checkin` is one an owner adds
// (`/notify on checkin`), never part of the default set. A todo this tab had no record of, or
// held no projection of (its first one then says how often it came up BEFORE), is none
function _checked_in(prev, state, list) {
  if (state?.held != 'agent' || list != 'delegated' || typeof prev != 'string') return false
  const held = prev.split('|')[0] // the state this tab held of it; empty when it held no projection
  if (!held) return false // a first projection (a tab started from its cache) tells nothing new
  return state.surfaced > Number(held.split(':')[3] || 0)
}

// the checks every notification shares: the setting on and naming the reason, this device's
// permission granted; 'notify', or the cause of the skip
function _notify_gate({ setting, reason, permission }) {
  if (!setting?.reasons?.length) return 'off'
  if (!setting.reasons.includes(reason)) return `reason ${reason ?? 'none'}`
  if (permission != 'granted') return `permission ${permission}`
  return 'notify'
}

// the chat delimiters as chat.js parses them (system, user, agent, _agent, tool, in any case; an
// optional argument; spaces allowed), at a line start. The opener is ESCAPED for the app, whose
// macro pass reads this item's whole text, code included (an unescaped opener here was evaluated
// as a macro at the item's render and threw, 2026-10-04); a regex reads `\<` as `<`
const CHAT_DELIMITER = /^ *\<< *(system|user|_?agent|tool)(?: *\(([^\n]*)\))? *>>/gim

// the bridge's attribution as an agent turn's argument (`vault/<persona> · …`: the publisher
// footer of lib/mindpage_inert_bridge.py on a reply, the child attribution of
// lib/mindpage_chat_children.py on an item a reply created, whose shape has varied); the web
// responder's turns carry another attribution
const REPLY_FOOTER = /^['"]vault\//

// the bridge's replies among a chat's turns, read from the GRAMMAR VIEW (`item.read()`: an inert
// body is an opaque token there, so a delimiter quoted inside a reply is no turn; the raw text
// keeps such quotes verbatim), one forward pass: a REPLY is an agent turn with the bridge's
// attribution (REPLY_FOOTER) that FOLLOWS a user turn of the same item (an answer to the owner;
// an item a reply created opens with the agent's turn and no user turn, so it is no reply
// whatever its attribution's shape: the owner, 2026-10-05, a reply with children notifies for
// the parent alone); the count, the last reply's attribution (a replacement under the same count
// is told apart by its run id) and whether the chat's last turn is a reply (one the owner has not
// answered yet); {replies, last, footer}
function _vault_replies(view) {
  let replies = 0
  let footer = ''
  let last = false
  let asked = false // a user turn seen
  for (const m of String(view ?? '').matchAll(CHAT_DELIMITER)) {
    const role = m[1].toLowerCase()
    const argument = (m[2] ?? '').trim()
    if (role == 'user') asked = true
    if (role == 'agent' && asked && REPLY_FOOTER.test(argument)) {
      replies++
      footer = argument
      last = true
    } else last = false
  }
  return { replies, last, footer }
}

// the first text line of the last inert region in a chat's raw text, as written (the bridge's
// reply body in its canonical frame; the escaping of lib/mindpage_inert.py keeps a body line
// from closing the frame early); '' without one. The ordinary case, not a guarantee: an opener
// line quoted inside a body is not escaped and would start the preview after it, and an inline
// opener followed by a newline gives no preview (a framing-aware extraction is a backfill)
function _reply_raw(text) {
  const raw = String(text ?? '')
  const open = raw.lastIndexOf('<!--inert-->\n')
  if (open < 0 || (open > 0 && raw[open - 1] != '\n')) return ''
  const start = open + '<!--inert-->\n'.length
  const close = raw.indexOf('\n<!--/inert-->', start)
  const body = raw.slice(start, close < 0 ? raw.length : close)
  return body.split('\n').find(l => l.trim()) ?? ''
}

// the first text line of the last inert region (_reply_raw), shortened; '' without one
// (`raw`, when already extracted, avoids reading the item's text a second time)
function _reply_line(text, raw = _reply_raw(text)) {
  const clean = raw.replace(/\s+/g, ' ').trim()
  return clean.length > 120 ? clean.slice(0, 119).trimEnd() + '…' : clean
}

// a chat's text change compared with the bridge replies this tab last saw in it (the baseline
// at welcome, then every change, local ones included: a typed turn or a truncation moves the
// baseline and shows nothing, so the replacement a rerun publishes is one more reply again):
// one more reply, or a replacement with another attribution under the same count, that is the
// chat's last turn notifies from the elected window under the setting's `reply` (the owner's
// ask of 2026-10-04: a response on a vault chat or a task chat); the owner's answer from another
// device arrives remote and ends the turn, so nothing shows; returns the step
function _notify_reply(item, remote = true) {
  const seen = _todoer.store.reply_seen
  if (!seen) return 'baseline'
  const { replies, last, footer } = _vault_replies(item.read())
  const prev = seen[item.id] ?? { replies: 0, footer: '' }
  seen[item.id] = { replies, footer, last }
  if (!remote) return 'local'
  if (replies < prev.replies || replies == 0) return 'unchanged'
  if (replies == prev.replies && footer == prev.footer) return 'unchanged'
  if (!last) return 'answered' // the owner answered it elsewhere already
  const step = _notify_gate({ setting: _todoer._global_store.notify, reason: 'reply', permission: _notify_permission() })
  if (step != 'notify') return step
  if (!_notifier_elected()) return 'another window'
  const shown = item.label || _visible(String(item.text ?? '').split('\n')[0] ?? '')
  const facts = { reason: 'reply', shown, label: null, parent: null, id: item.saved_id ?? item.id, body: _reply_line(item.text) }
  return _notify_result(_notify_show(facts, () => _notify_click(item.id)))
}

// the question of a chat that became a todo. Where a todo's row would show nothing but the item's
// name and the tag (a prefix snippet that is the label, a state marker and the tag: the tag was
// written after the name, and the chat's turns follow on their own lines), the row adds the start
// of the item's first user turn: `raw` is that stretch as the item's text holds it (the row's
// second click selects it: the app finds a selection in the text), capped as a snippet is (200
// characters, cut at the next whitespace), and `more` says the turn goes on past it. The turns
// are read from the GRAMMAR VIEW (a delimiter quoted inside a reply is no turn), up to the next
// turn or the first inert region. null for a row that shows more than a name, an unnamed item, an
// item without a user turn or with an empty one
function _row_question(item, snippet) {
  const label = String(item.label ?? '').toLowerCase()
  const bare = _visible(snippet).replace(/\s+/g, ' ').trim().toLowerCase()
  if (!label || !bare.startsWith(label + ' ')) return null
  if (!/^(?:\[[a-z]+\] )?#todo$/.test(bare.slice(label.length + 1))) return null
  const view = String(item.read() ?? '')
  let start = -1
  let end = view.length
  for (const m of view.matchAll(CHAT_DELIMITER)) {
    if (start >= 0) {
      end = m.index
      break
    }
    if (m[1].toLowerCase() == 'user') start = m.index + m[0].length
  }
  if (start < 0) return null
  let raw = view.slice(start, end)
  const token = raw.indexOf('⟦')
  if (token >= 0) raw = raw.slice(0, token)
  raw = raw.trim()
  if (!raw) return null
  const cutoff = raw.length > 200 ? raw.substr(200).search(/\s/) : -1
  return cutoff < 0 ? { raw, more: false } : { raw: raw.substr(0, 200 + cutoff), more: true }
}

// where a chat-todo's question (`raw`, of _row_question) stands in the item's RAW text, as
// [start, end], or null. The first user turn is found in the grammar view, and its place is
// carried into the raw text by the grammar's own edit: a mark written into the view comes out
// where it belongs, past every inert region before it (a chat the bridge created opens with
// one). The stretch found there must be the question itself, else there is no place
function _question_range(item, raw) {
  const MARK = '@@todoer question@@'
  const text = String(item.text ?? '')
  if (text.includes(MARK)) return null
  let marked
  try {
    marked = window._grammar?.edit?.(text, view => {
      const turn = [...view.matchAll(CHAT_DELIMITER)].find(m => m[1].toLowerCase() == 'user')
      if (!turn) return view
      const start = view.length - view.slice(turn.index + turn[0].length).trimStart().length
      return view.slice(0, start) + MARK + view.slice(start)
    })
  } catch (e) {
    return null // the grammar refused the mark
  }
  const at = typeof marked == 'string' ? marked.indexOf(MARK) : -1
  return at >= 0 && text.slice(at, at + raw.length) == raw ? [at, at + raw.length] : null
}

const _wait_key = seen => `${seen.replies}|${seen.footer}`
const _item_wait_key = entry => `item|${entry.at}|${entry.hash}`
// the valid agent write stamp for an item from the todoer store's `_agent.wrote`, or null
function _item_stamp(item) {
  const id = item?.saved_id ?? item?.id
  if (!id) return null
  const wrote = _item_writes()
  const entry = wrote && Object.prototype.hasOwnProperty.call(wrote, id) ? wrote[id] : null
  if (!entry || typeof entry != 'object' || Array.isArray(entry)) return null
  if (typeof entry.at != 'number' || !Number.isFinite(entry.at) || typeof entry.hash != 'string' || !entry.hash) return null
  return entry
}
const _wait_key_of = (item, waits) => (waits == 'item' ? _item_wait_key(_item_stamp(item)) : _wait_key(_todoer.store.reply_seen[item.id]))
// a short mark of a reply's key (32-bit FNV-1a, hex), for the baseline of replies (rows_base)
function _key_mark(key) {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16)
}
// what an item that is not a todo waits on the owner for, or null. `reply`: a chat whose LAST turn
// is a bridge reply (this tab's record of it, _notify_reply) that the owner has not cleared
// (_cleared: kept in the item's own synced store, as its snooze is, so a row cleared on one
// device goes on the others). The owner's own answer in the chat ends it (the reply is no longer
// the last turn), and a later reply shows the row again. A reply that was its chat's last turn
// when the list began (_rows_start) does not show. `item`: an item that an agent wrote (a stamp in
// the todoer store's `_agent.wrote` past `items_base`, while the page's item is at the stamped
// hash and the stamp has not been cleared; no age limit). A chat waiting both ways shows `reply`
function _waits(item) {
  if (!item) return null
  const id = item.saved_id ?? item.id
  let cleared = null
  const seen = _todoer.store.reply_seen?.[item.id]
  if (seen?.replies && seen.last) {
    const base = _todoer._global_store?.rows_base
    if (base) {
      const key = _wait_key(seen)
      if (base[id] != _key_mark(key)) {
        cleared = _cleared(item)
        if (!cleared.includes(key)) return 'reply'
      }
    }
  }
  if ((item.tags_visible ?? item.tags)?.includes('#todo')) return null
  const entry = _item_stamp(item)
  if (!entry) return null
  const base = _todoer._global_store?.items_base
  if (!base) return null // this kind has not begun in the account
  if (Object.hasOwn(base, id) && Number.isFinite(base[id]) && !(entry.at > base[id])) return null // it stood when this kind began
  if (typeof item.hash != 'string' || item.hash !== entry.hash) return null // edited since, or not at the stamped version
  const key = _item_wait_key(entry)
  return (cleared ?? _cleared(item)).includes(key) ? null : 'item'
}

// the waiting keys of an item that the owner has cleared (_wait_key for replies in `cleared`,
// _item_wait_key for write stamps in sibling `cleared_items`), from the item's own store: the
// four most recently ADDED distinct keys of EACH kind that this tab has seen there (_clear_waiting
// writes reply keys to `cleared` alone so older tabs keep master's field intact, and writes stamp
// keys to `cleared_items`; a fifth of the same kind puts its oldest out, a repeated clear does
// not move its key). With one key that each clear replaced, a row drawn from an older text put
// its own key over the clear of a newer reply that had come from another device before that
// reply's text (the app can hold a text back while a save of its own is pending), and the newer
// reply came up again. A store is written whole, so a clear this tab has not seen can still be
// lost to its write. Reading covers both fields, a legacy single string in `cleared` (the list's
// first versions), and mixed arrays written in `cleared` by preview builds
function _cleared(item) {
  const todoer = item?._global_store?._todoer
  const kept = todoer?.cleared
  const replies = Array.isArray(kept) ? kept : kept ? [kept] : []
  const items = Array.isArray(todoer?.cleared_items) ? todoer.cleared_items : todoer?.cleared_items ? [todoer.cleared_items] : []
  return [...replies, ...items]
}

// the parts of such an item's row: `[name, line, raw]` — its name when it has one, its first line
// (for `reply`, the reply's first line, or the item's own first line when unnamed without one; for
// `item`, the name and clipped body for a uniquely named item, or the desktop notification's shaped
// 80-char line via `_notify_line` for an unnamed item), and for `reply` the raw first line read
// once via `_reply_raw` (`null` for `item`)
function _waiting_parts(item, kind = 'reply') {
  if (kind == 'item') {
    const { shown, body } = _item_preview(item)
    const named = typeof item.name == 'string' && item.name.startsWith('#') && item.name.toLowerCase() != '#todo'
    return named ? [shown, body, null] : ['', _notify_line(shown), null]
  }
  const raw = _reply_raw(item.text)
  const line = _reply_line(item.text, raw)
  return item.label ? [item.label, line, raw] : ['', line || _visible(String(item.text ?? '').split('\n')[0] ?? ''), raw]
}

// clears such an item's row (the bell's click, a drop on the done bin): what the row SHOWED
// (`key`) joins the item's cleared keys — reply keys in `cleared` (master's field, append and
// last four) and write-stamp keys (`item|...`) in sibling `cleared_items` (last four). When a
// clear writes the store, both kinds already seen are carried forward and any stamp keys found in
// a preview mixed `cleared` array move to `cleared_items`. A newer reply or stamp that arrived
// while the row was held or dragged has another key and goes on waiting. False when nothing to clear
function _clear_waiting(item, key) {
  if (!item || !key) return false
  const kept = _cleared(item)
  // (reading global_store saves the store: only where there is a key to add)
  if (kept.includes(key)) return true
  const uniq = [...new Set(kept)]
  const is_item = k => typeof k == 'string' && k.startsWith('item|')
  const reply = uniq.filter(k => !is_item(k))
  const stamp = uniq.filter(is_item)
  if (is_item(key)) stamp.push(key)
  else reply.push(key)
  const store = (item.global_store._todoer ??= {})
  if (reply.length) store.cleared = reply.slice(-4)
  else delete store.cleared
  if (stamp.length) store.cleared_items = stamp.slice(-4)
  return true
}

// the list's start in the account: the baselines that keep the past out of it, in the todoer
// item's own store. `rows_base` holds, for every chat whose last turn was a bridge reply then, a
// mark of that reply's key: a reply waits by its OWN key, so an old chat that is selected or
// edited later (the app moves an item's time then) stays out, and a new reply on it comes in.
// What it covers is a reply that was its chat's LAST turn then: an old reply under a later turn
// of the owner's has no mark, and shows if that turn is taken out again. A mark is 32 bits: a
// replacement reply whose key has the same mark as the one before it on the same chat would
// stay out (about one chance in four billion per replacement, if the marks spread evenly).
// `bells_base` holds every todo's count of the times it had come up (_bells_now). `items_base`
// holds every valid agent write stamp's time from `_agent.wrote` (_items_now). Written in one
// save, by a tab that lacks any of them, only from a server-confirmed, currently served corpus
// past a resume hold (the order save's rule, _order_save_step: a store is written whole from this
// tab's copy); two tabs that start together can both write, each from its own view. An account
// that ran the list's first versions has `rows_since` (a time) and no `rows_base`: what waited
// under their rule (a chat changed after that time, its reply not cleared) goes on waiting, the
// rest becomes the baseline. Whether the baselines stand
function _rows_start() {
  const kept = _todoer._global_store
  if (kept.rows_base && kept.bells_base && kept.items_base) return true
  if (!_corpus_current(window) || _held()) return false
  const store = _todoer.global_store // one save for all of it
  const since = store.rows_since
  store.rows_base ??= _rows_now((item, key) => since > 0 && item.time > since && !_cleared(item).includes(key))
  store.rows_since ??= Date.now()
  store.bells_base ??= _bells_now()
  store.items_base ??= _items_now()
  return true
}

// the mark of every chat's unanswered bridge reply as this tab holds it (its records exist from
// the notifier's welcome on), by saved id, less those that `waiting` says go on waiting
function _rows_now(waiting) {
  const base = {}
  each(_items(), item => {
    const seen = _todoer.store.reply_seen?.[item.id]
    if (!seen?.replies || !seen.last) return
    const key = _wait_key(seen)
    if (!waiting(item, key)) base[item.saved_id ?? item.id] = _key_mark(key)
  })
  return base
}

// every todo's count of the times it came up for the owner, as the bridge publishes it
// (`surfaced` in the projection), by saved id: the baseline of the todos' bells (_bell)
function _bells_now() {
  const base = {}
  each(_items(), item => {
    const count = item.tags.includes('#todo') ? _task_state(item)?.surfaced : 0
    if (count > 0) base[item.saved_id ?? item.id] = count
  })
  return base
}

// every valid agent write stamp in the todoer store's `_agent.wrote` when this kind begins, by
// saved id (`at`): the baseline of agent-written items' rows (`items_base`)
function _items_now() {
  const base = {}
  const wrote = _item_writes()
  if (!wrote) return base
  for (const id of Object.keys(wrote)) {
    const entry = _item_stamp({ saved_id: id })
    if (entry) base[id] = entry.at
  }
  return base
}

// a todo's bell. The bridge counts every time a todo comes up for the owner (`surfaced`: a
// hand-back, a check-in), and the owner's clear is the count it stood at, kept in the todo's own
// store (`_todoer.bell`), so it holds on every device. The bell shows while the count is past the
// clear and past the baseline taken when the bells began in the account (`bells_base` in the
// #todoer item's store: nothing of the past rings). It does not follow the todo's marker: a
// check-in's marker goes back to working at the agent's next turn, the bell stays until its
// click, or until the owner delegates the todo again (_delegate clears it). Its kind is the
// reason of a todo that waits in the main list (an owner-held one; a project that asks, is
// blocked or out of budget), else `checkin`: the one way an agent-held todo comes up. A todo the
// owner took back is their own act: no bell; null for none
function _bell(item, state = _task_state(item), list = _list_of(item, state)) {
  const count = state?.surfaced
  const base = _todoer._global_store?.bells_base
  if (!(count > 0) || !base) return null
  const seen = Math.max(item._global_store?._todoer?.bell ?? 0, base[item.saved_id ?? item.id] ?? 0)
  if (!(count > seen)) return null
  // an agent's todo: a project that waits in the main list rings by its reason, any other came
  // up by a check-in. The owner's: its reason where it waits in the main list; in the delegated
  // list (a bound child's proposal under its project's standing /land) it is its project's to
  // handle, and a todo the owner took back is their own act: no bell
  if (state.held == 'agent') return list == 'main' && state.project && ['question', 'blocked', 'budget'].includes(state.reason) ? state.reason : 'checkin'
  return list != 'main' || !state.reason || state.reason == 'taken' ? null : state.reason
}

// clears a todo's bell (its click, a new delegation): the count the owner SAW (`count`: the one
// the bell showed, or the one that stood at the delegation's gesture; always given) is recorded
// in the todo's own store, so a time it came up meanwhile still rings; a later clear this tab
// holds is left standing. False where there was no count to see
function _clear_bell(item, count) {
  if (!(count > 0)) return false
  const store = (item.global_store._todoer ??= {}) // reading global_store saves the store
  if (!(store.bell >= count)) store.bell = count
  return true
}

// the map of item write stamps in `#todoer`'s own store (`_agent.wrote`), or null
function _item_writes() {
  const wrote = _todoer._global_store?._agent?.wrote
  return wrote && typeof wrote == 'object' && !Array.isArray(wrote) ? wrote : null
}

// what a reader sees of an item: the app's reading without hidden and removed sections, without
// HTML comments, and without hidden tags or inert-region tokens
function _item_visible(item) {
  const raw =
    typeof item.read == 'function'
      ? item.read('', { remove_hidden: true, remove_removed: true })
      : String(item.text ?? '')
  return _visible(String(raw ?? '').replace(/<!--[\s\S]*?-->/g, ''))
}

// title text (`shown`, passed to _notification_of) and body preview for an `[item]` alert:
// a unique label other than the bare `#todo` tag is the title and the first visible line after
// it is the body; otherwise the first visible line (without `#todo` and a state marker) is the
// title and the next visible line is the body, shortened to 120 chars like _reply_line
function _item_preview(item) {
  const visible = _item_visible(item)
  const clip = s => (s.length > 120 ? s.slice(0, 119).trimEnd() + '…' : s)
  const norm = s => s.replace(/\s+/g, ' ').trim()
  const unique = typeof item.name == 'string' && item.name.startsWith('#') && item.name.toLowerCase() != '#todo'
  if (unique) {
    const idx = visible.toLowerCase().indexOf(item.name.toLowerCase())
    const rest = idx >= 0 ? visible.slice(idx + item.name.length) : visible
    const line = rest.split('\n').find(l => l.trim()) ?? ''
    return { shown: item.name, body: clip(norm(line)) }
  }
  const lines = visible.split('\n').map(norm).filter(l => l)
  const first = lines.findIndex(l => _notify_line(l))
  const shown = first >= 0 ? lines[first].replace(/(^|\s)#todo(?=\s|$)/gi, '$1') : ''
  const body = first >= 0 ? clip(lines[first + 1] ?? '') : ''
  return { shown, body }
}

// one decision for an entry in `_todoer._global_store._agent.wrote` against what this tab has:
// 'no stamp' (missing/malformed), 'seen' (this tab already decided this id and at), 'stale'
// (at more than ten minutes from this device's clock in either direction), 'pending' (item not
// in the page yet, or its hash differs from the entry's — nothing recorded so a later trigger
// decides again), else the setting/permission gate ('notify' or its skip reason)
function _item_notify_step({ at, hash, prev, item_hash, now, setting, permission }) {
  if (typeof at != 'number' || !Number.isFinite(at) || typeof hash != 'string' || !hash) return 'no stamp'
  if (prev === at) return 'seen'
  if (Math.abs(now - at) > ITEM_STAMP_MAX_AGE_MS) return 'stale'
  if (typeof item_hash != 'string' || item_hash !== hash) return 'pending'
  return _notify_gate({ setting, reason: 'item', permission })
}

// one entry in `_todoer._global_store._agent.wrote` compared with what this tab saw and holds:
// 'pending' records nothing so a later item arrival, store delivery or minute scan decides again;
// every other decision records `at` as seen by this tab; 'notify' pops an alert from the device's
// elected window under `item`; returns the step
function _notify_item(id, item = null) {
  const seen = _todoer.store.item_seen
  if (!seen) return 'baseline'
  const wrote = _item_writes()
  const entry = wrote && Object.prototype.hasOwnProperty.call(wrote, id) ? wrote[id] : null
  const at = entry && typeof entry == 'object' && !Array.isArray(entry) ? entry.at : null
  const hash = entry && typeof entry == 'object' && !Array.isArray(entry) ? entry.hash : null
  item ??= id && !String(id).startsWith('#') ? _item(id, { silent: true }) : null
  const step = _item_notify_step({
    at,
    hash,
    prev: seen[id],
    item_hash: item?.hash ?? null,
    now: Date.now(),
    setting: _todoer._global_store?.notify,
    permission: _notify_permission(),
  })
  if (step == 'no stamp' || step == 'seen' || step == 'pending') return step
  seen[id] = at
  if (step != 'notify') return step
  if (!_notifier_elected()) return 'another window'
  const { shown, body } = _item_preview(item)
  const facts = { reason: 'item', shown, label: null, parent: null, id: item.saved_id ?? item.id, body }
  return _notify_result(_notify_show(facts, () => _notify_click(item.id)))
}

// every entry in `_todoer._global_store._agent.wrote` decided (the todoer's store hook and the
// notifier's minute scan); returns the count of alerts actually shown (a Promise<number> when
// any alert takes the async service-worker path, else a number synchronously)
function _notify_items() {
  if (!_todoer.store.item_seen) return 0
  const wrote = _item_writes()
  if (!wrote) return 0
  let notified = 0
  const pending = []
  for (const id of Object.keys(wrote)) {
    const res = _notify_item(id)
    if (res == 'notify') notified++
    else if (res && typeof res.then == 'function') pending.push(res)
  }
  if (!pending.length) return notified
  return Promise.all(pending).then(results => notified + results.filter(r => r == 'notify').length)
}

// the list a todo belongs to (_task_list over its projection, this tab's pending command and its
// parent's projection)
function _list_of(item, state) {
  const parent_item = state?.parent ? _item(state.parent, { silent: true }) : null
  return _task_list(state, _pending_commands()[item.id], parent_item ? _task_state(parent_item) : null)
}

// what this tab records of a todo: its state key AND its list, so a row ENTERING the main list
// with an unchanged state (a bound child's proposal once its project's standing /land is gone;
// a child released by its project) is a change too
const _seen_record = (state, list) => `${_state_key(state)}|${list}`

// a todo's projection compared with what this tab last saw of it (the baseline at welcome, then
// every change observed): a change into a state the owner must act on, in the main list, notifies
// from the device's elected window (one notification per device: the window the owner used last,
// see _notifier_step) under a granted permission. Called from the store hook (prompt, before any
// render), from each row's render and from the notifier's minute scan (_scan_notify: a delivery
// the hook did not announce, see there), idempotent through the seen records; the todo's snooze
// is compared first (_notify_unsnooze, its own records), so a task's own notification from the
// same observation shows after it and replaces it (one tag per item); returns the step
function _notify_change(item, { state = _task_state(item), list = null, parent = null } = {}) {
  const seen = _todoer.store.notify_seen
  if (!seen) return 'baseline' // before the welcome: the baseline records what stands then
  list ??= _list_of(item, state)
  _notify_unsnooze(item, { state, list, parent })
  const key = _seen_record(state, list)
  const prev = seen[item.id]
  seen[item.id] = key
  const checkin = _checked_in(prev, state, list)
  const step = _notify_step({ setting: _todoer._global_store.notify, prev, key, list, reason: state?.reason, permission: _notify_permission(), checkin })
  if (step != 'notify') return step
  return _notify_todo(item, checkin ? 'checkin' : state.reason, { state, parent })
}

// a todo's notification under `reason` from the device's elected window: the row's text, the
// body naming a labelled item and a child's parent, the click targeting the item; returns the
// step synchronously on the page path or a Promise<'notify' | 'refused'> on the worker path
function _notify_todo(item, reason, { state = null, parent = null } = {}) {
  if (!_notifier_elected()) return 'another window'
  if (parent == null && state?.parent) parent = _parent_of(state.parent)
  const shown = _visible(_extract_todo_snippet(item) ?? '').replace(/\s+/g, ' ')
  const facts = { reason, shown, label: item.label, parent, id: item.saved_id ?? item.id }
  return _notify_result(_notify_show(facts, () => _notify_click(item.id)))
}

// a todo's snooze as the notifier records it: its snooze time while snoozed, else 0
const _snooze_record = item => item._global_store?._todoer?.snoozed || 0

// one decision for a todo's snooze (the snooze dialog's box is the todo's own opt-in: no /notify
// reason, this device's permission alone): the snooze this tab last saw (its time, 0 for none)
// against the todo's store now. 'notify' when that snooze ENDED BY ITS TIME (the sweep's
// unsnooze, on the primary instance: no earlier than UNSNOOZE_SKEW_MS before the time, since the
// devices' clocks differ) with the box's flag still set (the owner's own drag out of the snoozed
// list removes it) and the todo in the main list; an earlier end (a bridge hand-back, which
// keeps the flag: the task's own reason announces it) is no reminder; else the cause of the skip
function _unsnooze_step({ prev, snoozed, notify, list, now, permission }) {
  if (snoozed) return 'snoozed'
  if (!prev) return 'not snoozed'
  if (!notify) return 'no flag'
  if (now < prev - UNSNOOZE_SKEW_MS) return 'ended early'
  if (list != 'main') return 'not in the main list'
  if (permission != 'granted') return `permission ${permission}`
  return 'notify'
}

// a todo's snooze compared with what this tab last saw of it (the baseline at welcome, then every
// observation: _notify_change compares it first, from the hook, each row's render and the minute
// scan, idempotent through the records; the time this tab saw, not the one-shot `unsnoozed`,
// which the list's save clears): a snooze that ended by its time, the dialog's box set, notifies
// `[unsnoozed]` from the device's elected window, kept on screen until clicked (a reminder the
// owner asked for waits on them, as the attention reasons do); returns the step
function _notify_unsnooze(item, { state = _task_state(item), list = null, parent = null } = {}) {
  const seen = _todoer.store.snooze_seen
  if (!seen) return 'baseline' // before the welcome: the baseline records what stands then
  const store = item._global_store?._todoer
  const prev = seen[item.id]
  seen[item.id] = _snooze_record(item)
  list ??= _list_of(item, state)
  const step = _unsnooze_step({ prev, snoozed: store?.snoozed, notify: store?.notify, list, now: Date.now(), permission: _notify_permission() })
  if (step != 'notify') return step
  return _notify_todo(item, 'unsnoozed', { state, parent })
}

// a project's bound children compared after its own projection changed: their list follows it
// (a standing /land gone puts a child's proposal in the main list; the project design 2.9)
function _notify_children(item) {
  if (!_task_state(item)?.project) return 0
  let compared = 0
  each(_items(), child => {
    if (child.id == item.id || !child.tags.includes('#todo')) return
    const parent = _task_state(child)?.parent
    if (!parent || _item(parent, { silent: true })?.id != item.id) return
    _unsnooze_for_bell(child)
    _notify_change(child)
    compared++
  })
  return compared
}

// every todo compared (the notifier's minute scan): the app announces no store hook for a
// delivery that arrives while this tab owes a save for that store (the foreign `_agent` key is
// overlaid and the task item alone re-rendered), nor for its settlement, so such a hand-back
// is noticed by this scan instead, up to a minute later (longer in a hidden window, whose timers
// the browser throttles)
function _scan_notify() {
  let compared = 0
  each(_items(), item => {
    if (!item.tags.includes('#todo')) return
    _notify_change(item)
    compared++
  })
  _notify_items()
  return compared
}

const _notify_tag = id => `todoer:${id}`

const NOTIFY_TEST_DELAY_MS = 5000 // a named item's test notification shows this long after its command: time to go to another window

// a test notification for a named item (`/notify test` with the item's name; the owner,
// 2026-11-25: "i don't have a way to trigger them", "which i can then click and observe"): a
// SAMPLE for the item through the real delivery and its click (_notify_click, through the
// worker's relay or the page): a todo's under its task's reason where that is one that notifies
// (`question` otherwise), a chat's last reply under `reply`, any other item's as an agent's write
// of it under `item`. A real event's card can differ: a delegated todo's check-in is one that
// does not stay on screen, and this shows its question, which does. A todo is told as the list
// tells one, by its VISIBLE tags: an item that only depends on the todo tag through a hidden tag
// is none (the review, 2026-11-25: such an item got an empty question; the two clicks below read
// the same). Shown from this window whichever window is elected, under no setting but this
// device's permission, which the command has checked; returns the step as _notify_result
function _notify_test(item) {
  const id = item.saved_id ?? item.id
  const click = () => _notify_click(item.id)
  if (item.tags_visible?.includes('#todo')) {
    const state = _task_state(item)
    const reason = NOTIFY_REASONS.includes(state?.reason) && state.reason != 'reply' && state.reason != 'item' ? state.reason : 'question'
    const shown = _visible(_extract_todo_snippet(item) ?? '').replace(/\s+/g, ' ')
    return _notify_result(_notify_show({ reason, shown, label: item.label, parent: state?.parent ? _parent_of(state.parent) : null, id }, click))
  }
  if (_vault_replies(item.read()).replies) {
    const shown = item.label || _visible(String(item.text ?? '').split('\n')[0] ?? '')
    return _notify_result(_notify_show({ reason: 'reply', shown, label: null, parent: null, id, body: _reply_line(item.text) }, click))
  }
  const { shown, body } = _item_preview(item)
  return _notify_result(_notify_show({ reason: 'item', shown, label: null, parent: null, id, body }, click))
}

// maps the boolean (or Promise<boolean>) returned by `_notify_show` onto `'notify'` or `'refused'`
function _notify_result(shown) {
  return shown && typeof shown.then == 'function' ? shown.then(ok => (ok ? 'notify' : 'refused')) : shown ? 'notify' : 'refused'
}

// resolves to the active service worker registration within `wait` ms, else null
function _notify_registration(wait = NOTIFY_SW_WAIT_MS) {
  const sw = typeof navigator != 'undefined' ? navigator.serviceWorker : null
  const ready = sw?.ready
  if (!ready || typeof ready.then != 'function') return Promise.resolve(null)
  return new Promise(resolve => {
    let settled = false
    const done = reg => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(reg?.active ? reg : null)
    }
    const timer = setTimeout(() => done(null), wait)
    Promise.resolve(ready).then(done, () => done(null))
  })
}

// installs (or replaces after `/_update` without a reload) this evaluation's service-worker click
// listener under its own guard on `window`, independent of `window._todoer_notifier`; returns true
// when the listener is attached on `navigator.serviceWorker`
function _ensure_notify_listener() {
  if (typeof window == 'undefined') return false
  const sw = typeof navigator != 'undefined' ? navigator.serviceWorker : null
  if (!sw || typeof sw.addEventListener != 'function') return false
  const prev = window._todoer_notify_listener
  if (prev === _on_notify_message) return true
  if (typeof prev == 'function') {
    try {
      sw.removeEventListener?.('message', prev)
    } catch (e) {}
  }
  try {
    sw.addEventListener('message', _on_notify_message)
    sw.startMessages?.()
  } catch (e) {
    if (window._todoer_notify_listener === prev) delete window._todoer_notify_listener
    return false
  }
  window._todoer_notify_listener = _on_notify_message
  return true
}

// shapes a notification title line (and an unnamed item waiting row's line): strips the todo tag
// and one state marker, collapses whitespace, and clips to 80 characters
function _notify_line(text) {
  const clean = String(text ?? '')
    .replace(/(^|\s)#todo(?=\s|$)/gi, '$1')
    .replace(/(^|\s)\[[a-z]+\](?=\s|$)/, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > 80 ? clean.slice(0, 79).trimEnd() + '…' : clean
}

// the facts of a task's notification: the title is the reason, then the row's text without the
// tag and the marker (shortened); the body names a labelled item and a child's parent; one
// notification per item (the tag: a newer one replaces the older and alerts again), the
// attention reasons and a snooze's reminder (`unsnoozed`) kept on screen until dismissed; `data`
// carries what the worker-relayed click needs (`source: 'todoer'` and the durable item id, or
// null for `/notify test`)
function _notification_of({ reason, shown, label, parent, id, body = null, item = id }) {
  const title = `[${reason}] ${_notify_line(shown)}`
  body ??= [label, parent ? `child of ${parent}` : null].filter(s => s).join('\n')
  return {
    title,
    options: {
      body,
      tag: _notify_tag(id),
      renotify: true,
      requireInteraction: NOTIFY_ATTENTION.includes(reason) || reason == 'unsnoozed',
      icon: '/favicon.ico',
      data: { source: 'todoer', item: item ?? null },
    },
  }
}

// page-owned notification fallback (today's `new Notification` path); `onclick` runs on its click
// (the notification closed first); false when the browser refuses the constructor
function _notify_show_page(title, options, onclick) {
  let notification
  try {
    notification = new Notification(title, options)
  } catch (e) {
    console.warn(`todoer: notification refused: ${e?.message ?? e}`)
    return false
  }
  notification.onclick = () => {
    notification.close()
    onclick()
  }
  return true
}

// whether this document's authenticated account was left (the app sets
// `window._notification_account_left = true` before requesting a reload on an account change or
// explicit sign-out): once set, this document starts no notifications (worker or page), sends no
// `ready`, and answers no clicks even if the owner cancels the reload at the discard prompt
function _notify_account_left() {
  return typeof window != 'undefined' && !!window._notification_account_left
}

// the specific service worker the page's strict `hello`/`relay` handshake confirmed (null before
// confirmation, after this document's account was left, while a replacement worker is being
// probed, on an isolated shared origin, or on an app from before the relay)
function _notify_confirmed_worker() {
  if (typeof window == 'undefined' || _notify_account_left() || window._notification_click_relay !== NOTIFY_CLICK_TYPE) return null
  const worker = window._notification_click_worker
  return worker && typeof worker.postMessage == 'function' ? worker : null
}

// whether this page's app has confirmed a live service worker with click relay
function _notify_relayed() {
  return !!_notify_confirmed_worker()
}

// shows the notification through the active service worker registration so it outlives a page
// reload; declines all notifications (worker and page alike) once this document's account was
// left; ensures this evaluation's click listener stands first, rechecks that the confirmed worker
// is still `reg.active` at show time, and falls back to `_notify_show_page` when
// `navigator.serviceWorker` is absent, no confirmed worker stands, the listener cannot be
// installed, no active registration arrives within `wait` ms, `reg.active` no longer matches the
// confirmed worker, or `showNotification` refuses. Returns a boolean synchronously on the
// synchronous paths, else a Promise<boolean> resolving to whether a notification was actually shown
function _notify_show(facts, onclick, wait = NOTIFY_SW_WAIT_MS) {
  if (_notify_account_left()) return false
  const { title, options } = _notification_of(facts)
  if (typeof navigator == 'undefined' || !navigator.serviceWorker || !_notify_confirmed_worker() || !_ensure_notify_listener())
    return _notify_show_page(title, options, onclick)
  return (async () => {
    const reg = await _notify_registration(wait)
    if (_notify_account_left()) return false
    const confirmed = _notify_confirmed_worker()
    if (reg && confirmed && reg.active === confirmed && typeof reg.showNotification == 'function') {
      try {
        await reg.showNotification(title, options)
        return true
      } catch (e) {
        console.warn(`todoer: worker notification refused: ${e?.message ?? e}`)
      }
    }
    if (_notify_account_left()) return false
    return _notify_show_page(title, options, onclick)
  })()
}

// TWO WINDOWS, ONE SELECTION (the owner, 2026-11-25 and 2026-11-26): while two windows are
// linked, after a row's selection one window shows the item as its target, and the other has no
// target and marks the row (keeping its own query and place, so lists that stand on the page
// under that query stay, and its buttons and keys act on the item the other window shows where
// this window has a row for it). Other items reach the link through window._todoer_windows.
// Pressing w or the two-panes button in either window links this window with the other window
// (the one used last), lighting the whole button in both; pressing w or the button in either ends
// the link for both (_send_press). One window of an account holds the account-owned sessionStorage
// record once messages have settled (later `since` wins, ties go to greater id; yielding is not
// unlinking). Every message carries `target` (the window's own target saved_id, `true` when
// unsaved, or `null` when the query has no target).
// While the link is on, the distinction is the EXISTENCE of a target (_window_target), never a
// specific query:
// - Where exactly one of the two windows has no target, it stays the list and the other shows the
//   item, whichever window the selection is made in (a selection in the window with a target opens
//   there and tells the no-target window unasked so its mark moves).
// - Where neither has a target, the selecting window stays the list (keeping its query and place)
//   and asks the other window to show the item (`n` set).
// - Where both have targets, the selecting window gives its target up (setting SEND_LIST_QUERY, or
//   the empty query when SEND_LIST_QUERY resolves as a target, with a 15-step _hold_scroll against
//   the app's no-target scroll-up), marks the row, and asks the other window to show the item.
//   For a nonempty release query, giving up a finalized target (a click, select, or finalized
//   entry) adds a history step and Back returns to it, while a target only typed and never
//   finalized is replaced with no step; for the empty release query (when SEND_LIST_QUERY itself
//   names a single item), clearing a shown target makes and finalizes a new history entry even
//   from a typed, unfinalized target.
// - A window with a target shows buttons and takes keys for its own target and ignores unasked
//   selections told by the other window. A window without a target marks the row of the current
//   partner's reported saved target (keeping the optimistic row while a row handoff is pending,
//   waiting up to SEND_SAVE_MS for an unsaved mounted row's first save, moving scroll only when
//   timely and not wholly readable, and clearing its mark when the partner reports none or an
//   unsaved target).
// - A window asked to show an item (`n` set) opens it (releasing any hold) and answers `took`
//   after opening succeeds; if silent for SEND_ACK_MS, the selecting window forgets the peer,
//   sends `who`, and opens the item locally if nothing intervened.
// - Other items reach the link through window._todoer_windows: `show(item)` asks the partner to
//   show an item without changing the caller's query or scroll (updating a list caller's mark and
//   buttons on `took`, resolving true on `took` else false, leaving the link intact on timeout),
//   `linked()`, and `toggle()`.
const SEND_KEY = 'mindpage_todoer_send'
const SEND_CHANNEL = 'mindpage_todoer_windows'
const SEND_LIST_QUERY = '#todo' // the one query written when a window with a target becomes the list
const SEND_ACK_MS = 3000 // (a window that is busy with its own update answers late: a large account's selection can hold its page for more than a second)
const SEND_TAKE_MS = 2000 // receiver lookup deadline by the clock (< SEND_ACK_MS so the two waits do not cross)
const SEND_SAVE_MS = 10 * 1000 // unsaved-item wait deadline by the clock
const SEND_HELLO_MS = 30 * 1000 // a window says that it is there this often (a hidden tab's timers run about once a minute)
const SEND_STALE_MS = 2 * 60 * 1000 // a window not heard from for this long is taken to be gone

const _send_account = () => (typeof window != 'undefined' ? (window._user?.uid ?? null) : null)

// whether selection stamp `a` ({ at, id }) beats `b`: later clock wins, ties go to the greater id
const _send_beats = (a, b) => !b || a.at > b.at || (a.at == b.at && a.id > b.id)

// this window's own target carried on channel messages: saved_id, true while unsaved, else null
const _send_target_id = (item = _window_target()) => (item ? item.saved_id || true : null)

function _send_on() {
  return _send_since() > 0
}

// when this window turned the link on (0: it did not), owned by the current account:
// a record left in this tab's storage by another account (or without an owner) is forgotten
function _send_since() {
  if (_notify_fixed_view() || _notify_account_left()) return 0
  try {
    const kept = sessionStorage.getItem(SEND_KEY)
    if (!kept) return 0
    const parsed = kept.startsWith('{') ? JSON.parse(kept) : null
    if (!parsed || typeof parsed != 'object' || (parsed.uid ?? null) !== _send_account()) {
      sessionStorage.removeItem(SEND_KEY)
      return 0
    }
    const since = Number(parsed.since)
    return since > 0 ? since : 0
  } catch (e) {
    try {
      sessionStorage.removeItem(SEND_KEY)
    } catch (e2) {}
    return 0
  }
}

// the other window used last among those heard from lately (optionally filtered by `match`); null for none
function _send_peer(now = Date.now(), match = null) {
  if (_notify_fixed_view() || _notify_account_left()) return null
  let best = null
  for (const [id, peer] of window._todoer_windows?.peers ?? []) {
    if (now - peer.seen > SEND_STALE_MS || (match && !match(peer))) continue
    if (!best || peer.used > best.used || (peer.used == best.used && peer.seen > best.seen)) best = { id, ...peer }
  }
  return best?.id ?? null
}

// the live partner linked with this window (its id), or null when unlinked or alone
function _send_partner(now = Date.now()) {
  const me = window._todoer_windows?.me
  return _send_on() ? _send_peer(now) : me ? _send_peer(now, p => p.on && p.to === me) : null
}

const _send_linked = () => _send_on() || !!_send_partner() // link on (including alone while switch is stored)

// current link identity ({ id: holderWindowId, since }, or null when unlinked), used to retire a
// pending save whenever the link ends or is replaced
function _send_link(windows) {
  if (_send_on()) return { id: windows?.me ?? null, since: _send_since() }
  const id = _send_partner()
  return id ? { id, since: windows?.peers.get(id)?.since ?? 0 } : null
}
function _send_same_link(a, b) {
  return !!a && !!b && a.id === b.id && a.since === b.since
}

// cancels the window's one pending handoff (save, ask, or take), or only where `match` holds
function _send_cancel(windows, match = null, took = false) {
  const p = windows?.pending
  if (!p || (match && !match(p))) return
  clearTimeout(p.timer)
  windows.pending = null
  p.resolve?.(took)
}

function _set_shown(windows, id) {
  if (!windows || windows.shown === id) return false
  windows.shown = id
  _sync_marks()
  return true
}

// drops all deferred link work (pending handoff, scroll hold, linked mark, and dedup state)
function _send_retire(windows) {
  if (!windows) return
  windows.clear_recheck?.()
  _send_cancel(windows)
  windows.hold?.()
  windows.last = null
  windows.reported = null
  windows.shown = null
  _sync_marks(_window_target())
}

// reconciles a no-target window's mark with the current linked partner's reported saved target
// (null when unlinked, no target, or unsaved), leaving an outstanding row handoff's optimistic mark
function _send_sync_shown(windows, partner = _send_partner()) {
  if (!windows || _window_target()) return false
  const pending = windows.pending
  if ((pending?.kind == 'ask' && pending.fallback) || (pending?.kind == 'save' && pending.ask)) return false
  const pt = partner ? windows.peers.get(partner)?.target : null
  return _set_shown(windows, typeof pt == 'string' ? pt : null)
}

// the button's press, the w key, and window._todoer_windows.toggle(): links with the other window
// when unlinked (and another window is open), or ends the link for both from either window
function _send_press() {
  if (_notify_fixed_view() || _notify_account_left()) return false
  const windows = window._todoer_windows
  if (!_send_linked()) return _send_peer() ? _send_toggle(true) : false
  const now = Date.now()
  const peer = _send_on() ? _send_peer(now) : null
  const targets = [...(windows?.peers ?? [])].filter(([id, p]) => p.on && (p.to === windows.me || id === peer) && now - p.seen <= SEND_STALE_MS).map(([id]) => id)
  if (_send_on()) _send_toggle(false)
  else _send_retire(windows)
  targets.forEach(to => windows?.say('unlink', { to }))
  return false
}

// turns this window's stored switch on or off; redraws buttons and announces the change (syncing
// this window's mark with the partner's target when turning on without a target, or retiring
// deferred work and the linked mark when turning off)
function _send_toggle(on = !_send_on()) {
  if (_notify_fixed_view()) return false
  const windows = window._todoer_windows
  try {
    if (on) sessionStorage.setItem(SEND_KEY, JSON.stringify({ uid: _send_account(), since: Date.now() }))
    else sessionStorage.removeItem(SEND_KEY)
  } catch (e) {}
  if (!on && windows) _send_retire(windows)
  windows?.say(on ? 'who' : 'hello') // (every message says what this window is now: _start_windows)
  if (on && windows) _send_sync_shown(windows)
  _bin_buttons(_selected_item())
  return _send_on()
}

// asks the linked other window to show `item` without selecting or moving this window; resolves
// true when the other window answers `took` within SEND_ACK_MS, else false (no partner, no saved
// id, no answer in time, or settled early by a cancel from either side: a newer request of this
// window, a newer selection that came in, an unlink, the partner replaced — the other window may
// still have shown it). A plain `show` (no `fallback`) that times out changes nothing else; with
// `fallback` (a row's selection in this window), a timeout forgets the peer, asks `who` so a live
// partner is back at once, and opens `item` locally if nothing else intervened
function _send_ask(item, { fallback = false, acted_at = null, selection = null, checked = false, acted = null, open = null } = {}) {
  const windows = window._todoer_windows
  const target = typeof item == 'string' ? _item(item, { silent: true }) : item
  if (!windows || !target || _notify_fixed_view() || _notify_account_left()) return Promise.resolve(false)
  windows.clear_recheck?.()
  const to = _send_partner()
  if (!to || !target.saved_id) return Promise.resolve(false)
  _send_cancel(windows)
  const at = acted_at ?? Math.max(Date.now(), (windows.seen_at ?? 0) + 1)
  const stamp = { at, id: windows.me }
  windows.seen_at = Math.max(windows.seen_at ?? 0, at)
  windows.sel = stamp
  const id = target.saved_id
  if (fallback) windows.shown = id
  const n = `${_notifier_id()}:${++windows.n}`
  const uid = _send_account()
  const base_acted = acted ?? windows.acted
  const was_on = _send_on()
  const open_raw = live => _open_here(live, selection, checked)
  const opener = fallback ? (open ?? (typeof window._carry_input == 'function' ? window._carry_input(open_raw) : open_raw)) : null
  windows.say('selected', { item: id, target: _send_target_id(), to, n, at, until: Date.now() + SEND_TAKE_MS })
  return new Promise(resolve => {
    const req = {
      kind: 'ask', fallback, n, to, uid, stamp, resolve,
      timer: setTimeout(() => {
        if (windows.pending !== req) return
        windows.pending = null
        resolve(false)
        if (!fallback) {
          if (_send_sync_shown(windows)) _bin_buttons(_selected_item())
          return
        }
        if (_notify_account_left() || _send_account() !== uid || (was_on && !_send_on())) return
        const cur = _send_partner()
        if (cur && cur !== to) return
        const ready = windows.shown === id
        windows.peers.delete(to)
        const after = _send_partner()
        windows.say('who')
        const clear = () => { _send_sync_shown(windows); _bin_buttons(_selected_item()) }
        const ok = () => ready && windows.acted === base_acted && windows.sel === stamp && !_window_target()
        if (!ok()) return clear()
        _bin_buttons(_selected_item())
        _update_dom().then(() => {
          if (!ok() || _notify_account_left() || _send_account() !== uid || (was_on && !_send_on())) return clear()
          const now = _send_partner()
          if (now && now !== to && now !== after) return
          windows.hold?.()
          windows.shown = null
          const live = _item(target.id, { silent: true })
          if (!live || !opener(live)) { _send_sync_shown(windows); _sync_marks(); _bin_buttons(_selected_item()) }
        })
      }, SEND_ACK_MS),
    }
    windows.pending = req
  })
}

// tells the linked other window this window's own target (item: saved_id, or null for "none" when
// the query has no target), once per target (`forced`: again). With `ask` (a row's selection in
// the list window), asks the partner to show `item` via _send_ask (returning true)
function _send_selected(item, forced = false, acted_at = null, ask = false, selection = null, checked = false) {
  const windows = window._todoer_windows
  if (!windows || _notify_fixed_view() || _notify_account_left()) return false
  windows.clear_recheck?.()
  const next_last = item ? item.saved_id ?? null : ''
  if (!ask && !forced && next_last !== null && windows.last === next_last && windows.reported === next_last) {
    if (windows.pending?.kind == 'take' && windows.pending.asked) _send_cancel(windows)
    return false
  }
  if (!forced && item && !item.saved_id && windows.pending?.kind == 'save' && windows.pending.item?.id === item.id && windows.pending.ask === ask) return false
  // a newer selection supersedes any pending handoff (save, ask, or take)
  _send_cancel(windows)
  if (ask && (!item || !_bin_row(item))) return false
  const to = _send_partner()
  if (!to) {
    windows.last = null
    windows.reported = null
    if (ask && _send_on()) windows.say('who')
    return false
  }
  if (ask && item.saved_id) return _send_ask(item, { fallback: true, acted_at, selection, checked }), true
  const at = acted_at ?? Math.max(Date.now(), (windows.seen_at ?? 0) + 1)
  const stamp = { at, id: windows.me }
  windows.seen_at = Math.max(windows.seen_at ?? 0, at)
  windows.sel = stamp
  // an unsaved item carries its selection's ordering while waiting for its saved id (within
  // SEND_SAVE_MS by the clock, while it remains selected and the same link stands)
  if (item && !item.saved_id) {
    if (!ask) windows.say('hello', { target: true, at })
    else if (!_window_target() && (windows.last !== '' || windows.reported !== '')) windows.say('hello', { target: null, at })
    _send_when_saved(item, Date.now() + SEND_SAVE_MS, at, ask, selection, checked)
    return false
  }
  windows.say('selected', { item: item ? item.saved_id : null, target: _send_target_id(item), to, at, until: Date.now() + SEND_TAKE_MS })
  return false
}

// tells the linked other window of a selected item that has no saved id yet, once it has one:
// looked at four times a second until `until` (SEND_SAVE_MS by the clock), and given up where
// another item is selected, the link ends or changes, or the account is left
function _send_when_saved(item, until = Date.now() + SEND_SAVE_MS, acted_at = Date.now(), ask = false, selection = null, checked = false) {
  const windows = window._todoer_windows
  const link = _send_link(windows)
  if (!windows || !link || _notify_fixed_view() || _notify_account_left()) return
  _send_cancel(windows)
  const uid = _send_account()
  const acted = windows.acted
  const open_raw = live => _open_here(live, selection, checked)
  const open = ask ? (typeof window._carry_input == 'function' ? window._carry_input(open_raw) : open_raw) : null
  const req = { kind: 'save', item, uid, link, until, acted_at, ask, timer: null }
  windows.pending = req
  if (ask) windows.shown = item.id
  const drop = () => {
    windows.pending = null
    if (ask) { _send_sync_shown(windows); _bin_buttons(_selected_item()) }
  }
  const look = () => {
    if (windows.pending !== req) return
    if (_notify_fixed_view() || _notify_account_left() || _send_account() !== uid || !_send_same_link(link, _send_link(windows)) || Date.now() > until) return drop()
    const own = _window_target()
    const named = ask
      ? (own ? (own.id === item.id ? own : null) : windows.shown === item.id ? _item(item.id, { silent: true }) : null)
      : own
    if (named?.id !== item.id || (ask && !_bin_row(named))) return drop()
    if (named.saved_id) {
      if (ask && !_send_partner()) return drop()
      windows.pending = null
      if (ask) _send_ask(named, { fallback: true, acted_at, selection, checked, acted, open })
      else _send_selected(named, true, acted_at, false)
      return
    }
    const left = until - Date.now()
    if (left > 0) req.timer = setTimeout(look, Math.min(250, left))
    else drop()
  }
  const left = until - Date.now()
  if (left > 0) req.timer = setTimeout(look, Math.min(250, left))
  else drop()
}

// applies the other window's selection here without coming forward and without saying it back.
// `asked`: asked to show the item (opens it via _open_here, releasing any hold, and answers
// `took` ONLY after opening succeeds); unasked (only in a window without a target): moves the
// row mark to `message.item` where this window has a mounted row for it, moving scroll only when
// the row is not wholly readable (_row_view_top) and leaving the box untouched. Looked for until
// `until` (send-time SEND_TAKE_MS deadline; late deliveries already past `until` are dropped)
function _send_take(message, asked, until = null) {
  const windows = window._todoer_windows
  if (!windows || typeof message.item != 'string' || _notify_fixed_view() || _notify_account_left()) return false
  const end = until ?? (message.until != null && Number.isFinite(Number(message.until)) ? Number(message.until) : Date.now() + SEND_TAKE_MS)
  if (Date.now() > end) return false
  const uid = _send_account()
  const stamp = { at: Number(message.at) || 0, id: message.id }
  if (!_send_beats(stamp, windows.sel)) return false
  _send_cancel(windows)
  const acted = windows.acted
  const req = { kind: 'take', id: message.id, item: message.item, asked, uid, until: end, stamp, timer: null }
  windows.pending = req
  if (!asked) windows.shown = message.item
  const still_linked = () =>
    windows.pending === req &&
    !_notify_fixed_view() &&
    !_notify_account_left() &&
    _send_account() === uid &&
    _send_partner() === message.id &&
    (asked || windows.peers.get(message.id)?.target === message.item)
  const attempt = first => {
    if (!still_linked() || Date.now() > end || !_send_beats(stamp, windows.sel) || (!asked && _window_target())) {
      if (windows.pending === req) windows.pending = null
      return false
    }
    const item = _item(message.item, { silent: true })
    // (an unasked selection marks a mounted row alone: a todo made in the other window has its
    // row here a little after its save, so the row is looked for as the item is)
    if (!item || (!asked && !_bin_row(item))) {
      if (!asked && first) { _sync_marks(null); _bin_buttons(_selected_item()) }
      const left = end - Date.now()
      if (left > 0) req.timer = setTimeout(() => attempt(false), Math.min(250, left))
      else if (windows.pending === req) windows.pending = null
      return false
    }
    windows.pending = null
    if (!asked) {
      windows.sel = stamp
      windows.seen_at = Math.max(windows.seen_at ?? 0, stamp.at)
      _sync_marks(item)
      _bin_buttons(_selected_item())
      if (windows.acted === acted) _move_to_row(item)
      return true
    }
    const prev = [windows.last, windows.reported, windows.sel, windows.seen_at, windows.shown]
    windows.clear_recheck?.()
    windows.hold?.()
    windows.shown = null
    windows.last = item.saved_id ?? item.id
    windows.reported = item.saved_id ?? item.id
    windows.sel = stamp
    windows.seen_at = Math.max(windows.seen_at ?? 0, stamp.at)
    if (!_open_here(item, null, false)) { [windows.last, windows.reported, windows.sel, windows.seen_at, windows.shown] = prev; return false }
    windows.say('took', { n: message.n, target: _send_target_id(item) })
    return true
  }
  return attempt(true)
}

// the windows' channel, once per page (skipped on fixed shared views): each window says it is
// there (start, when asked, every SEND_HELLO_MS, and at a use, at most once a second) with its
// last use time, and `bye` at pagehide. Another account's message or a left account is ignored
function _start_windows() {
  if (typeof BroadcastChannel != 'function' || _notify_fixed_view()) return
  const api = { show: item => _send_ask(item), linked: _send_linked, toggle: _send_press }
  if (window._todoer_windows) return void Object.assign(window._todoer_windows, api)
  const me = _notifier_id()
  const windows = (window._todoer_windows = { me, channel: new BroadcastChannel(SEND_CHANNEL), peers: new Map(), pending: null, hold: null, recheck: null, held: false, n: 0, last: null, reported: null, shown: null, sel: null, seen_at: 0, acted: 0, used: document.hasFocus() ? Date.now() : 0, said: 0, ...api })
  const clear_recheck = () => {
    windows.held = false
    if (!windows.recheck) return
    clearTimeout(windows.recheck)
    windows.recheck = null
  }
  const sync_applied = () => {
    if (_notify_fixed_view() || _notify_account_left() || windows.pending?.kind == 'ask' || windows.pending?.kind == 'save') return void clear_recheck()
    if (!_send_partner()) return
    clear_recheck()
    const live = _send_target_id()
    if ((live == null ? '' : live) === windows.reported) return
    windows.say('hello', { target: live })
  }
  const schedule_recheck = () => {
    if (windows.recheck) clearTimeout(windows.recheck)
    const uid = _send_account()
    const check = () => {
      windows.recheck = null
      if (_notify_fixed_view() || _notify_account_left() || _send_account() !== uid) return void clear_recheck()
      if (window._mindboxDebounced) {
        windows.recheck = setTimeout(check, 100)
        return
      }
      sync_applied()
    }
    windows.recheck = setTimeout(check, 500)
  }
  windows.clear_recheck = clear_recheck
  windows.say = (type, more = {}) => {
    if (_notify_account_left() || _notify_fixed_view()) return
    try {
      const since = _send_since()
      const prevReported = windows.reported
      const debounced = !!window._mindboxDebounced
      const ordered = type == 'selected' || type == 'took' || (type == 'hello' && 'at' in more)
      const target = 'target' in more ? more.target : (debounced ? (prevReported || null) : _send_target_id())
      windows.channel.postMessage({ type, id: me, uid: _send_account(), used: windows.used, on: since > 0, since, to: since > 0 ? _send_peer() : null, ...more, target })
      if (type != 'bye' && type != 'unlink') {
        const told = target == null ? '' : target
        windows.reported = told
        if (ordered && _send_partner()) windows.last = told
        if (!ordered && debounced) {
          windows.held = true
          schedule_recheck()
        } else if (type == 'hello' && !('target' in more) && prevReported !== null && told !== prevReported) {
          windows.held = false
          schedule_recheck()
        } else if (!debounced && !('target' in more)) {
          clear_recheck()
        }
      }
    } catch (e) {}
  }
  const look = () => `${!!_send_peer()}|${_send_linked()}`
  windows.channel.onmessage = event => {
    const message = event?.data
    if (!message || typeof message != 'object' || typeof message.id != 'string' || message.id == me) return
    if ((message.uid ?? null) !== _send_account() || _notify_account_left() || _notify_fixed_view()) return
    const before = look()
    const wasLinked = _send_linked()
    const prevPartner = _send_partner()
    const prevShown = windows.shown
    const shows = _send_on() ? _send_peer() : null
    const prevPeer = windows.peers.get(message.id)
    let nextTarget = message.target ?? null
    if (message.type == 'selected' && message.to == me && message.id == prevPartner) {
      const stamp = { at: Number(message.at) || 0, id: message.id }
      const cur = windows.pending?.kind == 'take' && _send_beats(windows.pending.stamp, windows.sel) ? windows.pending.stamp : windows.sel
      if (!_send_beats(stamp, cur)) nextTarget = prevPeer?.target ?? null
    }
    if (message.type == 'bye') windows.peers.delete(message.id)
    else windows.peers.set(message.id, { used: Number(message.used) || 0, seen: Date.now(), on: !!message.on, to: message.to ?? null, since: Number(message.since) || 0, target: nextTarget })
    // ONE stored record per account once the messages have settled: of two windows holding it,
    // the later `since` stays (ties: greater id). Giving it up is not unlinking: an ask this
    // window sent can still take its `took`. What does not survive giving it up: a selection
    // that waits for its saved id (the link's identity changed: retired below), and the fallback
    // of a row's ask that then times out (it was sent as the holder: no local open, no `who`)
    const mine = _send_since()
    let yielded = false
    if (message.type == 'unlink' && message.to == me && mine > 0) _send_toggle(false)
    else if (message.on && mine > 0 && message.type != 'bye' && message.type != 'unlink') {
      const theirs = Number(message.since) || 0
      if (theirs > mine || (theirs == mine && message.id > me)) {
        try {
          sessionStorage.removeItem(SEND_KEY)
        } catch (e) {}
        yielded = true
      }
      if (message.type != 'who') windows.say('hello')
    }
    else if (_send_on() && _send_peer() != shows && message.type != 'who') windows.say('hello')
    // retire deferred work if the link ended/changed or the partner was replaced (keeping a
    // pending row ask when the sole partner left via bye so its local fallback can open the item)
    const partner = _send_partner()
    if (wasLinked && !_send_linked()) {
      if (!(message.type == 'bye' && windows.pending?.kind == 'ask' && windows.pending.fallback && windows.pending.to == message.id)) _send_retire(windows)
    } else {
      _send_cancel(windows, p => {
        if (p.kind == 'save') return !_send_same_link(p.link, _send_link(windows)) || (p.ask && !partner)
        if (p.kind == 'take') return partner !== p.id || (!p.asked && message.id == partner && nextTarget !== p.item)
        if (p.kind == 'ask') return !!partner && partner !== p.to
        return false
      })
      if (!partner && !((windows.pending?.kind == 'ask' && windows.pending.fallback) || (windows.pending?.kind == 'save' && windows.pending.ask))) _set_shown(windows, null)
    }
    if (message.type != 'bye' && message.type != 'unlink') {
      if (message.id == partner && message.at != null && Number.isFinite(Number(message.at))) windows.seen_at = Math.max(windows.seen_at ?? 0, Number(message.at))
      if (message.type == 'who') windows.say('hello')
      else if (message.type == 'selected' && message.to == me && message.id == partner) {
        const end = message.until != null && Number.isFinite(Number(message.until)) ? Number(message.until) : Date.now() + SEND_TAKE_MS
        const stamp = { at: Number(message.at) || 0, id: message.id }
        const asked = !!message.n
        windows.seen_at = Math.max(windows.seen_at ?? 0, stamp.at)
        if (asked || !_window_target()) {
          const cur = windows.pending?.kind == 'take' && _send_beats(windows.pending.stamp, windows.sel) ? windows.pending.stamp : windows.sel
          if (_send_beats(stamp, cur)) {
            if (Date.now() > end) {
              if (!asked) windows.sel = stamp
            } else {
              _send_cancel(windows)
              if (!asked && !message.item) { windows.sel = stamp; _set_shown(windows, null) }
              else _send_take(message, asked, end)
            }
          }
        }
      }
      else if (message.type == 'took' && windows.pending?.kind == 'ask' && windows.pending.n == message.n && windows.pending.to == message.id) _send_cancel(windows, null, true)
    }
    if (partner && windows.held && !window._mindboxDebounced) sync_applied()
    if (partner) _send_sync_shown(windows, partner)
    if (yielded || look() != before || windows.shown !== prevShown) _bin_buttons(_selected_item())
  }
  const acted = () => { windows.acted++ }
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown', 'popstate', 'resize']) window.addEventListener(type, acted, { capture: true, passive: true })
  if (typeof visualViewport != 'undefined') visualViewport?.addEventListener?.('resize', acted)
  const used = (typing = false) => {
    windows.used = Date.now()
    if (windows.used - windows.said < 1000) return
    windows.said = windows.used
    windows.say('hello', typing && windows.reported !== null ? { target: windows.reported || null } : {})
  }
  window.addEventListener('focus', () => used(false))
  document.addEventListener('pointerdown', () => used(false), { capture: true, passive: true })
  document.addEventListener('keydown', () => used(true), true)
  window.addEventListener('pagehide', () => windows.say('bye'))
  let drawn = look()
  setInterval(() => {
    if (_notify_account_left()) return _send_retire(windows)
    windows.say('hello')
    if (look() != drawn) {
      _send_sync_shown(windows)
      _bin_buttons(_selected_item())
    }
    drawn = look()
  }, SEND_HELLO_MS)
  windows.say('who')
}

// holds this window's scroll position for 15 timer steps (Math.ceil(SEND_HOLD_MS / SEND_HOLD_STEP_MS);
// stepped so a busy page spends one step rather than the whole budget, which can take longer than
// 1.5 s). Owner inputs, history steps, and viewport resizes end it at once
const SEND_HOLD_MS = 1500
const SEND_HOLD_STEP_MS = 100
function _send_steps(uid, done) {
  let left = Math.ceil(SEND_HOLD_MS / SEND_HOLD_STEP_MS)
  let timer = null
  const step = () => {
    if (_notify_account_left() || _send_account() !== uid) return done()
    if (--left > 0) timer = setTimeout(step, SEND_HOLD_STEP_MS)
    else done()
  }
  timer = setTimeout(step, SEND_HOLD_STEP_MS)
  return () => clearTimeout(timer)
}

// holds this window's scroll position against the app's no-target scroll-up when giving up a
// target (both-targets row click -> SEND_LIST_QUERY or ''); ends immediately on any owner input,
// history step, resize, or after the 15 timer steps
function _hold_scroll(top) {
  const windows = window._todoer_windows
  windows?.hold?.()
  const uid = _send_account()
  const vv = typeof visualViewport != 'undefined' ? visualViewport : null
  const put = () => {
    if (_notify_account_left() || _send_account() !== uid) return end()
    if (document.body.scrollTop != top) document.body.scrollTop = top
  }
  const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'popstate', 'resize']
  const end = e => {
    stop()
    document.removeEventListener('scroll', put, true)
    inputs.forEach(type => window.removeEventListener(type, end, true))
    vv?.removeEventListener?.('resize', end)
    if (windows?.hold === end) windows.hold = null
    if (e?.type == 'keydown') put()
  }
  const stop = _send_steps(uid, end)
  document.addEventListener('scroll', put, { capture: true, passive: true })
  inputs.forEach(type => window.addEventListener(type, end, { capture: true, passive: true }))
  vv?.addEventListener?.('resize', end)
  if (windows) windows.hold = end
  put()
  return end
}

// the scroll position a linked window takes for the selected row of `item` (the owner,
// 2026-11-25: "it should probably prefer to scroll to top and only scroll down if the row would
// be out of view, and in that case try to scroll it well inside the viewport, maybe 20% or so to
// leave some margin for additional rows below", "by top of page i mean top of mindbox, not the
// padding above it", and later: "the list window (in linked windows) should not always
// scroll-to-top on selection; only when the selected row is not visible. i know i asked for the
// scroll-to-top behavior but i thought it was implicit that we would not scroll unnecessarily"):
// `top` (where the window stands) whenever the row is wholly in view there (below the window's
// upper edge and above the visible strip of buttons that overlaps the row's width, key_buttons
// pieces or todoer's own buttons, or above the window's lower edge where no strip overlaps; a
// row that touches an edge counts as in view), or for an item without a row; else, for a row
// that is clipped or out of view, the app's top position (where the box stands at the window's
// upper edge) wherever the row shows from there clear of that strip with SEND_ROW_EDGE above it
// (SEND_ROW_FOOT where none overlaps); else the position that puts the row's lower edge at
// SEND_ROW_DEPTH of the window's height or SEND_ROW_EDGE above that strip, whichever is higher up
// the window, so that the next
// rows show below it without falling behind a two-floor strip on a low narrow window. (Until
// then the window stayed where it was and moved by the least that showed the row: the owner, of
// walking a long list with the keys, "ok yes we should do that, the list is already getting
// long")
const SEND_ROW_EDGE = 8 // px kept between the row and the window's top edge (and above the buttons' strip)
const SEND_ROW_FOOT = 64 // fallback px kept free at the window's lower edge where no overlapping strip is visible
const SEND_ROW_DEPTH = 0.8 // a row out of view from the top: its lower edge at this part of the window's height
const _ROW_STRIP_SEL = '.key-buttons-bg-pane,.key-buttons-bg-floor,.key-buttons-guests,.key-buttons-nav,.key-buttons-reload,.key-buttons,.todoer-bin-buttons'
// the top, in the window, of the visible strip of buttons that overlaps the row's width (null where
// none does): one scan for both questions below, whether a row is in view and where a row lands
function _row_strip_top(box) {
  if (typeof document == 'undefined' || !box) return null
  const left = box.left ?? 0
  const right = box.right ?? left + (box.width ?? 0)
  let top = Infinity
  for (const el of document.querySelectorAll(_ROW_STRIP_SEL)) {
    if (el.hidden || el.closest?.('[hidden]') || el.classList?.contains('keyboard')) continue
    const r = el.getBoundingClientRect?.()
    if (!r || !(r.width > 0) || !(r.height > 0)) continue
    if (right > left && (r.right <= left || r.left >= right)) continue
    if (r.top < top) top = r.top
  }
  return top < Infinity ? top : null
}
// what a row that has to be placed is kept clear of at the window's lower edge: the strip with
// SEND_ROW_EDGE above it, or SEND_ROW_FOOT where no strip overlaps the row
function _row_view_foot(box, strip = _row_strip_top(box)) {
  return strip != null ? Math.max(0, innerHeight - strip + SEND_ROW_EDGE) : SEND_ROW_FOOT
}

function _row_view_top(item, top) {
  const box = _bin_row(item)?.row?.getBoundingClientRect?.()
  if (!box || !box.height) return top
  const y = box.top + document.body.scrollTop // the row's place in the page, whatever the position now
  const strip = _row_strip_top(box)
  // wholly readable where the window stands: no move. The window's own upper edge, and the actual
  // top of the strip (the window's lower edge where none overlaps): the margins are for a row
  // that has to be placed, not for deciding whether to move
  if (y >= top && y + box.height <= top + (strip ?? innerHeight)) return top
  const foot = _row_view_foot(box, strip)
  const home = document.querySelector('.header')?.offsetTop ?? 0 // the app's top position
  if (y < home + SEND_ROW_EDGE) return Math.max(0, y - SEND_ROW_EDGE) // (a row above the box: no list stands there)
  if (y + box.height <= home + innerHeight - foot) return home
  const low = Math.min(SEND_ROW_DEPTH * innerHeight, innerHeight - foot)
  return Math.max(home, Math.round(y + box.height - low))
}

function _move_to_row(item) {
  const top = document.body.scrollTop
  const to = _row_view_top(item, top)
  if (to == top) return
  window._todoer_windows?.hold?.()
  typeof _scroll_to == 'function' ? _scroll_to(to) : document.body.scrollTo(0, to)
}

// opens `item` as this window's target and marks `selection` (or `_select_range` when `checked`)
function _open_here(item, selection, checked = false) {
  const ranged = Array.isArray(selection)
  if (typeof item.select != 'function') {
    const select = ranged ? item.text.slice(...selection) : selection
    MindBox.set(item.name, select ? { scroll: true, select } : { scroll: true })
    return true
  }
  if (!item.select()) return false
  if (checked) _select_range(item, ranged ? selection : null)
  else if (selection) MindBox.select_in_target(selection)
  return true
}

// selects a row's item: if linked with a live partner and listed (waiting for its first save if
// unsaved), keeps/becomes the list window when this window has no target or both have targets
// (giving our target up to SEND_LIST_QUERY or '' if it names a target, with a short hold against
// no-target scroll-up) and asks the partner to show it; otherwise opens locally (and tells a
// no-target partner unasked, or asks `who` when alone & on)
function _select_item(item, selection, checked = false) {
  const windows = typeof window != 'undefined' ? window._todoer_windows : null
  const to = windows && typeof _send_partner == 'function' && !_notify_fixed_view() && !_notify_account_left() ? _send_partner() : null
  const listed = !!item && typeof _bin_row == 'function' && !!_bin_row(item)
  const mine = typeof _window_target == 'function' && !!_window_target()
  if (to && listed && (!mine || windows.peers.get(to)?.target)) {
    const acted = windows.acted
    const top = document.body.scrollTop
    const uid = _send_account()
    const hold = mine ? _hold_scroll(top) : null
    if (mine) { MindBox.elem?.blur?.(); MindBox.set(_window_target(SEND_LIST_QUERY) ? '' : SEND_LIST_QUERY) }
    if (item.saved_id) _send_ask(item, { fallback: true, selection, checked })
    else _send_selected(item, false, null, true, selection, checked)
    _sync_marks(item)
    _bin_buttons(_selected_item())
    if (mine)
      _update_dom().then(() => {
        if (windows.hold !== hold || (windows.shown !== item.saved_id && windows.shown !== item.id) || windows.acted !== acted || _notify_account_left() || _send_account() !== uid) return
        const to_y = _row_view_top(item, top)
        if (to_y != top) _hold_scroll(to_y)
      })
    else _move_to_row(item)
    return true
  }
  if (windows && !to && listed && typeof _send_on == 'function' && _send_on() && !_notify_fixed_view() && !_notify_account_left()) {
    windows.last = null
    windows.reported = null
    windows.say('who')
  }
  windows?.hold?.()
  if (windows) windows.shown = null
  if (!_open_here(item, selection, checked)) return false
  if (to && typeof _send_selected == 'function') _send_selected(item)
  return true
}

// selects a stretch of `item` by its offsets in the item's raw text (`range`: [start, end], or
// null for none), as the core's select_in_target does for a text it has found: in the open
// editor, else as the selection the editor takes when it opens (the container's data-selection,
// which the editor consumes on its mount); `edit` then opens the editor as the core's
// edit_target does (the box's focus within the gesture on a touch device, then the target's own
// click). All of it only once the page's update has been applied AND its target is this item.
// The stretch must still stand there (in an open editor: in what the editor holds, which can be
// a draft typed since). Without a stretch that stands, a selection that an earlier click left
// on the closed item is taken back, so that the editor does not open on old offsets; the editor
// is then opened only where no stretch was asked for
function _select_range(item, range, edit = false) {
  const stretch = range ? item.text.slice(...range) : null
  if (edit && navigator.maxTouchPoints) MindBox.elem.focus()
  _update_dom().then(() => {
    const target = document.querySelector('.container.target')
    if (!target || target.getAttribute('data-item-id') != item.id) return
    const stands = !!range && item.text.slice(...range) == stretch
    const textarea = target.querySelector('textarea') // already editing?
    if (textarea) {
      if (!stands) return
      const [from, to] = range.map(offset => _zwsp_offset(textarea.value, offset))
      if (textarea.value.slice(from, to).split(String.fromCharCode(0x200b)).join('') != stretch) return
      textarea.focus()
      textarea.setSelectionRange(from, to)
      return
    }
    if (stands) target.setAttribute('data-selection', range.join(','))
    else target.removeAttribute('data-selection')
    if (!edit || (range && !stands)) return
    target.dispatchEvent(new Event('mousedown'))
    target.dispatchEvent(new Event('click'))
  })
}

// edits the item of a row clicked while the page shows that item as its target, `selection` (the
// todo's line) selected in its editor. The app's select comes first, then the edit of the page's
// target. What the select does there:
// - with the item the target under an equivalent query that is settled, and nothing typed into
//   the box since, it skips the query and the history write, so the box keeps its spelling (set
//   to the item's name, the box held the tab's own id again for an unnamed item the app had
//   selected by its saved id). It still takes the focus out of the box and asks for a scroll to
//   the item, which can move the page when the item is out of view;
// - with the item the target under another query (more terms beside its name, or the explicit
//   id of an item that has a unique label), it gives the item's own name, and can add a history
//   entry;
// - with a name typed into the box and not yet applied (the box's debounce), it supersedes that
//   name for the clicked item, at once. The target the page SHOWS need not be the one it will
//   have when the edit is made, two frames on: left pending, the typed name became the target
//   meanwhile, and the editor opened was that other item's, or the box went over to it afterwards.
// No edit after a refused select (the item is gone). On an app without the select the box is set
// to the item's name and its target edited, as before
// `checked` (a chat-todo's question: a stretch by its offsets, or none where its place was not
// found) opens the editor by _select_range, on this item alone
function _edit_item(item, selection, checked = false) {
  const ranged = Array.isArray(selection)
  if (typeof item.select != 'function') return MindBox.set(item.name, { edit: ranged ? item.text.slice(...selection) : selection })
  if (item.select()) checked ? _select_range(item, ranged ? selection : null, true) : MindBox.edit_target(selection)
}

// a notification's click: this window forward (the browser grants the click's activation to the
// window that showed it), then the item targeted as its row's click does: its name (the unique
// label, else the id reference), a todo's line selected (a chat is targeted alone); false for an
// item deleted meanwhile
function _notify_click(id) {
  window.focus()
  if (typeof id != 'string' || !id) return false
  const item = _item(id, { silent: true })
  if (!item) return false
  const text = item.tags_visible?.includes('#todo') ? _extract_todo_snippet(item) : null
  return _select_item(item, text ? _todo_line(text) : null)
}

// whether this window is a fixed shared view (fallback check when an item lacks `item.select`; on
// current app builds `item.select()` directly refuses selection on fixed views with zero side effects)
function _notify_fixed_view() {
  try {
    const search = typeof location != 'undefined' ? location.search : ''
    return !!search && !!new URLSearchParams(search).get('shared')
  } catch (e) {
    return false
  }
}

// acknowledges receipt of a worker-relayed click synchronously when a worker handle is at hand
// (event.source, else controller, else active registration) so the worker can focus this window
// and delete the stored click
function _notify_ack(id, source = null) {
  if (typeof id != 'string' || !id) return false
  const ack = { type: NOTIFY_CLICK_RECEIVED, id }
  if (typeof source?.postMessage == 'function') {
    try {
      source.postMessage(ack)
      return true
    } catch (e) {}
  }
  const sw = typeof navigator != 'undefined' ? navigator.serviceWorker : null
  if (typeof sw?.controller?.postMessage == 'function') {
    try {
      sw.controller.postMessage(ack)
      return true
    } catch (e) {}
  }
  if (typeof sw?.getRegistration == 'function') {
    Promise.resolve(sw.getRegistration()).then(
      reg => {
        try {
          reg?.active?.postMessage?.(ack)
        } catch (e) {}
      },
      () => {}
    )
    return true
  }
  if (sw?.ready && typeof sw.ready.then == 'function') {
    Promise.resolve(sw.ready).then(
      reg => {
        try {
          reg?.active?.postMessage?.(ack)
        } catch (e) {}
      },
      () => {}
    )
    return true
  }
  return false
}

// handles a click relayed by the app's service worker (attached on EVERY window, not only the
// elected one): leaves unrelated and foreign messages alone without answering; answers `received`
// ONLY when this window can act on the click — the test notification (no item), a duplicate id
// this window already handled, or an item that exists in this window and that this window can
// select (a fixed, shared view refuses selection and stays silent so the worker asks the next
// window or keeps the click)
function _on_notify_message(event) {
  if (_notify_account_left()) return false
  const msg = event?.data
  if (!msg || typeof msg != 'object' || msg.type != NOTIFY_CLICK_TYPE) return false
  const data = msg.data
  if (!data || typeof data != 'object' || data.source != 'todoer') return false
  const id = typeof msg.id == 'string' && msg.id ? msg.id : null
  const handled = (_todoer.store.notify_handled ??= new Set())
  if (id && handled.has(id)) {
    _notify_ack(id, event?.source ?? null)
    return true
  }
  const remember = () => {
    if (!id) return
    handled.add(id)
    if (handled.size > 50) handled.delete(handled.values().next().value)
  }
  if (!data.item) {
    remember()
    _notify_ack(id, event?.source ?? null)
    window.focus()
    return true
  }
  if (typeof data.item != 'string') return false
  const item = _item(data.item, { silent: true })
  if (!item) return false
  const text = item.tags_visible?.includes('#todo') ? _extract_todo_snippet(item) : null
  const line = text ? _todo_line(text) : null
  if (typeof item.select == 'function') {
    if (!item.select()) return false
    remember()
    if (line) {
      try {
        MindBox.select_in_target(line)
      } catch (e) {}
    }
  } else {
    if (_notify_fixed_view()) return false
    MindBox.set(item.name, line ? { scroll: true, select: line } : { scroll: true })
    remember()
  }
  _notify_ack(id, event?.source ?? null)
  window.focus()
  return true
}

// tells each newly confirmed service worker that this window's listener stands and its items are
// loaded: subscribes immediately to the page's `mindpage:notificationclick:relay` event so worker
// replacement (old active -> new confirmed active) sends `ready` whenever todoer's current click
// listener stands and items are loaded, posts `ready` immediately when a confirmed worker already
// stands, and — when welcome ran on an unconfirmed cached corpus (`window._server_confirmed === false`) —
// schedules a one-time retry once the server confirms the corpus so clicks targeting items absent
// from cache are drained when those items arrive. Returns whether `ready` was posted immediately
function _notify_ready() {
  if (typeof window == 'undefined' || window._shared_origin || _notify_account_left()) return false
  if (!_todoer.store.notify_seen || !_ensure_notify_listener()) return false
  const prev = window._todoer_notify_ready_listener
  if (typeof prev == 'function') {
    try {
      window.removeEventListener?.(NOTIFY_CLICK_RELAY, prev)
    } catch (e) {}
  }
  let lastWorker = null
  const sendReady = (force = false) => {
    if (typeof window == 'undefined' || window._shared_origin) return false
    if (typeof window._todoer_notify_listener != 'function' || !_todoer.store.notify_seen) return false
    const worker = _notify_confirmed_worker()
    if (!worker || (!force && worker === lastWorker)) return false
    try {
      worker.postMessage({ type: NOTIFY_CLICK_READY })
      lastWorker = worker
      return true
    } catch (e) {
      return false
    }
  }
  const onRelay = () => {
    sendReady()
  }
  try {
    window.addEventListener?.(NOTIFY_CLICK_RELAY, onRelay)
    window._todoer_notify_ready_listener = onRelay
  } catch (e) {}
  const sent = sendReady()
  // (the wait the pusher's and the sharer's welcome use: when_server_confirmed, util/core.js;
  // guarded for an older installed #util/core that predates the helper)
  if (window._server_confirmed === false && typeof when_server_confirmed == 'function')
    when_server_confirmed(_todoer, 'notify_ready_confirmed', () => void sendReady(true))
  return sent
}

// this window's id in the device's election (session-lived)
const _notifier_id = () => (_todoer.store.notifier_id ??= _command_id())

// the election record a window stored ({id, time}), or null for none or an unreadable one
function _notifier_parse(stored) {
  try {
    const record = stored ? JSON.parse(stored) : null
    return record?.id && typeof record.time == 'number' ? record : null
  } catch (e) {
    return null
  }
}

// the device's election, shared by its windows through localStorage (one browser profile): 'me'
// when this window holds a fresh record, 'other' when another window does, 'vacant' when none
// does or the record is older than NOTIFIER_STALE_MS (a closed or discarded window, or one
// asleep: the elected window refreshes its record every NOTIFIER_REFRESH_MS and releases it when
// its page hides for good, see _start_notifier; after a sleep the first window with something to
// notify takes a vacant election, the owner's next focus or gesture restoring the last-used rule).
// A read and a claim are two storage operations: two windows claiming at once are best effort
function _notifier_step({ record, me, now, stale = NOTIFIER_STALE_MS }) {
  if (!record || !(now - record.time < stale)) return 'vacant'
  return record.id == me ? 'me' : 'other'
}

// the stored election record's text, null without storage
function _notifier_stored() {
  try {
    return localStorage.getItem(NOTIFIER_KEY)
  } catch (e) {
    return null
  }
}

// claim the election for this window (a focus or a gesture: the last-used window), an own record
// refreshed once per NOTIFIER_REFRESH_MS (a stamp per keystroke would be noise); `refresh`
// renews an own record alone (the heartbeat; a stale own record too: a window back from sleep
// keeps its election unless another window claimed the vacancy first) and claims nothing. false
// without storage
function _claim_notifier(refresh = false) {
  const record = _notifier_parse(_notifier_stored())
  const now = Date.now()
  const step = _notifier_step({ record, me: _notifier_id(), now })
  if (refresh && record?.id != _notifier_id()) return false
  if (step == 'me' && now - record.time < NOTIFIER_REFRESH_MS) return true
  try {
    localStorage.setItem(NOTIFIER_KEY, JSON.stringify({ id: _notifier_id(), time: now }))
    return true
  } catch (e) {
    return false
  }
}

// whether this window notifies: the elected one; a vacant election is claimed by the window that
// asks first; without storage every window notifies (the notification's tag collapses them)
function _notifier_elected() {
  const step = _notifier_step({ record: _notifier_parse(_notifier_stored()), me: _notifier_id(), now: Date.now() })
  if (step == 'other') return false
  if (step == 'vacant') _claim_notifier()
  return true
}

// this window's page hiding for good (a close, a navigation away): its election released
function _release_notifier() {
  if (_notifier_step({ record: _notifier_parse(_notifier_stored()), me: _notifier_id(), now: Date.now() }) != 'me') return false
  try {
    localStorage.removeItem(NOTIFIER_KEY)
    return true
  } catch (e) {
    return false
  }
}

// the notifier at welcome: the baseline of every todo's projection and list and snooze and of
// every chat's bridge replies (what stands then never notifies: a reload replays nothing the owner saw), the election's listeners once per
// page (an update of this item re-evaluates the script; the first evaluation's listeners keep
// working on the same store) and the minute task: the elected window's heartbeat and the scan
function _start_notifier() {
  const seen = (_todoer.store.notify_seen = {})
  const snoozes = (_todoer.store.snooze_seen = {})
  const replies = (_todoer.store.reply_seen = {})
  const item_seen = (_todoer.store.item_seen = {})
  const wrote = _item_writes()
  if (wrote) {
    for (const [id, entry] of Object.entries(wrote)) {
      if (entry && typeof entry == 'object' && !Array.isArray(entry) && typeof entry.at == 'number' && Number.isFinite(entry.at))
        item_seen[id] = entry.at
    }
  }
  each(_items(), item => {
    const { replies: count, last, footer } = _vault_replies(item.read())
    if (count) replies[item.id] = { replies: count, footer, last }
    if (!item.tags.includes('#todo')) return
    const state = _task_state(item)
    seen[item.id] = _seen_record(state, _list_of(item, state))
    snoozes[item.id] = _snooze_record(item)
  })
  if (!window._todoer_notifier) {
    window._todoer_notifier = true
    window.addEventListener('focus', () => void _claim_notifier())
    document.addEventListener('pointerdown', () => void _claim_notifier(), { capture: true, passive: true })
    document.addEventListener('keydown', () => void _claim_notifier(), true)
    window.addEventListener('pagehide', () => void _release_notifier())
    if (document.hasFocus()) _claim_notifier()
  }
  _start_windows()
  _ensure_notify_listener()
  // the rows for replies (_waits) read this tab's records, which exist only now
  if (_rows_start() && Object.keys(replies).some(id => _waits(_item(id, { silent: true })))) _rerender_todoer_widgets()
  _notify_ready()
  _todoer.dispatch_task(
    'notifier',
    () => {
      _claim_notifier(true)
      _scan_notify()
      _rows_start()
    },
    NOTIFIER_REFRESH_MS,
    NOTIFIER_REFRESH_MS
  )
}
