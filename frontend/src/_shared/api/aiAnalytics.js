import api from './axios';

const BASE = '/admin/ai-analytics';

const aiAnalyticsAPI = {

  // ── Keys ──────────────────────────────────────────────────────────
  getKeys: () =>
    api.get(`${BASE}/keys`).then(r => r.data),

  addKey: (payload) =>
    api.post(`${BASE}/keys`, payload).then(r => r.data),

  // switch a key on or off (several can be in use at once)
  activateKey: (id) =>
    api.post(`${BASE}/keys/${id}/activate`).then(r => r.data),

  updateKey: (id, payload) =>
    api.put(`${BASE}/keys/${id}`, payload).then(r => r.data),

  // make a key the first one tried
  firstChoice: (id) =>
    api.post(`${BASE}/keys/${id}/first`).then(r => r.data),

  // send a tiny question with the key: { ok, model, reply, ms } or { ok: false, message }
  testKey: (id) =>
    api.post(`${BASE}/keys/${id}/test`).then(r => r.data),

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