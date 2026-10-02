import api from './axios';

/** Stock counts, recipes / production runs and the stock journal. Admin / finance / manager (acting: admin / finance). */
export const stockCountsAPI = {
  list: async () => (await api.get('/admin/stock/counts')).data,
  show: async (id) => (await api.get(`/admin/stock/counts/${id}`)).data,
  start: async (payload) => (await api.post('/admin/stock/counts', payload)).data,
  save: async (id, counted) => (await api.put(`/admin/stock/counts/${id}`, { counted })).data,
  post: async (id, counted) => (await api.post(`/admin/stock/counts/${id}/post`, { counted })).data,
  cancel: async (id) => (await api.post(`/admin/stock/counts/${id}/cancel`)).data,
};

export const recipesAPI = {
  list: async () => (await api.get('/admin/menus/recipes')).data,
  save: async (payload) => (await api.put('/admin/menus/recipes', payload)).data,
  remove: async (id) => (await api.delete(`/admin/menus/recipes/${id}`)).data,
  produce: async (id, payload) => (await api.post(`/admin/menus/recipes/${id}/produce`, payload)).data,
  cancelRun: async (id) => (await api.post(`/admin/menus/production/${id}/cancel`)).data,
};

export const stockJournalAPI = {
  list: async (params) => (await api.get('/admin/stock/journal', { params })).data,
};

export const stockJobsAPI = {
  list: async (params) => (await api.get('/admin/stock/jobs', { params })).data,
  show: async (id) => (await api.get(`/admin/stock/jobs/${id}`)).data,
  open: async (payload) => (await api.post('/admin/stock/jobs', payload)).data,
  issue: async (id, items) => (await api.post(`/admin/stock/jobs/${id}/issue`, { items })).data,
  returnLine: async (id, lineId, quantity) => (await api.post(`/admin/stock/jobs/${id}/lines/${lineId}/return`, { quantity })).data,
  complete: async (id, invoiceVoucherId) => (await api.post(`/admin/stock/jobs/${id}/complete`, { invoice_voucher_id: invoiceVoucherId || undefined })).data,
  invoice: async (id, payload) => (await api.post(`/admin/stock/jobs/${id}/invoice`, payload)).data,
  cancel: async (id) => (await api.post(`/admin/stock/jobs/${id}/cancel`)).data,
};

/** Stock reports: summary / location summary, an item's months and vouchers, and the stock query card. Works for every kind of stocked item. */
export const stockReportsAPI = {
  summary: async (params) => (await api.get('/admin/stock/reports/summary', { params })).data,
  monthly: async (params) => (await api.get('/admin/stock/reports/monthly', { params })).data,
  movements: async (params) => (await api.get('/admin/stock/reports/movements', { params })).data,
  query: async (params) => (await api.get('/admin/stock/reports/query', { params })).data,
  find: async (q) => (await api.get('/admin/stock/reports/find', { params: { q } })).data,
};
