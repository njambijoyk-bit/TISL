import { create } from 'zustand';

/**
 * Where the user is, as far as the calculator is concerned. Pages (and dialogs on them) publish what is on screen
 * with useCalculatorContext(); the most recently opened one wins, and the one underneath comes back when it closes.
 */
const top = (stack) => (stack.length ? stack[stack.length - 1].ctx : null);

const useCalculatorStore = create((set) => ({
  stack: [],
  context: null,
  publish: (id, ctx) => set((s) => {
    const stack = s.stack.filter((e) => e.id !== id);
    if (ctx) stack.push({ id, ctx });
    // keep position: an update of the same id stays where it was
    const idx = s.stack.findIndex((e) => e.id === id);
    if (ctx && idx >= 0) { const copy = s.stack.slice(); copy[idx] = { id, ctx }; return { stack: copy, context: top(copy) }; }
    return { stack, context: top(stack) };
  }),
  retract: (id) => set((s) => { const stack = s.stack.filter((e) => e.id !== id); return { stack, context: top(stack) }; }),
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));

export default useCalculatorStore;
