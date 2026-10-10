import api from './axios';

/** Admin → Sign-in log (permission security.view): the lines and the numbers at the top. */
const securityAPI = {
  events: (params) => api.get('/admin/security/events', { params }).then((r) => r.data),
  summary: (hours) => api.get('/admin/security/summary', { params: { hours } }).then((r) => r.data),
};

export default securityAPI;
