import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { productsAPI } from '../api';


const useWishlistStore = create(
  persist(
    (set, get) => ({
      ids: [],           // persisted
      items: [],         // derived (not persisted)
      loading: false,
      error: null,

      has: (id) => get().ids.includes(id),

      add: (id) => {
        if (!id) return;
        const ids = get().ids;
        if (!ids.includes(id)) set({ ids: [...ids, id] });
      },

      remove: (id) => {
        set({
          ids: get().ids.filter((x) => x !== id),
          items: get().items.filter((p) => p?.id !== id),
        });
      },

      toggle: (id) => {
        if (!id) return;
        const ids = get().ids;
        if (ids.includes(id)) {
          set({
            ids: ids.filter((x) => x !== id),
            items: get().items.filter((p) => p?.id !== id),
          });
        } else {
          set({ ids: [...ids, id] });
        }
      },

      clearWishlist: () => set({ ids: [], items: [], error: null }),

      // “Cart-like”: page calls this once; store populates items
      fetchWishlistItems: async () => {
        const ids = get().ids;

        if (!ids || ids.length === 0) {
          set({ items: [], loading: false, error: null });
          return;
        }

        set({ loading: true, error: null });

        try {
          const responses = await Promise.all(
            ids.map((id) =>
              productsAPI
                .getProduct(id)
                .then((res) => res?.product || res)
                .catch(() => null)
            )
          );

          const valid = responses.filter(Boolean);

          // If some ids no longer exist, auto-clean them
          const validIds = valid.map((p) => p.id);
          set({ items: valid, ids: ids.filter((id) => validIds.includes(id)) });
        } catch (e) {
          set({ error: 'Failed to load wishlist items.' });
        } finally {
          set({ loading: false });
        }
      },
    }),
    { name: 'wishlist:v1', partialize: (state) => ({ ids: state.ids }) }
  )
);

export default useWishlistStore;
