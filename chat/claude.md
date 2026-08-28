#chat/claude #_agent/chat/claude
<<command_table()>>
```js:js_removed
// => /claude [msg]
// send `msg` to [claude agent](#agent/chat/claude)
const _on_command_claude = msg => _chat_command(msg)
```
#_listen #_template/system
<<system>> <<toggle(template('/system'), '⋮ #template/system')>>
---
```js:agent
{ // https://docs.anthropic.com/en/api/messages
  model: 'claude-fable-5', // https://docs.anthropic.com/en/docs/about-claude/models
  temperature: 1
}
```