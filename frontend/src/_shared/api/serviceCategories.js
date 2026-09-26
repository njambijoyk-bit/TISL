import api from './axios';

/**
 * Service Categories API
 * Handles all service category-related API calls
 */

// ========================================
// PUBLIC CATEGORY ENDPOINTS (No Auth)
// ========================================

/**
 * Get all active service categories
 * @param {Object} params - Query parameters (search, parents_only, all)
 * @returns {Promise} - Categories list
 */
export const getServiceCategories = async (params = {}) => {
  const response = await api.get('/service-categories', { params });
  return response.data;
};

/**
 * Get main/parent categories only
 * @returns {Promise} - Parent categories list
 */
export const getMainCategories = async () => {
  const response = await api.get('/service-categories/main');
  return response.data;
};

/**
 * Get single category by ID
 * @param {number} id - Category ID
 * @returns {Promise} - Category details with services
 */
export const getCategoryById = async (id) => {
  const response = await api.get(`/service-categories/${id}`);
  return response.data;
};

/**
 * Get subcategories of a category
 * @param {number} id - Parent category ID
 * @returns {Promise} - Subcategories list
 */
export const getSubcategories = async (id) => {
  const response = await api.get(`/service-categories/${id}/subcategories`);
  return response.data;
};

// ========================================
// ADMIN CATEGORY ENDPOINTS (Auth Required)
// ========================================

/**
 * Get all categories (admin - includes inactive)
 * @param {Object} params - Query parameters
 * @returns {Promise} - Categories list with pagination
 */
export const getAdminCategories = async (params = {}) => {
  const response = await api.get('/admin/service-categories', { params });
  return response.data;
};

/**
 * Create new category
 * @param {Object} data - Category data
 * @returns {Promise} - Created category
 */
export const createCategory = async (data) => {
  const response = await api.post('/admin/service-categories', data);
  return response.data;
};

/**
 * Update category
 * @param {number} id - Category ID
 * @param {Object} data - Updated category data
 * @returns {Promise} - Updated category
 */
export const updateCategory = async (id, data) => {
  const response = await api.put(`/admin/service-categories/${id}`, data);
  return response.data;
};

/**
 * Delete category
 * @param {number} id - Category ID
 * @returns {Promise} - Success message
 */
export const deleteCategory = async (id) => {
  const response = await api.delete(`/admin/service-categories/${id}`);
  return response.data;
};

/**
 * Reorder categories
 * @param {Array} categories - Array of {id, display_order}
 * @returns {Promise} - Success message
 */
export const reorderCategories = async (categories) => {
  const response = await api.post('/admin/service-categories/reorder', { categories });
  return response.data;
};

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Build hierarchical category tree
 * @param {Array} categories - Flat array of categories
 * @param {number} parentId - Parent ID (null for root)
 * @returns {Array} - Hierarchical category tree
 */
export const buildCategoryTree = (categories, parentId = null) => {
  return categories
    .filter(cat => cat.parent_id === parentId)
    .map(cat => ({
      ...cat,
      children: buildCategoryTree(categories, cat.id)
    }));
};

/**
 * Flatten category tree to array
 * @param {Array} tree - Hierarchical category tree
 * @returns {Array} - Flat array of categories
 */
export const flattenCategoryTree = (tree) => {
  return tree.reduce((acc, cat) => {
    acc.push(cat);
    if (cat.children && cat.children.length > 0) {
      acc.push(...flattenCategoryTree(cat.children));
    }
    return acc;
  }, []);
};

export default {
  getServiceCategories,
  getMainCategories,
  getCategoryById,
  getSubcategories,
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  buildCategoryTree,
  flattenCategoryTree,
};