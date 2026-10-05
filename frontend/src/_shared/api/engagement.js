import api from './axios';

/** The Engagement Engine (Extras): the settings page (admin and super admin) and the public config the storefront reads. */
const engagementAPI = {
  settings: async () => (await api.get('/admin/engagement/settings')).data,
  save: async (data) => (await api.put('/admin/engagement/settings', data)).data,
  applyPreset: async (preset) => (await api.post('/admin/engagement/preset', { preset })).data,
  config: async () => (await api.get('/engagement/config')).data,
};

export default engagementAPI;
