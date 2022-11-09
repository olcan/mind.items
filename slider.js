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

// slide container macro
// `slides` must be array of `html | img_src | [html|img_src, caption]`
// `attrs` can contain shared attributes for generated img tags
function slides(slides, attrs = '') {
  if (!is_array(slides)) throw new Error('invalid slides')
  return [
    `<div class="slides">`,
    ...slides.map(slide => {
      let caption
      if (is_array(slide)) {
        if (slide.length != 2 || !slide.every(is_string))
          throw new Error('invalid slide')
        ;[slide, caption] = slide
      }
      if (!is_string(slide)) throw new Error('invalid slide')
      // copy caption to title attribute
      // if (caption)
      //   attrs =
      //     'title="' + _.escape(caption).replace(/\n/g, '&#010;') + '" ' + attrs
      if (!slide.match(/^\s*</)) slide = `<img src="${slide}" ${attrs}>` // interpret as img src
      return [
        '<div>',
        slide,
        ...(caption ? ['<p>', caption, '</p>'] : []),
        '</div>',
      ]
    }),
    `</div>`,
  ]
    .flat()
    .join('\n')
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
  const selector = options.slides || '.slides'
  if (!is_string(selector) || !widget_item.elem.querySelector(selector))
    fatal(`invalid/missing slides using selector '${selector}'`)
  // find slide elements, excluding those already moved inside widget
  const slides = widget_item.elem.querySelector(selector)
  slides.remove()
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
      controls: true,
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
  let dragEndTime = 0
  let autoplayPaused = false
  let autoplayResetTime = 0

  const slider = tns({
    ...options,

    // forced option overrides (w/o modifying user-specified options object)
    // built-in autoplay is quite buggy, e.g. dragging and page visibility events can trigger erratic autoplay behavior, so we disable built-in autoplay for now and implement our own basic version below
    autoplay: false,

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
        // const nav = widget.querySelector('.tns-nav')
        const controls = widget.querySelector('.tns-controls')
        const outer = widget.querySelector('.tns-outer')
        outer.insertBefore(button, controls.nextSibling)
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
        if (slider.getInfo().nextButton.hasAttribute('disabled'))
          slider.goTo('first')
        else slider.goTo('next')
      },
      options.autoplayTimeout,
      options.autoplayTimeout
    )
  }
}
