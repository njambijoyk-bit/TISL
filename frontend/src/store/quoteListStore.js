import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Quote List Store
 * Persisted store for items staged for a quote request.
 * Mirrors the cart pattern: add → review on /quote-list → request quote.
 */
const useQuoteListStore = create(
  persist(
    (set, get) => ({
      // [{ product, quantity, notes }]
      items: [],

      // ── Getters ────────────────────────────────────────────────────────
      count: () => get().items.length,

      has: (productId) => get().items.some(i => i.product.id === productId),

      // ── Actions ────────────────────────────────────────────────────────

      /** Add a product. If already in list, bump quantity. */
      addItem: (product, quantity = 1, notes = '') => {
        set(state => {
          const existing = state.items.find(i => i.product.id === product.id);
          if (existing) {
            return {
              items: state.items.map(i =>
                i.product.id === product.id
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            };
          }
          return { items: [...state.items, { product, quantity, notes }] };
        });
      },

      /** Remove a product by id. */
      removeItem: (productId) => {
        set(state => ({ items: state.items.filter(i => i.product.id !== productId) }));
      },

      /** Update quantity for an item. */
      updateQuantity: (productId, quantity) => {
        if (quantity < 1) return;
        set(state => ({
          items: state.items.map(i =>
            i.product.id === productId ? { ...i, quantity } : i
          ),
        }));
      },

      /** Update notes for an item. */
      updateNotes: (productId, notes) => {
        set(state => ({
          items: state.items.map(i =>
            i.product.id === productId ? { ...i, notes } : i
          ),
        }));
      },

      /** Clear everything. */
      clearList: () => set({ items: [] }),
    }),
    {
      name: 'tisl-quote-list',   // localStorage key
      version: 1,
    }
  )
);

export default useQuoteListStore;