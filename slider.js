const _slider = _item('$id')

// slider widget macro
// | **option** | |  **default**
// | `slides` | selector for element containing slides | `.slides`
// other `options` are as listed for [tiny-slider](https://github.com/ganlanyuan/tiny-slider#options)
function slider(options = {}) {
  // note this macro structure follows that of _plot in #util/plot
  let { style, styles, classes, ...widget_options } =
    _extract_template_options(options)

  // apply transition-duration to slides to fix animations in Safari
  options.speed ??= 300
  const duration = round_to(options.speed / 1000, 2)
  styles += `\n #item #widget #slides { transition-duration: ${duration}s }`

  widget_options.slides ||= '.slides'

  // pass along options via item store keyed by macro cid
  // macro cid is also passed to html via template string __cid__
  // macro cid is preferred to html script cid for consistency
  _this.store['slider-widget-$cid'] = { options: widget_options }
  return block(
    '_html',
    _slider
      .read('html_widget')
      .replace(/__classes__/g, classes)
      .replace(/__style__/g, style)
      .replace(/\/\* *__styles__ *\*\//g, styles)
      .replace(/#widget\b/g, `#slider-widget-__cid__`)
      .replace(/#slides\b/g, widget_options.slides)
      .replace(/__cid__/g, '$cid')
  )
}

// internal helper for slider widget macro
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

// renders widget in item, loading tiny-slider as needed
function _render_slider_widget(widget, item = _this) {
  if (window.tns) return __render(widget, item)
  // import css via link tag if missing from head
  const url_base = 'https://cdnjs.cloudflare.com/ajax/libs/tiny-slider/2.9.4'
  if (
    !_.find(document.head.querySelectorAll('link'), link =>
      link.href.includes('tiny-slider')
    )
  ) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url_base + '/tiny-slider.css'
    document.head.appendChild(link)
  }
  // dynamically load tiny-slider js
  return _load(url_base + '/min/tiny-slider.js').then(() =>
    __render(widget, item)
  )
}

// internal helper for _render_slider_widget, assumes tiny-slider loaded
function __render(widget, widget_item) {
  if (!widget) fatal(`invalid/missing widget`)
  const options = widget_item.store[widget.id]?.options ?? {}
  const selector = options.slides || '.slides'
  if (!is_string(selector) || !widget_item.elem.querySelector(selector))
    fatal(`invalid/missing slides using selector '${selector}'`)
  // find slide elements, excluding those already moved inside widget
  const slides = widget_item.elem.querySelector(selector)
  slides.remove()
  widget.replaceChildren(slides)

  options.mouseDrag ??= true
  let dragStartTime = 0
  let dragStartIndex
  let dragStartX

  const slider = tns({
    container: slides,
    items: 1,
    slideBy: 1,
    loop: false,
    nav: true,
    navPosition: 'bottom',
    mouseDrag: true,
    swipeAngle: false,
    controls: true,
    controlsText: ['◀︎', '▶︎'],
    ...options,

    // note built-in autoplay is quite buggy, e.g. dragging and page visibility events can trigger erratic autoplay behavior, so we disable this until it is really needed, at which point we may try the latest version or implement our own autoplay
    autoplay: false,
    autoplayHoverPause: false,
    autoplayResetOnVisibility: false,
    autoplayPosition: 'bottom',
    autoplayText: ['▶', '❚❚'],

    onInit: carousel => {
      if (options.mouseDrag) {
        slides.querySelectorAll('.tns-item > *').forEach(slide => {
          slide.setAttribute('_clickable', '')
          slide.onclick = e => {
            e.stopPropagation()
            slides.classList.remove('dragging')
            if (Date.now() - dragStartTime > 250) return
            if (Math.abs(e.screenX - dragStartX) > 5) return
            _modal(
              [
                // drop indentations that can be misinterpreted as markdown blocks
                slide.parentElement.innerHTML.replace(/(^|\n)\s*/g, '$1'),
                // add styling for image and captions
                `<style>`,
                `.modal { background: #171717 !important; }`,
                `.modal img { width: 100%; }`,
                `.modal p { text-align: center; color: #aaa }`,
                `</style>`,
              ].join('\n')
            )
          }
        })
      }
      _render_images(_this) // for copied images, esp. in looping carousel mode
      options.onInit?.(carousel)
    },
  })
  // set up dragging-related classes
  if (options.mouseDrag) {
    slides.classList.add('draggable')
    // show dragging cursors
    slider.events.on('dragStart', info => {
      dragStartTime = Date.now()
      dragStartIndex = info.index
      dragStartX = info.event.screenX
      slides.classList.add('dragging')
      // slider.pause()
    })
    slider.events.on('dragEnd', info => {
      slides.classList.remove('dragging')
      // cancel drag if haven't dragged enough
      if (Math.abs(info.event.screenX - dragStartX) < 50)
        slider.goTo(dragStartIndex)
      // slider.pause()
    })
  }
}
