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
  widget.querySelectorAll(':is(.list,.bin)')?.forEach(col => {
    col.sortable.destroy() // important, prevents flickering, see note below
    col.remove()
  })

  const done_bin = document.createElement('div')
  done_bin.className = 'done bin'
  widget.appendChild(done_bin)

  const snooze_bin = document.createElement('div')
  snooze_bin.className = 'snooze bin'
  widget.appendChild(snooze_bin)

  const list = document.createElement('div')
  list.className = 'list'
  widget.appendChild(list)

  const cancel_bin = document.createElement('div')
  cancel_bin.className = 'cancel bin'
  widget.appendChild(cancel_bin)

  // parse widget options for required tags & storage key
  const options = widget_item.store[widget.id]?.options ?? {}
  let { tags = [], snoozed, storage_key } = options
  if (is_string(tags)) tags = tags.split(/[,;\s]+/).filter(t => t)
  tags = tags.map(tag => {
    if (tag.match(/^[^#!-]/)) return '#' + tag // tag w/o # or negation
    if (tag.match(/^[!-][^#]/)) return tag[0] + '#' + tag // negation w/o #
    return tag // valid tag or negation: #tag | -#tag | !#tag
  })
  tags = uniq(['#todo', ...tags]) // prepend #todo & remove duplicates
  if (!tags.every(tag => tag.match(/^[!-]?#[^#\s<>&\?!,.;:"'`(){}\[\]]+$/)))
    fatal(`invalid tags ${tags}`)
  // use comma-separated tags as default storage key
  // note snoozed flag can be excluded since snooze lists are not saved
  storage_key ??= tags.join(',')

  // console.debug(`rendering list ${storage_key} in ${widget.id} ...`)

  // initialize set of todo items in session-lived store
  widget_item.store._todoer = { items: new Set() }

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
    // skip based on snoozed state (via metadata in item's own global store)
    if (!!snoozed != !!item._global_store._todoer?.snoozed) continue
    // record if we have unsnoozed items to trigger a sort & save below
    if (item._global_store._todoer?.unsnoozed) have_unsnoozed = true

    widget_item.store._todoer.items.add(item.id)
    const div = document.createElement('div')
    const parent = document.createElement('div')
    list.appendChild(parent)
    parent.appendChild(div)
    parent.setAttribute('data-id', item.id) // used for saving below
    div.className = 'list-item'
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

    // read text from todo item
    let text = item.read()

    // helper function to tagify hashtags
    const mark_tags = (
      text // tag regex from util.js in mind.page repo
    ) =>
      text.replace(
        /(^|\s|\()(#[^#\s<>&\?!,.;:"'`(){}\[\]]+)/g,
        '$1<mark>$2</mark>'
      )

    // helper function to linkify urls
    const link_urls = text =>
      text.replace(/(^|\s|\()(https?:\/\/[^\s)<]*)/g, '$1<a>$2</a>')

    // use suffix if looks reasonable, otherwise use prefix truncated on left
    if (text.match(/#todo\s*[\w#]/)) {
      // use suffix, truncate on right
      text = text.replace(/.*#todo/s, '')
      text = text.substr(0, 200) + (text.length > 200 ? '…' : '')
      parent.title = '#todo' + _.escape(text) // original whitespace for title
      // const html = '#todo' + _.escape(text)
      const html = '#todo' + _.escape(text.replace(/\s+/g, ' '))
      div.innerHTML = link_urls(mark_tags(html))
    } else {
      // use prefix, truncate (and align) on left
      text = text.replace(/#todo.*/s, '')
      text = (text.length > 200 ? '…' : '') + text.substr(-200)
      // use direction=rtl to truncate (and add ellipsis) on the left
      div.style.direction = 'rtl'
      div.style.textAlign = 'right'
      // div.style.marginLeft = '60px'
      // set title on parent to avoid &lrm in title text
      parent.title = _.escape(text) + '#todo' // original whitespace for title

      // clip on Safari since text-overflow:ellipsis truncates wrong end for rtl
      // it only ~works if original whitespace is maintained (by dropping lines)
      // see webkit bug at https://bugs.webkit.org/show_bug.cgi?id=164999
      if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent))
        div.style.textOverflow = 'clip'

      // const html = _.escape(text) + '#todo'
      const html = _.escape(text.replace(/\s+/g, ' ')) + '#todo'
      // use &lrm; to avoid non-alphanumeric prefixes being treated as ltr
      // see https://stackoverflow.com/a/27961022
      div.innerHTML = '&lrm;' + link_urls(mark_tags(html))
    }

    if (snoozed)
      parent.title =
        new Date(item._global_store._todoer.snoozed).toLocaleString() +
        '\n' +
        parent.title

    // handle clicks and modify styling for non-todo tags
    div.querySelectorAll('mark').forEach(elem => {
      elem.title = elem.innerText
      if (elem.innerText.toLowerCase() == '#todo') return
      elem.onclick = e => {
        e.stopPropagation()
        e.preventDefault()
        MindBox.set(elem.innerText.replace(/#_/, '#'))
      }
    })

    // handle clicks on urls
    div.querySelectorAll('a').forEach(elem => {
      elem.title = elem.innerText
      const url = elem.innerText
      elem.innerText = elem.innerText.replace(/(:\/\/.+?)\/(.+)/, '$1/…')
      elem.onclick = e => {
        e.stopPropagation()
        e.preventDefault()
        window.open(url, '_blank')
      }
    })

    // handle click on list item
    div.onclick = e => {
      e.stopPropagation() // do not propagate click to item
      e.preventDefault()
      // widget.classList.remove('dragging') // gets stuck otherwise

      const source = item.id
      MindBox.set('id:' + source)

      // edit item w/ snippet selected
      // code mirrors that in logger.js in mind.items (see comments there)
      const edit_target = () => {
        const target = document.querySelector('.container.target')
        if (!target) return null
        if (target.getAttribute('item-id') != source) {
          console.error('target id mismatch')
          return null
        }
        target.dispatchEvent(new Event('mousedown'))
        target.dispatchEvent(new Event('click'))
        setTimeout(() => {
          const textarea = target.querySelector('textarea')
          if (!textarea) {
            console.warn('missing textarea in target')
            return
          }
          // trim … and whitespace
          text = text.replace(/^[\s…]|[\s…]$/g, '')
          const pos = textarea.value.indexOf(text)
          if (pos < 0) console.error('could not find text: ' + text)
          else {
            // NOTE: dispatched refocus after blur is more robust on ios
            textarea.setSelectionRange(0, 0)
            textarea.blur()
            textarea.focus()
            textarea.setSelectionRange(pos, pos + text.length)
            setTimeout(() => {
              textarea.focus()
              textarea.setSelectionRange(pos, pos + text.length)
            })
          }
        })
        return target
      }

      // handle onclick on widget
      widget.onclick = e => {
        e.stopPropagation() // do not propagate click to item
        e.preventDefault()
        // widget.classList.remove('dragging') // gets stuck otherwise
      }

      // NOTE: immediate edit can fail during/after init and can focus on wrong target, and dispatched edit can fail to focus on iphones, which we attempt to work around by focusing on the top textarea first
      document.querySelector('textarea').focus()
      setTimeout(edit_target)
    }
  }

  const item_for_elem = e => _item(e.getAttribute('data-id'))
  if (snoozed) {
    // reorder snooze list items based on snooze times
    sort_by(
      Array.from(list.children),
      e => item_for_elem(e)._global_store._todoer.snoozed
    ).forEach(elem => list.appendChild(elem))
  } else if (have_unsnoozed) {
    // reoder unsnoozed items to top based on negative unsnooze time
    sort_by(
      Array.from(list.children),
      e => -(item_for_elem(e)._global_store._todoer?.unsnoozed ?? 0)
    ).forEach(elem => list.appendChild(elem))
    // trigger a save to remove unsnooze times and switch to custom ordering
    setTimeout(() => list.sortable.save())
  }

  // initialize sortable objects attached to list elements
  // we destroy objects as elements are removed on re-render (see above)
  // otherwise dragging items on a re-rendered list can cause flickering
  list.sortable = Sortable.create(list, {
    group: widget.id,
    sort: !snoozed, // no reordering for snoozed list
    // animation: 150,
    delay: 250,
    delayOnTouchOnly: true,
    // touchStartThreshold: 5,
    store: snoozed
      ? null /* disabled for snooze list */
      : {
          get: () => {
            const ids =
              widget_item._global_store._todoer?.[storage_key]?.split(',') ?? []
            if (snoozed)
              sort_by(ids, id => _item(id)._global_store._todoer?.snoozed)
            else
              sort_by(
                ids,
                id => -(_item(id)._global_store._todoer?.unsnoozed ?? 0)
              )
            return ids
          },
          set: sortable => {
            // dispatch task to ensure that all items have been saved
            dispatch_task(
              `save.${widget.id}.${storage_key}`,
              () => {
                if (list.parentElement != widget) return null // cancel (removed)
                console.debug(`saving list ${storage_key} in ${widget.id}`)

                // determine saved (permanent) ids for global store
                const saved_ids = sortable
                  .toArray()
                  .map(id => _item(id).saved_id)
                if (saved_ids.includes(null)) return // try again later

                // store saved_ids under storage_key & filter all ids using _exists
                const gs = widget_item._global_store // saved manually below
                delete gs._todoer[storage_key] // added back after filtering
                gs._todoer = map_values(gs._todoer, v =>
                  v.split(',').filter(_exists).join()
                )
                gs._todoer[storage_key] = saved_ids.join()
                gs._todoer = pick_by(gs._todoer, v => v.length > 0) // filter empties

                // clear unsnoozed flags/times to prevent custom order override
                each(saved_ids, id => {
                  if (_item(id)._global_store._todoer?.unsnoozed)
                    delete _item(id).global_store._todoer.unsnoozed
                })

                // save changes to global store
                // note invalidation is unnecessary since element controls storage
                widget_item.save_global_store({ invalidate_elem_cache: false })
                return null // finish repeating task
              },
              0,
              1000
            ) // try now and every 1s until saved
          },
        },
    forceFallback: true, // fixes dragging behavior, see https://github.com/SortableJS/Sortable/issues/246#issuecomment-526443179
    onChoose: () => {
      widget.classList.add('dragging')
    },
    onStart: () => {
      widget.classList.add('dragging')
    },
    onUnchoose: () => {
      widget.classList.remove('dragging')
    },
    onEnd: e => {
      widget.classList.remove('dragging')
      const id = e.item.getAttribute('data-id')
      if (e.to == cancel_bin) {
        cancel_bin.firstChild.remove()
        _item(id).delete()
      } else if (e.to == done_bin) {
        done_bin.firstChild.remove()
        _item(id).delete()
        // log if logger exists
        if (_exists('#logger'))
          MindBox.create('/log done ' + e.item.textContent.replace(/\s+/g, ' '))
      } else if (e.to == snooze_bin) {
        snooze_bin.firstChild.remove()
        _item(id).global_store._todoer ??= {}
        if (snoozed) {
          _item(id).global_store._todoer.snoozed = 0 // unsnooze
          _item(id).global_store._todoer.unsnoozed = Date.now()
        } else {
          // _item(id).global_store._todoer.snoozed = Date.now() + 5 * 1000
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
            if (!is_number(snooze_time))
              list.insertBefore(e.item, list.children[e.oldIndex])
            else _item(id).global_store._todoer.snoozed = snooze_time
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

  done_bin.sortable = Sortable.create(done_bin, {
    group: widget.id,
  })

  snooze_bin.sortable = Sortable.create(snooze_bin, {
    group: widget.id,
  })

  cancel_bin.sortable = Sortable.create(cancel_bin, {
    group: widget.id,
  })
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
  date.setHours(8)
  date.setMinutes(0)
  date.setSeconds(0)
  return date
}
function _snooze_weekend() {
  const date = new Date()
  do {
    date.setDate(date.getDate() + 1)
  } while (date.getDay() != 6)
  date.setHours(8)
  date.setMinutes(0)
  date.setSeconds(0)
  return date
}
function _snooze_next_week() {
  const date = new Date()
  do {
    date.setDate(date.getDate() + 1)
  } while (date.getDay() != 1)
  date.setHours(8)
  date.setMinutes(0)
  date.setSeconds(0)
  return date
}

// render widget in item
function _render_todoer_widget(widget, item = _this) {
  const url = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js'
  if (window.Sortable) __render(widget, item)
  else _load(url).then(() => __render(widget, item))
}

// create pinned item w/ widget
function create_pinned_item() {
  const item = _create()
  item.write_lines(`#_pin/1 `, `\<<todoer_widget()>>`, `#_todoer`)
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
  const item = _item(id, false) // can be null if item deleted
  // item must exist and be tagged with #todo (to be added or updated)
  // OR it must listed in a widget on a dependent (to be removed)
  const is_todo_item = item?.tags.includes('#todo')
  each(_this.dependents, dep => {
    const item = _item(dep)
    if (is_todo_item || item.store._todoer?.items?.has(id)) {
      // item.invalidate_elem_cache(true /* force render */)
      item.elem?.querySelectorAll('.todoer-widget').forEach(widget => {
        _render_todoer_widget(widget, item)
      })
    }
  })
}

// detect any changes to global stores on todo items
function _on_global_store_change(id, remote) {
  const item = _item(id, false) // can be null if item deleted
  if (item?.tags.includes('#todo')) _on_item_change(id)
}

// start unsnooze task on welcome
function _on_welcome() {
  _this.dispatch_task(
    'unsnooze',
    () => {
      each(_items(), item => {
        const snoozed = item._global_store._todoer?.snoozed
        if (!snoozed || Date.now() < snoozed) return
        merge(item.global_store._todoer, { snoozed: 0, unsnoozed: Date.now() })
      })
    },
    0,
    1000
  ) // run now and every 1s
}
