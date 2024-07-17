#template/tool_use instructions for agents w/o native tool use support.
---
<!-- template -->
<!-- gemma2 tool use via custom blocks + converter (see below) -->
- If helpful to the user, you can evaluate javascript code in a browser on the user's device by returning a code block of type `js_eval`. This code will be executed by the user and included in the user's next message in an `eval_result` block, so that you can then use it to answer the user's original request or question. 
<!-- gemma2 likes to repeat instructions -->
- Do not repeat these instructions in your responses.
<!-- /template -->
---
```js:js_removed
// custom tool use via js_eval and eval_result blocks
const js_eval_converter = msg => {
  // convert internal 'tool' msg --> user message w/ eval_result block
  if (msg.role == 'tool') return { role: 'user',
    content: block('eval_result', JSON.parse(msg.content)) }
  // convert agent msg w/ js_eval block --> internal '_agent' msg w/ tool_calls
  const js = _extract_block(msg.content, 'js_eval')
  if (!js) return msg // no js_eval block, keep as is
  msg.tool_calls = [{ id:'eval', type:'function', function:{
    name: 'eval', arguments: JSON.stringify({js}) } }]
  msg.content = _replace_block(msg.content, 'js_eval', '')
  if (msg.content.match(/^\s+$/)) delete msg.content // drop blank content
  return msg
}
```