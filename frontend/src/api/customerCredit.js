import api from './axios';

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — Customer Credit API
// Base: /admin/customers/{customerId}/credit
// ─────────────────────────────────────────────────────────────────────────────

const adminCreditAPI = {

  /**
   * Fetch global overview metrics (Total allocations, outstanding exposure, arrears)
   */
  getGlobalSummary: async () => {
    const response = await api.get('/admin/credit/global-summary');
    return response.data;
  },

  /**
   * Fetch all system portfolios with sorting, pagination, and multi-state filtering
   * @param {Object} params - { page, search, has_credit_account, is_overdue, sort_by, sort_dir }
   */
  getGlobalCustomers: async (params = {}) => {
    const response = await api.get('/admin/credit/global-customers', { params });
    return response.data;
  },

  // ── Summary ────────────────────────────────────────────────────────────────

  getSummary: async (customerId) => {
    const response = await api.get(`/admin/customers/${customerId}/credit/summary`);
    return response.data;
  },

  // ── Statement ──────────────────────────────────────────────────────────────

  /**
   * @param {Object} params - { type, direction, from, to, page, per_page }
   */
  getStatement: async (customerId, params = {}) => {
    const response = await api.get(`/admin/customers/${customerId}/credit/statement`, { params });
    return response.data;
  },

  // ── Payment ────────────────────────────────────────────────────────────────

  /**
   * @param {Object} data - { amount, note?, reference_type?, reference_id? }
   */
  recordPayment: async (customerId, data) => {
    const response = await api.post(`/admin/customers/${customerId}/credit/payment`, data);
    return response.data;
  },

  // ── Adjustment ─────────────────────────────────────────────────────────────

  /**
   * @param {Object} data - { amount, direction: 'debit'|'credit', note? }
   */
  adjustment: async (customerId, data) => {
    const response = await api.post(`/admin/customers/${customerId}/credit/adjustment`, data);
    return response.data;
  },

  // ── Interest ───────────────────────────────────────────────────────────────

  /**
   * @param {Object} data - { note? }
   */
  applyInterest: async (customerId, data = {}) => {
    const response = await api.post(`/admin/customers/${customerId}/credit/interest`, data);
    return response.data;
  },

  // ── Schedules ──────────────────────────────────────────────────────────────

  /**
   * @param {Object} params - { status?, page?, per_page? }
   */
  getSchedules: async (customerId, params = {}) => {
    const response = await api.get(`/admin/customers/${customerId}/credit/schedules`, { params });
    return response.data;
  },

  /**
   * @param {Object} data - { total_amount, installments, frequency, started_at, note? }
   */
  createSchedule: async (customerId, data) => {
    const response = await api.post(`/admin/customers/${customerId}/credit/schedules`, data);
    return response.data;
  },

  getSchedule: async (customerId, scheduleId) => {
    const response = await api.get(`/admin/customers/${customerId}/credit/schedules/${scheduleId}`);
    return response.data;
  },

  cancelSchedule: async (customerId, scheduleId) => {
    const response = await api.patch(`/admin/customers/${customerId}/credit/schedules/${scheduleId}/cancel`);
    return response.data;
  },

  /**
   * @param {Object} data - { note? }
   */
  payInstallment: async (customerId, scheduleId, itemId, data = {}) => {
    const response = await api.patch(
      `/admin/customers/${customerId}/credit/schedules/${scheduleId}/items/${itemId}/pay`,
      data
    );
    return response.data;
  },

  waiveInstallment: async (customerId, scheduleId, itemId) => {
    const response = await api.patch(
      `/admin/customers/${customerId}/credit/schedules/${scheduleId}/items/${itemId}/waive`
    );
    return response.data;
  },

  // ── Invoices ───────────────────────────────────────────────────────────────

  /**
   * @param {Object} params - { status?, page?, per_page? }
   */
  getInvoices: async (customerId, params = {}) => {
    const response = await api.get(`/admin/customers/${customerId}/credit/invoices`, { params });
    return response.data;
  },

  /**
   * @param {Object} data - { due_date?, note?, transaction_ids?: [], line_items?: [{description, amount}] }
   */
  createInvoice: async (customerId, data) => {
    const response = await api.post(`/admin/customers/${customerId}/credit/invoices`, data);
    return response.data;
  },

  getInvoice: async (customerId, invoiceId) => {
    const response = await api.get(`/admin/customers/${customerId}/credit/invoices/${invoiceId}`);
    return response.data;
  },

  /**
   * @param {Object} data - { status: 'draft'|'sent'|'paid'|'overdue'|'void' }
   */
  updateInvoiceStatus: async (customerId, invoiceId, data) => {
    const response = await api.patch(
      `/admin/customers/${customerId}/credit/invoices/${invoiceId}/status`,
      data
    );
    return response.data;
  },

  sendInvoice: async (customerId, invoiceId) => {
    const response = await api.post(
      `/admin/customers/${customerId}/credit/invoices/${invoiceId}/send`
    );
    return response.data;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER PORTAL — Credit API (read-only)
// Base: /customer/credit
// ─────────────────────────────────────────────────────────────────────────────

const customerCreditAPI = {

  getSummary: async () => {
    const response = await api.get('/customer/credit/summary');
    return response.data;
  },

  /**
   * @param {Object} params - { from?, to?, page?, per_page? }
   */
  getStatement: async (params = {}) => {
    const response = await api.get('/customer/credit/statement', { params });
    return response.data;
  },

  /**
   * @param {Object} params - { status?, page?, per_page? }
   */
  getInvoices: async (params = {}) => {
    const response = await api.get('/customer/credit/invoices', { params });
    return response.data;
  },

  getInvoice: async (invoiceId) => {
    const response = await api.get(`/customer/credit/invoices/${invoiceId}`);
    return response.data;
  },

  /**
   * @param {Object} params - { status?, page?, per_page? }
   */
  getSchedules: async (params = {}) => {
    const response = await api.get('/customer/credit/schedules', { params });
    return response.data;
  },
};

export { adminCreditAPI, customerCreditAPI };