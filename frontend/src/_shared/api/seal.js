import api from './axios';

/** The seal phrase: asked for by the sign-in page (public), chosen by the person in their profile. */
const sealAPI = {
  forEmail: async (email) => (await api.post('/auth/seal', { email })).data.phrase ?? null,
  mine: async () => (await api.get('/auth/seal')).data,
  save: async (phrase, currentPassword) => (await api.put('/auth/seal', { phrase, current_password: currentPassword })).data,
  clear: async () => (await api.delete('/auth/seal')).data,
};

export default sealAPI;
