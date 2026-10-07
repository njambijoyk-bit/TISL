import api from './axios';

const data = (r) => r.data;

/** Brochures and catalogues, their settings, and each item's own brochure choices: staff routes and the customer routes. */
const cataloguesAPI = {
  // staff
  settings: () => api.get('/admin/catalogue-settings').then(data),
  saveSettings: (body) => api.put('/admin/catalogue-settings', body).then(data),
  list: (params) => api.get('/admin/catalogues', { params }).then(data),
  show: (id) => api.get(`/admin/catalogues/${id}`).then(data),
  create: (body) => api.post('/admin/catalogues', body).then(data),
  update: (id, body) => api.put(`/admin/catalogues/${id}`, body).then(data),
  trash: (id) => api.delete(`/admin/catalogues/${id}`).then(data),
  restore: (id) => api.post(`/admin/catalogues/${id}/restore`).then(data),
  purge: (id) => api.delete(`/admin/catalogues/${id}/purge`).then(data),
  picker: (type, q) => api.get('/admin/catalogues/picker', { params: { type, q } }).then(data),
  expand: (picks) => api.post('/admin/catalogues/expand', { picks }).then(data),
  data: (id, params) => api.get(`/admin/catalogues/${id}/data`, { params }).then(data),
  items: (params) => api.get('/admin/catalogues/items', { params }).then(data),
  saveItemMeta: (type, id, meta) => api.put(`/admin/catalogues/item-meta/${type}/${id}`, meta).then(data),
  bulkItemMeta: (body) => api.post('/admin/catalogues/item-meta/bulk', body).then(data),
  // customers
  status: (params) => api.get('/catalogue/status', { params }).then(data),
  itemBrochure: (type, id) => api.get(`/catalogue/item/${type}/${id}`).then(data),
  publicList: () => api.get('/catalogues').then(data),
  publicData: (id, params) => api.get(`/catalogues/${id}/data`, { params }).then(data),
};

export default cataloguesAPI;
