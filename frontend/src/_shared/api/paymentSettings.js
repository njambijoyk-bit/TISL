import api from './axios';

// The payment keys (owner only): see docs/PAYMENT_SETTINGS.md. A key is never returned: it comes back as { set, hint }. Every change needs the owner's `password` again.
// To keep a key, leave it blank when saving; to change it, send the new value; to empty it, list its name in `clear`.
const paymentSettingsAPI = {
  show: () => api.get('/admin/payments/settings').then((r) => r.data),
  /** body: the fields to change + password (+ clear: [names], anyway: bool) */
  save: (part, body) => api.put(`/admin/payments/settings/${part}`, body).then((r) => r.data),
  /** try typed keys against Safaricom, saving nothing */
  test: (body) => api.post('/admin/payments/settings/mpesa/test', body).then((r) => r.data),
  /** a real KES 1 prompt through the live keys */
  testPrompt: (phone, password) => api.post('/admin/payments/settings/mpesa/test-prompt', { phone, password }).then((r) => r.data),
  rotateToken: (part, password) => api.post(`/admin/payments/settings/${part}/rotate-token`, { password }).then((r) => r.data),
  reset: (part, password) => api.post(`/admin/payments/settings/${part}/reset`, { password }).then((r) => r.data),
  versions: (part) => api.get(`/admin/payments/settings/${part}/versions`).then((r) => r.data),
  rollback: (part, id, password) => api.post(`/admin/payments/settings/${part}/versions/${id}/rollback`, { password }).then((r) => r.data),
  purgeKeys: (versionIds, password) => api.post('/admin/payments/settings/purge-keys', { version_ids: versionIds, password }).then((r) => r.data),
  log: (params = {}) => api.get('/admin/payments/log', { params }).then((r) => r.data),
};

export default paymentSettingsAPI;
