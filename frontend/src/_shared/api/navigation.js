import api from './axios';

/**
 * Storefront navigation. Public feed drives the header; the admin endpoints
 * manage which links show, per licensed module.
 */
const navigationAPI = {
  getPublic: async () => {
    const { data } = await api.get('/nav');
    return data; // { links: [{ key, label, path }] }
  },

  getAdmin: async () => {
    const { data } = await api.get('/admin/navigation');
    return data; // { groups: [{ module, name, active, links: [...] }] }
  },

  updateLink: async (id, payload) => {
    const { data } = await api.put(`/admin/navigation/${id}`, payload);
    return data;
  },
};

export default navigationAPI;
