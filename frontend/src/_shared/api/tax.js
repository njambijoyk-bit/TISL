import api from './axios';

/**
 * Tax configuration API (admin).
 * Reads: finance, manager, admin, super_admin. Writes: finance, admin, super_admin.
 */
const taxAPI = {
  // ── Types ──────────────────────────────────────────────────────────────
  // params: { active, application_mode: 'additive' | 'withheld' }
  getTypes: async (params = {}) => (await api.get('/admin/tax/types', { params })).data,
  createType: async (data) => (await api.post('/admin/tax/types', data)).data,
  updateType: async (id, data) => (await api.put(`/admin/tax/types/${id}`, data)).data,
  deleteType: async (id) => (await api.delete(`/admin/tax/types/${id}`)).data,

  // ── Rates ──────────────────────────────────────────────────────────────
  // params: { tax_type_id, classification, active }
  getRates: async (params = {}) => (await api.get('/admin/tax/rates', { params })).data,
  createRate: async (data) => (await api.post('/admin/tax/rates', data)).data,
  updateRate: async (id, data) => (await api.put(`/admin/tax/rates/${id}`, data)).data,
  deleteRate: async (id) => (await api.delete(`/admin/tax/rates/${id}`)).data,

  // ── Rules ──────────────────────────────────────────────────────────────
  // params: { tax_type_id, applicable_module, active }
  getRules: async (params = {}) => (await api.get('/admin/tax/rules', { params })).data,
  createRule: async (data) => (await api.post('/admin/tax/rules', data)).data,
  updateRule: async (id, data) => (await api.put(`/admin/tax/rules/${id}`, data)).data,
  deleteRule: async (id) => (await api.delete(`/admin/tax/rules/${id}`)).data,
  syncRuleDistricts: async (id, districtIds = []) =>
    (await api.put(`/admin/tax/rules/${id}/districts`, { district_ids: districtIds })).data,

  // ── Districts ──────────────────────────────────────────────────────────
  // params: { locale, level, parent_id, active }
  getDistricts: async (params = {}) => (await api.get('/admin/tax/districts', { params })).data,
  createDistrict: async (data) => (await api.post('/admin/tax/districts', data)).data,
  updateDistrict: async (id, data) => (await api.put(`/admin/tax/districts/${id}`, data)).data,
  deleteDistrict: async (id) => (await api.delete(`/admin/tax/districts/${id}`)).data,

  // ── Applicability (entity-level overrides) ─────────────────────────────
  // params: { taxable_type: 'product' | 'service' | 'customer', taxable_id }
  getApplicability: async (params = {}) => (await api.get('/admin/tax/applicability', { params })).data,
  createApplicability: async (data) => (await api.post('/admin/tax/applicability', data)).data,
  updateApplicability: async (id, data) => (await api.put(`/admin/tax/applicability/${id}`, data)).data,
  deleteApplicability: async (id) => (await api.delete(`/admin/tax/applicability/${id}`)).data,

  // ── Applications (read-only audit trail, paginated) ────────────────────
  // params: { order_id, classification, page, per_page }
  getApplications: async (params = {}) => (await api.get('/admin/tax/applications', { params })).data,
};

export default taxAPI;
export { taxAPI };
