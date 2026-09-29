import api from './axios';

const get = async (url, params) => (await api.get(url, { params })).data;
const send = async (method, url, data) => (await api[method](url, data)).data;

/** Save a blob response as a file, or throw the server's message. */
const saveBlob = async (url, params, fallbackName) => {
  try {
    const res = await api.get(url, { params, responseType: 'blob' });
    const cd = res.headers?.['content-disposition'] ?? '';
    const name = /filename="?([^";]+)"?/.exec(cd)?.[1] ?? fallbackName;
    const href = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch (e) {
    // an error body arrives as a blob too — read the message out of it
    const blob = e?.response?.data;
    if (blob instanceof Blob) {
      try { e.response.data = JSON.parse(await blob.text()); } catch { /* not JSON */ }
    }
    throw e;
  }
};

const booksAPI = {
  // vouchers
  vouchers: (params) => get('/admin/books/vouchers', params),
  voucher: (id) => get(`/admin/books/vouchers/${id}`),
  previewVoucher: (data) => send('post', '/admin/books/vouchers/preview', data),
  createVoucher: (data) => send('post', '/admin/books/vouchers', data),
  updateVoucher: (id, data) => send('put', `/admin/books/vouchers/${id}`, data),
  cancelVoucher: (id, reason) => send('post', `/admin/books/vouchers/${id}/cancel`, { reason }),
  convertVoucher: (id, data) => send('post', `/admin/books/vouchers/${id}/convert`, data),
  receive: (id, data) => send('post', `/admin/books/vouchers/${id}/receive`, data),
  nextNumbers: (params) => get('/admin/books/vouchers/next-number', params),
  lookup: (kind, q, purpose) => get('/admin/books/lookup', { kind, q, purpose }),
  productVariants: (productId) => get(`/admin/books/products/${productId}/variants`),
  exportVoucher: (id, format) => saveBlob(`/admin/books/vouchers/${id}/export`, { format }, `voucher.${format}`),
  exportVouchers: (params) => saveBlob('/admin/books/vouchers/export', params, `vouchers.${params.format}`),

  // customer accounts (credit)
  creditOverview: () => get('/admin/books/credit/overview'),
  customerAccount: (id) => get(`/admin/books/customer-accounts/${id}`),
  saveCreditTerms: (id, d) => send('put', `/admin/books/customer-accounts/${id}/terms`, d),
  adjustAccount: (id, d) => send('post', `/admin/books/customer-accounts/${id}/adjust`, d),
  chargeInterest: (id, d) => send('post', `/admin/books/customer-accounts/${id}/interest`, d),

  // gift vouchers
  giftVouchers: (params) => get('/admin/books/gift-vouchers', params),
  giftVoucher: (id) => get(`/admin/books/gift-vouchers/${id}`),
  issueGiftVoucher: (d) => send('post', '/admin/books/gift-vouchers', d),
  refundToGiftVoucher: (voucherId, d) => send('post', `/admin/books/vouchers/${voucherId}/refund-to-gift-voucher`, d),
  cancelGiftVoucher: (id) => send('post', `/admin/books/gift-vouchers/${id}/cancel`),
  reconcileGiftVouchers: () => get('/admin/books/gift-vouchers/reconcile'),
  expireGiftVouchers: () => send('post', '/admin/books/gift-vouchers/expire-due'),

  // reports
  report: (name, params) => get(`/admin/books/reports/${name}`, params),
  itemAccounts: (type, id) => get('/admin/books/item-accounts', { type, id }),
  saveItemAccounts: (d) => send('put', '/admin/books/item-accounts', d),
  loyaltyTrueUp: () => send('post', '/admin/books/reconciliation/loyalty-true-up'),
  exportReport: (name, params) => saveBlob(`/admin/books/reports/${name}`, params, `${name}.${params.format}`),

  // masters
  groups: () => get('/admin/books/groups'),
  createGroup: (d) => send('post', '/admin/books/groups', d),
  updateGroup: (id, d) => send('put', `/admin/books/groups/${id}`, d),
  deleteGroup: (id) => send('delete', `/admin/books/groups/${id}`),
  ledgers: (params) => get('/admin/books/ledgers', params),
  createLedger: (d) => send('post', '/admin/books/ledgers', d),
  updateLedger: (id, d) => send('put', `/admin/books/ledgers/${id}`, d),
  deleteLedger: (id) => send('delete', `/admin/books/ledgers/${id}`),

  types: () => get('/admin/books/voucher-types'),
  updateType: (id, d) => send('put', `/admin/books/voucher-types/${id}`, d),
  createSeries: (typeId, d) => send('post', `/admin/books/voucher-types/${typeId}/series`, d),
  updateSeries: (id, d) => send('put', `/admin/books/series/${id}`, d),
  deleteSeries: (id) => send('delete', `/admin/books/series/${id}`),
  previewSeries: (d) => send('post', '/admin/books/series/preview', d),

  paymentMethods: () => get('/admin/books/payment-methods'),
  createMethod: (d) => send('post', '/admin/books/payment-methods', d),
  updateMethod: (id, d) => send('put', `/admin/books/payment-methods/${id}`, d),
  deleteMethod: (id) => send('delete', `/admin/books/payment-methods/${id}`),

  settings: () => get('/admin/books/settings'),
  saveSettings: (d) => send('put', '/admin/books/settings', d),
  saveEditLimits: (limits) => send('put', '/admin/books/edit-limits', { limits }),
  createYear: (d) => send('post', '/admin/books/financial-years', d),
  closeYear: (id, closed) => send('post', `/admin/books/financial-years/${id}/close`, { closed }),
};

export default booksAPI;
