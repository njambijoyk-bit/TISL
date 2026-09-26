import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import useAuthStore from './authStore';
import api from '../api/axios';
import { searchEvents } from '../services/searchEventService';

const DEBOUNCE_MS = 1500;
let cartSyncTimer = null;

const syncCartToServer = (items) => {
  if (!useAuthStore.getState().isAuthenticated) return; // guests don't sync
  clearTimeout(cartSyncTimer);
  cartSyncTimer = setTimeout(async () => {
    try {
      await api.post('/customer/cart/sync', { items });
    } catch {}
  }, DEBOUNCE_MS);
};

/**
 * A cart line's identity. Lines for different variants / units of the same
 * product must stay separate, so they carry a line_key; older lines (and
 * products without variants) fall back to the product id.
 */
export const lineKey = (item) => item?.line_key ?? item?.id;

const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      // ── Actions ────────────────────────────────────────────────────────

      addItem: (product, quantity = 1) => {
        const items = get().items;
        const key = lineKey(product);
        const existing = items.find(i => lineKey(i) === key);
        const next = existing
          ? items.map(i => lineKey(i) === key ? { ...i, quantity: i.quantity + quantity } : i)
          : [...items, { ...product, quantity }];
        set({ items: next });
        syncCartToServer(next);
        searchEvents.addToCart(product);
      },

      /** @param key  lineKey(item) — the product id for lines without a variant */
      removeItem: (key) => {
        const next = get().items.filter(i => lineKey(i) !== key);
        set({ items: next });
        syncCartToServer(next);
      },

      updateQuantity: (key, quantity) => {
        if (quantity <= 0) { get().removeItem(key); return; }
        const next = get().items.map(i => lineKey(i) === key ? { ...i, quantity } : i);
        set({ items: next });
        syncCartToServer(next);
      },

      clearCart: () => {
        clearTimeout(cartSyncTimer);
        set({ items: [] });
        if (useAuthStore.getState().isAuthenticated) {
          api.delete('/customer/cart').catch(() => {});
        }
      },

      // ── Getters ────────────────────────────────────────────────────────

      getTotal: () => get().items.reduce((t, i) => t + i.price * i.quantity, 0),
      getItemCount: () => get().items.reduce((c, i) => c + i.quantity, 0),

      // ── Server sync ────────────────────────────────────────────────────

      /** Call once on login. Merges DB cart into local, saves result back. */
      loadFromServer: async () => {
        try {
          const { data } = await api.get('/customer/cart');
          const serverItems = data.items ?? [];

          const localItems = get().items;
          const merged = [...serverItems.map(i => ({ ...i }))];
          localItems.forEach(localItem => {
            const idx = merged.findIndex(i => lineKey(i) === lineKey(localItem));
            if (idx !== -1) {
              merged[idx] = { ...merged[idx], quantity: merged[idx].quantity + localItem.quantity };
            } else {
              merged.push(localItem);
            }
          });

          set({ items: merged });
          api.post('/customer/cart/sync', { items: merged }).catch(() => {});
        } catch {}
      },

      resetLocal: () => set({ items: [] }),
    }),
    { name: 'cart-storage' }
  )
);

export default useCartStore;