import api from './axios';

/**
 * Module licensing + Module Center.
 *
 * `/modules/active` is public (reveals only which modules are on, same as the
 * UI and footer already show); the rest are super_admin, except setup which
 * any staff user can reach while the install is unverified.
 */
const modulesAPI = {
  // Public — which paid modules are active (licensed AND switched on).
  getActive: async () => {
    const { data } = await api.get('/modules/active');
    return data; // { core: true, active: [...], verified: bool }
  },

  // Setup + licensing status for the whole app.
  getSetupStatus: async () => {
    const { data } = await api.get('/modules/setup-status');
    return data; // { installed, verified, business_name, key_version, locked_out }
  },

  // First install: paste the ownership code.
  setupOwnership: async (ownership_code) => {
    const { data } = await api.post('/modules/setup', { ownership_code });
    return data;
  },

  // Module Center (super_admin).
  index: async () => {
    const { data } = await api.get('/admin/modules');
    return data; // { business_name, modules: [...] }
  },

  activate: async (key) => {
    const { data } = await api.post('/admin/modules/activate', { key });
    return data;
  },

  toggle: async (moduleKey, enabled) => {
    const { data } = await api.patch(`/admin/modules/${moduleKey}/toggle`, { enabled });
    return data;
  },

  attempts: async () => {
    const { data } = await api.get('/admin/modules/attempts');
    return data; // { attempts: [...] }
  },
};

export default modulesAPI;
