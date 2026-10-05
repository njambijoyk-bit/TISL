import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const EMPTY = { purpose: 'other', narration: '', direction: '', amount: '', about_voucher_id: '', lines: [] };

/**
 * The Memo dock's state. The draft is kept in this browser as it is typed (so a half-written note survives a refresh or a page change);
 * it only becomes a memorandum, with a number, when it is saved.
 */
const useMemoStore = create(
  persist(
    (set) => ({
      isOpen: false,
      tab: 'write',   // write | open
      draft: { ...EMPTY },
      open: (tab) => set((s) => ({ isOpen: true, tab: tab ?? s.tab })),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setTab: (tab) => set({ tab }),
      update: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
      clear: () => set({ draft: { ...EMPTY } }),
    }),
    { name: 'memo-dock', partialize: (s) => ({ draft: s.draft }) },
  ),
);

export default useMemoStore;
