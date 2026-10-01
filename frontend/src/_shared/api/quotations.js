import api from './axios';

const get = async (url, params) => (await api.get(url, { params })).data;
const send = async (method, url, data) => (await api[method](url, data)).data;

/**
 * Quotations. The admin methods double as the "api" the shared voucher form uses
 * (same method names as booksAPI), so a sales rep can price a quotation without
 * touching the rest of the books.
 */
const quotationsAPI = {
  // admin
  list: (params) => get('/admin/quotations', params),
  send: (id) => send('post', `/admin/quotations/${id}/send`),
  withdraw: (id, reason) => send('post', `/admin/quotations/${id}/withdraw`, { reason }),
  exportQuotation: async (id, format) => {
    const res = await api.get(`/admin/quotations/${id}/export`, { params: { format }, responseType: 'blob' });
    const href = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = href; a.download = `quotation.${format}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  },

  // the voucher-form adapter
  voucher: (id) => get(`/admin/quotations/${id}`),
  updateVoucher: (id, data) => send('put', `/admin/quotations/${id}`, data),
  previewVoucher: (data) => send('post', '/admin/quotations/preview', data),
  lookup: (kind, q) => get('/admin/quotations/lookup', { kind, q }),
  types: async () => [(await get('/admin/quotations/meta')).type],
  paymentMethods: async () => [],
  ledgers: async () => [],
  nextNumbers: async () => [],

  // customer
  mine: () => get('/quotations'),
  request: (data) => send('post', '/quotations', data),
  mineShow: (id) => get(`/quotations/${id}`),
  accept: (id) => send('post', `/quotations/${id}/accept`),
  decline: (id, note) => send('post', `/quotations/${id}/decline`, { note }),
  revision: (id, note) => send('post', `/quotations/${id}/revision`, { note }),
};

export default quotationsAPI;
