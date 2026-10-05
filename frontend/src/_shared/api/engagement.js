import api from './axios';

/** The Engagement Engine (Extras): the settings page (admin and super admin) and the public config the storefront reads. */
const engagementAPI = {
  settings: async () => (await api.get('/admin/engagement/settings')).data,
  save: async (data) => (await api.put('/admin/engagement/settings', data)).data,
  applyPreset: async (preset) => (await api.post('/admin/engagement/preset', { preset })).data,
  config: async () => (await api.get('/engagement/config')).data,
  // reviews, comments and replies
  posts: async (type, id, kind, after) => (await api.get(`/engagement/${type}/${id}/posts`, { params: { kind, after: after || undefined } })).data,
  can: async (type, id, kind) => (await api.get(`/engagement/${type}/${id}/can`, { params: { kind } })).data,
  post: async (type, id, fields, photos = []) => {
    const f = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') f.append(k, v); });
    photos.forEach((p) => f.append('photos[]', p));
    return (await api.post(`/engagement/${type}/${id}/posts`, f, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  reply: async (postId, fields) => (await api.post(`/engagement/posts/${postId}/replies`, fields)).data,
  editPost: async (id, fields) => (await api.put(`/engagement/posts/${id}`, fields)).data,
  deletePost: async (id) => (await api.delete(`/engagement/posts/${id}`)).data,
  // moderation (admin)
  queue: async (params) => (await api.get('/admin/engagement/posts', { params })).data,
  approve: async (id) => (await api.post(`/admin/engagement/posts/${id}/approve`)).data,
  hide: async (id) => (await api.post(`/admin/engagement/posts/${id}/hide`)).data,
  remove: async (id) => (await api.post(`/admin/engagement/posts/${id}/remove`)).data,
};

export default engagementAPI;
