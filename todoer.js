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
    col.sortable.destroy()
    col.remove()
  })

  const done_bin = document.createElement('div')
  done_bin.className = 'done bin'
  widget.appendChild(done_bin)

  const list = document.createElement('div')
  list.className = 'list'
  widget.appendChild(list)

  const cancel_bin = document.createElement('div')
  cancel_bin.className = 'cancel bin'
  widget.appendChild(cancel_bin)

  // parse widget options for required tags & storage key
  let { tags = [], storage_key } = widget_item.store[widget.id]?.options ?? {}
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
  storage_key ??= tags.join(',')

  // console.debug(`rendering list ${widget.id}.${storage_key} ...`)

  // initialize set of todo items in session-lived store
  widget_item.store._todoer = { items: new Set() }

  // insert all todo items into list
  for (const item of _items()) {
    if (
      !tags.every(tag => {
        if (tag[0] == '#') return item.tags.includes(tag)
        else return !item.tags.includes(tag.substr(1)) // negation via ^[!-]
      })
    )
      continue // filtered out based on tags
    if (item.tags.includes('#menu')) continue // skip menu items
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
      div.title = '#todo' + _.escape(text) // original whitespace for title
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
      elem.innerText = elem.innerText.replace(/(:\/\/.+)\/(.+)/, '$1/…')
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

  // note we store the sortable on the element and destroy as elements are removed on re-render
  // otherwise dragging items on a re-rendered list can cause flickering
  list.sortable = Sortable.create(list, {
    group: 'shared',
    // animation: 150,
    delay: 250,
    delayOnTouchOnly: true,
    // touchStartThreshold: 5,
    store: {
      get: () =>
        widget_item._global_store._todoer?.[storage_key]?.split(',') ?? [],
      set: sortable => {
        // dispatch task to ensure that all items have been saved
        dispatch_task(
          `save.${widget.id}.${storage_key}`,
          () => {
            if (list.parentElement != widget) return null // cancel (removed)
            // determine saved (permanent) ids for global store
            const saved_ids = sortable.toArray().map(id => _item(id).saved_id)
            if (saved_ids.includes(null)) return // try again later
            // console.debug(`saving list ${widget.id}.${storage_key} ...`)
            // use _global_store and save manually below to avoid cache invalidation
            // otherwise there is flicker to due to re-render w/ async sortable re-init
            // re-render/re-init is unnecessary locally since element controls storage
            _.merge((widget_item._global_store._todoer ??= {}), {
              [storage_key]: saved_ids.join(),
            })
            setTimeout(() =>
              widget_item.save_global_store({ invalidate_elem_cache: false })
            )
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
      }
    },
  })

  done_bin.sortable = Sortable.create(done_bin, {
    group: 'shared',
  })

  cancel_bin.sortable = Sortable.create(cancel_bin, {
    group: 'shared',
  })
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

// detect any changes to todo items
// invalidate element cache & force render
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
