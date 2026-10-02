import api from './axios';

/** Petty cash: the boxes, spending with a receipt, top-ups to the float. */
const pettyCashAPI = {
  list: async () => (await api.get('/admin/petty-cash')).data,
  options: async () => (await api.get('/admin/petty-cash/options')).data,
  spend: async (fields, receipt) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') fd.append(k, v); });
    if (receipt) fd.append('receipt', receipt);
    return (await api.post('/admin/petty-cash/spend', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  cancel: async (id) => (await api.post(`/admin/petty-cash/spend/${id}/cancel`)).data,
  topUp: async (payload) => (await api.post('/admin/petty-cash/top-up', payload)).data,
  setFloat: async (payload) => (await api.put('/admin/petty-cash/float', payload)).data,
};

export default pettyCashAPI;
