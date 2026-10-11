import api from './axios';

/** The menu as a customer reads it, and ordering from it. No sign-in needed. */
const menusPublicAPI = {
  get: async () => (await api.get('/menu')).data,
  channels: async () => (await api.get('/menu/channels')).data,
  quote: async (payload) => (await api.post('/menu/quote', payload)).data,
  place: async (payload) => (await api.post('/menu/orders', payload)).data,
  order: async (token) => (await api.get(`/menu/orders/${token}`)).data,
  cancelOrder: async (token) => (await api.post(`/menu/orders/${token}/cancel`)).data,
};

export default menusPublicAPI;
