import api from './axios';

/** Units of measure + per-locale default units (admin). */
const unitsOfMeasureAPI = {
  // params: { dimension, unit_system, active }
  getUnits: async (params = {}) => (await api.get('/admin/units-of-measure', { params })).data,
  getUnit: async (id) => (await api.get(`/admin/units-of-measure/${id}`)).data,
  createUnit: async (data) => (await api.post('/admin/units-of-measure', data)).data,
  updateUnit: async (id, data) => (await api.put(`/admin/units-of-measure/${id}`, data)).data,
  deleteUnit: async (id) => (await api.delete(`/admin/units-of-measure/${id}`)).data,

  /** Same-dimension conversion. Returns { from: {unit, quantity}, to: {unit, quantity} } */
  convert: async (fromUnitId, toUnitId, quantity) =>
    (await api.get('/admin/units-of-measure/convert', {
      params: { from_unit_id: fromUnitId, to_unit_id: toUnitId, quantity },
    })).data,

  // ── Locale defaults (one unit per locale + dimension) ─────────────────
  // params: { locale, dimension }
  getLocaleDefaults: async (params = {}) =>
    (await api.get('/admin/unit-locale-defaults', { params })).data,
  /** Upsert: { locale, dimension, unit_id } */
  setLocaleDefault: async (data) =>
    (await api.post('/admin/unit-locale-defaults', data)).data,
  deleteLocaleDefault: async (id) =>
    (await api.delete(`/admin/unit-locale-defaults/${id}`)).data,
};

export default unitsOfMeasureAPI;
export { unitsOfMeasureAPI };
