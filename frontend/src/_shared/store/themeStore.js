import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'system', // 'light', 'dark', or 'system'

      setTheme: (theme) => {
        set({ theme });
        get().applyTheme(theme);
      },

      applyTheme: (theme) => {
        const root = window.document.documentElement;
        
        // Remove existing theme classes
        root.classList.remove('light', 'dark');

        if (theme === 'system') {
          // Use system preference
          const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
          root.classList.add(systemTheme);
        } else {
          // Use selected theme
          root.classList.add(theme);
        }
      },

      initTheme: () => {
        const theme = get().theme;
        get().applyTheme(theme);

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
          if (get().theme === 'system') {
            get().applyTheme('system');
          }
        });
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);

export default useThemeStore;