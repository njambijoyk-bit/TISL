import api from './axios';

// Events (ticketed): the staff side. See docs/EVENTS_PLAN.md.
const eventsAPI = {
  list: (params) => api.get('/admin/events', { params }).then((r) => r.data),
  show: (id) => api.get(`/admin/events/${id}`).then((r) => r.data),
  create: (body) => api.post('/admin/events', body).then((r) => r.data),
  update: (id, body) => api.put(`/admin/events/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/admin/events/${id}`).then((r) => r.data),
  publish: (id) => api.post(`/admin/events/${id}/publish`).then((r) => r.data),
  unpublish: (id) => api.post(`/admin/events/${id}/unpublish`).then((r) => r.data),
  cancel: (id) => api.post(`/admin/events/${id}/cancel`).then((r) => r.data),
  /** the dates of a repeat, to look over before they are added */
  recurrence: (rule) => api.post('/admin/events/recurrence', rule).then((r) => r.data),
  uploadImage: (id, file) => { const f = new FormData(); f.append('file', file); return api.post(`/admin/events/${id}/image`, f, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data); },
  removeImage: (id) => api.delete(`/admin/events/${id}/image`).then((r) => r.data),
  summary: (id) => api.get(`/admin/events/${id}/summary`).then((r) => r.data),
  postpone: (id) => api.post(`/admin/events/${id}/postpone`).then((r) => r.data),
  notifyHolders: (id, message) => api.post(`/admin/events/${id}/notify`, { message }).then((r) => r.data),
  // refunds
  refunds: (params) => api.get('/admin/events/refunds', { params }).then((r) => r.data.data),
  approveRefund: (id, body) => api.post(`/admin/events/refunds/${id}/approve`, body).then((r) => r.data),
  declineRefund: (id, note) => api.post(`/admin/events/refunds/${id}/decline`, { note }).then((r) => r.data),
  approveAllRefunds: (eventId, refundLedgerId) => api.post(`/admin/events/${eventId}/refunds/approve-all`, { refund_ledger_id: refundLedgerId || undefined }).then((r) => r.data),
  refundTicket: (eventId, ticketId, body = {}) => api.post(`/admin/events/${eventId}/tickets/${ticketId}/refund`, body).then((r) => r.data),
  // the door
  door: (id, sessionId) => api.get(`/admin/events/${id}/door`, { params: { session_id: sessionId || undefined } }).then((r) => r.data),
  checkin: (id, code, sessionId) => api.post(`/admin/events/${id}/checkin`, { code, session_id: sessionId || undefined }).then((r) => r.data),
  checkinManual: (id, ticketId, sessionId) => api.post(`/admin/events/${id}/checkin/manual`, { ticket_id: ticketId, session_id: sessionId || undefined }).then((r) => r.data),
  undoCheckin: (id, checkinId) => api.post(`/admin/events/${id}/checkin/${checkinId}/undo`).then((r) => r.data),
  guests: (id, params) => api.get(`/admin/events/${id}/guests`, { params }).then((r) => r.data),
  /** the guest list as a spreadsheet, handed to the browser as a download */
  exportGuests: async (id) => {
    const res = await api.get(`/admin/events/${id}/guests/export`, { responseType: 'blob' });
    const name = /filename="?([^";]+)"?/.exec(res.headers?.['content-disposition'] ?? '')?.[1] ?? 'guests.csv';
    const href = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  },
  settings: () => api.get('/admin/events/settings').then((r) => r.data),
  saveSettings: (body) => api.put('/admin/events/settings', body).then((r) => r.data),
};

export default eventsAPI;
