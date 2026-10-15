import api from './axios';

/** Point of sale (Extras module), admin side: stations and the receipt paper each branch offers (/admin/pos). */
const posAPI = {
  stations: async () => (await api.get('/admin/pos/stations')).data,
  saveStation: async (body, id = null) => (await (id ? api.put(`/admin/pos/stations/${id}`, body) : api.post('/admin/pos/stations', body))).data,
  stationAddress: async (id) => (await api.post(`/admin/pos/stations/${id}/token`)).data,
  deleteStation: async (id) => (await api.delete(`/admin/pos/stations/${id}`)).data,
  saveBranch: async (locationId, body) => (await api.put(`/admin/pos/branches/${locationId}`, body)).data,

  // the cashier's till
  context: async (stationId) => (await api.get('/admin/pos/context', { params: stationId ? { station_id: stationId } : {} })).data,
  catalogue: async (q) => (await api.get('/admin/pos/catalogue', { params: { q } })).data,
  scan: async (code) => (await api.get('/admin/pos/scan', { params: { code } })).data,
  price: async (body) => (await api.post('/admin/pos/price', body)).data,
  sell: async (body) => (await api.post('/admin/pos/sales', body)).data,
  customers: async (q) => (await api.get('/admin/pos/customers', { params: { q } })).data,
  supervisors: async (stationId) => (await api.get('/admin/pos/supervisors', { params: stationId ? { station_id: stationId } : {} })).data,
  approve: async (body) => (await api.post('/admin/pos/approve', body)).data,
  setPin: async (pin) => (await api.put('/admin/pos/pin', { pin })).data,
  findReturn: async (number) => (await api.get('/admin/pos/returns/find', { params: { number } })).data,
  makeReturn: async (body) => (await api.post('/admin/pos/returns', body)).data,
  logVoid: async (body) => (await api.post('/admin/pos/voids', body)).data,
  receipt: async (id, paper) => (await api.get(`/admin/pos/sales/${id}/receipt`, { params: paper ? { paper } : {} })).data,
  helpRequests: async () => (await api.get('/admin/pos/help')).data,
  helpDone: async (id) => (await api.post(`/admin/pos/help/${id}/done`)).data,
  shifts: async () => (await api.get('/admin/pos/shifts')).data,
  openShift: async (body) => (await api.post('/admin/pos/shifts', body)).data,
  closeShift: async (id, body) => (await api.post(`/admin/pos/shifts/${id}/close`, body)).data,
  shiftReport: async (id) => (await api.get(`/admin/pos/shifts/${id}/report`)).data,
  mySales: async () => (await api.get('/admin/pos/sales')).data,
  holds: async () => (await api.get('/admin/pos/holds')).data,
  hold: async (body) => (await api.post('/admin/pos/holds', body)).data,
  recall: async (id) => (await api.post(`/admin/pos/holds/${id}/recall`)).data,
  dropHold: async (id) => (await api.delete(`/admin/pos/holds/${id}`)).data,
};

export default posAPI;
