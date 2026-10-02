import api from './axios';

/** Verification: the verifier's register and statuses, and the set-up (admin, finance). It never changes the books. */
const verificationAPI = {
  get: async (month, all) => (await api.get('/admin/verification', { params: { month, all: all ? 1 : undefined } })).data,
  items: async (month, type, all) => (await api.get('/admin/verification/items', { params: { month, type, all: all ? 1 : undefined } })).data,
  pickList: async (month, type) => (await api.get('/admin/verification/pick-list', { params: { month, type } })).data,
  show: async (id) => (await api.get(`/admin/verification/items/${id}`)).data,
  mark: async (id, p) => (await api.post(`/admin/verification/items/${id}/mark`, p)).data,
  pick: async (id, selected) => (await api.post(`/admin/verification/items/${id}/pick`, { selected })).data,
  config: async () => (await api.get('/admin/verification/config')).data,
  saveAssignment: async (p, id) => (id ? (await api.put(`/admin/verification/assignments/${id}`, p)) : (await api.post('/admin/verification/assignments', p))).data,
  deleteAssignment: async (id) => (await api.delete(`/admin/verification/assignments/${id}`)).data,
  saveSettings: async (p) => (await api.put('/admin/verification/settings', p)).data,
};

export default verificationAPI;
