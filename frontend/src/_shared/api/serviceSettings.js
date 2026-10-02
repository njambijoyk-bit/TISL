import api from './axios';

/** Services settings: the cancellation and reschedule windows, and the defaults of every service fee. */
const serviceSettingsAPI = {
  get: async () => (await api.get('/admin/service-settings')).data,
  save: async (payload) => (await api.put('/admin/service-settings', payload)).data,
};

export default serviceSettingsAPI;
