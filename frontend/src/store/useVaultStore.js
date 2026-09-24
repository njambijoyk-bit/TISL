import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_THEME } from '../components/admin/vault/vaultThemes';

// ─────────────────────────────────────────────────────────────────────────────
// Persisted slice — survives page refresh
// ─────────────────────────────────────────────────────────────────────────────
const persistedDefaults = {
  layout:   'sidebar',   // 'sidebar' | 'breadcrumb'
  viewMode: 'card',      // 'card'    | 'table'
  theme:    DEFAULT_THEME, // vault theme id (e.g. 'light', 'cyberpunk', 'nord')
};

// ─────────────────────────────────────────────────────────────────────────────
// Session slice — reset on mount
// ─────────────────────────────────────────────────────────────────────────────
const sessionDefaults = {
  // Navigation
  activeTab:     'browser',  // 'browser' | 'archiver' | 'policies' | 'logs' | 'settings'
  currentFolder: null,       // VaultFolder | null  (null = vault root)
  breadcrumbs:   [],         // VaultFolder[]  — trail from root to currentFolder

  // Folder tree (sidebar)
  treeNodes:     {},         // { [folderId]: VaultFolder[] }  — loaded children
  expandedNodes: new Set(),  // Set<folderId>

  // Preview
  previewDoc:      null,     // VaultDocument | null
  previewExpanded: false,

  // Drag and drop
  activeDrag:  null,         // { type: 'folder'|'document', item: VaultFolder|VaultDocument }
  dropTarget:  null,         // folderId | null

  // Modal visibility
  modals: {
    uploadDocument: false,
    createFolder:   false,
    editFolder:     false,
    editDocument:   false,
    move:           false,
    password:       false,
    archive:        false,
    policyBuilder:  false,
    versionHistory: false,
  },

  // Modal context — which item the modal is acting on
  modalContext: null,        // { item, mode? }  e.g. { item: VaultDocument, mode: 'unlock' }

  // Folder browser cache — content of each visited folder
  folderCache: {},           // { [folderId]: { folders: [], documents: [], loadedAt: timestamp } }

  // Selection (for bulk ops later)
  selectedIds: new Set(),    // Set<id>
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────
const useVaultStore = create(
  persist(
    (set, get) => ({
      ...persistedDefaults,
      ...sessionDefaults,

      // ── Theme ─────────────────────────────────────────────────────────────

      setTheme: (theme) => set({ theme }),

      // ── Layout & view ──────────────────────────────────────────────────────

      setLayout:   (layout)   => set({ layout }),
      setViewMode: (viewMode) => set({ viewMode }),
      setActiveTab:(tab)      => set({ activeTab: tab }),

      // ── Navigation ────────────────────────────────────────────────────────

      /**
       * Navigate into a folder. Appends to breadcrumb trail.
       * Pass null to go back to vault root.
       */
      openFolder: (folder) => {
        if (!folder) {
          set({ currentFolder: null, breadcrumbs: [] });
          return;
        }
        const { breadcrumbs } = get();
        // If folder is already in the trail, truncate to that point (going back up)
        const existingIdx = breadcrumbs.findIndex(f => f.id === folder.id);
        if (existingIdx !== -1) {
          set({
            currentFolder: folder,
            breadcrumbs: breadcrumbs.slice(0, existingIdx + 1),
          });
        } else {
          set({
            currentFolder: folder,
            breadcrumbs: [...breadcrumbs, folder],
          });
        }
      },

      /**
       * Navigate to a specific breadcrumb index (truncates trail).
       */
      navigateToBreadcrumb: (index) => {
        const { breadcrumbs } = get();
        if (index < 0) {
          set({ currentFolder: null, breadcrumbs: [] });
          return;
        }
        const folder = breadcrumbs[index];
        set({
          currentFolder: folder,
          breadcrumbs: breadcrumbs.slice(0, index + 1),
        });
      },

      // ── Folder tree ────────────────────────────────────────────────────────

      /**
       * Store lazy-loaded children for a tree node.
       * folderId: null means root-level folders.
       */
      setTreeChildren: (folderId, children) =>
        set(state => ({
          treeNodes: { ...state.treeNodes, [folderId ?? 'root']: children },
        })),

      toggleTreeNode: (folderId) =>
        set(state => {
          const next = new Set(state.expandedNodes);
          next.has(folderId) ? next.delete(folderId) : next.add(folderId);
          return { expandedNodes: next };
        }),

      expandTreeNode:  (folderId) =>
        set(state => ({ expandedNodes: new Set([...state.expandedNodes, folderId]) })),

      collapseTreeNode: (folderId) =>
        set(state => {
          const next = new Set(state.expandedNodes);
          next.delete(folderId);
          return { expandedNodes: next };
        }),

      isTreeNodeExpanded: (folderId) => get().expandedNodes.has(folderId),

      hasTreeChildren: (folderId) =>
        get().treeNodes[folderId ?? 'root'] !== undefined,

      getTreeChildren: (folderId) =>
        get().treeNodes[folderId ?? 'root'] ?? null,

      // ── Folder cache (browser panel) ───────────────────────────────────────

      setFolderCache: (folderId, data) =>
        set(state => ({
          folderCache: {
            ...state.folderCache,
            [folderId ?? 'root']: { ...data, loadedAt: Date.now() },
          },
        })),

      getFolderCache: (folderId) =>
        get().folderCache[folderId ?? 'root'] ?? null,

      invalidateFolderCache: (folderId) =>
        set(state => {
          const next = { ...state.folderCache };
          delete next[folderId ?? 'root'];
          return { folderCache: next };
        }),

      /**
       * After a move/rename/delete, invalidate the affected folder and its parent
       * so both panels refresh on next visit.
       */
      invalidateAfterMutation: (folderId, parentId = null) => {
        const { invalidateFolderCache } = get();
        invalidateFolderCache(folderId);
        if (parentId !== null) invalidateFolderCache(parentId);
      },

      // ── Optimistic updates ─────────────────────────────────────────────────

      /**
       * Remove a document from the current folder cache optimistically.
       * Revert by calling setFolderCache again with the original data.
       */
      removeDocumentFromCache: (folderId, documentId) =>
        set(state => {
          const key   = folderId ?? 'root';
          const entry = state.folderCache[key];
          if (!entry) return {};
          return {
            folderCache: {
              ...state.folderCache,
              [key]: {
                ...entry,
                documents: entry.documents.filter(d => d.id !== documentId),
              },
            },
          };
        }),

      removeFolderFromCache: (parentId, folderId) =>
        set(state => {
          const key   = parentId ?? 'root';
          const entry = state.folderCache[key];
          if (!entry) return {};
          return {
            folderCache: {
              ...state.folderCache,
              [key]: {
                ...entry,
                folders: entry.folders.filter(f => f.id !== folderId),
              },
            },
          };
        }),

      // ── Preview ────────────────────────────────────────────────────────────

      openPreview:    (doc)  => set({ previewDoc: doc, previewExpanded: false }),
      closePreview:   ()     => set({ previewDoc: null, previewExpanded: false }),
      expandPreview:  ()     => set({ previewExpanded: true }),
      collapsePreview:()     => set({ previewExpanded: false }),

      // ── Drag and drop ──────────────────────────────────────────────────────

      startDrag:   (type, item) => set({ activeDrag: { type, item } }),
      endDrag:     ()           => set({ activeDrag: null, dropTarget: null }),
      setDropTarget:(folderId)  => set({ dropTarget: folderId }),
      clearDropTarget:()        => set({ dropTarget: null }),

      isDragging:  ()     => get().activeDrag !== null,
      isDropTarget:(id)   => get().dropTarget === id,

      // ── Modals ─────────────────────────────────────────────────────────────

      openModal: (name, context = null) =>
        set(state => ({
          modals: { ...state.modals, [name]: true },
          modalContext: context,
        })),

      closeModal: (name) =>
        set(state => ({
          modals: { ...state.modals, [name]: false },
          modalContext: null,
        })),

      closeAllModals: () =>
        set(state => ({
          modals: Object.fromEntries(Object.keys(state.modals).map(k => [k, false])),
          modalContext: null,
        })),

      isModalOpen: (name) => get().modals[name] === true,

      // ── Selection ──────────────────────────────────────────────────────────

      toggleSelection: (id) =>
        set(state => {
          const next = new Set(state.selectedIds);
          next.has(id) ? next.delete(id) : next.add(id);
          return { selectedIds: next };
        }),

      selectAll: (ids) => set({ selectedIds: new Set(ids) }),
      clearSelection: () => set({ selectedIds: new Set() }),
      isSelected: (id) => get().selectedIds.has(id),
      selectionCount: () => get().selectedIds.size,

      // ── Reset session state ────────────────────────────────────────────────

      resetSession: () => set({ ...sessionDefaults }),
    }),

    {
      name: 'vault-ui-prefs',
      storage: createJSONStorage(() => localStorage),
      // Persist layout, view mode, and theme preferences
      partialize: (state) => ({
        layout:   state.layout,
        viewMode: state.viewMode,
        theme:    state.theme,
      }),
    }
  )
);

export default useVaultStore;