import api from './axios';

/** What a self-checkout screen asks for (/pos/self/{token}). The secret in the screen's address is its only key; it can reach nothing on the staff side. */
const posSelfAPI = {
  config: async (token) => (await api.get(`/pos/self/${token}`)).data,
  catalogue: async (token, q) => (await api.get(`/pos/self/${token}/catalogue`, { params: { q } })).data,
  scan: async (token, code) => (await api.get(`/pos/self/${token}/scan`, { params: { code } })).data,
  quote: async (token, items) => (await api.post(`/pos/self/${token}/quote`, { items })).data,
  order: async (token, payload) => (await api.post(`/pos/self/${token}/orders`, payload)).data,
  status: async (token, session) => (await api.get(`/pos/self/${token}/orders/${session}`)).data,
  cancel: async (token, session) => (await api.post(`/pos/self/${token}/orders/${session}/cancel`)).data,
  assist: async (token, session, body) => (await api.post(`/pos/self/${token}/orders/${session}/assist`, body)).data,
  receipt: async (token, session) => (await api.get(`/pos/self/${token}/orders/${session}/receipt`)).data,
};

export default posSelfAPI;
