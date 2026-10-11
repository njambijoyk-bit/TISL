import api from './axios';

/** "One more step" for a sensitive action: the question, the device's challenge for it, the answer, and giving it up. (The page's own part is core/components/account/StepUpModal.) */
const stepUpAPI = {
  options: async (id) => (await api.post(`/auth/step-up/${id}/options`)).data,
  approve: async (id, body) => (await api.post(`/auth/step-up/${id}/approve`, body)).data,
  cancel: async (id) => (await api.delete(`/auth/step-up/${id}`)).data,
};

export default stepUpAPI;
