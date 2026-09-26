
import api from './axios';

const paymentsAPI = {
  // Admin: List all payments (regular + auction)
  listPayments: async (params = {}) => {
    const response = await api.get('/admin/payments', { params });
    return response.data;
  },

  // Admin: Get single payment detail
  getPayment: async (id) => {
    const response = await api.get(`/admin/payments/${id}`);
    return response.data;
  },

  // Admin: Initiate STK Push for regular order
  initiatePayment: async (data) => {
    const response = await api.post('/admin/payments/initiate', data);
    return response.data;
  },

  // Admin: Initiate STK Push for auction order
  initiateAuctionPayment: async (auctionOrderId, data = {}) => {
    const response = await api.post('/admin/payments/initiate', {
      auction_order_id: auctionOrderId,
      ...data,
    });
    return response.data;
  },

  // Admin: Poll payment status
  pollPaymentStatus: async (id) => {
    const response = await api.get(`/admin/payments/${id}/status`);
    return response.data;
  },

  // Admin: Manual Daraja query
  queryDaraja: async (id) => {
    const response = await api.post(`/admin/payments/${id}/query-daraja`);
    return response.data;
  },

  // Admin: Cancel pending payment
  cancelPayment: async (id, reason) => {
    const response = await api.post(`/admin/payments/${id}/cancel`, { reason });
    return response.data;
  },

  // Admin: Retry failed/cancelled payment
  retryPayment: async (id, data = {}) => {
    const response = await api.post(`/admin/payments/${id}/retry`, data);
    return response.data;
  },

  // Admin: Raise dispute
  raiseDispute: async (id, reason, evidence = []) => {
    const response = await api.post(`/admin/payments/${id}/dispute`, { reason, evidence });
    return response.data;
  },

  // Admin: Resolve dispute
  resolveDispute: async (id, resolution, resolutionNotes) => {
    const response = await api.post(`/admin/payments/${id}/dispute/resolve`, {
      resolution,
      resolution_notes: resolutionNotes,
    });
    return response.data;
  },

  // Admin: Add admin notes
  addNotes: async (id, notes) => {
    const response = await api.post(`/admin/payments/${id}/notes`, { notes });
    return response.data;
  },

  // Admin: Get payment summary stats
  getSummary: async () => {
    const response = await api.get('/admin/payments/summary');
    return response.data;
  },

  // Admin: Get payment history for an order (regular or auction)
  getOrderPayments: async (orderId, type = 'regular') => {
    const params = type === 'auction' ? { auction_order_id: orderId } : { order_id: orderId };
    const response = await api.get('/admin/payments/order-payments', { params });
    return response.data;
  },

  // Customer: Get own payment history for an order
  getCustomerOrderPayments: async (orderId, type = 'regular') => {
    const response = await api.get(`/customer/payments/order/${orderId}`);
    return response.data;
  },
};

export default paymentsAPI;