import axios from 'axios';
import { attachSession, dropLegacySession, getSignedInId, resyncIdentity, MAIN_CSRF_KEY } from './sessionKit';

dropLegacySession();

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
  headers: {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    'Content-Type': 'application/json',
  },
  withXSRFToken: true,
});

// The sign-in is a protected cookie the page can not read: send it with every request, echo the CSRF code on changes, refresh the code on a 419.
// (With cookie sessions switched off on the server the page keeps the code itself under 'token' and sends it as a header: attachSession covers that too.)
attachSession(api, { csrfKey: MAIN_CSRF_KEY, meUrl: '/auth/me', bearerKey: 'token' });

// The doors a person goes through to sign in, or to be told who they are: the page may be wrong about who is signed in when it uses them, so they are not checked.
const NO_IDENTITY_CHECK = /(^|\/)auth\/(me|login|register|forgot-password|reset-password|force-change-password|seal|secure-account|email-link|passkeys\/(options|login))(\/|\?|$)/;

// Request interceptor - display currency and branch
api.interceptors.request.use(
  (config) => {

    // Who this page believes is signed in: if another account has signed in from another window since, the server stops the request (409) instead of doing it as that other account.
    const who = getSignedInId();
    if (who && !config.headers['X-Expected-User'] && !NO_IDENTITY_CHECK.test(config.url || '')) config.headers['X-Expected-User'] = who;

    // Display currency chosen in the price toggle (persisted by currencyStore).
    // Backend SetDisplayCurrency middleware reads it; unknown codes fall back to base.
    if (!config.headers['X-Currency']) {
      try {
        const code = JSON.parse(localStorage.getItem('currency-storage') || '{}')?.state?.displayCurrency;
        if (code) config.headers['X-Currency'] = code;
      } catch {
        /* corrupted storage — just use base currency */
      }
    }

    // Branch in context chosen in the location picker (persisted by locationStore).
    // Backend SetLocationContext middleware reads it; unknown ids fall back to default.
    if (!config.headers['X-Location']) {
      try {
        const id = JSON.parse(localStorage.getItem('location-storage') || '{}')?.state?.currentId;
        if (id) config.headers['X-Location'] = id;
      } catch {
        /* corrupted storage — just use the default branch */
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {

    // Another account signed in from another window: nothing was done. Catch up with who the server says is signed in and reload.
    if (error.response?.status === 409 && error.response?.data?.code === 'identity_changed') {
      resyncIdentity();
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      // Only redirect to login if we're NOT already on the login page.
      // If we are on login, the failed auth is handled by the form's own catch block.
      const isLoginPage = window.location.pathname === '/login';
      if (!isLoginPage) {
        localStorage.removeItem('token');
        localStorage.removeItem(MAIN_CSRF_KEY);
        localStorage.removeItem('auth-storage');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }

    // A sensitive action the server holds back until the person confirms it ("One more step"): show them the question and, once it is answered, try the very same request again with the answer.
    if (error.response?.status === 403 && error.config && !error.config._stepUpRetried) {
      return readBody(error.response.data).then((body) => {
        if (!body?.step_up) throw error;   // a plain refusal: on to the usual handling below

        return new Promise((resolve, reject) => {
          new Promise((ok, no) => window.dispatchEvent(new CustomEvent('tisl:step-up', { detail: { info: body.step_up, resolve: ok, reject: no } })))
            .then((pending) => {
              const cfg = error.config;
              cfg._stepUpRetried = true;
              cfg.headers = { ...(cfg.headers?.toJSON ? cfg.headers.toJSON() : cfg.headers), 'X-Step-Up': pending };
              resolve(api.request(cfg));
            })
            .catch(() => reject(error));   // they said no: the action simply did not happen, as if it had been refused
        });
      }).catch((e) => (e === error ? finish(error) : Promise.reject(e)));
    }
    return finish(error);
  }
);

/** An error body as an object, even when the request asked for a file (the refusal then arrives as a blob or raw bytes). */
async function readBody(data) {
  try {
    if (typeof Blob !== 'undefined' && data instanceof Blob) return JSON.parse(await data.text());
    if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data));
  } catch { return null; }

  return data && typeof data === 'object' ? data : null;
}

/** What every refusal gets once the one-more-step question (if any) has been dealt with: say so in the console, tell the gate screen, and pass the error on. */
function finish(error) {
  // Handle 403 Forbidden
  if (error.response?.status === 403) {
    console.error('Access forbidden');
    // the passkey rule holds this sign-in to adding or using a passkey: the gate screen (SecurityGate) listens and covers the page
    if (error.response?.data?.restricted) {
      window.dispatchEvent(new CustomEvent('tisl:restricted', { detail: error.response.data.restricted }));
    }
  }

  // Handle 404 Not Found
  if (error.response?.status === 404) {
    console.error('Resource not found');
  }

  // Handle 500 Server Error
  if (error.response?.status === 500) {
    console.error('Server error');
  }
  return Promise.reject(error);
}

export default api;
