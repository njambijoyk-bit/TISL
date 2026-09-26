import api from './axios';

const brandsAPI = {
  // ADMIN: Get all brands (including inactive)
getAdminBrands: async () => {
  const response = await api.get('/admin/brands');
  return response.data;
},
getAdminBrand: async (id) => {
  const response = await api.get(`/admin/brands/${id}`);
  return response.data;
},

  // Get all brands
  getBrands: async () => {
    const response = await api.get('/brands');
    return response.data;
  },

  // Get featured brands
  getFeaturedBrands: async () => {
    const response = await api.get('/brands/featured');
    return response.data;
  },

  // Get single brand
  getBrand: async (id) => {
    const response = await api.get(`/brands/${id}`);
    return response.data;
  },

  // ADMIN: Create brand
  createBrand: async (data) => {
    const response = await api.post('/admin/brands', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // ADMIN: Update brand (uses POST with _method override)
  updateBrand: async (id, data) => {
    // Add _method for Laravel method spoofing
    if (data instanceof FormData) {
      data.append('_method', 'PUT');
      return await api.post(`/admin/brands/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    
    // Fallback for regular JSON data
    return await api.put(`/admin/brands/${id}`, data);
  },

  // ADMIN: Delete brand
  deleteBrand: async (id) => {
    const response = await api.delete(`/admin/brands/${id}`);
    return response.data;
  },
};

export default brandsAPI;