#edge_test is a test for the blurry edge at the top of the app on an iPhone: a small panel at the page's lower left, with one switch for each thing a page can change that may take it away. Put one switch on (a tap), look at the top edge, put it off again, and say which ones took the blur away. Every switch is off after a reload, and deleting this item removes the panel and undoes whatever a switch changed.
- the first switches are variants of the strip that worked, a 12 px element in the header's color fixed along the top edge: the same strip as the control, the header itself declared sticky, the strip behind the header, under the header's buttons and picture, and letting taps through, then thinner strips of 6, 3 and 1 px. The least that still takes the blur away is what the app will get. Below them are the five that did not work, as they were.
- the gray lines are facts of this device: the window and the part of it in view, the safe area's top and whether this is the Home Screen app, what the keyboard reported for the last space typed (its Shift and caps lock: no text is kept), the switches that are on, and what the `#key_buttons` item reads of the keyboard. They can be selected, **copy these lines** puts them on the clipboard, and the panel stays above the keyboard while that is up.

```js_removed:edge_test.js
// edge_test.js
```

#_welcome #_listen
