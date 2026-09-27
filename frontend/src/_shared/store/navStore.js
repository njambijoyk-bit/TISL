import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import navigationAPI from '../api/navigation';

/**
 * The storefront links a customer should see. The server already filters by
 * active module + admin visibility, so the header just renders what's here.
 * Persisted so the right links show on first paint; before the first fetch
 * resolves the header treats its known links as visible (optimistic).
 */
const useNavStore = create(
  persist(
    (set) => ({
      links: [],      // [{ key, label, path }]
      loaded: false,

      fetch: async () => {
        try {
          const { links = [] } = await navigationAPI.getPublic();
          set({ links, loaded: true });
        } catch {
          set({ loaded: true });
        }
      },
    }),
    {
      name: 'nav-storage',
      partialize: (s) => ({ links: s.links, loaded: s.loaded }),
    }
  )
);

export default useNavStore;
