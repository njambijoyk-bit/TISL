import api from './axios';

const ordersAPI = {
  // ========================================
  // CUSTOMER ENDPOINTS
  // ========================================

  /**
   * Get customer's orders
   */
  getMyOrders: async (params = {}) => {
    const response = await api.get('/customer/orders', { params });
    return response.data;
  },

  /**
   * Get single order (customer's own)
   */
  getOrder: async (id) => {
    const response = await api.get(`/customer/orders/${id}`);
    return response.data;
  },

  /**
   * Create order (checkout)
   */
  createOrder: async (data) => {
    const response = await api.post('/customer/orders', data);
    return response.data;
  },

  /**
   * Cancel order (customer)
   */
  cancelOrder: async (id, reason) => {
    const response = await api.post(`/customer/orders/${id}/cancel`, { reason });
    return response.data;
  },

  restoreCustomerOrder: async (id) => {
    const response = await api.post(`/customer/orders/${id}/restore`);
    return response.data;
  },

  updateMyOrder: async (id, data) => {
    const response = await api.put(`/customer/orders/${id}`, data);
    return response.data; // { message, order }
  },

  deleteMyOrder: async (id) => {
    const response = await api.delete(`/customer/orders/${id}`);
    return response.data;
  },

/**
 * Rate order (customer)
 */
rateOrder: async (id, data) => {
  const response = await api.post(`/customer/orders/${id}/rate`, data);
  return response.data;
},

  // ========================================
  // ADMIN ENDPOINTS
  // ========================================

  /**
   * Get all orders (admin)
   */
  getAllOrders: async (params = {}) => {
    const { data } = await api.get('/admin/orders', { params });
    return data; // { data: [], meta: {} }
  },

  getOrderStatistics: async () => {
    const { data } = await api.get('/admin/orders/statistics');
    return data;
  },

  getCustomerOrderStatistics: async (customerId) => {
    const { data } = await api.get(`/admin/orders/${customerId}/order-statistics`);
    return data;
  },

  /**
   * Get single order (admin)
   */
  getAdminOrder: async (id) => {
    const response = await api.get(`/admin/orders/${id}`);
    return response.data;
  },

  getAdminCustomerOrders: async (customerId, params = {}) => {
    const { data } = await api.get(`/admin/customers/${customerId}/orders`, { params });
    return data; // Laravel paginator
  },

  // orders.js (admin section)
  updateAdminOrder: async (id, data) => {
    const response = await api.put(`/admin/orders/${id}`, data);
    return response.data; // { message, order }
  },

  adminUpdateOrder: async (id, data) => {
    const response = await api.put(`/admin/orders/${id}/edit`, data);
    return response.data;
  },

  /**
   * Update order status (admin)
   */
  updateOrderStatus: async (id, data) => {
    const response = await api.put(`/admin/orders/${id}/status`, data);
    return response.data;
  },

  /**
   * Confirm order (admin)
   */
  confirmOrder: async (id) => {
    const response = await api.post(`/admin/orders/${id}/confirm`);
    return response.data;
  },

  /**
   * Ship order (admin)
   */
  shipOrder: async (id, data) => {
    const response = await api.post(`/admin/orders/${id}/ship`, data);
    return response.data;
  },

  /**
   * Mark as delivered (admin)
   */
  deliverOrder: async (id) => {
    const response = await api.post(`/admin/orders/${id}/deliver`);
    return response.data;
  },

  /**
   * Cancel order with refund (admin)
   */
  adminCancelOrder: async (id, data) => {
    const response = await api.post(`/admin/orders/${id}/cancel`, data);
    return response.data;
  },

  /**
   * Bulk cancel orders (admin)
   */
  bulkCancelOrders: async (data) => {
    const response = await api.post('/admin/orders/bulk-cancel', data);
    return response.data;
  },

  /**
   * Get refund preview (admin)
   */
  getRefundPreview: async (id) => {
    const response = await api.get(`/admin/orders/${id}/refund-preview`);
    return response.data;
  },

  /**
   * Restore cancelled order (admin)
   */
  restoreOrder: async (id, data) => {
    const response = await api.post(`/admin/orders/${id}/restore`, data);
    return response.data;
  },

  /**
   * Bulk restore orders (admin)
   */
  bulkRestoreOrders: async (data) => {
    const response = await api.post('/admin/orders/bulk-restore', data);
    return response.data;
  },

  /**
   * Get net total (admin)
   */
  getNetTotal: async (id) => {
    const response = await api.get(`/admin/orders/${id}/net-total`);
    return response.data;
  },
  /**
   * Generate invoice (admin)
   */
  generateInvoice: async (id) => {
    const response = await api.post(`/admin/orders/${id}/generate-invoice`);
    return response.data;
  },

  /**
   * Update payment status (admin)
   */
  updatePaymentStatus: async (id, data) => {
    const response = await api.put(`/admin/orders/${id}/payment-status`, data);
    return response.data;
  },

  /**
   * 🗑️ Delete order permanently (super admin)
   */

  // Trash (soft deleted)
  getTrashOrders: async (params = {}) => {
    const { data } = await api.get('/admin/orders/trash', { params });
    return data;
  },

  trashOrder: async (id) => {
    const { data } = await api.delete(`/admin/orders/${id}`); // soft delete
    return data;
  },

  restoreTrashedOrder: async (id) => {
    const { data } = await api.post(`/admin/orders/${id}/restore-trash`);
    return data;
  },

  restoreMultipleTrashedOrders: async (order_ids) => {
    const { data } = await api.post('/admin/orders/restore-multiple', { order_ids });
    return data;
  },

  // Super admin force delete
  forceDeleteOrder: async (id) => {
    const { data } = await api.delete(`/admin/orders/${id}/force`);
    return data;
  },

  forceDeleteMultipleOrders: async (order_ids) => {
    const { data } = await api.post('/admin/orders/force-delete-multiple', { order_ids });
    return data;
  },

  /**
   * 📝 Create order for customer (admin)
   */
  adminCreateOrder: async (data) => {
    const response = await api.post('/admin/orders', data);
    return response.data;
  },
  
};

export default ordersAPI;