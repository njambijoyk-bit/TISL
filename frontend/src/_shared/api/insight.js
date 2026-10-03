import api from './axios';

const unwrap = (r) => r.data;

/** The calculator's read-only side: currencies and units for the keypad, and the insight packs the user's role may use. */
const insightAPI = {
  reference: () => api.get('/admin/insight/reference').then(unwrap),
  contexts: (context) => api.post('/admin/insight/contexts', { context }).then(unwrap),
  answer: (pack, context, lookback, example = 0) => api.post('/admin/insight/answer', { pack, context, lookback, example }).then(unwrap),
  explain: (pack, context, lookback, example = 0) => api.post('/admin/insight/explain', { pack, context, lookback, example }).then(unwrap),
};

export default insightAPI;
