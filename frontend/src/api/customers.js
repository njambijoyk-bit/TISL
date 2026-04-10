import api from './axios';

const customersAPI = {
  // Get customer profile
  getProfile: async () => {
    const response = await api.get('/customer/profile');
    return response.data;
  },

  // Update customer profile
  updateProfile: async (data) => {
    const response = await api.put('/customer/profile', data);
    return response.data;
  },

  resendEmailVerification: async () => {
    const response = await api.post('/customer/email/resend');
    return response.data;
  },

  sendPhoneOtp: async () => {
    const response = await api.post('/customer/phone/send-otp');
    return response.data;
  },

  verifyPhoneOtp: async (otp) => {
    const response = await api.post('/customer/phone/verify', { otp });
    return response.data;
  },

  uploadCustomerProfileImage: async (formData) => {
    const response = await api.post('/customer/profile/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Get customer reviews
  getMyReviews: async (params = {}) => {
    const response = await api.get('/customer/reviews', { params });
    return response.data;
  },

  // Update review
  updateReview: async (id, data) => {
    const response = await api.put(`/customer/reviews/${id}`, data);
    return response.data;
  },

  // Delete review
  deleteReview: async (id) => {
    const response = await api.delete(`/customer/reviews/${id}`);
    return response.data;
  },

  // ADMIN: Get all customers
  getAllCustomers: async (params = {}) => {
    const response = await api.get('/admin/customers', { params });
    return response.data;
  },

  // ADMIN: Get single customer
  getCustomer: async (id) => {
    const response = await api.get(`/admin/customers/${id}`);
    return response.data;
  },

  // ADMIN: Update customer
  updateCustomer: async (id, data) => {
    const response = await api.put(`/admin/customers/${id}`, data);
    return response.data;
  },

  // ADMIN: Get customer statistics
  getCustomerStatistics: async () => {
    const response = await api.get('/admin/customers/statistics');
    return response.data;
  },

  // ADMIN: Get top customers
  getTopCustomers: async (limit = 10) => {
    const response = await api.get('/admin/customers/top', {
      params: { limit },
    });
    return response.data;
  },

  // ADMIN: Assign sales rep
  assignSalesRep: async (customerId, salesRepId) => {
    const response = await api.post(`/admin/customers/${customerId}/assign-sales-rep`, {
      sales_rep_id: salesRepId,
    });
    return response.data;
  },

  // Add to customersAPI in customers.js
  uploadProfileImage: async (customerId, file) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post(
      `/admin/customers/${customerId}/upload-image`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  // ADMIN: Add tag
  addTag: async (customerId, tag) => {
    const response = await api.post(`/admin/customers/${customerId}/add-tag`, { tag });
    return response.data;
  },

  // ADMIN: Remove tag
  removeTag: async (customerId, tag) => {
    const response = await api.post(`/admin/customers/${customerId}/remove-tag`, { tag });
    return response.data;
  },

  addCredit: async (customerId, amount, reason = '') => {
    const response = await api.post(`/admin/customers/${customerId}/add-credit`, {
      amount,
      reason,
    });
    return response.data;
  },

  addLoyaltyPoints: async (customerId, points, reason = '') => {
    const response = await api.post(`/admin/customers/${customerId}/add-loyalty-points`, {
      points,
      reason,
    });
    return response.data;
  },

  /**
   * Convenience wrapper around updateCustomer for status changes.
   * status: 'active' | 'inactive' | 'suspended' | 'blacklisted'
   */
  updateStatus: async (customerId, status, reason = '') => {
    const response = await api.put(`/admin/customers/${customerId}`, {
      status,
      status_reason: reason,
    });
    return response.data;
  },

  // ============================================
  // ADMIN — Customer Addresses
  // Backend note: uncomment address routes in api.php under /customer/addresses
  // and add admin address routes under /admin/customers/{id}/addresses
  // ============================================

  getAddresses: async (customerId) => {
    const response = await api.get(`/admin/customers/${customerId}/addresses`);
    return response.data;
  },

  createAddress: async (customerId, data) => {
    const response = await api.post(`/admin/customers/${customerId}/addresses`, data);
    return response.data;
  },

  updateAddress: async (customerId, addressId, data) => {
    const response = await api.put(
      `/admin/customers/${customerId}/addresses/${addressId}`,
      data
    );
    return response.data;
  },

  deleteAddress: async (customerId, addressId) => {
    const response = await api.delete(
      `/admin/customers/${customerId}/addresses/${addressId}`
    );
    return response.data;
  },

  setDefaultShipping: async (customerId, addressId) => {
    const response = await api.post(
      `/admin/customers/${customerId}/addresses/${addressId}/set-default-shipping`
    );
    return response.data;
  },

  setDefaultBilling: async (customerId, addressId) => {
    const response = await api.post(
      `/admin/customers/${customerId}/addresses/${addressId}/set-default-billing`
    );
    return response.data;
  },

  // Get admin users list (for sales rep assignment dropdown)
  getAdminUsers: async () => {
    const response = await api.get('/admin/users');
    return response.data;
  },
};

export default customersAPI;