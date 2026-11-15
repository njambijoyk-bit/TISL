import api from './axios';

/** Projects, rebuilt (docs/PROJECTS_STAGE1_SPEC.md). Grows build by build. */
const projectsAPI = {
  // the words this person sees: { ready, industry, company_industry, names: { term: { name, plural } } }
  names: async () => (await api.get('/admin/projects/names')).data,
  setMyNaming: async (industry) => (await api.put('/admin/projects/my/naming', { industry })).data,

  configuration: async (industry) => (await api.get('/admin/projects/configuration', { params: industry ? { industry } : {} })).data,
  saveGeneral: async (data) => (await api.put('/admin/projects/configuration/general', data)).data,
  setIndustryActive: async (industry, isActive) => (await api.put(`/admin/projects/configuration/industries/${industry}`, { is_active: isActive })).data,
  renameTerm: async (industry, term, name, plural) => (await api.put(`/admin/projects/configuration/names/${industry}/${term}`, { name, plural })).data,
  resetTerm: async (industry, term) => (await api.delete(`/admin/projects/configuration/names/${industry}/${term}`)).data,
  configurationHistory: async () => (await api.get('/admin/projects/configuration/history')).data,
  rollbackConfiguration: async (version) => (await api.post('/admin/projects/configuration/rollback', { version })).data,
};

export default projectsAPI;
