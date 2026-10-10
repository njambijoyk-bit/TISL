import api from './axios';

/** A ticket holder's side of events. A ticket's code is the key: no sign-in is needed. */
const eventTicketsAPI = {
  get: async (code) => (await api.get(`/tickets/${encodeURIComponent(code)}`)).data,
  /** The address of the PDF of the whole booking (the browser downloads it). */
  pdfUrl: (code) => `${api.defaults.baseURL}/tickets/${encodeURIComponent(code)}/pdf`,
  qrUrl: (code) => `${api.defaults.baseURL}/tickets/${encodeURIComponent(code)}/qr`,
  rename: async (code, name) => (await api.put(`/tickets/${encodeURIComponent(code)}/holder`, { name })).data,
  /** hand a ticket back: a paid one becomes a request for staff, a free one is cancelled at once */
  refund: async (code, reason) => (await api.post(`/tickets/${encodeURIComponent(code)}/refund`, { reason })).data,
  resend: async (email) => (await api.post('/tickets/resend', { email })).data,
  mine: async () => (await api.get('/customer/events/tickets')).data,
  /** where a scanned QR leads: { type, label, path } */
  resolve: async (code) => (await api.get(`/q/${code}`)).data,
};

export default eventTicketsAPI;
