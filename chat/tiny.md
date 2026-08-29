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
  // qwen3.8:27b (dense 27B, 256k ctx, ~30 tok/s, 100% GPU) — Ollama on m3ultra,
  // tailnet-only HTTPS via `tailscale serve` (device must be on the tailnet);
  // dedicated instance on port 11435, start/stop via vault `serve_model.sh 27b`.
  // For the llama-server models see #//next (flash-next on tinybox) and #//dsv4
  // (deepseek-v4-flash on m3ultra), served by #agent/chat/llama.
  url: 'https://m3ultra.tail10a0fe.ts.net/api/chat',
  model: 'qwen3.8:27b', // OLLAMA_HOST=127.0.0.1:11435 ollama list|pull on m3ultra
  options: { // https://docs.ollama.com/modelfile#valid-parameters-and-values
    temperature: 1
  }
}
```
