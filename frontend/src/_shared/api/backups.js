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

  // Table-assignment form data + save.
  getTables: async () => {
    const { data } = await api.get('/admin/backups/tables');
    return data; // { unassigned, modules, assignments }
  },

  assignTables: async (assignments) => {
    const { data } = await api.post('/admin/backups/tables', { assignments });
    return data;
  },

  getRuns: async () => {
    const { data } = await api.get('/admin/backups/runs');
    return data; // { runs: [...] }
  },

  runNow: async () => {
    const { data } = await api.post('/admin/backups/run');
    return data;
  },

  // Local destination: build + stream the .wnkjba to the browser as a download.
  downloadNow: async () => {
    const res = await api.post('/admin/backups/download', {}, { responseType: 'blob' });
    const cd = res.headers['content-disposition'] || '';
    const m = /filename="?([^";]+)"?/.exec(cd);
    const name = m ? m[1] : `wnkj-backup-${Date.now()}.wnkjba`;
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    return { ok: true, filename: name };
  },

  // ── Restore (super_admin) ────────────────────────────────────────────────
  restoreFiles: async () => {
    const { data } = await api.get('/admin/backups/restore/files');
    return data; // { files: [{filename, size}] }
  },

  restoreUpload: async (file, passphrase, mode) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('passphrase', passphrase);
    fd.append('mode', mode);
    const { data } = await api.post('/admin/backups/restore/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  restorePull: async (filename, passphrase, mode) => {
    const { data } = await api.post('/admin/backups/restore/pull', { filename, passphrase, mode });
    return data;
  },
};

export default backupsAPI;
