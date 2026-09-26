import api from './axios';

const referralsAPI = {
  // ── Admin ──────────────────────────────────────────────
  getAll: (params = {}) =>
    api.get('/admin/referrals', { params }).then(r => r.data),

  getStatistics: () =>
    api.get('/admin/referrals/statistics').then(r => r.data),

  getAnalytics: (days = 30) =>
    api.get('/admin/referrals/analytics', { params: { days } }).then(r => r.data),

  getTopPerformers: (params = {}) =>
    api.get('/admin/referrals/top-performers', { params }).then(r => r.data),

  getById: (id) =>
    api.get(`/admin/referrals/${id}`).then(r => r.data),

  getUsage: (id, params = {}) =>
    api.get(`/admin/referrals/${id}/usage`, { params }).then(r => r.data),

  create: (data) =>
    api.post('/admin/referrals', data).then(r => r.data),

  update: (id, data) =>
    api.put(`/admin/referrals/${id}`, data).then(r => r.data),

  activate: (id) =>
    api.post(`/admin/referrals/${id}/activate`).then(r => r.data),

  pause: (id) =>
    api.post(`/admin/referrals/${id}/pause`).then(r => r.data),

  archive: (id) =>
    api.post(`/admin/referrals/${id}/archive`).then(r => r.data),

  delete: (id) =>
    api.delete(`/admin/referrals/${id}`).then(r => r.data),

  // ── Customer ───────────────────────────────────────────
  validate: (code, orderValue = 0) =>
    api.post('/referral/validate', { code, order_value: orderValue }).then(r => r.data),

  myCode: () =>
    api.get('/customer/referrals/code').then(r => r.data),

  myReferrals: (params = {}) =>
    api.get('/customer/referrals', { params }).then(r => r.data),

  myEarnings: () =>
    api.get('/customer/referrals/earnings').then(r => r.data),

  // ── Params builder ─────────────────────────────────────
  buildParams: (filters = {}) => {
    const p = {};
    if (filters.search)      p.search      = filters.search;
    if (filters.type)        p.type        = filters.type;
    if (filters.status)      p.status      = filters.status;
    if (filters.reward_type) p.reward_type = filters.reward_type;
    if (filters.public)      p.public      = true;
    if (filters.expiring)    p.expiring    = true;
    if (filters.sort_by)     p.sort_by     = filters.sort_by;
    if (filters.sort_order)  p.sort_order  = filters.sort_order;
    if (filters.per_page)    p.per_page    = filters.per_page;
    if (filters.page)        p.page        = filters.page;
    return p;
  },
};

export default referralsAPI;