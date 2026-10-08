import api from './axios';

const costCentresAPI = {
  /** { ready, data: [tree rows], settings, default_keys, types } */
  list: () => api.get('/admin/cost-centres').then((r) => r.data),
  create: (d) => api.post('/admin/cost-centres', d).then((r) => r.data),
  update: (id, d) => api.put(`/admin/cost-centres/${id}`, d).then((r) => r.data),
  remove: (id) => api.delete(`/admin/cost-centres/${id}`).then((r) => r.data),
  saveSettings: (d) => api.put('/admin/cost-centres/settings', d).then((r) => r.data),
};

export default costCentresAPI;
