import api from './axios';

/**
 * Read-only views of the retired order tables that a few screens still use (customer history, activity feed,
 * report counts, project links, delivery). Orders are made, changed and paid as vouchers now (see booksAPI /
 * checkoutAPI); nothing here creates or edits an order.
 */
const ordersAPI = {
  getAllOrders: async (params = {}) => {
    const { data } = await api.get('/admin/orders', { params });
    return data; // { data: [], meta: {} }
  },

  getOrderStatistics: async () => {
    const { data } = await api.get('/admin/orders/statistics');
    return data;
  },

  getAllOrderActivity: (params) => api.get('/admin/orders/activity', { params }).then((r) => r.data),

  getCustomerOrderStatistics: async (customerId) => {
    const { data } = await api.get(`/admin/orders/${customerId}/order-statistics`);
    return data;
  },

  getAdminCustomerOrders: async (customerId, params = {}) => {
    const { data } = await api.get(`/admin/customers/${customerId}/orders`, { params });
    return data; // Laravel paginator
  },
};

export default ordersAPI;
