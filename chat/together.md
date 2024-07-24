#chat/together #_agent/chat/together
<<command_table()>>
```js:js_removed
// => /together [msg]
// send `msg` to [together agent](#agent/chat/together)
const _on_command_together = msg => _chat_command(msg)
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // https://docs.together.ai/reference/chat-completions
  // https://docs.together.ai/docs/chat-models
  // model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  // model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  model: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
  temperature: 1,
  // tool_choice: 'none', // uncomment for together tools api
  // converter: js_eval_converter // from #template/tool_use
}
```