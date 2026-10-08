import api from './axios';

/** Identity and access: clearance levels, roles, who holds what, branch grants, the audit trail (/admin/access). */
const accessAPI = {
  overview: async () => (await api.get('/admin/access')).data,
  people: async (params) => (await api.get('/admin/access/people', { params })).data,
  user: async (id) => (await api.get(`/admin/access/users/${id}`)).data,
  log: async (params) => (await api.get('/admin/access/log', { params })).data,

  setClearance: async (id, level) => (await api.put(`/admin/access/users/${id}/clearance`, { level })).data,
  setDefaultLocation: async (id, locationId) => (await api.put(`/admin/access/users/${id}/default-location`, { location_id: locationId })).data,
  setPrimaryRole: async (id, roleId) => (await api.put(`/admin/access/users/${id}/primary-role`, { role_id: roleId })).data,
  addRole: async (id, body) => (await api.post(`/admin/access/users/${id}/roles`, body)).data,
  removeRole: async (id, roleId) => (await api.delete(`/admin/access/users/${id}/roles/${roleId}`)).data,
  addGrant: async (id, body) => (await api.post(`/admin/access/users/${id}/grants`, body)).data,
  revokeGrant: async (id, grantId) => (await api.delete(`/admin/access/users/${id}/grants/${grantId}`)).data,

  createRole: async (body) => (await api.post('/admin/access/roles', body)).data,
  updateRole: async (id, body) => (await api.put(`/admin/access/roles/${id}`, body)).data,
  deleteRole: async (id) => (await api.delete(`/admin/access/roles/${id}`)).data,
  renameLevel: async (level, body) => (await api.put(`/admin/access/levels/${level}`, body)).data,
};

export default accessAPI;
