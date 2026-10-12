import api from './axios';

/** Courses (storefront): the catalogue, an offering's page, and a signed-in person enrolling and paying. */
export const coursesPublicAPI = {
  list: async (params) => (await api.get('/learn', { params })).data,
  offering: async (slug) => (await api.get(`/learn/${slug}`)).data,
  quote: async (id, optionalFeeIds) => (await api.post(`/courses/offerings/${id}/quote`, { optional_fee_ids: optionalFeeIds })).data,
  enrol: async (id, payload) => (await api.post(`/courses/offerings/${id}/enrol`, payload)).data,
  mine: async () => (await api.get('/courses/my/enrolments')).data,
  library: async () => (await api.get('/courses/my/library')).data,
  player: async (slug) => (await api.get(`/courses/my/offerings/${slug}`)).data,
  progress: async (lessonId, payload) => (await api.post(`/courses/my/lessons/${lessonId}/progress`, payload)).data,
  ics: async (liveId) => (await api.get(`/courses/my/live/${liveId}/ics`, { responseType: 'blob' })).data,
  books: async (params) => (await api.get('/learn/books', { params })).data,
  book: async (slug) => (await api.get(`/learn/books/${slug}`)).data,
  bookQuote: async (id, quantity) => (await api.post(`/courses/books/${id}/quote`, { quantity })).data,
  buyBook: async (id, payload) => (await api.post(`/courses/books/${id}/buy`, payload)).data,
  myBooks: async () => (await api.get('/courses/my/books')).data,
  payBook: async (id, payload) => (await api.post(`/courses/book-orders/${id}/pay`, payload)).data,
  bookLink: async (id) => (await api.get(`/courses/book-orders/${id}/link`)).data,
  checkin: async (sessionId, code) => (await api.post(`/courses/my/sessions/${sessionId}/checkin`, { code })).data,
  excuse: async (sessionId, reason) => (await api.post(`/courses/my/sessions/${sessionId}/excuse`, { reason })).data,
  myCertificates: async () => (await api.get('/courses/my/certificates')).data,
  certificatePdf: async (id) => (await api.get(`/courses/certificates/${id}/pdf`, { responseType: 'blob' })).data,
  verifyCertificate: async (code) => (await api.get(`/learn/verify/${encodeURIComponent(code)}`)).data,
  startQuiz: async (lessonId) => (await api.post(`/courses/my/quizzes/${lessonId}/start`)).data,
  attemptOf: async (id) => (await api.get(`/courses/my/attempts/${id}`)).data,
  saveAttempt: async (id, answers) => (await api.put(`/courses/my/attempts/${id}`, { answers })).data,
  submitAttempt: async (id, answers) => (await api.post(`/courses/my/attempts/${id}/submit`, { answers })).data,
  pay: async (id, payload) => (await api.post(`/courses/enrolments/${id}/pay`, payload)).data,
};

export default coursesPublicAPI;
