#chat/tiny #_agent/chat/ollama is #//ollama running on a personal server.  
<<command_table()>>
```js:js_removed
// => /tiny [msg]
// send `msg` to [ollama agent](#agent/chat/ollama)
const _on_command_tiny = msg => _chat_command(msg)
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
  // url: '/proxy/http://192.168.86.54:11434/api/chat',
  // url: '/proxy/http://24.4.198.129:11434/api/chat', // via curl ifconfig.me
  url: '/proxy/http://tiny0.duckdns.org:11434/api/chat', // via duckdns.org
  model: 'gemma2:27b', // via ssh tiny@tiny0.duckdns.org ollama list|pull
  options: { // https://github.com/ollama/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values
    temperature: 1
  }
}
```