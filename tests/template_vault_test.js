#!/usr/bin/env node
// plain-node table for template/vault.js (the #template/vault renderer), evaluated from the
// INSTALLED source under a stub template environment: the source codec vectors, the strict
// payload decoder, the envelope parser (exact framing, canonical source, one-line payload,
// name/path agreement, empty source), the carriers, the container, the navigation consumer
// (no rescan of text parts), the frozen control order, the current-item identity (_this,
// never _that), the expanded-context strings, the hygiene scan of the installed source, and
// the six synthetic fixtures (manifest, envelope, dependency tags, the performance root's
// size). run: node external/mind.items/tests/template_vault_test.js
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

// the stub template environment: what the app and #template provide to item javascript
const calls = { template: [], toggle: [] }
const ctx = {
  TextDecoder, atob, btoa, Uint8Array, String, Set, RegExp, JSON, Object, Array, Math, Error,
  window: { _template_dict: [], _item_eval_context: [] },
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
const h = vm.runInNewContext(
  src +
    ';({ _vault_unescape, _vault_escape, _vault_decode, _vault_envelope, _vault_refs, _vault_carrier, _vault_inline, _vault_container, _vault_expanded, _vault_navigation, vault_render, vault_badge })',
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

// the producer's canonical JSON (json.dumps sort_keys, ensure_ascii, compact), modeled here
const canonical = value => {
  if (value === null || typeof value == 'number' || typeof value == 'boolean') return JSON.stringify(value)
  if (typeof value == 'string') return JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return '{' + Object.keys(value).sort().map(k => canonical(k) + ':' + canonical(value[k])).join(',') + '}'
}
const encode = obj => Buffer.from(canonical(obj), 'utf8').toString('base64')
// the item skeleton (design section 3), mirrored from the producer
const itemText = (label, source, payloadBody, deps) =>
  [label + ' ' + lt2 + 'vault_badge()' + gt2, fence + 'jinja_removed', h._vault_escape(source), fence, fence + 'vault_removed', payloadBody, fence, '<!' + '-- template --' + '>', lt2 + 'vault_render()' + gt2, '<!' + '-- /template --' + '>', ['#_template/vault', ...deps].join(' ')].join('\n')
const labelOf = payload => '#vault/' + payload.path.replace(/\.md$/, '')
const item = (id, payload, source) => ({ id, name: labelOf(payload), text: itemText(labelOf(payload), source, encode(payload), []) })

const section = { v: 1, path: 'agents/x.md', source_head_relation: 'matches', head_preview: { kind: 'section', navigation: [{ text: 'ünï ' + lt2 + 'x @{y}@ <b>' }, { target: 'agents/y.md' }, { text: '![[AGENTS]]\n![[agents/z|alias]] tail' }, { target: 'agents/y.md' }], base: null, exact: null } }
const config = { v: 1, path: 'agents/c.md', source_head_relation: 'differs', head_preview: { kind: 'config', navigation: [], base: 'agents/worker.md', exact: { profile: 'bridge', instructions: 'I ---\n# x', run_instructions: 'R', user_prompt: null } } }
const absent = { v: 1, path: 'agents/x.md', source_head_relation: 'absent', head_preview: null }
check('canonical json model matches python', canonical({ b: 'ü', a: [1, null, true] }), '{"a":[1,null,true],"b":"\\u00fc"}')
check('decode section', canonical(h._vault_decode(encode(section))), canonical(section))
check('decode config', canonical(h._vault_decode(encode(config))), canonical(config))
check('decode absent', canonical(h._vault_decode(encode(absent))), canonical(absent))
check('rejects surrounding whitespace (one unwrapped line, no trimming)', throws(() => h._vault_decode(' ' + encode(config) + '\n')), true)
check('decode non-ascii, line separator, supplementary, tab', h._vault_decode(encode({ ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'é 😀\tx\n' }] } })).head_preview.navigation[0].text, 'é 😀\tx\n')
check('accepts non-ascii-escaped json (canonical JSON is a producer invariant)', throws(() => h._vault_decode(Buffer.from(JSON.stringify(section), 'utf8').toString('base64'))), false)
const rejects = {
  'wrong version': { ...section, v: 2 },
  'extra top key': { ...section, extra: 1 },
  'missing relation': { v: 1, path: 'agents/x.md', head_preview: null },
  'bad path': { ...section, path: 'agents/Bad.md' },
  'bad relation': { ...section, source_head_relation: 'committed' },
  'null preview for present path': { ...section, head_preview: null },
  'preview for absent path': { ...absent, head_preview: section.head_preview },
  'unknown kind': { ...section, head_preview: { ...section.head_preview, kind: 'other' } },
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
  'control in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'a\u0000b' }] } },
  'c1 in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'a\u0080b' }] } },
  'zwsp in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'a\u200bb' }] } },
  'lone surrogate in navigation': { ...section, head_preview: { ...section.head_preview, navigation: [{ text: 'a\ud800b' }] } },
  'exact object on section': { ...section, head_preview: { ...section.head_preview, exact: config.head_preview.exact } },
  'missing exact key on section': { ...section, head_preview: { kind: 'section', navigation: [], base: null } },
  'null exact on config': { ...config, head_preview: { ...config.head_preview, exact: null } },
  'bad profile': { ...config, head_preview: { ...config.head_preview, exact: { ...config.head_preview.exact, profile: 'run' } } },
  'delimiter in exact': { ...config, head_preview: { ...config.head_preview, exact: { ...config.head_preview.exact, instructions: '<!' + '--/template--' + '>' } } },
  'array payload': [1],
}
for (const [name, bad] of Object.entries(rejects)) check(`rejects ${name}`, throws(() => h._vault_decode(encode(bad))), true)
check('rejects non-canonical base64', throws(() => h._vault_decode(encode(section).slice(0, -1))), true)
check('rejects garbage', throws(() => h._vault_decode('***')), true)
check('rejects invalid utf-8', throws(() => h._vault_decode(Buffer.from([0xff]).toString('base64'))), true)

check('carrier is one line of references inside pre>code', h._vault_carrier('\na\n-'), '<pre style="white-space:pre-wrap;margin:0"><code>&#10;&#97;&#10;&#45;</code></pre>')
check('carrier handles astral code points', h._vault_carrier('😀'), '<pre style="white-space:pre-wrap;margin:0"><code>&#128512;</code></pre>')
check('carrier of empty text', h._vault_carrier(''), '<pre style="white-space:pre-wrap;margin:0"><code></code></pre>')
check('inline carrier is references only', h._vault_inline('a b'), '<code>&#97;&#32;&#98;</code>')
check('container has no blank lines', h._vault_container(['<pre>a</pre>', '<span>b</span>\n<div>c</div>']).includes('\n\n'), false)
check('repeated target parts survive decoding', h._vault_decode(encode(section)).head_preview.navigation.filter(p => p.target).length, 2)
check('expanded section', h._vault_expanded(section), 'vault: navigation only')
check('expanded config', h._vault_expanded(config), 'I ---\n# x')
check('expanded config with null instructions and other fields set', h._vault_expanded({ ...config, head_preview: { ...config.head_preview, exact: { profile: 'bare', instructions: null, run_instructions: 'R', user_prompt: 'U' } } }), 'vault: no pinned instructions')
check('expanded absent', h._vault_expanded(absent), 'vault: no pinned preview')

// the consumer boundary never rescans text parts: one nested call, the marker byte-for-byte;
// the nested toggle's label is bare references (no element, no quote: it lands in a title)
for (const marker of ['![[agents/x]]', '\n![[agents/x]]\n']) {
  reset()
  const html = h._vault_navigation({ navigation: [{ target: 'agents/x.md' }, { text: marker }] })
  check(`no rescan ${JSON.stringify(marker)}: exactly one nested template call`, calls.template.map(c => c.name), ['#vault/agents/x'])
  check(`no rescan ${JSON.stringify(marker)}: nested call in navigation mode`, calls.template[0].dict, { _vault: 'navigation' })
  check(`no rescan ${JSON.stringify(marker)}: marker carried byte-for-byte`, html.includes(h._vault_carrier(marker)), true)
  check(`no rescan ${JSON.stringify(marker)}: one toggle over the target`, calls.toggle.map(c => c.label), ['⋮ ' + h._vault_refs('![[agents/x]]')])
  check(`no rescan ${JSON.stringify(marker)}: toggle label has no element or quote`, /[<>"']/.test(calls.toggle[0].label), false)
}

// the envelope: exact framing, one-line payload, canonical source, name/path agreement
const payloadA = { v: 1, path: 'agents/a.md', source_head_relation: 'matches', head_preview: { kind: 'section', navigation: [{ text: 'A text' }, { target: 'agents/b.md' }], base: null, exact: null } }
const payloadB = { v: 1, path: 'agents/b.md', source_head_relation: 'differs', head_preview: { kind: 'section', navigation: [{ text: 'B text' }, { target: 'agents/c.md' }], base: null, exact: null } }
const sourceA = 'source A ' + lt2 + 'x' + gt2
const A = item('id_a', payloadA, sourceA)
const B = item('id_b', payloadB, 'source B')
const withText = (base, text) => ({ ...base, text })
const envelope = it => {
  ctx._this = it
  ctx._that = it // the outer item too, so a _that-for-_this mutation is caught by the nested rows below
  return h._vault_envelope()
}
check('envelope: source and payload of A', (e => [e.source, e.payload.path])(envelope(A)), [sourceA, 'agents/a.md'])
check('envelope: name must agree with the payload path', throws(() => envelope({ ...A, name: '#vault/agents/b' })), true)
for (const source of ['', 'a', 'a\n', 'a\n\n\n', '\n', 'x\n' + lt2 + 'y' + gt2 + '\n']) {
  const it = item('id_e', { v: 1, path: 'agents/e.md', source_head_relation: 'matches', head_preview: { kind: 'section', navigation: [], base: null, exact: null } }, source)
  check(`envelope: framing round-trips ${JSON.stringify(source)}`, envelope(it).source, source)
}
const emptyItem = item('id_e', absent && { v: 1, path: 'agents/e.md', source_head_relation: 'absent', head_preview: null }, '')
reset()
ctx._this = emptyItem
ctx._that = emptyItem
const emptyRender = h.vault_render()
check('envelope: empty source keeps its source control', calls.toggle.map(c => c.label), ['⋮ source'])
check('envelope: empty source carrier is empty', emptyRender.includes(h._vault_carrier('')), true)
check('envelope: null preview placeholder', emptyRender.includes('[placeholder no pinned preview (not in HEAD at last sync)]'), true)
const sourceBlockA = fence + 'jinja_removed\n' + h._vault_escape(sourceA) + '\n' + fence + '\n'
const badEnvelopes = {
  'missing source block': A.text.replace(sourceBlockA, ''),
  'duplicate source block': A.text.replace(fence + 'vault_removed', fence + 'jinja_removed\nz\n' + fence + '\n' + fence + 'vault_removed'),
  'duplicate payload block': A.text + '\n' + fence + 'vault_removed\n' + encode(absent) + '\n' + fence,
  'unclosed block': A.text.replace(fence + '\n' + fence + 'vault_removed', fence + 'vault_removed'),
  'payload on two lines': A.text.replace(fence + 'vault_removed\n', fence + 'vault_removed\nextra\n'),
  'payload with surrounding whitespace': A.text.replace(fence + 'vault_removed\n', fence + 'vault_removed\n '),
  'suffix-variant source opener': A.text.replace(fence + 'jinja_removed', fence + 'jinja_removed:x'),
  'suffix-variant payload opener': A.text.replace(fence + 'vault_removed', fence + 'vault_removed:x'),
  'raw opener in source': A.text.replace(h._vault_escape(sourceA), sourceA),
  'carriage return in source': A.text.replace('source A', 'source\rA'),
  'control in source': A.text.replace('source A', 'source\u0001A'),
  'bad payload through the same path': A.text.replace(encode(payloadA), encode({ v: 2 })),
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
  'colon-prefixed payload sibling': addBlock(validA, fence + 'x:vault_removed', encode(absent)),
  'dotted-suffix payload sibling': addBlock(validA, fence + 'vault_removed:a.b', encode(absent)),
  'indented source sibling': addBlock(validA, '  ' + fence + 'jinja_removed', 'z'),
  'unrelated block': addBlock(validA, fence + 'js', 'z'),
  'orphan fence': validA + '\n' + fence,
}
for (const [name, text] of Object.entries(additive)) check(`envelope refuses additive ${name}`, throws(() => envelope(withText(A, text))), true)
const withSource = body => withText(A, validA.replace(fence + 'jinja_removed\n' + h._vault_escape(sourceA) + '\n' + fence, fence + 'jinja_removed\n' + body + '\n' + fence))
check('envelope: canonical empty source is opener, one empty line, closer', envelope(withSource('')).source, '')
check('envelope refuses the missing-separator empty source', throws(() => envelope(withText(A, validA.replace(fence + 'jinja_removed\n' + h._vault_escape(sourceA) + '\n' + fence, fence + 'jinja_removed\n' + fence)))), true)
for (const line of [fence, fence + 'js', ' ' + fence, fence + '`', '\t' + fence + 'x'])
  check(`envelope refuses a fence-shaped source line ${JSON.stringify(line)}`, throws(() => envelope(withSource('a\n' + line + '\nb'))), true)
for (const marker of ['<!' + '-- template --' + '>', '<!' + '--/template--' + '>', '<!' + '-- TEMPLATE --' + '>', 'x <!' + '--inert--' + '> y', '<!' + '--/inert--' + '>'])
  check(`envelope refuses the reserved source marker ${JSON.stringify(marker)}`, throws(() => envelope(withSource('a\n' + marker + '\nb'))), true)
check('envelope accepts a comment that is not a reserved marker', envelope(withSource('<!' + '-- note --' + '>')).source, '<!' + '-- note --' + '>')
// the source's sole canonical closer replaced by a fence-shaped line (no later orphan fence to
// catch it): only the exact-closer guard refuses this, otherwise the source is silently truncated
check('envelope refuses a fence-shaped line replacing the source closer', throws(() => envelope(withText(A, validA.replace(h._vault_escape(sourceA) + '\n' + fence + '\n' + fence + 'vault_removed', h._vault_escape(sourceA) + '\n' + fence + 'js\n' + fence + 'vault_removed')))), true)

// the frozen control order (design section 3), from the toggle stub's call sequence
const payloadF = { v: 1, path: 'agents/f.md', source_head_relation: 'matches', head_preview: { kind: 'config', base: 'agents/worker.md', navigation: [{ text: 'intro' }, { target: 'agents/s.md' }], exact: { profile: 'bridge', instructions: 'I', run_instructions: 'R', user_prompt: 'U' } } }
const full = item('id_f', payloadF, 'source F')
reset()
ctx._this = full
ctx._that = full
h.vault_render()
check('config control order', calls.toggle.map(c => c.label), [
  '⋮ instructions (bridge profile, sync-pinned HEAD)',
  '⋮ run_instructions (bridge profile, sync-pinned HEAD)',
  '⋮ user_prompt (bridge profile, sync-pinned HEAD)',
  '⋮ ' + h._vault_refs('![[agents/worker]]'),
  '⋮ ' + h._vault_refs('![[agents/s]]'),
  '⋮ navigation (bridge/default context, sync-pinned HEAD)',
  '⋮ source',
])
check('config nested calls: base then navigation target', calls.template.map(c => c.name), ['#vault/agents/worker', '#vault/agents/s'])
reset()
ctx._this = item('id_g', { v: 1, path: 'agents/f.md', source_head_relation: 'matches', head_preview: { kind: 'config', base: null, navigation: [], exact: { profile: 'bare', instructions: null, run_instructions: null, user_prompt: 'U' } } }, 'source G')
h.vault_render()
check('config with null fields omits their controls', calls.toggle.map(c => c.label), ['⋮ user_prompt (bare profile, sync-pinned HEAD)', '⋮ navigation (bridge/default context, sync-pinned HEAD)', '⋮ source'])
reset()
ctx._this = A
h.vault_render()
check('section control order', calls.toggle.map(c => c.label), ['⋮ ' + h._vault_refs('![[agents/b]]'), '⋮ navigation (bridge/default context, sync-pinned HEAD)', '⋮ source'])

// current-item identity: A renders nested B; envelope from _this (B), the toggle belongs to _that (A)
reset()
ctx._that = A
ctx._this = B
ctx.window._template_dict = [{ _vault: 'navigation' }]
const nested = h.vault_render()
check('nested B under A: B text rendered', nested.includes(h._vault_carrier('B text')), true)
check('nested B under A: A text absent', nested.includes(h._vault_carrier('A text')), false)
check('nested B under A: no source control in navigation mode', nested.includes(h._vault_carrier('source B')), false)
check('nested B under A: B target toggled', calls.template.map(c => c.name), ['#vault/agents/c'])
check('nested B under A: the toggle belongs to A', calls.toggle.map(c => c.that), ['id_a'])
check('nested B under A: badge describes B', h.vault_badge().includes(h._vault_inline('section · agents/b.md · source differs sync-pinned HEAD at last sync')), true)
check('badge uses the inline carrier (no pre inside the label paragraph)', h.vault_badge().includes('<pre'), false)
reset()
ctx._that = A
ctx._this = A
const outer = h.vault_render()
check('outer A: A text and source', outer.includes(h._vault_carrier('A text')) && outer.includes(h._vault_carrier(sourceA)), true)
reset()
ctx.window._item_eval_context = ['expanded']
check('expanded A is one string without markup', h.vault_render(), 'vault: navigation only')
check('expanded A makes no nested call', calls.template.length + calls.toggle.length, 0)
check('expanded badge is plain text', h.vault_badge(), 'vault badge: section · agents/a.md · source matches sync-pinned HEAD at last sync')
check('expanded badge carries no markup', /<[a-z]/.test(h.vault_badge()), false)
reset()
ctx._this = { ...A, name: '#vault/agents/zzz' }
check('invalid envelope: badge fails closed', h.vault_badge().includes(h._vault_inline('vault payload invalid')), true)
check('invalid envelope: render fails closed', h.vault_render(), '[placeholder vault payload invalid]')
ctx.window._item_eval_context = ['expanded']
check('invalid envelope: expanded render fails closed', h.vault_render(), 'vault: payload invalid')
check('invalid envelope: expanded badge fails closed', h.vault_badge(), 'vault badge: vault payload invalid')

// the synthetic fixtures (design section 8): the exact manifest, each envelope through the
// renderer, the dependency-tag line derived from the payload, the performance root's size
const fixtures = path.join(__dirname, 'fixtures', 'vault_sync')
const manifest = ['e2e_absent.md', 'e2e_config.md', 'e2e_large.md', 'e2e_nested.md', 'e2e_section.md', 'e2e_worker.md']
check('fixture manifest is exact', fs.existsSync(fixtures) ? fs.readdirSync(fixtures).filter(f => f.endsWith('.md')).sort() : [], manifest)
for (const name of manifest) {
  const file = path.join(fixtures, name)
  if (!fs.existsSync(file)) continue
  const text = fs.readFileSync(file, 'utf8')
  const it = { id: 'fx_' + name, name: text.split(/\s/)[0], text }
  if (throws(() => envelope(it))) {
    check(`fixture ${name} envelope parses`, false, true)
    continue
  }
  const env = envelope(it)
  check(`fixture ${name} envelope parses`, env.payload.path.endsWith('/' + name), true)
  const hp = env.payload.head_preview
  const deps = []
  for (const p of [hp && hp.base, ...(hp ? hp.navigation.filter(x => 'target' in x).map(x => x.target) : [])]) if (p && !deps.includes(p)) deps.push(p)
  check(`fixture ${name} dependency tags derive from the payload`, text.trimEnd().split('\n').pop(), ['#_template/vault', ...deps.map(p => '#_vault/' + p.replace(/\.md$/, ''))].join(' '))
  reset()
  ctx._this = it
  ctx._that = it
  check(`fixture ${name} renders its source`, h.vault_render().includes(h._vault_carrier(env.source)), true)
  if (name == 'e2e_section.md') check('fixture e2e_section.md source keeps its raw opener', env.source.includes('\n' + lt2 + 'not a macro' + gt2), true)
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
