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

const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      // ── Actions ────────────────────────────────────────────────────────

      addItem: (product, quantity = 1) => {
        const items = get().items;
        const existing = items.find(i => i.id === product.id);
        const next = existing
          ? items.map(i => i.id === product.id ? { ...i, quantity: i.quantity + quantity } : i)
          : [...items, { ...product, quantity }];
        set({ items: next });
        syncCartToServer(next);
        searchEvents.addToCart(product);
      },

      removeItem: (productId) => {
        const next = get().items.filter(i => i.id !== productId);
        set({ items: next });
        syncCartToServer(next);
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) { get().removeItem(productId); return; }
        const next = get().items.map(i => i.id === productId ? { ...i, quantity } : i);
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
            const idx = merged.findIndex(i => i.id === localItem.id);
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