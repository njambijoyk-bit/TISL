import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Language preference (storefront).
 *
 * The chosen language is persisted under 'language-storage' and sent as
 * X-Locale on every request (api/axios.js). NOTE: this stores the *preference*
 * and the plumbing — it does not yet translate the UI. Wiring real translations
 * (an i18n layer + string catalogues) is a separate task; until then changing
 * the language only records the choice.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English',   native: 'English' },
  { code: 'sw', label: 'Swahili',   native: 'Kiswahili' },
  { code: 'fr', label: 'French',    native: 'Français' },
  { code: 'ar', label: 'Arabic',    native: 'العربية' },
];

const useLanguageStore = create(
  persist(
    (set, get) => ({
      current: 'en',

      languages: LANGUAGES,

      active: () => LANGUAGES.find((l) => l.code === get().current) || LANGUAGES[0],

      setLanguage: (code) => {
        if (LANGUAGES.some((l) => l.code === code)) set({ current: code });
      },
    }),
    {
      name: 'language-storage',
      partialize: (s) => ({ current: s.current }),
    }
  )
);

export default useLanguageStore;
