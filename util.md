#util defines importable _utilities_: #/core #/math #/stat.
- Useful collection of constants & functions.
  - Goals: simple, clean, tested, benchmarked, documented.
- Globally scoped but _optionally_ imported via hidden tags:
  - `#_util` (_everything_), `#_util/core`, `#_util/math`, ...
- Naming convention is short, lowercase, `underscore_separated`.
  - Array indices and sizes are uppercase: `xJ, xJK, J, K, ...`
  - Class names are uppercase: `Map, Set, Array, ...`
  - Random variables are uppercase: `X, Y, Xt, ...`
<p> #_/core #_/math #_/stat