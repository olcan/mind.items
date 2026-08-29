#chat/next #_agent/chat/llama is `qwen3.8-flash-next` (180B/6B-active MoE, 256k ctx) via [llama-server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) on tinybox.
<<command_table()>>
```js:js_removed
// => /next [msg]
// send `msg` to [llama agent](#agent/chat/llama) on tinybox
const _on_command_next = msg => _chat_command(msg)
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // llama-server openai-style chat completions; sampling params top-level
  // (llama.cpp extras like top_k/min_p ok); tailnet-only, manual-start:
  // vault bin/serve_model.sh next (~62 tok/s)
  url: 'https://tinybox.tail10a0fe.ts.net:8443/v1/chat/completions',
  name: 'flash-next',
  temperature: 1
  // tool_choice: 'auto', // uncomment to enable 'eval' tool
}
```