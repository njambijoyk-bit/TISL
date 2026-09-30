import api from './axios';

/** Stock between branches. Admin / finance / manager (acting: admin / finance). */
const stockTransfersAPI = {
  list: async (params) => (await api.get('/admin/stock/transfers', { params })).data,
  show: async (id) => (await api.get(`/admin/stock/transfers/${id}`)).data,
  send: async (payload) => (await api.post('/admin/stock/transfers', payload)).data,
  receive: async (id, received) => (await api.post(`/admin/stock/transfers/${id}/receive`, { received })).data,
  cancel: async (id) => (await api.post(`/admin/stock/transfers/${id}/cancel`)).data,
};

export default stockTransfersAPI;
