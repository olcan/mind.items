function hash(x, stringifier = str) {
  if (x?._hash) return x._hash
  if (!defined(x)) return undefined
  if (isFunction(x)) return hash_code('' + x)
  if (isString(x)) return hash_code(x)
  return hash_code(stringifier(x))
}

// from https://github.com/darkskyapp/string-hash/blob/master/index.js
function hash_code(str) {
  let hash = 5381 // see https://stackoverflow.com/q/10696223
  let i = str.length
  while (i) hash = (hash * 33) ^ str.charCodeAt(--i)
  return hash >>> 0
}

// encodes base64 w/ unicode character support (unlike plain btoa)
// from https://stackoverflow.com/a/30106551
function utoa(str) {
  // original string -> percent-encoding -> bytestream
  return btoa(
    encodeURIComponent(str).replace(
      /%([0-9A-F]{2})/g,
      function toSolidBytes(match, p1) {
        return String.fromCharCode('0x' + p1)
      }
    )
  )
}

// decodes base64 w/ unicode character support (unlike plain atob)
// from https://stackoverflow.com/a/30106551
function atou(str) {
  // bytestream -> percent-encoding -> original string
  return decodeURIComponent(
    atob(str)
      .split('')
      .map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      })
      .join('')
  )
}
