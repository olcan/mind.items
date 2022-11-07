const _cloud = _item('$id')

// upload `x`
// | **option**  | | **default**
// | `path`  | upload path | `hash(…)` of uploaded
// |         |             | paths `public/…` are special (see below)
// | `type`  | [MIME](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types) type | inferred from `x` (see below)
// | `force` | force upload?  | `false` | `true` replaces remote & cached value
// | `cache` | cache locally? | `true`  | `false` deletes any cached value
// | `make_public` | make public?  | `false` | ` true` uploads to path `public/…`
// all uploads are encrypted & private, _except under path_ `public/…`
// authentication _does not apply_ to downloads via url (see `get_url`)
// encryption ensures privacy even if download url is leaked
// uploads to `public/…` are unencrypted & readable by anyone
// default `type` is inferred from `x`:
// | string        | `text/plain` <font style="font-size:80%">(UTF-8 encoded)</font>
// | JSON value    | `application/json` <font style="font-size:80%">(JSON-stringified, UTF-8 encoded)</font>
// | Blob          | `Blob.type` <font style="font-size:80%">(treated as `ArrayBuffer`)</font>
// | `ArrayBuffer` & [views](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/isView) | `application/octet-stream`
// JSON value types are plain object, array, number, or boolean
// returns upload path as specified or computed (via hash)
async function upload(x, options = undefined) {
  let {
    path,
    type,
    force = false,
    cache = true,
    make_public = false,
  } = options ?? {}
  if (!cache) delete _cloud.store.cache?.[path] // disable any existing cache
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
  if (make_public) {
    if (!path.startsWith('public/')) path = 'public/' + path
  } else if (path.startsWith('public/'))
    fatal(`upload to path '${path}' requires option make_public:true`)

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
  _cloud.store.cache ??= {}
  if (cache) _cloud.store.cache[path] = { value: x, type, size: cipher.length }
  else delete _cloud.store.cache[path]
  return path
}

// download from `path`
// | **option**  | | **default**
// | `type`  | [MIME](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types) type | specified on upload
// | `force`   | force download?   | `false` | `true` replaces any cached value
// | `use_url` | use download url? | `false` | `true` uses download url
// return value depends on [MIME](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types) type:
// | `text/*`                   | string <font style="font-size:80%">(UTF-8 decoded)</font>
// | `application/json`         | JSON value <font style="font-size:80%">(UTF-8 decoded, JSON-parsed)</font>
// | other                      | byte array (`Uint8Array`)
async function download(path, options = undefined) {
  if (!path) fatal('missing path')
  let { type, force = false, use_url = false } = options ?? {}
  if (!force) {
    // skip download if path exists in local cache
    if (_cloud.store.cache?.[path]) {
      const cached = _cloud.store.cache[path]
      console.debug(
        `skipping download for cached ${path} ` +
          `(${cached.type}, ${cached.size} bytes)`
      )
      return cached.value
    }
  }
  const start = Date.now()
  let metadata_time = 0
  // if type is not specified and not using url, we need metadata for type
  // note get_metadata cost is about same as that of get_url
  if (!type && !use_url) {
    const metadata = await get_metadata(path)
    metadata_time = Date.now() - start
    type = metadata.contentType
  }
  const download_start = Date.now()
  let cipher
  if (!use_url) {
    const full_path = abs_path(path)
    const { ref, getStorage, getBytes } = firebase.storage
    const buffer = await getBytes(ref(getStorage(firebase), full_path))
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
        `in ${time}ms (download ${download_time}ms, metadata ${metadata_time}ms)`
    )
  } else {
    console.debug(
      `downloaded ${path} (${type}, ` +
        `${bytes.length} bytes, ${cipher.length} encrypted) ` +
        `in ${time}ms (download ${download_time}ms, decrypt ${decrypt_time}ms, metadata ${metadata_time}ms)`
    )
  }
  let x = bytes
  if (type.startsWith('text/')) x = decode(bytes, 'utf8_array')
  else if (type == 'application/json') x = parse(decode(bytes, 'utf8_array'))
  _cloud.store.cache ??= {}
  _cloud.store.cache[path] = { value: x, type, size: cipher.length }
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
const exists = async path => !!get_metadata(path)
