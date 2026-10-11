import api from './axios';

/** The Council of Two, from the second person's side: what waits for them to look at, and approving or declining it. (The page is core/pages/admin/Approvals.) */
const councilAPI = {
  list: async () => (await api.get('/auth/council')).data,
  options: async (id) => (await api.post(`/auth/council/${id}/options`)).data,
  approve: async (id, body) => (await api.post(`/auth/council/${id}/approve`, body)).data,
  reject: async (id, body) => (await api.post(`/auth/council/${id}/reject`, body ?? {})).data,
};

export default councilAPI;
