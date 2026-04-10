import api from './axios';

const categoriesAPI = {
  // Get all categories
  getCategories: async (params = {}) => {
    const response = await api.get('/categories', { params });
    return response.data;
  },

  // Get main categories
  getMainCategories: async () => {
    const response = await api.get('/categories/main');
    return response.data;
  },

  // Get single category
  getCategory: async (id) => {
    const response = await api.get(`/categories/${id}`);
    return response.data;
  },

  // Get subcategories
  getSubcategories: async (id) => {
    const response = await api.get(`/categories/${id}/subcategories`);
    return response.data;
  },

  // ADMIN: Create category
  createCategory: async (data) => {
    const response = await api.post('/admin/categories', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

// ADMIN: Update category
  updateCategory: async (id, data) => {
    if (data instanceof FormData) {
      data.append('_method', 'PUT');
      const response = await api.post(`/admin/categories/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } else {
      const response = await api.put(`/admin/categories/${id}`, data);
      return response.data;
    }
  },

    // ADMIN: Delete category
    deleteCategory: async (id) => {
  const response = await api.delete(`/admin/categories/${id}`);
  return response.data;
},
};

export default categoriesAPI;