import api from './axios';

/** Memberships (storefront): the plans, and a signed-in person joining, paying and managing a membership. */
export const membershipsPublicAPI = {
  plans: async () => (await api.get('/memberships/plans')).data,
  card: async () => (await api.get('/memberships/my/card')).data,
  mine: async () => (await api.get('/memberships/my')).data,
  quote: async (planId) => (await api.post(`/memberships/plans/${planId}/quote`)).data,
  join: async (planId, payload) => (await api.post(`/memberships/plans/${planId}/join`, payload)).data,
  pay: async (id, payload) => (await api.post(`/memberships/my/${id}/pay`, payload)).data,
  pause: async (id, days) => (await api.post(`/memberships/my/${id}/pause`, { days })).data,
  resume: async (id) => (await api.post(`/memberships/my/${id}/resume`)).data,
  cancel: async (id, reason) => (await api.post(`/memberships/my/${id}/cancel`, { reason })).data,
  keep: async (id) => (await api.post(`/memberships/my/${id}/keep`)).data,
  changePlan: async (id, planId) => (await api.post(`/memberships/my/${id}/change-plan`, { plan_id: planId })).data,
};

export default membershipsPublicAPI;
