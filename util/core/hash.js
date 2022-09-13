// hashes `x` using `hasher`
// applies `stringifier` to non-string `x`
// integer for ≤52 bits, hex string for >52
// | hasher                  | bits | algorithm
// | `_hash_32_djb2`         | 32   | [djb2](http://www.cse.yorku.ca/~oz/hash.html) (xor)
// | `_hash_32_fnv1a`        | 32   | [fnv-1a](https://en.wikipedia.org/wiki/Fowler–Noll–Vo_hash_function)
// | `_hash_32_murmur3`      | 32   | [murmur v3](https://en.wikipedia.org/wiki/MurmurHash)
// | `_hash_52_fnv1a`        | 52   | [fnv-1a](https://en.wikipedia.org/wiki/Fowler–Noll–Vo_hash_function)
// | default ➡ `_hash_64_fnv1a`        | 64   | [fnv-1a](https://en.wikipedia.org/wiki/Fowler–Noll–Vo_hash_function)
// | `_hash_128_murmur3_x86` | 128  | [murmur v3](https://en.wikipedia.org/wiki/MurmurHash) x86
// | `_hash_128_murmur3_x64` | 128  | [murmur v3](https://en.wikipedia.org/wiki/MurmurHash) x64
// | `_hash_160_sha1`        | 160  | [secure hash algo 1](https://en.wikipedia.org/wiki/SHA-1)
function hash(x, hasher = _hash_64_fnv1a, stringifier = undefined) {
  return window._hash(x, hasher, stringifier) // see https://github.com/olcan/mind.page/blob/6a1ea818bc11fb72ef5268e5d0ed2c694b33d7c5/src/util.js#L269
}

function _test_hash() {
  const str = '你好，世界！看看这头牛: 🐄' // hello world! check out this cow: 🐄
  check(
    () => is_integer(hash(str, _hash_32_djb2)),
    () => is_integer(hash(str, _hash_32_fnv1a)),
    () => is_integer(hash(str, _hash_32_murmur3)),
    () => is_integer(hash(str, _hash_52_fnv1a)),
    () => hash(str, _hash_64_fnv1a).length == 16,
    () => hash(str, _hash_128_murmur3_x64).length == 32,
    () => hash(str, _hash_128_murmur3_x86).length == 32,
    () => hash(str, _hash_160_sha1).length == 40
  )
}

function _benchmark_hash() {
  const str = '你好，世界！看看这头牛: 🐄' // hello world! check out this cow: 🐄
  benchmark(
    () => hash(str, _hash_32_djb2),
    () => hash(str, _hash_32_fnv1a),
    () => hash(str, _hash_32_murmur3),
    () => hash(str, _hash_52_fnv1a),
    () => hash(str, _hash_64_fnv1a),
    () => hash(str, _hash_128_murmur3_x64),
    () => hash(str, _hash_128_murmur3_x86),
    () => hash(str, _hash_160_sha1)
  )
}

// encode(string,[encoding='base64'])
// encodes `string` into `encoding`
// `string` is assumed [UTF-16](https://en.wikipedia.org/wiki/UTF-16) (`js` default)
// | `'utf8'`              | [UTF-8](https://en.wikipedia.org/wiki/UTF-8) string
// | `'utf8_array'`        | [UTF-8](https://en.wikipedia.org/wiki/UTF-8) array (`Uint8Array`)
// | `'byte_array'`        | raw byte array (`Uint8Array`) for code points ≤255 only
// | default ➡ `'base64'`  | [Base64](https://en.wikipedia.org/wiki/Base64) ASCII string
function encode(string, encoding = 'base64') {
  return window._encode(string, encoding) // see https://github.com/olcan/mind.page/blob/6a1ea818bc11fb72ef5268e5d0ed2c694b33d7c5/src/util.js#L185
}

// decode(x,[encoding='base64'])
// decodes string from `x` in `encoding`
// see `encode` for supported encodings
function decode(x, encoding = 'base64') {
  return window._decode(x, encoding) // see https://github.com/olcan/mind.page/blob/6a1ea818bc11fb72ef5268e5d0ed2c694b33d7c5/src/util.js#L209
}

function _test_encode_decode() {
  const x = '你好，世界！看看这头牛: 🐄' // hello world! check out this cow: 🐄
  const y = 'string w/ code points <=255 only!'
  check(
    () => decode(encode(x)) == x,
    () => decode(encode(x), 'base64') == x,
    () => decode(encode(x, 'base64')) == x,
    () => decode(encode(x, 'base64'), 'base64') == x,
    () => decode(encode(x, 'utf8'), 'utf8') == x,
    () => decode(encode(x, 'utf8_array'), 'utf8_array') == x,
    // check utf8 equivalent to utf8_array+String.fromCharCode
    () => encode(x, 'utf8') == String.fromCharCode(...encode(x, 'utf8_array')),
    () => throws(() => encode(x, 'byte_array')), // contains code points >255
    () => decode(encode(y, 'byte_array'), 'byte_array') == y
  )
}

// associate test w/ documented functions
const _test_encode_decode_functions = ['encode', 'decode']

function _benchmark_encode_decode() {
  const x = '你好，世界！看看这头牛: 🐄' // hello world! check out this cow: 🐄
  const y = 'string w/ code points <=255 only!'
  benchmark(
    () => decode(encode(x, 'base64'), 'base64'),
    () => decode(encode(x, 'utf8'), 'utf8'),
    () => decode(encode(x, 'utf8_array'), 'utf8_array'),
    // benchmark utf8 vs utf8_array+String.fromCharCode
    () => encode(x, 'utf8'),
    () => String.fromCharCode.apply(null, encode(x, 'utf8_array')),
    () => String.fromCharCode(...encode(x, 'utf8_array')),
    () => decode(encode(y, 'byte_array'), 'byte_array'),
    () => encode(y, 'byte_array'), // for comparison to Uint8Array.from
    () => Uint8Array.from(y, c => c.charCodeAt(0))
  )
}

// associate benchmark w/ documented functions
const _benchmark_encode_decode_functions = ['encode', 'decode']

// byte_stringify(buffer|view)
// convert `ArrayBuffer` or [view](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/isView) to _byte string_
// _byte strings_ (a.k.a. "binary") encode 8-bit binary numbers using [code points](https://en.wikipedia.org/wiki/Code_point) ≤255
// in contrast, regular strings in `js` encode [unicode characters](https://en.wikipedia.org/wiki/List_of_Unicode_characters) in [UTF-16](https://en.wikipedia.org/wiki/UTF-16)
const byte_stringify = window._byte_stringify

function _test_byte_stringify() {
  const x = new Uint8Array([0, 1, 2, 10, 16, 255])
  check(
    () => [encode(byte_stringify(x), 'byte_array'), x],
    () => [byte_stringify(x), String.fromCharCode(...x)]
  )
}

function _benchmark_byte_stringify() {
  const short = new Uint8Array([0, 1, 2, 10, 16, 255])
  const long = encode(
    byte_stringify(new Uint8Array([0, 1, 2, 10, 16, 255])).repeat(100),
    'byte_array'
  )
  benchmark(
    () => byte_stringify(short),
    () => String.fromCharCode(...short),
    () => copy(short, c => String.fromCharCode(c)).join(''),
    () => byte_stringify(long),
    () => String.fromCharCode(...long),
    () => copy(long, c => String.fromCharCode(c)).join('')
  )
}

// hex_stringify(buffer|view)
// convert `ArrayBuffer` or [view](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/isView) to _hex string_
// each byte is 0-padded to 2 digits, e.g. `[0,255]` → `00ff`
const hex_stringify = x =>
  copy(new Uint8Array(x), b => b.toString(16).padStart(2, '0')).join('')

function _test_hex_stringify() {
  const x = new Uint8Array([1, 2, 10, 16, 255])
  check(
    () => [hex_stringify(new Uint8Array([])), ''],
    () => [hex_stringify(new Uint8Array([0])), '00'],
    () => [
      hex_stringify(new Uint8Array([0, 1, 2, 10, 16, 255])),
      '0001020a10ff',
    ],
    () => [hex_stringify(new Uint8Array([256, 257])), '0001']
  )
}
