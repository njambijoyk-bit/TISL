import api from './axios';

/** The pin library, staff side (the Campaigns module). Files go as multipart form data. */
const form = (fields, files = {}) => {
  const f = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') f.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : Array.isArray(v) ? v.join(',') : v); });
  Object.entries(files).forEach(([k, v]) => { if (v) f.append(k, v); });
  return f;
};
const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

const pinsAPI = {
  settings: async () => (await api.get('/admin/pins/settings')).data.data,
  saveSettings: async (data) => (await api.put('/admin/pins/settings', data)).data,
  customers: async (q) => (await api.get('/admin/pins/customers', { params: { q: q || undefined } })).data.data,
  list: async (params) => (await api.get('/admin/pins', { params })).data,
  create: async (fields, files) => (await api.post('/admin/pins', form(fields, files), multipart)).data,
  update: async (id, fields) => (await api.put(`/admin/pins/${id}`, fields)).data,
  media: async (id, fields, files) => (await api.post(`/admin/pins/${id}/media`, form(fields, files), multipart)).data,
  hide: async (id, reason) => (await api.post(`/admin/pins/${id}/hide`, { reason })).data,
  unhide: async (id) => (await api.post(`/admin/pins/${id}/unhide`)).data,
  remove: async (id) => (await api.delete(`/admin/pins/${id}`)).data,
  restore: async (id) => (await api.post(`/admin/pins/${id}/restore`)).data,
  purge: async (id) => (await api.delete(`/admin/pins/${id}/purge`)).data,
};

export default pinsAPI;
