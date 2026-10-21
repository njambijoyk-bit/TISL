import api from './axios';

/** Vendors: the people we buy from (a Sundry Creditors ledger each; optionally a login to the vendor portal, Extras). */
const vendorsAPI = {
  list: async (params) => (await api.get('/admin/vendors', { params })).data,
  show: async (id) => (await api.get(`/admin/vendors/${id}`)).data,
  create: async (payload) => (await api.post('/admin/vendors', payload)).data,
  update: async (id, payload) => (await api.put(`/admin/vendors/${id}`, payload)).data,
  verify: async (id, verified) => (await api.post(`/admin/vendors/${id}/verify`, { verified })).data,
  confirmPeopleCategory: async (id, confirmed) => (await api.post(`/admin/vendors/${id}/people-category`, { confirmed })).data,
  portalLogin: async (id, payload) => (await api.post(`/admin/vendors/${id}/portal-login`, payload)).data,
  portalPassword: async (id, payload) => (await api.post(`/admin/vendors/${id}/portal-password`, payload)).data,
};

export default vendorsAPI;
