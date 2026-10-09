import api from './axios';

// "Tell me when it is back" (docs/BACK_IN_STOCK_PLAN.md). The first three are open to anyone; the rest are staff (Settings → Notifications → Stock alerts).
let enabledAsk = null;
let enabledAt = 0;

const stockAlertsAPI = {
  /** asked once for the whole page (many cards ask) and remembered for a few minutes */
  enabled: () => {
    if (!enabledAsk || Date.now() - enabledAt > 300000) {
      enabledAt = Date.now();
      enabledAsk = api.get('/stock-watches/enabled').then((r) => r.data.enabled).catch(() => { enabledAsk = null; return false; });
    }
    return enabledAsk;
  },
  /** { product_id, variant_id? | hamper_id, email?, name? } → { message, already }; a 422 with `options` [{id, name}] means: ask which option */
  watch: (body) => api.post('/stock-watches', body).then((r) => r.data),
  /** what a "stop these alerts" link is for: { product, status } */
  peek: (token) => api.get(`/stock-watches/${token}`).then((r) => r.data),
  stop: (token) => api.post(`/stock-watches/${token}/stop`).then((r) => r.data),

  overview: () => api.get('/admin/notifications/stock-alerts').then((r) => r.data),
  /** mode: 'stock' (as many as there is stock, first come first served) | 'all' */
  tell: (variantId, mode) => api.post(`/admin/notifications/stock-alerts/${variantId}/tell`, { mode }).then((r) => r.data),
  tellHamper: (hamperId, mode) => api.post(`/admin/notifications/stock-alerts/hampers/${hamperId}/tell`, { mode }).then((r) => r.data),
};

export default stockAlertsAPI;
