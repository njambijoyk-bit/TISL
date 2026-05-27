import api from './axios';

const policyAPI = {

  // ── Public ────────────────────────────────────────────────────────────────

  // Get all active policies (for modals, checkboxes)
  getAll: async () => {
    const response = await api.get('/policies');
    return response.data;
  },

  // Get single policy by key
  getByKey: async (key) => {
    const response = await api.get(`/policies/${key}`);
    return response.data;
  },

  // Check which policies need re-acceptance (auth required)
  checkReacceptance: async () => {
    const response = await api.get('/policies/check-reacceptance');
    return response.data;
  },

  logAcceptance: async (data) => {
    const response = await api.post('/policies/accept', data);
    return response.data;
    },

  // ── Admin ─────────────────────────────────────────────────────────────────

  // List all policies with stats
  adminGetAll: async () => {
    const response = await api.get('/admin/policies');
    return response.data;
  },

  // Get single policy with change logs
  adminGet: async (id) => {
    const response = await api.get(`/admin/policies/${id}`);
    return response.data;
  },

  // Update policy content (handles version bump)
  update: async (id, data) => {
    const response = await api.put(`/admin/policies/${id}`, data);
    return response.data;
  },

  // Get paginated acceptances for a policy
  getAcceptances: async (id, params = {}) => {
    const response = await api.get(`/admin/policies/${id}/acceptances`, { params });
    return response.data;
  },

  // Get change history for a policy
  getChangeLogs: async (id) => {
    const response = await api.get(`/admin/policies/${id}/change-logs`);
    return response.data;
  },

  // Aggregate reports across all policies
  getReports: async () => {
    const response = await api.get('/admin/policies/reports');
    return response.data;
  },
};

export default policyAPI;