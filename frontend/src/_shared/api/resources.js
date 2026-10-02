import api from './axios';

/** Staff, rooms, tables and equipment that can be booked. */
const resourcesAPI = {
  list: async () => (await api.get('/admin/resources')).data,
  create: async (p) => (await api.post('/admin/resources', p)).data,
  update: async (id, p) => (await api.put(`/admin/resources/${id}`, p)).data,
  remove: async (id) => (await api.delete(`/admin/resources/${id}`)).data,
  saveHours: async (id, hours) => (await api.put(`/admin/resources/${id}/hours`, { hours })).data,
  addTimeOff: async (id, p) => (await api.post(`/admin/resources/${id}/time-off`, p)).data,
  removeTimeOff: async (id, offId) => (await api.delete(`/admin/resources/${id}/time-off/${offId}`)).data,
  saveServices: async (id, services) => (await api.put(`/admin/resources/${id}/services`, { services })).data,
  forService: async (serviceId) => (await api.get(`/admin/resources/for-service/${serviceId}`)).data,
  saveForService: async (serviceId, rows) => (await api.put(`/admin/resources/for-service/${serviceId}`, { rows })).data,
  slots: async (id, params) => (await api.get(`/admin/resources/${id}/slots`, { params })).data,
};

export default resourcesAPI;
