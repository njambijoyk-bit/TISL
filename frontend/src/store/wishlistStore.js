import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { productsAPI } from '../api';
import api from '../api/axios';
import { searchEvents } from '../services/searchEventService';

const DEBOUNCE_MS = 1500;
let wishlistSyncTimer = null;

const syncWishlistToServer = (ids) => {
  clearTimeout(wishlistSyncTimer);
  wishlistSyncTimer = setTimeout(async () => {
    try {
      await api.post('/customer/wishlist/sync', { ids });
    } catch {
      // silent
    }
  }, DEBOUNCE_MS);
};

const useWishlistStore = create(
  persist(
    (set, get) => ({
      ids: [],
      items: [],
      loading: false,
      error: null,

      // ── Getters ────────────────────────────────────────────────────────

      has: (id) => get().ids.includes(id),

      // ── Actions ────────────────────────────────────────────────────────

      add: (id) => {
        if (!id) return;
        const ids = get().ids;
        if (ids.includes(id)) return;
        const next = [...ids, id];
        set({ ids: next });
        syncWishlistToServer(next);
        searchEvents.addToWishlist({ id, name: null, sku: null }); 
      },

      remove: (id) => {
        const next = get().ids.filter(x => x !== id);
        set({ ids: next, items: get().items.filter(p => p?.id !== id) });
        syncWishlistToServer(next);
      },

      toggle: (id) => {
        if (!id) return;
        const ids = get().ids;
        if (ids.includes(id)) {
          const next = ids.filter(x => x !== id);
          set({ ids: next, items: get().items.filter(p => p?.id !== id) });
          syncWishlistToServer(next);
        } else {
          const next = [...ids, id];
          set({ ids: next });
          syncWishlistToServer(next);
          searchEvents.addToWishlist({ id, name: null, sku: null }); 
        }
      },

      clearWishlist: () => {
        set({ ids: [], items: [], error: null });
        syncWishlistToServer([]);
      },

      fetchWishlistItems: async () => {
        const ids = get().ids;
        if (!ids?.length) { set({ items: [], loading: false, error: null }); return; }
        set({ loading: true, error: null });
        try {
          const responses = await Promise.all(
            ids.map(id => productsAPI.getProduct(id).then(r => r?.product || r).catch(() => null))
          );
          const valid = responses.filter(Boolean);
          const validIds = valid.map(p => p.id);
          set({ items: valid, ids: ids.filter(id => validIds.includes(id)) });
        } catch {
          set({ error: 'Failed to load wishlist items.' });
        } finally {
          set({ loading: false });
        }
      },

      // ── Server sync ────────────────────────────────────────────────────

      /** Call once on login. Unions DB ids + local ids, deduplicates. */
      loadFromServer: async () => {
        try {
          const { data } = await api.get('/customer/wishlist');
          const serverIds = data.ids ?? [];
          if (!serverIds.length) return;

          const localIds = get().ids;
          const merged = [...new Set([...localIds, ...serverIds])];
          set({ ids: merged });
          syncWishlistToServer(merged);
        } catch {
          // silent — keep local
        }
      },
    }),
    { name: 'wishlist:v1', partialize: (state) => ({ ids: state.ids }) }
  )
);

export default useWishlistStore;