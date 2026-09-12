const _todoer = _item('$id')

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

// internal helper for _render_todoer_widget, assumes Sortable loaded
function __render(widget, widget_item) {
  if (!widget) fatal(`invalid/missing widget`)
  // if dragging, set flag and return to avoid breaking drag
  if (widget.classList.contains('dragging')) {
    debug('delaying render due to dragging')
    widget._renderPendingDragging = true
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

  // the bins: the main and snoozed lists keep done/snooze/cancel and gain the AGENT bin (a
  // delegation); the delegated list (design 2.2) has the agent bin (a re-delegation) and the
  // OWNER bin (a take-back) only
  const bin = name => {
    const elem = document.createElement('div')
    elem.className = `${name} bin`
    widget.appendChild(elem)
    return elem
  }
  const done_bin = delegated ? null : bin('done')
  const snooze_bin = delegated ? null : bin('snooze')
  const cancel_bin = delegated ? null : bin('cancel')
  const owner_bin = delegated ? bin('owner') : null
  const agent_bin = bin('agent')
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

  // insert all todo items into list
  let have_unsnoozed = false
  for (const item of _items()) {
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
    const task_list = _task_list(state, pending)
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
    let text = _extract_todo_snippet(item)
    if (!text) continue // no #todo tag found (should have logged error)

    members.add(item.id)
    const div = document.createElement('div')
    div.className = 'list-item'
    const container = document.createElement('div')
    container.className = 'list-item-container'
    if (pending) container.setAttribute('data-pending', pending.kind) // the overlay, until acked
    if (MindBox.get().trim() == 'id:' + item.id)
      container.classList.add('selected')
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

    // helper function to tagify hashtags
    const mark_tags = (
      text // tag regex from util.js in mind.page repo
    ) =>
      text.replace(
        /(^|\s|\()(#[^#\s<>&\?!,.;:"'`(){}\[\]]+)/g,
        '$1<mark>$2</mark>'
      )

    // helper function to linkify urls (regex from util.js in mind.page repo)
    // we use _replace_tags to exclude code blocks, html tags, etc
    // we apply after link_markdown_links so they are excluded (as html tags)
    const link_urls = text =>
      _replace_tags(
        text,
        /(^|\s|\()([a-z](?:[-a-z0-9\+\.])*:\/\/[^\s)</]+\/?[^\s)<:]*[^\s)<:,.])/g,
        (m, pfx, url) => `${pfx}<a>${url}</a>`
      )

    // helper function to linkify markdown links
    const link_markdown_links = text =>
      text.replace(
        /\[\s*(.*?)\s*\]\(\s*(.*?)\s*\)/g,
        (m, text, href) => `<a href="${_.escape(href)}">${text}</a>`
      )

    // the row (and its tooltip) shows the snippet without its hidden tags (#_…, hidden everywhere
    // else in the app; a task's route tag is not part of what the owner wrote) and without the
    // grammar view's inert-region tokens (⟦…⟧: the agent's answers and plans read as tokens)
    const visible = s => s.replace(/(^|\s)#_[^#\s<>&?!,.;:"'`(){}\[\]]+/g, '$1').replace(/\u27e6[^\u27e7]*\u27e7/g, '')
    container.title = visible(text) // original whitespace for title
    const shown = visible(text).replace(/\s+/g, ' ')

    // determine suffix vs prefix snippet based on #todo suffix match
    if (!text.match(/(?:^|\s|\()#todo$/)) {
      if (!text.startsWith('#todo')) fatal('missing #todo prefix') // sanity check
      if (text.endsWith(' …')) container.setAttribute('data-truncated', true) // used for done/cancel
      const html = _.escape(shown)
      div.innerHTML = link_urls(link_markdown_links(mark_tags(html)))
    } else {
      if (text.startsWith('… ')) container.setAttribute('data-truncated', true) // used for done/cancel
      // use direction=rtl to truncate (and add ellipsis) on the left
      div.style.direction = 'rtl'
      div.style.textAlign = 'left'
      // div.style.marginLeft = '60px'
      // set title on container to avoid &lrm in title text

      // clip on Safari since text-overflow:ellipsis truncates wrong end for rtl
      // it only ~works if original whitespace is maintained (by dropping lines)
      // see webkit bug at https://bugs.webkit.org/show_bug.cgi?id=164999
      if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent))
        div.style.textOverflow = 'clip'

      const html = _.escape(shown)
      // use &lrm; to avoid non-alphanumeric prefixes being treated as ltr
      // see https://stackoverflow.com/a/27961022
      div.innerHTML = '&lrm;' + link_urls(link_markdown_links(mark_tags(html)))
    }

    if (snoozed)
      container.title =
        new Date(item._global_store._todoer.snoozed).toLocaleString() +
        '\n' +
        container.title
    if (delegated) {
      const updated = state?.updated
      const age = document.createElement('mark')
      age.className = 'age'
      age.innerText = _age(updated, Date.now())
      age.title = updated ? new Date(updated).toLocaleString() : 'not acknowledged yet'
      div.prepend(age, ' ')
    }

    // handle clicks and modify styling for non-todo tags (the age mark is not a tag)
    div.querySelectorAll('mark:not(.age)').forEach(elem => {
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
    div.querySelectorAll('a').forEach(elem => {
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
      text = text.replace(/^[\s…]+|[\s…]+$/g, '') // trim for selection
      MindBox.set(
        'id:' + item.id,
        edit ? { edit: text } : { scroll: true, select: text }
      )
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
                if (saved_ids.includes(null)) return // try again later

                // store the merged order under storage_key (ids this tab does not show are
                // kept in place: see _merged_order), never pruned by what this tab has loaded
                const gs = widget_item._global_store // saved manually below
                gs._todoer ??= {}
                if (_order_blocked(gs._todoer)) {
                  // a newer build wrote the store: this one stops writing orders (once told);
                  // null ends the save task (a later render schedules the next attempt)
                  if (!_todoer.store.reload_notice) {
                    _todoer.store.reload_notice = true
                    alert('please reload to keep your todo order (todoer update required)')
                  }
                  return null
                }
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
      widget.classList.remove('dragging')
      // _update_dom().then(() => widget_item.touch())
      // _delay(1000).then(_update_dom).then(() => widget_item.touch())
      // trigger pending render if any
      if (widget._renderPendingDragging) {
        delete widget._renderPendingDragging
        setTimeout(() => __render(widget, widget_item))
      }
    },
    onEnd: e => {
      // debug('onEnd')
      // widget.classList.remove('dragging')
      const id = e.item.getAttribute('data-id')
      const truncated = e.item.getAttribute('data-truncated')
      const item = _item(id)
      if (e.to == agent_bin) {
        // a delegation (or a re-delegation from the delegated list): the command document is
        // the acceptance; the row moves through the overlay once it is enqueued
        agent_bin.firstChild.remove()
        _delegate(item).then(ok => {
          if (!ok) list.insertBefore(e.item, list.children[e.oldIndex])
        })
      } else if (e.to == owner_bin) {
        owner_bin.firstChild.remove()
        _takeback(item).then(ok => {
          if (!ok) list.insertBefore(e.item, list.children[e.oldIndex])
        })
      } else if (e.to == cancel_bin) {
        cancel_bin.firstChild.remove()
        item.delete()
        // if (!truncated) item.delete()
        // else item.write(item.text.replace(/#todo\b/g, '#cancelled'), '')
        // // log if logger exists
        // if (_exists('#logger'))
        //   MindBox.create('/log cancelled ' + e.item.title.replace(/\s+/g, ' '))
      } else if (e.to == done_bin) {
        // gate ALL side effects (DOM removal, /log) on an ACCEPTED mutation (review 151
        // §2.4): the fail-closed branch must not report completion, and item.write's
        // boolean result is the acceptance signal (a refused write must not log as done)
        const grammar = window._grammar
        if (truncated && !(grammar?.version >= 2)) {
          // FAIL CLOSED, never raw (review 150 §2.4): a raw rewrite could alter #todo
          // bytes inside a vault_result candidate. restore the dragged row (the snooze
          // branch's cancellation idiom) so the widget matches the unchanged item.
          list.insertBefore(e.item, list.children[e.oldIndex])
          alert('please reload to complete todos (app update required)')
          return
        }
        let completed
        if (!truncated) {
          // delete() returns deleteItem()'s boolean: false on fixed/shared mode or a
          // declined confirmation (review 152 §2.1) -- a declined delete must not log
          completed = item.delete() === true
        } else {
          // over the GRAMMAR VIEW (review 149 §2): a #todo inside a vault_result candidate
          // must not be rewritten, and the raw envelope must survive
          completed =
            item.write(grammar.edit(item.text, view => view.replace(/#todo\b/g, '#done')), '') === true
        }
        if (!completed) {
          list.insertBefore(e.item, list.children[e.oldIndex])
          alert(`could not complete todo (mutation refused) for ${item.name}`)
          return
        }
        done_bin.firstChild.remove()
        // log if logger exists
        if (_exists('#logger'))
          MindBox.create('/log done ' + e.item.title.replace(/\s+/g, ' '))
      } else if (e.to == snooze_bin) {
        snooze_bin.firstChild.remove()
        item.global_store._todoer ??= {}
        if (snoozed) {
          _unsnooze(item)
        } else {
          // item.global_store._todoer.snoozed = Date.now() + 5 * 1000
          _todoer.store._snooze_modal = _modal(
            _todoer
              .read('html_snooze_modal')
              .replaceAll(
                '__onclick__',
                `_item('#todoer').eval('_on_snooze(event)')`
              )
              .replaceAll(
                '__onchange__',
                `_item('#todoer').eval('_on_snooze_input_change(event)')`
              ),
            {
              canConfirm: () => false, // toggled in _on_snooze_input_change
              onConfirm: () =>
                _modal_close(_todoer.store._snooze_modal, _snooze_input()),
            }
          )
          _todoer.store._snooze_modal.then(snooze_time => {
            if (
              !is_number(snooze_time)
              // || !confirm(`Snooze to ${new Date(snooze_time)}?`)
            )
              list.insertBefore(e.item, list.children[e.oldIndex])
            else item.global_store._todoer.snoozed = snooze_time
          })
          _update_dom().then(() => {
            document.querySelector('.snooze-modal input').value =
              new Date().toInputValue()
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
        }
      }
    },
  })

  for (const elem of [done_bin, snooze_bin, cancel_bin, owner_bin, agent_bin])
    if (elem) elem.sortable = Sortable.create(elem, { group: widget.id })

  // NOTE: this is no longer needed w/ 'dragging' class moved to onStart instead of onChoose, preventing the list item div from being shrunk under the cursor prematurely, sending clicks to the widget instead
  // widget.onclick = e => {
  //   // ignore clicks on background (widget) too close to an item being let go
  //   if (Date.now() - last_unchoose_time < 250) {
  //     e.stopPropagation()
  //     e.preventDefault()
  //   }
  // }
}

Date.prototype.toInputValue = function () {
  // from https://stackoverflow.com/a/16010247
  let local = new Date(this)
  local.setMinutes(this.getMinutes() - this.getTimezoneOffset())
  return local.toJSON().slice(0, 16)
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
  else _modal_close(_todoer.store._snooze_modal, time)
}

function _snooze_input() {
  const input = document.querySelector('.snooze-modal input')
  return input.valueAsNumber + new Date().getTimezoneOffset() * 60 * 1000
}

function _on_snooze_input_change() {
  const can_confirm = _snooze_input() >= Date.now()
  _modal_update(_todoer.store._snooze_modal, { canConfirm: () => can_confirm })
  document
    .querySelector('.snooze-modal .button.snooze')
    .classList.toggle('disabled', !can_confirm)
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

// unsnooze todo item
function _unsnooze(item) {
  merge(item.global_store._todoer, { snoozed: 0, unsnoozed: Date.now() })
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

// extract todo snippet from item
function _extract_todo_snippet(item) {
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
      if (cutoff >= 0) text = text.substr(0, 200 + cutoff) + ' …'
    }
  } else {
    // use prefix (without the log), truncate (and align) on left
    text = _without_log(text.substring(0, todo_offset + 5))
    if (text.length > 200) {
      // truncate on _last_ whitespace in head (index < end - 200)
      // note we only truncate on whitespace to avoid breaking tags or urls
      const cutoff = text.substr(0, text.length - 200).search(/\s[^\s]*$/)
      if (cutoff >= 0) text = '… ' + text.substr(cutoff + 1)
    }
  }

  return text
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

// detect any changes to todo items & re-render widgets as needed
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // ignore dependency changes
  const item = _item(id, { silent: true }) // can be null if item deleted
  // item must exist and be tagged with #todo (to be added or updated)
  // OR it must listed in a widget on a dependent (to be removed)
  const is_todo_item = item?.tags.includes('#todo')
  each(_this.dependents, dep => {
    const item = _item(dep)
    if (is_todo_item || _listed(item, id)) {
      item.elem?.querySelectorAll('.todoer-widget').forEach(widget => {
        _render_todoer_widget(widget, item)
      })
    }
  })
}

// whether any widget of a pinned item lists the todo (membership is tracked per widget)
function _listed(pinned, id) {
  return Object.values(pinned.store._todoer?.items ?? {}).some(set => set.has(id))
}

// detect any changes to global stores on todo items
function _on_global_store_change(id, remote) {
  const item = _item(id, { silent: true }) // can be null if item deleted
  if (item?.tags.includes('#todo')) _on_item_change(id)
}

// detect changes to search query, specifically for id:<todo_item_id>
function _on_search(text) {
  const target_item = _item(text.trim(), { silent: true }) // null if text does not match item
  const is_todo_item = target_item?.tags.includes('#todo')
  if (
    !is_todo_item &&
    !document.querySelector('.todoer-widget .list-item-container.selected')
  )
    return
  each(_this.dependents, dep => {
    const item = _item(dep)
    if (_listed(item, target_item?.id) || item.elem?.querySelector('.list-item-container.selected')) {
      item.elem?.querySelectorAll('.todoer-widget').forEach(widget => {
        _render_todoer_widget(widget, item)
      })
    }
  })
}

// start unsnooze task on welcome
function _on_welcome() {
  _this.dispatch_task(
    'unsnooze',
    () => {
      if (!_primary) return
      each(_items(), item => {
        const snoozed = item._global_store._todoer?.snoozed
        if (snoozed && Date.now() >= snoozed) _unsnooze(item)
      })
    },
    0,
    60 * 1000
  ) // run now and every minute
}


// ---- tasks (design notes/design/mind_task_agents.md, 2.2 and 2.3) -------------------------

// the task projection the bridge writes into the item's store, or null for a todo the bridge
// never held ({held, reason, epoch, rev, updated, worktree, phase, acked})
function _task_state(item) {
  const state = item._global_store?._agent?.state
  return state && typeof state == 'object' ? state : null
}

// this tab's pending commands by item id ({id, kind}): the overlay from the enqueue until the
// bridge's `acked` names the id (a stale, refused, or invalidated disposition clears it too)
const _pending_commands = () => (_todoer.store.pending ??= {})

// where a todo belongs (design 2.2): the pending command first (a take-back puts the item in the
// main list, a delegate in the delegated list), else the projection's possession
function _task_list(state, pending) {
  if (pending && !state?.acked?.[pending.id]) return pending.kind == 'takeback' ? 'main' : 'delegated'
  return state?.held == 'agent' ? 'delegated' : 'main'
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

// re-render every todoer widget (the overlay changed)
function _rerender_todoer_widgets() {
  each(_todoer.dependents, dep => {
    const item = _item(dep)
    item.elem?.querySelectorAll('.todoer-widget').forEach(widget => _render_todoer_widget(widget, item))
  })
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

// the checks every gesture shares; returns the target item or null (reported)
function _task_target(item, kind) {
  if (!item) return null
  if (!item.tags.includes('#todo')) {
    alert(`cannot ${kind} ${item.name}: not a #todo item`)
    return null
  }
  if (!item.saved_id) {
    alert(`cannot ${kind} ${item.name}: item not saved yet`)
    return null
  }
  return item
}

// delegate a todo (design 2.3): the body is captured BEFORE the presentation edits (the route
// tag and the [delegated] marker) so the instruction is exactly what the owner wrote; a refused
// enqueue (the size gate) reports and changes nothing; a pending take-back refuses the gesture
async function _delegate(item) {
  item = _task_target(item, 'delegate')
  if (!item) return false
  const state = _task_state(item)
  const pending = _pending_commands()[item.id]
  if (pending?.kind == 'takeback' && !state?.acked?.[pending.id]) {
    alert(`take-back of ${item.name} pending; delegate again after it is acknowledged`)
    return false
  }
  // the capture is the RAW text (item.text): item.read() is the grammar view, whose inert
  // regions (the agent's answers and plans) are tokens, never the bytes the bridge must see
  const grammar = window._grammar
  if (!(grammar?.version >= 2)) {
    alert('please reload to delegate todos (app update required)')
    return false
  }
  const command = {
    task: item.saved_id,
    id: _command_id(),
    kind: 'delegate',
    epoch: state?.epoch ?? 0,
    at: Date.now(),
    body: item.text,
  }
  if (!(await _enqueue_command(item, command))) return false
  // the presentation: the marker at every delegation and the route tag once, planned over the
  // grammar view of the CURRENT raw text (an edit made during the await is kept; the inert
  // regions survive the rewrite); a refused write is repaired by the bridge at the next state change
  const text = grammar.edit(item.text, view => _delegated_view(view))
  if (item.write(text, '') !== true) console.warn(`delegate: presentation write refused for ${item.name}`)
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
  item = _task_target(item, 'take back')
  if (!item) return false
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

// => /delegate [item]
// delegate `item` (default: the targeted item) to the vault agent: start or resume the task
async function _on_command_delegate(args, name) {
  const item = _command_target(name, '/delegate')
  // a refused gesture (reported in a dialog) leaves the command in the box, as /edit does
  if (!item || !(await _delegate(item))) return `/delegate ${args}`
  return null
}

// => /takeback [item]
// take `item` (default: the targeted item) back from the vault agent
async function _on_command_takeback(args, name) {
  const item = _command_target(name, '/takeback')
  if (!item || !(await _takeback(item))) return `/takeback ${args}`
  return null
}
