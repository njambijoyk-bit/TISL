import axios from 'axios';

/**
 * What a browser needs to talk to the API when the sign-in lives in a protected cookie:
 *  - send the cookie with every request (withCredentials);
 *  - echo the session's CSRF code (learned at sign-in, kept in the page's storage; it is not a password: alone it signs no one in) on every change;
 *  - if the server says the code is out of date (419), fetch a fresh one and try the change once more.
 * Used by the main client and the job applicants' client, each with its own key and its own "who am I" address.
 */
export function attachSession(instance, { csrfKey, meUrl, bearerKey }) {
  const unsafe = (m) => !['get', 'head', 'options'].includes(String(m || 'get').toLowerCase());

  instance.interceptors.request.use((config) => {
    config.withCredentials = true;
    const bearer = bearerKey && localStorage.getItem(bearerKey);
    // a server with cookie sessions switched off hands over the code itself; the page then keeps and sends it as before
    if (bearer && bearer !== 'cookie') config.headers.Authorization = `Bearer ${bearer}`;
    const csrf = localStorage.getItem(csrfKey);
    if (csrf && unsafe(config.method)) config.headers['X-CSRF-Token'] = csrf;
    return config;
  });

  instance.interceptors.response.use(undefined, async (error) => {
    const cfg = error.config;
    if (error.response?.status === 419 && error.response?.data?.csrf && cfg && !cfg._csrfRetried) {
      try {
        const me = await axios.get(meUrl, { baseURL: cfg.baseURL, withCredentials: true, headers: { Accept: 'application/json' } });
        const fresh = me.data?.csrf;
        if (fresh) {
          localStorage.setItem(csrfKey, fresh);
          cfg._csrfRetried = true;
          cfg.headers = { ...(cfg.headers?.toJSON ? cfg.headers.toJSON() : cfg.headers), 'X-CSRF-Token': fresh };
          return axios.request(cfg);
        }
      } catch { /* the session really is gone: fall through to the original refusal */ }
    }
    return Promise.reject(error);
  });
}

export const MAIN_CSRF_KEY = 'csrf-token';
const MODE_KEY = 'session-mode';   // 'cookie' (the server keeps the sign-in) or 'bearer' (cookie sessions switched off: the page keeps the code)

/** Remember which way this browser signed in. */
export const setSessionMode = (token) => localStorage.setItem(MODE_KEY, token ? 'bearer' : 'cookie');

/**
 * A browser that signed in before cookie sessions existed still holds the sign-in code in its storage, where any script on the page could read it. It is dropped once, here,
 * and the person signs in again (this time into a cookie). A browser that signed in the new way (mode set) is left alone.
 */
export function dropLegacySession() {
  try {
    if (localStorage.getItem('token') && !localStorage.getItem(MODE_KEY)) {
      localStorage.removeItem('token');
      localStorage.removeItem('auth-storage');
    }
    const applicant = localStorage.getItem('applicant_token');   // job applicants: the same, with their own keys
    if (applicant && applicant !== 'cookie' && localStorage.getItem('applicant_mode') !== 'bearer') {
      localStorage.removeItem('applicant_token');
    }
    const raw = JSON.parse(localStorage.getItem('auth-storage') || 'null');
    if (raw?.state && 'token' in raw.state && localStorage.getItem(MODE_KEY) !== 'bearer') {
      delete raw.state.token;
      localStorage.setItem('auth-storage', JSON.stringify(raw));
    }
  } catch { /* storage unavailable or damaged: nothing to drop */ }
}
export const getCsrf = () => localStorage.getItem(MAIN_CSRF_KEY);
export const setCsrf = (code) => (code ? localStorage.setItem(MAIN_CSRF_KEY, code) : localStorage.removeItem(MAIN_CSRF_KEY));
