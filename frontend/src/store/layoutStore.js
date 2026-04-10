import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * layoutStore
 * Persists the user's preferred view mode ('large' | 'collapsed')
 * for the Products and Services pages — same pattern as themeStore.
 */
const useLayoutStore = create(
  persist(
    (set) => ({
      productsView: 'large',    // 'large' | 'collapsed'
      servicesView: 'large',    // 'large' | 'collapsed'

      setProductsView: (view) => set({ productsView: view }),
      setServicesView: (view) => set({ servicesView: view }),
    }),
    {
      name: 'layout-storage',   // localStorage key
    }
  )
);

export default useLayoutStore;