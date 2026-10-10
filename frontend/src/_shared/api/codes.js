import api from './axios';

// Codes (core): the Codes page, scanning and labels. See docs/CODES_PLAN.md.
const codesAPI = {
  kinds: () => api.get('/admin/codes/kinds').then((r) => r.data),
  items: (params) => api.get('/admin/codes/items', { params }).then((r) => r.data),
  assign: (items) => api.post('/admin/codes/assign', { items }).then((r) => r.data),
  setCode: (body) => api.put('/admin/codes/item', body).then((r) => r.data),
  /** what a scanned or typed code belongs to */
  lookup: (code) => api.get('/admin/codes/lookup', { params: { code } }).then((r) => r.data),
  /** the labels to print: items [{type, id, copies}] + options */
  labels: (body) => api.post('/admin/codes/labels', body).then((r) => r.data),
  prints: () => api.get('/admin/codes/prints').then((r) => r.data),
  settings: () => api.get('/admin/codes/settings').then((r) => r.data),
  saveSettings: (body) => api.put('/admin/codes/settings', body).then((r) => r.data),
  /** staff scanned a signed code (ticket, voucher…): the code's type decides what happens */
  scan: (code, context) => api.post('/admin/codes/scan', { code, context }).then((r) => r.data),
};

export default codesAPI;
