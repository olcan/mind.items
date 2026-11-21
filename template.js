// read template from item `name` using `dict` and `defs`
// `dict` object specifies template field values for `field` macro (see below)
// `defs` is arbitrary code treated as `js` block in template item for macro eval
// use `dict._placeholder` to customize `placeholder` (see below) for missing fields
// use `dict._context:'expanded'` to force-expand `modal` and `toggle` macros
function template(name, dict = {}, defs = '') {
  if (name.startsWith('/')) name = '#template' + name // assume /name is nested
  // pass dict directly via window, using push/pop to allow nesting
  window._template_dict ??= []
  window._template_dict.push(dict)
  try {
    const text = _item(name)?.read('', {
      // note we use replace_items even for empty defs to force eval on read
      replace_items: {
        [name]: _item(name)?.read() + '\n```js\n' + defs + '\n```',
      },
      eval_macros: true,
      context: dict?._context,
    })
    const regex =
      /^.*\s*\s<!-- *template *--> *\n?(.*?)\n? *?<!-- *\/template *-->.*$/s
    if (regex.test(text)) return text.replace(regex, '$1')
    else return null // no template found
  } finally {
    window._template_dict.pop()
  }
}

// dictionary-based placeholder for _fields_ in `template`
// default `dict` is from last call on stack to `template` (if any)
// if `dict` or `dict[name]` is missing, returns `placeholder(name)` (see below)
const field = (name, dict = last(window._template_dict)) =>
  dict?.[name] ?? placeholder(name)

// convenience wrapper for code conditioned on no selection in event.target
const _if_no_selection = code =>
  `if (!(getSelection().type == 'Range' && (event.target.contains(getSelection().anchorNode) || event.target.contains(getSelection().focusNode)))){ ${code} }`

// modal placeholder that shows content in a modal
// default `label` and `tooltip` are the macro code
// returns `content` if invoked under eval context `expanded` (anywhere in stack)
function modal(content, label = undefined, tooltip = undefined) {
  if (window._item_eval_context.includes('expanded')) return content
  const js = last(window._item_eval_js)
  label ??= js
  tooltip ??= js
  // store modal content on "_that" item at the top of the call/eval stack
  const key = hash(content)
  _that.store._modals ??= {}
  _that.store._modals[key] = [
    '<pre><code style="font-size:10px;line-height:17px">',
    _.escape(content),
    '</code></pre>',
  ].join('')
  // note we could render item html as in render_html in #gapi/gmail/import
  // but toggle() might be better for that so for now we just display raw content
  const modal = _if_no_selection(
    `_modal(_item('${_that.id}').store._modals?.['${key}'])`
  )
  const onclick = `onclick="event.stopPropagation();event.preventDefault();${modal}"`
  return `<span class="template_modal" title="${tooltip}" ${onclick}>${label}</span>`
}

// toggle placeholder that can be toggled into view
// default `label` and `tooltip` are the macro code
// returns `content` if invoked under eval context `expanded` (anywhere in stack)
function toggle(content, label = undefined, tooltip = undefined) {
  if (window._item_eval_context.includes('expanded')) return content
  label ??= last(window._item_eval_js)
  tooltip ??= last(window._item_eval_js)
  const id = 'id_' + hash(Math.random())
  // note we toggle on "_that" item at the top of the call/eval stack
  const toggle_tag = tag =>
    `_item('${_that.id}').elem?.querySelector(` +
    `'${tag}.template_toggle.${id}')` +
    `.classList.toggle('hidden');`
  // the press's default takes the keyboard focus from whatever has it (another item's editor,
  // the MindBox) and starts the selection a drag extends, so it is not prevented: the press
  // notes what has the focus, and the click that TOGGLES focuses it again, without a scroll (a
  // click that toggles nothing gives nothing back: a drag keeps the focus). ONE note, on the
  // window, for one gesture: a primary press writes it (its innermost toggle element alone),
  // the click takes it, once (only the toggle of the press gives back, and only an element
  // still in the document), and a moment after the release it is gone whatever became of the
  // click. the note keeps its listeners' controller: a press whose end was never heard (a
  // release, a drag's end, a cancelled pointer, the WINDOW's own blur) is ended by the next
  // press, so one set of listeners is live at most. the toggling click also reports its item's
  // height as a toggle's (the app then keeps the page where it was tapped, where the editor
  // it gives the focus back to has moved)
  const press = `if (!event.button && event.target.closest('.template_toggle') == this) { window._toggle_focus?.[2]?.abort(); const note = (window._toggle_focus = [this, document.activeElement, new AbortController()]); for (const type of ['mouseup', 'dragend', 'pointercancel', 'blur']) window.addEventListener(type, function (e) { if (e.type == 'blur' && e.target != window) return; note[2].abort(); setTimeout(function () { if (window._toggle_focus == note) window._toggle_focus = null }) }, { capture: true, signal: note[2].signal }) }`
  const focus = `window._item_hooks?.['${_that.id}']?.resize('toggle');if (note?.[0] == this && note[1]?.isConnected) note[1].focus({ preventScroll: true })`
  const toggle = _if_no_selection(toggle_tag('div') + toggle_tag('span') + focus)
  // a press beside a selection that stands in the element ends it, and the browser has
  // collapsed it before the click comes: the press notes it on the element, and the click
  // after such a press toggles nothing (the note is written at every press, spent at a click).
  // the lazy toggle of #template/vault REPEATS this text (template/vault.js), since neither
  // item may need the other's new version; tests/template_vault_test.js compares the copies
  const selected = `getSelection().type == 'Range' && (this.contains(getSelection().anchorNode) || this.contains(getSelection().focusNode))`
  const onclick =
    `onmousedown="this._selected = ${selected}; ${press}" ` +
    `onclick="event.stopPropagation();event.preventDefault();const note = window._toggle_focus; window._toggle_focus = null; if (this._selected) this._selected = false; else ${toggle}"`
  const classes = extra => `template_toggle ${id} ${extra}`
  return [
    `<span class="${classes()}" title="${tooltip}" ${onclick}>${label}</span>`,
    // note we switch to (hopefully shorter) label as tooltip in expanded view
    `<div class="${classes('hidden')}" title="${label}" ${onclick}>`,
    content,
    `</div>`,
  ].join('\n')
}

// generic placeholder with flexible formatting
// `format` can be specified via `dict._placeholder` when invoked via `template(…)`
// | default ➡ `'span'`  | html `<span>`
// | `'text'`   | text passed to `placeholder(text, …)
// |            | e.g. field name for `field(name, …) `
// |            | wrapped in backticks as`` `text` ``
// |            | use function `t=>t` for raw text
// | `'macro'`  | macro code wrapped as `\<< … >>`
// | `function` | custom function invoked as `func(text, macro)`
// | other      | fixed placeholder `dict._placeholder`
// default `tooltip` is the macro code
function placeholder(text, format = undefined, tooltip = undefined) {
  format ??= last(window._template_dict)?._placeholder ?? 'span'
  tooltip ??= last(window._item_eval_js)
  if (format == 'span')
    return `<span class="template_placeholder" title="${tooltip}">${text}</span>`
  if (format == 'text') return '`' + text + '`'
  if (format == 'macro') return '`<<' + last(window._item_eval_js) + '>>`'
  if (is_function(format)) return format(text, last(window._item_eval_js))
  if (defined(format)) return format // return _placeholder as is
  fatal('invalid format', format)
}
