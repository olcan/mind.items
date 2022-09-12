const _cloud = _item('$id')

// upload `x`
// | `path` | upload path | default is `hash(…)` of uploaded bytes
// | `type` | [MIME](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types) type | default inferred from `x`:
// \
// | string                | `text/plain` (UTF-8 encoded)
// | JSON value type       | `application/json` (JSON-stringified, UTF-8 encoded)
// | `ArrayBuffer` or [views](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/isView) | `application/octet-stream`
// \
// | `force` | force upload?  | default `false` | `true` replaces remote & cached value
// | `cache` | cache locally? | default `true`  | `false` deletes any cached value
// JSON value types are plain object, array, number, or boolean
// returns upload path as specified or computed (via hash)
async function upload(x, options = undefined) {
  let { path, type, force = false, cache = true } = options ?? {}
  if (!cache) delete _cloud.store.cache?.[path] // disable any existing cache
  let bytes
  if (is_string(x)) {
    bytes = encode(x, 'utf8_array')
    type ??= 'text/plain'
  } else if (
    is_array(x) ||
    is_plain_object(x) ||
    is_number(x) ||
    is_boolean(x)
  ) {
    bytes = encode(stringify(x), 'utf8_array')
    type ??= 'application/json'
  } else if (
    x.constructor.name == 'ArrayBuffer' ||
    (ArrayBuffer.isView(x) && x.buffer?.constructor.name == 'ArrayBuffer')
  ) {
    bytes = new Uint8Array(x.buffer ?? x)
    type ??= 'application/octet-stream'
  } else {
    fatal(`can not upload unknown value '${x}'`)
  }
  path ??= hash(bytes) // use hash as path
  if (!force) {
    // check local cache
    if (_cloud.store.cache?.[path]?.type == type) {
      const cached = _cloud.store.cache[path]
      console.debug(
        `skipping upload for cached ${path} ` +
          `(${cached.type}, ${cached.size} bytes)`
      )
      return path
    }
    // check remote metadata
    const metadata = await get_metadata(path)
    if (metadata?.contentType == type) {
      console.debug(
        `skipping upload for existing ${path} ` +
          `(${metadata.contentType}, ${metadata.size} bytes)`
      )
      return path
    }
  }
  const start = Date.now()
  const cipher = await _encrypt_bytes(bytes)
  const encrypt_time = Date.now() - start
  const full_path = _user.uid + '/uploads/' + path.trimStart('/')
  const { ref, getStorage, uploadBytes } = firebase.storage
  const start_upload = Date.now()
  await uploadBytes(ref(getStorage(firebase), full_path), cipher, {
    contentType: type,
  })
  const upload_time = Date.now() - start_upload
  const time = Date.now() - start
  console.debug(
    `uploaded ${path} (${type}, ` +
      `${bytes.length} bytes, ${cipher.length} encrypted) ` +
      `in ${time}ms (upload ${upload_time}ms, encrypt ${encrypt_time}ms)`
  )
  _cloud.store.cache ??= {}
  if (cache) _cloud.store.cache[path] = { value: x, type, size: cipher.length }
  else delete _cloud.store.cache[path]
  return path
}

// download from `path`
// return value depends on [MIME](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types) type
// | `text/plain`               | string (UTF-8 decoded)
// | `application/json`         | JSON value (UTF-8 decoded, JSON-parsed)
// | other                      | byte array (`Uint8Array`)
async function download(path) {
  if (!path) fatal('missing path')
  // skip download if path exists in local cache
  if (_cloud.store.cache?.[path]) {
    const cached = _cloud.store.cache[path]
    console.debug(
      `skipping download for cached ${path} ` +
        `(${cached.type}, ${cached.size} bytes)`
    )
    return cached.value
  }
  const full_path = _user.uid + '/uploads/' + path.trimStart('/')
  const { ref, getStorage, getDownloadURL } = firebase.storage
  const start = Date.now()
  const url = await getDownloadURL(ref(getStorage(firebase), full_path))
  const response = await fetch(url)
  const cipher = new Uint8Array(await response.arrayBuffer())
  const download_time = Date.now() - start
  const decrypt_start = Date.now()
  const bytes = await _decrypt_bytes(cipher)
  const decrypt_time = Date.now() - decrypt_start
  const type = response.headers.get('content-type')
  const time = Date.now() - start
  console.debug(
    `downloaded ${path} (${type}, ` +
      `${bytes.length} bytes, ${cipher.length} encrypted) ` +
      `in ${time}ms (download ${download_time}ms, decrypt ${decrypt_time}ms)`
  )
  let x = bytes
  if (type == 'text/plain') x = decode(bytes, 'utf8_array')
  else if (type == 'application/json') x = parse(decode(bytes, 'utf8_array'))
  _cloud.store.cache ??= {}
  _cloud.store.cache[path] = { value: x, type, size: cipher.length }
  return x
}

// get metadata for `path`
// returns `null` if missing
// logs any other errors
async function get_metadata(path) {
  if (!path) fatal('missing path')
  path = _user.uid + '/uploads/' + path.trimStart('/')
  const { ref, getStorage, getMetadata } = firebase.storage
  try {
    return await getMetadata(ref(getStorage(firebase), path))
  } catch (e) {
    if (e.code != 'storage/object-not-found') console.error(e)
    return null
  }
}

// does `path` exist?
const exists = async path => !!get_metadata(path)
