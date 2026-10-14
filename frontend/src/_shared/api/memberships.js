import api from './axios';

/** Memberships (admin): plans, their benefits and the settings. */
export const membershipsAPI = {
  meta: async () => (await api.get('/admin/memberships/meta')).data,
  saveSettings: async (payload) => (await api.put('/admin/memberships/settings', payload)).data,
  plans: async (params) => (await api.get('/admin/memberships/plans', { params })).data,
  plan: async (id) => (await api.get(`/admin/memberships/plans/${id}`)).data,
  createPlan: async (payload) => (await api.post('/admin/memberships/plans', payload)).data,
  savePlan: async (id, payload) => (await api.put(`/admin/memberships/plans/${id}`, payload)).data,
  setStatus: async (id, action) => (await api.post(`/admin/memberships/plans/${id}/${action}`)).data,
  members: async (params) => (await api.get('/admin/memberships/members', { params })).data,
  member: async (id) => (await api.get(`/admin/memberships/members/${id}`)).data,
  people: async (q) => (await api.get('/admin/memberships/people', { params: { q } })).data,
  quote: async (payload) => (await api.post('/admin/memberships/members/quote', payload)).data,
  join: async (payload) => (await api.post('/admin/memberships/members', payload)).data,
  takePayment: async (periodId, tenders) => (await api.post(`/admin/memberships/periods/${periodId}/payment`, { tenders })).data,
  cancel: async (id, payload) => (await api.post(`/admin/memberships/members/${id}/cancel`, payload)).data,
  keep: async (id) => (await api.post(`/admin/memberships/members/${id}/keep`)).data,
  pause: async (id, days) => (await api.post(`/admin/memberships/members/${id}/pause`, { days })).data,
  resume: async (id) => (await api.post(`/admin/memberships/members/${id}/resume`)).data,
  changePlan: async (id, planId) => (await api.post(`/admin/memberships/members/${id}/change-plan`, { plan_id: planId })).data,
  refund: async (periodId, payload) => (await api.post(`/admin/memberships/periods/${periodId}/refund`, payload)).data,
  adjustCredits: async (id, delta, reason) => (await api.post(`/admin/memberships/members/${id}/credits`, { delta, reason })).data,
  give: async (payload) => (await api.post('/admin/memberships/members/give', payload)).data,
  checkinMeta: async () => (await api.get('/admin/memberships/checkin/meta')).data,
  checkinRecent: async (params) => (await api.get('/admin/memberships/checkin/recent', { params })).data,
  checkinPeople: async (q) => (await api.get('/admin/memberships/checkin/people', { params: { q } })).data,
  checkinScan: async (code, locationId) => (await api.post('/admin/memberships/checkin/scan', { code, location_id: locationId || undefined })).data,
  checkinManual: async (userId, locationId) => (await api.post('/admin/memberships/checkin/manual', { user_id: userId, location_id: locationId || undefined })).data,
  report: async (params) => (await api.get('/admin/memberships/reports', { params })).data,
  membersCsv: async (params) => (await api.get('/admin/memberships/reports/members.csv', { params, responseType: 'blob' })).data,
  removePlan: async (id) => (await api.delete(`/admin/memberships/plans/${id}`)).data,
};

export default membershipsAPI;
