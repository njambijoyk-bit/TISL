import api from './axios';

// The notification system's staff side (docs/NOTIFICATIONS_PLAN.md): settings, their versions and rollback, the log of every action, the delivery log.
// A secret is never returned: it comes back as { set, hint }. To keep one, leave it blank when saving; to change it, send the new value; to empty it, list its path in `clear`.
const notificationSettingsAPI = {
  show: () => api.get('/admin/notifications/settings').then((r) => r.data),
  /** body: the fields to change (+ clear: [paths], anyway: bool, test_to: email) */
  save: (part, body) => api.put(`/admin/notifications/settings/${part}`, body).then((r) => r.data),
  testEmail: (to) => api.post('/admin/notifications/settings/email/test', { to: to || undefined }).then((r) => r.data),
  reset: (part) => api.post(`/admin/notifications/settings/${part}/reset`).then((r) => r.data),
  versions: (part) => api.get(`/admin/notifications/settings/${part}/versions`).then((r) => r.data),
  rollback: (part, id) => api.post(`/admin/notifications/settings/${part}/versions/${id}/rollback`).then((r) => r.data),
  purgeKeys: (versionIds) => api.post('/admin/notifications/settings/purge-keys', { version_ids: versionIds }).then((r) => r.data),
  log: (params = {}) => api.get('/admin/notifications/log', { params }).then((r) => r.data),
  deliveries: (params = {}) => api.get('/admin/notifications/deliveries', { params }).then((r) => r.data),
  /** WhatsApp messages for a person to send by hand: status to_send (default) | sent | skipped | all */
  whatsapp: (params = {}) => api.get('/admin/notifications/whatsapp', { params }).then((r) => r.data),
  markSent: (id) => api.post(`/admin/notifications/deliveries/${id}/mark-sent`).then((r) => r.data),
  skip: (id, why) => api.post(`/admin/notifications/deliveries/${id}/skip`, { why: why || undefined }).then((r) => r.data),
  retry: (id) => api.post(`/admin/notifications/deliveries/${id}/retry`).then((r) => r.data),
};

export default notificationSettingsAPI;
