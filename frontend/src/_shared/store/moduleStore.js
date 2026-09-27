import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import modulesAPI from '../api/modules';
import { setActiveModules } from '../navigation/modules';

/**
 * Holds the active paid modules the server reports. `isModuleActive` (in
 * navigation/modules.js) reads the snapshot this store keeps, so nav, routes
 * and menus all follow licensing without prop-drilling.
 *
 * The active set is persisted so the first paint after a reload matches the
 * last known state; fetch() refreshes it. On any error we FAIL CLOSED for
 * paid modules (empty active set) — core always stays on — so a network blip
 * never flashes paid features to an unlicensed client.
 */
const useModuleStore = create(
  persist(
    (set, get) => ({
      active: [],        // e.g. ['ecommerce', 'careers']
      verified: false,   // installation ownership verified
      loaded: false,     // first fetch has resolved (success or fail)
      loading: false,

      fetch: async () => {
        if (get().loading) return;
        set({ loading: true });
        try {
          const { active = [], verified = false } = await modulesAPI.getActive();
          setActiveModules(active);
          set({ active, verified, loaded: true, loading: false });
        } catch {
          // Fail closed: no paid modules until we can confirm.
          setActiveModules([]);
          set({ active: [], loaded: true, loading: false });
        }
      },

      // Called after a Module Center change so the UI updates without a reload.
      refresh: async () => {
        set({ loaded: false });
        await get().fetch();
      },
    }),
    {
      name: 'modules-storage',
      partialize: (s) => ({ active: s.active, verified: s.verified }),
      onRehydrateStorage: () => (state) => {
        // Prime the nav snapshot from persisted state on first load.
        if (state?.active) setActiveModules(state.active);
      },
    }
  )
);

export default useModuleStore;
