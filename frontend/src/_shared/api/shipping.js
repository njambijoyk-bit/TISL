import api from './axios';

const shippingAPI = {
  // Admin: get all shipping options
  getOptions: async () => {
    const response = await api.get('/admin/shipping');
    return response.data;
  },

  // Admin: get activity log
  getActivity: async (params = {}) => {
    const response = await api.get('/admin/shipping/activity', { params });
    return response.data;
  },

  // Admin: create shipping option
  createOption: async (data) => {
    const response = await api.post('/admin/shipping', data);
    return response.data;
  },

  // Admin: update shipping option
  updateOption: async (id, data) => {
    const response = await api.put(`/admin/shipping/${id}`, data);
    return response.data;
  },

  // Admin: toggle active/inactive
  toggleStatus: async (id, isActive) => {
    const response = await api.patch(`/admin/shipping/${id}/status`, { is_active: isActive });
    return response.data;
  },

  // Admin: delete (superadmin only)
  deleteOption: async (id) => {
    const response = await api.delete(`/admin/shipping/${id}`);
    return response.data;
  },

  // Public: active options for checkout
  getActiveOptions: async () => {
    const response = await api.get('/shipping-options');
    return response.data;
  },
};

export default shippingAPI;
