import api from './axios';

/** Vendors: the people we buy from (a Sundry Creditors ledger each; no login or portal). */
const vendorsAPI = {
  list: async (params) => (await api.get('/admin/vendors', { params })).data,
  show: async (id) => (await api.get(`/admin/vendors/${id}`)).data,
  create: async (payload) => (await api.post('/admin/vendors', payload)).data,
  update: async (id, payload) => (await api.put(`/admin/vendors/${id}`, payload)).data,
};

export default vendorsAPI;
