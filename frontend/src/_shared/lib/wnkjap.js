/**
 * Open a .wnkjap file in the browser. The password and the books never leave this page: the file is decrypted here (WebCrypto) and the result
 * is kept in memory only. Format: docs/WNKJAP_FORMAT.md.
 *
 *   bytes 0-5 "WNKJAP" | 6 version (1) | 7 key derivation (1 = PBKDF2-HMAC-SHA256) | 8-11 rounds (big endian) | 12-27 salt | 28-39 AES-GCM nonce | 40- ciphertext + 16-byte tag
 *   (bytes 0-39 are the associated data). The plaintext is gzip-compressed JSON.
 */
const MIN_ROUNDS = 100000;
const MAX_ROUNDS = 5000000;
const HEADER = 40;

export class WnkjapError extends Error {}

/** @param {ArrayBuffer|Uint8Array} input @param {string} password @returns {Promise<object>} the document inside */
export async function openWnkjap(input, password) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < HEADER + 16 || String.fromCharCode(...bytes.slice(0, 6)) !== 'WNKJAP') throw new WnkjapError('This is not a .wnkjap file.');
  if (bytes[6] !== 1 || bytes[7] !== 1) throw new WnkjapError('This file was made by a newer version and can not be read here.');
  const rounds = new DataView(bytes.buffer, bytes.byteOffset + 8, 4).getUint32(0, false);
  if (rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) throw new WnkjapError('This file is not valid.');

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new WnkjapError('This browser can not decrypt files here (it needs a secure https page).');
  const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes.slice(12, 28), iterations: rounds }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let plain;
  try {
    plain = await subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(28, 40), additionalData: bytes.slice(0, HEADER), tagLength: 128 }, key, bytes.slice(HEADER));
  } catch {
    throw new WnkjapError('Wrong password, or the file was changed.');
  }
  let text;
  try {
    const stream = new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } catch {
    throw new WnkjapError('This file is not valid.');
  }
  let doc;
  try { doc = JSON.parse(text); } catch { throw new WnkjapError('This file is not valid.'); }
  if (doc?.format !== 'wnkjap' || typeof doc.sections !== 'object') throw new WnkjapError('This is not a .wnkjap file.');

  return doc;
}
