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
// tag links), and the pinned projection behind one toggle (the config fields and the navigation text parts as the same inert Markdown, the base and embed toggles unchanged). it returns only a navigation composition in the
// nested mode, and the pinned instructions or an error in the expanded context. the badge is LIVE: it compares the
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

// the managed path language (design section 6 and the presentation design's 7.5): agents/ plus
// lowercase segments, or one of the two fixed root stems
const _VAULT_PATH = /^(?:agents(?:\/[a-z0-9_]+)+|AGENTS|learnings)\.md$/
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
  // (presentation design 7.2): a decoded text never carries a code point the shared text domain
  // excludes (a control other than TAB and LF, U+200B, zero, a surrogate, a point beyond
  // U+10FFFF): such a reference becomes the replacement character, so the line pass's
  // control-character sentinels can come from the line pass alone
  return text.replace(_VAULT_ENTITY, (reference, dec, hex, name) => {
    if (name !== undefined) {
      const value = _vault_decode_named(reference, name)
      return _VAULT_DOMAIN.test(value) ? '\ufffd' : value
    }
    const code = dec !== undefined ? parseInt(dec, 10) : parseInt(hex, 16)
    if (!Number.isFinite(code) || code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\ufffd'
    const value = String.fromCodePoint(code)
    return _VAULT_DOMAIN.test(value) ? '\ufffd' : value
  })
}

// the app's own tag-link markup for a managed wiki reference (a TRUSTED generated segment,
// never passed through the grammar carrier): the mark the app renders for a hash-href link,
// bound to the current item like the app's, so a click opens the referenced item
function _vault_item_link(path, spelling = null) {
  const label = _vault_label(path)
  const shown = _vault_grammar_refs(spelling ?? path.replace(/\.md$/, ''))
  return (
    '<mark class="link" title="' + label + '" onmousedown="_handleTagClick(\'' + _this.id + '\',\'' + label + '\',\'' + shown + '\',event)"' +
    ' onclick="event.preventDefault();event.stopPropagation();">' + shown + '</mark>'
  )
}
const _vault_hint = (text, title) => '<span class="template_placeholder" title="' + title + '">' + _vault_grammar_refs(text) + '</span>'
const _VAULT_LINK_SCHEME = /^(?:https?|mailto):/i
const _VAULT_WIKI = /^(!?)\[\[([^\]\n]+?)\]\]/
// exactly one html comment (presentation design 8.2), spelled without the literal marker
const _VAULT_COMMENT_CLOSE = '--' + '>'
const _VAULT_COMMENT = new RegExp('^\\s*<!' + '--[\\s\\S]*?' + _VAULT_COMMENT_CLOSE + '\\s*$')
// jinja constructs (presentation design 8.1): tempered (the content never contains the
// construct's own closer), so a construct ends at its FIRST closer and can never swallow text up
// to a later construct; the content is bounded by count so a construct longer than the window
// (4096 UTF-16 units, delimiters included) is not recognized (text)
const _VAULT_JINJA = /^(?:\{\{(?:(?!\}\})[\s\S]){0,4092}\}\}|\{%(?:(?!%\})[\s\S]){0,4092}%\}|\{#(?:(?!#\})[\s\S]){0,4092}#\})/
const _VAULT_JINJA_PAIRS = [['{{', '}}'], ['{%', '%}'], ['{#', '#}']]
const _VAULT_JINJA_WINDOW = 4096 // UTF-16 code units, opener to closer inclusive
// the candidate finder (review 84, 85): the earliest opener that the tokenizer will accept (its
// first same-type closer at or after the opener's end lies within the window), or undefined.
// Marked stops plain-text consumption only where `start` points, so an unfinished or over-long
// candidate never forces a tokenization step. each type is searched independently (an earlier
// opener of one type may enclose a later construct of another: `{% set t = "{{ v }}" %}` is the
// statement) and the earliest wins; the only shortcut is an opener at position zero, which
// nothing can precede. per type the closers are walked in order and the opener is searched from
// the window's start; a closer overlapping the opener (`{%}`) or lying before its end is skipped.
// the closer table is OWNED by Marked's inline run: Marked hands the tokenizer the token array
// it is filling (one array per inline run, per parse, nested runs included) and calls the
// tokenizer at every position before consulting `start` with the same text minus its first
// unit, so the tokenizer registers the run's table (computed once, from the run's first text,
// positions measured from the END so every later suffix reuses it) and `start` uses the
// registration of the same iteration or, if the iteration shape is not the expected one,
// computes without a table. the two parses of one view (protection, rendering) are separate
// runs, as are separate paragraphs and a link's inner text, so no table crosses them
const _vault_jinja_runs = new WeakMap()
let _vault_jinja_current = null
function _vault_jinja_closers(src) {
  return _VAULT_JINJA_PAIRS.map(([, closer]) => {
    const distances = []
    for (let i = src.indexOf(closer); i >= 0; i = src.indexOf(closer, i + closer.length)) distances.push(src.length - i)
    return distances
  })
}
function _vault_jinja_register(src, tokens) {
  let run = tokens && _vault_jinja_runs.get(tokens)
  if (!run || src.length > run.length) {
    run = { length: src.length, closers: _vault_jinja_closers(src), next: [0, 0, 0] }
    if (tokens) _vault_jinja_runs.set(tokens, run)
  }
  _vault_jinja_current = { run, remaining: src.length }
  return run
}
function _vault_jinja_candidate(src, run) {
  const table = run || { length: src.length, closers: _vault_jinja_closers(src), next: [0, 0, 0] }
  let best = -1
  for (let k = 0; k < _VAULT_JINJA_PAIRS.length && best !== 0; k++) {
    const [opener, closer] = _VAULT_JINJA_PAIRS[k]
    const distances = table.closers[k]
    let j = table.next[k]
    while (j < distances.length && distances[j] > src.length) j++ // closers before this suffix
    table.next[k] = j
    let from = 0
    let open = -1
    while (j < distances.length) {
      const close = src.length - distances[j]
      from = Math.max(from, close + closer.length - _VAULT_JINJA_WINDOW)
      if (open < from) {
        open = src.indexOf(opener, from)
        if (open < 0) break // no opener anywhere after the window's start: none of this type
      }
      if (open + opener.length <= close) {
        if (best < 0 || open < best) best = open
        break
      }
      // this closer lies before the opener's end (overlapping or earlier): the opener needs a later one
      while (j < distances.length && src.length - distances[j] < open + opener.length) j++
      from = open
    }
  }
  return best >= 0 ? best : undefined
}
const _VAULT_MANAGED_TARGET = /^(?:agents(?:\/[a-z0-9_]+)+|AGENTS|learnings)$/
// a managed reference anywhere in a text piece (the frontmatter view links them, 7.4)
const _VAULT_WIKI_ANYWHERE = /(!?\[\[(?:agents(?:\/[a-z0-9_]+)+|AGENTS|learnings)(?:\.md)?\]\])/

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
        // (presentation design 8.1) a jinja construct is inline code; recognized inline only, so a
        // construct inside a code span never is one and one inside a link text stays inline code inside
        // the intact link (never an interrupting block); the paragraph renderer presents a
        // construct that spans lines and stands alone on them as a code block
        name: 'vault_jinja',
        level: 'inline',
        start(src) {
          // Marked calls this with the tokenizer's text minus its first unit, in the same
          // iteration; any other shape gets a table-free computation
          const current = _vault_jinja_current
          return _vault_jinja_candidate(src, current && current.remaining === src.length + 1 ? current.run : null)
        },
        tokenizer(src, tokens) {
          // Marked tries every inline tokenizer at every position where text consumption stops:
          // the run is registered here first (see the finder: the closer table is built at the
          // run's first position), then the candidate lookup and the match run only when an
          // opener stands at this position and the finder accepts it; the match itself is
          // bounded by repetition count, never by slicing. cost per position: the registration
          // (the table once per run, a scan of the run's text), then, at an opener, the closers
          // passed and the opener search from the window's start (which may run to the next
          // opener of that type)
          const run = _vault_jinja_register(src, tokens)
          if (src.charCodeAt(0) !== 123 || _vault_jinja_candidate(src, run) !== 0) return undefined
          const m = _VAULT_JINJA.exec(src)
          return m ? { type: 'vault_jinja', raw: m[0], text: m[0] } : undefined
        },
        renderer(token) {
          return '<code class="vault-jinja">' + _vault_grammar_refs(token.text) + '</code>'
        },
      },
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
      paragraph(token) {
        // (presentation design 8.1) a jinja construct that spans lines and stands alone on them (a
        // line start before it, a line end after it) is presented as a code block between the
        // paragraph's other runs; everything else is the ordinary paragraph
        const tokens = token.tokens || []
        const blockShaped = (t, i) =>
          t.type == 'vault_jinja' && t.raw.includes('\n') && (i == 0 || tokens[i - 1].raw.endsWith('\n')) && (i == tokens.length - 1 || tokens[i + 1].raw.startsWith('\n'))
        if (!tokens.some(blockShaped)) return '<p>' + this.parser.parseInline(tokens) + '</p>\n'
        let out = ''
        let run = []
        const flush = () => {
          if (!run.length) return
          const html = this.parser.parseInline(run).replace(/^(?:<br>)+|(?:<br>)+$/g, '').trim()
          if (html) out += '<p>' + html + '</p>\n'
          run = []
        }
        tokens.forEach((t, i) => {
          if (!blockShaped(t, i)) return run.push(t)
          flush()
          out += '<pre><code class="vault-jinja">' + _vault_grammar_refs(t.text) + '</code></pre>\n'
        })
        flush()
        return out
      },
      text(token) {
        if (token.tokens) return this.parser.parseInline(token.tokens)
        return _vault_grammar_refs(_vault_decode_entities(token.text ?? token.raw ?? ''))
      },
      codespan(token) {
        return '<code>' + _vault_grammar_refs(token.text) + '</code>'
      },
      code(token) {
        const lang = (token.lang || '').split(/\s+/)[0]
        const shown = lang ? _vault_highlight(token.text, lang) : null
        if (shown === null) return '<pre><code>' + _vault_grammar_refs(token.text) + '</code></pre>'
        return '<pre><code class="hljs language-' + _vault_grammar_refs(lang) + '">' + shown + '</code></pre>'
      },
      html(token) {
        // (presentation design 8.2) the characters stay references; only the wrapper changes:
        // exactly one comment is gray text inheriting the surrounding font (the owner found the
        // monospace odd and larger beside prose), any other literal html is code-styled
        const text = token.block ? token.text.replace(/\n$/, '') : token.text
        const shown = _vault_grammar_refs(text)
        if (_VAULT_COMMENT.test(text) && text.indexOf(_VAULT_COMMENT_CLOSE) == text.lastIndexOf(_VAULT_COMMENT_CLOSE))
          return token.block ? '<p class="vault-comment" style="white-space:pre-wrap;color:#6a737d">' + shown + '</p>' : '<span class="vault-comment" style="color:#6a737d">' + shown + '</span>'
        return token.block ? '<pre><code>' + shown + '</code></pre>' : '<code>' + shown + '</code>'
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
// the app's pre-markdown rewrites that shape layout (Item.svelte, presentation design 7.2),
// mirrored for the supported set and in the app's order, so the same css lays the source out
// like an ordinary item: an empty line becomes a spacer followed by its own newline; a list,
// a table, and a deeper blockquote are closed by the app's extra newline; a rule line becomes
// a rule (between prose lines too, where Marked alone would read a setext heading); another
// line of only - or = cannot underline a setext heading; an empty blockquote line gets the
// app's non-breaking space. protected lines are Marked's own tokens over the ORIGINAL text,
// located by exact line accounting (_vault_protect): every line of a code block, a raw html
// block, or an inline code span, link, image, or jinja construct that spans lines is left
// untouched wherever it sits (blank and rule lines included); a container's other lines are
// rewritten as usual. the blank lines at both ends of the source outside protection are not
// rendered (the app trims trailing rendered whitespace; the final newline is the file's
// terminator, not a blank line; a blank line inside an unclosed fence is code and stays). the app inserts literal markup (`&nbsp;<br>`, `<hr>`,
// `&nbsp;`); here those would meet the html policy of the renderer's own pass, so the pass
// inserts control-character sentinels (U+0001 spacer, U+0002 rule, U+0003 non-breaking
// space) that the final html replaces: the shared text domain excludes them from the source
// and the decoder never produces them, so a sentinel in the output came from the pass alone
const _VAULT_SPACER = '\u0001'
const _VAULT_RULE = '\u0002'
const _VAULT_NBSP = '\u0003'
const _VAULT_LIST_LINE = /^\s*(?:\d+\.|[-*+])/
// a construct whose own lines the pass must not rewrite: a code block, a raw html block or a
// multiline inline tag (the policy renders raw html as text, so a rewrite would surface a
// sentinel or a rule inside the spelling), or an inline code span, link, image, or jinja
// construct spanning more than one line (a rewrite would split it)
function _vault_protected_self(token) {
  if (token.type == 'code') return true
  if (token.type == 'html' && (token.block || token.raw.includes('\n'))) return true
  return (token.type == 'codespan' || token.type == 'link' || token.type == 'image' || token.type == 'vault_jinja') && token.raw.includes('\n')
}
const _vault_newlines = raw => (raw.match(/\n/g) || []).length
// protect exactly the lines of every protected construct inside `token`, which starts at source
// line `line`: EXACT ordered accounting over Marked's token raws (the block tokens' raws
// concatenate to the source; a list's item raws to the list's raw; a container's children raws
// to its text, line for line, since Marked strips a list item's indentation and a blockquote's
// prefix without dropping lines), so no text matching is ever needed; a table's cells are one
// line each and hold no protected construct
function _vault_protect(token, line, out) {
  if (_vault_protected_self(token)) {
    const last = line + _vault_newlines(token.raw.replace(/\n$/, ''))
    for (let i = line; i <= last; i++) out.add(i)
    return
  }
  if (token.type == 'table') return
  let at = line
  for (const child of token.items || token.tokens || []) {
    if (token.items) {
      let inner = at
      for (const grandchild of child.tokens || []) {
        _vault_protect(grandchild, inner, out)
        inner += _vault_newlines(grandchild.raw)
      }
    } else _vault_protect(child, at, out)
    at += _vault_newlines(child.raw)
  }
}
function _vault_protected_lines(marked, text) {
  const out = new Set()
  let line = 0
  for (const token of marked.lexer(text)) {
    _vault_protect(token, line, out)
    line += _vault_newlines(token.raw)
  }
  return out
}
function _vault_line_pass(marked, source) {
  const all = source.split('\n')
  const protectedLines = _vault_protected_lines(marked, source)
  // the terminating newline of a protected BLANK last line (an unclosed fence's trailing blank
  // line is code) stays; any other final newline is the terminator
  if (all.length >= 2 && all[all.length - 1] === '' && /^\s*$/.test(all[all.length - 2]) && protectedLines.has(all.length - 2)) protectedLines.add(all.length - 1)
  // trailing blank lines outside protection are not rendered (the final newline included); a
  // blank line inside an unclosed fence is code and stays
  let end = all.length
  while (end > 0 && /^\s*$/.test(all[end - 1]) && !protectedLines.has(end - 1)) end--
  // and the leading ones (presentation design 8.3): a body never starts with an empty line
  let begin = 0
  while (begin < end && /^\s*$/.test(all[begin]) && !protectedLines.has(begin)) begin++
  let last = ''
  const lines = all.slice(begin, end).map((line, offset) => {
    const index = begin + offset
    let str = line
    if (protectedLines.has(index)) {
      last = ''
      return str
    }
    if (/^ *$/.test(str)) str += _VAULT_SPACER + '\n'
    if (/^ *>[> ]*$/.test(str)) str += _VAULT_NBSP
    if (_VAULT_LIST_LINE.test(last) && !_VAULT_LIST_LINE.test(line)) str = '\n' + str
    if (/^ *(?:---+|___+|\*\*\*+) *$/.test(str)) str = '\n' + _VAULT_RULE + '\n'
    else if (/^ *(?:-+|=+) *$/.test(line)) str += ' ' + _VAULT_NBSP
    if (/^\s*\|/.test(last) && !/^\s*\|/.test(line)) str = '\n' + str
    const lastDepth = last.match(/^[> ]*/)[0].replace(/ /g, '').length
    const depth = line.match(/^[> ]*/)[0].replace(/ /g, '').length
    if (depth < lastDepth) str = line.match(/^[> ]*/)[0] + '\n' + str
    last = line
    return str
  })
  return lines.join('\n')
}
// the sentinels' encoded forms (the grammar carrier encodes every control character)
const _vault_sentinel = ch => '&#' + ch.codePointAt(0) + ';'
function _vault_source_view(body) {
  const marked = _vault_marked()
  if (marked === null) return _vault_carrier(body)
  let html = marked.parse(_vault_line_pass(marked, body))
  html = html.split('<p>' + _vault_sentinel(_VAULT_RULE) + '</p>').join('<hr>').split(_vault_sentinel(_VAULT_SPACER)).join('&#160;<br>').split(_vault_sentinel(_VAULT_NBSP)).join('&#160;')
  html = html.replace(/\n{2,}/g, '\n').trim()
  const lines = html.split('\n').filter(line => line.length).map(line => (line[0] == '<' ? line : '<p>' + line + '</p>'))
  return '<div class="vault-source">' + lines.join('\n') + '</div>'
}

// the frontmatter view: the highlighter's trusted structure and classes with every text node
// re-encoded through the grammar carrier (the highlighter's own entities interpreted first,
// never double-escaped) and its comment class renamed away from the app's post-render
// linkifier; the text-exact carrier when the highlighter is unavailable
// the highlighter's output filtered to its trusted structure: only spans with class names
// survive (the comment class renamed away from the app's post-render linkifier), every text
// piece is decoded once (the highlighter's own entities) and re-encoded through the grammar
// carrier; null when the highlighter is unavailable, does not know the language, or fails
function _vault_highlight(text, language) {
  const hljs = typeof window != 'undefined' ? window.hljs : undefined
  let value = null
  try {
    if (hljs && typeof hljs.highlight == 'function' && (typeof hljs.getLanguage != 'function' || hljs.getLanguage(language)))
      value = hljs.highlight(text, { language }).value
  } catch (e) {
    value = null
  }
  if (typeof value != 'string') return null
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
  return out
}
// the frontmatter view (7.4): managed references are masked by one control-character sentinel
// (U+0004, outside the text domain like the line pass's) before highlighting, so the
// highlighter's tokenization cannot split them; every mask in the filtered output becomes the
// item's tag link showing the reference's exact spelling (the view is source-exact), in order;
// the text-exact carrier when the highlighter is unavailable or did not keep every mask
const _VAULT_REF_MASK = '\u0004'
function _vault_frontmatter_view(frontmatter) {
  const refs = frontmatter.match(new RegExp(_VAULT_WIKI_ANYWHERE.source, 'g')) || []
  const masked = frontmatter.replace(new RegExp(_VAULT_WIKI_ANYWHERE.source, 'g'), _VAULT_REF_MASK)
  const out = _vault_highlight(masked, 'yaml')
  if (out === null) return _vault_carrier(frontmatter)
  const pieces = out.split(_vault_sentinel(_VAULT_REF_MASK))
  if (pieces.length != refs.length + 1) return _vault_carrier(frontmatter) // the highlighter dropped or split a mask: fail to the carrier
  const view = pieces.map((piece, n) => (n < refs.length ? piece + _vault_item_link(refs[n].replace(/^!?\[\[/, '').replace(/\]\]$/, '').replace(/\.md$/, '') + '.md', refs[n]) : piece)).join('')
  return '<pre class="vault-frontmatter" style="white-space:pre-wrap;margin:0"><code class="hljs language-yaml">' + view + '</code></pre>'
}

// the expanded context (agent/chat.js): the pinned instructions as plain text, or an error
// (presentation design 7.6): an item that cannot supply standalone context throws, so the
// chat consumer fails with the reason instead of inserting a fixed string
function _vault_expanded(p) {
  const h = p.head_preview
  if (!h) throw new Error('vault: no pinned preview (not in the stored sync snapshot)')
  if (h.kind == 'section') throw new Error('vault: a section carries no standalone context; include its config item instead')
  if (typeof h.exact.instructions == 'string') return h.exact.instructions
  throw new Error('vault: the pinned instructions are null')
}

const _vault_mode = () => last(window._template_dict ?? [])?._vault
const _vault_is_expanded = () => (window._item_eval_context ?? []).includes('expanded')

// a toggle over the sibling's navigation composition (nested mode). the label is bare
// references (no element, no quote): toggle() copies its label into the revealed div's
// title attribute unescaped, so a block carrier there would break the div's start tag
const _vault_embed = path => toggle(template(_vault_label(path), { _vault: 'navigation' }), '⋮ ' + _vault_refs('![[' + path.replace(/\.md$/, '') + ']]'))

// navigation: the parts in order, text parts as inert markdown and target parts as toggles,
// under one container (no marker scanning: provenance is the producer's)
const _vault_navigation = h =>
  _vault_container(h.navigation.map(part => ('target' in part ? _vault_embed(part.target) : _vault_source_view(part.text))))

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

// the pinned projection (the stored snapshot): the config fields as inert markdown, the base toggle, the
// navigation toggle when the composition has target parts; frozen order
function _vault_projection(h) {
  const parts = []
  if (h && h.kind == 'config') {
    for (const name of ['instructions', 'run_instructions', 'user_prompt'])
      if (h.exact[name] !== null) parts.push(toggle(_vault_source_view(h.exact[name]), '⋮ ' + name + ' (' + h.exact.profile + ' profile)'))
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
  if (state.note) {
    // (presentation design 7.6): no fixed diagnostic string enters a chat context either
    if (_vault_is_expanded()) throw new Error('vault: ' + state.note.replace(/^vault /, ''))
    return placeholder(state.note)
  }
  const p = state.store
  if (_vault_is_expanded()) return _vault_expanded(p)
  const h = p.head_preview
  if (_vault_mode() == 'navigation') return h ? _vault_navigation(h) : placeholder('no pinned preview')
  const view = []
  if (state.frontmatter !== null) view.push(_vault_frontmatter_view(state.frontmatter))
  if (state.body.trim().length) {
    // (presentation design 8.3) one blank line between the frontmatter and a non-blank body
    if (state.frontmatter !== null) view.push('<p>&#160;<br></p>')
    view.push(_vault_source_view(state.body))
  }
  const projection = _vault_projection(h)
  // (8.3) and one blank line above the projection toggle when anything precedes it
  if (view.length) view.push('<p>&#160;<br></p>')
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
    () => throws(() => _vault_expanded(checked)),
    () => throws(() => _vault_check_store({ v: 1 })),
    () => throws(() => _vault_check_store({ ...p, pinned_source: null }))
  )
}
