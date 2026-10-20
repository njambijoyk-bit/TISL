import api from './axios';

const vendorPrequalificationsAPI = {
  list: async (params) => (await api.get('/admin/vendor-prequalifications', { params })).data,
  forVendor: async (vendorId) => (await api.get(`/admin/vendor-prequalifications/vendor/${vendorId}`)).data,
  record: async (vendorId, data) => (await api.post(`/admin/vendor-prequalifications/vendor/${vendorId}`, data)).data,
  update: async (id, data) => (await api.put(`/admin/vendor-prequalifications/${id}`, data)).data,
};

export default vendorPrequalificationsAPI;
