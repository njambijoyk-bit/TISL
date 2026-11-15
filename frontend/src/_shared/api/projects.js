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

  // phases: each call answers { phases, can }
  phases: async (id) => (await api.get(`/admin/projects/${id}/phases`)).data,
  addPhase: async (id, data) => (await api.post(`/admin/projects/${id}/phases`, data)).data,
  changePhase: async (id, phaseId, data) => (await api.put(`/admin/projects/${id}/phases/${phaseId}`, data)).data,
  removePhase: async (id, phaseId) => (await api.delete(`/admin/projects/${id}/phases/${phaseId}`)).data,

  // the log and the trash
  log: async (id, params) => (await api.get(`/admin/projects/${id}/log`, { params })).data,
  logAll: async (params) => (await api.get('/admin/projects/log', { params })).data,
  remove: async (id) => (await api.delete(`/admin/projects/${id}`)).data,
  trash: async () => (await api.get('/admin/projects/trash')).data,
  restore: async (type, id) => (await api.post('/admin/projects/trash/restore', { type, id })).data,
  purge: async (type, id) => (await api.post('/admin/projects/trash/purge', { type, id })).data,

  // the people on a piece of work: each call answers { members, roles, candidates, can }
  members: async (id) => (await api.get(`/admin/projects/${id}/members`)).data,
  invite: async (id, data) => (await api.post(`/admin/projects/${id}/members`, data)).data,
  changeMember: async (id, memberId, data) => (await api.put(`/admin/projects/${id}/members/${memberId}`, data)).data,
  removeMember: async (id, memberId) => (await api.delete(`/admin/projects/${id}/members/${memberId}`)).data,
  transfer: async (id, userId, note) => (await api.post(`/admin/projects/${id}/transfer`, { user_id: userId, note })).data.project,
  invitations: async () => (await api.get('/admin/projects/invitations')).data.invitations,
  answerInvitation: async (id, accept) => (await api.put(`/admin/projects/${id}/invitation`, { accept })).data.invitations,
  projectRoles: async () => (await api.get('/admin/projects/configuration/roles')).data,
  addProjectRole: async (data) => (await api.post('/admin/projects/configuration/roles', data)).data,
  changeProjectRole: async (roleId, data) => (await api.put(`/admin/projects/configuration/roles/${roleId}`, data)).data,

  configuration: async (industry) => (await api.get('/admin/projects/configuration', { params: industry ? { industry } : {} })).data,
  saveGeneral: async (data) => (await api.put('/admin/projects/configuration/general', data)).data,
  setIndustryActive: async (industry, isActive) => (await api.put(`/admin/projects/configuration/industries/${industry}`, { is_active: isActive })).data,
  renameTerm: async (industry, term, name, plural) => (await api.put(`/admin/projects/configuration/names/${industry}/${term}`, { name, plural })).data,
  resetTerm: async (industry, term) => (await api.delete(`/admin/projects/configuration/names/${industry}/${term}`)).data,
  configurationHistory: async () => (await api.get('/admin/projects/configuration/history')).data,
  rollbackConfiguration: async (version) => (await api.post('/admin/projects/configuration/rollback', { version })).data,
};

export default projectsAPI;
