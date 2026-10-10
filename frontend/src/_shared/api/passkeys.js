import api from './axios';

/** Passkeys: signing in with one, and "My devices". (The browser's own part is in lib/webauthn.js.) */
const passkeysAPI = {
  // signing in: public
  loginOptions: async () => (await api.post('/auth/passkeys/options')).data,
  login: async (body) => (await api.post('/auth/passkeys/login', body)).data,
  // signed in
  list: async () => (await api.get('/auth/passkeys')).data,
  registerOptions: async (body = {}) => (await api.post('/auth/passkeys/register/options', body)).data,
  registerVerify: async (body) => (await api.post('/auth/passkeys/register/verify', body)).data,
  proveOptions: async () => (await api.post('/auth/passkeys/prove/options')).data,
  prove: async (body) => (await api.post('/auth/passkeys/prove', body)).data,
  rename: async (id, name) => (await api.patch(`/auth/passkeys/${id}`, { name })).data,
  remove: async (id, body = {}) => (await api.delete(`/auth/passkeys/${id}`, { data: body })).data,
};

export default passkeysAPI;
