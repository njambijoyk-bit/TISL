import api from './axios';

/** Events as visitors see them, and buying tickets. No sign-in is needed; a signed-in customer's token (if sent) links the purchase to them. */
const eventsPublicAPI = {
  list: async (params) => (await api.get('/events', { params })).data.data,
  get: async (slug) => (await api.get(`/events/${encodeURIComponent(slug)}`)).data,
  quote: async (slug, items) => (await api.post(`/events/${encodeURIComponent(slug)}/quote`, { items })).data,
  buy: async (slug, body) => (await api.post(`/events/${encodeURIComponent(slug)}/buy`, body)).data,
};

export default eventsPublicAPI;
