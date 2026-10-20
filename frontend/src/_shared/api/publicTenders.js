import api from './axios';

const publicTendersAPI = {
  list: async (params) => (await api.get('/public/tenders', { params })).data,
  show: async (id) => (await api.get(`/public/tenders/${id}`)).data,
  /** The filtered list as a spreadsheet (a download, so it goes through the API client with its blob). */
  exportXlsx: async (params) => (await api.get('/public/tenders/export', { params, responseType: 'blob' })).data,
  documentUrl: (id, docId, inline = false) => `${api.defaults.baseURL}/public/tenders/${id}/documents/${docId}${inline ? '?inline=1' : ''}`,
};

export default publicTendersAPI;
