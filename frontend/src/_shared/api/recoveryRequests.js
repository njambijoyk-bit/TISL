import api from './axios';

/**
 * Assisted recovery: a member of staff with no passkey device and no recovery code asks two other administrators for help (`mine`, `ask`, `cancel`, `start`), and the administrators look at it
 * (`approvals`, `options`, `approve`, `decline`, `stop`). The screens are core/components/account/AssistedRecoveryPanel and core/pages/admin/Approvals.
 */
const recoveryRequestsAPI = {
  mine: async () => (await api.get('/auth/recovery-requests/mine')).data,
  ask: async (note) => (await api.post('/auth/recovery-requests', { note })).data,
  cancel: async (id) => (await api.delete(`/auth/recovery-requests/${id}`)).data,
  start: async (id) => (await api.post(`/auth/recovery-requests/${id}/start`)).data,
  approvals: async () => (await api.get('/auth/recovery-approvals')).data,
  options: async (id) => (await api.post(`/auth/recovery-approvals/${id}/options`)).data,
  approve: async (id, body) => (await api.post(`/auth/recovery-approvals/${id}/approve`, body)).data,
  decline: async (id, reason) => (await api.post(`/auth/recovery-approvals/${id}/decline`, reason ? { reason } : {})).data,
  stop: async (id, reason) => (await api.post(`/auth/recovery-approvals/${id}/cancel`, reason ? { reason } : {})).data,
};

export default recoveryRequestsAPI;
