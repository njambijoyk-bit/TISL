import api from './axios';

// "Tell me when it is back" (docs/BACK_IN_STOCK_PLAN.md). The first three are open to anyone; the rest are staff (Settings → Notifications → Stock alerts).
const stockAlertsAPI = {
  enabled: () => api.get('/stock-watches/enabled').then((r) => r.data.enabled),
  /** { product_id, variant_id?, email?, name? } → { message, already } */
  watch: (body) => api.post('/stock-watches', body).then((r) => r.data),
  /** what a "stop these alerts" link is for: { product, status } */
  peek: (token) => api.get(`/stock-watches/${token}`).then((r) => r.data),
  stop: (token) => api.post(`/stock-watches/${token}/stop`).then((r) => r.data),

  overview: () => api.get('/admin/notifications/stock-alerts').then((r) => r.data),
  /** mode: 'stock' (as many as there is stock, first come first served) | 'all' */
  tell: (variantId, mode) => api.post(`/admin/notifications/stock-alerts/${variantId}/tell`, { mode }).then((r) => r.data),
};

export default stockAlertsAPI;
