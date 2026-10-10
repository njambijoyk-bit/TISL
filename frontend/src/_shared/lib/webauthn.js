/**
 * The browser's passkey API, wrapped. The server speaks JSON with every binary value as base64url; the browser wants and gives raw bytes. Nothing here decides anything about who may sign in:
 * it only carries the question to the device and the answer back, untouched.
 */

const decode = (text) => {
  const b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

const encode = (buffer) => {
  if (buffer == null) return null;
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const passkeysSupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials?.create;

/** Can the browser offer saved passkeys in the email field's autofill list? */
export async function autofillSupported() {
  try {
    return passkeysSupported() && typeof PublicKeyCredential.isConditionalMediationAvailable === 'function' && (await PublicKeyCredential.isConditionalMediationAvailable());
  } catch {
    return false;
  }
}

const descriptor = (d) => ({ ...d, id: decode(d.id) });

/** What the browser made, as JSON the server can read. */
function credentialToJson(c) {
  const r = c.response;
  const response = { clientDataJSON: encode(r.clientDataJSON) };
  if (r.attestationObject) {
    response.attestationObject = encode(r.attestationObject);
    response.transports = typeof r.getTransports === 'function' ? r.getTransports() : [];
  } else {
    response.authenticatorData = encode(r.authenticatorData);
    response.signature = encode(r.signature);
    response.userHandle = r.userHandle ? encode(r.userHandle) : null;
  }

  return {
    id: c.id, rawId: encode(c.rawId), type: c.type, authenticatorAttachment: c.authenticatorAttachment ?? null, response,
    clientExtensionResults: typeof c.getClientExtensionResults === 'function' ? c.getClientExtensionResults() : {},
  };
}

/** "Add a passkey": ask the device to make one, from the options the server gave. */
export async function createPasskey(options) {
  const publicKey = { ...options, challenge: decode(options.challenge), user: { ...options.user, id: decode(options.user.id) }, excludeCredentials: (options.excludeCredentials ?? []).map(descriptor) };
  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) throw new Error('No passkey was made.');

  return credentialToJson(credential);
}

/**
 * "Sign in" or "prove it is you": ask the device to answer the server's question. With `conditional` the browser offers the passkeys in the email field's autofill list instead of a window,
 * and waits quietly until the person picks one (or `signal` ends it).
 */
export async function getPasskey(options, { conditional = false, signal } = {}) {
  const publicKey = { ...options, challenge: decode(options.challenge), allowCredentials: (options.allowCredentials ?? []).map(descriptor) };
  const credential = await navigator.credentials.get({ publicKey, ...(conditional ? { mediation: 'conditional' } : {}), ...(signal ? { signal } : {}) });
  if (!credential) throw new Error('No passkey was used.');

  return credentialToJson(credential);
}

/** What went wrong, in words a person can use. `cancelled` is true when they simply closed the window (nothing to complain about). */
export function passkeyProblem(error) {
  const name = error?.name;
  const server = error?.response?.data?.message;
  if (server) return { text: server, cancelled: false };
  if (name === 'NotAllowedError') return { text: 'That was cancelled, or it took too long. Try again when you are ready.', cancelled: true };
  if (name === 'AbortError') return { text: '', cancelled: true };
  if (name === 'InvalidStateError') return { text: 'This device already has a passkey for your account.', cancelled: false };
  if (name === 'SecurityError') return { text: 'Your browser would not use a passkey on this address. Make sure you are on the real TISL website.', cancelled: false };
  if (name === 'NotSupportedError') return { text: 'This browser or device can not make this kind of passkey.', cancelled: false };

  return { text: error?.message || 'That did not work. Please try again.', cancelled: false };
}

/** A name to start from, so nobody has to think of one: "Chrome on Windows", "Safari on iPhone". They can change it. */
export function suggestedName(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const system = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux|X11/.test(ua) ? 'Linux' : '';

  return system ? `${browser} on ${system}` : browser;
}
