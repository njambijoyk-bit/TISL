import api from './axios';

/** Projects, rebuilt (docs/PROJECTS_STAGE1_SPEC.md). Grows build by build. */
const projectsAPI = {
  // the words this person sees: { ready, industry, company_industry, names: { term: { name, plural } } }
  names: async () => (await api.get('/admin/projects/names')).data,
  setMyNaming: async (industry) => (await api.put('/admin/projects/my/naming', { industry })).data,

  // the work itself
  list: async (params) => (await api.get('/admin/projects', { params })).data,
  options: async () => (await api.get('/admin/projects/options')).data,
  customers: async (q) => (await api.get('/admin/projects/options/customers', { params: { q } })).data.customers,
  create: async (data) => (await api.post('/admin/projects', data)).data.project,
  get: async (id) => (await api.get(`/admin/projects/${id}`)).data.project,
  update: async (id, data) => (await api.put(`/admin/projects/${id}`, data)).data.project,
  moveStage: async (id, stageId) => (await api.put(`/admin/projects/${id}/stage`, { stage_id: stageId })).data.project,
  setState: async (id, action, reason) => (await api.put(`/admin/projects/${id}/state`, { action, reason })).data.project,
  freeze: async (id, frozen) => (await api.put(`/admin/projects/${id}/freeze`, { frozen })).data.project,

  configuration: async (industry) => (await api.get('/admin/projects/configuration', { params: industry ? { industry } : {} })).data,
  saveGeneral: async (data) => (await api.put('/admin/projects/configuration/general', data)).data,
  setIndustryActive: async (industry, isActive) => (await api.put(`/admin/projects/configuration/industries/${industry}`, { is_active: isActive })).data,
  renameTerm: async (industry, term, name, plural) => (await api.put(`/admin/projects/configuration/names/${industry}/${term}`, { name, plural })).data,
  resetTerm: async (industry, term) => (await api.delete(`/admin/projects/configuration/names/${industry}/${term}`)).data,
  configurationHistory: async () => (await api.get('/admin/projects/configuration/history')).data,
  rollbackConfiguration: async (version) => (await api.post('/admin/projects/configuration/rollback', { version })).data,
};

export default projectsAPI;
