import api from './axios';

const tendersAPI = {
  list: async (params) => (await api.get('/admin/tenders', { params })).data,
  show: async (id) => (await api.get(`/admin/tenders/${id}`)).data,
  create: async (data) => (await api.post('/admin/tenders', data)).data,
  update: async (id, data) => (await api.put(`/admin/tenders/${id}`, data)).data,
  publish: async (id) => (await api.post(`/admin/tenders/${id}/publish`)).data,
  close: async (id) => (await api.post(`/admin/tenders/${id}/close`)).data,
  cancel: async (id) => (await api.post(`/admin/tenders/${id}/cancel`)).data,

  // Documents
  uploadDocument: async (id, formData) =>
    (await api.post(`/admin/tenders/${id}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
  deleteDocument: async (tenderId, docId) =>
    (await api.delete(`/admin/tenders/${tenderId}/documents/${docId}`)).data,

  // Invitations
  invite: async (id, vendorIds) => (await api.post(`/admin/tenders/${id}/invite`, { vendor_ids: vendorIds })).data,

  // Bids
  bids: async (id) => (await api.get(`/admin/tenders/${id}/bids`)).data,
  evaluateBid: async (tenderId, bidId, data) =>
    (await api.put(`/admin/tenders/${tenderId}/bids/${bidId}/evaluate`, data)).data,
  awardBid: async (tenderId, bidId) =>
    (await api.post(`/admin/tenders/${tenderId}/bids/${bidId}/award`)).data,
};

export default tendersAPI;
