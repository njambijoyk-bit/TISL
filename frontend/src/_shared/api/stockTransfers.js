import api from './axios';

/** Stock between branches. Admin / finance / manager (acting: admin / finance). */
const stockTransfersAPI = {
  list: async (params) => (await api.get('/admin/stock/transfers', { params })).data,
  show: async (id) => (await api.get(`/admin/stock/transfers/${id}`)).data,
  send: async (payload) => (await api.post('/admin/stock/transfers', payload)).data,
  receive: async (id, received) => (await api.post(`/admin/stock/transfers/${id}/receive`, { received })).data,
  cancel: async (id) => (await api.post(`/admin/stock/transfers/${id}/cancel`)).data,
  /** The printable transfer note as a file (html to look at and print, pdf to keep or send). */
  note: async (id, format = 'html') => {
    try {
      const res = await api.get(`/admin/stock/transfers/${id}/note`, { params: { format }, responseType: 'blob' });
      return { blob: res.data, name: /filename="?([^";]+)"?/.exec(res.headers?.['content-disposition'] ?? '')?.[1] ?? `transfer-note.${format}` };
    } catch (e) {
      // an error body arrives as a blob too: read the message out of it
      if (e?.response?.data instanceof Blob) {
        try { e.response.data = JSON.parse(await e.response.data.text()); } catch { /* not JSON */ }
      }
      throw e;
    }
  },
};

export default stockTransfersAPI;
