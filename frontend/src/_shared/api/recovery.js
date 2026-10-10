import api from './axios';

/** Recovery codes: make a set (shown once), see how many are left, use one when a device with a passkey is lost. */
const recoveryAPI = {
  status: async () => (await api.get('/auth/recovery-codes')).data,
  generate: async (body = {}) => (await api.post('/auth/recovery-codes', body)).data,
  use: async (code) => (await api.post('/auth/recovery-codes/use', { code })).data,
};

export default recoveryAPI;
