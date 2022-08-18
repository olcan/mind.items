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
  widget.querySelector('.list')?.remove()
  const list = document.createElement('div')
  list.className = 'list'
  widget.appendChild(list)

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
    if (!item.saved_id) continue // skip unsaved, should re-render post-save
    widget_item.store._todoer.items.add(item.saved_id)
    widget_item.store._todoer.items.add(item.id) // in case added locally w/ temp id
    const div = document.createElement('div')
    const parent = document.createElement('div')
    list.appendChild(parent)
    parent.appendChild(div)
    parent.setAttribute('data-id', item.saved_id) // for sortable state
    div.className = 'list-item'

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
      div.title = '#todo' + _.escape(text)
      div.innerHTML = link_urls(mark_tags(_.escape('#todo' + text)))
    } else {
      // use prefix, truncate (and align) on left
      text = text.replace(/#todo.*/s, '')
      text = (text.length > 200 ? '…' : '') + text.substr(-200)
      // use direction=rtl to truncate (and add ellipsis) on the left
      div.style.direction = 'rtl'
      div.style.textAlign = 'right'
      // div.style.marginLeft = '60px'
      // set title on parent to avoid &lrm in title text
      parent.title = _.escape(text) + '#todo'

      // clip on Safari since text-overflow:ellipsis truncates wrong end for rtl
      // see webkit bug at https://bugs.webkit.org/show_bug.cgi?id=164999
      // if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent))
      //   div.style.textOverflow = 'clip'
      // NOTE: this started working for unknown reasons after switch to todoer item (from ad-hoc item); could be due to subtle changes in list item div construction but could not verify in quick experiments

      // use &lrm; to avoid non-alphanumeric prefixes being treated as ltr
      // see https://stackoverflow.com/a/27961022
      div.innerHTML = '&lrm;' + link_urls(mark_tags(_.escape(text + '#todo')))
    }

    // handle clicks and modify styling for non-todo tags
    div.querySelectorAll('mark').forEach(elem => {
      elem.style.direction = 'ltr'
      elem.style.cursor = 'pointer'
      elem.style.color = '#999'
      elem.style.background = '#222'
      elem.style.fontWeight = 300
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
      elem.style.direction = 'ltr'
      elem.style.cursor = 'pointer'
      elem.style.color = '#999'
      elem.style.background = '#222'
      elem.style.fontWeight = 300
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
      list.classList.remove('dragging') // gets stuck otherwise
      const source = item.saved_id
      MindBox.set('id:' + source)

      // edit item w/ snippet selected
      // code mirrors that in logger.js in mind.items (see comments there)
      const edit_target = () => {
        const target = document.querySelector('.container.target')
        if (!target) return null
        if (_item(target.getAttribute('item-id')).saved_id != source) {
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

      // NOTE: immediate edit can fail during/after init and can focus on wrong target, and dispatched edit can fail to focus on iphones, which we attempt to work around by focusing on the top textarea first
      document.querySelector('textarea').focus()
      setTimeout(edit_target)
    }
  }

  const sortable = Sortable.create(list, {
    animation: 250,
    delay: 250,
    delayOnTouchOnly: true,
    store: {
      get: () =>
        widget_item._global_store._todoer?.[storage_key]?.split(',') ?? [],
      set: sortable => {
        // console.debug(`saving list ${widget.id}.${storage_key} to global store`)
        // we use _global_store and save manually below to avoid cache invalidation
        // otherwise there is flicker to due to re-render w/ async sortable re-init
        // re-render/re-init is unnecessary locally since element controls storage
        _.merge((widget_item._global_store._todoer ??= {}), {
          [storage_key]: sortable.toArray().join(),
        })
        setTimeout(() =>
          widget_item.save_global_store({ invalidate_elem_cache: false })
        )
      },
    },
    forceFallback: true, // fixes dragging behavior, see https://github.com/SortableJS/Sortable/issues/246#issuecomment-526443179
    onChoose: () => {
      list.classList.add('dragging')
    },
    onStart: () => {
      list.classList.add('dragging')
    },
    onEnd: () => {
      list.classList.remove('dragging')
    },
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
const _on_command_todo = text => ({ text: '#todo ' + text, edit: false })

// detect any changes to todo items
// invalidate element cache & force render
function _on_item_change(id, label, prev_label, deleted, remote, dependency) {
  if (dependency) return // ignore dependency changes
  const item = _item(id, false) // can be null if item deleted
  if (item && !item.saved_id) {
    // try unsaved item again in 1s ...
    setTimeout(() => _on_item_change(id), 1000)
    return
  }
  const changed_item_id = item?.saved_id ?? id // use persistent id if possible
  // item must exist and be tagged with #todo (to be added or updated)
  // OR it must listed in a widget on a dependent (to be removed)
  const is_todo_item = item?.tags.includes('#todo')
  each(_this.dependents, id => {
    const item = _item(id)
    if (is_todo_item || item.store._todoer?.items?.has(changed_item_id)) {
      // item.invalidate_elem_cache(true /* force render */)
      item.elem?.querySelectorAll('.todoer-widget').forEach(widget => {
        _render_todoer_widget(widget, item)
      })
    }
  })
}
