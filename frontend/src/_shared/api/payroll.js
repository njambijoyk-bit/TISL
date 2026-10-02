import api from './axios';

/** Payroll: runs and payslips, and the editable components / ledgers / per-person items. Admin, super admin, finance. */
const payrollAPI = {
  list: async () => (await api.get('/admin/payroll')).data,
  create: async (month, notes) => (await api.post('/admin/payroll/runs', { month, notes })).data,
  show: async (id) => (await api.get(`/admin/payroll/runs/${id}`)).data,
  refresh: async (id) => (await api.post(`/admin/payroll/runs/${id}/refresh`)).data,
  adjust: async (id, p) => (await api.post(`/admin/payroll/runs/${id}/adjust`, p)).data,
  approve: async (id) => (await api.post(`/admin/payroll/runs/${id}/approve`)).data,
  pay: async (id, p) => (await api.post(`/admin/payroll/runs/${id}/pay`, p)).data,
  cancel: async (id) => (await api.post(`/admin/payroll/runs/${id}/cancel`)).data,
  csvUrl: (id) => `/admin/payroll/runs/${id}/csv`,
  csv: async (id) => (await api.get(`/admin/payroll/runs/${id}/csv`, { responseType: 'blob' })).data,
  settings: async () => (await api.get('/admin/payroll/settings')).data,
  saveSettings: async (p) => (await api.put('/admin/payroll/settings', p)).data,
  saveComponent: async (p, id) => (id ? (await api.put(`/admin/payroll/components/${id}`, p)) : (await api.post('/admin/payroll/components', p))).data,
  deleteComponent: async (id) => (await api.delete(`/admin/payroll/components/${id}`)).data,
  saveItems: async (userId, items) => (await api.put(`/admin/payroll/items/${userId}`, { items })).data,
};

export default payrollAPI;

/** A staff member's own payslips (their own only; approved or paid runs). */
export const myPayslipsAPI = {
  list: async () => (await api.get('/admin/my-payslips')).data,
  show: async (runId) => (await api.get(`/admin/my-payslips/${runId}`)).data,
};
