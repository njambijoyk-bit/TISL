import passkeysAPI from '../api/passkeys';
import { createPasskey, getPasskey } from './webauthn';

/**
 * The few things a person does with passkeys, each from the first question to the last answer. Where the server needs more proof first, `withProtection` gets it and tries again:
 *  - `proof_needed`: use one of your passkeys now (the device asks for the fingerprint, face or PIN);
 *  - `password_needed`: type your password (this is how the very first passkey is added after some time has passed since signing in).
 */

/** Add this device as a passkey. `password` is only for the very first one, when the sign-in is no longer fresh. */
export async function addPasskey({ name, password } = {}) {
  const q = await passkeysAPI.registerOptions(password ? { current_password: password } : {});
  const credential = await createPasskey(q.options);

  return passkeysAPI.registerVerify({ challenge_id: q.challenge_id, credential, name: name || undefined });
}

/** Show it is really them: answer a question with a passkey they already added. This session is "strong" for the next few minutes. */
export async function proveWithPasskey() {
  const q = await passkeysAPI.proveOptions();
  const credential = await getPasskey(q.options);

  return passkeysAPI.prove({ challenge_id: q.challenge_id, credential });
}

/** Sign in, step one: the device answers the server's question (a window, or with `conditional` quietly from the email field's autofill list). Nothing is sent yet. */
export async function askForPasskey({ conditional = false, signal } = {}) {
  const q = await passkeysAPI.loginOptions();
  const credential = await getPasskey(q.options, { conditional, signal });

  return { challenge_id: q.challenge_id, credential };
}

/** Sign in, step two: hand the device's answer to the server (with the policies the person ticked, as a password sign-in does). */
export const finishPasskeySignIn = (answer, policyAcceptances = []) => passkeysAPI.login({ ...answer, ...(policyAcceptances.length ? { policy_acceptances: policyAcceptances } : {}) });

const reasonOf = (e) => (e?.response?.status === 403 ? e.response?.data?.reason : null);

/**
 * Run `action(password)`; if the server says more proof is needed, get it and run it once more.
 * `askPassword` must resolve to the typed password (or throw to cancel).
 */
export async function withProtection(action, { askPassword } = {}) {
  try {
    return await action();
  } catch (e) {
    const reason = reasonOf(e);
    if (reason === 'proof_needed') {
      await proveWithPasskey();

      return action();
    }
    if (reason === 'password_needed' && askPassword) {
      const password = await askPassword();

      return action(password);
    }
    throw e;
  }
}
