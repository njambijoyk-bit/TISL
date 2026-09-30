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
  list: async () => (await api.get('/admin/stock/recipes')).data,
  save: async (payload) => (await api.put('/admin/stock/recipes', payload)).data,
  remove: async (id) => (await api.delete(`/admin/stock/recipes/${id}`)).data,
  produce: async (id, payload) => (await api.post(`/admin/stock/recipes/${id}/produce`, payload)).data,
  cancelRun: async (id) => (await api.post(`/admin/stock/production/${id}/cancel`)).data,
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
  cancel: async (id) => (await api.post(`/admin/stock/jobs/${id}/cancel`)).data,
};
