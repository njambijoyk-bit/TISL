import api from './axios';

/** HR configuration (HR stage 1, docs/HR_STAGE1_SPEC.md). Each call answers the whole page: { ready, general, version, versions, types, next_number }. */
const hrAPI = {
  configuration: () => api.get('/admin/hr/configuration').then((r) => r.data),
  saveGeneral: (general) => api.put('/admin/hr/configuration', { general }).then((r) => r.data),
  rollback: (version) => api.post(`/admin/hr/configuration/rollback/${version}`).then((r) => r.data),
  saveType: (id, data) => (id ? api.put(`/admin/hr/employment-types/${id}`, data) : api.post('/admin/hr/employment-types', data)).then((r) => r.data),
};

export default hrAPI;
