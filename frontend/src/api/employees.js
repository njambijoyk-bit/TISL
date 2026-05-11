import api from './axios';

const employeesAPI = {

  getMyRecord: async () => {
    const response = await api.get('/admin/employees/my-record');
    return response.data;
  },

  // ============================================
  // ADMIN — Bulk Import & Template
  // ============================================

  /**
   * Download CSV template for employee bulk import
   * @returns {Promise<Blob>} - CSV file as blob
   */
  downloadTemplate: async () => {
    const response = await api.get('/admin/employees/template', {
      responseType: 'blob', // Critical: handle binary CSV response
      headers: { 'Accept': 'text/csv' },
    });
    return response;
  },

  /**
   * Bulk import employees via CSV/Excel upload
   * @param {FormData} formData - FormData with 'file' field
   * @returns {Promise<Object>} - { message: string, errors?: [] }
   */
  bulkImport: async (formData) => {
    const response = await api.post('/admin/employees/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // ============================================
  // ADMIN — Employee List & Lookups
  // ============================================

  getEmployees: async (params = {}) => {
    const response = await api.get('/admin/employees', { params });
    return response.data;
  },

  getEmployee: async (id) => {
    const response = await api.get(`/admin/employees/${id}`);
    return response.data;
  },

  getStatistics: async () => {
    const response = await api.get('/admin/employees/statistics');
    return response.data;
  },

  getDepartments: async () => {
    const response = await api.get('/admin/employees/departments');
    return response.data;
  },

  getJobTitles: async () => {
    const response = await api.get('/admin/employees/job-titles');
    return response.data;
  },

  getPotentialManagers: async () => {
    const response = await api.get('/admin/employees/potential-managers');
    return response.data;
  },

  getAllLeaveLogs: (params = {}) =>
    api.get('/admin/employees/leave-logs', { params }).then(r => r.data),

  getUpcomingBirthdays: (days = 30) =>
    api.get('/admin/employees/upcoming-birthdays', { params: { days } }).then(r => r.data),
  
  // ============================================
  // ADMIN — Create / Update / Delete
  // ============================================

  createEmployee: async (data) => {
    const response = await api.post('/admin/employees', data);
    return response.data;
  },

  updateEmployee: async (id, data) => {
    const response = await api.put(`/admin/employees/${id}`, data);
    return response.data;
  },

  deleteEmployee: async (id) => {
    const response = await api.delete(`/admin/employees/${id}`);
    return response.data;
  },

  restoreEmployee: async (id) => {
    const response = await api.post(`/admin/employees/${id}/restore`);
    return response.data;
  },

  // Force delete (permanent) — only for trashed employees
  forceDeleteEmployee: async (id) => {
    const response = await api.delete(`/admin/employees/${id}/force`);
    return response.data;
  },

  // ============================================
  // ADMIN — Status
  // ============================================

  updateStatus: async (id, status) => {
    const response = await api.post(`/admin/employees/${id}/update-status`, { status });
    return response.data;
  },

  // ============================================
  // ADMIN — Skills
  // ============================================

  addSkill: async (id, skill) => {
    const response = await api.post(`/admin/employees/${id}/add-skill`, { skill });
    return response.data;
  },

  removeSkill: async (id, skill) => {
    const response = await api.post(`/admin/employees/${id}/remove-skill`, { skill });
    return response.data;
  },

  addCertification: async (id, cert) => {
    const response = await api.post(`/admin/employees/${id}/add-certification`, cert);
    return response.data;
  },

  removeCertification: async (id, index) => {
    const response = await api.delete(`/admin/employees/${id}/remove-certification/${index}`);
    return response.data;
  },

  // ============================================
  // ADMIN — Leave Days
  // ============================================

  addLeaveDays: async (id, days, reason = '') => {
    const response = await api.post(`/admin/employees/${id}/add-leave-days`, { days, reason });
    return response.data;
  },

  useLeaveDays: async (id, days, reason = '') => {
    const response = await api.post(`/admin/employees/${id}/use-leave-days`, { days, reason });
    return response.data;
  },

  // ============================================
  // ADMIN — Bulk Actions
  // ============================================

  bulkDelete: async (ids) => {
    const response = await api.post('/admin/employees/bulk-delete', { ids });
    return response.data;
  },

  bulkRestore: async (ids) => {
    const response = await api.post('/admin/employees/bulk-restore', { ids });
    return response.data;
  },

  bulkUpdateStatus: async (ids, status) => {
    const response = await api.post('/admin/employees/bulk-update-status', { ids, status });
    return response.data;
  },
};

export default employeesAPI;