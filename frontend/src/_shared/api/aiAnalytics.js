import api from './axios';

const BASE = '/admin/ai-analytics';

const aiAnalyticsAPI = {

  // ── Keys ──────────────────────────────────────────────────────────
  getKeys: () =>
    api.get(`${BASE}/keys`).then(r => r.data),

  addKey: (payload) =>
    api.post(`${BASE}/keys`, payload).then(r => r.data),

  activateKey: (id) =>
    api.post(`${BASE}/keys/${id}/activate`).then(r => r.data),

  deleteKey: (id) =>
    api.delete(`${BASE}/keys/${id}`).then(r => r.data),

  // ── Modules ───────────────────────────────────────────────────────
  getModules: () =>
    api.get(`${BASE}/modules`).then(r => r.data),

  toggleModule: (id) =>
    api.patch(`${BASE}/modules/${id}/toggle`).then(r => r.data),

  // ── Sessions ──────────────────────────────────────────────────────
  getSessions: (params = {}) =>
    api.get(`${BASE}/sessions`, { params }).then(r => r.data),

  getSessionStats: () =>
    api.get(`${BASE}/sessions/stats`).then(r => r.data),

  // ── Analyse ───────────────────────────────────────────────────────
  analyse: (payload) =>
    api.post(`${BASE}/analyse`, payload).then(r => r.data),

  // ── Outputs ───────────────────────────────────────────────────────
  getModuleOutputs: (moduleKey, params = {}) =>
    api.get(`${BASE}/outputs/${moduleKey}`, { params }).then(r => r.data),

  dismissOutput: (id) =>
    api.patch(`${BASE}/outputs/${id}/dismiss`).then(r => r.data),
};

export default aiAnalyticsAPI;