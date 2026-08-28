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
  // https://docs.together.ai/docs/serverless-models
  // model: 'deepseek-ai/DeepSeek-V4-Pro',
  // model: 'Qwen/Qwen3.7-Max',
  model: 'moonshotai/Kimi-K3',
  temperature: 1,
  reasoning_effort: 'high', // max supported (kimi also reasons by default)
  // tool_choice: 'auto', // uncomment to enable 'eval' tool
  // converter: js_eval_converter // from #template/tool_use
}
```