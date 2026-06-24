import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import useAuthStore from './authStore';
import api from '../api/axios';
import { searchEvents } from '../services/searchEventService';

const DEBOUNCE_MS = 1500;
let quoteSyncTimer = null;

const syncQuoteToServer = (items) => {
  if (!useAuthStore.getState().isAuthenticated) return;
  clearTimeout(quoteSyncTimer);
  quoteSyncTimer = setTimeout(async () => {
    try {
      await api.post('/customer/quote-list/sync', { items });
    } catch {}
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
        clearTimeout(quoteSyncTimer);
        set({ items: [] });
        if (useAuthStore.getState().isAuthenticated) {
          api.delete('/customer/quote-list').catch(() => {});
        }
      },

      // ── Server sync ────────────────────────────────────────────────────

      /** Call once on login. Merges DB items into local, bumps quantity on conflict. */
      loadFromServer: async () => {
        try {
          const { data } = await api.get('/customer/quote-list');
          const serverItems = data.items ?? [];

          const localItems = get().items;
          const merged = [...serverItems.map(i => ({ ...i }))];
          localItems.forEach(localItem => {
            const idx = merged.findIndex(i => i.product.id === localItem.product.id);
            if (idx !== -1) {
              merged[idx] = {
                ...merged[idx],
                quantity: merged[idx].quantity + localItem.quantity,
                notes: merged[idx].notes || localItem.notes,
              };
            } else {
              merged.push(localItem);
            }
          });

          set({ items: merged });
          api.post('/customer/quote-list/sync', { items: merged }).catch(() => {});
        } catch {}
      },

      resetLocal: () => set({ items: [] }),
    }),
    { name: 'tisl-quote-list', version: 1 }
  )
);

export default useQuoteListStore;