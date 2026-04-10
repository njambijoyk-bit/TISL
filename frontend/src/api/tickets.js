import api from './axios';

const ticketsAPI = {
  // ========================================
  // CUSTOMER ENDPOINTS
  // ========================================

  getMyTickets: async (params = {}) => {
    const response = await api.get('/customer/tickets', { params });
    return response.data;
  },

  getMyTicket: async (id) => {
    const response = await api.get(`/customer/tickets/${id}`);
    return response.data;
  },

  createTicket: async (data) => {
    const response = await api.post('/customer/tickets', data);
    return response.data;
  },

  customerReply: async (id, message) => {
    const response = await api.post(`/customer/tickets/${id}/reply`, { message });
    return response.data;
  },

  customerClose: async (id) => {
    const response = await api.post(`/customer/tickets/${id}/close`);
    return response.data;
  },

  // ========================================
  // ADMIN ENDPOINTS
  // ========================================

  getAdminTickets: async (params = {}) => {
    const response = await api.get('/admin/tickets', { params });
    return response.data;
  },

  getStatistics: async () => {
    const response = await api.get('/admin/tickets/statistics');
    return response.data;
  },

  getTrashedTickets: async (params = {}) => {
    const response = await api.get('/admin/tickets/trash', { params });
    return response.data;
  },

  getAdminTicket: async (id) => {
    const response = await api.get(`/admin/tickets/${id}`);
    return response.data;
  },

  updateTicket: async (id, data) => {
    const response = await api.put(`/admin/tickets/${id}`, data);
    return response.data;
  },

  assignTicket: async (id, assigned_to) => {
    const response = await api.post(`/admin/tickets/${id}/assign`, { assigned_to });
    return response.data;
  },

  unassignTicket: async (id) => {
    const response = await api.post(`/admin/tickets/${id}/unassign`);
    return response.data;
  },

  adminReply: async (id, data) => {
    const response = await api.post(`/admin/tickets/${id}/reply`, data);
    return response.data;
  },

  softDelete: async (id) => {
    const response = await api.delete(`/admin/tickets/${id}`);
    return response.data;
  },

  restore: async (id) => {
    const response = await api.post(`/admin/tickets/${id}/restore`);
    return response.data;
  },

  forceDelete: async (id) => {
    const response = await api.delete(`/admin/tickets/${id}/force`);
    return response.data;
  },
};

export default ticketsAPI;
