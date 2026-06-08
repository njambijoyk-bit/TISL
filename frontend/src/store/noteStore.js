/**
 * noteStore.js
 * Customer scratch-pad note — persists to localStorage via zustand/persist,
 * debounced sync to DB on every change, same pattern as cartStore.
 *
 * Limits:
 *   NOTE_MAX_LENGTH — enforced client-side (mirrors backend const of 2000)
 *
 * Server endpoints used:
 *   GET    /api/customer/note        — load on login
 *   POST   /api/customer/note/sync   — debounced upsert
 *   DELETE /api/customer/note        — clear (nulls DB row, clears local)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';

export const NOTE_MAX_LENGTH = 2000; // must match CustomerSyncController::NOTE_MAX_LENGTH

const DEBOUNCE_MS = 1500;
let noteSyncTimer = null;

const syncNoteToServer = (note) => {
  clearTimeout(noteSyncTimer);
  noteSyncTimer = setTimeout(async () => {
    try {
      await api.post('/customer/note/sync', { note });
    } catch {
      // silent — localStorage is source of truth while session is active
    }
  }, DEBOUNCE_MS);
};

const useNoteStore = create(
  persist(
    (set, get) => ({
      note: '',           // current text
      isSyncing: false,   // true during the debounce window — use to show "saving..." indicator
      lastSyncedAt: null, // ISO string of last successful server sync (optional UI use)

      // ── Actions ────────────────────────────────────────────────────────

      /**
       * Update the note text. Enforces max length client-side.
       * Triggers debounced server sync.
       */
      setNote: (text) => {
        const trimmed = text.slice(0, NOTE_MAX_LENGTH);
        set({ note: trimmed, isSyncing: true });
        syncNoteToServer(trimmed);
      },

      /**
       * Clear the note locally and on the server immediately (no debounce).
       * Server sets the DB column to NULL; admin saved snapshots are untouched.
       */
      clearNote: async () => {
        clearTimeout(noteSyncTimer); // cancel any pending debounced sync
        set({ note: '', isSyncing: false, lastSyncedAt: null });
        try {
          await api.delete('/customer/note');
        } catch {
          // silent
        }
      },

      /**
       * Call once on login.
       * If the server has a note and local is empty, loads from server.
       * If local already has content, keeps local (user may have typed before login resolved).
       * Never overwrites non-empty local content with server content.
       */
      loadFromServer: async () => {
        try {
          const { data } = await api.get('/customer/note');
          const serverNote = data.note ?? '';
          const localNote  = get().note ?? '';

          if (serverNote && !localNote.trim()) {
            // server has content, local is blank — load from server
            set({ note: serverNote });
          } else if (localNote.trim() && !serverNote) {
            // local has content, server is blank — push local up
            syncNoteToServer(localNote);
          }
          // if both have content, local wins — no action needed
        } catch {
          // silent — keep local
        }
      },

      /**
       * Called after a confirmed server sync (optional — call from a wrapper if needed).
       * Marks isSyncing false and records timestamp.
       */
      _onSyncSuccess: () => {
        set({ isSyncing: false, lastSyncedAt: new Date().toISOString() });
      },

      // ── Getters ────────────────────────────────────────────────────────

      /** Characters remaining before the limit */
      charsRemaining: () => NOTE_MAX_LENGTH - (get().note?.length ?? 0),

      /** True if note has any non-whitespace content */
      hasContent: () => !!(get().note?.trim()),
    }),
    {
      name: 'customer-note-storage',
      // only persist the note text itself — sync state is transient
      partialize: (state) => ({ note: state.note }),
    }
  )
);

export default useNoteStore;