import { create } from 'zustand';
import withholdingAPI from '../api/withholding';
import {
  createRunners, emptyPagination, fromPaginator, upsertById, removeById, cleanParams,
} from './helpers/apiState';

/**
 * Withholding tax: classifications, certificates (proof of each deduction),
 * credits (the claimable side) and their clearances.
 */
const useWithholdingStore = create((set, get) => {
  const { act, load } = createRunners(set, get);

  /** Keep the open detail record in sync with a list update. */
  const syncCredit = (credit) => {
    if (!credit) return;
    set({
      credits: upsertById(get().credits, credit),
      currentCredit: get().currentCredit?.id === credit.id ? { ...get().currentCredit, ...credit } : get().currentCredit,
    });
  };

  const syncCertificate = (certificate) => {
    if (!certificate) return;
    set({
      certificates: upsertById(get().certificates, certificate),
      currentCertificate: get().currentCertificate?.id === certificate.id
        ? { ...get().currentCertificate, ...certificate }
        : get().currentCertificate,
    });
  };

  return {
    // ── State ────────────────────────────────────────────────────────────
    classifications: [],
    certificates: [],
    certificatesPagination: { ...emptyPagination },
    currentCertificate: null,
    credits: [],
    creditsPagination: { ...emptyPagination },
    currentCredit: null,
    clearances: [],

    loading: {
      classifications: false, certificates: false, certificate: false,
      credits: false, credit: false, clearances: false,
    },
    actionLoading: false,
    error: null,

    // ── Classifications ──────────────────────────────────────────────────
    fetchClassifications: (params = {}) => load('classifications', async () => {
      const res = await withholdingAPI.getClassifications(cleanParams(params));
      set({ classifications: res.classifications ?? [] });
      return res.classifications;
    }, 'Failed to load classifications'),

    /** data: { code, label, default_tax_rate_id?, is_active? } */
    createClassification: (data) => act(async () => {
      const res = await withholdingAPI.createClassification(data);
      set({ classifications: upsertById(get().classifications, res.classification) });
      return res.classification;
    }, 'Failed to create classification'),

    updateClassification: (id, data) => act(async () => {
      const res = await withholdingAPI.updateClassification(id, data);
      set({ classifications: upsertById(get().classifications, res.classification) });
      return res.classification;
    }, 'Failed to update classification'),

    deleteClassification: (id) => act(async () => {
      await withholdingAPI.deleteClassification(id);
      set({ classifications: removeById(get().classifications, id) });
    }, 'Failed to delete classification'),

    // ── Certificates ─────────────────────────────────────────────────────
    /** params: { customer_id, status, page, per_page } */
    fetchCertificates: (params = {}) => load('certificates', async () => {
      const res = await withholdingAPI.getCertificates(cleanParams(params));
      const { items, pagination } = fromPaginator(res);
      set({ certificates: items, certificatesPagination: pagination });
      return items;
    }, 'Failed to load withholding certificates'),

    fetchCertificate: (id) => load('certificate', async () => {
      const res = await withholdingAPI.getCertificate(id);
      set({ currentCertificate: res.certificate });
      return res.certificate;
    }, 'Failed to load certificate'),

    /** Backfill/correction only. */
    createCertificate: (data) => act(async () => {
      const res = await withholdingAPI.createCertificate(data);
      syncCertificate(res.certificate);
      return res.certificate;
    }, 'Failed to create certificate'),

    markIssued: (id, document = null) => act(async () => {
      const res = await withholdingAPI.markIssued(id, document);
      syncCertificate(res.certificate);
      return res.certificate;
    }, 'Failed to mark certificate issued'),

    markReceived: (id) => act(async () => {
      const res = await withholdingAPI.markReceived(id);
      syncCertificate(res.certificate);
      return res.certificate;
    }, 'Failed to mark certificate received'),

    // ── Credits ──────────────────────────────────────────────────────────
    /** params: { customer_id, status, outstanding_only, page, per_page } */
    fetchCredits: (params = {}) => load('credits', async () => {
      const res = await withholdingAPI.getCredits(cleanParams(params));
      const { items, pagination } = fromPaginator(res);
      set({ credits: items, creditsPagination: pagination });
      return items;
    }, 'Failed to load withholding credits'),

    fetchCredit: (id) => load('credit', async () => {
      const res = await withholdingAPI.getCredit(id);
      set({ currentCredit: res.credit, clearances: res.credit?.clearances ?? [] });
      return res.credit;
    }, 'Failed to load credit'),

    /** Backfill only. */
    createCredit: (data) => act(async () => {
      const res = await withholdingAPI.createCredit(data);
      syncCredit(res.credit);
      return res.credit;
    }, 'Failed to create credit'),

    /** data: { amount, cleared_on?, reference?, notes? } */
    applyClearance: (id, data) => act(async () => {
      const res = await withholdingAPI.applyClearance(id, data);
      syncCredit(res.credit);
      if (get().currentCredit?.id === id) set({ clearances: [res.clearance, ...get().clearances] });
      return res;
    }, 'Failed to apply clearance'),

    writeOff: (id, reason = null) => act(async () => {
      const res = await withholdingAPI.writeOff(id, reason);
      syncCredit(res.credit);
      return res.credit;
    }, 'Failed to write off credit'),

    fetchClearances: (creditId) => load('clearances', async () => {
      const res = await withholdingAPI.getClearances(creditId);
      set({ clearances: res.clearances ?? [] });
      return res.clearances;
    }, 'Failed to load clearances'),

    clearCurrent: () => set({ currentCertificate: null, currentCredit: null, clearances: [] }),
    clearError: () => set({ error: null }),
  };
});

export default useWithholdingStore;
