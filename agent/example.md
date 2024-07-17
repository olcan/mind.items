#agent/example agent that simply increments a counter. Hit `run` to start.
```js:js_input
agent.counter ??= 0
agent.counter++
// scan dependents and log that there is nothing to do for them
each(_this.dependents, dep => debug(`nothing to do for dependent ${_item(dep).name}`))
debug(agent.state)
agent.continue(5)
```
<<agent_controls()>>