// #template/vault -- renders vault files synced as #vault/... items (vault design
// notes/design/mind_sync.md, revision 8). a managed item carries its editable file in
// a `jinja_removed` block (every macro opener escaped with a backslash) and, in a
// `vault_removed` block, one line of base64: the canonical JSON payload (schema v1)
// whose optional `head_preview` object holds the vault's pinned-HEAD renders and
// navigation facts. this renderer parses the current item's envelope and decodes its
// payload through ONE strict path, shows text through a character-reference carrier
// (exact through the app's post-macro rewrites and the html parser), splits navigation
// at the payload's managed slots into carriers and toggles under one container, returns
// only a navigation composition in the nested mode, and returns plain text in the
// expanded context. it runs no Jinja: the vault renders, the item displays.
//
// CURRENT-ITEM IDENTITY: the envelope (text and name) is read from _this, the item whose
// macro is being evaluated, never from _that (the outer rendered item, which toggle()
// binds its click handler to). tests/template_vault_test.js evaluates this file under
// a stub template environment (plain node). this file is item-embedded JS: it never
// spells a literal macro opener/closer, fence line, template or inert marker, eval-macro
// opener, or id token; the test command scans it for them.
//
// NOT A PRE-EXECUTION FENCE: the app evaluates macros over the whole item before its
// removed-block pass and interprets blocks and inert constructs by its own grammar, so a raw
// opener or a malformed block/inert construct typed into the source can be interpreted
// before or around this renderer. producer escaping keeps generated items safe and the
// sync's admission (phase 1) refuses pulling malformed remote text; refusing arbitrary
// raw editor input is an app grammar/editor concern outside this renderer.

const _VAULT_PATH = /^agents(?:\/[a-z0-9_]+)+\.md$/
const _VAULT_RELATION = ['matches', 'differs', 'absent']
const _VAULT_TOP = ['v', 'path', 'source_head_relation', 'head_preview']
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
const _VAULT_PAYLOAD_OPENER = _VAULT_FENCE + 'vault_removed'
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
// a carrier-bound value: text inside the shared domain without a delimiter occurrence
const _vault_unsafe = text => _VAULT_DELIMITER.test(text) || _VAULT_DOMAIN.test(text)

// the ONE strict decoder (both macros use it): the exact one-line body (no surrounding
// whitespace), canonical base64 (byte round trip), fatal utf-8, strict JSON.parse,
// schema v1 with the exact key matrix, types, enums, the path grammar, and the text
// domain plus delimiter fence on every carrier-bound field. canonical JSON is a producer
// invariant: no reserialization claim here
function _vault_decode(body) {
  if (typeof body != 'string' || /\s/.test(body)) throw new Error('payload: not one unwrapped line')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(body)) throw new Error('payload: not base64')
  const bytes = Uint8Array.from(atob(body), c => c.charCodeAt(0))
  let ascii = ''
  for (const b of bytes) ascii += String.fromCharCode(b)
  if (btoa(ascii) != body) throw new Error('payload: non-canonical base64')
  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const p = JSON.parse(json)
  if (!p || typeof p != 'object' || Array.isArray(p)) throw new Error('payload: not an object')
  if (p.v !== 1) throw new Error('payload: not schema v1')
  if (!_vault_same_keys(p, _VAULT_TOP)) throw new Error('payload: keys')
  if (typeof p.path != 'string' || !_VAULT_PATH.test(p.path)) throw new Error('payload: bad path')
  if (!_VAULT_RELATION.includes(p.source_head_relation)) throw new Error('payload: bad relation')
  const h = p.head_preview
  if (h === null) {
    if (p.source_head_relation != 'absent') throw new Error('payload: null preview for a present path')
    return p
  }
  if (p.source_head_relation == 'absent') throw new Error('payload: preview for an absent path')
  if (!h || typeof h != 'object' || Array.isArray(h)) throw new Error('payload: bad preview')
  if (!['section', 'config'].includes(h.kind) || !_vault_same_keys(h, _VAULT_PREVIEW)) throw new Error('payload: preview keys')
  _vault_check_navigation(h.navigation)
  if (h.base !== null && (h.kind == 'section' || typeof h.base != 'string' || !_VAULT_PATH.test(h.base))) throw new Error('payload: bad base')
  if (h.kind == 'section') {
    if (h.exact !== null) throw new Error('payload: section exact')
    return p
  }
  const x = h.exact
  if (!x || typeof x != 'object' || Array.isArray(x) || !_vault_same_keys(x, _VAULT_EXACT)) throw new Error('payload: exact keys')
  if (!['bridge', 'bare'].includes(x.profile)) throw new Error('payload: bad profile')
  for (const k of ['instructions', 'run_instructions', 'user_prompt']) {
    if (!_vault_text(x[k])) throw new Error('payload: bad ' + k)
    if (x[k] !== null && _vault_unsafe(x[k])) throw new Error('payload: unsafe ' + k)
  }
  return p
}

// the positional navigation wire: parts with exactly one key, `text` (non-empty admitted
// text, never adjacent to another text part) or `target` (a managed path, may repeat)
function _vault_check_navigation(parts) {
  if (!Array.isArray(parts)) throw new Error('payload: navigation is not a list')
  let previous = null
  for (const part of parts) {
    if (!part || typeof part != 'object' || Array.isArray(part) || Object.keys(part).length != 1) throw new Error('payload: navigation part shape')
    const key = Object.keys(part)[0]
    if (key == 'text') {
      if (typeof part.text != 'string' || !part.text || previous == 'text' || _vault_unsafe(part.text)) throw new Error('payload: bad navigation text')
    } else if (key == 'target') {
      if (typeof part.target != 'string' || !_VAULT_PATH.test(part.target)) throw new Error('payload: bad navigation target')
    } else throw new Error('payload: navigation part key')
    previous = key
  }
}

const _vault_label = path => '#vault/' + path.replace(/\.md$/, '')

// the app's fence grammar, mirrored: a line of optional whitespace and three backticks opens
// a block (its type token follows) and, inside a block, closes it; the app recognizes a block
// type with an optional colon prefix, an optional _hidden/_removed suffix, an optional
// dotted suffix, case-insensitively. the envelope accepts ONLY the two exact opener lines and
// refuses every other fence: a recognized source/payload-family variant (a raw or hidden or
// prefixed or suffixed sibling the app would treat as the same family), an unrelated block,
// and an orphan fence
const _VAULT_FENCE_LINE = new RegExp('^\\s*' + _VAULT_FENCE)
const _VAULT_FAMILY = new RegExp('^\\s*' + _VAULT_FENCE + '(?:\\S+:)?(?:jinja|vault)(?:_hidden|_removed)?(?::\\S*\\.\\S*)?(?:\\s|$)', 'i')
// the reserved source markers (design section 5): the consumer's delimiter and the inert
// marker, matched as a deliberately broad superset
const _VAULT_RESERVED = new RegExp('<!' + '--\\s*/?\\s*(?:template|inert)\\s*-' + '->', 'i')

// the current item's envelope (design sections 3 and 5), one line-state pass over _this.text:
// exactly one source block and one payload block behind their exact opener lines and closed by
// an exact bare fence, no other fence anywhere, the source with at least its one canonical
// body line (an empty file is opener, one empty line, closer), the payload as one line, the
// source recanonicalizing exactly (a raw opener fails), inside the shared text domain, and
// free of reserved markers, and the item's name agreeing with the payload's path
function _vault_envelope() {
  const lines = _this.text.split('\n')
  const blocks = { source: [], payload: [] }
  for (let i = 0; i < lines.length; i++) {
    if (!_VAULT_FENCE_LINE.test(lines[i])) continue
    const type = lines[i] == _VAULT_SOURCE_OPENER ? 'source' : lines[i] == _VAULT_PAYLOAD_OPENER ? 'payload' : null
    if (!type) throw new Error(_VAULT_FAMILY.test(lines[i]) ? 'envelope: variant block' : 'envelope: unexpected fence')
    let end = i + 1
    while (end < lines.length && !_VAULT_FENCE_LINE.test(lines[end])) end++
    if (end == lines.length) throw new Error('envelope: unclosed block')
    if (lines[end] != _VAULT_FENCE) throw new Error('envelope: fence-shaped line inside a block')
    blocks[type].push(lines.slice(i + 1, end))
    i = end
  }
  if (blocks.source.length != 1) throw new Error('envelope: exactly one source block')
  if (blocks.payload.length != 1) throw new Error('envelope: exactly one payload block')
  if (blocks.source[0].length < 1) throw new Error('envelope: source without its separator line')
  if (blocks.payload[0].length != 1) throw new Error('envelope: payload is one line')
  const body = blocks.source[0].join('\n')
  const source = _vault_unescape(body)
  if (_vault_escape(source) != body) throw new Error('envelope: raw opener in the source')
  if (source.includes('\r') || _VAULT_DOMAIN.test(source)) throw new Error('envelope: source outside the text domain')
  if (_VAULT_RESERVED.test(source)) throw new Error('envelope: reserved marker in the source')
  const payload = _vault_decode(blocks.payload[0][0])
  if (_this.name != _vault_label(payload.path)) throw new Error('envelope: label does not name the payload path')
  return { source, payload }
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

// badge next to the label: the selected source's relation to the sync-pinned HEAD at last sync
function vault_badge() {
  let text
  try {
    const p = _vault_envelope().payload
    text = `${p.head_preview ? p.head_preview.kind : 'no preview'} · ${p.path} · source ${p.source_head_relation} sync-pinned HEAD at last sync`
  } catch (e) {
    text = 'vault payload invalid'
  }
  // the expanded context (agent/chat.js) gets plain text from both macros: no markup, no carrier
  if (_vault_is_expanded()) return 'vault badge: ' + text
  return `<span class="template_placeholder" title="managed by the vault sync">${_vault_inline(text)}</span>`
}

// the template region of a managed item (frozen order: exact fields, base, navigation, source)
function vault_render() {
  let env
  try {
    env = _vault_envelope()
  } catch (e) {
    return _vault_is_expanded() ? 'vault: payload invalid' : placeholder('vault payload invalid')
  }
  const p = env.payload
  if (_vault_is_expanded()) return _vault_expanded(p)
  const h = p.head_preview
  if (_vault_mode() == 'navigation') return h ? _vault_navigation(h) : placeholder('no pinned preview')
  const parts = []
  if (h && h.kind == 'config') {
    for (const name of ['instructions', 'run_instructions', 'user_prompt'])
      if (h.exact[name] !== null) parts.push(toggle(_vault_carrier(h.exact[name]), '⋮ ' + name + ' (' + h.exact.profile + ' profile, sync-pinned HEAD)'))
    if (h.base) parts.push(_vault_embed(h.base))
  }
  if (h) parts.push(toggle(_vault_navigation(h), '⋮ navigation (bridge/default context, sync-pinned HEAD)'))
  else parts.push(placeholder('no pinned preview (not in HEAD at last sync)'))
  // the editable source is always shown, an empty file included
  parts.push(toggle(_vault_carrier(env.source), '⋮ source'))
  return _vault_container(parts)
}

function _test_vault_helpers() {
  const lt2 = '<' + '<'
  const p = { v: 1, path: 'agents/x.md', source_head_relation: 'matches', head_preview: { kind: 'section', navigation: [{ text: 'A ' + lt2 + 'x' }, { target: 'agents/y.md' }, { text: 'tail' }], base: null, exact: null } }
  const body = btoa(unescape(encodeURIComponent(JSON.stringify(p))))
  const decoded = _vault_decode(body)
  check(
    () => _vault_unescape('a \\' + lt2 + 'b') == 'a ' + lt2 + 'b',
    () => _vault_escape('a ' + lt2 + 'b') == 'a \\' + lt2 + 'b',
    () => decoded.head_preview.navigation.length == 3 && decoded.head_preview.navigation[1].target == 'agents/y.md',
    () => _vault_carrier('a\nb') == '<pre style="white-space:pre-wrap;margin:0"><code>&#97;&#10;&#98;</code></pre>',
    () => _vault_expanded(decoded) == 'vault: navigation only',
    () => throws(() => _vault_decode(btoa('{"v":2}'))),
    () => throws(() => _vault_decode(' ' + body))
  )
}
