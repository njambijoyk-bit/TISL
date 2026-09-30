import api from './axios';

/** The expiry list: what is expired or about to be, and what can be done with it. Admin / finance / manager (acting: admin / finance). */
const stockExpiryAPI = {
  list: async (params) => (await api.get('/admin/stock/expiry', { params })).data,
  writeOff: async (payload) => (await api.post('/admin/stock/expiry/write-off', payload)).data,
  returnToSupplier: async (payload) => (await api.post('/admin/stock/expiry/return-to-supplier', payload)).data,
};

/** Held stock: quarantine, recall, trace and clearance price on a batch. */
export const stockHoldsAPI = {
  list: async () => (await api.get('/admin/stock/holds')).data,
  search: async (q) => (await api.get('/admin/stock/holds/search', { params: { q } })).data,
  show: async (id) => (await api.get(`/admin/stock/holds/${id}`)).data,
  act: async (id, action, payload = {}) => (await api.post(`/admin/stock/holds/${id}/${action}`, payload)).data,
};

export default stockExpiryAPI;
