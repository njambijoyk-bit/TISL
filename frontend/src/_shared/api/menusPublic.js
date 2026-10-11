import api from './axios';

/** The menu as a customer reads it. No sign-in needed. */
const menusPublicAPI = {
  get: async () => (await api.get('/menu')).data,
};

export default menusPublicAPI;
