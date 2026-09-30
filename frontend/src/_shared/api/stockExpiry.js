import api from './axios';

/** The expiry list: what is expired or about to be, and what can be done with it. Admin / finance / manager (acting: admin / finance). */
const stockExpiryAPI = {
  list: async (params) => (await api.get('/admin/stock/expiry', { params })).data,
  writeOff: async (payload) => (await api.post('/admin/stock/expiry/write-off', payload)).data,
  returnToSupplier: async (payload) => (await api.post('/admin/stock/expiry/return-to-supplier', payload)).data,
};

export default stockExpiryAPI;
