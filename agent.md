#agent defines utilities for _agents_, which are repeating tasks on _agent items_. Active agent tasks are dispatched on all [instances](#status) but are _run_ only on the primary (focused) instance and are _paused_ elsewhere. See also [macros](#agent_macros) and #/example.
---
<<command_table()>>
---
#### Active Agents
<< table(zip(active_agents(), active_agents().map(a=>link_eval(_this,`stop_agent('${a}')`,'stop')), active_agents().map(a=>link_eval(_this,`start_agent('${a}',_item('${a}').store.agent?.id)`,'run')))) || '_none_' >>
---
<<js_table()>>

```js_removed:agent.js
// agent.js
```

```js:js_init_removed
// register 'agent' as alias for 'javascript' for highlighting
function _init() {
  hljs.registerAliases(['agent'], { languageName: 'javascript' })
  hljs.getLanguage('javascript').aliases.push('agent') // used by editor for Cmd+/
}
```

#_util/core #_util/cloud #_autodep #_async #_welcome #_listen #_init #_agent_macros