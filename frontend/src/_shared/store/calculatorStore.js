import { create } from 'zustand';

/**
 * Where the user is, as far as the calculator is concerned. A page publishes what is on screen
 * (e.g. { type: 'voucher', id: 42 }) with useCalculatorContext(); the calculator reads it when it opens.
 */
const useCalculatorStore = create((set) => ({
  context: null,
  setContext: (context) => set({ context }),
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));

export default useCalculatorStore;
