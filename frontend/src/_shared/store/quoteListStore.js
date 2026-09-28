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

/**
 * A line's identity. Services carry a line_key (service + package) so two
 * packages of one service stay separate and a service id never collides with a
 * product id; products fall back to their id.
 */
const isService = (p) => typeof p?.line_key === 'string' ? p.line_key.startsWith('s:') : p?.pricing_model !== undefined;
export const quoteKey = (p) => p?.line_key ?? (isService(p) ? `s:${p.id}` : p?.id);

const useQuoteListStore = create(
  persist(
    (set, get) => ({
      items: [],

      // ── Getters ────────────────────────────────────────────────────────

      count: () => get().items.length,
      has: (key) => get().items.some(i => quoteKey(i.product) === key),

      // ── Actions ────────────────────────────────────────────────────────

      addItem: (product, quantity = 1, notes = '') => {
        const key = quoteKey(product);
        const isNew = !get().items.some(i => quoteKey(i.product) === key); // check BEFORE set
        set(state => {
          const existing = state.items.find(i => quoteKey(i.product) === key);
          const next = existing
            ? state.items.map(i => quoteKey(i.product) === key ? { ...i, quantity: i.quantity + quantity } : i)
            : [...state.items, { product, quantity, notes }];
          syncQuoteToServer(next);
          return { items: next };
        });
        if (isNew) searchEvents.addToQuotelist(product); // fire only on genuinely new items
      },

      removeItem: (key) => {
        set(state => {
          const next = state.items.filter(i => quoteKey(i.product) !== key);
          syncQuoteToServer(next);
          return { items: next };
        });
      },

      updateQuantity: (key, quantity) => {
        if (quantity < 1) return;
        set(state => {
          const next = state.items.map(i => quoteKey(i.product) === key ? { ...i, quantity } : i);
          syncQuoteToServer(next);
          return { items: next };
        });
      },

      updateNotes: (key, notes) => {
        set(state => {
          const next = state.items.map(i => quoteKey(i.product) === key ? { ...i, notes } : i);
          syncQuoteToServer(next);
          return { items: next };
        });
      },

      /** Answers to a service's requirements: { [requirementId]: value } */
      updateAnswers: (key, answers) => {
        set(state => {
          const next = state.items.map(i => quoteKey(i.product) === key ? { ...i, answers } : i);
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
            const idx = merged.findIndex(i => quoteKey(i.product) === quoteKey(localItem.product));
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