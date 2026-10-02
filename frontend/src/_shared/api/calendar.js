import api from './axios';

/** The staff calendar: mine, the team's (managers), and the private subscription link. */
const calendarAPI = {
  mine: async (params) => (await api.get('/admin/calendar', { params })).data,
  team: async (params) => (await api.get('/admin/calendar/team', { params })).data,
  subscription: async () => (await api.get('/admin/calendar/subscription')).data,
  rotate: async () => (await api.post('/admin/calendar/subscription/rotate')).data,
};

export default calendarAPI;
