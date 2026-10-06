import api from './axios';

/** A signed-in person's own moodboards (the Campaigns module): private until they ask to publish, and staff approve the public ones. */
const myMoodboardsAPI = {
  presets: async () => (await api.get('/my/moodboards/presets')).data,
  list: async () => (await api.get('/my/moodboards')).data,
  get: async (id) => (await api.get(`/my/moodboards/${id}`)).data.data,
  pins: async (q) => (await api.get('/my/moodboards/pins', { params: { q: q || undefined } })).data.data,
  create: async (title, preset) => (await api.post('/my/moodboards', { title, preset })).data,
  update: async (id, data) => (await api.put(`/my/moodboards/${id}`, data)).data,
  publish: async (id) => (await api.post(`/my/moodboards/${id}/publish`)).data,
  makePrivate: async (id) => (await api.post(`/my/moodboards/${id}/private`)).data,
  remove: async (id) => (await api.delete(`/my/moodboards/${id}`)).data,
};

export default myMoodboardsAPI;
