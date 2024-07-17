#chat/ollama #_agent/chat/ollama
<<command_table()>>
```js:js_removed
// => /ollama [msg]
// send `msg` to [ollama agent](#agent/chat/ollama)
function _on_command_ollama(msg) {
  let suffix = 0
  while (_exists('#chat/ollama/' + suffix)) suffix++
  const name = '#chat/ollama/' + suffix
  return {
    text: [name, '\<<user>> ' + msg].join('\n'),
    mindbox_text: name, // select new item
    save: false // can interfere with agent saving response
  }
}
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
  model: 'gemma2',
  options: { // https://github.com/ollama/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values
    temperature: 1
  }
}
```