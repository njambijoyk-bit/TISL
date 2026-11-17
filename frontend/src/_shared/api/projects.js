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

  // records of other modules attached to a piece of work: each call answers { groups, hidden, off, can }
  links: async (id) => (await api.get(`/admin/projects/${id}/links`)).data,
  findLinkable: async (id, type, q) => (await api.get(`/admin/projects/${id}/links/find`, { params: { type, q } })).data.found,
  addLink: async (id, data) => (await api.post(`/admin/projects/${id}/links`, data)).data,
  removeLink: async (id, linkId) => (await api.delete(`/admin/projects/${id}/links/${linkId}`)).data,
  linkedTo: async (type, id) => (await api.get('/admin/projects/linked', { params: { type, id } })).data.projects,

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
  // stage 2, the control room: who can get in and why; each call answers { people, others, project_hours, summary, can }
  access: async (id) => (await api.get(`/admin/projects/${id}/access`)).data,
  extendAccess: async (id, memberId, endsAt) => (await api.put(`/admin/projects/${id}/access/members/${memberId}`, { ends_at: endsAt })).data,
  setHours: async (id, data) => (await api.put(`/admin/projects/${id}/access/hours`, data)).data,   // { days, member_id?, read_outside_hours? }
  askPass: async (id, reason) => (await api.post(`/admin/projects/${id}/access/pass`, { reason })).data,
  answerPass: async (id, passId, approve) => (await api.put(`/admin/projects/${id}/access/passes/${passId}`, { approve })).data,
  // serious actions: each call answers { actions, needs, rules, suggested, identity_ready, approvers, can }
  serious: async () => (await api.get('/admin/projects/configuration/serious')).data,
  saveSerious: async (rules) => (await api.put('/admin/projects/configuration/serious', { rules })).data,
  saveAccessSettings: async (data) => (await api.put('/admin/projects/configuration/access', data)).data,
  // locked areas: unlock answers { until, locks: state by area }; the three below answer { locks: the list for the Access tab }
  unlock: async (id, area, password) => (await api.post(`/admin/projects/${id}/locks/${area}/open`, { password })).data,
  lockAgain: async (id, area) => (await api.post(`/admin/projects/${id}/locks/${area}/close`)).data,
  setLock: async (id, area, data) => (await api.put(`/admin/projects/${id}/locks/${area}`, data)).data.locks,
  removeLock: async (id, area, password) => (await api.delete(`/admin/projects/${id}/locks/${area}`, { data: { password } })).data.locks,
  askLockReset: async (id, area, reason) => (await api.post(`/admin/projects/${id}/locks/${area}/reset`, { reason })).data.locks,
  // stage 3, relationships. Leads: the list answers { data, total, page, per_page, counts, sees_all, ready, can }; one lead answers the lead
  leads: async (params) => (await api.get('/admin/projects/leads', { params })).data,
  leadOptions: async () => (await api.get('/admin/projects/leads/options')).data,
  lead: async (id) => (await api.get(`/admin/projects/leads/${id}`)).data.lead,
  addLead: async (data) => (await api.post('/admin/projects/leads', data)).data.lead,
  changeLead: async (id, data) => (await api.put(`/admin/projects/leads/${id}`, data)).data.lead,
  known: async (params) => (await api.get('/admin/projects/known', { params })).data.known,
  // contacts under a client, a lead or a party: each call answers { contacts, roles, can }
  contacts: async (type, id) => (await api.get(`/admin/projects/contacts/${type}/${id}`)).data,
  addContact: async (type, id, data) => (await api.post(`/admin/projects/contacts/${type}/${id}`, data)).data,
  changeContact: async (contactId, data) => (await api.put(`/admin/projects/contacts/${contactId}`, data)).data,
  removeContact: async (contactId) => (await api.delete(`/admin/projects/contacts/${contactId}`)).data,
  // other parties on a piece of work: each call answers { ready, parties, client_contacts, roles, available_contacts, can }
  parties: async (id) => (await api.get(`/admin/projects/${id}/parties`)).data,
  findParties: async (q) => (await api.get('/admin/projects/parties', { params: { q } })).data.parties,
  addParty: async (id, data) => (await api.post(`/admin/projects/${id}/parties`, data)).data,
  removeParty: async (id, linkId) => (await api.delete(`/admin/projects/${id}/parties/${linkId}`)).data,
  addPartyContact: async (id, data) => (await api.post(`/admin/projects/${id}/party-contacts`, data)).data,
  removePartyContact: async (id, linkId) => (await api.delete(`/admin/projects/${id}/party-contacts/${linkId}`)).data,
  // the pipeline: the board answers { stages: [{ ..., items, totals }], open, sees_all, ready, can }
  pipeline: async (params) => (await api.get('/admin/projects/pipeline', { params })).data,
  pipelineOptions: async () => (await api.get('/admin/projects/pipeline/options')).data,
  pipelineQuotations: async (q) => (await api.get('/admin/projects/pipeline/quotations', { params: { q } })).data.vouchers,
  opportunitiesOf: async (type, id) => (await api.get(`/admin/projects/pipeline/of/${type}/${id}`)).data.opportunities,
  addOpportunity: async (data) => (await api.post('/admin/projects/opportunities', data)).data.opportunity,
  changeOpportunity: async (id, data) => (await api.put(`/admin/projects/opportunities/${id}`, data)).data.opportunity,
  winOpportunity: async (id, data) => (await api.post(`/admin/projects/opportunities/${id}/win`, data)).data,
  startOpportunityProject: async (id, data) => (await api.post(`/admin/projects/opportunities/${id}/project`, data)).data,
  makeLeadClient: async (leadId) => (await api.post(`/admin/projects/leads/${leadId}/client`)).data,
  pipelineStages: async () => (await api.get('/admin/projects/configuration/pipeline')).data,
  addPipelineStage: async (name) => (await api.post('/admin/projects/configuration/pipeline', { name })).data,
  changePipelineStage: async (stageId, data) => (await api.put(`/admin/projects/configuration/pipeline/${stageId}`, data)).data,
  // the lists an owner manages: each call answers { lists, rows, industries, ready, can }
  lists: async () => (await api.get('/admin/projects/configuration/lists')).data,
  addToList: async (list, data) => (await api.post(`/admin/projects/configuration/lists/${list}`, data)).data,
  changeListRow: async (list, rowId, data) => (await api.put(`/admin/projects/configuration/lists/${list}/${rowId}`, data)).data,
  // security: each call answers { ready, events, summary, settings, signals, responses, watchers, can }
  security: async () => (await api.get('/admin/projects/security')).data,
  reviewSecurityEvent: async (eventId, note, release) => (await api.put(`/admin/projects/security/events/${eventId}`, { note, release: !!release })).data,
  saveSecuritySettings: async (settings) => (await api.put('/admin/projects/configuration/security', { settings })).data,
  // approvals: each call answers { waiting, mine, can }
  approvals: async () => (await api.get('/admin/projects/approvals')).data,
  answerApproval: async (approvalId, approve, note) => (await api.put(`/admin/projects/approvals/${approvalId}`, { approve, note })).data,
  withdrawApproval: async (approvalId) => (await api.delete(`/admin/projects/approvals/${approvalId}`)).data,
  transfer: async (id, userId, note) => (await api.post(`/admin/projects/${id}/transfer`, { user_id: userId, note })).data.project,
  invitations: async () => (await api.get('/admin/projects/invitations')).data.invitations,
  answerInvitation: async (id, accept) => (await api.put(`/admin/projects/${id}/invitation`, { accept })).data.invitations,
  projectRoles: async () => (await api.get('/admin/projects/configuration/roles')).data,
  addProjectRole: async (data) => (await api.post('/admin/projects/configuration/roles', data)).data,
  changeProjectRole: async (roleId, data) => (await api.put(`/admin/projects/configuration/roles/${roleId}`, data)).data,

  // the shape of the work: every call answers the whole shape of the industry being looked at
  shape: async (industry) => (await api.get('/admin/projects/configuration/shape', { params: { industry } })).data,
  addType: async (industry, data) => (await api.post('/admin/projects/configuration/types', { ...data, industry_key: industry })).data,
  changeType: async (industry, typeId, data) => (await api.put(`/admin/projects/configuration/types/${typeId}`, data, { params: { industry } })).data,
  addStage: async (industry, typeId, data) => (await api.post(`/admin/projects/configuration/types/${typeId}/stages`, data, { params: { industry } })).data,
  changeStage: async (industry, stageId, data) => (await api.put(`/admin/projects/configuration/stages/${stageId}`, data, { params: { industry } })).data,
  removeStage: async (industry, stageId) => (await api.delete(`/admin/projects/configuration/stages/${stageId}`, { params: { industry } })).data,
  addField: async (industry, data) => (await api.post('/admin/projects/configuration/fields', data, { params: { industry } })).data,
  changeField: async (industry, fieldId, data) => (await api.put(`/admin/projects/configuration/fields/${fieldId}`, data, { params: { industry } })).data,

  // shortcut keys: each call answers { keys, company, mine, in_use, taken_with_shift, can }
  shortcuts: async () => (await api.get('/admin/projects/shortcuts')).data,
  saveShortcuts: async (keys) => (await api.put('/admin/projects/configuration/shortcuts', { keys })).data,
  saveMyShortcuts: async (keys) => (await api.put('/admin/projects/my/shortcuts', { keys })).data,

  configuration: async (industry) => (await api.get('/admin/projects/configuration', { params: industry ? { industry } : {} })).data,
  saveGeneral: async (data) => (await api.put('/admin/projects/configuration/general', data)).data,
  setIndustryActive: async (industry, isActive) => (await api.put(`/admin/projects/configuration/industries/${industry}`, { is_active: isActive })).data,
  renameTerm: async (industry, term, name, plural) => (await api.put(`/admin/projects/configuration/names/${industry}/${term}`, { name, plural })).data,
  resetTerm: async (industry, term) => (await api.delete(`/admin/projects/configuration/names/${industry}/${term}`)).data,
  configurationHistory: async () => (await api.get('/admin/projects/configuration/history')).data,
  rollbackConfiguration: async (version) => (await api.post('/admin/projects/configuration/rollback', { version })).data,
};

export default projectsAPI;
