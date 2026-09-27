import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import navigationAPI from '../api/navigation';

/**
 * Which storefront links the customer should see. The server already filters
 * by active module + admin visibility, so the header just checks membership.
 * Persisted so the correct set shows on first paint; optimistic (show) only
 * until the very first fetch resolves.
 */
const useNavStore = create(
  persist(
    (set, get) => ({
      keys: [],
      loaded: false,

      fetch: async () => {
        try {
          const { links = [] } = await navigationAPI.getPublic();
          set({ keys: links.map((l) => l.key), loaded: true });
        } catch {
          set({ loaded: true });
        }
      },

      has: (key) => {
        const s = get();
        return !s.loaded ? true : s.keys.includes(key);
      },
    }),
    {
      name: 'nav-storage',
      partialize: (s) => ({ keys: s.keys, loaded: s.loaded }),
    }
  )
);

export default useNavStore;
