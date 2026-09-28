import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import locationsAPI from '../api/locations';

/**
 * The branch in context for the storefront (multi-location).
 *
 * `currentId` is persisted under 'location-storage'; api/axios.js reads it and
 * sends X-Location on every request, so prices/availability come back scoped to
 * the chosen branch. A single-branch business has one location and no picker.
 */
const useLocationStore = create(
  persist(
    (set, get) => ({
      locations: [],       // active branches: { id, name, code, city, country, currency, is_default }
      currentId: null,     // chosen branch id (null → resolve default)
      loaded: false,

      /** True once there's more than one branch (drives the header picker). */
      isMultiBranch: () => get().locations.length > 1,

      current: () => {
        const { locations, currentId } = get();
        return locations.find((l) => l.id === currentId)
          || locations.find((l) => l.is_default)
          || locations[0]
          || null;
      },

      fetch: async () => {
        try {
          const { locations = [] } = await locationsAPI.getPublic();
          const { currentId } = get();
          // Drop a persisted id that no longer exists; else keep it.
          const stillValid = locations.some((l) => l.id === currentId);
          const fallback = locations.find((l) => l.is_default)?.id || locations[0]?.id || null;
          set({ locations, currentId: stillValid ? currentId : fallback, loaded: true });
        } catch {
          set({ loaded: true });
        }
      },

      /** Pick a branch. Caller should refetch whatever list is on screen. */
      setLocation: (id) => set({ currentId: id || null }),
    }),
    {
      name: 'location-storage',
      partialize: (s) => ({ currentId: s.currentId }),
    }
  )
);

export default useLocationStore;
