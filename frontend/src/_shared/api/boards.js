import api from './axios';

/** Boards, staff side (the Campaigns module). Builders see their own; publishing is for admin, super admin and manager. */
const boardsAPI = {
  list: async (params) => (await api.get('/admin/boards', { params })).data,
  get: async (id) => (await api.get(`/admin/boards/${id}`)).data,
  create: async (data) => (await api.post('/admin/boards', data)).data,
  update: async (id, data) => (await api.put(`/admin/boards/${id}`, data)).data,
  addPins: async (id, pinIds) => (await api.post(`/admin/boards/${id}/pins`, { pin_ids: pinIds })).data,
  removePin: async (id, pinId) => (await api.delete(`/admin/boards/${id}/pins/${pinId}`)).data,
  reorder: async (id, ids) => (await api.put(`/admin/boards/${id}/pins/order`, { ids })).data,
  submit: async (id) => (await api.post(`/admin/boards/${id}/submit`)).data,
  withdraw: async (id) => (await api.post(`/admin/boards/${id}/withdraw`)).data,
  approve: async (id) => (await api.post(`/admin/boards/${id}/approve`)).data,
  reject: async (id, note) => (await api.post(`/admin/boards/${id}/reject`, { note })).data,
  hide: async (id, reason) => (await api.post(`/admin/boards/${id}/hide`, { reason })).data,
  unhide: async (id) => (await api.post(`/admin/boards/${id}/unhide`)).data,
  remove: async (id) => (await api.delete(`/admin/boards/${id}`)).data,
};

export default boardsAPI;
