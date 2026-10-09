import api from './axios';

/** Save bytes the server sent as a download. */
export const saveBlob = (data, headers, fallback) => {
  const name = /filename="?([^";]+)"?/.exec(headers?.['content-disposition'] ?? '')?.[1] ?? fallback;
  const href = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};

/** The error text behind a binary response (the server answers errors in JSON even when a file was asked for). */
const binaryError = async (e) => {
  try { const t = JSON.parse(new TextDecoder().decode(e.response.data)); e.response.data = t; } catch { /* leave it */ }
  throw e;
};

const exchangeAPI = {
  options: () => api.get('/admin/exchange/options').then((r) => r.data),
  /** Download this company's books as a sealed file. */
  exportFile: async (d) => {
    try {
      const r = await api.post('/admin/exchange/export', d, { responseType: 'arraybuffer' });
      saveBlob(r.data, r.headers, 'books.wnkjap');
    } catch (e) { await binaryError(e); }
  },
  keys: () => api.get('/admin/exchange/keys').then((r) => r.data),
  makeKey: (d) => api.post('/admin/exchange/keys', d).then((r) => r.data),
  revokeKey: (id) => api.delete(`/admin/exchange/keys/${id}`).then((r) => r.data),
  connections: () => api.get('/admin/exchange/connections').then((r) => r.data),
  saveConnection: (d, id) => (id ? api.put(`/admin/exchange/connections/${id}`, d) : api.post('/admin/exchange/connections', d)).then((r) => r.data),
  deleteConnection: (id) => api.delete(`/admin/exchange/connections/${id}`).then((r) => r.data),
  /** The other company's sealed file as bytes, for the browser to open. Nothing is saved. */
  fetch: async (id, d) => {
    try { return (await api.post(`/admin/exchange/connections/${id}/fetch`, d, { responseType: 'arraybuffer' })).data; } catch (e) { return binaryError(e); }
  },
};

export default exchangeAPI;
