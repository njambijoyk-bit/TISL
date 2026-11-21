import api from './axios';

const departmentsAPI = {
  /** { ready, data: [{ id, name, location, costCentre, employees_count ... }], standard: [names] } */
  list: (params = {}) => api.get('/admin/departments', { params }).then((r) => r.data),
  create: (d) => api.post('/admin/departments', d).then((r) => r.data),
  /** the same department at several branches: { name, location_ids, heads: { [location_id]: employee_id } } (each made with its head) */
  bulk: (d) => api.post('/admin/departments/bulk', d).then((r) => r.data),
  update: (id, d) => api.put(`/admin/departments/${id}`, d).then((r) => r.data),
  remove: (id) => api.delete(`/admin/departments/${id}`).then((r) => r.data),
  addStandard: (name) => api.post('/admin/departments/standard', { name }).then((r) => r.data),
  removeStandard: (name) => api.delete('/admin/departments/standard', { data: { name } }).then((r) => r.data),
  /** a lead (HR stage 1b): { employee_id, role: head | assistant, sensitivity: work | personal | full } → { leads } */
  appointLead: (id, d) => api.post(`/admin/departments/${id}/leads`, d).then((r) => r.data),
  removeLead: (id, employeeId) => api.delete(`/admin/departments/${id}/leads/${employeeId}`).then((r) => r.data),
  shares: (employeeId) => api.get(`/admin/employee-cost-centres/${employeeId}`).then((r) => r.data),
  saveShares: (employeeId, shares) => api.put(`/admin/employee-cost-centres/${employeeId}`, { shares }).then((r) => r.data),
};

export default departmentsAPI;
