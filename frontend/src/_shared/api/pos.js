import api from './axios';

/** Point of sale (Extras module), admin side: stations and the receipt paper each branch offers (/admin/pos). */
const posAPI = {
  stations: async () => (await api.get('/admin/pos/stations')).data,
  saveStation: async (body, id = null) => (await (id ? api.put(`/admin/pos/stations/${id}`, body) : api.post('/admin/pos/stations', body))).data,
  deleteStation: async (id) => (await api.delete(`/admin/pos/stations/${id}`)).data,
  saveBranch: async (locationId, body) => (await api.put(`/admin/pos/branches/${locationId}`, body)).data,

  // the cashier's till
  context: async (stationId) => (await api.get('/admin/pos/context', { params: stationId ? { station_id: stationId } : {} })).data,
  catalogue: async (q) => (await api.get('/admin/pos/catalogue', { params: { q } })).data,
  scan: async (code) => (await api.get('/admin/pos/scan', { params: { code } })).data,
  price: async (body) => (await api.post('/admin/pos/price', body)).data,
  sell: async (body) => (await api.post('/admin/pos/sales', body)).data,
  customers: async (q) => (await api.get('/admin/pos/customers', { params: { q } })).data,
  mySales: async () => (await api.get('/admin/pos/sales')).data,
  holds: async () => (await api.get('/admin/pos/holds')).data,
  hold: async (body) => (await api.post('/admin/pos/holds', body)).data,
  recall: async (id) => (await api.post(`/admin/pos/holds/${id}/recall`)).data,
  dropHold: async (id) => (await api.delete(`/admin/pos/holds/${id}`)).data,
};

export default posAPI;
