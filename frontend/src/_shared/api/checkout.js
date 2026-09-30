import api from './axios';

const checkoutAPI = {
  options: async () => (await api.get('/checkout/options')).data,
  quote: async (data) => (await api.post('/checkout/quote', data)).data,
  place: async (data) => (await api.post('/checkout/place', data)).data,
  attempt: async (id, check = false) => (await api.get(`/customer/checkout/attempts/${id}`, { params: check ? { check: 1 } : undefined })).data,
  payOrder: async (id, data) => (await api.post(`/customer/checkout/orders/${id}/pay`, data)).data,
  orders: async (params) => (await api.get('/customer/sales-orders', { params })).data,
  order: async (id) => (await api.get(`/customer/sales-orders/${id}`)).data,
  updateOrder: async (id, data) => (await api.put(`/customer/sales-orders/${id}`, data)).data,
  reviewDocument: async (id, note) => (await api.post(`/customer/sales-orders/documents/${id}/review`, { note })).data,
  cancelOrder: async (id) => (await api.post(`/customer/sales-orders/${id}/cancel`)).data,
};

export default checkoutAPI;
