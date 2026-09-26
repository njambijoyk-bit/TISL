import { create } from 'zustand';
import taxCertificatesAPI from '../api/taxCertificates';
import {
  createRunners, emptyPagination, fromPaginator, upsertById, removeById, cleanParams,
} from './helpers/apiState';

/**
 * Tax legitimacy certificates (exemption / withholding-agent).
 * Lifecycle: pending_verification → verified → revoked.
 */
const useTaxCertificateStore = create((set, get) => {
  const { act, load } = createRunners(set, get);

  const sync = (certificate) => {
    if (!certificate) return;
    set({
      certificates: upsertById(get().certificates, certificate),
      current: get().current?.id === certificate.id ? { ...get().current, ...certificate } : get().current,
    });
  };

  return {
    certificates: [],
    pagination: { ...emptyPagination },
    current: null,
    filters: { holder_type: '', holder_id: '', certificate_type: '', status: '', page: 1 },

    loading: { list: false, current: false },
    actionLoading: false,
    error: null,

    // ── Selectors ────────────────────────────────────────────────────────
    isPending:  (c) => c?.status === 'pending_verification',
    isVerified: (c) => c?.status === 'verified',

    setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),
    resetFilters: () => set({ filters: { holder_type: '', holder_id: '', certificate_type: '', status: '', page: 1 } }),

    fetchCertificates: (params = {}) => load('list', async () => {
      const res = await taxCertificatesAPI.getAll(cleanParams({ ...get().filters, ...params }));
      const { items, pagination } = fromPaginator(res);
      set({ certificates: items, pagination });
      return items;
    }, 'Failed to load certificates'),

    /** Loads holder, verifier, linked overrides and withholding certificates. */
    fetchCertificate: (id) => load('current', async () => {
      const res = await taxCertificatesAPI.get(id);
      set({ current: res.certificate });
      return res.certificate;
    }, 'Failed to load certificate'),

    /** Customer's certificates, e.g. for an exemption dropdown. */
    fetchForHolder: (holderType, holderId) => load('list', async () => {
      const res = await taxCertificatesAPI.getAll({ holder_type: holderType, holder_id: holderId, per_page: 100 });
      const { items, pagination } = fromPaginator(res);
      set({ certificates: items, pagination });
      return items;
    }, 'Failed to load certificates'),

    /** document may be a File. Created as pending_verification. */
    createCertificate: (data) => act(async () => {
      const res = await taxCertificatesAPI.create(data);
      set({ certificates: [res.certificate, ...get().certificates] });
      return res.certificate;
    }, 'Failed to create certificate'),

    updateCertificate: (id, data) => act(async () => {
      const res = await taxCertificatesAPI.update(id, data);
      sync(res.certificate);
      return res.certificate;
    }, 'Failed to update certificate'),

    verifyCertificate: (id) => act(async () => {
      const res = await taxCertificatesAPI.verify(id);
      sync(res.certificate);
      return res.certificate;
    }, 'Failed to verify certificate'),

    revokeCertificate: (id, reason = null) => act(async () => {
      const res = await taxCertificatesAPI.revoke(id, reason);
      sync(res.certificate);
      return res.certificate;
    }, 'Failed to revoke certificate'),

    /** Verified certificates can't be deleted — revoke instead (server returns 422). */
    deleteCertificate: (id) => act(async () => {
      await taxCertificatesAPI.remove(id);
      set({
        certificates: removeById(get().certificates, id),
        current: get().current?.id === id ? null : get().current,
      });
    }, 'Failed to delete certificate'),

    clearCurrent: () => set({ current: null }),
    clearError: () => set({ error: null }),
  };
});

export default useTaxCertificateStore;
