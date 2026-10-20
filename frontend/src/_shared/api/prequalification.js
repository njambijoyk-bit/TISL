import api from './axios';

const prequalificationAPI = {
  // Templates
  templates: async (params) => (await api.get('/admin/prequalification/templates', { params })).data,
  showTemplate: async (id) => (await api.get(`/admin/prequalification/templates/${id}`)).data,
  createTemplate: async (data) => (await api.post('/admin/prequalification/templates', data)).data,
  updateTemplate: async (id, data) => (await api.put(`/admin/prequalification/templates/${id}`, data)).data,

  // Submissions
  submissions: async (params) => (await api.get('/admin/prequalification/submissions', { params })).data,
  showSubmission: async (id) => (await api.get(`/admin/prequalification/submissions/${id}`)).data,
  review: async (id, data) => (await api.post(`/admin/prequalification/submissions/${id}/review`, data)).data,
  verifyDocument: async (pqId, docId) =>
    (await api.post(`/admin/prequalification/submissions/${pqId}/documents/${docId}/verify`)).data,
};

export default prequalificationAPI;
