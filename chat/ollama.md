#chat/ollama #_agent/chat/ollama
<<command_table()>>
```js:js_removed
// => /ollama [msg]
// send `msg` to [ollama agent](#agent/chat/ollama)
const _on_command_ollama = msg => _chat_command(msg)
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
  model: 'gemma3:4b', // installed on the default tailnet server (gemma2 is not)
  options: { // https://github.com/ollama/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values
    temperature: 1
  }
}
```