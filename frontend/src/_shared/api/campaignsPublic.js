import api from './axios';

/** Campaigns as visitors see them (the Campaigns module). A signed-in visitor's token is sent as usual, so audience rules can apply. */
const campaignsPublicAPI = {
  list: async () => (await api.get('/campaigns')).data,
  featured: async () => (await api.get('/campaigns/featured')).data.data,
  get: async (slug) => (await api.get(`/campaigns/${encodeURIComponent(slug)}`)).data,
};

export default campaignsPublicAPI;
