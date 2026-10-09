import api from './axios';
import { campaignClaim } from '../lib/campaignAttribution';

/** Fetch a file from the API and hand it to the browser as a download. */
const saveBlob = async (url, params, fallbackName) => {
  const res = await api.get(url, { params, responseType: 'blob' });
  const name = /filename="?([^";]+)"?/.exec(res.headers?.['content-disposition'] ?? '')?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};

const checkoutAPI = {
  options: async () => (await api.get('/checkout/options')).data,
  quote: async (data) => (await api.post('/checkout/quote', data)).data,
  place: async (data) => (await api.post('/checkout/place', { ...data, attribution: data.attribution ?? campaignClaim() })).data,
  attempt: async (id, check = false) => (await api.get(`/customer/checkout/attempts/${id}`, { params: check ? { check: 1 } : undefined })).data,
  payOrder: async (id, data) => (await api.post(`/customer/checkout/orders/${id}/pay`, data)).data,
  orders: async (params) => (await api.get('/customer/sales-orders', { params })).data,
  order: async (id) => (await api.get(`/customer/sales-orders/${id}`)).data,
  updateOrder: async (id, data) => (await api.put(`/customer/sales-orders/${id}`, data)).data,
  reviewDocument: async (id, note) => (await api.post(`/customer/sales-orders/documents/${id}/review`, { note })).data,
  account: async (params) => (await api.get('/customer/account', { params })).data,
  /** Download my statement for a period: params are { range } or { from, to }, plus format (pdf, csv, ...). */
  downloadStatement: async (params) => saveBlob('/customer/account/statement/export', params, `statement.${params.format || 'pdf'}`),
  /** Download the ledger outstandings letter (format: pdf, html, csv ...). */
  downloadOutstandings: async (params) => saveBlob('/customer/account/outstandings/export', params, `ledger-outstandings.${params.format || 'pdf'}`),
  /** My invoices (kind 'invoices') or receipts (kind 'receipts'): params { kind, q, from, to }. */
  documents: async (params) => (await api.get('/customer/account/documents', { params })).data,
  /** Download one invoice or receipt as pdf or html. */
  downloadDocument: async (id, params) => saveBlob(`/customer/account/documents/${id}/download`, params, `document.${params.format || 'pdf'}`),
  cancelOrder: async (id) => (await api.post(`/customer/sales-orders/${id}/cancel`)).data,
  /** A PAID preorder: ask staff to cancel it (they decide, then refund). */
  requestPreorderCancel: async (id, reason) => (await api.post(`/customer/sales-orders/${id}/cancel-request`, { reason })).data,
};

export default checkoutAPI;
