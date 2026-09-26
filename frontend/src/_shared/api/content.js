import api from './axios';

const contentAPI = {
  // ─────────────────────────────────────────────────────────────
  // PUBLIC
  // ─────────────────────────────────────────────────────────────

  /** GET /content — list all active pages (for nav/footer generation) */
  getPublicPages: () =>
    api.get('/content'),

  /** GET /content/:slug — fetch a page with its active sections */
  getPageBySlug: (slug) =>
    api.get(`/content/${slug}`),

  // ─────────────────────────────────────────────────────────────
  // ADMIN — Pages
  // ─────────────────────────────────────────────────────────────

  /** GET /admin/content-pages */
  getPages: (params = {}) =>
    api.get('/admin/content-pages', { params }),

  /** GET /admin/content-pages/:id */
  getPage: (id) =>
    api.get(`/admin/content-pages/${id}`),

  /** POST /admin/content-pages */
  createPage: (data) =>
    api.post('/admin/content-pages', data),

  /** PUT /admin/content-pages/:id */
  updatePage: (id, data) =>
    api.put(`/admin/content-pages/${id}`, data),

  /** PATCH /admin/content-pages/:id/toggle */
  togglePage: (id) =>
    api.patch(`/admin/content-pages/${id}/toggle`),

  /** DELETE /admin/content-pages/:id */
  deletePage: (id) =>
    api.delete(`/admin/content-pages/${id}`),

  // ─────────────────────────────────────────────────────────────
  // ADMIN — Sections
  // ─────────────────────────────────────────────────────────────

  /** GET /admin/content-pages/:pageId/sections */
  getSections: (pageId) =>
    api.get(`/admin/content-pages/${pageId}/sections`),

  /** POST /admin/content-pages/:pageId/sections */
  createSection: (pageId, data) =>
    api.post(`/admin/content-pages/${pageId}/sections`, data),
  
  uploadSectionImage: (pageId, file) => {
    const form = new FormData();
    form.append('image', file);
    return api.post(`/admin/content-pages/${pageId}/sections/upload-image`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** PUT /admin/content-pages/:pageId/sections/:sectionId */
  updateSection: (pageId, sectionId, data) =>
    api.put(`/admin/content-pages/${pageId}/sections/${sectionId}`, data),

  /** POST /admin/content-pages/:pageId/sections/reorder */
  reorderSections: (pageId, sections) =>
    api.post(`/admin/content-pages/${pageId}/sections/reorder`, { sections }),

  /** PATCH /admin/content-pages/:pageId/sections/:sectionId/toggle */
  toggleSection: (pageId, sectionId) =>
    api.patch(`/admin/content-pages/${pageId}/sections/${sectionId}/toggle`),

  /** DELETE /admin/content-pages/:pageId/sections/:sectionId */
  deleteSection: (pageId, sectionId) =>
    api.delete(`/admin/content-pages/${pageId}/sections/${sectionId}`),
};

export default contentAPI;