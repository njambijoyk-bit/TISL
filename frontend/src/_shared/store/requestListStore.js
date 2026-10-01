import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The items a customer wants prices for (item, variant, quantity). Kept in the browser, so a visitor can build the list
 * before signing in; "Send" turns it into a quotation request.
 */
export const requestKey = (i) => `${i.kind}:${i.product_id ?? i.service_id}:${i.variant_id ?? i.service_variant_id ?? ''}:${i.variant_unit_id ?? ''}`;

const useRequestListStore = create(
  persist(
    (set) => ({
      items: [],
      add: (item) => set((s) => {
        const key = requestKey(item);
        const has = s.items.find((x) => x.key === key);
        const qty = Math.max(0.0001, Number(item.quantity) || 1);
        return { items: has ? s.items.map((x) => (x.key === key ? { ...x, quantity: x.quantity + qty } : x)) : [...s.items, { ...item, key, quantity: qty }] };
      }),
      setQuantity: (key, quantity) => set((s) => ({ items: s.items.map((x) => (x.key === key ? { ...x, quantity } : x)) })),
      remove: (key) => set((s) => ({ items: s.items.filter((x) => x.key !== key) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'quote-request-list' }
  )
);

export default useRequestListStore;
