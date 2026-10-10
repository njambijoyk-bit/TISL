import api from './axios';

/** "Where you are signed in": the person's own signed-in browsers. */
const sessionsAPI = {
  list: async () => (await api.get('/auth/sessions')).data.data,
  end: async (id) => (await api.delete(`/auth/sessions/${id}`)).data,
  endOthers: async () => (await api.post('/auth/sessions/revoke-others')).data,
  endAll: async () => (await api.post('/auth/sessions/revoke-all')).data,
  /** the "This was not me" button in the new-sign-in email: public, the link's own code is the proof */
  notMe: async (code) => (await api.post('/auth/secure-account', null, { params: code })).data,
};

export default sessionsAPI;
