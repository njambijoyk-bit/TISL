import api from './axios';

/** The world feed as visitors see it (the Campaigns module): pins, one pin, one board and the picture download. */
const worldAPI = {
  pins: async (params) => (await api.get('/world/pins', { params })).data,
  pin: async (id) => (await api.get(`/world/pins/${id}`)).data.data,
  board: async (id, after) => (await api.get(`/world/boards/${id}`, { params: { after: after || undefined } })).data.data,
  // fetched as a file so a refusal can be shown as a message instead of a blank page
  download: async (id) => {
    const r = await api.get(`/world/pins/${id}/download`, { responseType: 'blob' });
    const name = /filename="?([^";]+)"?/.exec(r.headers['content-disposition'] ?? '')?.[1] ?? `pin-${id}`;
    const url = URL.createObjectURL(r.data);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

export default worldAPI;
