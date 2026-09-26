import api from './axios';

const customerTiersAPI = {
  // ── Tiers (admin) ─────────────────────────────────────────────────────────
  getTiers: async () => {
    const res = await api.get('/admin/customer-tiers');
    return res.data;
  },
  createTier: async (data) => {
    const res = await api.post('/admin/customer-tiers', data);
    return res.data;
  },
  updateTier: async (id, data) => {
    const res = await api.put(`/admin/customer-tiers/${id}`, data);
    return res.data;
  },
  toggleTierStatus: async (id, isActive) => {
    const res = await api.patch(`/admin/customer-tiers/${id}/status`, { is_active: isActive });
    return res.data;
  },
  deleteTier: async (id) => {
    const res = await api.delete(`/admin/customer-tiers/${id}`);
    return res.data;
  },

  // ── Type Discounts (admin) ────────────────────────────────────────────────
  getTypes: async () => {
    const res = await api.get('/admin/customer-type-discounts');
    return res.data;
  },
  createType: async (data) => {
    const res = await api.post('/admin/customer-type-discounts', data);
    return res.data;
  },
  updateType: async (id, data) => {
    const res = await api.put(`/admin/customer-type-discounts/${id}`, data);
    return res.data;
  },
  toggleTypeStatus: async (id, isActive) => {
    const res = await api.patch(`/admin/customer-type-discounts/${id}/status`, { is_active: isActive });
    return res.data;
  },
  deleteType: async (id) => {
    const res = await api.delete(`/admin/customer-type-discounts/${id}`);
    return res.data;
  },

  // ── Activity log (admin) ──────────────────────────────────────────────────
  getActivity: async (params = {}) => {
    const res = await api.get('/admin/customer-tier-activity', { params });
    return res.data;
  },

  // ── Public (for dropdowns, checkout, etc.) ────────────────────────────────
  getActiveTiers: async () => {
    const res = await api.get('/customer-tiers');
    return res.data;
  },
  getActiveTypes: async () => {
    const res = await api.get('/customer-type-discounts');
    return res.data;
  },
};

export default customerTiersAPI;
