import api from './axios';

/**
 * Services API
 * Handles all service-related API calls
 */

// ========================================
// PUBLIC SERVICE ENDPOINTS (No Auth)
// ========================================

export const getServices = async (params = {}) => {
  const response = await api.get('/services', { params });
  return response.data;
};

export const getFeaturedServices = async (params = {}) => {
  const response = await api.get('/services/featured');
  return response.data;
};

export const getServiceById = async (id) => {
  const response = await api.get(`/services/${id}`);
  return response.data;
};

export const getRelatedServices = async (id) => {
  const response = await api.get(`/services/${id}/related`);
  return response.data;
};

export const getServiceTypes = async () => {
  const response = await api.get('/services/types');
  return response.data;
};

// ========================================
// ADMIN SERVICE ENDPOINTS (Auth Required)
// ========================================

export const getAdminServices = async (params = {}) => {
  const response = await api.get('/admin/services', { params });
  return response.data;
};

export const getAvailableServices = async () => {
  const response = await api.get('/admin/services/available');
  return response.data;
};

export const getAvailableProducts = async () => {
  const response = await api.get('/admin/services/products/available');
  return response.data;
};

export const createService = async (data) => {
  const formData = new FormData();
  const skipKeys = ['mainImageFile', 'galleryFiles', 'galleryUrls', 'mainImageUrl', 'pricing_tiers', 'related_services', 'required_products', 'optional_products'];

  Object.entries(data).forEach(([key, value]) => {
    if (value === null || value === undefined || skipKeys.includes(key)) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        formData.append(`${key}[${index}]`, item);
      });
    } 
    else if (typeof value === 'boolean') {
      formData.append(key, value ? '1' : '0');
    }
    else {
      formData.append(key, value);
    }
  });

  if (data.pricing_tiers && Array.isArray(data.pricing_tiers) && data.pricing_tiers.length > 0) {
    formData.append('pricing_tiers', JSON.stringify(data.pricing_tiers));
  }

  if (data.related_services && Array.isArray(data.related_services) && data.related_services.length > 0) {
    formData.append('related_services', JSON.stringify(data.related_services));
  }

  if (data.required_products && Array.isArray(data.required_products) && data.required_products.length > 0) {
    formData.append('required_products', JSON.stringify(data.required_products));
  }

  if (data.optional_products && Array.isArray(data.optional_products) && data.optional_products.length > 0) {
    formData.append('optional_products', JSON.stringify(data.optional_products));
  }

  if (data.mainImageFile) {
    formData.append('main_image', data.mainImageFile);
  }

  if (data.mainImageUrl && !data.mainImageFile) {
    formData.append('main_image_url', data.mainImageUrl);
  }

  if (data.galleryFiles && Array.isArray(data.galleryFiles)) {
    data.galleryFiles.forEach((file) => {
      formData.append('images[]', file);
    });
  }

  if (data.galleryUrls && Array.isArray(data.galleryUrls)) {
    const validUrls = data.galleryUrls.filter(url => url && url.trim() && url.startsWith('http'));
    validUrls.forEach((url, index) => {
      formData.append(`image_urls[${index}]`, url);
    });
  }

  const response = await api.post('/admin/services', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
};

export const updateService = async (id, data) => {
  const formData = new FormData();
  const skipKeys = ['mainImageFile', 'galleryFiles', 'galleryUrls', 'mainImageUrl', 'pricing_tiers', 'related_services', 'required_products', 'optional_products'];

  Object.entries(data).forEach(([key, value]) => {
    if (value === null || value === undefined || skipKeys.includes(key)) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        formData.append(`${key}[${index}]`, item);
      });
    } 
    else if (typeof value === 'boolean') {
      formData.append(key, value ? '1' : '0');
    }
    else {
      formData.append(key, value);
    }
  });

  if (data.pricing_tiers && Array.isArray(data.pricing_tiers) && data.pricing_tiers.length > 0) {
    formData.append('pricing_tiers', JSON.stringify(data.pricing_tiers));
  }

  if (data.related_services && Array.isArray(data.related_services) && data.related_services.length > 0) {
    formData.append('related_services', JSON.stringify(data.related_services));
  }

  if (data.required_products && Array.isArray(data.required_products) && data.required_products.length > 0) {
    formData.append('required_products', JSON.stringify(data.required_products));
  }

  if (data.optional_products && Array.isArray(data.optional_products) && data.optional_products.length > 0) {
    formData.append('optional_products', JSON.stringify(data.optional_products));
  }

  if (data.mainImageFile) {
    formData.append('main_image', data.mainImageFile);
  }

  if (data.mainImageUrl && !data.mainImageFile) {
    formData.append('main_image_url', data.mainImageUrl);
  }

  if (data.galleryFiles && Array.isArray(data.galleryFiles)) {
    data.galleryFiles.forEach((file) => {
      formData.append('images[]', file);
    });
  }

  if (data.galleryUrls && Array.isArray(data.galleryUrls)) {
    const validUrls = data.galleryUrls.filter(url => url && url.trim() && url.startsWith('http'));
    validUrls.forEach((url, index) => {
      formData.append(`image_urls[${index}]`, url);
    });
  }

  formData.append('_method', 'PUT');

  const response = await api.post(`/admin/services/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
};

export const deleteService = async (id) => {
  const response = await api.delete(`/admin/services/${id}`);
  return response.data;
};

export const restoreService = async (id) => {
  const response = await api.post(`/admin/services/${id}/restore`);
  return response.data;
};

export const publishService = async (id) => {
  const response = await api.post(`/admin/services/${id}/publish`);
  return response.data;
};

export const unpublishService = async (id) => {
  const response = await api.post(`/admin/services/${id}/unpublish`);
  return response.data;
};

export const getServiceStatistics = async () => {
  const response = await api.get('/admin/services/statistics');
  return response.data;
};

// ========================================
// TRASH MANAGEMENT
// ========================================

export const getTrashedServices = async (params = {}) => {
  const response = await api.get('/admin/services/trash', { params });
  return response.data;
};

export const restoreMultipleServices = async (ids) => {
  const response = await api.post('/admin/services/restore-multiple', { ids });
  return response.data;
};

export const forceDeleteMultipleServices = async (ids) => {
  const response = await api.post('/admin/services/force-delete-multiple', { ids });
  return response.data;
};

// ========================================
// HELPER FUNCTIONS
// ========================================

export const buildServiceQueryParams = (filters = {}) => {
  const params = {};

  if (filters.search) params.search = filters.search;
  if (filters.category_id) params.category_id = filters.category_id;
  if (filters.type) params.type = filters.type;
  if (filters.pricing_model) params.pricing_model = filters.pricing_model;
  if (filters.min_price) params.min_price = filters.min_price;
  if (filters.max_price) params.max_price = filters.max_price;
  if (filters.remote_only) params.remote_only = true;
  if (filters.requires_site_visit !== undefined) params.requires_site_visit = filters.requires_site_visit;
  if (filters.featured) params.featured = true;
  if (filters.sort_by) params.sort_by = filters.sort_by;
  if (filters.sort_order) params.sort_order = filters.sort_order;
  if (filters.per_page) params.per_page = filters.per_page;
  if (filters.page) params.page = filters.page;

  if (filters.status) params.status = filters.status;
  if (filters.is_available !== undefined) params.is_available = filters.is_available;
  if (filters.is_visible !== undefined) params.is_visible = filters.is_visible;
  if (filters.is_featured !== undefined) params.is_featured = filters.is_featured;

  return params;
};

export default {
  getServices,
  getFeaturedServices,
  getServiceById,
  getRelatedServices,
  getServiceTypes, 
  getAdminServices,
  getAvailableServices,
  getAvailableProducts,
  createService,
  updateService,
  deleteService,
  restoreService,
  publishService,
  unpublishService,
  getServiceStatistics,
  getTrashedServices,
  restoreMultipleServices,
  forceDeleteMultipleServices,
  buildServiceQueryParams,
};