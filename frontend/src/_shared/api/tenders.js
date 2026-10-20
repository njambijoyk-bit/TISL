import api from './axios';

const form = { headers: { 'Content-Type': 'multipart/form-data' } };

const tendersAPI = {
  list: async (params) => (await api.get('/admin/tenders', { params })).data,
  show: async (id) => (await api.get(`/admin/tenders/${id}`)).data,
  create: async (data) => (await api.post('/admin/tenders', data)).data,
  update: async (id, data) => (await api.put(`/admin/tenders/${id}`, data)).data,
  publish: async (id, data) => (await api.post(`/admin/tenders/${id}/publish`, data)).data,
  reopen: async (id, data) => (await api.post(`/admin/tenders/${id}/reopen`, data)).data,
  close: async (id) => (await api.post(`/admin/tenders/${id}/close`)).data,
  cancel: async (id, data) => (await api.post(`/admin/tenders/${id}/cancel`, data)).data,

  // Attachments
  uploadDocument: async (id, formData) => (await api.post(`/admin/tenders/${id}/documents`, formData, form)).data,
  updateDocument: async (id, docId, data) => (await api.put(`/admin/tenders/${id}/documents/${docId}`, data)).data,
  deleteDocument: async (id, docId) => (await api.delete(`/admin/tenders/${id}/documents/${docId}`)).data,
  documentLink: async (id, docId, inline) => (await api.get(`/admin/tenders/${id}/documents/${docId}/link`, { params: { inline: inline ? 1 : 0 } })).data,

  // Invitations (visibility = invited)
  invite: async (id, data) => (await api.post(`/admin/tenders/${id}/invite`, data)).data,
  uninvite: async (id, vendorId) => (await api.delete(`/admin/tenders/${id}/invite/${vendorId}`)).data,

  // Telling vendors, through the notification system
  eligible: async (id) => (await api.get(`/admin/tenders/${id}/eligible`)).data,
  email: async (id, data) => (await api.post(`/admin/tenders/${id}/email`, data)).data,
};

export default tendersAPI;
