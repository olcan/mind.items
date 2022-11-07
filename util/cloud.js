const _cloud = _item('$id')

// upload `x`
// | **option**  | | **default**
// | `path`   | upload path | `hash(…)` of uploaded bytes + type
// |          |             | paths `public/…` are special (see below)
// | `type`   | [MIME](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types) type | inferred from `x` (see below)
// | `force`  | force upload?  | `false` | `true` replaces any remote or cached value for `path`
// | `cache`  | cache locally? | `true`  | `false` deletes any cache entry for `path`
// | `public` | make public?   | `false` | ` true` uploads to path `public/…`
// does not replace any existing value at `path` unless `force` is `true`
// all uploads are encrypted & private, _except under path_ `public/…`
// authentication _does not apply_ to downloads via url (see `get_url`)
// encryption ensures privacy even if download url is leaked
// uploads to `public/…` are unencrypted & readable by anyone
// default `type` is inferred from `x`:
// | string        | `text/plain` <font style="font-size:80%">(UTF-8 encoded)</font>
// | JSON value    | `application/json` <font style="font-size:80%">(JSON-stringified, UTF-8 encoded)</font>
// | Blob          | `Blob.type` <font style="font-size:80%">(treated as `ArrayBuffer`)</font>
// | `ArrayBuffer` & [views](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/isView) | `application/octet-stream`
// JSON value types are plain object, array, number, boolean, or null
// returns upload path as specified or computed (via hash)
async function upload(x, options = undefined) {
  if (x === undefined) fatal('missing (or undefined) value for upload')
  let { path, type, force = false, cache = true } = options ?? {}
  if (!cache) delete _cloud.store.cache?.[path] // delete existing cache entry
  let bytes
  // convert blob to ArrayBuffer & use blob type as default type
  if (x instanceof Blob) {
    type ??= x.type
    x = await x.arrayBuffer()
  }
  if (is_string(x)) {
    bytes = encode(x, 'utf8_array')
    type ??= 'text/plain'
  } else if (
    is_array(x) ||
    is_plain_object(x) ||
    is_number(x) ||
    is_boolean(x) ||
    x === null
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
    fatal(`upload not supported for value '${x}'`)
  }
  path ??= hash({ bytes: hash(bytes), type }) // use bytes + type hash as path
  if (options?.public) {
    if (!path.startsWith('public/')) path = 'public/' + path
  } else if (path.startsWith('public/'))
    fatal(`upload to path '${path}' requires option public:true`)

  if (!force) {
    // check local cache for existence
    // note cached value/type/size can differ unless path includes hash
    // note also that value need not exist in cache (can be for existence only)
    const cached = _cloud.store.cache?.[path]
    if (cached) {
      console.debug(
        `skipping upload for cached ${path} ` +
          `(${cached.type}, ${cached.size} bytes)`
      )
      return path
    }
    // check remote metadata for existence
    // cache existence (& type/size) if enabled
    // delete cache entry if path is missing remotely
    const remote = await get_metadata(path)
    if (remote) {
      console.debug(
        `skipping upload for existing ${path} ` +
          `(${remote.contentType}, ${remote.size} bytes)`
      )
      if (cache) {
        _cloud.store.cache ??= {}
        // note cache entry was missing (see above) so this is not a replacement
        _cloud.store.cache[path] = {
          type: remote.contentType,
          size: remote.size,
        }
      }
      return path
    } else delete _cloud.store.cache?.[path] // delete any existing cache entry
  }
  const start = Date.now()
  const encrypt = !path.startsWith('public/')
  let cipher = bytes
  let encrypt_time = -1
  if (encrypt) {
    cipher = await _encrypt_bytes(bytes)
    encrypt_time = Date.now() - start
  }
  const start_upload = Date.now()
  const full_path = abs_path(path)
  const { ref, getStorage, uploadBytes } = firebase.storage
  await uploadBytes(ref(getStorage(firebase), full_path), cipher, {
    contentType: type,
  })
  const upload_time = Date.now() - start_upload
  const time = Date.now() - start
  if (encrypt_time < 0) {
    console.debug(
      `uploaded ${path} (${type}, ` +
        `${bytes.length} bytes, unencrypted) ` +
        `in ${time}ms (upload ${upload_time}ms)`
    )
  } else {
    console.debug(
      `uploaded ${path} (${type}, ` +
        `${bytes.length} bytes, ${cipher.length} encrypted) ` +
        `in ${time}ms (upload ${upload_time}ms, encrypt ${encrypt_time}ms)`
    )
  }
  if (cache) {
    _cloud.store.cache ??= {}
    _cloud.store.cache[path] = { value: x, type, size: cipher.length }
  }
  return path
}

// download from `path`
// | **option**  | | **default**
// | `type`    | [MIME](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types) type | specified on upload
// | `force`   | force download?   | `false` | `true` replaces any cached value for `path`
// | `cache`   | cache locally?    | `true`  | `false` deletes any cache entry for `path`
// | `use_url` | use download url? | `false` | `true` uses download url
// return value depends on [MIME](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types) type:
// | `text/*`                   | string <font style="font-size:80%">(UTF-8 decoded)</font>
// | `application/json`         | JSON value <font style="font-size:80%">(UTF-8 decoded, JSON-parsed)</font>
// | other                      | byte array (`Uint8Array`)
async function download(path, options = undefined) {
  if (!path) fatal('missing path')
  let { type, force = false, cache = true, use_url = false } = options ?? {}
  if (!cache) delete _cloud.store.cache?.[path] // delete existing cache entry
  if (!force) {
    // skip download & return cached value if value exists in local cache
    const cached = _cloud.store.cache?.[path]
    if (cached?.value !== undefined) {
      console.debug(
        `skipping download for cached ${path} ` +
          `(${cached.type}, ${cached.size} bytes)`
      )
      return cached.value
    }
  }
  const start = Date.now()
  const download_start = Date.now()
  let cipher
  if (!use_url) {
    const full_path = abs_path(path)
    const { ref, getStorage, getBlob } = firebase.storage
    const blob = await getBlob(ref(getStorage(firebase), full_path))
    const buffer = await blob.arrayBuffer()
    type ??= blob.type
    cipher = new Uint8Array(buffer)
  } else {
    const url = await get_url(path)
    const response = await fetch(url)
    cipher = new Uint8Array(await response.arrayBuffer())
    type ??= response.headers.get('content-type')
  }
  const download_time = Date.now() - download_start
  const decrypt = !path.startsWith('public/')
  let bytes = cipher
  let decrypt_time = -1
  if (decrypt) {
    const decrypt_start = Date.now()
    bytes = await _decrypt_bytes(cipher)
    decrypt_time = Date.now() - decrypt_start
  }
  const time = Date.now() - start
  if (decrypt_time < 0) {
    console.debug(
      `downloaded ${path} (${type}, ` +
        `${bytes.length} bytes, unencrypted) ` +
        `in ${time}ms (download ${download_time}ms)`
    )
  } else {
    console.debug(
      `downloaded ${path} (${type}, ` +
        `${bytes.length} bytes, ${cipher.length} encrypted) ` +
        `in ${time}ms (download ${download_time}ms, decrypt ${decrypt_time}ms)`
    )
  }
  let x = bytes
  if (type.startsWith('text/')) x = decode(bytes, 'utf8_array')
  else if (type == 'application/json') x = parse(decode(bytes, 'utf8_array'))
  if (cache) {
    _cloud.store.cache ??= {}
    _cloud.store.cache[path] = { value: x, type, size: cipher.length }
  }
  return x
}

// delete upload at `path`
async function delete_upload(path) {
  if (!path) fatal('missing path')
  path = abs_path(path)
  const { ref, getStorage, deleteObject } = firebase.storage
  return await deleteObject(ref(getStorage(firebase), path))
}

// get metadata for `path`
// returns `null` if missing
// logs any other errors
async function get_metadata(path) {
  if (!path) fatal('missing path')
  path = abs_path(path)
  const { ref, getStorage, getMetadata } = firebase.storage
  try {
    return await getMetadata(ref(getStorage(firebase), path))
  } catch (e) {
    if (e.code != 'storage/object-not-found') console.error(e)
    return null
  }
}

// get download url for `path`
// returns `null` if missing
// logs any other errors
// url can be used by _anyone_ (i.e. w/o authentication)
// url includes token that _never expires_ but can be revoked
// url (token) can be revoked by deleting or re-uploading path
async function get_url(path) {
  if (!path) fatal('missing path')
  path = abs_path(path)
  const { ref, getStorage, getDownloadURL } = firebase.storage
  try {
    return await getDownloadURL(ref(getStorage(firebase), path))
  } catch (e) {
    if (e.code != 'storage/object-not-found') console.error(e)
    return null
  }
}

// absolute upload path for `path`
function abs_path(path) {
  if (!path) fatal('missing path')
  return _user.uid + '/uploads/' + path.trimStart('/')
}

// does upload exist at `path`?
// uses local cache if `options.cache` is `true` (default `false`)
// deletes any existing cache entry if `path` is missing
async function exists(path, options = undefined) {
  if (cache && _cloud.store.cache?.[path]) return true // exists in cache
  const remote = await get_metadata(path)
  if (remote) {
    // store existence (& type/size) in cache to avoid repeated remote checks
    if (cache) {
      _cloud.store.cache ??= {}
      // note cache entry was missing (see above) so this is not a replacement
      _cloud.store.cache[path] = {
        type: remote.contentType,
        size: remote.size,
      }
    }
    return true // exists
  }
  delete _cloud.store.cache?.[path] // delete any existing cache entry
  return false // missing
}
