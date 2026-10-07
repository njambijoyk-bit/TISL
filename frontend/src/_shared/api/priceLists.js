import api from './axios';

const data = (r) => r.data;
const blob = async (url) => (await api.get(url, { responseType: 'blob' })).data;

/** Price lists and the Archive: staff routes (make, publish, bin, download) and the customer routes (what they may see). */
const priceListsAPI = {
  // staff
  list: (params) => api.get('/admin/price-lists', { params }).then(data),
  show: (id) => api.get(`/admin/price-lists/${id}`).then(data),
  create: (body) => api.post('/admin/price-lists', body).then(data),
  update: (id, body) => api.put(`/admin/price-lists/${id}`, body).then(data),
  refresh: (id) => api.post(`/admin/price-lists/${id}/refresh`).then(data),
  publish: (id) => api.post(`/admin/price-lists/${id}/publish`).then(data),
  activate: (id) => api.post(`/admin/price-lists/${id}/activate`).then(data),
  withdraw: (id) => api.post(`/admin/price-lists/${id}/withdraw`).then(data),
  trash: (id) => api.delete(`/admin/price-lists/${id}`).then(data),
  restore: (id) => api.post(`/admin/price-lists/${id}/restore`).then(data),
  purge: (id) => api.delete(`/admin/price-lists/${id}/purge`).then(data),
  picker: (type, q) => api.get('/admin/price-lists/picker', { params: { type, q } }).then(data),
  csv: (id) => blob(`/admin/price-lists/${id}/csv`),
  json: (id) => blob(`/admin/price-lists/${id}/json`),
  archiveList: () => api.get('/admin/price-list-archives').then(data),
  archiveAdd: (form) => api.post('/admin/price-list-archives', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(data),
  archiveUpdate: (id, body) => api.put(`/admin/price-list-archives/${id}`, body).then(data),
  archiveDelete: (id) => api.delete(`/admin/price-list-archives/${id}`).then(data),
  // customers
  publicList: () => api.get('/price-lists').then(data),
  publicShow: (id) => api.get(`/price-lists/${id}`).then(data),
  publicCsv: (id) => blob(`/price-lists/${id}/csv`),
  publicJson: (id) => blob(`/price-lists/${id}/json`),
  publicArchive: () => api.get('/price-list-archives').then(data),
  publicArchiveFile: (id) => blob(`/price-list-archives/${id}/file`),
};

export default priceListsAPI;
