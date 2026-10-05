import api from './axios';

const memorandaAPI = {
  list: async (params) => (await api.get('/memoranda', { params })).data,
  get: async (id) => (await api.get(`/memoranda/${id}`)).data,
  create: async (data) => (await api.post('/memoranda', data)).data,
  update: async (id, data) => (await api.put(`/memoranda/${id}`, data)).data,
  dismiss: async (id, reason) => (await api.delete(`/memoranda/${id}`, { data: { reason } })).data,
  convert: async (id, data) => (await api.post(`/memoranda/${id}/convert`, data)).data,
};

export default memorandaAPI;
