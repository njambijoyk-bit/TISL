import api from './axios';

/** What a self-order kiosk screen asks for. The secret in the screen's address (the token) is its only key. */
const kioskAPI = {
  config: async (token) => (await api.get(`/kiosk/${token}`)).data,
  quote: async (token, payload) => (await api.post(`/kiosk/${token}/quote`, payload)).data,
  order: async (token, payload) => (await api.post(`/kiosk/${token}/orders`, payload)).data,
  status: async (token, session) => (await api.get(`/kiosk/${token}/orders/${session}`)).data,
  cancel: async (token, session) => (await api.post(`/kiosk/${token}/orders/${session}/cancel`)).data,
  receipt: async (token, session) => (await api.get(`/kiosk/${token}/orders/${session}/receipt`)).data,
};

export default kioskAPI;
