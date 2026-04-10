import api from './axios';

/**
 * Quotes API - UPDATED FOR COMPOUND DISCOUNTS
 * Handles quote management and operations
 */

// ========================================
// ADMIN QUOTE ENDPOINTS
// ========================================

/**
 * Get all quotes
 * @param {Object} params - Query parameters (status, search, priority, etc.)
 * @returns {Promise} - Quotes list with pagination
 */
export const getAllQuotes = async (params = {}) => {
  const response = await api.get('/admin/quotes', { params });
  return response.data;
};

export const getAdminCustomerQuotes = async (customerId, params = {}) => {
  const response = await api.get('/admin/quotes', {
    params: { ...params, customer_id: customerId },
  });
  return response.data;
};

/**
 * Get single quote by ID
 * @param {number} id - Quote ID
 * @returns {Promise} - Quote details with items
 */
export const getQuoteById = async (id) => {
  const response = await api.get(`/admin/quotes/${id}`);
  return response.data;
};

/**
 * Create new quote manually
 * @param {Object} data - Quote data
 * @returns {Promise} - Created quote
 */
export const createQuote = async (data) => {
  const response = await api.post('/admin/quotes', data);
  return response.data;
};

/**
 * Update quote
 * @param {number} id - Quote ID
 * @param {Object} data - Updated data
 * @returns {Promise} - Updated quote
 */
export const updateQuote = async (id, data) => {
  const response = await api.put(`/admin/quotes/${id}`, data);
  return response.data;
};

/**
 * Delete quote
 * @param {number} id - Quote ID
 * @returns {Promise}
 */
export const deleteQuote = async (id) => {
  const response = await api.delete(`/admin/quotes/${id}`);
  return response.data;
};

/**
 * Get trashed quotes (admin)
 */
export const getAdminTrashQuotes = async (params = {}) => {
  const response = await api.get('/admin/quotes/trash', { params });
  return response.data;
};

/**
 * Restore a single trashed quote (admin)
 */
export const restoreAdminQuote = async (id) => {
  const response = await api.post(`/admin/quotes/${id}/restore`);
  return response.data;
};

/**
 * Restore multiple trashed quotes (admin)
 */
export const restoreMultipleAdminQuotes = async (payload) => {
  // payload: { ids: [1,2,3] }
  const response = await api.post('/admin/quotes/restore-multiple', payload);
  return response.data;
};

/**
 * Permanently delete multiple trashed quotes (super admin)
 * Requires payload.confirm === 'DELETE'
 */
export const forceDeleteMultipleAdminQuotes = async (payload) => {
  // payload: { ids: [1,2,3], confirm: 'DELETE' }
  const response = await api.post('/admin/quotes/force-delete-multiple', payload);
  return response.data;
};

/**
 * Create quote from quote request
 * @param {number} requestId - Quote request ID
 * @returns {Promise} - Created quote
 */
export const createFromRequest = async (requestId) => {
  const response = await api.post(`/admin/quotes/from-request/${requestId}`);
  return response.data;
};

/**
 * Send quote to customer
 * @param {number} id - Quote ID
 * @returns {Promise} - Updated quote
 */
export const sendToCustomer = async (id) => {
  const response = await api.post(`/admin/quotes/${id}/send`);
  return response.data;
};

// ========================================
// QUOTE ITEM ENDPOINTS
// ========================================

/**
 * Add item to quote
 * @param {number} quoteId - Quote ID
 * @param {Object} itemData - Item data
 * @returns {Promise} - Created item and updated quote
 */
export const addItem = async (quoteId, itemData) => {
  const response = await api.post(`/admin/quotes/${quoteId}/items`, itemData);
  return response.data;
};

/**
 * Update quote item
 * @param {number} quoteId - Quote ID
 * @param {number} itemId - Item ID
 * @param {Object} data - Updated data
 * @returns {Promise} - Updated item and quote
 */
export const updateItem = async (quoteId, itemId, data) => {
  const response = await api.put(`/admin/quotes/${quoteId}/items/${itemId}`, data);
  return response.data;
};

/**
 * Delete quote item
 * @param {number} quoteId - Quote ID
 * @param {number} itemId - Item ID
 * @returns {Promise} - Updated quote
 */
export const deleteItem = async (quoteId, itemId) => {
  const response = await api.delete(`/admin/quotes/${quoteId}/items/${itemId}`);
  return response.data;
};

// ========================================
// CUSTOMER QUOTE ENDPOINTS
// ========================================

/**
 * Get customer's quotes
 * @param {Object} params - Query parameters
 * @returns {Promise} - Customer's quotes
 */
export const getMyQuotes = async (params = {}) => {
  const response = await api.get('/customer/quotes', { params });
  return response.data;
};

/**
 * Get customer quote by ID
 * @param {number} id - Quote ID
 * @returns {Promise} - Quote details
 */
export const getMyQuoteById = async (id) => {
  const response = await api.get(`/customer/quotes/${id}`);
  return response.data;
};

/**
 * Accept quote (customer)
 * @param {number} id - Quote ID
 * @returns {Promise} - Updated quote
 */
export const acceptQuote = async (id) => {
  const response = await api.post(`/customer/quotes/${id}/accept`);
  return response.data;
};

/**
 * Reject quote (customer)
 * @param {number} id - Quote ID
 * @param {string} reason - Rejection reason
 * @returns {Promise} - Updated quote
 */
export const rejectQuote = async (id, reason) => {
  const response = await api.post(`/customer/quotes/${id}/reject`, {
    rejection_reason: reason
  });
  return response.data;
};

/**
 * Request revision (customer)
 * @param {number} id - Quote ID
 * @param {string} notes - Revision notes
 * @returns {Promise} - Updated quote
 */
export const requestRevision = async (id, notes) => {
  const response = await api.post(`/customer/quotes/${id}/request-revision`, {
    revision_notes: notes
  });
  return response.data;
};

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Format quote for display
 * @param {Object} quote - Quote object
 * @returns {Object} - Formatted quote
 */
export const formatQuote = (quote) => {
  return {
    ...quote,
    status_label: getStatusLabel(quote.status),
    priority_label: getPriorityLabel(quote.priority),
    type_label: getTypeLabel(quote.quote_type),
    quoted_amount: quote.total,
  };
};

/**
 * Get status label
 * @param {string} status
 * @returns {string}
 */
const getStatusLabel = (status) => {
  const labels = {
    draft: 'Draft',
    pending: 'Pending',
    revised: 'Revised',
    approved: 'Approved',
    rejected: 'Rejected',
    expired: 'Expired',
    converted: 'Converted to Order',
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
  };
  return labels[type] || type;
};

/**
 * Calculate quote totals - UPDATED FOR COMPOUND DISCOUNTS
 * Now properly handles item-level discounts AND quote-level discount
 * 
 * @param {Array} items - Quote items
 * @param {number} quoteDiscount - Quote-level discount amount
 * @param {number} tax - Tax amount
 * @param {number} shipping - Shipping cost
 * @returns {Object} - Comprehensive totals breakdown
 */
export const calculateQuoteTotals = (items = [], quoteDiscount = 0, tax = 0, shipping = 0) => {
  // Calculate original total (before any discounts)
  const originalTotal = items.reduce((sum, item) => {
    return sum + (parseFloat(item.line_total || 0));
  }, 0);
  
  // Calculate total item-level discounts
  const itemDiscounts = items.reduce((sum, item) => {
    return sum + (parseFloat(item.discount_amount || 0));
  }, 0);
  
  // Subtotal after item discounts (sum of line_total_after_discount)
  const subtotalAfterItemDiscounts = items.reduce((sum, item) => {
    return sum + (parseFloat(item.line_total_after_discount || item.line_total || 0));
  }, 0);
  
  // Additional quote-level discount
  const quoteLevelDiscount = parseFloat(quoteDiscount) || 0;
  
  // Subtotal after ALL discounts
  const subtotalAfterAllDiscounts = subtotalAfterItemDiscounts - quoteLevelDiscount;
  
  // Total savings (both discount levels combined)
  const totalSavings = itemDiscounts + quoteLevelDiscount;
  
  // Final total with tax and shipping
  const total = subtotalAfterAllDiscounts + parseFloat(tax) + parseFloat(shipping);

  return {
    originalTotal,              // Total before any discounts
    itemDiscounts,              // Sum of all item-level discounts
    subtotalAfterItemDiscounts, // After item discounts, before quote discount
    quoteDiscount: quoteLevelDiscount,  // Quote-level discount
    subtotalAfterAllDiscounts,  // After both discount levels
    totalSavings,               // Combined savings from both levels
    tax: parseFloat(tax),
    shipping: parseFloat(shipping),
    total,                      // Final amount customer pays
    
    // Legacy compatibility (keep these for backward compatibility)
    subtotal: subtotalAfterItemDiscounts,  // Maps to subtotalAfterItemDiscounts
    afterDiscount: subtotalAfterAllDiscounts, // Maps to subtotalAfterAllDiscounts
    discount: quoteLevelDiscount, // Maps to quote-level discount
  };
};

export const quotesAPI = {
  getAllQuotes,
  getQuoteById,
  getAdminTrashQuotes,
  restoreAdminQuote,
  restoreMultipleAdminQuotes,
  forceDeleteMultipleAdminQuotes,
  createQuote,
  updateQuote,
  deleteQuote,
  createFromRequest,
  sendToCustomer,
  addItem,
  updateItem,
  deleteItem,
  getMyQuotes,
  getMyQuoteById,
  acceptQuote,
  rejectQuote,
  requestRevision,
  getAdminCustomerQuotes,
  formatQuote,
  calculateQuoteTotals,
};

export default quotesAPI;