const _slider = _item('$id')

// slider widget macro
// slides must be in top-level html elements w/ `class="slide"`
// elements can be part of markdown or in a separate `_html` block
// alternatively, slides can be defined in a separate `html_slides` block
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
  if (!widget_item.elem) return // widget item not on page yet, should re-render later
  let options = widget_item.store[widget.id]?.options ?? {}
  const slides = document.createElement('div')
  slides.className = 'slides'
  // try to read html_slides, and if missing look for .slide elements
  const html_slides = read('html_slides')
  if (html_slides) {
    slides.innerHTML = html_slides
  } else {
    const slide_elems = array(
      widget_item.elem.querySelectorAll('.slide')
    ).filter(slide => !widget.contains(slide))
    slides.replaceChildren(...slide_elems)
  }
  // set up _resize handlers to update slider height as images are rendered
  // note we could also add _cache_key but widget itself should be cached
  slides.querySelectorAll('img').forEach(img => {
    img._resize = () => widget._slider?.updateSliderHeight()
  })
  widget.replaceChildren(slides)
  options = merge(
    {
      container: slides,
      items: 1,
      slideBy: 1,
      loop: false,
      autoHeight: false,
      gutter: 0,
      nav: (options.items ?? 1) < slides.children.length,
      navPosition: 'top', // controls autoplay button even if nav:false
      touch: true,
      mouseDrag: true,
      swipeAngle: false,
      controls: false,
      controlsText: ['◀︎', '▶︎'],
      controlsPosition: 'overlay',
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

  // support auto-height using class
  if (options.autoHeight) widget.classList.add('auto-height')

  // check controlsPosition, noting that 'bottom' is not supported
  if (!['nav', 'overlay'].includes(options.controlsPosition))
    console.warn(
      `unsupported value '${options.controlsPosition}' for option ` +
        `controlsPosition; supported values are 'nav' and 'overlay'`
    )
  // force 'overlay' if there is no nav bar
  if (!options.nav && !options.autoplay) options.controlsPosition = 'overlay'
  if (options.controlsPosition == 'overlay')
    widget.classList.add('overlay-controls')

  // note we handle gutter using flex gap, which works better than the default behavior, with a minor potential issue that edges of items (assuming multi-item view) may not align w/ edges of the widget
  if (options.gutter) slides.style.gap = options.gutter + 'px'

  // resets autoplay timer
  function resetAutoplayTimer() {
    autoplayResetTime = Date.now()
  }

  function pauseAutoplay() {
    if (autoplayPaused) return // already paused
    widget.querySelector('button.autoplay')?.dispatchEvent(new Event('click'))
  }

  // pageX (vs screenX) works for both mouse and touch
  // android chrome requires digging into changedTouches array
  const pageX = e => e.pageX ?? e.changedTouches?.[0]?.pageX

  // NOTE: having an invisible input element to "focus" on can dramatically improve animation performance on iOS (at least on iPhone Safari on iOS 16), so we do that on all user interaction events using an invisible button added into .tns-outer in onInit (see below)
  function ensureFocus() {
    widget.querySelector('.tns-outer button.focus').focus() // ensure focus
  }

  try {
    widget._slider?.destroy() // destroy previous slider if any
  } catch {} // ignore any errors in destruction of previous slider
  const slider = tns({
    ...options,

    // forced option overrides (w/o modifying user-specified options object)
    // built-in autoplay is quite buggy, e.g. dragging and page visibility events can trigger erratic autoplay behavior, so we disable built-in autoplay for now and implement our own basic version below
    autoplay: false,

    // disable gutter, handled using flex gap above
    gutter: 0,

    // force controlsPosition 'top', with other values handleda above
    controlsPosition: 'top',

    onInit: carousel => {
      if (options.mouseDrag) {
        slides.querySelectorAll('.slide').forEach(slide => {
          slide.setAttribute('_clickable', '')
          slide.onclick = e => {
            ensureFocus()
            resetAutoplayTimer()
            // console.debug('onclick', e, Math.abs(pageX(e) - dragStartX))
            e.stopPropagation()
            slides.classList.remove('dragging')
            if (Date.now() - dragEndTime < 250) return // can prevent unintentional clicks on touch devices
            if (Date.now() - dragStartTime > 250) return
            if (Math.abs(pageX(e) - dragStartX) > 5) return
            // pauseAutoplay()
            _modal({
              content: [
                // drop indentations that can be misinterpreted as markdown blocks
                slide.innerHTML.replace(/(^|\n)\s*/g, '$1'),
                // add styling for image and captions
                `<style>`,
                `.modal { width:auto !important; display: flex; flex-direction:column; justify-content: center; align-items: center; background: #171717 !important; color: #aaa !important; }`,
                `.modal img { display: block; width: 100%; }`,
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
          outer.insertBefore(button, outer.firstChild.nextSibling)
        else if (options.navPosition == 'bottom') outer.appendChild(button)
      }
      _render_images(_this) // for copied images, esp. in looping carousel mode
      options.onInit?.(carousel)
    },
  })
  if (!slider) return // can happen e.g. if there are no slides
  widget._slider = slider // for destruction in re-render

  function dragStart(info) {
    // console.debug('dragStart', info.event, info)
    ensureFocus()
    dragStartTime = Date.now()
    dragStartIndex =
      info.index -
      (options.loop ? 1 : 0) /* index off by 1 when looping for some reason */
    dragStartX = pageX(info.event)
    resetAutoplayTimer()
    slides.classList.add('dragging')
    // pauseAutoplay()
  }

  function dragEnd(info) {
    // console.debug(
    //   'dragEnd',
    //   Math.abs(pageX(info.event) - dragStartX),
    //   info.event,
    //   info
    // )
    ensureFocus()
    dragEndTime = Date.now()
    resetAutoplayTimer()
    slides.classList.remove('dragging')
    // cancel drag if haven't dragged enough
    if (Math.abs(pageX(info.event) - dragStartX) < 50)
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

  // console.debug(slider.getInfo())

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
        // try goto(next), then goto(first) if index is unchanged
        // this seems to be the only robust method in all cases (items:>1,center:true,nav:false,etc)
        const prev_index = slider.getInfo().index
        slider.goTo('next')
        if (slider.getInfo().index == prev_index) slider.goTo('first')
      },
      options.autoplayTimeout,
      options.autoplayTimeout
    )
  }
}
