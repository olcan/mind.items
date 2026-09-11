#todoer helps manage todo items.  
- Try <<link_eval(_this, 'create_pinned_item()', 'creating a pinned item')>> with a drag-and-drop widget.
- Try using the `/todo [text]` command to quickly create new items.
- Delegate a todo to the vault agent by dragging it to the widget's agent bin (or `/delegate`); it moves to the delegated list below the main one, and comes back when the agent hands it back (design: the vault's `notes/design/mind_task_agents.md`).
- A pinned item created before the delegated list exists shows only the main widget: add `\<<todoer_widget({delegated: true})>>` below it (new pins carry both).
#### Commands
<< command_table() >>
#### Functions
<< js_table() >>

```js_removed:todoer.js
// todoer.js
```

```html_widget_removed:todoer-widget.html
// todoer-widget.html
```

```html_snooze_modal_removed:todoer-snooze-modal.html
// todoer-snooze-modal.html
```

#_load #_listen #_welcome #_util/core