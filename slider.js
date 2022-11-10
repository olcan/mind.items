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
  styles += `\n #item #widget .slides { transition-duration: ${duration}s }`

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
      navPosition: 'top', // controls autoplay button even if nav:false
      touch: true,
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
  let dragEndTime = 0
  let dragStartIndex
  let dragStartX
  let autoplayPaused = false
  let autoplayResetTime = 0

  widget.classList.add(
    options.nav || options.autoplay // note autoplay also uses navPosition
      ? options.navPosition == 'top'
        ? 'nav-top'
        : 'nav-bottom'
      : 'nav-none'
  )

  // resets autoplay timer
  function resetAutoplayTimer() {
    autoplayResetTime = Date.now()
  }

  function pauseAutoplay() {
    if (autoplayPaused) return // already paused
    widget.querySelector('button.autoplay')?.dispatchEvent(new Event('click'))
  }

  // NOTE: having an invisible input element to "focus" on can dramatically improve animation performance on iOS (at least on iPhone Safari on iOS 16), so we do that on all user interaction events using an invisible button added into .tns-outer in onInit (see below)
  function ensureFocus() {
    document.querySelector('.tns-outer button.focus').focus() // ensure focus
  }

  try {
    widget._slider?.destroy() // destroy previous slider if any
  } catch {} // ignore any errors in destruction of previous slider
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
            ensureFocus()
            resetAutoplayTimer()
            // console.debug('onclick', e, Math.abs(e.pageX - dragStartX))
            e.stopPropagation()
            slides.classList.remove('dragging')
            if (Date.now() - dragEndTime < 250) return // can prevent unintentional clicks on touch devices
            if (Date.now() - dragStartTime > 250) return
            if (Math.abs(e.pageX - dragStartX) > 5) return
            // pauseAutoplay()
            _modal({
              content: [
                // drop indentations that can be misinterpreted as markdown blocks
                slide.innerHTML.replace(/(^|\n)\s*/g, '$1'),
                // add styling for image and captions
                `<style>`,
                `.modal { background: #171717 !important; }`,
                `.modal img { width: 100%; }`,
                `.modal p { text-align: center; color: #aaa }`,
                `</style>`,
              ].join('\n'),
              passthrough: true, // tap anywhere to close
            }).then(resetAutoplayTimer)
          }
        })
      }

      // create invisible "focus" button (see note for ensureFocus() above)
      const button = document.createElement('button')
      button.className = 'focus'
      button.style.position = 'absolute' // relative to .tns-outer
      button.style.top = '50%' // ~middle of widget
      button.style.left = '50%' // ~middle of widget
      button.style.opacity = 0
      widget.querySelector('.tns-outer').appendChild(button)

      if (options.autoplay) {
        const button = document.createElement('button')
        button.className = 'autoplay'
        button.innerText = options.autoplayText[1]
        button.onclick = () => {
          resetAutoplayTimer()
          autoplayPaused = !autoplayPaused
          button.innerText = autoplayPaused
            ? options.autoplayText[0]
            : options.autoplayText[1]
        }
        const nav = widget.querySelector('.tns-nav')
        const outer = widget.querySelector('.tns-outer')
        if (nav) outer.insertBefore(button, nav)
        else if (options.navPosition == 'top')
          outer.insertBefore(button, outer.firstChild)
        else if (options.navPosition == 'bottom') outer.appendChild(button)
      }
      _render_images(_this) // for copied images, esp. in looping carousel mode
      options.onInit?.(carousel)
    },
  })
  if (!slider) return // can happen e.g. if there are no slides
  widget._slider = slider // for destruction in re-render

  function dragStart(info) {
    // console.debug('dragStart', info.event)
    ensureFocus()
    dragStartTime = Date.now()
    dragStartIndex = info.index
    dragStartX = info.event.pageX // pageX also works for touch events
    resetAutoplayTimer()
    slides.classList.add('dragging')
    // pauseAutoplay()
  }

  function dragEnd(info) {
    // console.debug(
    //   'dragEnd',
    //   Math.abs(info.event.pageX - dragStartX),
    //   info.event
    // )
    ensureFocus()
    dragEndTime = Date.now()
    resetAutoplayTimer()
    slides.classList.remove('dragging')
    // cancel drag if haven't dragged enough
    if (Math.abs(info.event.pageX - dragStartX) < 50)
      slider.goTo(dragStartIndex)
  }

  function dragMove(info) {
    // console.debug('dragMove')
    ensureFocus()
    resetAutoplayTimer()
  }

  // treat touch events as drag events
  slider.events.on('touchStart', dragStart)
  slider.events.on('touchEnd', dragEnd)
  slider.events.on('touchMove', dragMove)

  // set up dragging-related classes
  if (options.mouseDrag) {
    slides.classList.add('draggable')
    // show dragging cursors
    slider.events.on('dragStart', dragStart)
    slider.events.on('dragEnd', dragEnd)
    slider.events.on('dragMove', dragMove)
  }

  // reset autoplay timer on any index change (e.g. via buttons vs drag/touch)
  slider.events.on('indexChanged', info => {
    resetAutoplayTimer()
  })

  if (options.autoplay) {
    // set up periodic autoplay task
    widget_item.dispatch_task(
      'slider-widget-autoplay-' + widget.id,
      () => {
        if (!widget_item.elem) return // item not on page, skip
        if (!widget_item.elem.contains(widget)) return // widget not on item, skip
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
