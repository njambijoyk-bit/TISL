import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios'; // adjust to your axios instance path

const EMPTY_DRAFT = {
  note_type: 'refund',
  amount: '',
  currency: 'KES',
  direction: 'out',
  subject_table: '',
  subject_id: '',
  reference_label: '',
  body: '',
};

const useFinancialJournalStore = create(
  persist(
    (set, get) => ({

      // ── UI State ───────────────────────────────────────────────
      isOpen: false,
      isMinimised: false,
      isSyncing: false,
      lastSyncedAt: null,
      syncError: null,

      // ── Draft ──────────────────────────────────────────────────
      draft: { ...EMPTY_DRAFT },
      savedNoteId: null, // if draft was synced and got an ID back

      // ── UI Actions ─────────────────────────────────────────────
      open: () => set({ isOpen: true, isMinimised: false }),
      minimise: () => set({ isMinimised: true }),
      expand: () => set({ isMinimised: false }),
      close: () => set({ isOpen: false, isMinimised: false }),

      // ── Draft Actions ──────────────────────────────────────────
      updateDraft: (fields) =>
        set((state) => ({
          draft: { ...state.draft, ...fields },
          syncError: null,
        })),

      resetDraft: () =>
        set({
          draft: { ...EMPTY_DRAFT },
          savedNoteId: null,
          lastSyncedAt: null,
          syncError: null,
        }),

      // ── Sync to DB (called on blur / tab switch) ───────────────
      // saves as a real record — backend just stores it, no status field
      // if savedNoteId exists we PUT, otherwise POST
      syncDraft: async () => {
        const { draft, savedNoteId, isSyncing } = get();

        // nothing worth saving yet
        if (!draft.body?.trim()) return;
        if (isSyncing) return;

        set({ isSyncing: true, syncError: null });

        try {
          let response;

          if (savedNoteId) {
            response = await api.put(`/admin/financial-notes/${savedNoteId}`, draft);
          } else {
            response = await api.post('/admin/financial-notes', draft);
          }

          set({
            savedNoteId: response.data.id,
            lastSyncedAt: new Date().toISOString(),
            isSyncing: false,
          });
        } catch (err) {
          set({
            isSyncing: false,
            syncError: err?.response?.data?.message || 'Sync failed',
          });
        }
      },

      // ── Submit (final save — closes modal, resets draft) ───────
      submitNote: async () => {
        const { draft, savedNoteId } = get();

        if (!draft.body?.trim()) return { success: false, message: 'Note body is required.' };

        set({ isSyncing: true, syncError: null });

        try {
          let response;

          if (savedNoteId) {
            // already synced — just confirm it's up to date
            response = await api.put(`/admin/financial-notes/${savedNoteId}`, draft);
          } else {
            response = await api.post('/admin/financial-notes', draft);
          }

          set({
            isSyncing: false,
            isOpen: false,
            isMinimised: false,
            draft: { ...EMPTY_DRAFT },
            savedNoteId: null,
            lastSyncedAt: null,
          });

          return { success: true, note: response.data };
        } catch (err) {
          set({
            isSyncing: false,
            syncError: err?.response?.data?.message || 'Submit failed',
          });
          return { success: false, message: err?.response?.data?.message || 'Submit failed' };
        }
      },

      // ── Subject lookup helper ──────────────────────────────────
      // called when admin picks a subject_table + subject_id
      // fetches a summary label to show inline
      subjectPreview: null,
      isLoadingPreview: false,

      fetchSubjectPreview: async (table, id) => {
        if (!table || !id) return;

        set({ isLoadingPreview: true, subjectPreview: null });

        try {
          // reuse the for-subject endpoint — if there are notes for this
          // record we show them; the preview label comes from reference_label
          // on any existing note, or we just show "table #id"
          const response = await api.get('/admin/financial-notes/for-subject', {
            params: { subject_table: table, subject_id: id },
          });

          const existing = response.data;

          set({
            isLoadingPreview: false,
            subjectPreview: {
              existingNotes: existing,
              label: existing?.[0]?.reference_label || `${table} #${id}`,
            },
          });

          // auto-fill reference_label if empty
          if (!get().draft.reference_label && existing?.[0]?.reference_label) {
            set((state) => ({
              draft: {
                ...state.draft,
                reference_label: existing[0].reference_label,
              },
            }));
          }
        } catch {
          set({ isLoadingPreview: false, subjectPreview: null });
        }
      },

      clearSubjectPreview: () => set({ subjectPreview: null }),
    }),

    {
      name: 'financial-journal-draft',
      // only persist the draft and savedNoteId across sessions
      // UI state (isOpen, isMinimised) resets on page load intentionally
      partialize: (state) => ({
        draft: state.draft,
        savedNoteId: state.savedNoteId,
      }),
    }
  )
);

export default useFinancialJournalStore;