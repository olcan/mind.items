// #template/vault -- renders vault files synced as #vault/... items (vault design
// notes/design/mind_sync_store.md, the v2 representation over notes/design/mind_sync.md).
// a managed item carries its editable file in a `jinja_removed` block (every macro opener
// escaped with a backslash); the vault's pinned snapshot lives in the item's hidden store
// under the `_vault` key: the pinned source (the file at the commit pinned by the sync
// snapshot the store currently holds) and the optional `head_preview` object with the
// vault's pinned-HEAD renders and navigation facts. this renderer parses the current item's
// source envelope, reads the store through the NON-SAVING `_global_store` accessor (the
// `global_store` accessor schedules a save on every read and can re-persist a stale copy),
// validates the observable `_vault` contract, shows text through a character-reference
// carrier (exact through the app's post-macro rewrites and the html parser), splits
// navigation at the store's managed slots into carriers and toggles under one container,
// returns only a navigation composition in the nested mode, and returns plain text in the
// expanded context. the badge is LIVE: it compares the editable source with the pinned
// source at render time. it runs no Jinja: the vault renders, the item displays.
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
// input is an app grammar/editor concern outside this renderer.

const _VAULT_PATH = /^agents(?:\/[a-z0-9_]+)+\.md$/
const _VAULT_STORE = ['v', 'path', 'pinned_source', 'head_preview']
const _VAULT_PREVIEW = ['kind', 'navigation', 'base', 'exact']
const _VAULT_EXACT = ['profile', 'instructions', 'run_instructions', 'user_prompt']
// the consumer's template delimiter tokens (literal spaces, case-sensitive), matched as
// OCCURRENCES anywhere: the template helper extracts greedily between occurrences
const _VAULT_DELIMITER = new RegExp('<!-' + '- *\\/?template *-' + '->')
// the shared text domain: scalar values only; TAB and LF are the only admitted controls
const _VAULT_DOMAIN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/
// the envelope's exact opener line and closer (spelled without a fence line here)
const _VAULT_FENCE = '`'.repeat(3)
const _VAULT_SOURCE_OPENER = _VAULT_FENCE + 'jinja_removed'
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
// dotted suffix, case-insensitively. the envelope accepts ONLY the exact source opener line
// and refuses every other fence: a recognized source-family variant (a raw or hidden or
// prefixed or suffixed sibling the app would treat as the same family), a leftover v1
// payload block (the `vault` family), an unrelated block, and an orphan fence
const _VAULT_FENCE_LINE = new RegExp('^\\s*' + _VAULT_FENCE)
const _VAULT_FAMILY = new RegExp('^\\s*' + _VAULT_FENCE + '(?:\\S+:)?(?:jinja|vault)(?:_hidden|_removed)?(?::\\S*\\.\\S*)?(?:\\s|$)', 'i')
// the reserved source markers (design section 5): the consumer's delimiter and the inert
// marker, matched as a deliberately broad superset
const _VAULT_RESERVED = new RegExp('<!' + '--\\s*/?\\s*(?:template|inert)\\s*-' + '->', 'i')

// the current item's source envelope (design sections 3 and 5), one line-state pass over
// _this.text: exactly one source block behind its exact opener line and closed by an exact
// bare fence, no other fence anywhere, with at least its one canonical body line (an empty
// file is opener, one empty line, closer), recanonicalizing exactly (a raw opener fails),
// inside the shared text domain, and free of reserved markers. returns the editable source
function _vault_envelope() {
  const lines = _this.text.split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    if (!_VAULT_FENCE_LINE.test(lines[i])) continue
    if (lines[i] != _VAULT_SOURCE_OPENER) throw new Error(_VAULT_FAMILY.test(lines[i]) ? 'envelope: variant block' : 'envelope: unexpected fence')
    let end = i + 1
    while (end < lines.length && !_VAULT_FENCE_LINE.test(lines[end])) end++
    if (end == lines.length) throw new Error('envelope: unclosed block')
    if (lines[end] != _VAULT_FENCE) throw new Error('envelope: fence-shaped line inside a block')
    blocks.push(lines.slice(i + 1, end))
    i = end
  }
  if (blocks.length != 1) throw new Error('envelope: exactly one source block')
  if (blocks[0].length < 1) throw new Error('envelope: source without its separator line')
  const body = blocks[0].join('\n')
  const source = _vault_unescape(body)
  if (_vault_escape(source) != body) throw new Error('envelope: raw opener in the source')
  if (source.includes('\r') || _VAULT_DOMAIN.test(source)) throw new Error('envelope: source outside the text domain')
  if (_VAULT_RESERVED.test(source)) throw new Error('envelope: reserved marker in the source')
  return source
}

// the current item's state: its editable source and its validated `_vault` store, or one
// fail-closed note. the store is read through the NON-SAVING accessor; the identity rule is
// the item's unique NAME (duplicate labels become id-names in the app and fail closed here)
function _vault_state() {
  let source
  try {
    source = _vault_envelope()
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
  return { note: null, source, store }
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

// the expanded context (agent/chat.js): exactly one plain string, never a composition
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

// the live badge text (design v2 section 3, the owner's precise phrasing): the editable
// source against the pinned source of the snapshot the store currently holds; a null preview
// carries no kind
function _vault_badge_text(state) {
  if (state.note) return state.note
  const p = state.store
  if (p.head_preview === null) return p.path + ' · not in the stored sync snapshot'
  const head = p.head_preview.kind + ' · ' + p.path
  return state.source === p.pinned_source ? head : head + ' · differs from the stored sync snapshot'
}

// badge next to the label
function vault_badge() {
  const text = _vault_badge_text(_vault_state())
  // the expanded context (agent/chat.js) gets plain text from both macros: no markup, no carrier
  if (_vault_is_expanded()) return 'vault badge: ' + text
  return `<span class="template_placeholder" title="managed by the vault sync">${_vault_inline(text)}</span>`
}

// the template region of a managed item (frozen order: exact fields, base, navigation; the
// editable source is the editor's, not a control)
function vault_render() {
  const state = _vault_state()
  if (state.note) return _vault_is_expanded() ? 'vault: ' + state.note.replace(/^vault /, '') : placeholder(state.note)
  const p = state.store
  if (_vault_is_expanded()) return _vault_expanded(p)
  const h = p.head_preview
  if (_vault_mode() == 'navigation') return h ? _vault_navigation(h) : placeholder('no pinned preview')
  const parts = []
  if (h && h.kind == 'config') {
    for (const name of ['instructions', 'run_instructions', 'user_prompt'])
      if (h.exact[name] !== null) parts.push(toggle(_vault_carrier(h.exact[name]), '⋮ ' + name + ' (' + h.exact.profile + ' profile)'))
    if (h.base) parts.push(_vault_embed(h.base))
  }
  if (h) parts.push(toggle(_vault_navigation(h), '⋮ navigation (bridge/default context)'))
  else parts.push(placeholder('no pinned preview (not in the stored sync snapshot)'))
  return _vault_container(parts)
}

function _test_vault_helpers() {
  const lt2 = '<' + '<'
  const p = { v: 2, path: 'agents/x.md', pinned_source: 'x', head_preview: { kind: 'section', navigation: [{ text: 'A ' + lt2 + 'x' }, { target: 'agents/y.md' }, { text: 'tail' }], base: null, exact: null } }
  const checked = _vault_check_store(p)
  check(
    () => _vault_unescape('a \\' + lt2 + 'b') == 'a ' + lt2 + 'b',
    () => _vault_escape('a ' + lt2 + 'b') == 'a \\' + lt2 + 'b',
    () => checked.head_preview.navigation.length == 3 && checked.head_preview.navigation[1].target == 'agents/y.md',
    () => _vault_carrier('a\nb') == '<pre style="white-space:pre-wrap;margin:0"><code>&#97;&#10;&#98;</code></pre>',
    () => _vault_expanded(checked) == 'vault: navigation only',
    () => throws(() => _vault_check_store({ v: 1 })),
    () => throws(() => _vault_check_store({ ...p, pinned_source: null }))
  )
}
