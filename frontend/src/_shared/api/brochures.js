import api from './axios';

/** Service brochures: the customer's data route, and the staff routes for settings and preview. */
const brochuresAPI = {
  publicData: async (serviceId) => (await api.get(`/services/${serviceId}/brochure`)).data,
  preview: async (serviceId) => (await api.get(`/admin/services/${serviceId}/brochure`)).data,
  list: async () => (await api.get('/admin/brochures')).data,
  saveDefaults: async (settings) => (await api.put('/admin/brochures/defaults', { settings })).data,
  saveServices: async (ids, settings, clear = []) => (await api.put('/admin/brochures/services', { ids, settings, clear })).data,
};

export default brochuresAPI;
