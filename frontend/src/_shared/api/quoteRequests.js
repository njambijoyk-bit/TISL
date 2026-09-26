import api from './axios';

/**
 * Quote Requests API
 * Handles quote request workflow (Option B)
 */

// ========================================
// CUSTOMER QUOTE REQUEST ENDPOINTS
// ========================================

/**
 * Get customer's quote requests
 * @param {Object} params - Query parameters (status, sort_by, etc.)
 * @returns {Promise} - Quote requests list with pagination
 */
export const getMyQuoteRequests = async (params = {}) => {
  const response = await api.get('/customer/quote-requests', { params });
  return response.data;
};

/**
 * Get single quote request
 * @param {number} id - Quote request ID
 * @returns {Promise} - Quote request details
 */
export const getQuoteRequestById = async (id) => {
  const response = await api.get(`/customer/quote-requests/${id}`);
  return response.data;
};

/**
 * Create new quote request
 * @param {Object} data - Quote request data
 * @returns {Promise} - Created quote request
 */
export const createQuoteRequest = async (data) => {
  const response = await api.post('/customer/quote-requests', data);
  return response.data;
};

/**
 * Create quote request with file attachments
 * @param {Object} data - Quote request data
 * @param {Array} files - Array of File objects
 * @returns {Promise} - Created quote request
 */
export const createQuoteRequestWithFiles = async (data, files = []) => {
  const formData = new FormData();
  
  // Add text fields
  Object.keys(data).forEach(key => {
    if (key === 'requested_items') {
      formData.append(key, JSON.stringify(data[key]));
    } else if (data[key] !== null && data[key] !== undefined) {
      formData.append(key, data[key]);
    }
  });
  
  // Add files
  files.forEach((file, index) => {
    formData.append(`attachment_files[${index}]`, file);
  });
  
  const response = await api.post('/customer/quote-requests', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

/**
 * Update quote request (only if pending)
 * @param {number} id - Quote request ID
 * @param {Object} data - Updated data
 * @returns {Promise} - Updated quote request
 */
export const updateQuoteRequest = async (id, data) => {
  const response = await api.put(`/customer/quote-requests/${id}`, data);
  return response.data;
};

/**
 * Respond to clarification request
 * @param {number} id - Quote request ID
 * @param {string} response - Clarification response
 * @returns {Promise} - Updated quote request
 */
export const respondToClarification = async (id, clarificationResponse) => {
  const response = await api.post(`/customer/quote-requests/${id}/clarify`, {
    clarification_response: clarificationResponse
  });
  return response.data;
};

// quoteRequests.js
export const updateQuoteRequestWithFiles = async (id, data, files = [], removedPaths = []) => {
  const formData = new FormData();

  formData.append('_method', 'PUT');

  Object.keys(data).forEach((key) => {
    if (key === 'requested_items') {
      formData.append(key, JSON.stringify(data[key] || [])); // ✅ critical
    } else if (data[key] !== null && data[key] !== undefined) {
      formData.append(key, data[key]);
    }
  });

  // removed attachments (by path or name)
  removedPaths.forEach((p, idx) => {
    formData.append(`removed_attachment_paths[${idx}]`, p);
  });

  // new files
  files.forEach((file, index) => {
    formData.append(`attachment_files[${index}]`, file);
  });

  const response = await api.post(`/customer/quote-requests/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return response.data;
};


// ========================================
// ADMIN QUOTE REQUEST ENDPOINTS
// ========================================

/**
 * Get all quote requests (admin)
 * @param {Object} params - Query parameters (status, search, priority, etc.)
 * @returns {Promise} - Quote requests list with pagination
 */
export const getAdminQuoteRequests = async (params = {}) => {
  const response = await api.get('/admin/quote-requests', { params });
  return response.data;
};

/**
 * Get single quote request (admin)
 * @param {number} id - Quote request ID
 * @returns {Promise} - Quote request details
 */
export const getAdminQuoteRequestById = async (id) => {
  const response = await api.get(`/admin/quote-requests/${id}`);
  return response.data;
};

/**
 * Assign quote request to admin
 * @param {number} id - Quote request ID
 * @param {number} adminId - Admin user ID
 * @returns {Promise} - Updated quote request
 */
export const assignQuoteRequest = async (id, adminId) => {
  const response = await api.post(`/admin/quote-requests/${id}/assign`, {
    admin_id: adminId
  });
  return response.data;
};

/**
 * Request clarification from customer
 * @param {number} id - Quote request ID
 * @param {string} notes - Clarification notes
 * @returns {Promise} - Updated quote request
 */
export const requestClarification = async (id, notes) => {
  const response = await api.post(`/admin/quote-requests/${id}/clarify`, {
    clarification_notes: notes
  });
  return response.data;
};

/**
 * Reject quote request
 * @param {number} id - Quote request ID
 * @param {string} reason - Rejection reason
 * @returns {Promise} - Updated quote request
 */
export const rejectQuoteRequest = async (id, reason) => {
  const response = await api.post(`/admin/quote-requests/${id}/reject`, {
    rejection_reason: reason
  });
  return response.data;
};

/**
 * Convert quote request to quote
 * @param {number} id - Quote request ID
 * @returns {Promise} - Quote request data for conversion
 */
export const convertToQuote = async (id) => {
  const response = await api.post(`/admin/quote-requests/${id}/convert`);
  return response.data;
};

/**
 * Update priority
 * @param {number} id - Quote request ID
 * @param {string} priority - Priority level (low, medium, high, urgent)
 * @returns {Promise} - Updated quote request
 */
export const updatePriority = async (id, priority) => {
  const response = await api.put(`/admin/quote-requests/${id}/priority`, {
    priority
  });
  return response.data;
};

/**
 * Add admin notes
 * @param {number} id - Quote request ID
 * @param {string} notes - Admin notes
 * @returns {Promise} - Updated quote request
 */
export const addAdminNotes = async (id, notes) => {
  const response = await api.post(`/admin/quote-requests/${id}/notes`, {
    admin_notes: notes
  });
  return response.data;
};

/**
 * Get quote request statistics
 * @returns {Promise} - Statistics object
 */
export const getQuoteRequestStatistics = async () => {
  const response = await api.get('/admin/quote-requests/statistics');
  return response.data;
};

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Build requested items array from form data
 * @param {Array} items - Form items
 * @returns {Array} - Formatted requested items
 */
export const buildRequestedItems = (items) => {
  return items.map(item => ({
    item_type: item.type || 'product',
    description: item.description,
    quantity: item.quantity || null,
    specifications: item.specifications || null,
    budget_per_unit: item.budget || null,
  }));
};

/**
 * Format quote request for display
 * @param {Object} request - Quote request object
 * @returns {Object} - Formatted request
 */
export const formatQuoteRequest = (request) => {
  return {
    ...request,
    status_label: getStatusLabel(request.status),
    priority_label: getPriorityLabel(request.priority),
    type_label: getTypeLabel(request.request_type),
  };
};

/**
 * Get status label
 * @param {string} status
 * @returns {string}
 */
const getStatusLabel = (status) => {
  const labels = {
    pending: 'Pending',
    reviewing: 'Under Review',
    quoted: 'Quote Created',
    rejected: 'Rejected',
    expired: 'Expired',
  };
  return labels[status] || status;
};

/**
 * Get priority label
 * @param {string} priority
 * @returns {string}
 */
const getPriorityLabel = (priority) => {
  const labels = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
  };
  return labels[priority] || priority;
};

/**
 * Get type label
 * @param {string} type
 * @returns {string}
 */
const getTypeLabel = (type) => {
  const labels = {
    product: 'Product',
    service: 'Service',
    mixed: 'Product & Service',
    not_sure: 'Not Sure',
  };
  return labels[type] || type;
};

export default {
  getMyQuoteRequests,
  getQuoteRequestById,
  createQuoteRequest,
  createQuoteRequestWithFiles,
  updateQuoteRequest,
  respondToClarification,
  getAdminQuoteRequests,
  getAdminQuoteRequestById,
  assignQuoteRequest,
  requestClarification,
  rejectQuoteRequest,
  convertToQuote,
  updatePriority,
  addAdminNotes,
  getQuoteRequestStatistics,
  buildRequestedItems,
  formatQuoteRequest,
};