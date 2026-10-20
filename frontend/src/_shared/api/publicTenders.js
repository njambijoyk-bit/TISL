import api from './axios';

const publicTendersAPI = {
  list: async (params) => (await api.get('/public/tenders', { params })).data,
  show: async (id) => (await api.get(`/public/tenders/${id}`)).data,
  documentUrl: (id, docId) => `${api.defaults.baseURL}/public/tenders/${id}/documents/${docId}`,
};

export default publicTendersAPI;
