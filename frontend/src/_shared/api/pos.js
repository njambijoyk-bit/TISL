import api from './axios';

/** Point of sale (Extras module), admin side: stations and the receipt paper each branch offers (/admin/pos). */
const posAPI = {
  stations: async () => (await api.get('/admin/pos/stations')).data,
  saveStation: async (body, id = null) => (await (id ? api.put(`/admin/pos/stations/${id}`, body) : api.post('/admin/pos/stations', body))).data,
  deleteStation: async (id) => (await api.delete(`/admin/pos/stations/${id}`)).data,
  saveBranch: async (locationId, body) => (await api.put(`/admin/pos/branches/${locationId}`, body)).data,
};

export default posAPI;
