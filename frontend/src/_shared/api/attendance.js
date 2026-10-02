import api from './axios';

/** Attendance: sign in/out, the staff calendar, marking and verifying days, disputes, settings. */
const attendanceAPI = {
  get: async (month) => (await api.get('/admin/attendance', { params: { month } })).data,
  day: async (user_id, date) => (await api.get('/admin/attendance/day', { params: { user_id, date } })).data,
  signIn: async () => (await api.post('/admin/attendance/sign-in')).data,
  signOut: async () => (await api.post('/admin/attendance/sign-out')).data,
  mark: async (p) => (await api.post('/admin/attendance/mark', p)).data,
  acceptInferred: async (p) => (await api.post('/admin/attendance/accept-inferred', p)).data,
  verify: async (p) => (await api.post('/admin/attendance/verify', p)).data,
  verifyMonth: async (p) => (await api.post('/admin/attendance/verify-month', p)).data,
  dispute: async (p) => (await api.post('/admin/attendance/disputes', p)).data,
  resolve: async (id, p) => (await api.post(`/admin/attendance/disputes/${id}/resolve`, p)).data,
  config: async () => (await api.get('/admin/attendance/config')).data,
  saveSettings: async (p) => (await api.put('/admin/attendance/settings', p)).data,
  saveMarkers: async (staffId, marker_ids) => (await api.put(`/admin/attendance/markers/${staffId}`, { marker_ids })).data,
};

export default attendanceAPI;
