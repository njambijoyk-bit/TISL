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
  boxOffice: (id) => api.get(`/admin/events/${id}/box-office`).then((r) => r.data),
  sell: (id, body) => api.post(`/admin/events/${id}/sell`, body).then((r) => r.data),
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
  // approval of an outside organiser's event
  submit: (id) => api.post(`/admin/events/${id}/submit`).then((r) => r.data),
  decide: (id, approve, note) => api.post(`/admin/events/${id}/decide`, { approve, note }).then((r) => r.data),
  // the platform (events.admin): categories, outside organisers, vendors and venues
  categories: () => api.get('/admin/events/platform/categories').then((r) => r.data),
  saveCategory: (id, body) => (id ? api.put(`/admin/events/platform/categories/${id}`, body) : api.post('/admin/events/platform/categories', body)).then((r) => r.data),
  removeCategory: (id) => api.delete(`/admin/events/platform/categories/${id}`).then((r) => r.data),
  standardCategories: () => api.post('/admin/events/platform/categories/standard').then((r) => r.data),
  /** kind: organisers | vendors | venues */
  providers: (kind, status) => api.get(`/admin/events/platform/${kind}`, { params: { status: status || undefined } }).then((r) => r.data.data),
  provider: (kind, id) => api.get(`/admin/events/platform/${kind}/${id}`).then((r) => r.data.data),
  setProviderStatus: (kind, id, status, note) => api.post(`/admin/events/platform/${kind}/${id}/status`, { status, note: note || undefined }).then((r) => r.data.data),
  setProviderCommission: (kind, id, commission_percent) => api.post(`/admin/events/platform/${kind}/${id}/commission`, { commission_percent }).then((r) => r.data.data),
  payouts: () => api.get('/admin/events/platform/payouts').then((r) => r.data),
  payoutStatement: (organiserId) => api.get(`/admin/events/platform/payouts/${organiserId}`).then((r) => r.data),
  payOut: (organiserId, body) => api.post(`/admin/events/platform/payouts/${organiserId}`, body).then((r) => r.data),
  postWaitingPayables: () => api.post('/admin/events/platform/payouts/post-waiting').then((r) => r.data),
  reviewDocument: (id, status, note) => api.post(`/admin/events/platform/documents/${id}/review`, { status, note: note || undefined }).then((r) => r.data),
};

/** The media gallery of an event, organiser, vendor, venue, package or space. type: event | organiser | vendor | venue | package | space */
export const eventsMediaAPI = {
  list: (type, id) => api.get(`/events/media/${type}/${id}`).then((r) => r.data.data),
  upload: (type, id, file, body = {}) => { const f = new FormData(); f.append('file', file); Object.entries(body).forEach(([k, v]) => v != null && f.append(k, v)); return api.post(`/events/media/${type}/${id}/upload`, f, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data); },
  embed: (type, id, url, body = {}) => api.post(`/events/media/${type}/${id}/embed`, { url, ...body }).then((r) => r.data.data),
  update: (mediaId, body) => api.put(`/events/media/item/${mediaId}`, body).then((r) => r.data.data),
  remove: (mediaId) => api.delete(`/events/media/item/${mediaId}`).then((r) => r.data),
  reorder: (type, id, ids) => api.post(`/events/media/${type}/${id}/reorder`, { ids }).then((r) => r.data.data),
  /** a private file, handed to the browser as a download */
  download: async (mediaId, name = 'file') => {
    const res = await api.get(`/events/media/item/${mediaId}/download`, { responseType: 'blob' });
    const href = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  },
};

/** Signed-in people who organise events, or offer their service or place (no staff permission needed). */
export const eventsPlatformAPI = {
  categories: () => api.get('/events/categories').then((r) => r.data.data),
  mineOrganisers: () => api.get('/events/organisers/mine').then((r) => r.data.data),
  applyOrganiser: (body) => api.post('/events/organisers/apply', body).then((r) => r.data),
  mineProviders: () => api.get('/events/market/mine').then((r) => r.data.data),
  provider: (plural, id) => api.get(`/events/market/${plural}/${id}`).then((r) => r.data.data),
  saveProvider: (plural, id, body) => api.put(`/events/market/${plural}/${id}`, body).then((r) => r.data.data),
  saveOffer: (plural, id, offerId, body) => (offerId ? api.put(`/events/market/${plural}/${id}/offers/${offerId}`, body) : api.post(`/events/market/${plural}/${id}/offers`, body)).then((r) => r.data.data),
  removeOffer: (plural, id, offerId) => api.delete(`/events/market/${plural}/${id}/offers/${offerId}`).then((r) => r.data),
  addProof: (plural, id, type, file) => { const f = new FormData(); f.append('type', type); f.append('file', file); return api.post(`/events/market/${plural}/${id}/documents`, f, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data); },
  applyProvider: (plural, body) => api.post(`/events/market/${plural}/apply`, body).then((r) => r.data),
};

export default eventsAPI;

const d = (r) => r.data;

/** Planning requests ("plan my event"): the customer's side. */
export const eventsEnquiryAPI = {
  create: (body) => api.post('/events/enquiries', body).then(d),
  mine: () => api.get('/events/enquiries/mine').then((r) => r.data.data),
  accept: (id) => api.post(`/events/enquiries/${id}/accept`).then(d),
};

/** Planning requests: staff (events.admin). */
export const eventsEnquiryAdminAPI = {
  list: (status) => api.get('/admin/events/enquiries', { params: { status: status || undefined } }).then((r) => r.data.data),
  update: (id, body) => api.put(`/admin/events/enquiries/${id}`, body).then((r) => r.data.data),
  quote: (id, lines) => api.post(`/admin/events/enquiries/${id}/quote`, { lines }).then(d),
  accept: (id) => api.post(`/admin/events/enquiries/${id}/accept`).then(d),
  invoice: (id) => api.post(`/admin/events/enquiries/${id}/invoice`).then(d),
  project: (id) => api.post(`/admin/events/enquiries/${id}/project`).then(d),
};

/** The planning workspace of one event. */
export const eventsPlanAPI = {
  overview: (id) => api.get(`/admin/events/${id}/plan`).then(d),
  templates: () => api.get('/admin/events/templates').then((r) => r.data.data),
  applyTemplate: (id, template_id, event_date) => api.post(`/admin/events/${id}/plan/template`, { template_id, event_date: event_date || undefined }).then(d),
  list: (id, what) => api.get(`/admin/events/${id}/plan/${what}`).then(d),
  save: (id, what, rowId, body) => (rowId ? api.put(`/admin/events/${id}/plan/${what}/${rowId}`, body) : api.post(`/admin/events/${id}/plan/${what}`, body)).then((r) => r.data.data ?? r.data),
  remove: (id, what, rowId) => api.delete(`/admin/events/${id}/plan/${what}/${rowId}`).then(d),
  comments: (id, taskId) => api.get(`/admin/events/${id}/plan/tasks/${taskId}/comments`).then((r) => r.data.data),
  addComment: (id, taskId, body) => api.post(`/admin/events/${id}/plan/tasks/${taskId}/comments`, { body }).then((r) => r.data.data),
  // admin templates
  adminTemplates: () => api.get('/admin/events/platform/templates').then((r) => r.data.data),
  saveTemplate: (tid, body) => (tid ? api.put(`/admin/events/platform/templates/${tid}`, body) : api.post('/admin/events/platform/templates', body)).then((r) => r.data.data),
  removeTemplate: (tid) => api.delete(`/admin/events/platform/templates/${tid}`).then(d),
  standardTemplates: () => api.post('/admin/events/platform/templates/standard').then(d),
};

/** Invited guests and RSVPs. */
export const eventsGuestAPI = {
  list: (id, params) => api.get(`/admin/events/${id}/invitees`, { params }).then(d),
  save: (id, gid, body) => (gid ? api.put(`/admin/events/${id}/invitees/${gid}`, body) : api.post(`/admin/events/${id}/invitees`, body)).then((r) => r.data.data),
  remove: (id, gid) => api.delete(`/admin/events/${id}/invitees/${gid}`).then(d),
  import: (id, text) => api.post(`/admin/events/${id}/invitees/import`, { text }).then(d),
  send: (id, body) => api.post(`/admin/events/${id}/invitees/send`, body).then(d),
  doorPack: (id) => api.get(`/admin/events/${id}/door-pack`).then(d),
  doorSync: (id, guest_ids) => api.post(`/admin/events/${id}/door-sync`, { guest_ids }).then(d),
  // the guest's own page (no sign-in)
  view: (token) => api.get(`/events/rsvp/${token}`).then(d),
  respond: (token, body) => api.post(`/events/rsvp/${token}`, body).then(d),
};

/** Promotion. */
export const eventsAdAPI = {
  products: () => api.get('/admin/events/ads/products').then(d),
  request: (eventId, body) => api.post(`/admin/events/${eventId}/promote`, body).then(d),
  campaigns: (status) => api.get('/admin/events/ads/campaigns', { params: { status: status || undefined } }).then((r) => r.data.data),
  cancel: (id) => api.post(`/admin/events/ads/campaigns/${id}/cancel`).then(d),
  adminProducts: () => api.get('/admin/events/platform/ads/products').then(d),
  saveProduct: (pid, body) => (pid ? api.put(`/admin/events/platform/ads/products/${pid}`, body) : api.post('/admin/events/platform/ads/products', body)).then((r) => r.data.data),
  removeProduct: (pid) => api.delete(`/admin/events/platform/ads/products/${pid}`).then(d),
  standardProducts: () => api.post('/admin/events/platform/ads/products/standard').then(d),
  decide: (id, approve, note) => api.post(`/admin/events/platform/ads/campaigns/${id}/decide`, { approve, note: note || undefined }).then(d),
  invoice: (id) => api.post(`/admin/events/platform/ads/campaigns/${id}/invoice`).then(d),
  promoted: (kind, category_id) => api.get('/events/promoted', { params: { kind, category_id: category_id || undefined } }).then((r) => r.data.data),
  track: (campaignId, what) => api.post(`/events/ads/${campaignId}/${what}`).catch(() => {}),
};

/** Booking vendors and venues. */
export const eventsBookingAPI = {
  forEvent: (eventId) => api.get(`/admin/events/${eventId}/bookings`).then((r) => r.data.data),
  request: (eventId, body) => api.post(`/admin/events/${eventId}/bookings`, body).then(d),
  accept: (id) => api.post(`/admin/events/bookings/${id}/accept`).then(d),
  cancel: (id, reason) => api.post(`/admin/events/bookings/${id}/cancel`, { reason: reason || undefined }).then(d),
  complete: (id) => api.post(`/admin/events/bookings/${id}/complete`).then(d),
  review: (id, rating, comment) => api.post(`/admin/events/bookings/${id}/review`, { rating, comment: comment || undefined }).then(d),
  providerList: (plural, id) => api.get(`/events/market/${plural}/${id}/bookings`).then(d),
  quote: (id, body) => api.post(`/events/bookings/${id}/quote`, body).then(d),
  decline: (id, note) => api.post(`/events/bookings/${id}/decline`, { note: note || undefined }).then(d),
  deliver: (id) => api.post(`/events/bookings/${id}/deliver`).then(d),
  availability: (plural, id, from, to) => api.get(`/events/market/${plural}/${id}/availability`, { params: { from, to } }).then(d),
  block: (plural, id, days, blocked) => api.post(`/events/market/${plural}/${id}/block`, { days, blocked }).then(d),
  adminList: (status) => api.get('/admin/events/platform/bookings', { params: { status: status || undefined } }).then(d),
  payment: (id, body) => api.post(`/admin/events/platform/bookings/${id}/payment`, body).then(d),
  refund: (id, body) => api.post(`/admin/events/platform/bookings/${id}/refund`, body).then(d),
  adminComplete: (id) => api.post(`/admin/events/platform/bookings/${id}/complete`).then(d),
  payout: (plural, id, body) => api.post(`/admin/events/platform/${plural}/${id}/payout`, body).then(d),
};

/** The public directory of vendors and venues. */
export const eventsDirectoryAPI = {
  list: (plural, params) => api.get(`/events/directory/${plural}`, { params }).then((r) => r.data),
  show: (plural, slug) => api.get(`/events/directory/${plural}/${slug}`).then((r) => r.data.data),
};
