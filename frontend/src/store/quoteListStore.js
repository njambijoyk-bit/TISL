import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';
import { searchEvents } from '../services/searchEventService';

const DEBOUNCE_MS = 1500;
let quoteSyncTimer = null;

const syncQuoteToServer = (items) => {
  clearTimeout(quoteSyncTimer);
  quoteSyncTimer = setTimeout(async () => {
    try {
      await api.post('/customer/quote-list/sync', { items });
    } catch {
      // silent
    }
  }, DEBOUNCE_MS);
};

const useQuoteListStore = create(
  persist(
    (set, get) => ({
      items: [],

      // ── Getters ────────────────────────────────────────────────────────

      count: () => get().items.length,
      has: (productId) => get().items.some(i => i.product.id === productId),

      // ── Actions ────────────────────────────────────────────────────────

      addItem: (product, quantity = 1, notes = '') => {
        const isNew = !get().items.some(i => i.product.id === product.id); // check BEFORE set
        set(state => {
          const existing = state.items.find(i => i.product.id === product.id);
          const next = existing
            ? state.items.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i)
            : [...state.items, { product, quantity, notes }];
          syncQuoteToServer(next);
          return { items: next };
        });
        if (isNew) searchEvents.addToQuotelist(product); // fire only on genuinely new items
      },

      removeItem: (productId) => {
        set(state => {
          const next = state.items.filter(i => i.product.id !== productId);
          syncQuoteToServer(next);
          return { items: next };
        });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity < 1) return;
        set(state => {
          const next = state.items.map(i => i.product.id === productId ? { ...i, quantity } : i);
          syncQuoteToServer(next);
          return { items: next };
        });
      },

      updateNotes: (productId, notes) => {
        set(state => {
          const next = state.items.map(i => i.product.id === productId ? { ...i, notes } : i);
          syncQuoteToServer(next);
          return { items: next };
        });
      },

      clearList: () => {
        set({ items: [] });
        syncQuoteToServer([]);
      },

      // ── Server sync ────────────────────────────────────────────────────

      /** Call once on login. Merges DB items into local, bumps quantity on conflict. */
      loadFromServer: async () => {
        try {
          const { data } = await api.get('/customer/quote-list');
          const serverItems = data.items ?? [];
          if (!serverItems.length) return;

          const localItems = get().items;
          const merged = [...localItems];
          serverItems.forEach(serverItem => {
            const idx = merged.findIndex(i => i.product.id === serverItem.product.id);
            if (idx !== -1) {
              merged[idx] = {
                ...merged[idx],
                quantity: merged[idx].quantity + serverItem.quantity,
                notes: merged[idx].notes || serverItem.notes,
              };
            } else {
              merged.push(serverItem);
            }
          });

          set({ items: merged });
          syncQuoteToServer(merged);
        } catch {
          // silent — keep local
        }
      },
    }),
    { name: 'tisl-quote-list', version: 1 }
  )
);

export default useQuoteListStore;