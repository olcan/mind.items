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
  // host: '192.168.86.54', // tinybox private ip
  // host: '24.4.198.129', // public ip via curl ifconfig.me
  host: 'tiny0.duckdns.org', // public name via duckdns.org
  model: 'gemma2:27b', // via ssh tiny@tiny0.duckdns.org ollama list|pull
  options: { // https://github.com/ollama/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values
    temperature: 1
  }
}
```