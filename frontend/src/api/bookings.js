import api from './axios';

// ─── Admin ────────────────────────────────────────────────────────────────────

export const getAdminBookings = (params = {}) =>
  api.get('/admin/bookings', { params }).then(r => r.data);

export const getAdminBooking = (id) =>
  api.get(`/admin/bookings/${id}`).then(r => r.data);

export const adminCreateBooking = (data) =>
  api.post('/admin/bookings', data).then(r => r.data);

export const adminUpdateBooking = (id, data) =>
  api.put(`/admin/bookings/${id}`, data).then(r => r.data);

export const confirmBooking = (id) =>
  api.post(`/admin/bookings/${id}/confirm`).then(r => r.data);

export const updateStatus = (id, status) =>
  api.post(`/admin/bookings/${id}/status`, { status }).then(r => r.data);

export const adminCancelBooking = (id, data) =>
  api.post(`/admin/bookings/${id}/cancel`, data).then(r => r.data);

export const getBookingActivityLog = (id, params = {}) =>
  api.get(`/admin/bookings/${id}/activity`, { params }).then(r => r.data);

// ── Staff ─────────────────────────────────────────────────────────────────────

export const assignStaff = (bookingId, data) =>
  api.post(`/admin/bookings/${bookingId}/staff`, data).then(r => r.data);

export const updateStaff = (bookingId, staffId, data) =>
  api.put(`/admin/bookings/${bookingId}/staff/${staffId}`, data).then(r => r.data);

export const removeStaff = (bookingId, staffId) =>
  api.delete(`/admin/bookings/${bookingId}/staff/${staffId}`).then(r => r.data);

// ── Disqualification ──────────────────────────────────────────────────────────

export const disqualifyCustomer = (bookingId, data) =>
  api.post(`/admin/bookings/${bookingId}/disqualify`, data).then(r => r.data);

export const reactivateCustomer = (bookingId, data) =>
  api.post(`/admin/bookings/${bookingId}/reactivate`, data).then(r => r.data);

export const getDisqualifications = (params = {}) =>
  api.get('/admin/booking-disqualifications', { params }).then(r => r.data);

// ── Worksheets ────────────────────────────────────────────────────────────────

export const createWorksheet = (bookingId, data) =>
  api.post(`/admin/bookings/${bookingId}/worksheets`, data).then(r => r.data);

export const getWorksheet = (bookingId, wsId) =>
  api.get(`/admin/bookings/${bookingId}/worksheets/${wsId}`).then(r => r.data);

export const updateWorksheet = (bookingId, wsId, data) =>
  api.put(`/admin/bookings/${bookingId}/worksheets/${wsId}`, data).then(r => r.data);

export const submitWorksheet = (bookingId, wsId) =>
  api.post(`/admin/bookings/${bookingId}/worksheets/${wsId}/submit`).then(r => r.data);

export const approveWorksheet = (bookingId, wsId) =>
  api.post(`/admin/bookings/${bookingId}/worksheets/${wsId}/approve`).then(r => r.data);

export const rejectWorksheet = (bookingId, wsId, data) =>
  api.post(`/admin/bookings/${bookingId}/worksheets/${wsId}/reject`, data).then(r => r.data);

export const exportWorksheetCsv = (bookingId, wsId) =>
  `${api.defaults.baseURL}/admin/bookings/${bookingId}/worksheets/${wsId}/export`;

// ── Worksheet items ───────────────────────────────────────────────────────────

export const addWorksheetItem = (bookingId, wsId, data) =>
  api.post(`/admin/bookings/${bookingId}/worksheets/${wsId}/items`, data).then(r => r.data);

export const updateWorksheetItem = (bookingId, wsId, itemId, data) =>
  api.put(`/admin/bookings/${bookingId}/worksheets/${wsId}/items/${itemId}`, data).then(r => r.data);

export const removeWorksheetItem = (bookingId, wsId, itemId) =>
  api.delete(`/admin/bookings/${bookingId}/worksheets/${wsId}/items/${itemId}`).then(r => r.data);

export const reorderWorksheetItems = (bookingId, wsId, order) =>
  api.post(`/admin/bookings/${bookingId}/worksheets/${wsId}/items/reorder`, { order }).then(r => r.data);

// ── Settings ──────────────────────────────────────────────────────────────────

export const getSettings = () =>
  api.get('/admin/booking-settings').then(r => r.data);

export const updateSettings = (data) =>
  api.put('/admin/booking-settings', data).then(r => r.data);

export const getAdminSlotsForDate = (params = {}) =>
  api.get('/admin/booking-settings/slots', { params }).then(r => r.data);

// ─── Customer ─────────────────────────────────────────────────────────────────

export const getCustomerBookings = (params = {}) =>
  api.get('/customer/bookings', { params }).then(r => r.data);

export const getCustomerBooking = (id) =>
  api.get(`/customer/bookings/${id}`).then(r => r.data);

export const customerCreateBooking = (data) =>
  api.post('/customer/bookings', data).then(r => r.data);

export const customerCancelBooking = (id, data) =>
  api.post(`/customer/bookings/${id}/cancel`, data).then(r => r.data);

// ─── Public (no auth) ─────────────────────────────────────────────────────────

export const getPublicPolicy = () =>
  api.get('/booking-settings/policy').then(r => r.data);

export const getAvailableSlots = (params = {}) =>
  api.get('/bookings/slots', { params }).then(r => r.data);

// ─── Named export object (used in components) ─────────────────────────────────
// All pages import from this object: import { bookingsAPI } from '../../api/bookings'

export const bookingsAPI = {
  // Admin
  getAdminBookings,
  getAdminBooking,
  adminCreateBooking,
  adminUpdateBooking,
  confirmBooking,
  updateStatus,
  adminCancel: adminCancelBooking,
  getActivityLog: getBookingActivityLog,

  // Staff
  assignStaff,
  updateStaff,
  removeStaff,

  // Disqualification
  disqualify: disqualifyCustomer,
  reactivate: reactivateCustomer,
  getDisqualifications,

  // Worksheets
  createWorksheet,
  getWorksheet,
  updateWorksheet,
  submitWorksheet,
  approveWorksheet,
  rejectWorksheet,
  exportWorksheetCsv,

  // Worksheet items
  addWorksheetItem,
  updateWorksheetItem,
  removeWorksheetItem,
  reorderWorksheetItems,

  // Settings
  getSettings,
  updateSettings,
  getAdminSlotsForDate,

  // Customer
  getCustomerBookings,
  getCustomerBooking,
  customerCreateBooking,
  customerCancel: customerCancelBooking,

  // Public
  getPublicPolicy,
  getAvailableSlots,
};

export default bookingsAPI;