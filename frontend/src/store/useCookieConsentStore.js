import { create } from 'zustand';

const STORAGE_KEY = 'tisl_cookie_consent';

const useCookieConsentStore = create((set) => ({
    // 'accepted' | 'declined' | null (null = not yet decided)
    consent: localStorage.getItem(STORAGE_KEY) ?? null,

    setConsent: (value) => {
        localStorage.setItem(STORAGE_KEY, value);
        set({ consent: value });
    },

    clearConsent: () => {
        localStorage.removeItem(STORAGE_KEY);
        set({ consent: null });
    },
}));

export default useCookieConsentStore;