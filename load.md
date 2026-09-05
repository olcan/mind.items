#load function loads external libraries.
```js_example
await _load(
  self.lib1 || "url1", // load only if !self.lib1
  self.lib2 || "url2", // load only if !self.lib2
  // custom_init(),
)
// ... post-load init

// Alternative Usage (assuming lib1 primary)
if (!self.lib1) { // skip load+init if lib1 loaded
  await _load("url1", "url2", /* custom_init() */)
  // ... post-load init
}
```
```js_removed:load.js
// load.js
```