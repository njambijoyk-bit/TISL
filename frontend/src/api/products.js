import api from './axios';

const productsAPI = {
  // ADMIN: Get all products (including inactive)
  getAdminProducts: async (params = {}) => {
    const response = await api.get('/admin/products', { params });
    return response.data;
  },

  // ADMIN: Get trashed (soft-deleted) products
  getTrashProducts: async (params = {}) => {
    const response = await api.get('/admin/products/trash', { params });
    return response.data;
  },

  // ADMIN: Restore multiple products
  restoreProducts: async (ids = []) => {
    const response = await api.post('/admin/products/restore-multiple', { ids });
    return response.data;
  },

  // ADMIN: Permanently delete multiple soft-deleted products
  forceDeleteProducts: async (ids = []) => {
    const response = await api.post('/admin/products/force-delete-multiple', { ids });
    return response.data;
  },

  // ADMIN: Get single product  
  getAdminProduct: async (id) => {
    const response = await api.get(`/admin/products/${id}`);
    return response.data;
  },

  // Get all products with filters
  getProducts: async (params = {}) => {
    const response = await api.get('/products', { params });
    return response.data;
  },

  // Get single product
  getProduct: async (id) => {
    const response = await api.get(`/products/${id}`);
    return response.data;
  },

  // Get featured products — is_featured=1, is_visible=1, status=active
  getFeaturedProducts: async () => {
    const response = await api.get('/products/featured');
    return response.data;
  },

  // Get new arrivals — is_new=1, is_visible=1 (no status check)
  getNewArrivals: async () => {
    const response = await api.get('/products/new-arrivals');
    return response.data;
  },

  // Get on-sale products — on_sale=1, is_visible=1, status=active
  getOnSaleProducts: async () => {
    const response = await api.get('/products/on-sale');
    return response.data;
  },

  // Get related products
  getRelatedProducts: async (id) => {
    const response = await api.get(`/products/${id}/related`);
    return response.data;
  },

  // in api/products.js (where productsAPI lives)
  getCategories: async () => {
    const response = await api.get('/categories');
    return response.data;
  },

  getBrands: async () => {
    const response = await api.get('/brands');
    return response.data;
  },

  // Get product reviews
  getProductReviews: async (productId, params = {}) => {
    const response = await api.get(`/products/${productId}/reviews`, { params });
    return response.data;
  },

  // Create product review
  createReview: async (productId, data) => {
    const response = await api.post(`/customer/products/${productId}/reviews`, data);
    return response.data;
  },

  // Check if can review
  canReview: async (productId) => {
    const response = await api.get(`/customer/products/${productId}/can-review`);
    return response.data;
  },

  // Mark review as helpful
  markReviewHelpful: async (reviewId) => {
    const response = await api.post(`/reviews/${reviewId}/helpful`);
    return response.data;
  },

  // ADMIN: Create product
  createProduct: async (data) => {
    const response = await api.post('/admin/products', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // ADMIN: Update product
  updateProduct: async (id, data) => {
    // When updating with files use POST + _method=PUT so PHP/Laravel parses multipart/form-data
    if (data instanceof FormData) {
      // Append override (if not already appended)
      if (!data.get('_method')) {
        data.append('_method', 'PUT');
      }
      const response = await api.post(`/admin/products/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }

    // Fallback for JSON-only updates (no files)
    const response = await api.put(`/admin/products/${id}`, data);
    return response.data;
  },

  // ADMIN: Delete product (soft delete)
  deleteProduct: async (id) => {
    const response = await api.delete(`/admin/products/${id}`);
    return response.data;
  },

  // ADMIN: Restore soft-deleted product
  restoreProduct: async (id) => {
    const response = await api.post(`/admin/products/${id}/restore`);
    return response.data;
  },

  // ADMIN: Permanently delete soft-deleted product
  forceDeleteProduct: async (id) => {
    const response = await api.delete(`/admin/products/${id}/force`);
    return response.data;
  },

  // ADMIN: Update stock
  updateStock: async (id, data) => {
    const response = await api.put(`/admin/products/${id}/stock`, data);
    return response.data;
  },
};

export default productsAPI;
export { productsAPI };
