import api from './axios';

/**
 * A customer's orders and the orders to pick from when linking projects. Orders are Sales Order vouchers (see booksAPI / checkoutAPI for
 * making and paying them); nothing here creates or edits an order.
 */
const ordersAPI = {
  /** Orders to pick from: { data: [{ id, number, status, date, total, customer_id, customer }] }, narrowed to a customer when given. */
  getOrderOptions: async (params = {}) => (await api.get('/admin/order-options', { params })).data,

  getCustomerOrderStatistics: async (customerId) => {
    const { data } = await api.get(`/admin/customers/${customerId}/order-statistics`);
    return data;
  },

  getAdminCustomerOrders: async (customerId, params = {}) => {
    const { data } = await api.get(`/admin/customers/${customerId}/orders`, { params });
    return data; // Laravel paginator
  },
};

export default ordersAPI;
