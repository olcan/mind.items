#chat/gemma #_agent/chat/ollama is #//ollama using `gemma2` with custom tool use.
<<command_table()>>
```js:js_removed
// => /gemma [msg]
// send `msg` to [ollama agent](#agent/chat/ollama) using `gemma2`
const _on_command_gemma = msg => _chat_command(msg)
```
#_listen #_template/tool_use
<<system>> <<toggle(template('/tool_use'), '⋮ #template/tool_use')>>
---
```js:agent
{ // https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
  model: 'gemma2',
  options: { // https://github.com/ollama/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values
    temperature: 1
  },
  converter: js_eval_converter // from #template/tool_use
}
```