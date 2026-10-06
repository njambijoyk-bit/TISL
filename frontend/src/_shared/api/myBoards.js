import api from './axios';

/** A signed-in person's own boards, pins and follows (the Campaigns module). Pins with a picture go as multipart form data. */
const myBoardsAPI = {
  list: async (pinId) => (await api.get('/my/boards', { params: { pin_id: pinId || undefined } })).data,
  get: async (id) => (await api.get(`/my/boards/${id}`)).data.data,
  create: async (data) => (await api.post('/my/boards', data)).data,
  update: async (id, data) => (await api.put(`/my/boards/${id}`, data)).data,
  remove: async (id) => (await api.delete(`/my/boards/${id}`)).data,
  save: async (id, pinIds) => (await api.post(`/my/boards/${id}/pins`, { pin_ids: pinIds })).data,
  removePin: async (id, pinId) => (await api.delete(`/my/boards/${id}/pins/${pinId}`)).data,
  uploadPin: async (fields, image) => {
    const f = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') f.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : v); });
    if (image) f.append('image', image);
    return (await api.post('/my/pins', f, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  deletePin: async (id) => (await api.delete(`/my/pins/${id}`)).data,
  pinRules: async () => (await api.get('/my/pin-rules')).data.data,
  following: async () => (await api.get('/my/following')).data.data,
  follow: async (id) => (await api.post(`/world/boards/${id}/follow`)).data,
  unfollow: async (id) => (await api.delete(`/world/boards/${id}/follow`)).data,
};

export default myBoardsAPI;
