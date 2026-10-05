// src/lib/e2ee.js
// CIRVY E2EE
// ECDH P-256 + AES-GCM 256
// Private key: IndexedDB only
// Public key: Supabase user_keys

import { supabase } from '@/lib/supabase'

const DB_NAME = 'cirvy_e2ee'
const DB_VERSION = 1
const STORE_NAME = 'private_keys'

const sharedKeyCache = new Map()

// -----------------------------------------------------------------------------
// IndexedDB
// -----------------------------------------------------------------------------

function openKeyDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(
        new Error(
          'IndexedDB is not supported'
        )
      )
      return
    }

    const request = indexedDB.open(
      DB_NAME,
      DB_VERSION
    )

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      if (
        !db.objectStoreNames.contains(
          STORE_NAME
        )
      ) {
        db.createObjectStore(
          STORE_NAME
        )
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(
        request.error ||
          new Error(
            'Failed to open IndexedDB'
          )
      )
    }
  })
}

export async function getStoredPrivateKey(
  userId
) {
  if (!userId) return null

  const db = await openKeyDB()

  return await new Promise(
    (resolve, reject) => {
      const tx = db.transaction(
        STORE_NAME,
        'readonly'
      )

      const store =
        tx.objectStore(STORE_NAME)

      const request =
        store.get(userId)

      request.onsuccess = () => {
        resolve(
          request.result || null
        )
      }

      request.onerror = () => {
        reject(
          request.error ||
            new Error(
              'Failed to read private key'
            )
        )
      }
    }
  )
}

export async function storePrivateKey(
  userId,
  keyJwk
) {
  if (!userId || !keyJwk) {
    throw new Error(
      'Missing userId or private key'
    )
  }

  const db = await openKeyDB()

  return await new Promise(
    (resolve, reject) => {
      const tx = db.transaction(
        STORE_NAME,
        'readwrite'
      )

      const store =
        tx.objectStore(STORE_NAME)

      const request = store.put(
        keyJwk,
        userId
      )

      request.onsuccess = () => {
        resolve()
      }

      request.onerror = () => {
        reject(
          request.error ||
            new Error(
              'Failed to store private key'
            )
        )
      }
    }
  )
}

// -----------------------------------------------------------------------------
// Base64
// -----------------------------------------------------------------------------

export function arrayBufferToBase64(
  buffer
) {
  const bytes = new Uint8Array(buffer)

  let binary = ''

  for (
    let i = 0;
    i < bytes.length;
    i++
  ) {
    binary += String.fromCharCode(
      bytes[i]
    )
  }

  return window.btoa(binary)
}

export function base64ToArrayBuffer(
  base64
) {
  const binary =
    window.atob(base64)

  const bytes = new Uint8Array(
    binary.length
  )

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i)
  }

  return bytes.buffer
}

// -----------------------------------------------------------------------------
// Generate key pair
// -----------------------------------------------------------------------------

export async function generateAndStoreKeyPair(
  userId
) {
  if (!userId) {
    throw new Error(
      'Missing user ID'
    )
  }

  if (!window.crypto?.subtle) {
    throw new Error(
      'Web Crypto API is not available'
    )
  }

  console.log(
    '[E2EE] Generating new key pair for:',
    userId
  )

  const keyPair =
    await window.crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      [
        'deriveKey',
        'deriveBits',
      ]
    )

  const privateKeyJwk =
    await window.crypto.subtle.exportKey(
      'jwk',
      keyPair.privateKey
    )

  const publicKeyJwk =
    await window.crypto.subtle.exportKey(
      'jwk',
      keyPair.publicKey
    )

  await storePrivateKey(
    userId,
    privateKeyJwk
  )

  const publicKeyStr =
    JSON.stringify(publicKeyJwk)

  console.log(
    '[E2EE] Publishing public key...'
  )

  const { error } =
    await supabase
      .from('user_keys')
      .upsert(
        {
          user_id: userId,
          public_key:
            publicKeyStr,
        },
        {
          onConflict:
            'user_id',
        }
      )

  if (error) {
    console.error(
      '[E2EE] Failed to publish public key:',
      error
    )

    throw new Error(
      `Could not publish encryption key: ${error.message}`
    )
  }

  console.log(
    '[E2EE] Public key published successfully'
  )

  return {
    privateKeyJwk,
    publicKeyStr,
  }
}

// -----------------------------------------------------------------------------
// Ensure current user has keys
// -----------------------------------------------------------------------------

export async function ensureUserKeys(
  userId
) {
  if (!userId) {
    throw new Error(
      'Missing user ID'
    )
  }

  console.log(
    '[E2EE] Ensuring keys for:',
    userId
  )

  const privateKeyJwk =
    await getStoredPrivateKey(
      userId
    )

  // ---------------------------------------------------------------------------
  // No local private key
  // ---------------------------------------------------------------------------

  if (!privateKeyJwk) {
    console.log(
      '[E2EE] No local private key. Generating...'
    )

    const generated =
      await generateAndStoreKeyPair(
        userId
      )

    return generated.privateKeyJwk
  }

  console.log(
    '[E2EE] Local private key found'
  )

  if (
    !privateKeyJwk.x ||
    !privateKeyJwk.y ||
    !privateKeyJwk.crv
  ) {
    throw new Error(
      'Stored private key is missing public key parameters'
    )
  }

  const publicKeyJwk = {
    kty: 'EC',
    crv: privateKeyJwk.crv,
    x: privateKeyJwk.x,
    y: privateKeyJwk.y,
    ext: true,
  }

  const publicKeyStr =
    JSON.stringify(
      publicKeyJwk
    )

  // ---------------------------------------------------------------------------
  // IMPORTANT:
  //
  // Before this version we always upserted the public key.
  //
  // That generated UPDATE events every time the chat initialized and caused
  // the friend-key realtime listener to repeatedly refresh the key.
  //
  // Now we first compare the existing key.
  // If it is already identical, NOTHING is written.
  // ---------------------------------------------------------------------------

  const {
    data: existingKey,
    error: existingKeyError,
  } = await supabase
    .from('user_keys')
    .select('public_key')
    .eq('user_id', userId)
    .maybeSingle()

  if (existingKeyError) {
    console.error(
      '[E2EE] Failed to check existing public key:',
      existingKeyError
    )

    throw new Error(
      `Could not verify encryption key: ${existingKeyError.message}`
    )
  }

  if (
    existingKey?.public_key ===
    publicKeyStr
  ) {
    console.log(
      '[E2EE] Public key already up to date'
    )

    return privateKeyJwk
  }

  // ---------------------------------------------------------------------------
  // Only publish if missing or different.
  // ---------------------------------------------------------------------------

  console.log(
    '[E2EE] Publishing public key because it is missing or changed...'
  )

  const { error } =
    await supabase
      .from('user_keys')
      .upsert(
        {
          user_id: userId,
          public_key:
            publicKeyStr,
        },
        {
          onConflict:
            'user_id',
        }
      )

  if (error) {
    console.error(
      '[E2EE] Public key upsert failed:',
      error
    )

    throw new Error(
      `Could not publish encryption key: ${error.message}`
    )
  }

  console.log(
    '[E2EE] Public key is now available in Supabase'
  )

  return privateKeyJwk
}

// -----------------------------------------------------------------------------
// Get friend's public key
// -----------------------------------------------------------------------------

export async function getPublicKey(
  userId
) {
  if (!userId) {
    throw new Error(
      'Missing user ID'
    )
  }

  const {
    data,
    error,
  } = await supabase
    .from('user_keys')
    .select('public_key')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error(
      '[E2EE] Failed to read public key:',
      error
    )

    throw new Error(
      `Could not read encryption key: ${error.message}`
    )
  }

  return (
    data?.public_key || null
  )
}

// -----------------------------------------------------------------------------
// Shared ECDH key
// -----------------------------------------------------------------------------

export async function getSharedKey(
  userId,
  userPrivateKeyJwk,
  contactPublicKeyStr
) {
  if (
    !userId ||
    !userPrivateKeyJwk ||
    !contactPublicKeyStr
  ) {
    return null
  }

  const cacheKey =
    `${userId}:${typeof contactPublicKeyStr === 'string'
      ? contactPublicKeyStr
      : JSON.stringify(
          contactPublicKeyStr
        )}`

  if (
    sharedKeyCache.has(
      cacheKey
    )
  ) {
    return sharedKeyCache.get(
      cacheKey
    )
  }

  try {
    const contactPublicKeyJwk =
      typeof contactPublicKeyStr ===
      'string'
        ? JSON.parse(
            contactPublicKeyStr
          )
        : contactPublicKeyStr

    const userPrivateKey =
      await window.crypto.subtle.importKey(
        'jwk',
        userPrivateKeyJwk,
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        false,
        ['deriveKey']
      )

    const contactPublicKey =
      await window.crypto.subtle.importKey(
        'jwk',
        contactPublicKeyJwk,
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        false,
        []
      )

    const sharedKey =
      await window.crypto.subtle.deriveKey(
        {
          name: 'ECDH',
          public:
            contactPublicKey,
        },
        userPrivateKey,
        {
          name: 'AES-GCM',
          length: 256,
        },
        false,
        [
          'encrypt',
          'decrypt',
        ]
      )

    sharedKeyCache.set(
      cacheKey,
      sharedKey
    )

    return sharedKey
  } catch (error) {
    console.error(
      '[E2EE] Failed to derive shared key:',
      error
    )

    return null
  }
}

// -----------------------------------------------------------------------------
// Text encryption
// -----------------------------------------------------------------------------

export async function encryptMessage(
  sharedKey,
  plainText
) {
  if (!sharedKey) {
    throw new Error(
      'Missing shared encryption key'
    )
  }

  const iv =
    window.crypto.getRandomValues(
      new Uint8Array(12)
    )

  const encoded =
    new TextEncoder().encode(
      plainText
    )

  const ciphertextBuffer =
    await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      sharedKey,
      encoded
    )

  return {
    ciphertext:
      arrayBufferToBase64(
        ciphertextBuffer
      ),

    iv:
      arrayBufferToBase64(iv),
  }
}

// -----------------------------------------------------------------------------
// Text decryption
// -----------------------------------------------------------------------------

export async function decryptMessage(
  sharedKey,
  ciphertextBase64,
  ivBase64
) {
  if (!sharedKey) {
    return '[Encrypted message]'
  }

  try {
    const ciphertext =
      base64ToArrayBuffer(
        ciphertextBase64
      )

    const iv =
      base64ToArrayBuffer(
        ivBase64
      )

    const decryptedBuffer =
      await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(iv),
        },
        sharedKey,
        ciphertext
      )

    return new TextDecoder().decode(
      decryptedBuffer
    )
  } catch (error) {
    console.warn(
      '[E2EE] Decryption failed:',
      error
    )

    return '[Decryption failed]'
  }
}

// -----------------------------------------------------------------------------
// Cache
// -----------------------------------------------------------------------------

export function clearSharedKeyCache() {
  sharedKeyCache.clear()
}