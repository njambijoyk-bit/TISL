import api from './axios';

const checkoutAPI = {
  options: async () => (await api.get('/checkout/options')).data,
  quote: async (data) => (await api.post('/checkout/quote', data)).data,
  place: async (data) => (await api.post('/checkout/place', data)).data,
  attempt: async (id, check = false) => (await api.get(`/checkout/attempts/${id}`, { params: check ? { check: 1 } : undefined })).data,
  payOrder: async (id, data) => (await api.post(`/checkout/orders/${id}/pay`, data)).data,
  orders: async (params) => (await api.get('/sales-orders', { params })).data,
  order: async (id) => (await api.get(`/sales-orders/${id}`)).data,
  updateOrder: async (id, data) => (await api.put(`/sales-orders/${id}`, data)).data,
  reviewDocument: async (id, note) => (await api.post(`/sales-orders/documents/${id}/review`, { note })).data,
  cancelOrder: async (id) => (await api.post(`/sales-orders/${id}/cancel`)).data,
};

export default checkoutAPI;
