import api from './axios';

const vendorPortalAPI = {
  dashboard: async () => (await api.get('/vendor-portal/dashboard')).data,

  profile: async () => (await api.get('/vendor-portal/profile')).data,
  updateProfile: async (data) => (await api.put('/vendor-portal/profile', data)).data,

  // Tenders this vendor may see (public ones and the restricted ones they are eligible for)
  tenders: async (params) => (await api.get('/vendor-portal/tenders', { params })).data,
  exportTenders: async (params) => (await api.get('/vendor-portal/tenders/export', { params, responseType: 'blob' })).data,
  showTender: async (id) => (await api.get(`/vendor-portal/tenders/${id}`)).data,
  documentLink: async (id, docId, inline) => (await api.get(`/vendor-portal/tenders/${id}/documents/${docId}/link`, { params: { inline: inline ? 1 : 0 } })).data,

  // Pre-qualification, as staff recorded it
  prequalifications: async () => (await api.get('/vendor-portal/prequalifications')).data,

  // Orders (read-only)
  orders: async () => (await api.get('/vendor-portal/orders')).data,
  showOrder: async (id) => (await api.get(`/vendor-portal/orders/${id}`)).data,
};

export default vendorPortalAPI;
