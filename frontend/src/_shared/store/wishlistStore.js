import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import useAuthStore from './authStore';
import { productsAPI } from '../api/index';
import { getServiceById } from '../api/services';
import api from '../api/axios';
import { searchEvents } from '../services/searchEventService';

const DEBOUNCE_MS = 1500;
let wishlistSyncTimer = null;

const syncWishlistToServer = (ids, serviceIds = []) => {
  if (!useAuthStore.getState().isAuthenticated) return;
  clearTimeout(wishlistSyncTimer);
  wishlistSyncTimer = setTimeout(async () => {
    try {
      await api.post('/customer/wishlist/sync', { ids, service_ids: serviceIds });
    } catch {}
  }, DEBOUNCE_MS);
};

const useWishlistStore = create(
  persist(
    (set, get) => ({
      ids: [],
      items: [],
      serviceIds: [],      // services can be saved too (they are quoted, not carted)
      serviceItems: [],
      loading: false,
      error: null,

      // ── Getters ────────────────────────────────────────────────────────

      has: (id) => get().ids.includes(id),
      hasService: (id) => get().serviceIds.includes(id),

      // ── Actions ────────────────────────────────────────────────────────

      add: (id) => {
        if (!id) return;
        const ids = get().ids;
        if (ids.includes(id)) return;
        const next = [...ids, id];
        set({ ids: next });
        syncWishlistToServer(next, get().serviceIds);
        searchEvents.addToWishlist({ id, name: null, sku: null }); 
      },

      remove: (id) => {
        const next = get().ids.filter(x => x !== id);
        set({ ids: next, items: get().items.filter(p => p?.id !== id) });
        syncWishlistToServer(next, get().serviceIds);
      },

      toggle: (id) => {
        if (!id) return;
        const ids = get().ids;
        if (ids.includes(id)) {
          const next = ids.filter(x => x !== id);
          set({ ids: next, items: get().items.filter(p => p?.id !== id) });
          syncWishlistToServer(next, get().serviceIds);
        } else {
          const next = [...ids, id];
          set({ ids: next });
          syncWishlistToServer(next, get().serviceIds);
          searchEvents.addToWishlist({ id, name: null, sku: null }); 
        }
      },

      toggleService: (id) => {
        if (!id) return;
        const cur = get().serviceIds;
        const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
        set({ serviceIds: next, serviceItems: get().serviceItems.filter(s => next.includes(s?.id)) });
        syncWishlistToServer(get().ids, next);
      },

      removeService: (id) => {
        const next = get().serviceIds.filter(x => x !== id);
        set({ serviceIds: next, serviceItems: get().serviceItems.filter(s => s?.id !== id) });
        syncWishlistToServer(get().ids, next);
      },

      clearWishlist: () => {
        clearTimeout(wishlistSyncTimer);
        set({ ids: [], items: [], serviceIds: [], serviceItems: [], error: null });
        if (useAuthStore.getState().isAuthenticated) {
          api.delete('/customer/wishlist').catch(() => {});
        }
      },

      fetchWishlistItems: async () => {
        const ids = get().ids;
        const serviceIds = get().serviceIds;
        set({ loading: true, error: null });
        try {
          const services = await Promise.all(
            serviceIds.map(id => getServiceById(id).then(r => r?.service || r).catch(() => null))
          );
          const validServices = services.filter(Boolean);
          set({ serviceItems: validServices, serviceIds: serviceIds.filter(id => validServices.some(s => s.id === id)) });
          if (!ids?.length) { set({ items: [], loading: false, error: null }); return; }
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
          const serverServiceIds = data.service_ids ?? [];

          const merged = [...new Set([...serverIds, ...get().ids])];
          const mergedServices = [...new Set([...serverServiceIds, ...get().serviceIds])];

          set({ ids: merged, serviceIds: mergedServices });
          api.post('/customer/wishlist/sync', { ids: merged, service_ids: mergedServices }).catch(() => {});
        } catch {}
      },

      resetLocal: () => set({ ids: [], items: [], serviceIds: [], serviceItems: [], error: null }),
    }),
    { name: 'wishlist:v1', partialize: (state) => ({ ids: state.ids, serviceIds: state.serviceIds }) }
  )
);

export default useWishlistStore;