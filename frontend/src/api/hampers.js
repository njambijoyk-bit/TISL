import api from './axios';

const hampersAPI = {

  // ── Admin ─────────────────────────────────────────────────────────────────

  // List all hampers (paginated, filterable)
  getAllHampers: async (params = {}) => {
    const response = await api.get('/admin/hampers', { params });
    return response.data;
  },

  // Get aggregate stats (total, active, sold_out, draft)
  getHamperStats: async () => {
    const response = await api.get('/admin/hampers/stats');
    return response.data;
  },

  // Create a new hamper
  createHamper: async (data) => {
    const response = await api.post('/admin/hampers', data);
    return response.data;
  },

  // Get single hamper with items + authors
  getHamper: async (id) => {
    const response = await api.get(`/admin/hampers/${id}`);
    return response.data;
  },

  // Update hamper settings/toggles
  updateHamper: async (id, data) => {
    const response = await api.put(`/admin/hampers/${id}`, data);
    return response.data;
  },

  // Delete hamper
  deleteHamper: async (id) => {
    const response = await api.delete(`/admin/hampers/${id}`);
    return response.data;
  },

  // Upload cover image
  uploadCoverImage: async (id, formData) => {
    const response = await api.post(`/admin/hampers/${id}/cover-image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // ── Admin — Products ──────────────────────────────────────────────────────

  // Add a product to a hamper
  addProduct: async (id, data) => {
    const response = await api.post(`/admin/hampers/${id}/products`, data);
    return response.data;
  },

  // Remove a product from a hamper
  removeProduct: async (id, productId) => {
    const response = await api.delete(`/admin/hampers/${id}/products/${productId}`);
    return response.data;
  },

  // Suggest products based on related_products of current items
  suggestProducts: async (id) => {
    const response = await api.get(`/admin/hampers/${id}/suggest-products`);
    return response.data;
  },

  // ── Admin — Eligibility ───────────────────────────────────────────────────

  // List eligibility rows for a hamper
  listEligibility: async (id, params = {}) => {
    const response = await api.get(`/admin/hampers/${id}/eligibility`, { params });
    return response.data;
  },

  // Add a customer to the eligibility table
  addCustomer: async (id, data) => {
    const response = await api.post(`/admin/hampers/${id}/eligibility`, data);
    return response.data;
  },

  // Update a customer's status (active / suspended / blacklisted / reactivate)
  updateCustomerStatus: async (id, customerId, data) => {
    const response = await api.patch(`/admin/hampers/${id}/eligibility/${customerId}`, data);
    return response.data;
  },

  // Search customers to add — returns eligibility status per result
  searchCustomers: async (id, query) => {
    const response = await api.get(`/admin/hampers/${id}/eligibility/search`, { params: { q: query } });
    return response.data;
  },

  // List customers matching the hamper's eligibility criteria (tier/type/all)
  listEligibleCustomers: async (id, params = {}) => {
    const response = await api.get(`/admin/hampers/${id}/eligible-customers`, { params });
    return response.data;
  },

  // ── Admin — Orders ────────────────────────────────────────────────────────

  // Get all orders for a specific hamper
  getHamperOrders: async (id, params = {}) => {
    const response = await api.get(`/admin/hampers/${id}/orders`, { params });
    return response.data;
  },

  // List all hamper orders
  getAllHamperOrders: async (params = {}) => {
    const response = await api.get('/admin/hamper-orders', { params });
    return response.data;
  },

  // Get single hamper order detail
  getAdminHamperOrder: async (id) => {
    const response = await api.get(`/admin/hamper-orders/${id}`);
    return response.data;
  },

  // Update hamper order status
  updateHamperOrderStatus: async (id, data) => {
    const response = await api.patch(`/admin/hamper-orders/${id}/status`, data);
    return response.data;
  },

  // Convert hamper order to standard order
  convertToStandardOrder: async (id) => {
    const response = await api.post(`/admin/hamper-orders/${id}/convert`);
    return response.data;
  },

  // ── Customer (public, auth required) ─────────────────────────────────────

  // Get all hampers eligible for the logged-in customer
    getPublicHampers: async () => {
      const response = await api.get('/customer/hampers');
      return response.data;
    },
  
    // Get a single hamper by slug — 403 if not eligible
    getPublicHamper: async (slug) => {
      const response = await api.get(`/customer/hampers/${slug}`);
      return response.data;
    },
  
    // Load checkout data for a hamper
    loadCheckout: async (slug) => {
      const response = await api.get(`/customer/hampers/${slug}/checkout`);
      return response.data;
    },
  
    // Validate a promo/referral code against a hamper
    validatePromo: async (slug, code) => {
      const response = await api.post(`/customer/hampers/${slug}/checkout/validate-promo`, { code });
      return response.data;
    },
  
    // Place a hamper order
    placeOrder: async (slug, data) => {
      const response = await api.post(`/customer/hampers/${slug}/checkout/place-order`, data);
      return response.data;
    },

    // Get customer's hamper orders
    getMyHamperOrders: async (params = {}) => {
      const response = await api.get('/customer/hampers/my-orders', { params });
      return response.data;
    },

    // Get customer's single hamper order detail
    getMyHamperOrder: async (id) => {
      const response = await api.get(`/customer/hampers/orders/${id}`);
      return response.data;
    },
  };
  
  export default hampersAPI;
  