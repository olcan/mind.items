const _slider = _item('$id')

// slider widget macro
// slides must be in top-level html elements w/ `class="slide"`
// `options` are documented at https://github.com/ganlanyuan/tiny-slider#options
function slider(options = {}) {
  // note this macro structure follows that of _plot in #util/plot
  let { style, styles, classes, ...widget_options } =
    _extract_template_options(options)

  // apply transition-duration to slides to fix animations in Safari
  options.speed ??= 300
  const duration = round_to(options.speed / 1000, 2)
  styles += `\n #item #widget #slides { transition-duration: ${duration}s }`

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
  let options = widget_item.store[widget.id]?.options ?? {}
  const slides = document.createElement('div')
  slides.className = 'slides'
  slides.replaceChildren(
    ...widget_item.elem?.querySelectorAll('.content > .slide')
  )
  widget.replaceChildren(slides)
  options = merge(
    {
      container: slides,
      items: 1,
      slideBy: 1,
      loop: false,
      nav: (options.items ?? 1) < slides.children.length,
      navPosition: 'top',
      mouseDrag: true,
      swipeAngle: false,
      controls: false,
      controlsText: ['◀︎', '▶︎'],
      autoplay: false, // also see override below
      autoplayTimeout: 3000,
      autoplayText: ['▶', '❚❚'],
      // autoplayHoverPause: false,
      // autoplayResetOnVisibility: false,
      // autoplayPosition: 'bottom',
      // autoplayButtonOutput: true,
    },
    options
  )
  let dragStartTime = 0
  let dragStartIndex
  let dragStartX
  let autoplayPaused = false
  let autoplayResetTime = 0

  const slider = tns({
    ...options,

    // forced option overrides (w/o modifying user-specified options object)
    // built-in autoplay is quite buggy, e.g. dragging and page visibility events can trigger erratic autoplay behavior, so we disable built-in autoplay for now and implement our own basic version below
    autoplay: false,

    onInit: carousel => {
      if (options.mouseDrag) {
        slides.querySelectorAll('.slide').forEach(slide => {
          slide.setAttribute('_clickable', '')
          slide.onclick = e => {
            e.stopPropagation()
            slides.classList.remove('dragging')
            if (Date.now() - dragStartTime > 250) return
            if (Math.abs(e.screenX - dragStartX) > 5) return
            _modal(
              [
                // drop indentations that can be misinterpreted as markdown blocks
                slide.innerHTML.replace(/(^|\n)\s*/g, '$1'),
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
      if (options.autoplay) {
        const button = document.createElement('button')
        button.className = 'autoplay'
        button.innerText = options.autoplayText[1]
        button.onclick = () => {
          autoplayPaused = !autoplayPaused
          button.innerText = autoplayPaused
            ? options.autoplayText[0]
            : options.autoplayText[1]
        }
        const nav = widget.querySelector('.tns-nav')
        const controls = widget.querySelector('.tns-controls')
        const outer = widget.querySelector('.tns-outer')
        outer.insertBefore(button, nav ?? controls?.nextSibling)
      }
      _render_images(_this) // for copied images, esp. in looping carousel mode
      options.onInit?.(carousel)
    },
  })
  if (!slider) return // can happen e.g. if there are no slides

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
      autoplayResetTime = Date.now()
      slides.classList.remove('dragging')
      // cancel drag if haven't dragged enough
      if (Math.abs(info.event.screenX - dragStartX) < 50)
        slider.goTo(dragStartIndex)
      // slider.pause()
    })
  }
  // set up autoplay if enabled
  if (options.autoplay) {
    slider.events.on('indexChanged', info => {
      autoplayResetTime = Date.now()
    })
    widget_item.dispatch_task(
      'slider-widget-autoplay-' + widget.id,
      () => {
        if (!widget_item.elem) return // widget not on page, skip
        if (autoplayPaused) return // autoplay paused, skip
        if (slides.classList.contains('dragging')) return // dragging, skip
        if (_modal_visible()) return // modal visible, skip
        if (!_focused) return // window not focused, skip
        // delay autoplay if autoplayResetTime was set within autoplayTimeout
        if (Date.now() - autoplayResetTime < options.autoplayTimeout)
          return options.autoplayTimeout - (Date.now() - autoplayResetTime)
        if (slider.getInfo().index == slider.getInfo().slideCount - 1)
          slider.goTo('first')
        else slider.goTo('next')
      },
      options.autoplayTimeout,
      options.autoplayTimeout
    )
  }
}
