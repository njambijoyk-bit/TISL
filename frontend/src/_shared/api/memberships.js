import api from './axios';

/** Memberships (admin): plans, their benefits and the settings. */
export const membershipsAPI = {
  meta: async () => (await api.get('/admin/memberships/meta')).data,
  saveSettings: async (payload) => (await api.put('/admin/memberships/settings', payload)).data,
  plans: async (params) => (await api.get('/admin/memberships/plans', { params })).data,
  plan: async (id) => (await api.get(`/admin/memberships/plans/${id}`)).data,
  createPlan: async (payload) => (await api.post('/admin/memberships/plans', payload)).data,
  savePlan: async (id, payload) => (await api.put(`/admin/memberships/plans/${id}`, payload)).data,
  setStatus: async (id, action) => (await api.post(`/admin/memberships/plans/${id}/${action}`)).data,
  removePlan: async (id) => (await api.delete(`/admin/memberships/plans/${id}`)).data,
};

export default membershipsAPI;
