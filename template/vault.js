// #template/vault -- renders vault files synced as #vault/... items (vault design
// notes/design/mind_sync_store.md, the v2 representation over notes/design/mind_sync.md;
// the source-first presentation of notes/design/mind_sync_presentation.md).
// a managed item carries its editable file in two editor-only blocks: an optional
// `yaml_removed` block holding the YAML frontmatter lines without their `---` delimiters
// (so the editor highlights them) and a `jinja_removed` block holding the rest of the file
// (every macro opener escaped with a backslash in both); the vault's pinned snapshot lives in
// the item's hidden store under the `_vault` key: the pinned source (the file at the commit
// pinned by the sync snapshot the store currently holds) and the optional `head_preview`
// object with the vault's pinned-HEAD renders and navigation facts. this renderer parses the
// current item's source envelope, reads the store through the NON-SAVING `_global_store`
// accessor (the `global_store` accessor schedules a save on every read and can re-persist a
// stale copy), validates the observable `_vault` contract, and shows, in order: the
// frontmatter as highlighted YAML, the editable body rendered as INERT Markdown (the app's
// exposed Marked under an explicit policy: every grammar-significant character of every text
// node is a character reference, raw html is text, links are admitted by scheme, images are
// placeholders, task items are static markers, managed wiki references become the app's own
// tag links), and the pinned projection (the stored snapshot's text-exact carriers and
// navigation toggles) behind one toggle. it returns only a navigation composition in the
// nested mode and plain text in the expanded context. the badge is LIVE: it compares the
// editable source with the pinned source at render time. it runs no Jinja: the vault renders,
// the item displays.
//
// CURRENT-ITEM IDENTITY: the envelope (text and name) and the store are read from _this, the
// item whose macro is being evaluated, never from _that (the outer rendered item, which
// toggle() binds its click handler to). tests/template_vault_test.js evaluates this file
// under a stub template environment (plain node). this file is item-embedded JS: it never
// spells a literal macro opener/closer, fence line, template or inert marker, eval-macro
// opener, or id token; the test command scans it for them.
//
// NOT A PRE-EXECUTION FENCE: the app evaluates macros over the whole item before its
// removed-block pass and interprets blocks and inert constructs by its own grammar, so a raw
// opener or a malformed block/inert construct typed into the source can be interpreted
// before or around this renderer. producer escaping keeps generated items safe and the
// sync's admission refuses pulling malformed remote text; refusing arbitrary raw editor
// input is an app grammar/editor concern outside this renderer. the source view below is a
// presentation of admitted text, not a fence either.

const _VAULT_PATH = /^agents(?:\/[a-z0-9_]+)+\.md$/
const _VAULT_STORE = ['v', 'path', 'pinned_source', 'head_preview']
const _VAULT_PREVIEW = ['kind', 'navigation', 'base', 'exact']
const _VAULT_EXACT = ['profile', 'instructions', 'run_instructions', 'user_prompt']
// the consumer's template delimiter tokens (literal spaces, case-sensitive), matched as
// OCCURRENCES anywhere: the template helper extracts greedily between occurrences
const _VAULT_DELIMITER = new RegExp('<!-' + '- *\\/?template *-' + '->')
// the shared text domain: scalar values only; TAB and LF are the only admitted controls
const _VAULT_DOMAIN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/
// the envelope's exact opener lines and closer (spelled without a fence line here)
const _VAULT_FENCE = '`'.repeat(3)
const _VAULT_SOURCE_OPENER = _VAULT_FENCE + 'jinja_removed'
const _VAULT_FRONTMATTER_OPENER = _VAULT_FENCE + 'yaml_removed'
const _VAULT_FRONTMATTER_DELIMITER = '---'
// the source codec (design section 5): one left-to-right non-overlapping scan
const _VAULT_OPENER = new RegExp('(\\\\*)' + '<' + '<', 'g')

// invert the vault's source escape: a non-empty backslash run before a macro opener
// shrinks by one; the escape grows every scan-selected run by one
const _vault_unescape = body => body.replace(/(\\+)<{2}/g, (m, bs) => bs.slice(1) + '<' + '<')
const _vault_escape = text => text.replace(_VAULT_OPENER, (m, bs) => bs + '\\' + '<' + '<')

const _vault_same_keys = (obj, keys) => {
  const present = Object.keys(obj).sort()
  const expected = keys.slice().sort()
  return present.length == expected.length && present.every((k, i) => k == expected[i])
}
const _vault_text = v => v === null || typeof v == 'string'
const _vault_object = v => !!v && typeof v == 'object' && !Array.isArray(v)
// a carrier-bound value: text inside the shared domain without a delimiter occurrence
const _vault_unsafe = text => _VAULT_DELIMITER.test(text) || _VAULT_DOMAIN.test(text)

// the observable `_vault` contract (design v2 section 3), checked by this consumer: exactly
// the four own keys, v exactly 2, the path grammar, the pinned source null exactly when the
// preview is null and otherwise inside the text domain, and every structural preview check
// (exact keys, kinds, the positional navigation shape, the base rule, the exact fields with
// their text domain and delimiter fence). provenance and the wrapper are the producer's and
// the vault's discovery code's to establish; a renderer cannot see them
function _vault_check_store(p) {
  if (!_vault_object(p)) throw new Error('store: not an object')
  if (p.v !== 2) throw new Error('store: not schema v2')
  if (!_vault_same_keys(p, _VAULT_STORE)) throw new Error('store: keys')
  if (typeof p.path != 'string' || !_VAULT_PATH.test(p.path)) throw new Error('store: bad path')
  const h = p.head_preview
  if (h === null) {
    if (p.pinned_source !== null) throw new Error('store: pinned source without a preview')
    return p
  }
  if (typeof p.pinned_source != 'string') throw new Error('store: pinned source is not text')
  if (p.pinned_source.includes('\r') || _VAULT_DOMAIN.test(p.pinned_source)) throw new Error('store: pinned source outside the text domain')
  if (!_vault_object(h)) throw new Error('store: bad preview')
  if (!['section', 'config'].includes(h.kind) || !_vault_same_keys(h, _VAULT_PREVIEW)) throw new Error('store: preview keys')
  _vault_check_navigation(h.navigation)
  if (h.base !== null && (h.kind == 'section' || typeof h.base != 'string' || !_VAULT_PATH.test(h.base))) throw new Error('store: bad base')
  if (h.kind == 'section') {
    if (h.exact !== null) throw new Error('store: section exact')
    return p
  }
  const x = h.exact
  if (!_vault_object(x) || !_vault_same_keys(x, _VAULT_EXACT)) throw new Error('store: exact keys')
  if (!['bridge', 'bare'].includes(x.profile)) throw new Error('store: bad profile')
  for (const k of ['instructions', 'run_instructions', 'user_prompt']) {
    if (!_vault_text(x[k])) throw new Error('store: bad ' + k)
    if (x[k] !== null && _vault_unsafe(x[k])) throw new Error('store: unsafe ' + k)
  }
  return p
}

// the positional navigation wire: parts with exactly one key, `text` (non-empty admitted
// text, never adjacent to another text part) or `target` (a managed path, may repeat)
function _vault_check_navigation(parts) {
  if (!Array.isArray(parts)) throw new Error('store: navigation is not a list')
  let previous = null
  for (const part of parts) {
    if (!_vault_object(part) || Object.keys(part).length != 1) throw new Error('store: navigation part shape')
    const key = Object.keys(part)[0]
    if (key == 'text') {
      if (typeof part.text != 'string' || !part.text || previous == 'text' || _vault_unsafe(part.text)) throw new Error('store: bad navigation text')
    } else if (key == 'target') {
      if (typeof part.target != 'string' || !_VAULT_PATH.test(part.target)) throw new Error('store: bad navigation target')
    } else throw new Error('store: navigation part key')
    previous = key
  }
}

const _vault_label = path => '#vault/' + path.replace(/\.md$/, '')

// the app's fence grammar, mirrored: a line of optional whitespace and three backticks opens
// a block (its type token follows) and, inside a block, closes it; the app recognizes a block
// type with an optional colon prefix, an optional _hidden/_removed suffix, an optional
// dotted suffix, case-insensitively. the envelope accepts ONLY the two exact opener lines
// and refuses every other fence: a recognized family variant (a raw or hidden or prefixed or
// suffixed sibling of the source, frontmatter, or payload family the app would treat as the
// same family), a leftover v1 payload block (the `vault` family), an unrelated block, and an
// orphan fence
const _VAULT_FENCE_LINE = new RegExp('^\\s*' + _VAULT_FENCE)
const _VAULT_FAMILY = new RegExp('^\\s*' + _VAULT_FENCE + '(?:\\S+:)?(?:jinja|vault|yaml)(?:_hidden|_removed)?(?::\\S*\\.\\S*)?(?:\\s|$)', 'i')
// the reserved source markers (design section 5): the consumer's delimiter and the inert
// marker, matched as a deliberately broad superset
const _VAULT_RESERVED = new RegExp('<!' + '--\\s*/?\\s*(?:template|inert)\\s*-' + '->', 'i')

// one canonical block body: at least its one line, recanonicalizing exactly (a raw opener fails)
function _vault_body(lines, kind) {
  if (lines.length < 1) throw new Error('envelope: ' + kind + ' without its separator line')
  const body = lines.join('\n')
  const text = _vault_unescape(body)
  if (_vault_escape(text) != body) throw new Error('envelope: raw opener in the ' + kind)
  return text
}

// the current item's source envelope (design sections 3 and 5; the presentation design's
// section 2), one line-state pass over _this.text: exactly one source block behind its exact
// opener line, optionally preceded by one frontmatter block behind its exact opener line,
// each closed by an exact bare fence, no other fence anywhere, each with at least its one
// canonical body line (an empty file is opener, one empty line, closer), recanonicalizing
// exactly, inside the shared text domain, and free of reserved markers. returns the parts:
// the frontmatter lines (or null), the body, and the reconstructed complete source
function _vault_envelope_parts() {
  const lines = _this.text.split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    if (!_VAULT_FENCE_LINE.test(lines[i])) continue
    const kind = lines[i] == _VAULT_SOURCE_OPENER ? 'source' : lines[i] == _VAULT_FRONTMATTER_OPENER ? 'frontmatter' : null
    if (kind === null) throw new Error(_VAULT_FAMILY.test(lines[i]) ? 'envelope: variant block' : 'envelope: unexpected fence')
    let end = i + 1
    while (end < lines.length && !_VAULT_FENCE_LINE.test(lines[end])) end++
    if (end == lines.length) throw new Error('envelope: unclosed block')
    if (lines[end] != _VAULT_FENCE) throw new Error('envelope: fence-shaped line inside a block')
    blocks.push({ kind, lines: lines.slice(i + 1, end) })
    i = end
  }
  const sources = blocks.filter(b => b.kind == 'source')
  const fronts = blocks.filter(b => b.kind == 'frontmatter')
  if (sources.length != 1) throw new Error('envelope: exactly one source block')
  if (fronts.length > 1) throw new Error('envelope: multiple frontmatter blocks')
  if (fronts.length == 1 && blocks[0].kind != 'frontmatter') throw new Error('envelope: frontmatter block after the source block')
  const body = _vault_body(sources[0].lines, 'source')
  const frontmatter = fronts.length ? _vault_body(fronts[0].lines, 'frontmatter') : null
  const source = frontmatter === null ? body : _VAULT_FRONTMATTER_DELIMITER + '\n' + frontmatter + '\n' + _VAULT_FRONTMATTER_DELIMITER + '\n' + body
  if (source.includes('\r') || _VAULT_DOMAIN.test(source)) throw new Error('envelope: source outside the text domain')
  if (_VAULT_RESERVED.test(source)) throw new Error('envelope: reserved marker in the source')
  return { frontmatter, body, source }
}
const _vault_envelope = () => _vault_envelope_parts().source

// the current item's state: its editable source parts and its validated `_vault` store, or
// one fail-closed note. the store is read through the NON-SAVING accessor; the identity rule
// is the item's unique NAME (duplicate labels become id-names in the app and fail closed here)
function _vault_state() {
  let parts
  try {
    parts = _vault_envelope_parts()
  } catch (e) {
    return { note: 'vault source invalid' }
  }
  const s = _this._global_store
  const raw = _vault_object(s) ? s._vault : undefined
  if (raw === undefined) return { note: 'vault store missing' }
  let store
  try {
    store = _vault_check_store(raw)
  } catch (e) {
    return { note: 'vault store invalid' }
  }
  if (_this.name !== _vault_label(store.path)) return { note: 'vault store invalid' }
  return { note: null, source: parts.source, frontmatter: parts.frontmatter, body: parts.body, store }
}

// the text-exact carrier: ONE physical line, every code point a decimal character
// reference, so no post-macro rewrite (block, tag, url, math, rule) can recognize
// source syntax; the <code> start tag defeats the html rule that drops the first LF
// after <pre>, and the shared text domain excludes the C1 range the parser remaps
function _vault_refs(text) {
  let out = ''
  for (const ch of text) out += '&#' + ch.codePointAt(0) + ';'
  return out
}
function _vault_carrier(text) {
  return '<pre style="white-space:pre-wrap;margin:0"><code>' + _vault_refs(text) + '</code></pre>'
}
// the INLINE form for the badge only: it sits on the label line inside a paragraph, where a
// <pre> cannot live (the parser would close the paragraph and the badge span around it);
// badge text has no newlines, so an inline <code> of references is still text-exact
const _vault_inline = text => '<code>' + _vault_refs(text) + '</code>'

// ONE raw block container per composition (no blank lines inside), so carriers and a
// toggle's span/div stay children of the same element under marked
const _vault_container = parts => '<div class="vault">' + parts.join('\n') + '</div>'

// the grammar carrier of the source view: letters, digits, and spaces stay literal; every
// other code point (the app's tag, macro, url, math, rule, checkbox, comment, and marker
// syntax included, and every newline) is a decimal character reference, in text nodes of
// trusted html the app's own markdown pass hands through
function _vault_grammar_refs(text) {
  let out = ''
  for (const ch of text) out += /[A-Za-z0-9 ]/.test(ch) ? ch : '&#' + ch.codePointAt(0) + ';'
  return out
}

// markdown entities are decoded ONCE at the token boundary (prose text and link destinations;
// never code or literalized raw html, whose spellings are data). only COMPLETE references are
// candidates, the CommonMark shapes: a named reference of letters and digits closed by a
// semicolon, a decimal reference of 1 to 7 digits, a hexadecimal one of 1 to 6 digits; every
// other ampersand is literal text (so `&copycat`, `&amp=2`, and `?x=1&notebook=2` stay as
// written). a named candidate is decoded by the browser's own decoder when it recognizes the
// whole reference (an unknown name such as `&notit;` stays literal: the decoder's partial
// legacy-prefix decoding is refused by demanding one code point or one two-point pair: a partial
// decode of an unknown complete name keeps at least one name character and the semicolon, so it
// has three or more); `&semi;` decodes to its one semicolon like any valid name; without a document
// the stub fallback knows the five basic names as own properties only. numeric
// references follow the CommonMark rules (zero, out-of-range, and surrogate code points become
// the replacement character).
const _VAULT_BASIC_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const _VAULT_ENTITY = /&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/g
function _vault_decode_named(reference, name) {
  if (typeof document != 'undefined' && document.createElement) {
    const area = document.createElement('textarea')
    area.innerHTML = reference
    const value = area.value
    if (value !== reference && [...value].length <= 2) return value
    return reference
  }
  return Object.prototype.hasOwnProperty.call(_VAULT_BASIC_ENTITIES, name) ? _VAULT_BASIC_ENTITIES[name] : reference
}
function _vault_decode_entities(text) {
  return text.replace(_VAULT_ENTITY, (reference, dec, hex, name) => {
    if (name !== undefined) return _vault_decode_named(reference, name)
    const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex, 16)
    if (!Number.isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\ufffd'
    return String.fromCodePoint(code)
  })
}

// the app's own tag-link markup for a managed wiki reference (a TRUSTED generated segment,
// never passed through the grammar carrier): the mark the app renders for a hash-href link,
// bound to the current item like the app's, so a click opens the referenced item
function _vault_item_link(path) {
  const label = _vault_label(path)
  const shown = _vault_grammar_refs(path.replace(/\.md$/, ''))
  return (
    '<mark class="link" title="' + label + '" onmousedown="_handleTagClick(\'' + _this.id + '\',\'' + label + '\',\'' + shown + '\',event)"' +
    ' onclick="event.preventDefault();event.stopPropagation();">' + shown + '</mark>'
  )
}
const _vault_hint = (text, title) => '<span class="template_placeholder" title="' + title + '">' + _vault_grammar_refs(text) + '</span>'
const _VAULT_LINK_SCHEME = /^(?:https?|mailto):/i
const _VAULT_WIKI = /^(!?)\[\[([^\]\n]+?)\]\]/
const _VAULT_MANAGED_TARGET = /^agents(?:\/[a-z0-9_]+)+$/

// one Marked instance per render, the app's exposed class under the policy above; the
// wiki-reference extension recognizes only the managed spelling, and a code span keeps a
// reference literal because the extension's pattern does not match an opening backtick
function _vault_marked() {
  const Marked = typeof window != 'undefined' ? window.Marked : undefined
  if (typeof Marked != 'function') return null
  const marked = new Marked({ gfm: true, breaks: true })
  marked.use({
    extensions: [
      {
        name: 'vault_wiki',
        level: 'inline',
        start(src) {
          const m = src.match(/!?\[\[/)
          return m ? m.index : undefined
        },
        tokenizer(src) {
          const m = _VAULT_WIKI.exec(src)
          if (!m) return undefined
          return { type: 'vault_wiki', raw: m[0], target: m[2] }
        },
        renderer(token) {
          const target = token.target.replace(/\.md$/, '')
          if (_VAULT_MANAGED_TARGET.test(target)) return _vault_item_link(target + '.md')
          return _vault_hint(token.raw, 'not a managed file')
        },
      },
    ],
    renderer: {
      text(token) {
        if (token.tokens) return this.parser.parseInline(token.tokens)
        return _vault_grammar_refs(_vault_decode_entities(token.text ?? token.raw ?? ''))
      },
      codespan(token) {
        return '<code>' + _vault_grammar_refs(token.text) + '</code>'
      },
      code(token) {
        return '<pre><code>' + _vault_grammar_refs(token.text) + '</code></pre>'
      },
      html(token) {
        const shown = _vault_grammar_refs(token.text)
        return token.block ? '<p>' + shown + '</p>' : shown
      },
      checkbox(token) {
        return _vault_grammar_refs(token.checked ? '☑ ' : '☐ ')
      },
      image(token) {
        return _vault_hint(token.href, 'image placeholder (not loaded, not a link)')
      },
      link(token) {
        const text = this.parser.parseInline(token.tokens)
        const href = _vault_decode_entities(token.href)
        if (_VAULT_LINK_SCHEME.test(href)) return '<a href="' + _vault_grammar_refs(href) + '" target="_blank" rel="opener">' + text + '</a>'
        return text + ' (' + _vault_grammar_refs(href) + ')'
      },
    },
  })
  return marked
}

// the source view: the body as inert markdown in ONE container whose every line starts with a
// tag and none is blank (newlines inside text are references), or the text-exact carrier
// when the app's Marked is unavailable
function _vault_source_view(body) {
  const marked = _vault_marked()
  if (marked === null) return _vault_carrier(body)
  let html = marked.parse(body)
  html = html.replace(/\n{2,}/g, '\n').trim()
  const lines = html.split('\n').filter(line => line.length).map(line => (line[0] == '<' ? line : '<p>' + line + '</p>'))
  return '<div class="vault-source">' + lines.join('\n') + '</div>'
}

// the frontmatter view: the highlighter's trusted structure and classes with every text node
// re-encoded through the grammar carrier (the highlighter's own entities interpreted first,
// never double-escaped) and its comment class renamed away from the app's post-render
// linkifier; the text-exact carrier when the highlighter is unavailable
function _vault_frontmatter_view(frontmatter) {
  const hljs = typeof window != 'undefined' ? window.hljs : undefined
  let value = null
  try {
    if (hljs && typeof hljs.highlight == 'function') value = hljs.highlight(frontmatter, { language: 'yaml' }).value
  } catch (e) {
    value = null
  }
  if (typeof value != 'string') return _vault_carrier(frontmatter)
  const pieces = value.split(/(<[^>]*>)/)
  let out = ''
  for (const piece of pieces) {
    if (!piece) continue
    if (piece[0] == '<') {
      const open = /^<span class="([a-zA-Z0-9_ -]*)">$/.exec(piece)
      if (open) {
        const classes = open[1].replace(/\bhljs-comment\b/g, 'vault-comment')
        out += '<span class="' + classes + '"' + (classes.includes('vault-comment') ? ' style="color:#6a737d"' : '') + '>'
      } else if (piece == '</span>') out += piece
      // any other markup from the highlighter is dropped: only spans are trusted structure
    } else out += _vault_grammar_refs(_vault_decode_entities(piece))
  }
  return '<pre class="vault-frontmatter" style="white-space:pre-wrap;margin:0"><code class="hljs language-yaml">' + out + '</code></pre>'
}

// the expanded context (agent/chat.js): plain text, the pinned instructions or navigation
function _vault_expanded(p) {
  const h = p.head_preview
  if (!h) return 'vault: no pinned preview'
  if (h.kind == 'section') return 'vault: navigation only'
  if (typeof h.exact.instructions == 'string') return h.exact.instructions
  return 'vault: no pinned instructions'
}

const _vault_mode = () => last(window._template_dict ?? [])?._vault
const _vault_is_expanded = () => (window._item_eval_context ?? []).includes('expanded')

// a toggle over the sibling's navigation composition (nested mode). the label is bare
// references (no element, no quote): toggle() copies its label into the revealed div's
// title attribute unescaped, so a block carrier there would break the div's start tag
const _vault_embed = path => toggle(template(_vault_label(path), { _vault: 'navigation' }), '⋮ ' + _vault_refs('![[' + path.replace(/\.md$/, '') + ']]'))

// navigation: the parts in order, text parts as carriers and target parts as toggles,
// under one container (no marker scanning: provenance is the producer's)
const _vault_navigation = h =>
  _vault_container(h.navigation.map(part => ('target' in part ? _vault_embed(part.target) : _vault_carrier(part.text))))

// the live badge texts (design v2 section 3 and the presentation design's decision 4): the
// editable source against the pinned source of the snapshot the store currently holds; the
// expanded context keeps the path, the visible view drops it (the label already carries it)
function _vault_badge_text(state) {
  if (state.note) return state.note
  const p = state.store
  if (p.head_preview === null) return p.path + ' · not in the stored sync snapshot'
  const head = p.head_preview.kind + ' · ' + p.path
  return state.source === p.pinned_source ? head : head + ' · differs from the stored sync snapshot'
}
function _vault_badge_visible(state) {
  if (state.note) return state.note
  const p = state.store
  if (p.head_preview === null) return 'not in the stored sync snapshot'
  const kind = p.head_preview.kind
  return state.source === p.pinned_source ? kind : kind + ' · differs from the stored sync snapshot'
}

// badge next to the label
function vault_badge() {
  const state = _vault_state()
  // the expanded context (agent/chat.js) gets plain text from both macros: no markup, no carrier
  if (_vault_is_expanded()) return 'vault badge: ' + _vault_badge_text(state)
  return `<span class="template_placeholder" title="managed by the vault sync">${_vault_inline(_vault_badge_visible(state))}</span>`
}

// the pinned projection (the stored snapshot): the config field carriers, the base toggle, the
// navigation toggle when the composition has target parts; frozen order
function _vault_projection(h) {
  const parts = []
  if (h && h.kind == 'config') {
    for (const name of ['instructions', 'run_instructions', 'user_prompt'])
      if (h.exact[name] !== null) parts.push(toggle(_vault_carrier(h.exact[name]), '⋮ ' + name + ' (' + h.exact.profile + ' profile)'))
    if (h.base) parts.push(_vault_embed(h.base))
  }
  if (h && h.navigation.some(part => 'target' in part)) parts.push(toggle(_vault_navigation(h), '⋮ navigation (bridge/default context)'))
  if (!h) parts.push(placeholder('no pinned preview (not in the stored sync snapshot)'))
  return parts
}

// the template region of a managed item: the nested navigation mode returns the navigation
// composition alone; the expanded context plain text; the ordinary view the frontmatter, the
// body rendered as inert markdown, and the projection behind one toggle under the container
function vault_render() {
  const state = _vault_state()
  if (state.note) return _vault_is_expanded() ? 'vault: ' + state.note.replace(/^vault /, '') : placeholder(state.note)
  const p = state.store
  if (_vault_is_expanded()) return _vault_expanded(p)
  const h = p.head_preview
  if (_vault_mode() == 'navigation') return h ? _vault_navigation(h) : placeholder('no pinned preview')
  const view = []
  if (state.frontmatter !== null) view.push(_vault_frontmatter_view(state.frontmatter))
  if (state.body.trim().length) view.push(_vault_source_view(state.body))
  const projection = _vault_projection(h)
  view.push(_vault_container([toggle(projection.join('\n'), '⋮ projection (the stored sync snapshot)')]))
  return view.join('\n')
}

function _test_vault_helpers() {
  const lt2 = '<' + '<'
  const p = { v: 2, path: 'agents/x.md', pinned_source: 'x', head_preview: { kind: 'section', navigation: [{ text: 'A ' + lt2 + 'x' }, { target: 'agents/y.md' }, { text: ' B' }], base: null, exact: null } }
  const checked = _vault_check_store(p)
  check(
    () => _vault_unescape('a \\' + lt2 + 'b') == 'a ' + lt2 + 'b',
    () => _vault_escape('a ' + lt2 + 'b') == 'a \\' + lt2 + 'b',
    () => checked.head_preview.navigation.length == 3 && checked.head_preview.navigation[1].target == 'agents/y.md',
    () => _vault_carrier('a\nb') == '<pre style="white-space:pre-wrap;margin:0"><code>&#97;&#10;&#98;</code></pre>',
    () => _vault_grammar_refs('a #b\n') == 'a &#35;b&#10;',
    () => _vault_decode_entities('A &amp; B &#35; &#x41; &copycat &amp=2 &notit; &#0; &constructor;') == 'A & B # A &copycat &amp=2 &notit; \ufffd &constructor;',
    () => _vault_expanded(checked) == 'vault: navigation only',
    () => throws(() => _vault_check_store({ v: 1 })),
    () => throws(() => _vault_check_store({ ...p, pinned_source: null }))
  )
}
