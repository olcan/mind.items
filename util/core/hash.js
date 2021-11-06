// TODO: refine these, add tests and benchmarks
// TODO: use these in pusher/updater/etc once fully tested
// TODO: is utf8_array->string faster/slower than encode_utf8 direct?

// hash (x, ⋯▼⋯ ) \n [stringifier=stringify] \n [hasher=_hash_64_fmv1a]
// hashes `x` using `stringifier`, `hasher`
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
function hash(str, stringifier = stringify, hasher = _hash_64_fnv1a) {
  return window._hash(str, stringifier, hasher) // provided by mindpage
}

// encode_utf8(string)
// encodes string (utf-16) to utf-8 string
const encode_utf8 = window._encode_utf8

// decode_utf8(utf8_string)
// decodes string (utf-16) from utf-8 string
const decode_utf8 = window._decode_utf8

// encode_utf8_array(string)
// encodes string (utf-16) to utf-8 array (`Uint8Array`)
const encode_utf8_array = window._encode_utf8_array

// decode_utf8_array(utf8_array)
// decodes string (utf-16) from utf-8 array (`Uint8Array`)
const decode_utf8_array = window._decode_utf8_array

// encode_base64(string)
// encodes string (utf-16) to base64 (ascii) string
const encode_base64 = window._encode_base64

// decode_base64(base64_string)
// decodes string (utf-16) from base64 (ascii) string
const decode_base64 = window._decode_base64
