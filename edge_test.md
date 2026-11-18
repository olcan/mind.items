#edge_test is a test for the blurry edge at the top of the app on an iPhone: a small panel at the page's lower left, with one switch for each thing a page can change that may draw it. Put one switch on (a tap), look at the top edge, put it off again, and say which one took the blur away. Every switch is off after a reload, and deleting this item removes the panel and undoes whatever a switch changed.
- each switch says on the panel what it changes; **strip** takes the taps on the page's top pixels while it is on, and **document** turns the app's own scrolling off until it is off again.
- the three gray lines are facts of this device, to read out: the window and the part of it in view (and the least seen, with the keyboard up), the safe area's top and whether this is the Home Screen app, and what the keyboard reported for the last space typed (its Shift and caps lock: no text is kept).

```js_removed:edge_test.js
// edge_test.js
```

#_welcome #_listen
