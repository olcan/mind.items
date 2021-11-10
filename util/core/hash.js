// hash (x,[hasher=_hash_64_fmv1a],[stringifier=stringify])
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
function hash(str, hasher = _hash_64_fnv1a, stringifier = stringify) {
  return window._hash(str, hasher, stringifier) // provided by mindpage
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
// | default ➡ `'base64'`  | [Base64](https://en.wikipedia.org/wiki/Base64) ASCII string
const encode = window._encode

// decode(x,[encoding='base64'])
// decodes string from `x` in `encoding`
// see `encode` for supported encodings
const decode = window._decode

function _test_encode_decode() {
  const x = '你好，世界！看看这头牛: 🐄' // hello world! check out this cow: 🐄
  check(
    () => decode(encode(x)) == x,
    () => decode(encode(x), 'base64') == x,
    () => decode(encode(x, 'base64')) == x,
    () => decode(encode(x, 'base64'), 'base64') == x,
    () => decode(encode(x, 'utf8'), 'utf8') == x,
    () => decode(encode(x, 'utf8_array'), 'utf8_array') == x,
    // check utf8 equivalent to utf8_array+String.fromCharCode
    () => encode(x, 'utf8') == String.fromCharCode(...encode(x, 'utf8_array'))
  )
}

// associate test w/ documented functions
const _test_encode_decode_functions = ['encode', 'decode']

function _benchmark_encode_decode() {
  const x = '你好，世界！看看这头牛: 🐄' // hello world! check out this cow: 🐄
  benchmark(
    () => decode(encode(x, 'base64'), 'base64') == x,
    () => decode(encode(x, 'utf8'), 'utf8') == x,
    () => decode(encode(x, 'utf8_array'), 'utf8_array') == x,
    // benchmark utf8 vs utf8_array+String.fromCharCode
    () => encode(x, 'utf8'),
    () => String.fromCharCode.apply(null, encode(x, 'utf8_array')),
    () => String.fromCharCode(...encode(x, 'utf8_array'))
  )
}

// associate benchmark w/ documented functions
const _benchmark_encode_decode_functions = ['encode', 'decode']
