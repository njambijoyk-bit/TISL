import api from './axios';

/**
 * Branches / multi-location (Core). Public feed drives the storefront branch
 * picker; the admin endpoints manage the branches and staff clearance.
 */
const locationsAPI = {
  // Storefront: active branches for the picker.
  getPublic: async () => {
    const { data } = await api.get('/locations');
    return data; // { locations: [{ id, name, code, city, country, currency, is_default }] }
  },

  // Admin
  getAdmin: async () => {
    const { data } = await api.get('/admin/locations');
    return data; // { locations: [...], multi_branch }
  },
  getOptions: async () => {
    const { data } = await api.get('/admin/locations/options');
    return data; // { currencies, tax_districts, staff }
  },
  get: async (id) => {
    const { data } = await api.get(`/admin/locations/${id}`);
    return data.location;
  },
  create: async (payload) => {
    const { data } = await api.post('/admin/locations', payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await api.put(`/admin/locations/${id}`, payload);
    return data;
  },
  remove: async (id) => {
    const { data } = await api.delete(`/admin/locations/${id}`);
    return data;
  },
  setDefault: async (id) => {
    const { data } = await api.patch(`/admin/locations/${id}/default`);
    return data;
  },
};

export default locationsAPI;
