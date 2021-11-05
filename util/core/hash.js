// TODO: refine these, add tests and benchmarks

function hash(x) {
  if (!defined(x)) return undefined
  if (is_function(x)) x = '' + x
  if (!is_string(x)) x = JSON.stringify(x)
  // from https://github.com/darkskyapp/string-hash/blob/master/index.js
  let hash = 5381 // see https://stackoverflow.com/q/10696223
  let i = x.length
  while (i) hash = (hash * 33) ^ x.charCodeAt(--i)
  return hash >>> 0
}

function hash_sha1(x) {
  if (!defined(x)) return undefined
  if (is_function(x)) x = '' + x
  if (!is_string(x)) x = JSON.stringify(x)
  return sha1(x)
}

// TODO: use these in pusher/updater/etc
// encodes base64 w/ unicode character support (unlike plain btoa)
// from https://stackoverflow.com/a/30106551
const encode_base64 = str =>
  // original string -> percent-encoding -> bytestream
  btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m, p1) =>
      String.fromCharCode('0x' + p1)
    )
  )

// decodes base64 w/ unicode character support (unlike plain atob)
// from https://stackoverflow.com/a/30106551
const decode_base64 = base64 =>
  // bytestream -> percent-encoding -> original string
  decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  )
