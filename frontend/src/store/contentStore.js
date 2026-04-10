import { create } from 'zustand';
import contentAPI from '../api/content';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Normalise an Axios error into { message, errors }.
 * - message: top-level human-readable string
 * - errors:  field-level validation map from Laravel 422 responses
 *            e.g. { "items.0.title": ["Each item requires a title."] }
 */
const parseError = (e) => ({
  message: e.response?.data?.message ?? 'An unexpected error occurred.',
  errors:  e.response?.data?.errors  ?? {},
});

const useContentStore = create((set, get) => ({
  // ─────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────

  pages:       [],    // admin page list
  activePage:  null,  // page open in editor (with sections loaded)
  publicPages: [],    // lightweight list for nav/footer generation
  publicPage:  null,  // full page loaded for customer-facing render
  footerPage:  null,  // ← dedicated slot so footer never overwrites publicPage

  // Tracks the most recent field-level validation errors from the backend.
  // Shape mirrors Laravel's errors object: { fieldName: [messages] }
  // Reset with clearErrors() whenever a form is opened or closed.
  errors: {},

  loading: {
    pages:      false,
    page:       false,
    section:    false,  // create / update / delete / toggle a section
    reorder:    false,
    submitting: false,  // create / update a page
    public:     false,  // public page or public index fetch
    footer:     false,  // footerPage fetch
  },

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  setLoading: (key, val) =>
    set((s) => ({ loading: { ...s.loading, [key]: val } })),

  clearActivePage: () => set({ activePage: null }),
  clearPublicPage: () => set({ publicPage: null }),

  /** Call when opening or closing any content form to reset stale errors. */
  clearErrors: () => set({ errors: {} }),

  // ─────────────────────────────────────────────────────────────
  // Admin — Pages
  // ─────────────────────────────────────────────────────────────

  fetchPages: async (params = {}) => {
    get().setLoading('pages', true);
    try {
      const res = await contentAPI.getPages(params);
      set({ pages: res.data.data ?? [] });
      return { success: true };
    } catch (e) {
      const err = parseError(e);
      console.error('fetchPages', err.message);
      return { success: false, ...err };
    } finally {
      get().setLoading('pages', false);
    }
  },

  fetchPage: async (id) => {
    get().setLoading('page', true);
    try {
      const res = await contentAPI.getPage(id);
      set({ activePage: res.data.data });
      return { success: true };
    } catch (e) {
      const err = parseError(e);
      console.error('fetchPage', err.message);
      return { success: false, ...err };
    } finally {
      get().setLoading('page', false);
    }
  },

  createPage: async (data) => {
    get().setLoading('submitting', true);
    set({ errors: {} });
    try {
      const res = await contentAPI.createPage(data);
      const page = res.data.data;
      set((s) => ({ pages: [page, ...s.pages] }));
      return { success: true, data: page };
    } catch (e) {
      const err = parseError(e);
      set({ errors: err.errors });
      return { success: false, ...err };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  updatePage: async (id, data) => {
    get().setLoading('submitting', true);
    set({ errors: {} });
    try {
      const res = await contentAPI.updatePage(id, data);
      const updated = res.data.data;
      set((s) => ({
        pages: s.pages.map((p) => (p.id === id ? { ...p, ...updated } : p)),
        activePage: s.activePage?.id === id ? updated : s.activePage,
      }));
      return { success: true, data: updated };
    } catch (e) {
      const err = parseError(e);
      set({ errors: err.errors });
      return { success: false, ...err };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  togglePage: async (id) => {
    try {
      const res = await contentAPI.togglePage(id);
      const updated = res.data.data;
      set((s) => ({
        pages:      s.pages.map((p) => (p.id === id ? { ...p, ...updated } : p)),
        activePage: s.activePage?.id === id ? { ...s.activePage, ...updated } : s.activePage,
      }));
      return { success: true, data: updated };
    } catch (e) {
      return { success: false, ...parseError(e) };
    }
  },

  deletePage: async (id) => {
    try {
      await contentAPI.deletePage(id);
      set((s) => ({
        pages:      s.pages.filter((p) => p.id !== id),
        activePage: s.activePage?.id === id ? null : s.activePage,
      }));
      return { success: true };
    } catch (e) {
      return { success: false, ...parseError(e) };
    }
  },

  // ─────────────────────────────────────────────────────────────
  // Admin — Sections
  // ─────────────────────────────────────────────────────────────

  createSection: async (pageId, data) => {
    get().setLoading('section', true);
    set({ errors: {} });
    try {
      const res = await contentAPI.createSection(pageId, data);
      const section = res.data.data;
      set((s) => ({
        activePage: s.activePage
          ? {
              ...s.activePage,
              sections: [...(s.activePage.sections ?? []), section],
            }
          : s.activePage,
      }));
      return { success: true, data: section };
    } catch (e) {
      const err = parseError(e);
      set({ errors: err.errors });
      return { success: false, ...err };
    } finally {
      get().setLoading('section', false);
    }
  },

  updateSection: async (pageId, sectionId, data) => {
    get().setLoading('section', true);
    set({ errors: {} });
    try {
      const res = await contentAPI.updateSection(pageId, sectionId, data);
      const updated = res.data.data;
      set((s) => ({
        activePage: s.activePage
          ? {
              ...s.activePage,
              sections: s.activePage.sections.map((sec) =>
                sec.id === sectionId ? updated : sec
              ),
            }
          : s.activePage,
      }));
      return { success: true, data: updated };
    } catch (e) {
      const err = parseError(e);
      set({ errors: err.errors });
      return { success: false, ...err };
    } finally {
      get().setLoading('section', false);
    }
  },

  reorderSections: async (pageId, sections) => {
    // Optimistic update — apply new order immediately before the request
    set((s) => ({
      activePage: s.activePage
        ? {
            ...s.activePage,
            sections: [...s.activePage.sections].sort((a, b) => {
              const aOrder = sections.find((x) => x.id === a.id)?.sort_order ?? a.sort_order;
              const bOrder = sections.find((x) => x.id === b.id)?.sort_order ?? b.sort_order;
              return aOrder - bOrder;
            }),
          }
        : s.activePage,
    }));

    get().setLoading('reorder', true);
    try {
      const res = await contentAPI.reorderSections(pageId, sections);
      // Sync with server-confirmed order
      set((s) => ({
        activePage: s.activePage
          ? { ...s.activePage, sections: res.data.data }
          : s.activePage,
      }));
      return { success: true };
    } catch (e) {
      // Revert optimistic update by re-fetching
      get().fetchPage(pageId);
      return { success: false, ...parseError(e) };
    } finally {
      get().setLoading('reorder', false);
    }
  },

  uploadSectionImage: async (pageId, file) => {
    try {
      const res = await contentAPI.uploadSectionImage(pageId, file);
      return { success: true, url: res.data.url };
    } catch (e) {
      return { success: false, ...parseError(e) };
    }
  },

  toggleSection: async (pageId, sectionId) => {
    try {
      const res = await contentAPI.toggleSection(pageId, sectionId);
      const updated = res.data.data;
      set((s) => ({
        activePage: s.activePage
          ? {
              ...s.activePage,
              sections: s.activePage.sections.map((sec) =>
                sec.id === sectionId ? updated : sec
              ),
            }
          : s.activePage,
      }));
      return { success: true, data: updated };
    } catch (e) {
      return { success: false, ...parseError(e) };
    }
  },

  deleteSection: async (pageId, sectionId) => {
    try {
      await contentAPI.deleteSection(pageId, sectionId);
      set((s) => ({
        activePage: s.activePage
          ? {
              ...s.activePage,
              sections: s.activePage.sections.filter((sec) => sec.id !== sectionId),
            }
          : s.activePage,
      }));
      return { success: true };
    } catch (e) {
      return { success: false, ...parseError(e) };
    }
  },

  // ─────────────────────────────────────────────────────────────
  // Public — Customer-facing
  // ─────────────────────────────────────────────────────────────

  /**
   * Fetches the lightweight page list used to generate nav/footer links.
   * Returns [{ id, slug, title, page_type }]
   */
  fetchPublicPages: async () => {
    get().setLoading('public', true);
    try {
      const res = await contentAPI.getPublicPages();
      set({ publicPages: res.data.data ?? [] });
      return { success: true };
    } catch (e) {
      const err = parseError(e);
      console.error('fetchPublicPages', err.message);
      return { success: false, ...err };
    } finally {
      get().setLoading('public', false);
    }
  },

  /**
   * Fetches a full page into publicPage.
   * Used by About, Contact, Manual, Homepage.
   * Do NOT use for footer — use fetchFooterPage instead.
   */
  fetchPublicPage: async (slug) => {
    get().setLoading('public', true);
    try {
      const res = await contentAPI.getPageBySlug(slug);
      set({ publicPage: res.data.data });
      return { success: true };
    } catch (e) {
      const err = parseError(e);
      console.error('fetchPublicPage', err.message);
      set({ publicPage: null });
      return { success: false, ...err };
    } finally {
      get().setLoading('public', false);
    }
  },

  // ─────────────────────────────────────────────────────────────
    // Public — Footer (dedicated slot)
    // ─────────────────────────────────────────────────────────────
  
    /**
     * Fetches the footer page into its own dedicated slot.
     * Safe to call from the global Footer component regardless of
     * which customer page is currently mounted. Skips if already loaded.
     */
    fetchFooterPage: async () => {
      if (get().footerPage) return { success: true };
  
      get().setLoading('footer', true);
      try {
        const res = await contentAPI.getPageBySlug('footer');
        set({ footerPage: res.data.data });
        return { success: true };
      } catch (e) {
        const err = parseError(e);
        console.error('fetchFooterPage', err.message);
        return { success: false, ...err };
      } finally {
        get().setLoading('footer', false);
      }
    },
  }));

export default useContentStore;