import { create } from 'zustand';
import taxAPI from '../api/tax';
import {
  createRunners, emptyPagination, fromPaginator, upsertById, removeById, cleanParams,
} from './helpers/apiState';

/**
 * Tax configuration: types, rates, rules, districts, entity overrides,
 * and the read-only applications audit trail.
 *
 * Every mutation rethrows so the calling form can show field errors
 * (use fieldErrors(error) from ./helpers/apiState).
 */
const useTaxStore = create((set, get) => {
  const { act, load } = createRunners(set, get);

  return {
    // ── State ────────────────────────────────────────────────────────────
    types: [],
    rates: [],
    rules: [],
    districts: [],
    applicability: [],        // overrides for the entity last queried
    applications: [],
    applicationsPagination: { ...emptyPagination },

    loading: {
      types: false, rates: false, rules: false,
      districts: false, applicability: false, applications: false,
    },
    actionLoading: false,
    error: null,

    // ── Selectors ────────────────────────────────────────────────────────
    additiveTypes: () => get().types.filter((t) => t.application_mode === 'additive'),
    withheldTypes: () => get().types.filter((t) => t.application_mode === 'withheld'),
    ratesForType: (typeId) => get().rates.filter((r) => r.tax_type_id === typeId),
    districtChildren: (parentId = null) => get().districts.filter((d) => (d.parent_id ?? null) === parentId),

    // ── Types ────────────────────────────────────────────────────────────
    fetchTypes: (params = {}) => load('types', async () => {
      const res = await taxAPI.getTypes(cleanParams(params));
      set({ types: res.tax_types ?? [] });
      return res.tax_types;
    }, 'Failed to load tax types'),

    createType: (data) => act(async () => {
      const res = await taxAPI.createType(data);
      set({ types: upsertById(get().types, res.tax_type) });
      return res.tax_type;
    }, 'Failed to create tax type'),

    updateType: (id, data) => act(async () => {
      const res = await taxAPI.updateType(id, data);
      set({ types: upsertById(get().types, res.tax_type) });
      return res.tax_type;
    }, 'Failed to update tax type'),

    deleteType: (id) => act(async () => {
      await taxAPI.deleteType(id);
      set({ types: removeById(get().types, id) });
    }, 'Failed to delete tax type'),

    // ── Rates ────────────────────────────────────────────────────────────
    fetchRates: (params = {}) => load('rates', async () => {
      const res = await taxAPI.getRates(cleanParams(params));
      set({ rates: res.tax_rates ?? [] });
      return res.tax_rates;
    }, 'Failed to load tax rates'),

    createRate: (data) => act(async () => {
      const res = await taxAPI.createRate(data);
      set({ rates: upsertById(get().rates, res.tax_rate) });
      return res.tax_rate;
    }, 'Failed to create tax rate'),

    /** 422 if the rate was already applied and a financial field is being changed. */
    updateRate: (id, data) => act(async () => {
      const res = await taxAPI.updateRate(id, data);
      set({ rates: upsertById(get().rates, res.tax_rate) });
      return res.tax_rate;
    }, 'Failed to update tax rate'),

    deleteRate: (id) => act(async () => {
      await taxAPI.deleteRate(id);
      set({ rates: removeById(get().rates, id) });
    }, 'Failed to delete tax rate'),

    // ── Rules ────────────────────────────────────────────────────────────
    fetchRules: (params = {}) => load('rules', async () => {
      const res = await taxAPI.getRules(cleanParams(params));
      set({ rules: res.tax_rules ?? [] });
      return res.tax_rules;
    }, 'Failed to load tax rules'),

    /** data may include district_ids: [] — created atomically with the rule. */
    createRule: (data) => act(async () => {
      const res = await taxAPI.createRule(data);
      set({ rules: upsertById(get().rules, res.tax_rule) });
      return res.tax_rule;
    }, 'Failed to create tax rule'),

    updateRule: (id, data) => act(async () => {
      const res = await taxAPI.updateRule(id, data);
      set({ rules: upsertById(get().rules, res.tax_rule) });
      return res.tax_rule;
    }, 'Failed to update tax rule'),

    syncRuleDistricts: (id, districtIds) => act(async () => {
      const res = await taxAPI.syncRuleDistricts(id, districtIds);
      set({ rules: upsertById(get().rules, res.tax_rule) });
      return res.tax_rule;
    }, 'Failed to update rule districts'),

    deleteRule: (id) => act(async () => {
      await taxAPI.deleteRule(id);
      set({ rules: removeById(get().rules, id) });
    }, 'Failed to delete tax rule'),

    // ── Districts ────────────────────────────────────────────────────────
    fetchDistricts: (params = {}) => load('districts', async () => {
      const res = await taxAPI.getDistricts(cleanParams(params));
      set({ districts: res.tax_districts ?? [] });
      return res.tax_districts;
    }, 'Failed to load tax districts'),

    createDistrict: (data) => act(async () => {
      const res = await taxAPI.createDistrict(data);
      set({ districts: upsertById(get().districts, res.tax_district) });
      return res.tax_district;
    }, 'Failed to create district'),

    updateDistrict: (id, data) => act(async () => {
      const res = await taxAPI.updateDistrict(id, data);
      set({ districts: upsertById(get().districts, res.tax_district) });
      return res.tax_district;
    }, 'Failed to update district'),

    deleteDistrict: (id) => act(async () => {
      await taxAPI.deleteDistrict(id);
      set({ districts: removeById(get().districts, id) });
    }, 'Failed to delete district'),

    // ── Applicability (per product / service / customer) ─────────────────
    /** e.g. fetchApplicability('product', 12) */
    fetchApplicability: (taxableType, taxableId) => load('applicability', async () => {
      const res = await taxAPI.getApplicability(cleanParams({ taxable_type: taxableType, taxable_id: taxableId }));
      set({ applicability: res.applicability ?? [] });
      return res.applicability;
    }, 'Failed to load tax overrides'),

    /** data: { taxable_type, taxable_id, tax_rule_id?, is_exempt?, tax_legitimacy_certificate_id? } */
    createApplicability: (data) => act(async () => {
      const res = await taxAPI.createApplicability(data);
      set({ applicability: upsertById(get().applicability, res.applicability) });
      return res.applicability;
    }, 'Failed to add tax override'),

    updateApplicability: (id, data) => act(async () => {
      const res = await taxAPI.updateApplicability(id, data);
      set({ applicability: upsertById(get().applicability, res.applicability) });
      return res.applicability;
    }, 'Failed to update tax override'),

    deleteApplicability: (id) => act(async () => {
      await taxAPI.deleteApplicability(id);
      set({ applicability: removeById(get().applicability, id) });
    }, 'Failed to remove tax override'),

    // ── Applications (audit, paginated) ──────────────────────────────────
    fetchApplications: (params = {}) => load('applications', async () => {
      const res = await taxAPI.getApplications(cleanParams(params));
      const { items, pagination } = fromPaginator(res);
      set({ applications: items, applicationsPagination: pagination });
      return items;
    }, 'Failed to load tax applications'),

    clearError: () => set({ error: null }),
  };
});

export default useTaxStore;
