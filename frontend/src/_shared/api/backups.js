import api from './axios';

/**
 * Backups (Core). Config + run are admin/super_admin; restore is super_admin.
 * Secrets are write-only: the API returns booleans/masked values, never the
 * raw passphrase or credentials.
 */
const backupsAPI = {
  getSettings: async () => {
    const { data } = await api.get('/admin/backups/settings');
    return data;
  },

  saveSettings: async (payload) => {
    const { data } = await api.put('/admin/backups/settings', payload);
    return data;
  },

  // What will / won't be backed up right now (drives the disabled-module banners).
  getPlan: async () => {
    const { data } = await api.get('/admin/backups/plan');
    return data; // { included, skipped, excluded, unassigned }
  },

  runNow: async () => {
    const { data } = await api.post('/admin/backups/run');
    return data;
  },

  restore: async (payload) => {
    const { data } = await api.post('/admin/backups/restore', payload);
    return data;
  },
};

export default backupsAPI;
