import api from './axios';

const usersAPI = {
  getUsers: (params = {}) =>
    api.get('/admin/users', { params }).then(r => r.data),

  getStatistics: () =>
    api.get('/admin/users/statistics').then(r => r.data),

  getDepartments: () =>
    api.get('/admin/users/departments').then(r => r.data),

  getById: (id) =>
    api.get(`/admin/users/${id}`).then(r => r.data),

  create: (data) =>
    api.post('/admin/users', data).then(r => r.data),

  update: (id, data) =>
    api.put(`/admin/users/${id}`, data).then(r => r.data),

  delete: (id) =>
    api.delete(`/admin/users/${id}`).then(r => r.data),

  restore: (id) =>
    api.post(`/admin/users/${id}/restore`).then(r => r.data),

  forceDelete: (id) =>
    api.delete(`/admin/users/${id}/force`).then(r => r.data),

  forcePasswordReset: (id) =>
    api.post(`/admin/users/${id}/force-password-reset`).then(r => r.data),

  updateStatus: (id, status) =>
    api.post(`/admin/users/${id}/update-status`, { status }).then(r => r.data),

  unlock: (id) =>
    api.post(`/admin/users/${id}/unlock`).then(r => r.data),

  resetPassword: (id, password) =>
    api.post(`/admin/users/${id}/reset-password`, { password }).then(r => r.data),

  // Verification
    verifyEmail:   (id) => api.post(`/admin/users/${id}/verify-email`).then(r => r.data),
    unverifyEmail: (id) => api.post(`/admin/users/${id}/unverify-email`).then(r => r.data),
    verifyPhone:   (id) => api.post(`/admin/users/${id}/verify-phone`).then(r => r.data),
    unverifyPhone: (id) => api.post(`/admin/users/${id}/unverify-phone`).then(r => r.data),
    lockAccount:   (id, duration_minutes) =>
    api.post(`/admin/users/${id}/lock`, { duration_minutes }).then(r => r.data),

  bulkDelete: (ids) =>
    api.post('/admin/users/bulk-destroy', { ids }).then(r => r.data),

  bulkRestore: (ids) =>
    api.post('/admin/users/bulk-restore', { ids }).then(r => r.data),

  buildParams: (filters = {}) => {
    const p = {};
    if (filters.tab)        p.tab        = filters.tab;
    if (filters.search)     p.search     = filters.search;
    if (filters.role)       p.role       = filters.role;
    if (filters.status)     p.status     = filters.status;
    if (filters.department) p.department = filters.department;
    if (filters.locked)     p.locked     = true;
    if (filters.unverified) p.unverified = true;
    if (filters.trashed)    p.trashed    = true;
    if (filters.sort_by)    p.sort_by    = filters.sort_by;
    if (filters.sort_order) p.sort_order = filters.sort_order;
    if (filters.per_page)   p.per_page   = filters.per_page;
    if (filters.page)       p.page       = filters.page;
    return p;
  },
};

export default usersAPI;