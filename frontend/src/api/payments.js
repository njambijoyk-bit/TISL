import api from './axios';

const paymentsAPI = {
  // =========================================================================
  // FINANCE / ADMIN ENDPOINTS
  // =========================================================================

  /**
   * Get all payments (finance/admin) with filters
   * GET /admin/payments
   */
  getPayments: async (params = {}) => {
    const { data } = await api.get('/admin/payments', { params });
    return data; // { data: [], meta: {} }
  },

  /**
   * Get single payment detail
   * GET /admin/payments/:id
   */
  getPayment: async (id) => {
    const { data } = await api.get(`/admin/payments/${id}`);
    return data.payment;
  },

  /**
   * Initiate STK Push for an order
   * POST /admin/payments/initiate
   */
  initiatePayment: async (data) => {
    const response = await api.post('/admin/payments/initiate', data);
    return response.data;
  },

  /**
   * Poll payment status (frontend polling every 3s)
   * GET /admin/payments/:id/status
   */
  getPaymentStatus: async (id) => {
    const { data } = await api.get(`/admin/payments/${id}/status`);
    return data;
  },

  /**
   * Cancel a pending payment request
   * POST /admin/payments/:id/cancel
   */
  cancelPayment: async (id, reason) => {
    const { data } = await api.post(`/admin/payments/${id}/cancel`, { reason });
    return data;
  },

  /**
   * Retry a failed/cancelled payment (creates new payment record)
   * POST /admin/payments/:id/retry
   */
  retryPayment: async (id, data = {}) => {
    const response = await api.post(`/admin/payments/${id}/retry`, data);
    return response.data;
  },

  /**
   * Manually query Daraja for payment status
   * POST /admin/payments/:id/query-daraja
   */
  queryDarajaStatus: async (id) => {
    const { data } = await api.post(`/admin/payments/${id}/query-daraja`);
    return data;
  },

  /**
   * Raise a dispute on a payment
   * POST /admin/payments/:id/dispute
   */
  raiseDispute: async (id, data) => {
    const { data: response } = await api.post(`/admin/payments/${id}/dispute`, data);
    return response;
  },

  /**
   * Resolve a dispute (admin/super_admin only)
   * POST /admin/payments/:id/dispute/resolve
   */
  resolveDispute: async (id, data) => {
    const { data: response } = await api.post(`/admin/payments/${id}/dispute/resolve`, data);
    return response;
  },

  /**
   * Add admin notes to a payment (appended, not replaced)
   * POST /admin/payments/:id/notes
   */
  addPaymentNotes: async (id, notes) => {
    const { data } = await api.post(`/admin/payments/${id}/notes`, { notes });
    return data;
  },

  /**
   * Get all payment attempts for a specific order
   * GET /admin/payments/order/:orderId   ← FIXED
   */
  getOrderPayments: async (orderId) => {
    const { data } = await api.get(`/admin/payments/order/${orderId}`);
    return data;
  },

  /**
   * Get payment history for an order (ADMIN VIEW-ONLY)
   * GET /admin/orders/:orderId/payments
   * Accessible to: admin, super_admin, manager, sales_rep, logistics
   */
  getAdminOrderPaymentHistory: async (orderId) => {
    const { data } = await api.get(`/admin/orders/${orderId}/payments`);
    return data;
  },

  getSummary: async () => {
    const { data } = await api.get('/admin/payments/summary');
    return data;
  },

  /**
   * Get payment attempts for customer's OWN order
   * GET /customer/payments/order/:orderId
   */
  getCustomerOrderPayments: async (orderId) => {
    const { data } = await api.get(`/customer/payments/order/${orderId}`);
    return data;
  },
};

export default paymentsAPI;