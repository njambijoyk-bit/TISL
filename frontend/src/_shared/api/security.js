import api from './axios';

/** Admin → Sign-in log (permission security.view): the lines and the numbers at the top; and the passkey rule. */
const securityAPI = {
  events: (params) => api.get('/admin/security/events', { params }).then((r) => r.data),
  summary: (hours) => api.get('/admin/security/summary', { params: { hours } }).then((r) => r.data),
  // Admin → Security → who must use a passkey (security.view to see, security.manage to change)
  policy: () => api.get('/admin/security-policy').then((r) => r.data),
  savePolicy: (body) => api.put('/admin/security-policy', body).then((r) => r.data),
};

export default securityAPI;
