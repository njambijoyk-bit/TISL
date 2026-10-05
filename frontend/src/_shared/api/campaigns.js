import api from './axios';

/** Campaigns, admin side (the Campaigns module). Builders see their own; publishing is for admin, super admin and manager. */
const campaignsAPI = {
  types: async () => (await api.get('/admin/campaigns/types')).data,
  list: async (params) => (await api.get('/admin/campaigns', { params })).data,
  get: async (id) => (await api.get(`/admin/campaigns/${id}`)).data,
  create: async (data) => (await api.post('/admin/campaigns', data)).data,
  update: async (id, data) => (await api.put(`/admin/campaigns/${id}`, data)).data,
  publish: async (id) => (await api.post(`/admin/campaigns/${id}/publish`)).data,
  unpublish: async (id) => (await api.post(`/admin/campaigns/${id}/unpublish`)).data,
  pause: async (id) => (await api.post(`/admin/campaigns/${id}/pause`)).data,
  submit: async (id) => (await api.post(`/admin/campaigns/${id}/submit`)).data,
  withdraw: async (id) => (await api.post(`/admin/campaigns/${id}/withdraw`)).data,
  approve: async (id) => (await api.post(`/admin/campaigns/${id}/approve`)).data,
  reject: async (id, note) => (await api.post(`/admin/campaigns/${id}/reject`, { note })).data,
  archive: async (id) => (await api.post(`/admin/campaigns/${id}/archive`)).data,
  remove: async (id) => (await api.delete(`/admin/campaigns/${id}`)).data,
  uploadCover: async (id, file) => {
    const form = new FormData();
    form.append('cover', file);
    return (await api.post(`/admin/campaigns/${id}/cover`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  savePage: async (id, sections) => (await api.put(`/admin/campaigns/${id}/page`, { sections })).data,
  catalogue: async (type, q) => (await api.get('/admin/campaigns/catalogue', { params: { type, q } })).data,
  uploadMedia: async (id, file, kind) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    return (await api.post(`/admin/campaigns/${id}/media`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  removeCover: async (id) => (await api.delete(`/admin/campaigns/${id}/cover`)).data,
};

export default campaignsAPI;
