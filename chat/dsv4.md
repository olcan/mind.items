#chat/dsv4 #_agent/chat/llama is `deepseek-v4-flash` (284B/13B-active MoE, 1M ctx) via [llama-server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) on m3ultra.
<<command_table()>>
```js:js_removed
// => /dsv4 [msg]
// send `msg` to [llama agent](#agent/chat/llama) on m3ultra
const _on_command_dsv4 = msg => _chat_command(msg)
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // llama-server openai-style chat completions; sampling params top-level.
  // no url: this is the agent's DEFAULT server (m3ultra dsv4, ~39 tok/s w/
  // DSpark); tailnet-only, manual-start: vault bin/serve_model.sh dsv4
  name: 'dsv4',
  temperature: 1
  // tool_choice: 'auto', // uncomment to enable 'eval' tool
}
```