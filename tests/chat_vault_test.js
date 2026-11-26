#!/usr/bin/env node
// plain-node table for #chat/vault's /vault command (chat/vault.md):
// _on_command_vault allocates the next free suffix, returns mindbox_text with the new item's name
// (no MindBox.set), leaves a refused creation alone, blurs MindBox, scrolls to the target, and
// places the caret at the end on the first editor focus when editing.
//
// run: node external/mind.items/tests/chat_vault_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const chatSrc = fs.readFileSync(path.join(__dirname, '..', 'chat.js'), 'utf8')
const initMatch = chatSrc.match(/\nfunction _chat_command_init\([^\n]*\) \{[\s\S]*?\n\}\n/)
if (!initMatch) throw new Error('chat.js lacks _chat_command_init')
const src = fs.readFileSync(path.join(__dirname, '..', 'chat', 'vault.md'), 'utf8')
const block = src.match(/```js:js_removed\n([\s\S]*?)\n```/)
if (!block) throw new Error('chat/vault.md lacks js:js_removed block')
const js = block[1]

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// item-text hygiene: no unescaped macro opener inside the JS block
check('js block holds no unescaped macro opener', (js.match(/(?<!\\)<</g) ?? []).length, 0)

// mimic the app's eval preprocessing: prepend #chat's shared _chat_command_init dependency and
// strip backslash before << as the item macro pass does
const runnable = (initMatch[0] + '\n' + js).replace(/\\<</g, '<<')

function makeEnv({ existing = [], shiftKey = undefined, boxText = '', targets = {} } = {}) {
  const existingSet = new Set(existing)
  const calls = []
  const listeners = []
  let resolveDom = null
  const domPromise = new Promise(r => {
    resolveDom = r
  })
  const ctx = {
    _name: '#chat/vault',
    _exists: name => existingSet.has(name),
    _update_dom: () => {
      calls.push(['_update_dom'])
      return domPromise
    },
    window: {
      _mindbox_event: shiftKey === undefined ? undefined : { shiftKey },
      __item: id => (id in targets ? { target: targets[id] } : null),
    },
    MindBox: {
      get: () => boxText,
      elem: {
        blur: () => calls.push(['blur']),
      },
      set: (...args) => calls.push(['MindBox.set', ...args]),
      scroll_to_target: () => calls.push(['scroll_to_target']),
    },
    document: {
      addEventListener: (type, fn, capture) => {
        calls.push(['addEventListener', type, capture])
        listeners.push({ type, fn, capture })
      },
      removeEventListener: (type, fn, capture) => {
        calls.push(['removeEventListener', type, capture])
        const idx = listeners.findIndex(l => l.type === type && l.fn === fn && l.capture === capture)
        if (idx >= 0) listeners.splice(idx, 1)
      },
    },
    queueMicrotask,
  }
  vm.createContext(ctx)
  vm.runInContext(runnable + '\nthis._on_command_vault = _on_command_vault', ctx)
  return { ctx, calls, listeners, resolveDom }
}

async function main() {
  // 1. Plain /vault without Shift when the box names the new chat (either MindBox.get() already holds
  // it or onEditorChange already set __item(id).target synchronously before Svelte flushes the textarea)
  {
    const { ctx, calls, listeners } = makeEnv({
      existing: ['#chat/vault/0', '#chat/vault/1'],
      shiftKey: false,
      boxText: '/vault',
      targets: { tmp1: true },
    })
    const ret = ctx._on_command_vault('')
    check('plain /vault allocates next free suffix in text', ret.text, '#chat/vault/2 #_agent/vault\n<<user>> ')
    check('plain /vault without Shift sets edit false', ret.edit, false)
    check('plain /vault returns mindbox_text matching new item name', ret.mindbox_text, '#chat/vault/2')

    // refused creation: init(null) and init(undefined) do nothing
    ret.init(null)
    ret.init(undefined)
    check('refused creation (null/undefined) triggers no side effects', calls, [])

    // non-editing creation with mindbox_text applied (target=true before tick): blurs and scrolls without MindBox.set
    ret.init({ id: 'tmp1', name: '#chat/vault/2', editing: false })
    check('non-editing init (target applied) blurs MindBox and scrolls without MindBox.set', calls, [
      ['blur'],
      ['scroll_to_target'],
    ])
    check('non-editing init attaches no focusin listener', listeners.length, 0)
  }

  // 1b. Non-editing init when MindBox.get() already matches item.name (without __item target)
  {
    const { ctx, calls } = makeEnv({ existing: [], shiftKey: false, boxText: ' #chat/vault/0 ' })
    const ret = ctx._on_command_vault('')
    ret.init({ id: 'tmp2', name: '#chat/vault/0', editing: false })
    check('non-editing init (MindBox.get matches) blurs and scrolls without MindBox.set', calls, [
      ['blur'],
      ['scroll_to_target'],
    ])
  }

  // 1c. Command run without the box (e.g. clicked rendered /vault link while #todo is selected:
  // handleCommandReturn dropped mindbox_text so neither MindBox.get() nor __item(id).target matches)
  {
    const { ctx, calls, listeners } = makeEnv({
      existing: ['#chat/vault/0'],
      shiftKey: false,
      boxText: '#todo',
      targets: { link1: false },
    })
    const ret = ctx._on_command_vault('from link')
    ret.init({ id: 'link1', name: '#chat/vault/1', editing: false })
    check('link-dispatched init falls back to MindBox.set(name, { scroll: true })', calls, [
      ['MindBox.set', '#chat/vault/1', { scroll: true }],
    ])
    check('link-dispatched non-editing init attaches no focusin listener', listeners.length, 0)
  }

  // 1d. Command run without the box when editing is true: navigates with MindBox.set AND moves caret to end
  {
    const { ctx, calls, listeners } = makeEnv({
      existing: [],
      shiftKey: true,
      boxText: '#todo',
      targets: { link2: false },
    })
    const ret = ctx._on_command_vault('')
    ret.init({ id: 'link2', name: '#chat/vault/0', editing: true })
    check('link-dispatched editing init arms caret-to-end and navigates via MindBox.set', calls, [
      ['addEventListener', 'focusin', true],
      ['_update_dom'],
      ['MindBox.set', '#chat/vault/0', { scroll: true }],
    ])
    check('link-dispatched editing init has one active focusin listener', listeners.length, 1)
  }

  // 2. /vault with words and synthetic event (Create button: shiftKey undefined)
  {
    const { ctx } = makeEnv({ existing: [], shiftKey: undefined })
    const ret = ctx._on_command_vault('check the logs')
    check('/vault with message puts message after user opener', ret.text, '#chat/vault/0 #_agent/vault\n<<user>> check the logs')
    check('Create button (no event) leaves edit undefined for app default', ret.edit, undefined)
    check('/vault with message returns mindbox_text', ret.mindbox_text, '#chat/vault/0')
  }

  // 3. /vault with Shift+Enter (editing: true) with mindbox_text applied: blurs, scrolls, moves caret on focus
  {
    const { ctx, calls, listeners } = makeEnv({
      existing: ['#chat/vault/0'],
      shiftKey: true,
      boxText: '/vault',
      targets: { item42: true },
    })
    const ret = ctx._on_command_vault('')
    check('Shift+Enter sets edit true', ret.edit, true)
    check('Shift+Enter returns mindbox_text', ret.mindbox_text, '#chat/vault/1')

    ret.init({ id: 'item42', name: '#chat/vault/1', editing: true })
    check('editing init blurs MindBox, arms focusin listener, and scrolls without MindBox.set', calls, [
      ['addEventListener', 'focusin', true],
      ['_update_dom'],
      ['blur'],
      ['scroll_to_target'],
    ])
    check('editing init has one active focusin listener', listeners.length, 1)

    // unrelated textarea focus is ignored and leaves listener armed
    const otherField = { id: '', value: 'draft', selectionStart: 0, selectionEnd: 0 }
    listeners[0].fn({ target: otherField })
    await Promise.resolve()
    check('unrelated textarea focus is untouched', [otherField.selectionStart, otherField.selectionEnd], [0, 0])
    check('unrelated focus keeps listener armed', listeners.length, 1)

    // target editor textarea focus moves caret to end in microtask and disarms listener
    const editorField = { id: 'textarea-item42', value: '#chat/vault/1 #_agent/vault\n<<user>> ', selectionStart: 0, selectionEnd: 0 }
    listeners[0].fn({ target: editorField })
    check('target focus disarms listener synchronously', listeners.length, 0)
    check('caret moves in microtask after app focus step', [editorField.selectionStart, editorField.selectionEnd], [0, 0])
    await Promise.resolve()
    check('caret lands collapsed at end after microtask', [editorField.selectionStart, editorField.selectionEnd], [37, 37])
  }

  // 4. _caret_to_end cleans up listener on _update_dom if focus never arrives
  {
    const { ctx, listeners, resolveDom } = makeEnv({ shiftKey: true })
    const ret = ctx._on_command_vault('')
    ret.init({ id: 'item99', name: '#chat/vault/0', editing: true })
    check('listener armed before _update_dom settles', listeners.length, 1)
    resolveDom()
    await Promise.resolve()
    await Promise.resolve()
    check('listener removed once _update_dom settles without focus', listeners.length, 0)
  }

  console.log(`\n${failures ? `${failures} FAILED` : 'all ok'}`)
  process.exit(failures ? 1 : 0)
}

main()
