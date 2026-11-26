#!/usr/bin/env node
// plain-node table for #chat's shared _chat_command helper (chat.js), used by the eleven model
// chat commands (/claude, /gpt, /gemini, /groq, /groq_tools, /openrouter, /together, /ollama,
// /tiny, /dsv4, /next): allocates the next free suffix, returns mindbox_text with the new item's
// name (no MindBox.set when the box already names it), leaves a refused creation alone, blurs
// MindBox, scrolls to the target, falls back to MindBox.set when run without the box (an inline
// command link), and places the caret at the end on the first editor focus when editing.
//
// run: node external/mind.items/tests/chat_command_test.js
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const rootDir = path.join(__dirname, '..')
const src = fs.readFileSync(path.join(rootDir, 'chat.js'), 'utf8')
const pick = (pattern, optional = false) => {
  const found = src.match(pattern)
  if (!found && !optional) throw new Error(`chat.js lacks ${pattern}`)
  return found ? found[0] : ''
}

const initSrc = pick(/\nfunction _chat_command_init\([^\n]*\) \{[\s\S]*?\n\}\n/, true)
const cmdSrc = pick(/\nfunction _chat_command\([^\n]*\) \{[\s\S]*?\n\}\n/)

let failures = 0
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(actual) + ' != ' + JSON.stringify(expected)}`)
}

// item-text hygiene: no unescaped macro opener in chat.js, and no hash tag words in comments of
// _chat_command_init / _chat_command
check('chat.js holds no unescaped macro opener', (src.match(/(?<!\\)<</g) ?? []).length, 0)
const commentTags = (initSrc + '\n' + cmdSrc).match(/\/\/[^\n]*#[A-Za-z0-9_/]/g) ?? []
check('chat command helper comments hold no hash tag words', commentTags.length, 0)

// verify all eleven chat command items delegate directly to _chat_command(msg)
const ELEVEN = ['claude', 'gpt', 'gemini', 'groq', 'groq_tools', 'openrouter', 'together', 'ollama', 'tiny', 'dsv4', 'next']
const missingDelegations = ELEVEN.filter(cmd => {
  const md = fs.readFileSync(path.join(rootDir, 'chat', `${cmd}.md`), 'utf8')
  return !md.includes(`const _on_command_${cmd} = msg => _chat_command(msg)`)
})
check('all eleven chat commands delegate to _chat_command(msg)', missingDelegations, [])

// mimic the app's eval preprocessing: strip backslash before << as the item macro pass does
const runnable = (initSrc + '\n' + cmdSrc).replace(/\\<</g, '<<')

function makeEnv({ name = '#chat/claude', existing = [], shiftKey = undefined, boxText = '', targets = {} } = {}) {
  const existingSet = new Set(existing)
  const calls = []
  const listeners = []
  let resolveDom = null
  const domPromise = new Promise(r => {
    resolveDom = r
  })
  const ctx = {
    _name: name,
    _exists: n => existingSet.has(n),
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
  vm.runInContext(runnable + '\nthis._chat_command = _chat_command', ctx)
  return { ctx, calls, listeners, resolveDom }
}

async function main() {
  // 1. Plain command without Shift when the box names the new chat (either MindBox.get() already
  // holds it or onEditorChange already set __item(id).target synchronously before Svelte flushes)
  {
    const { ctx, calls, listeners } = makeEnv({
      existing: ['#chat/claude/0', '#chat/claude/1'],
      shiftKey: false,
      boxText: '/claude',
      targets: { tmp1: true },
    })
    const ret = ctx._chat_command('')
    check('plain command allocates next free suffix in text', ret.text, '#chat/claude/2\n<<user>> ')
    check('plain command without Shift sets edit false', ret.edit, false)
    check('plain command returns mindbox_text matching new item name', ret.mindbox_text, '#chat/claude/2')

    // refused creation: init(null) and init(undefined) do nothing and do not throw
    const refusalErrors = []
    for (const bad of [null, undefined]) {
      try {
        ret.init(bad)
      } catch (e) {
        refusalErrors.push(e.name)
      }
    }
    check('refused creation (null/undefined) triggers no side effects or errors', { refusalErrors, calls }, { refusalErrors: [], calls: [] })

    // non-editing creation with mindbox_text applied (target=true before tick): blurs and scrolls without MindBox.set
    calls.length = 0
    ret.init({ id: 'tmp1', name: '#chat/claude/2', editing: false })
    check('non-editing init (target applied) blurs MindBox and scrolls without MindBox.set', calls, [
      ['blur'],
      ['scroll_to_target'],
    ])
    check('non-editing init attaches no focusin listener', listeners.length, 0)
  }

  // 1b. Non-editing init when MindBox.get() already matches item.name case-insensitively (without __item target)
  {
    const { ctx, calls } = makeEnv({ existing: [], shiftKey: false, boxText: ' #CHAT/claude/0 ' })
    const ret = ctx._chat_command('')
    ret.init({ id: 'tmp2', name: '#chat/claude/0', editing: false })
    check('non-editing init (MindBox.get matches) blurs and scrolls without MindBox.set', calls, [
      ['blur'],
      ['scroll_to_target'],
    ])
  }

  // 1c. Command run without the box (e.g. clicked rendered /claude link while #todo is selected:
  // handleCommandReturn dropped mindbox_text so neither MindBox.get() nor __item(id).target matches)
  {
    const { ctx, calls, listeners } = makeEnv({
      existing: ['#chat/claude/0'],
      shiftKey: false,
      boxText: '#todo',
      targets: { link1: false },
    })
    const ret = ctx._chat_command('from link')
    ret.init({ id: 'link1', name: '#chat/claude/1', editing: false })
    check('link-dispatched init falls back to MindBox.set(name, { scroll: true })', calls, [
      ['MindBox.set', '#chat/claude/1', { scroll: true }],
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
    const ret = ctx._chat_command('')
    ret.init({ id: 'link2', name: '#chat/claude/0', editing: true })
    check('link-dispatched editing init arms caret-to-end and navigates via MindBox.set', calls, [
      ['addEventListener', 'focusin', true],
      ['_update_dom'],
      ['MindBox.set', '#chat/claude/0', { scroll: true }],
    ])
    check('link-dispatched editing init has one active focusin listener', listeners.length, 1)
  }

  // 2. Command with words and synthetic event (Create button: shiftKey undefined)
  {
    const { ctx } = makeEnv({ existing: [], shiftKey: undefined })
    const ret = ctx._chat_command('explain this')
    check('command with message puts message after user opener', ret.text, '#chat/claude/0\n<<user>> explain this')
    check('Create button (no event) leaves edit undefined for app default', ret.edit, undefined)
    check('command with message returns mindbox_text', ret.mindbox_text, '#chat/claude/0')
  }

  // 3. Command with Shift+Enter (editing: true) with mindbox_text applied: blurs, scrolls, moves caret on focus
  {
    const { ctx, calls, listeners } = makeEnv({
      existing: ['#chat/claude/0'],
      shiftKey: true,
      boxText: '/claude',
      targets: { item42: true },
    })
    const ret = ctx._chat_command('')
    check('Shift+Enter sets edit true', ret.edit, true)
    check('Shift+Enter returns mindbox_text', ret.mindbox_text, '#chat/claude/1')

    ret.init({ id: 'item42', name: '#chat/claude/1', editing: true })
    check('editing init blurs MindBox, arms focusin listener, and scrolls without MindBox.set', calls, [
      ['addEventListener', 'focusin', true],
      ['_update_dom'],
      ['blur'],
      ['scroll_to_target'],
    ])
    check('editing init has one active focusin listener', listeners.length, 1)

    // unrelated textarea focus is ignored and leaves listener armed
    const otherField = { id: '', value: 'draft', selectionStart: 0, selectionEnd: 0 }
    if (listeners[0]) listeners[0].fn({ target: otherField })
    await Promise.resolve()
    check('unrelated textarea focus is untouched', [otherField.selectionStart, otherField.selectionEnd], [0, 0])
    check('unrelated focus keeps listener armed', listeners.length, 1)

    // target editor textarea focus moves caret to end in microtask and disarms listener
    const editorField = { id: 'textarea-item42', value: '#chat/claude/1\n<<user>> ', selectionStart: 0, selectionEnd: 0 }
    if (listeners[0]) listeners[0].fn({ target: editorField })
    check('target focus disarms listener synchronously', listeners.length, 0)
    check('caret moves in microtask after app focus step', [editorField.selectionStart, editorField.selectionEnd], [0, 0])
    await Promise.resolve()
    check('caret lands collapsed at end after microtask', [editorField.selectionStart, editorField.selectionEnd], [24, 24])
  }

  // 4. Caret listener cleans up on _update_dom if focus never arrives
  {
    const { ctx, listeners, resolveDom } = makeEnv({ shiftKey: true })
    const ret = ctx._chat_command('')
    ret.init({ id: 'item99', name: '#chat/claude/0', editing: true })
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
