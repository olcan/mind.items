#!/usr/bin/env node
// plain-node table for template/vault.js (the #template/vault renderer, v2 representation with
// the source-first presentation), evaluated from the INSTALLED source under a stub template
// environment with the REAL Marked dependency and a stub highlighter: the source codec
// vectors, the store contract (`_vault` under the item's store, read through the non-saving
// accessor; the exact key matrix, types, the pinned source rule, the preview checks), the
// two-block source envelope (exact framing of the frontmatter and source blocks, the framing
// vectors shared with the Python table, a leftover v1 payload block refused, canonical
// blocks, empty source), the fail-closed notes (source invalid, store missing, store invalid,
// the name identity rule with the duplicate-label id-name), the live badge formats (the
// visible view without the path, the expanded context with it), the carriers, the container,
// the inert source view over real Marked, the frontmatter view, the entity decoder boundary,
// the navigation consumer (no rescan of text parts), the frozen control order behind the
// projection toggle, the current-item identity (_this, never _that), the expanded-context
// strings, the hygiene scan of the installed source, and the six synthetic fixtures
// (manifest, envelope plus sidecar store, dependency tags, the performance root's size).
// run: node external/mind.items/tests/template_vault_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const src = fs.readFileSync(path.join(__dirname, '..', 'template', 'vault.js'), 'utf8')

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}
const throws = f => {
  try {
    f()
    return false
  } catch (e) {
    return true
  }
}
const lt2 = '<' + '<'
const gt2 = '>' + '>'
const fence = '`'.repeat(3)

// hygiene: the installed source (comments and tests included) never spells consumer grammar
const forbidden = [lt2, gt2, '<!' + '--', '@' + '{', '$' + 'id', '$' + 'name', '$' + 'hash', '$' + 'deephash', '$' + 'cid']
for (const token of forbidden) check(`source never spells ${JSON.stringify(token)}`, src.includes(token), false)
check('source has no fence line', new RegExp('^\\s*' + fence, 'm').test(src), false)
check('source has no raw control characters', /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b]/.test(src), false)
check('source never reads the saving accessor', /\bglobal_store\b(?!`)/.test(src.replace(/_global_store/g, '')), false)

// the stub template environment: what the app and #template provide to item javascript
const calls = { template: [], toggle: [] }
// the app's exposed Marked is the real dependency (mind.page's), so the inert renderer is
// exercised over real tokenization; the highlighter is a stub that returns known markup
const { Marked } = require(path.join(__dirname, '..', '..', 'mind.page', 'node_modules', 'marked'))
const hljsStub = {
  highlight: (text, opts) => ({
    value: text
      .split('\n')
      .map(line => (line.startsWith('#') ? '<span class="hljs-comment">' + line.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>' : line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/^([a-z_]+):/, '<span class="hljs-attr">$1:</span>')))
      .join('\n'),
    language: opts.language,
  }),
}
const ctx = {
  TextDecoder, String, Set, RegExp, JSON, Object, Array, Math, Error, Number, parseInt,
  window: { _template_dict: [], _item_eval_context: [], Marked, hljs: hljsStub },
  last: a => a[a.length - 1],
  placeholder: text => '[placeholder ' + text + ']',
  template: (name, dict) => {
    calls.template.push({ name, dict })
    return '[template ' + name + ']'
  },
  toggle: (content, label) => {
    calls.toggle.push({ label, that: ctx._that && ctx._that.id })
    return '[toggle ' + label + ']\n' + content + '\n[/toggle]'
  },
  _this: null,
  _that: null,
}
const _VAULT_WINDOW_UNITS = 4096
const h = vm.runInNewContext(
  src +
    ';({ _vault_unescape, _vault_escape, _vault_check_store, _vault_envelope, _vault_envelope_parts, _vault_badge_visible, _vault_source_view, _vault_frontmatter_view, _vault_decode_entities, _vault_grammar_refs, _vault_state, _vault_refs, _vault_carrier, _vault_inline, _vault_container, _vault_expanded, _vault_navigation, _vault_badge_text, vault_render, vault_badge })',
  ctx
)
const reset = () => {
  calls.template.length = 0
  calls.toggle.length = 0
  ctx.window._template_dict = []
  ctx.window._item_eval_context = []
}

// the source codec: the design section 5 vectors, the SAME literals as the Python table
const vectors = [
  [lt2 + 'x' + gt2, '\\' + lt2 + 'x' + gt2],
  ['\\' + lt2, '\\\\' + lt2],
  ['\\\\' + lt2, '\\\\\\' + lt2],
  ['\\\\\\' + lt2, '\\\\\\\\' + lt2],
  [lt2 + '<', '\\' + lt2 + '<'],
  [lt2 + lt2, '\\' + lt2 + '\\' + lt2],
  [lt2 + lt2 + '<', '\\' + lt2 + '\\' + lt2 + '<'],
  ['a' + lt2 + 'b' + lt2 + 'c', 'a\\' + lt2 + 'b\\' + lt2 + 'c'],
  ['<', '<'],
  ['', ''],
  ['\n\n' + lt2 + 'a' + gt2 + '\n', '\n\n\\' + lt2 + 'a' + gt2 + '\n'],
]
for (const [text, escaped] of vectors) {
  check(`codec vector ${JSON.stringify(text)} encodes`, h._vault_escape(text), escaped)
  check(`codec vector ${JSON.stringify(text)} decodes`, h._vault_unescape(escaped), text)
}
check('a raw opener is not the image of any source', h._vault_escape(h._vault_unescape(lt2 + 'x')) === lt2 + 'x', false)
check('every positive backslash run is a canonical image', h._vault_escape(h._vault_unescape('\\\\\\\\' + lt2)), '\\\\\\\\' + lt2)

// the item skeleton: mirrors the frozen v2 skeleton (design v2 section 3), no payload block
const itemText = (label, source, deps) =>
  [label + ' ' + lt2 + 'vault_badge()' + gt2, fence + 'jinja_removed', h._vault_escape(source), fence, '<!' + '-- template --' + '>', lt2 + 'vault_render()' + gt2, '<!' + '-- /template --' + '>', ['#_template/vault', ...deps].join(' ')].join('\n')
const labelOf = store => '#vault/' + store.path.replace(/\.md$/, '')
// a stub item: text, name, the non-saving store accessor, and a SAVING accessor that throws,
// so any read through it fails the table
const stub = fields =>
  Object.defineProperty({ ...fields }, 'global_store', {
    get() {
      throw new Error('the saving accessor was read')
    },
  })
const item = (id, store, source, extra = {}, label = store && labelOf(store)) =>
  stub({ id, name: label, text: itemText(label, source, []), _global_store: store === undefined ? undefined : { _vault: store, ...extra } })
// a variant of a stub item (never spread a stub: that would evaluate the throwing getter)
const variant = (base, over) => stub({ id: base.id, name: base.name, text: base.text, _global_store: base._global_store, ...over })

const section = { v: 2, path: 'agents/x.md', pinned_source: 'source X', head_preview: { kind: 'section', navigation: [{ text: 'ünï ' + lt2 + 'x @{y}@ <b>' }, { target: 'agents/y.md' }, { text: 'mid' }, { target: 'agents/y.md' }], base: null, exact: null } }
const config = { v: 2, path: 'agents/c.md', pinned_source: 'source C', head_preview: { kind: 'config', navigation: [], base: 'agents/worker.md', exact: { profile: 'bridge', instructions: 'I ---\n# x', run_instructions: null, user_prompt: null } } }
const absent = { v: 2, path: 'agents/x.md', pinned_source: null, head_preview: null }
check('store contract: section', h._vault_check_store(section), section)
check('store contract: config', h._vault_check_store(config), config)
check('store contract: absent', h._vault_check_store(absent), absent)
check('store contract: non-ascii, line separator, supplementary, tab', h._vault_check_store({ ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'é 😀\tx\n' }] } }).head_preview.navigation[0].text, 'é 😀\tx\n')
const rejects = {
  'v1 schema': { v: 1, path: 'agents/x.md', source_head_relation: 'matches', head_preview: section.head_preview },
  'wrong version': { ...section, v: 3 },
  'string version': { ...section, v: '2' },
  'extra key': { ...section, extra: 1 },
  'missing pinned source': { v: 2, path: 'agents/x.md', head_preview: section.head_preview },
  'bad path': { ...section, path: 'agents/Bad.md' },
  'unmanaged path': { ...section, path: 'lib/x.md' },
  'null pinned source with a preview': { ...section, pinned_source: null },
  'pinned source with a null preview': { ...absent, pinned_source: 'x' },
  'non-text pinned source': { ...section, pinned_source: 1 },
  'carriage return in the pinned source': { ...section, pinned_source: 'a\rb' },
  'control in the pinned source': { ...section, pinned_source: 'ab' },
  'lone surrogate in the pinned source': { ...section, pinned_source: 'a\ud800b' },
  'unknown kind': { ...section, head_preview: { ...section.head_preview, kind: 'other' } },
  'array preview': { ...section, head_preview: [] },
  'unmanaged target part': { ...section, head_preview: { ...section.head_preview, navigation: [{ target: 'lib/x.md' }] } },
  'empty text part': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: '' }] } },
  'adjacent text parts': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'a' }, { text: 'b' }] } },
  'two-key part': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'a', target: 'agents/y.md' }] } },
  'unknown part key': { ...section, head_preview: { ...section.head_preview, navigation: [{ other: 'a' }] } },
  'string navigation': { ...section, head_preview: { ...section.head_preview, navigation: 'text' } },
  'base on section': { ...section, head_preview: { ...section.head_preview, base: 'agents/worker.md' } },
  'delimiter line in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'a\n<!' + '-- template --' + '>\nb' }] } },
  'inline closer in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'x<!' + '-- /template --' + '>y' }] } },
  'bare opener in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: '<!' + '--template--' + '>' }] } },
  'control in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'a b' }] } },
  'c1 in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'ab' }] } },
  'zwsp in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'a​b' }] } },
  'lone surrogate in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'a\ud800b' }] } },
  'exact object on section': { ...section, head_preview: { ...section.head_preview, exact: config.head_preview.exact } },
  'missing exact key on section': { ...section, head_preview: { kind: 'section', navigation: [], base: null } },
  'null exact on config': { ...config, head_preview: { ...config.head_preview, exact: null } },
  'bad profile': { ...config, head_preview: { ...config.head_preview, exact: { ...config.head_preview.exact, profile: 'run' } } },
  'delimiter in exact': { ...config, head_preview: { ...config.head_preview, exact: { ...config.head_preview.exact, instructions: '<!' + '--/template--' + '>' } } },
  'array store': [1],
  'null store': null,
  'string store': 'x',
}
for (const [name, bad] of Object.entries(rejects)) check(`store contract rejects ${name}`, throws(() => h._vault_check_store(bad)), true)

check('carrier is one line of references inside pre>code', h._vault_carrier('\na\n-'), '<pre style="white-space:pre-wrap;margin:0"><code>&#10;&#97;&#10;&#45;</code></pre>')
check('carrier handles astral code points', h._vault_carrier('😀'), '<pre style="white-space:pre-wrap;margin:0"><code>&#128512;</code></pre>')
check('carrier of empty text', h._vault_carrier(''), '<pre style="white-space:pre-wrap;margin:0"><code></code></pre>')
check('inline carrier is references only', h._vault_inline('a b'), '<code>&#97;&#32;&#98;</code>')
check('container has no blank lines', h._vault_container(['<pre>a</pre>', '<span>b</span>\n<div>c</div>']).includes('\n\n'), false)
check('repeated target parts survive the contract', h._vault_check_store(section).head_preview.navigation.filter(p => p.target).length, 2)
check('expanded section throws (7.6)', throws(() => h._vault_expanded(section)), true)
check('expanded config', h._vault_expanded(config), 'I ---\n# x')
check('expanded config with null instructions throws (7.6)', throws(() => h._vault_expanded({ ...config, head_preview: { ...config.head_preview, exact: { profile: 'bare', instructions: null, run_instructions: 'R', user_prompt: 'U' } } })), true)
check('expanded absent throws (7.6)', throws(() => h._vault_expanded(absent)), true)

// the consumer boundary never rescans text parts: one nested call, the marker byte-for-byte;
// the nested toggle's label is bare references (no element, no quote: it lands in a title)
for (const marker of ['![[agents/x]]', '\n![[agents/x]]\n']) {
  reset()
  ctx._this = ctx._that = { id: 'id_nav', name: '#vault/agents/nav' } // the text part's links carry the current item's id
  const html = h._vault_navigation({ navigation: [{ target: 'agents/x.md' }, { text: marker }] })
  check(`no rescan ${JSON.stringify(marker)}: exactly one nested template call`, calls.template.map(c => c.name), ['#vault/agents/x'])
  check(`no rescan ${JSON.stringify(marker)}: nested call in navigation mode`, calls.template[0].dict, { _vault: 'navigation' })
  check(`no rescan ${JSON.stringify(marker)}: the text part is inert markdown (the reference a link, never a toggle)`, html.includes('<div class="vault-source">') && html.includes('title="#vault/agents/x"') && !html.includes(h._vault_carrier(marker)), true)
  check(`no rescan ${JSON.stringify(marker)}: one toggle over the target`, calls.toggle.map(c => c.label), ['⋮ ' + h._vault_refs('![[agents/x]]')])
  check(`no rescan ${JSON.stringify(marker)}: toggle label has no element or quote`, /[<>"']/.test(calls.toggle[0].label), false)
}

// the envelope: exact framing, one source block, canonical source
const storeA = { v: 2, path: 'agents/a.md', pinned_source: 'source A ' + lt2 + 'x' + gt2, head_preview: { kind: 'section', navigation: [{ text: 'A text' }, { target: 'agents/b.md' }], base: null, exact: null } }
const storeB = { v: 2, path: 'agents/b.md', pinned_source: 'pinned B', head_preview: { kind: 'section', navigation: [{ text: 'B text' }, { target: 'agents/c.md' }], base: null, exact: null } }
const sourceA = 'source A ' + lt2 + 'x' + gt2
const A = item('id_a', storeA, sourceA)
const B = item('id_b', storeB, 'source B')
const withText = (base, text) => variant(base, { text })
const envelope = it => {
  ctx._this = it
  ctx._that = it // the outer item too, so a _that-for-_this mutation is caught by the nested rows below
  return h._vault_envelope()
}
check('envelope: the source of A', envelope(A), sourceA)
for (const source of ['', 'a', 'a\n', 'a\n\n\n', '\n', 'x\n' + lt2 + 'y' + gt2 + '\n']) {
  check(`envelope: framing round-trips ${JSON.stringify(source)}`, envelope(item('id_e', { v: 2, path: 'agents/e.md', pinned_source: source, head_preview: { kind: 'section', navigation: [], base: null, exact: null } }, source)), source)
}
const sourceBlockA = fence + 'jinja_removed\n' + h._vault_escape(sourceA) + '\n' + fence + '\n'
const badEnvelopes = {
  'missing source block': A.text.replace(sourceBlockA, ''),
  'duplicate source block': A.text.replace('<!' + '-- template --' + '>', fence + 'jinja_removed\nz\n' + fence + '\n<!' + '-- template --' + '>'),
  'leftover v1 payload block': A.text.replace('<!' + '-- template --' + '>', fence + 'vault_removed\nYQ==\n' + fence + '\n<!' + '-- template --' + '>'),
  'unclosed block': A.text.replace(fence + '\n<!' + '-- template --' + '>', '<!' + '-- template --' + '>'),
  'suffix-variant source opener': A.text.replace(fence + 'jinja_removed', fence + 'jinja_removed:x'),
  'raw opener in source': A.text.replace(h._vault_escape(sourceA), sourceA),
  'carriage return in source': A.text.replace('source A', 'source\rA'),
  'control in source': A.text.replace('source A', 'sourceA'),
}
for (const [name, text] of Object.entries(badEnvelopes)) check(`envelope rejects ${name}`, throws(() => envelope(withText(A, text))), true)

// the envelope follows the app's fence grammar: additive variants and loose fences refused
const validA = A.text
const addBlock = (text, opener, body) => text + '\n' + opener + '\n' + body + '\n' + fence
const additive = {
  'colon-prefixed source sibling': addBlock(validA, fence + 'x:jinja_removed', 'z'),
  'dotted-suffix source sibling': addBlock(validA, fence + 'jinja_removed:a.b', 'z'),
  'raw source sibling': addBlock(validA, fence + 'jinja', 'z'),
  'hidden source sibling': addBlock(validA, fence + 'jinja_hidden', 'z'),
  'uppercase source sibling': addBlock(validA, fence + 'JINJA_REMOVED', 'z'),
  'v1 payload sibling': addBlock(validA, fence + 'vault_removed', 'YQ=='),
  'hidden payload sibling': addBlock(validA, fence + 'vault_hidden', 'z'),
  'indented source sibling': addBlock(validA, '  ' + fence + 'jinja_removed', 'z'),
  'unrelated block': addBlock(validA, fence + 'js', 'z'),
  'orphan fence': validA + '\n' + fence,
}
for (const [name, text] of Object.entries(additive)) check(`envelope refuses additive ${name}`, throws(() => envelope(withText(A, text))), true)
const withSource = body => withText(A, validA.replace(fence + 'jinja_removed\n' + h._vault_escape(sourceA) + '\n' + fence, fence + 'jinja_removed\n' + body + '\n' + fence))
check('envelope: canonical empty source is opener, one empty line, closer', envelope(withSource('')), '')
check('envelope refuses the missing-separator empty source', throws(() => envelope(withText(A, validA.replace(fence + 'jinja_removed\n' + h._vault_escape(sourceA) + '\n' + fence, fence + 'jinja_removed\n' + fence)))), true)
for (const line of [fence, fence + 'js', ' ' + fence, fence + '`', '\t' + fence + 'x'])
  check(`envelope refuses a fence-shaped source line ${JSON.stringify(line)}`, throws(() => envelope(withSource('a\n' + line + '\nb'))), true)
for (const marker of ['<!' + '-- template --' + '>', '<!' + '--/template--' + '>', '<!' + '-- TEMPLATE --' + '>', 'x <!' + '--inert--' + '> y', '<!' + '--/inert--' + '>'])
  check(`envelope refuses the reserved source marker ${JSON.stringify(marker)}`, throws(() => envelope(withSource('a\n' + marker + '\nb'))), true)
check('envelope accepts a comment that is not a reserved marker', envelope(withSource('<!' + '-- note --' + '>')), '<!' + '-- note --' + '>')
// the source's sole canonical closer replaced by a fence-shaped line (no later orphan fence to
// catch it): only the exact-closer guard refuses this, otherwise the source is silently truncated
check('envelope refuses a fence-shaped line replacing the source closer', throws(() => envelope(withText(A, validA.replace(h._vault_escape(sourceA) + '\n' + fence + '\n<!' + '-- template --' + '>', h._vault_escape(sourceA) + '\n' + fence + 'x\n<!' + '-- template --' + '>')))), true)

// the frontmatter block (presentation design section 2): the same framing vectors as the Python
// table, both envelopes accepted, the refusals
const yamlText = (label, frontmatter, body, deps = []) =>
  [label + ' ' + lt2 + 'vault_badge()' + gt2, ...(frontmatter === null ? [] : [fence + 'yaml_removed', h._vault_escape(frontmatter), fence]), fence + 'jinja_removed', h._vault_escape(body), fence, '<!' + '-- template --' + '>', lt2 + 'vault_render()' + gt2, '<!' + '-- /template --' + '>', ['#_template/vault', ...deps].join(' ')].join('\n')
const yamlStore = source => ({ v: 2, path: 'agents/y.md', pinned_source: source, head_preview: { kind: 'section', navigation: [], base: null, exact: null } })
const yamlItem = (frontmatter, body, source) => stub({ id: 'id_y', name: '#vault/agents/y', text: yamlText('#vault/agents/y', frontmatter, body), _global_store: { _vault: yamlStore(source) } })
const framing = [
  ['a: 1', 'body\n', '---\na: 1\n---\nbody\n'],
  ['', '', '---\n\n---\n'],
  ['a: 1\n', '', '---\na: 1\n\n---\n'],
  ['a: 1', '', '---\na: 1\n---\n'],
  ['a', '---\nb\n', '---\na\n---\n---\nb\n'],
  ['k: ' + lt2 + 'x' + gt2, 'b \\' + lt2 + 'y' + gt2 + '\n', '---\nk: ' + lt2 + 'x' + gt2 + '\n---\nb \\' + lt2 + 'y' + gt2 + '\n'],
  [null, '---\na: 1\n---', '---\na: 1\n---'],
  [null, '---\n---\nx\n', '---\n---\nx\n'],
  ['k: \\' + lt2 + 'x' + gt2, 'b \\\\' + lt2 + 'y' + gt2 + '\n', '---\nk: \\' + lt2 + 'x' + gt2 + '\n---\nb \\\\' + lt2 + 'y' + gt2 + '\n'],
  [null, '--- \na: 1\n---\n', '--- \na: 1\n---\n'],
]
for (const [frontmatter, body, source] of framing) {
  const parts = (ctx._this = ctx._that = yamlItem(frontmatter, body, source), h._vault_envelope_parts())
  check(`frontmatter framing ${JSON.stringify(source)} reconstructs`, [parts.frontmatter, parts.body, parts.source], [frontmatter, body, source])
  check(`frontmatter framing ${JSON.stringify(source)} badge matches`, h._vault_badge_visible(h._vault_state()), 'section')
}
const yamlValid = yamlText('#vault/agents/y', 'a: 1', 'body\n')
const yamlBad = {
  'multiple frontmatter blocks': yamlValid.replace(fence + 'jinja_removed', fence + 'yaml_removed\nz\n' + fence + '\n' + fence + 'jinja_removed'),
  'frontmatter block after the source block': yamlText('#vault/agents/y', null, 'body\n') + '\n' + fence + 'yaml_removed\na: 1\n' + fence,
  'frontmatter without its separator line': yamlValid.replace(fence + 'yaml_removed\na: 1\n' + fence, fence + 'yaml_removed\n' + fence),
  'raw opener in the frontmatter': yamlValid.replace('a: 1', 'a: ' + lt2 + 'x' + gt2),
  'yaml sibling variant': yamlValid.replace(fence + 'yaml_removed', fence + 'yaml'),
}
for (const [name, text] of Object.entries(yamlBad)) check(`frontmatter envelope refuses ${name}`, throws(() => envelope(stub({ id: 'id_y', name: '#vault/agents/y', text, _global_store: { _vault: yamlStore('x') } }))), true)

// the inert source view over the REAL Marked (presentation design section 4)
const hostile = [
  '# Heading with #tag and ' + lt2 + 'macro' + gt2,
  'Prose A &amp; B with #todo, @' + '{eval}@, $`x`$, https://example.com/a.png, `<tag>` and `&amp;` and `[[agents/x]]` in code.',
  '<script>alert(1)</script>',
  '<!' + '-- hidden --' + '>secret<!' + '-- /hidden --' + '>',
  '- [ok link](https://example.com?a=1&amp;b=2)',
  '- [Run](javascript:void(0))',
  '- [ ] a task',
  '![img](https://example.com/i.png)',
  '![[agents/worker]] and [[agents/instructions/sections/docs]] and [[AGENTS]] and ![[learnings]] and [[notes/x]] and [[Agents]].',
  '~~~js',
  'fenced <script> #tag',
  '~~~',
  '',
].join('\n')
ctx._this = ctx._that = item('id_x', { v: 2, path: 'agents/x.md', pinned_source: hostile, head_preview: { kind: 'section', navigation: [], base: null, exact: null } }, hostile)
const view = h._vault_source_view(hostile)
const textOnly = view.replace(/<[^>]+>/g, '')
check('source view: one container whose every line starts with a tag', view.startsWith('<div class="vault-source">') && view.split('\n').every(l => l.startsWith('<')), true)
check('source view: no blank line', /\n\s*\n/.test(view), false)
check('source view: no grammar character in a text node', /[<#$@`\[\]:]/.test(textOnly.replace(/&#\d+;/g, '')), false)
check('source view: no script element, executable destination, checkbox, or image', /<script|href="javascript|<input|<img/i.test(view), false)
check('source view: prose entities decode once', view.includes('Prose A &#38; B'), true)
check('source view: code keeps its entity spelling', view.includes('<code>&#38;amp&#59;</code>'), true)
check('source view: an allowed destination is decoded once and referenced', view.includes('href="https&#58;&#47;&#47;example&#46;com&#63;a&#61;1&#38;b&#61;2"'), true)
check('source view: a code span keeps a wiki reference literal', view.includes('<code>&#91;&#91;agents&#47;x&#93;&#93;</code>'), true)
check('source view: managed references are the current item\'s tag links', view.includes('onmousedown="_handleTagClick(\'id_x\',\'#vault/agents/worker\'') && view.includes('title="#vault/agents/instructions/sections/docs"'), true)
check('source view: an unmanaged reference is a hinted placeholder', view.includes('<span class="template_placeholder" title="not a managed file">&#91;&#91;notes&#47;x&#93;&#93;</span>') && view.includes('title="not a managed file">&#91;&#91;Agents&#93;&#93;</span>'), true)
check('source view: root references are tag links (7.5)', view.includes('title="#vault/AGENTS" onmousedown="_handleTagClick(\'id_x\',\'#vault/AGENTS\'') && view.includes('title="#vault/learnings"'), true)
check('source view: task items are static markers', view.includes('&#9744;') && !view.includes('checkbox'), true)
const codeBlock = /<pre><code class="hljs language-js">(.*?)<\/code><\/pre>/.exec(view)
check('source view: heading, list, and code render; fenced code with a language is highlighted (7.3)', /<h1>/.test(view) && /<li>/.test(view) && codeBlock !== null && codeBlock[1].replace(/<[^>]+>/g, '') == 'fenced &#60;script&#62; &#35;tag', true)
check('source view: fenced code without a language stays plain', h._vault_source_view('```\n<a> #b\n```\n').includes('<pre><code>&#60;a&#62; &#35;b</code></pre>'), true)
check('source view without Marked falls back to the carrier', (ctx.window.Marked = undefined, h._vault_source_view('a\n')), h._vault_carrier('a\n'))
ctx.window.Marked = Marked

// the line pass (presentation design 7.2): the app's layout rewrites mirrored, Marked's code
// regions untouched, control-character sentinels replaced, trailing blank lines not rendered
const spaced = ['p1', '', 'p2', '', '', 'p3', '- a', '- b', 'after list', '---', 'x', '==', '| a |', '| - |', 'after table', '> q1', '> > q2', '> q3', '~~~', 'code', '', '---', 'more', '~~~', '', ''].join('\n')
const spacedView = h._vault_source_view(spaced)
const spacers = html => (html.match(/&#160;<br>/g) || []).length
check('line pass: every line starts with a tag and none is blank', spacedView.split('\n').every(l => l.startsWith('<')) && !/\n\s*\n/.test(spacedView), true)
check('line pass: one spacer per blank line outside code; trailing blank lines and the final newline render nothing', spacers(spacedView), 3)
check('line pass: a spacer ends its paragraph like the app', spacedView.includes('<p>p1<br>&#160;<br></p>') && spacedView.includes('<p>p2<br>&#160;<br></p>\n<p>&#160;<br></p>'), true)
check('line pass: an admitted tilde fence keeps its blank and rule lines as code', spacedView.includes('<pre><code>code&#10;&#10;&#45;&#45;&#45;&#10;more</code></pre>') && (spacedView.match(/<hr>/g) || []).length == 1, true)
check('line pass: a rule line is a rule, a - or = line never underlines a heading', spacedView.includes('<hr>') && !/<h[1-6]/.test(spacedView) && spacedView.includes('<p>x<br>&#61;&#61; &#160;</p>'), true)
check('line pass: a list, a table, and a deeper blockquote are closed before ordinary text', spacedView.includes('<li>b</li>') && spacedView.includes('<p>after list</p>') && spacedView.includes('</table>') && spacedView.includes('<p>after table</p>') && spacedView.includes('<p>q3</p>'), true)
check('line pass: no sentinel survives', /&#[123];|[\u0001-\u0004]/.test(spacedView), false)
check('line pass: an indented block keeps its blank line as code', h._vault_source_view('    code\n\n    more\n').includes('<pre><code>code&#10;&#10;more</code></pre>'), true)
const listed = h._vault_source_view('- a\n\n  ~~~\n  x\n\n  y\n  ~~~\n\nafter\n')
check('line pass: a blank line after a list item closes the list like the app; the indented fence that follows keeps its lines as code', listed.includes('<li>a</li>\n</ul>') && listed.includes('<pre><code>  x&#10;&#10;  y</code></pre>') && spacers(listed) == 2 && listed.includes('<p>after</p>'), true)
check('line pass: a fence directly under a list item stays inside the item, its blank line kept', h._vault_source_view('- a\n  ~~~\n  x\n\n  y\n  ~~~\n- b\n'), '<div class="vault-source"><ul>\n<li>a<pre><code>x&#10;&#10;y</code></pre></li>\n<li>b</li>\n</ul></div>')
check('protection: two multiline code spans sharing a line both stay code spans (review 83)', h._vault_source_view('`a\nb` `c\n-d\ne`\n'), '<div class="vault-source"><p><code>a b</code> <code>c &#45;d e</code></p></div>')
check('protection: an earlier single-line code span does not misplace a later multiline one (review 83)', h._vault_source_view('`a`\nplain\n`a\n-b\nc`\n'), '<div class="vault-source"><p><code>a</code><br>plain<br><code>a &#45;b c</code></p></div>')
check('protection: a nested fence whose first line matches an earlier prose suffix keeps its full contents (review 83)', (v => v.includes('<pre><code>a&#10;&#10;b&#10;&#45;&#45;&#45;&#10;c</code></pre>') && !v.includes('<hr>') && (v.match(/<pre>/g) || []).length == 1)(h._vault_source_view('- explain ~~~\n- ordinary\n- ordinary2\n- ~~~\n  a\n\n  b\n  ---\n  c\n  ~~~\n')), true)
check('line pass: a code span spanning lines inside a list item stays one code span', h._vault_source_view('- a\n  `b\n  -c\n  d`\n- e\n').includes('<li>a<br><code>b &#45;c d</code></li>'), true)
check('line pass: a fence inside a blockquote keeps its blank line', h._vault_source_view('> q\n>\n> ~~~\n> x\n>\n> y\n> ~~~\n').includes('<pre><code>x&#10;&#10;y</code></pre>'), true)
check('line pass: a rule between prose lines is a block between two paragraphs', h._vault_source_view('a\n---\nb\n'), '<div class="vault-source"><p>a</p>\n<hr>\n<p>b</p></div>')
check('sentinels: a decoded control reference is the replacement character, never a spacer or a rule', (v => v.includes('<p>&#65533; a &#65533; b<br>&#160;<br></p>\n<p>end</p>') && spacers(v) == 1 && !v.includes('<hr>'))(h._vault_source_view('&#1; a &#2; b\n\nend\n')), true)
check('sentinels: a decoded control reference in a destination is the replacement character', h._vault_source_view('[x](https://e.com/?q=&#1;)\n').includes('href="https&#58;&#47;&#47;e&#46;com&#47;&#63;q&#61;&#65533;"'), true)
check('sentinels: numeric references to excluded controls are the replacement character, TAB and LF stay', h._vault_decode_entities('&#9;&#10;&#11;&#127;&#8203;&#x1;'), '\t\n\ufffd\ufffd\ufffd\ufffd')
check('line pass: a trailing blank line is not rendered', spacers(h._vault_source_view('a\n\n\n')), 0)
check('line pass: a whitespace-only trailing line and the blank before it are not rendered', spacers(h._vault_source_view('a\n\n   \n')), 0)
check('line pass: empty input renders an empty container, no spacer', h._vault_source_view(''), '<div class="vault-source"></div>')
check('line pass: an unclosed fence keeps its trailing blank lines as code', h._vault_source_view('~~~\na\n\n\n').includes('<pre><code>a&#10;&#10;</code></pre>'), true)
// protected inline and raw-html contexts (review 80): no closure, rule, or spacer inside them
check('line pass: a code span spanning lines stays one code span (Marked reads its newlines as spaces)', h._vault_source_view('`a\n-b\nc`\n'), '<div class="vault-source"><p><code>a &#45;b c</code></p></div>')
check('line pass: a link text spanning lines stays one link', (v => v.includes('<a href="https&#58;&#47;&#47;e&#46;test"') && (v.match(/<a /g) || []).length == 1 && !v.includes('&#91;a'))(h._vault_source_view('[a\n-b\nc](https://e.test)\n')), true)
check('line pass: a pipe line inside a code span is not a table boundary', h._vault_source_view('`a\n| b\nc`\n'), '<div class="vault-source"><p><code>a &#124; b c</code></p></div>')
check('line pass: a rule line inside a raw html comment stays its text, no sentinel', (v => v == '<div class="vault-source"><p class="vault-comment" style="white-space:pre-wrap;color:#6a737d">' + h._vault_grammar_refs('<!-- x\n---\n-->') + '</p></div>' && !/&#[123];|<hr>/.test(v))(h._vault_source_view('<!-- x\n---\n-->\n')), true)
check('line pass: a single-line inline tag protects nothing beyond itself: the following rule line is a rule', h._vault_source_view('a <b>x</b>\n---\nb\n'), '<div class="vault-source"><p>a <code>&#60;b&#62;</code>x<code>&#60;&#47;b&#62;</code></p>\n<hr>\n<p>b</p></div>')
check('line pass: a single-line inline tag does not let a == line underline a heading', (v => !/<h[1-6]/.test(v) && v.includes('&#61;&#61; &#160;'))(h._vault_source_view('Use <root>\n==\nnext\n')), true)
check('line pass: a rule line inside a raw html block stays its text (code-styled, 8.2)', h._vault_source_view('<div>\n---\n</div>\n'), '<div class="vault-source"><pre><code>&#60;div&#62;&#10;&#45;&#45;&#45;&#10;&#60;&#47;div&#62;</code></pre></div>')
// presentation design 8: jinja constructs, literal html wrappers, the frontmatter gap, body trimming
check('jinja: an inline construct is inline code with its characters as references', h._vault_source_view('a {{ x | y }} b {%- if z %}c\n'), '<div class="vault-source"><p>a <code class="vault-jinja">&#123;&#123; x &#124; y &#125;&#125;</code> b <code class="vault-jinja">&#123;&#37;&#45; if z &#37;&#125;</code>c</p></div>')
check('jinja: single-line statements standing alone on their lines are inline code rather than a separate code block (in the paragraph with their adjoining lines)', h._vault_source_view('{% if read_only -%}\ntext\n{%- endif %}\n'), '<div class="vault-source"><p><code class="vault-jinja">&#123;&#37; if read&#95;only &#45;&#37;&#125;</code><br>text<br><code class="vault-jinja">&#123;&#37;&#45; endif &#37;&#125;</code></p></div>')
check('jinja: a multi-line construct standing on its own lines is a code block between the paragraph runs', h._vault_source_view('before\n{{ assert_(\n  x,\n  y\n) }}\nafter\n'), '<div class="vault-source"><p>before</p>\n<pre><code class="vault-jinja">&#123;&#123; assert&#95;&#40;&#10;  x&#44;&#10;  y&#10;&#41; &#125;&#125;</code></pre>\n<p>after</p></div>')
check('jinja: a multi-line construct spanning a blank line is two paragraphs of text (out of scope: the paragraph is the unit)', (v => !v.includes('vault-jinja') && (v.match(/<p>/g) || []).length == 2)(h._vault_source_view('{{ assert_(\n  x,\n\n  y\n) }}\n')), true)
check('jinja: a multi-line construct with prose on its first line is inline code inside the paragraph, not a block', (v => v.includes('<p>see <code class="vault-jinja">') && !v.includes('<pre>'))(h._vault_source_view('see {{ a\n| b }} here\n')), true)
check('jinja: two constructs on consecutive lines stay two inline constructs (a construct ends at its first closer)', h._vault_source_view('{{ x }} tail\n{{ y }}\n'), '<div class="vault-source"><p><code class="vault-jinja">&#123;&#123; x &#125;&#125;</code> tail<br><code class="vault-jinja">&#123;&#123; y &#125;&#125;</code></p></div>')
check('jinja: a link between two constructs survives', (v => (v.match(/<a /g) || []).length == 1 && (v.match(/vault-jinja/g) || []).length == 2 && !v.includes('<pre>'))(h._vault_source_view('{{ x }} [go](https://example.test)\n{{ y }}\n')), true)
for (const [open, close] of [['{%', '%}'], ['{#', '#}']])
  check(`jinja: separately closed ${open} constructs with prose between stay separate`, (v => (v.match(/vault-jinja/g) || []).length == 2 && v.includes(' tail<br>') && !v.includes('<pre>'))(h._vault_source_view(open + ' x ' + close + ' tail\n' + open + ' y ' + close + '\n')), true)
check('jinja: a construct inside a multiline code span stays part of the code span (no block interrupts it)', h._vault_source_view('`a\n{{ x\n}}\nb`\n'), '<div class="vault-source"><p><code>a &#123;&#123; x &#125;&#125; b</code></p></div>')
check('jinja: a construct inside a multiline link text stays inside the intact link (inline code there, never a block)', (v => (v.match(/<a /g) || []).length == 1 && !v.includes('<pre>') && /<a [^>]*>a<br><code class="vault-jinja">&#123;&#123; x&#10;&#125;&#125;<\/code><br>b<\/a>/.test(v))(h._vault_source_view('[a\n{{ x\n}}\nb](https://e.test)\n')), true)
check('jinja: an opener that never closes is text and a later construct of another type is still recognized', (v => v.includes('&#123;&#123; a') && v.includes('<code class="vault-jinja">&#123;&#37; ok &#37;&#125;</code>') && (v.match(/vault-jinja/g) || []).length == 1)(h._vault_source_view('{{ a\nplain\n{% ok %}\n')), true)
check('jinja: an out-of-window construct is text and a construct after it is still recognized', (v => v.includes('<code class="vault-jinja">&#123;&#123; ok &#125;&#125;</code>') && (v.match(/vault-jinja/g) || []).length == 1 && v.includes('x'.repeat(50)))(h._vault_source_view('{{ ' + 'x'.repeat(5000) + ' }} then {{ ok }}\n')), true)
check('jinja: a construct exactly at the window is recognized, one unit longer is text', h._vault_source_view('{{' + 'x'.repeat(_VAULT_WINDOW_UNITS - 4) + '}}\n').includes('vault-jinja') && !h._vault_source_view('{{' + 'x'.repeat(_VAULT_WINDOW_UNITS - 3) + '}}\n').includes('vault-jinja'), true)
check('jinja: a valid over-long comment falls back to text without loss (exact)', h._vault_source_view('{#' + '{'.repeat(9000) + '#}\n'), '<div class="vault-source"><p>' + h._vault_grammar_refs('{#' + '{'.repeat(9000) + '#}') + '</p></div>')
// review 85: the finder's table is owned by the inline run (never crosses the protection lex, the
// render parse, another paragraph, or a repeated render) and types are searched independently
const prose = 'ordinary prose '.repeat(8)
check('jinja: a construct followed by long prose keeps its code on the real protection-then-render path', h._vault_source_view('{{ x }} ' + prose + '\n').replace(/ +<\/p>/g, '</p>'), '<div class="vault-source"><p><code class="vault-jinja">&#123;&#123; x &#125;&#125;</code> ' + prose.trimEnd() + '</p></div>')
check('jinja: rendering the same view again gives the same output', h._vault_source_view('{{ x }} ' + prose + '\n') === h._vault_source_view('{{ x }} ' + prose + '\n') && h._vault_source_view('{{ x }} ' + prose + '\n').includes('vault-jinja'), true)
check('jinja: a second paragraph with the same 64-unit tail and no construct is text; a third with a construct elsewhere is recognized', (v => (v.match(/vault-jinja/g) || []).length == 2 && (p => p !== undefined && !p.includes('vault-jinja') && p.startsWith('<p>plain ordinary prose'))(v.split('\n').find(l => l.startsWith('<p>plain'))))(h._vault_source_view('{{ a }} ' + prose + '\n\nplain ' + prose + '\n\nlater {% b %} ' + prose + '\n')), true)
check('jinja: a statement enclosing an expression is one statement construct', h._vault_source_view('{% set text = "{{ value }}" %}\n'), '<div class="vault-source"><p><code class="vault-jinja">' + h._vault_grammar_refs('{% set text = "{{ value }}" %}') + '</code></p></div>')
check('jinja: a comment enclosing an expression or a statement is one comment construct', (v => (v.match(/vault-jinja/g) || []).length == 2 && v.includes(h._vault_grammar_refs('{# prose {{ x }} end #}')) && v.includes(h._vault_grammar_refs('{# {% s %} #}')))(h._vault_source_view('{# prose {{ x }} end #} and {# {% s %} #}\n')), true)
check('jinja: overlapping delimiters are not constructs, a later closer completes them', (v => !v.includes('vault-jinja'))(h._vault_source_view('{%} and {#}\n')) && h._vault_source_view('{%}%}\n').includes('<code class="vault-jinja">&#123;&#37;&#125;&#37;&#125;</code>'), true)
check('jinja: a construct inside a link text stays inline code inside the intact link when long prose follows (exact)', h._vault_source_view('[see {{ v }}](https://e.test) ' + prose + '\n').replace(/ +<\/p>/g, '</p>'), '<div class="vault-source"><p><a href="https&#58;&#47;&#47;e&#46;test" target="_blank" rel="opener">see <code class="vault-jinja">&#123;&#123; v &#125;&#125;</code></a> ' + prose.trimEnd() + '</p></div>')
check('jinja: dense unfinished openers are text without loss', (v => !v.includes('vault-jinja') && (v.match(/&#123;/g) || []).length == 2000)(h._vault_source_view('{{'.repeat(1000) + '\n')), true)
check('jinja: a quoted closer splits the construct (the delimiter policy is shallow, not a jinja lexer)', (v => v.includes('<code class="vault-jinja">&#123;&#123; &#34;&#125;&#125;</code>'))(h._vault_source_view('{{ "}}" }}\n')), true)
check('jinja: a jinja comment is inline code too', h._vault_source_view('{# note #}\n'), '<div class="vault-source"><p><code class="vault-jinja">&#123;&#35; note &#35;&#125;</code></p></div>')
check('jinja: inside a code span or a fence it stays ordinary code', (v => v.includes('<code>&#123;&#123; x &#125;&#125;</code>') && !v.includes('vault-jinja'))(h._vault_source_view('`{{ x }}`\n\n~~~\n{% y %}\n~~~\n')) && !h._vault_source_view('~~~\n{% y %}\n~~~\n').includes('vault-jinja'), true)
check('html: an inline comment after prose is a gray span of references inheriting the font', h._vault_source_view('text <!-- note -->\n'), '<div class="vault-source"><p>text <span class="vault-comment" style="color:#6a737d">&#60;&#33;&#45;&#45; note &#45;&#45;&#62;</span></p></div>')
check('html: a literal tag placeholder is inline code', h._vault_source_view('use <name> here\n'), '<div class="vault-source"><p>use <code>&#60;name&#62;</code> here</p></div>')
check('html: a line mixing a comment with other markup is code-styled, still text', (v => v.includes('<pre><code>') && !v.includes('vault-comment') && v.includes('secret'))(h._vault_source_view('<!-- hidden -->secret<!-- /hidden -->\n')), true)
check('line pass: leading blank lines are not rendered', h._vault_source_view('\n\n  \na\n'), '<div class="vault-source"><p>a</p></div>')

check('frontmatter view: a reference with the .md suffix links like the body', h._vault_frontmatter_view('base: [[agents/worker.md]]\nroot: [[AGENTS.md]]').includes('title="#vault/agents/worker"') && h._vault_frontmatter_view('root: [[AGENTS.md]]').includes('title="#vault/AGENTS"'), true)

// frontmatter links (7.4): managed references inside the highlighted yaml are the item's tag links
const yamlLinks = h._vault_frontmatter_view('base: "[[agents/worker]]"\nroot: [[AGENTS]]\nother: [[Agents]] [[notes/x]]')
check('frontmatter view: a quoted managed reference is a tag link inside the string', yamlLinks.includes('&#34;<mark class="link" title="#vault/agents/worker" onmousedown="_handleTagClick(\'id_x\',\'#vault/agents/worker\'') && yamlLinks.includes('>&#91;&#91;agents&#47;worker&#93;&#93;</mark>&#34;'), true)
check('frontmatter view: a root reference is a tag link, an unmanaged one stays references', yamlLinks.includes('title="#vault/AGENTS"') && yamlLinks.includes('&#91;&#91;Agents&#93;&#93; &#91;&#91;notes&#47;x&#93;&#93;'), true)
check('frontmatter view: a mask the highlighter did not keep falls back to the carrier', (() => { const keep = ctx.window.hljs; ctx.window.hljs = { highlight: () => ({ value: 'dropped' }) }; const v = h._vault_frontmatter_view('base: [[agents/worker]]'); ctx.window.hljs = keep; return v })(), h._vault_carrier('base: [[agents/worker]]'))
// the root files in the store contract (7.5): the store's own path, a root target, a root item
check('store contract accepts a root store and a root target', (s => s.path == 'AGENTS.md' && s.head_preview.navigation[0].target == 'learnings.md')(h._vault_check_store({ v: 2, path: 'AGENTS.md', pinned_source: 'Rules.\n', head_preview: { kind: 'section', navigation: [{ target: 'learnings.md' }, { text: 'x' }], base: null, exact: null } })), true)
check('store contract still refuses a foreign root path', throws(() => h._vault_check_store({ v: 2, path: 'CLAUDE.md', pinned_source: 'x', head_preview: null })), true)

// the frontmatter view (presentation design section 3): the highlighter's spans kept, its text
// re-encoded, the comment class renamed, entities interpreted once, newlines as references
const yamlView = h._vault_frontmatter_view('# c &amp; $`x`$ #todo https://e.com\nkey: v & w')
check('frontmatter view: structure kept, comment class renamed', yamlView.includes('<span class="vault-comment" style="color:#6a737d">') && !yamlView.includes('hljs-comment') && yamlView.includes('<span class="hljs-attr">'), true)
check('frontmatter view: text re-encoded through the grammar carrier, entities interpreted once', yamlView.includes('&#35; c &#38;amp&#59; &#36;&#96;x&#96;&#36; &#35;todo https&#58;&#47;&#47;e&#46;com') && yamlView.includes('key&#58;</span> v &#38; w'), true)
check('frontmatter view: one physical line inside pre>code', yamlView.split('\n').length, 1)
check('frontmatter view without a highlighter is the carrier', (ctx.window.hljs = undefined, h._vault_frontmatter_view('a: 1')), h._vault_carrier('a: 1'))
ctx.window.hljs = hljsStub
check('entity decoder: only complete valid references decode (the fallback path); inherited names stay literal', h._vault_decode_entities('&amp; &#35; &#x41; &lt; &unknown; &copycat &amp=2 x=1&notebook=2 &#0; &#xD800; &constructor; &toString;'), '& # A < &unknown; &copycat &amp=2 x=1&notebook=2 \ufffd \ufffd &constructor; &toString;')

// the state: the fail-closed notes, the identity rule, and the store read through _this only
const state = it => {
  ctx._this = it
  ctx._that = it
  return h._vault_state()
}
check('state: valid A', (s => [s.note, s.source, s.store.path])(state(A)), [null, sourceA, 'agents/a.md'])
check('state: a root item is valid under its label (7.5)', (s => [s.note, s.store.path])(state(item('id_root', { v: 2, path: 'AGENTS.md', pinned_source: 'Rules.\n', head_preview: { kind: 'section', navigation: [{ text: 'Rules.\n' }], base: null, exact: null } }, 'Rules.\n'))), [null, 'AGENTS.md'])
check('state: a broken envelope is a source note', state(withText(A, badEnvelopes['raw opener in source'])).note, 'vault source invalid')
check('state: no store object is missing', state(item('id_m', undefined, 'm', {}, '#vault/agents/m')).note, 'vault store missing')
check('state: a store without the key is missing', state(variant(A, { _global_store: { other: 1 } })).note, 'vault store missing')
check('state: an array store is missing', state(variant(A, { _global_store: [1] })).note, 'vault store missing')
check('state: a null key is invalid, not missing', state(variant(A, { _global_store: { _vault: null } })).note, 'vault store invalid')
check('state: a v1 payload object is invalid', state(variant(A, { _global_store: { _vault: rejects['v1 schema'] } })).note, 'vault store invalid')
check('state: the name must equal the label of the store path', state(variant(A, { name: '#vault/agents/b' })).note, 'vault store invalid')
check('state: a duplicate label (an id-name) fails closed', state(variant(A, { name: 'id:id_a' })).note, 'vault store invalid')
check('state: foreign keys beside _vault are ignored', state(item('id_k', storeA, sourceA, { _todoer: { x: 1 } })).note, null)
check('state: the saving accessor is never read', throws(() => state(A)), false)

// the live badge (the owner's precise phrasing): matches, differs, absent, and the notes
check('badge: matches', h._vault_badge_text(state(A)), 'section · agents/a.md')
check('badge: differs', h._vault_badge_text(state(B)), 'section · agents/b.md · differs from the stored sync snapshot')
check('badge: absent carries no kind', h._vault_badge_text(state(item('id_n', absent, 'anything'))), 'agents/x.md · not in the stored sync snapshot')
check('badge: config matches', h._vault_badge_text(state(item('id_c', config, 'source C'))), 'config · agents/c.md')
check('badge: an edited source differs the moment it is saved', h._vault_badge_text(state(item('id_c2', config, 'source C edited'))), 'config · agents/c.md · differs from the stored sync snapshot')
reset()
ctx._this = A
ctx._that = A
check('badge markup uses the inline carrier and drops the path in the visible view', h.vault_badge(), '<span class="template_placeholder" title="managed by the vault sync">' + h._vault_inline('section') + '</span>')
check('visible badge: differs', h._vault_badge_visible(state(B)), 'section · differs from the stored sync snapshot')
check('visible badge: absent', h._vault_badge_visible(state(item('id_n', absent, 'anything'))), 'not in the stored sync snapshot')
check('badge uses no pre inside the label paragraph', h.vault_badge().includes('<pre'), false)

// the frozen control order (design v2 section 3, the projection behind one toggle since the
// presentation design), from the toggle stub's call sequence: no source control
const storeF = { v: 2, path: 'agents/f.md', pinned_source: 'source F', head_preview: { kind: 'config', base: 'agents/worker.md', navigation: [{ text: 'intro' }, { target: 'agents/s.md' }], exact: { profile: 'bridge', instructions: 'I', run_instructions: 'R', user_prompt: 'U' } } }
const full = item('id_f', storeF, 'source F')
reset()
ctx._this = full
ctx._that = full
const fullRender = h.vault_render()
check('config control order', calls.toggle.map(c => c.label), [
  '⋮ instructions (bridge profile)',
  '⋮ run_instructions (bridge profile)',
  '⋮ user_prompt (bridge profile)',
  '⋮ ' + h._vault_refs('![[agents/worker]]'),
  '⋮ ' + h._vault_refs('![[agents/s]]'),
  '⋮ navigation (bridge/default context)',
  '⋮ projection (the stored sync snapshot)',
])
check('config nested calls: base then navigation target', calls.template.map(c => c.name), ['#vault/agents/worker', '#vault/agents/s'])
check('projection: the config fields render as inert markdown (7.1 decision 2)', fullRender.split('instructions (bridge profile)]')[1].split('[/toggle]')[0].includes('<div class="vault-source">'), true)
check('projection: a navigation text part renders as inert markdown with links', h._vault_navigation({ navigation: [{ text: 'see [[agents/worker]]\n\nand more' }] }).includes('<div class="vault-source"><p>see <mark class="link" title="#vault/agents/worker"'), true)
check('the editable source is rendered as the source view, never a carrier or a control', fullRender.includes('<div class="vault-source">') && !fullRender.includes(h._vault_carrier('source F')) && !calls.toggle.some(c => c.label == '⋮ source'), true)
check('the source view precedes the projection container', fullRender.indexOf('<div class="vault-source">') < fullRender.indexOf('<div class="vault">'), true)
check('one blank line above the projection toggle when the source view precedes it (8.3)', fullRender.includes('</div>\n<p>&#160;<br></p>\n<div class="vault">'), true)
// the gap composition (8.3): frontmatter present or absent × body blank or non-blank
for (const [fm, body, gaps, shape] of [['a: 1', 'body\n', 2, 'yaml, gap, source, gap, projection'], ['a: 1', '  \n\n', 1, 'yaml, gap, projection'], [null, 'body\n', 1, 'source, gap, projection'], [null, '\n', 0, 'projection']]) {
  reset()
  const source = fm === null ? body : '---\n' + fm + '\n---\n' + body
  ctx._this = ctx._that = stub({ id: 'id_gap', name: '#vault/agents/y', text: yamlText('#vault/agents/y', fm, body), _global_store: { _vault: yamlStore(source) } })
  const rendered = h.vault_render()
  const order = rendered.split('\n').filter(l => l.startsWith('<pre class="vault-frontmatter"') || l.startsWith('<div class="vault-source"') || l.startsWith('<div class="vault">') || l == '<p>&#160;<br></p>').map(l => (l.startsWith('<pre') ? 'yaml' : l.startsWith('<div class="vault-source"') ? 'source' : l == '<p>&#160;<br></p>' ? 'gap' : 'projection'))
  check(`gap composition: ${shape}`, [order.filter(o => o == 'gap').length, order.join(', ')], [gaps, shape])
}
reset()
ctx._this = item('id_g', { v: 2, path: 'agents/f.md', pinned_source: 'source G', head_preview: { kind: 'config', base: null, navigation: [], exact: { profile: 'bare', instructions: null, run_instructions: null, user_prompt: 'U' } } }, 'source G')
ctx._that = ctx._this
h.vault_render()
check('config with null fields omits their controls, and no target parts omit the navigation toggle', calls.toggle.map(c => c.label), ['⋮ user_prompt (bare profile)', '⋮ projection (the stored sync snapshot)'])
reset()
ctx._this = A
ctx._that = A
h.vault_render()
check('section control order', calls.toggle.map(c => c.label), ['⋮ ' + h._vault_refs('![[agents/b]]'), '⋮ navigation (bridge/default context)', '⋮ projection (the stored sync snapshot)'])
reset()
const emptyItem = item('id_e', { v: 2, path: 'agents/e.md', pinned_source: null, head_preview: null }, '')
ctx._this = emptyItem
ctx._that = emptyItem
const emptyRender = h.vault_render()
check('null preview: the placeholder behind the projection toggle, an empty source shows no view', [calls.toggle.length, emptyRender], [1, '<div class="vault">[toggle ⋮ projection (the stored sync snapshot)]\n[placeholder no pinned preview (not in the stored sync snapshot)]\n[/toggle]</div>'])

// current-item identity: A renders nested B; envelope and store from _this (B), the toggle belongs to _that (A)
reset()
ctx._that = A
ctx._this = B
ctx.window._template_dict = [{ _vault: 'navigation' }]
const nested = h.vault_render()
check('nested B under A: B text rendered as inert markdown', nested.includes('<div class="vault-source"><p>B text</p></div>'), true)
check('nested B under A: A text absent', nested.includes('A text'), false)
check('nested B under A: no source in navigation mode', nested.includes('source B'), false)
check('nested B under A: B target toggled', calls.template.map(c => c.name), ['#vault/agents/c'])
check('nested B under A: the toggle belongs to A', calls.toggle.map(c => c.that), ['id_a'])
check('nested B under A: badge describes B and compares B\'s source', h.vault_badge().includes(h._vault_inline('section · differs from the stored sync snapshot')), true)
reset()
ctx._that = A
ctx._this = A
check('nested mode with a null preview is a placeholder', (ctx.window._template_dict = [{ _vault: 'navigation' }], (ctx._this = emptyItem), h.vault_render()), '[placeholder no pinned preview]')
reset()
ctx._that = A
ctx._this = A
const outer = h.vault_render()
check('outer A: A text rendered as inert markdown in the projection, the source rendered as the view, never carried', outer.includes('<p>A text</p>') && !outer.includes(h._vault_carrier('A text')) && !outer.includes(h._vault_carrier(sourceA)) && outer.includes('<div class="vault-source">'), true)
check('outer A: the source view keeps a raw opener inert (Marked reads the inner <x> as a literal tag, code-styled since 8.2)', outer.includes('&#60;<code>&#60;x&#62;</code>&#62;'), true)
reset()
ctx._this = A
ctx._that = A
ctx.window._item_eval_context = ['expanded']
check('expanded A (a section) throws instead of a fixed string (7.6)', throws(() => h.vault_render()), true)
check('expanded A makes no nested call', calls.template.length + calls.toggle.length, 0)
check('expanded badge is plain text', h.vault_badge(), 'vault badge: section · agents/a.md')
check('expanded badge carries no markup', /<[a-z]/.test(h.vault_badge()), false)
reset()
for (const [label, it, note] of [
  ['source', withText(A, badEnvelopes['raw opener in source']), 'vault source invalid'],
  ['missing store', item('id_m', undefined, 'm', {}, '#vault/agents/m'), 'vault store missing'],
  ['invalid store', variant(A, { name: '#vault/agents/zzz' }), 'vault store invalid'],
]) {
  reset()
  ctx._this = it
  ctx._that = it
  check(`${label}: badge fails closed`, h.vault_badge().includes(h._vault_inline(note)), true)
  check(`${label}: render fails closed`, h.vault_render(), '[placeholder ' + note + ']')
  ctx.window._item_eval_context = ['expanded']
  check(`${label}: expanded render throws its note (7.6)`, (() => { try { h.vault_render(); return null } catch (e) { return e.message } })(), 'vault: ' + note.replace(/^vault /, ''))
  check(`${label}: expanded badge fails closed`, h.vault_badge(), 'vault badge: ' + note)
}

// the synthetic fixtures (design section 8, v2 shape): the exact manifest, each item text with
// its sidecar store through the renderer, the dependency-tag line derived from the store, the
// performance root's size
const fixtures = path.join(__dirname, 'fixtures', 'vault_sync')
const manifest = ['e2e_absent.md', 'e2e_config.md', 'e2e_large.md', 'e2e_nested.md', 'e2e_section.md', 'e2e_worker.md']
check('fixture manifest is exact', fs.existsSync(fixtures) ? fs.readdirSync(fixtures).filter(f => f.endsWith('.md')).sort() : [], manifest)
check('every fixture has its sidecar store', fs.existsSync(fixtures) ? manifest.every(f => fs.existsSync(path.join(fixtures, f.replace(/\.md$/, '.json')))) : false, true)
for (const name of manifest) {
  const file = path.join(fixtures, name)
  if (!fs.existsSync(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  const store = JSON.parse(fs.readFileSync(file.replace(/\.md$/, '.json'), 'utf8'))
  const it = stub({ id: 'fx_' + name, name: text.split(/\s/)[0], text, _global_store: { _vault: store } })
  const s = state(it)
  check(`fixture ${name} state is valid`, s.note, null)
  if (s.note) continue
  check(`fixture ${name} store names the fixture path`, s.store.path.endsWith('/' + name), true)
  check(`fixture ${name} text carries no v1 payload block`, text.includes('vault_removed'), false)
  const hp = s.store.head_preview
  const deps = []
  for (const p of [hp && hp.base, ...(hp ? hp.navigation.filter(x => 'target' in x).map(x => x.target) : [])]) if (p && !deps.includes(p)) deps.push(p)
  check(`fixture ${name} dependency tags derive from the store`, text.trimEnd().split('\n').pop(), ['#_template/vault', ...deps.map(p => '#_vault/' + p.replace(/\.md$/, ''))].join(' '))
  reset()
  ctx._this = it
  ctx._that = it
  const rendered = h.vault_render()
  check(`fixture ${name} never carries its source`, rendered.includes(h._vault_carrier(s.source)), false)
  check(`fixture ${name} renders the source view unless the source is blank`, rendered.includes('<div class="vault-source">'), s.source.trim().length > 0)
  check(`fixture ${name} badge`, h._vault_badge_text(s), hp ? hp.kind + ' · ' + s.store.path + (s.source === s.store.pinned_source ? '' : ' · differs from the stored sync snapshot') : s.store.path + ' · not in the stored sync snapshot')
  if (name == 'e2e_section.md') check('fixture e2e_section.md differs from its pinned source', s.source === s.store.pinned_source, false)
  if (name == 'e2e_section.md') check('fixture e2e_section.md source keeps its raw opener', s.source.includes('\n' + lt2 + 'not a macro' + gt2), true)
  if (name == 'e2e_config.md') check('fixture e2e_config.md exact field keeps its raw opener', hp.exact.instructions.includes('\n' + lt2 + 'x' + gt2), true)
  if (name == 'e2e_large.md') {
    check('fixture e2e_large.md instructions are 19,310 characters', hp.exact.instructions.length, 19310)
    check('fixture e2e_large.md instructions are 107,087 reference characters', h._vault_refs(hp.exact.instructions).length, 107087)
  }
}

if (failures) {
  console.log(`${failures} failure(s)`)
  process.exit(1)
}
console.log('all ok')
