import api from './axios';

/** Bookings: staff side (/admin/bookings) and the customer's own (/my-bookings). */
export const bookingsAPI = {
  list: async (params) => (await api.get('/admin/bookings', { params })).data,
  options: async () => (await api.get('/admin/bookings/options')).data,
  slots: async (params) => (await api.get('/admin/bookings/slots', { params })).data,
  quote: async (p) => (await api.post('/admin/bookings/quote', p)).data,
  create: async (p) => (await api.post('/admin/bookings', p)).data,
  reschedule: async (id, p) => (await api.post(`/admin/bookings/${id}/reschedule`, p)).data,
  cancel: async (id, reason) => (await api.post(`/admin/bookings/${id}/cancel`, { reason })).data,
  noShow: async (id) => (await api.post(`/admin/bookings/${id}/no-show`)).data,
  complete: async (id, extra, preview = false) => (await api.post(`/admin/bookings/${id}/complete`, { extra }, { params: preview ? { preview: 1 } : undefined })).data,
  notice: async (id, event) => (await api.get(`/admin/bookings/${id}/notice`, { params: { event } })).data,
  email: async (id, event, to) => (await api.post(`/admin/bookings/${id}/email`, { event, to })).data,
};

export const myBookingsAPI = {
  availability: async (serviceId, params) => (await api.get(`/services/${serviceId}/booking`, { params })).data,
  quote: async (p) => (await api.post('/my-bookings/quote', p)).data,
  list: async () => (await api.get('/my-bookings')).data,
  create: async (p) => (await api.post('/my-bookings', p)).data,
  cancel: async (id, reason) => (await api.post(`/my-bookings/${id}/cancel`, { reason })).data,
};
