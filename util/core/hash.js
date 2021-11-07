// hash (x, ⋯▼⋯ ) \n [hasher=_hash_64_fmv1a] \n [stringifier=stringify]
// hashes `x` using `hasher`
// applies `stringifier` to non-string `x`
// uses precomputed `x._hash` if defined
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

// encode_utf8(string)
// encodes string to UTF-8 string
const encode_utf8 = window._encode_utf8

// decode_utf8(utf8_string)
// decodes string from UTF-8 string
const decode_utf8 = window._decode_utf8

// encode_utf8_array(string)
// encodes string to UTF-8 array (`Uint8Array`)
const encode_utf8_array = window._encode_utf8_array

// decode_utf8_array(utf8_array)
// decodes string from UTF-8 array (`Uint8Array`)
const decode_utf8_array = window._decode_utf8_array

// encode_base64(string)
// encodes string to base64 (ASCII) string
const encode_base64 = window._encode_base64

// decode_base64(base64_string)
// decodes string from base64 (ASCII) string
const decode_base64 = window._decode_base64

function _test_encode_decode() {
  const x = '你好，世界！看看这头牛: 🐄' // hello world! check out this cow: 🐄
  check(
    () => decode_utf8(encode_utf8(x)) == x,
    () => decode_utf8_array(encode_utf8_array(x)) == x,
    () => decode_base64(encode_base64(x)) == x
  )
}

function _benchmark_encode_decode() {
  const x = '你好，世界！看看这头牛: 🐄' // hello world! check out this cow: 🐄
  benchmark(
    () => decode_utf8(encode_utf8(x)),
    () => decode_utf8_array(encode_utf8_array(x)),
    () => decode_base64(encode_base64(x))
  )
}

// check encode_utf8 equivalent to encode_utf8_array+String.fromCharCode
function _test_encode_utf8() {
  const x = '你好，世界！看看这头牛: 🐄' // hello world! check out this cow: 🐄
  check(() => encode_utf8(x) == String.fromCharCode(..._encode_utf8_array(x)))
}

// benchmark encode_utf8 vs encode_utf8_array+String.fromCharCode
function _benchmark_encode_utf8() {
  const x = '你好，世界！看看这头牛: 🐄' // hello world! check out this cow: 🐄
  benchmark(
    () => encode_utf8(x),
    () => String.fromCharCode.apply(null, _encode_utf8_array(x)),
    () => String.fromCharCode(..._encode_utf8_array(x))
  )
}
