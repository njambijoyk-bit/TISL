import api from './axios';

/** Moodboards: the staff side (admin routes) and the public side (world routes). */
const moodboardsAPI = {
  presets: async () => (await api.get('/admin/moodboards/presets')).data,
  list: async (params) => (await api.get('/admin/moodboards', { params })).data,
  get: async (id) => (await api.get(`/admin/moodboards/${id}`)).data.data,
  create: async (title, from) => (await api.post('/admin/moodboards', { title, from })).data,
  update: async (id, data) => (await api.put(`/admin/moodboards/${id}`, data)).data,
  saveTemplate: async (id, title) => (await api.post(`/admin/moodboards/${id}/template`, { title })).data,
  submit: async (id) => (await api.post(`/admin/moodboards/${id}/submit`)).data,
  withdraw: async (id) => (await api.post(`/admin/moodboards/${id}/withdraw`)).data,
  approve: async (id) => (await api.post(`/admin/moodboards/${id}/approve`)).data,
  reject: async (id, note) => (await api.post(`/admin/moodboards/${id}/reject`, { note })).data,
  hide: async (id) => (await api.post(`/admin/moodboards/${id}/hide`)).data,
  unhide: async (id) => (await api.post(`/admin/moodboards/${id}/unhide`)).data,
  remove: async (id) => (await api.delete(`/admin/moodboards/${id}`)).data,
  restore: async (id) => (await api.post(`/admin/moodboards/${id}/restore`)).data,
  purge: async (id) => (await api.delete(`/admin/moodboards/${id}/purge`)).data,
  publicList: async (after) => (await api.get('/world/moodboards', { params: { after: after || undefined } })).data,
  publicGet: async (id) => (await api.get(`/world/moodboards/${id}`)).data.data,
};

export default moodboardsAPI;
