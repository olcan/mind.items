// TODO: refine these, add tests and benchmarks
// TODO: use these in pusher/updater/etc once fully tested

// hash(str, [algo='djb2x'])
// hash `str` using `algo`
// integer for ≤52-bit algos
// hex string for >52-bit algos
// || __bits__ | __algorithm__
// | `djb2x`           | 32   | [djb2 xor](http://www.cse.yorku.ca/~oz/hash.html)
// | `fnv1a`           | 32   | [fnv-1a](https://en.wikipedia.org/wiki/Fowler–Noll–Vo_hash_function)
// | `fnv1a_52`        | 52   | fnv-1a 52-bit
// | `murmur3`         | 32   | [murmur v3](https://en.wikipedia.org/wiki/MurmurHash)
// | `murmur3_128`     | 128  | murmur v3 128-bit
// | `murmur3_128_x64` | 128  | murmur v3 128-bit x64
// | `sha1`            | 160  | [secure hash algo 1](https://en.wikipedia.org/wiki/SHA-1)
function hash(str, algo = 'djb2x') {
  switch (algo) {
    case 'djb2x':
      let h = 5381
      for (let i = 0; i < str.length; i++) h = (h * 33) ^ x.charCodeAt(i)
      return h >>> 0
    case 'fnv1a':
      // _hash32_1a_fast from https://github.com/tjwebb/fnv-plus/blob/1e2ce68a07cb7dd4c3c85364f3d8d96c95919474/index.js#L179
      var i,
        l = str.length - 3,
        t0 = 0,
        v0 = 0x9dc5,
        t1 = 0,
        v1 = 0x811c

      for (i = 0; i < l; ) {
        v0 ^= str.charCodeAt(i++)
        t0 = v0 * 403
        t1 = v1 * 403
        t1 += v0 << 8
        v1 = (t1 + (t0 >>> 16)) & 65535
        v0 = t0 & 65535
        v0 ^= str.charCodeAt(i++)
        t0 = v0 * 403
        t1 = v1 * 403
        t1 += v0 << 8
        v1 = (t1 + (t0 >>> 16)) & 65535
        v0 = t0 & 65535
        v0 ^= str.charCodeAt(i++)
        t0 = v0 * 403
        t1 = v1 * 403
        t1 += v0 << 8
        v1 = (t1 + (t0 >>> 16)) & 65535
        v0 = t0 & 65535
        v0 ^= str.charCodeAt(i++)
        t0 = v0 * 403
        t1 = v1 * 403
        t1 += v0 << 8
        v1 = (t1 + (t0 >>> 16)) & 65535
        v0 = t0 & 65535
      }

      while (i < l + 3) {
        v0 ^= str.charCodeAt(i++)
        t0 = v0 * 403
        t1 = v1 * 403
        t1 += v0 << 8
        v1 = (t1 + (t0 >>> 16)) & 65535
        v0 = t0 & 65535
      }

      return ((v1 << 16) >>> 0) + v0
    case 'fnv1a_52':
      // _hash52_1a_fast from https://github.com/tjwebb/fnv-plus/blob/1e2ce68a07cb7dd4c3c85364f3d8d96c95919474/index.js#L245
      var i,
        l = str.length - 3,
        t0 = 0,
        v0 = 0x2325,
        t1 = 0,
        v1 = 0x8422,
        t2 = 0,
        v2 = 0x9ce4,
        t3 = 0,
        v3 = 0xcbf2

      for (i = 0; i < l; ) {
        v0 ^= str.charCodeAt(i++)
        t0 = v0 * 435
        t1 = v1 * 435
        t2 = v2 * 435
        t3 = v3 * 435
        t2 += v0 << 8
        t3 += v1 << 8
        t1 += t0 >>> 16
        v0 = t0 & 65535
        t2 += t1 >>> 16
        v1 = t1 & 65535
        v3 = (t3 + (t2 >>> 16)) & 65535
        v2 = t2 & 65535
        v0 ^= str.charCodeAt(i++)
        t0 = v0 * 435
        t1 = v1 * 435
        t2 = v2 * 435
        t3 = v3 * 435
        t2 += v0 << 8
        t3 += v1 << 8
        t1 += t0 >>> 16
        v0 = t0 & 65535
        t2 += t1 >>> 16
        v1 = t1 & 65535
        v3 = (t3 + (t2 >>> 16)) & 65535
        v2 = t2 & 65535
        v0 ^= str.charCodeAt(i++)
        t0 = v0 * 435
        t1 = v1 * 435
        t2 = v2 * 435
        t3 = v3 * 435
        t2 += v0 << 8
        t3 += v1 << 8
        t1 += t0 >>> 16
        v0 = t0 & 65535
        t2 += t1 >>> 16
        v1 = t1 & 65535
        v3 = (t3 + (t2 >>> 16)) & 65535
        v2 = t2 & 65535
        v0 ^= str.charCodeAt(i++)
        t0 = v0 * 435
        t1 = v1 * 435
        t2 = v2 * 435
        t3 = v3 * 435
        t2 += v0 << 8
        t3 += v1 << 8
        t1 += t0 >>> 16
        v0 = t0 & 65535
        t2 += t1 >>> 16
        v1 = t1 & 65535
        v3 = (t3 + (t2 >>> 16)) & 65535
        v2 = t2 & 65535
      }

      while (i < l + 3) {
        v0 ^= str.charCodeAt(i++)
        t0 = v0 * 435
        t1 = v1 * 435
        t2 = v2 * 435
        t3 = v3 * 435
        t2 += v0 << 8
        t3 += v1 << 8
        t1 += t0 >>> 16
        v0 = t0 & 65535
        t2 += t1 >>> 16
        v1 = t1 & 65535
        v3 = (t3 + (t2 >>> 16)) & 65535
        v2 = t2 & 65535
      }

      return (
        (v3 & 15) * 281474976710656 +
        v2 * 4294967296 +
        v1 * 65536 +
        (v0 ^ (v3 >> 4))
      )
    case 'murmur3':
      // https://github.com/pid/murmurHash3js
      return murmur3.x86.hash32(str)
    case 'murmur3_128':
      return murmur3.x86.hash128(str)
    case 'murmur3_128_x64':
      return murmur3.x64.hash128(str)
    case 'sha1':
      // https://github.com/emn178/js-sha1
      return sha1(str)
    default:
      throw new Error(`unknown hash algorithm: ${algo}`)
  }
}

// encode `str` (utf-16) into base64
function encode_base64(str) {
  // https://stackoverflow.com/a/30106551
  // unicode -> percent-encoding -> bytestream
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m, c) =>
      String.fromCharCode('0x' + c)
    )
  )
}

// decode `base64` into utf-16 string
function decode_base64(base64) {
  // https://stackoverflow.com/a/30106551
  // bytestream -> percent-encoding -> unicode
  return decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  )
}
