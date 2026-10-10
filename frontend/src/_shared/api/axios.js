import axios from 'axios';
import { attachSession, dropLegacySession, MAIN_CSRF_KEY } from './sessionKit';

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

// Request interceptor - display currency and branch
api.interceptors.request.use(
  (config) => {

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

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error('Access forbidden');
      // "One more step": the passkey rule holds this sign-in to adding or using a passkey. The gate screen (SecurityGate) listens and covers the page.
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
);

export default api;