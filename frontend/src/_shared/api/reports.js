import api from './axios';

/**
 * Reports API
 * Aggregated analytics endpoints for the admin reports dashboard.
 * All monetary totals are normalised to KES.
 */

const reportsAPI = {

  /** GET /admin/reports/revenue?period=30d */
  getRevenue: async (params = {}) => {
    const { data } = await api.get('/admin/reports/revenue', { params });
    return data;
  },

  /** GET /admin/reports/orders?period=30d */
  getOrders: async (params = {}) => {
    const { data } = await api.get('/admin/reports/orders', { params });
    return data;
  },

  /** GET /admin/reports/products?period=30d */
  getProducts: async (params = {}) => {
    const { data } = await api.get('/admin/reports/products', { params });
    return data;
  },

  /** GET /admin/reports/brands?period=30d */
  getBrands: async (params = {}) => {
    const { data } = await api.get('/admin/reports/brands', { params });
    return data;
  },

  /** GET /admin/reports/services?period=30d */
  getServices: async (params = {}) => {
    const { data } = await api.get('/admin/reports/services', { params });
    return data;
  },

  /** GET /admin/reports/quote-funnel?period=30d */
  getQuoteFunnel: async (params = {}) => {
    const { data } = await api.get('/admin/reports/quote-funnel', { params });
    return data;
  },

  /** GET /admin/reports/projects?period=30d */
  getProjects: async (params = {}) => {
    const { data } = await api.get('/admin/reports/projects', { params });
    return data;
  },

  /** GET /admin/reports/customers?period=30d */
  getCustomers: async (params = {}) => {
    const { data } = await api.get('/admin/reports/customers', { params });
    return data;
  },

  /** GET /admin/reports/tickets?period=30d */
  getTickets: async (params = {}) => {
    const { data } = await api.get('/admin/reports/tickets', { params });
    return data;
  },

  /** GET /admin/reports/promos?period=30d */
  getPromos: async (params = {}) => {
    const { data } = await api.get('/admin/reports/promos', { params });
    return data;
  },

  /** GET /admin/reports/system?period=30d */
  getSystem: async (params = {}) => {
    const { data } = await api.get('/admin/reports/system', { params });
    return data;
  },

  /** GET /admin/reports/extras?period=30d */
  getExtras: async (params = {}) => {
    const { data } = await api.get('/admin/reports/extras', { params });
    return data;
  },

  /** GET /admin/reports/summary?period=30d */
  getSummary: async (params = {}) => {
    const { data } = await api.get('/admin/reports/summary', { params });
    return data;
  },
};

export default reportsAPI;