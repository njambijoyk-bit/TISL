import api from './axios';

// Events (ticketed): the staff side. See docs/EVENTS_PLAN.md.
const eventsAPI = {
  list: (params) => api.get('/admin/events', { params }).then((r) => r.data),
  show: (id) => api.get(`/admin/events/${id}`).then((r) => r.data),
  create: (body) => api.post('/admin/events', body).then((r) => r.data),
  update: (id, body) => api.put(`/admin/events/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/admin/events/${id}`).then((r) => r.data),
  publish: (id) => api.post(`/admin/events/${id}/publish`).then((r) => r.data),
  unpublish: (id) => api.post(`/admin/events/${id}/unpublish`).then((r) => r.data),
  cancel: (id) => api.post(`/admin/events/${id}/cancel`).then((r) => r.data),
  /** the dates of a repeat, to look over before they are added */
  recurrence: (rule) => api.post('/admin/events/recurrence', rule).then((r) => r.data),
  uploadImage: (id, file) => { const f = new FormData(); f.append('file', file); return api.post(`/admin/events/${id}/image`, f, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data); },
  removeImage: (id) => api.delete(`/admin/events/${id}/image`).then((r) => r.data),
  settings: () => api.get('/admin/events/settings').then((r) => r.data),
  saveSettings: (body) => api.put('/admin/events/settings', body).then((r) => r.data),
};

export default eventsAPI;
