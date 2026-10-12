import api from './axios';

/** Courses (admin): offerings, their lessons, files and who has access. */
export const coursesAPI = {
  meta: async () => (await api.get('/admin/courses/meta')).data,
  saveSettings: async (payload) => (await api.put('/admin/courses/settings', payload)).data,
  offerings: async (params) => (await api.get('/admin/courses/offerings', { params })).data,
  offering: async (id) => (await api.get(`/admin/courses/offerings/${id}`)).data,
  createOffering: async (payload) => (await api.post('/admin/courses/offerings', payload)).data,
  saveOffering: async (id, payload) => (await api.put(`/admin/courses/offerings/${id}`, payload)).data,
  setStatus: async (id, to) => (await api.post(`/admin/courses/offerings/${id}/${to}`)).data,
  removeOffering: async (id) => (await api.delete(`/admin/courses/offerings/${id}`)).data,
  saveSection: async (id, payload, sectionId) => (sectionId ? (await api.put(`/admin/courses/offerings/${id}/sections/${sectionId}`, payload)) : (await api.post(`/admin/courses/offerings/${id}/sections`, payload))).data,
  removeSection: async (id, sectionId) => (await api.delete(`/admin/courses/offerings/${id}/sections/${sectionId}`)).data,
  saveLesson: async (id, payload, lessonId) => (lessonId ? (await api.put(`/admin/courses/offerings/${id}/lessons/${lessonId}`, payload)) : (await api.post(`/admin/courses/offerings/${id}/lessons`, payload))).data,
  removeLesson: async (id, lessonId) => (await api.delete(`/admin/courses/offerings/${id}/lessons/${lessonId}`)).data,
  reorder: async (id, sections, lessons) => (await api.put(`/admin/courses/offerings/${id}/order`, { sections, lessons })).data,
  uploadFile: async (id, file) => { const f = new FormData(); f.append('file', file); return (await api.post(`/admin/courses/offerings/${id}/files`, f)).data; },
  removeFile: async (id, fileId) => (await api.delete(`/admin/courses/offerings/${id}/files/${fileId}`)).data,
  fees: async (id) => (await api.get(`/admin/courses/offerings/${id}/fees`)).data,
  saveFee: async (id, payload, feeId) => (feeId ? (await api.put(`/admin/courses/offerings/${id}/fees/${feeId}`, payload)) : (await api.post(`/admin/courses/offerings/${id}/fees`, payload))).data,
  removeFee: async (id, feeId) => (await api.delete(`/admin/courses/offerings/${id}/fees/${feeId}`)).data,
  enrolMeta: async () => (await api.get('/admin/courses/enrolments/meta')).data,
  enrolments: async (params) => (await api.get('/admin/courses/enrolments', { params })).data,
  quote: async (id, payload) => (await api.post(`/admin/courses/offerings/${id}/quote`, payload)).data,
  enrol: async (id, payload) => (await api.post(`/admin/courses/offerings/${id}/enrol`, payload)).data,
  takePayment: async (id, tenders) => (await api.post(`/admin/courses/enrolments/${id}/payment`, { tenders })).data,
  cancelEnrolment: async (id, reason) => (await api.post(`/admin/courses/enrolments/${id}/cancel`, { reason })).data,
  refundEnrolment: async (id, payload) => (await api.post(`/admin/courses/enrolments/${id}/refund`, payload)).data,
  people: async (q) => (await api.get('/admin/courses/people', { params: { q } })).data,
  access: async (id) => (await api.get(`/admin/courses/offerings/${id}/access`)).data,
  grant: async (id, payload) => (await api.post(`/admin/courses/offerings/${id}/access`, payload)).data,
  revoke: async (id, accessId) => (await api.delete(`/admin/courses/offerings/${id}/access/${accessId}`)).data,
};

export default coursesAPI;
