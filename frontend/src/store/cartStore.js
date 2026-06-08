import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';
import { searchEvents } from '../services/searchEventService';

const DEBOUNCE_MS = 1500;
let cartSyncTimer = null;

const syncCartToServer = (items) => {
  clearTimeout(cartSyncTimer);
  cartSyncTimer = setTimeout(async () => {
    try {
      await api.post('/customer/cart/sync', { items });
    } catch {
      // silent — localStorage is source of truth
    }
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
        set({ items: [] });
        syncCartToServer([]);
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
          if (!serverItems.length) return;

          const localItems = get().items;

          // merge: for conflicts add quantities together
          const merged = [...localItems];
          serverItems.forEach(serverItem => {
            const idx = merged.findIndex(i => i.id === serverItem.id);
            if (idx !== -1) {
              merged[idx] = { ...merged[idx], quantity: merged[idx].quantity + serverItem.quantity };
            } else {
              merged.push(serverItem);
            }
          });

          set({ items: merged });
          syncCartToServer(merged);
        } catch {
          // silent — keep local
        }
      },
    }),
    { name: 'cart-storage' }
  )
);

export default useCartStore;