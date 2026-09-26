import api from './axios';

const promoCodesAPI = {

  // ========================================
  // ADMIN ENDPOINTS
  // ========================================

  /**
   * Get all promo codes (admin)
   */
  getAll: async (params = {}) => {
    const { data } = await api.get('/admin/promo-codes', { params });
    return data;
  },

  /**
   * Get promo code statistics (admin)
   */
  getStatistics: async () => {
    const { data } = await api.get('/admin/promo-codes/statistics');
    return data;
  },

  /**
   * Get single promo code (admin)
   */
  getOne: async (id) => {
    const { data } = await api.get(`/admin/promo-codes/${id}`);
    return data;
  },

  /**
   * Create promo code (admin)
   */
  create: async (payload) => {
    const { data } = await api.post('/admin/promo-codes', payload);
    return data;
  },

  /**
   * Update promo code (admin)
   */
  update: async (id, payload) => {
    const { data } = await api.put(`/admin/promo-codes/${id}`, payload);
    return data;
  },

  /**
   * Delete promo code (admin)
   */
  delete: async (id) => {
    const { data } = await api.delete(`/admin/promo-codes/${id}`);
    return data;
  },

  /**
   * Activate promo code (admin)
   */
  activate: async (id) => {
    const { data } = await api.post(`/admin/promo-codes/${id}/activate`);
    return data;
  },

  /**
   * Pause promo code (admin)
   */
  pause: async (id) => {
    const { data } = await api.post(`/admin/promo-codes/${id}/pause`);
    return data;
  },

  /**
   * Archive promo code (admin)
   */
  archive: async (id) => {
    const { data } = await api.post(`/admin/promo-codes/${id}/archive`);
    return data;
  },

  /**
   * Validate promo code on behalf of customer (admin)
   */
  adminValidate: async (payload) => {
    const { data } = await api.post('/admin/promo-codes/validate', payload);
    return data;
  },

  /**
   * Manually trigger birthday code generation (admin)
   */
  triggerBirthday: async () => {
    const { data } = await api.post('/admin/promo-codes/generate-birthday');
    return data;
  },

  /**
   * Manually trigger win-back code generation (admin)
   */
  triggerWinBack: async () => {
    const { data } = await api.post('/admin/promo-codes/generate-winback');
    return data;
  },

  /**
   * Manually trigger expiry sweep (admin)
   */
  triggerExpire: async () => {
    const { data } = await api.post('/admin/promo-codes/expire');
    return data;
  },

  /**
   * Get redemptions (orders) for a promo code (admin)
   */
  getRedemptions: async (id) => {
    const { data } = await api.get(`/admin/promo-codes/${id}/redemptions`);
    return data;
  },

  // ========================================
  // CUSTOMER ENDPOINTS
  // ========================================

  /**
   * Validate a promo code at checkout (customer)
   * Returns discount amount preview without applying it
   */
  validate: async (payload) => {
    // payload: { code, order_value, referral_discount? }
    const { data } = await api.post('/customer/promo-codes/validate', payload);
    return data;
  },

  /**
   * Get customer's own promo codes (profile rewards section)
   */
  myCodes: async () => {
    const { data } = await api.get('/customer/promo-codes/my-codes');
    return data;
  },
};

export default promoCodesAPI;