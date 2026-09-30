import api from './axios';

/** Settings → Stock & expiry (Core; admin / super_admin). */
const stockSettingsAPI = {
  get: async () => (await api.get('/admin/stock/settings')).data,
  save: async (settings) => (await api.put('/admin/stock/settings', settings)).data,
  saveOverride: async (scope, scopeId, settings) => (await api.put('/admin/stock/settings/overrides', { scope, scope_id: scopeId, settings })).data,
  deleteOverride: async (id) => (await api.delete(`/admin/stock/settings/overrides/${id}`)).data,
  targets: async (scope, q) => (await api.get('/admin/stock/settings/targets', { params: { scope, q } })).data,
};

export default stockSettingsAPI;
