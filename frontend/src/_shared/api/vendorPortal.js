import api from './axios';

const vendorPortalAPI = {
  // Dashboard
  dashboard: async () => (await api.get('/vendor-portal/dashboard')).data,

  // Profile
  profile: async () => (await api.get('/vendor-portal/profile')).data,
  updateProfile: async (data) => (await api.put('/vendor-portal/profile', data)).data,

  // Tenders
  tenders: async (params) => (await api.get('/vendor-portal/tenders', { params })).data,
  showTender: async (id) => (await api.get(`/vendor-portal/tenders/${id}`)).data,

  // Bids
  myBids: async () => (await api.get('/vendor-portal/bids')).data,
  createBid: async (tenderId, data) => (await api.post(`/vendor-portal/tenders/${tenderId}/bid`, data)).data,
  submitBid: async (bidId) => (await api.post(`/vendor-portal/bids/${bidId}/submit`)).data,
  withdrawBid: async (bidId) => (await api.post(`/vendor-portal/bids/${bidId}/withdraw`)).data,
  uploadBidDocument: async (bidId, formData) =>
    (await api.post(`/vendor-portal/bids/${bidId}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data,

  // Pre-qualification
  pqTemplates: async () => (await api.get('/vendor-portal/pq/templates')).data,
  showPqTemplate: async (id) => (await api.get(`/vendor-portal/pq/templates/${id}`)).data,
  myPqs: async () => (await api.get('/vendor-portal/pq/submissions')).data,
  applyPq: async (templateId, data) => (await api.post(`/vendor-portal/pq/templates/${templateId}/apply`, data)).data,
  updatePq: async (id, data) => (await api.put(`/vendor-portal/pq/${id}`, data)).data,
  submitPq: async (id) => (await api.post(`/vendor-portal/pq/${id}/submit`)).data,
  uploadPqDocument: async (pqId, formData) =>
    (await api.post(`/vendor-portal/pq/${pqId}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data,

  // Orders (read-only)
  orders: async () => (await api.get('/vendor-portal/orders')).data,
  showOrder: async (id) => (await api.get(`/vendor-portal/orders/${id}`)).data,
};

export default vendorPortalAPI;
