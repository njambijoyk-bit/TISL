import api from './axios';

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

/**
 * Withholding tax API (admin).
 * Reads: finance, manager, admin, super_admin. Writes: finance, admin, super_admin.
 */
const withholdingAPI = {
  // ── Classifications ────────────────────────────────────────────────────
  getClassifications: async (params = {}) =>
    (await api.get('/admin/withholding/classifications', { params })).data,
  createClassification: async (data) =>
    (await api.post('/admin/withholding/classifications', data)).data,
  updateClassification: async (id, data) =>
    (await api.put(`/admin/withholding/classifications/${id}`, data)).data,
  deleteClassification: async (id) =>
    (await api.delete(`/admin/withholding/classifications/${id}`)).data,

  // ── Certificates (paginated list) ──────────────────────────────────────
  // params: { customer_id, status, page, per_page }
  getCertificates: async (params = {}) =>
    (await api.get('/admin/withholding/certificates', { params })).data,
  getCertificate: async (id) =>
    (await api.get(`/admin/withholding/certificates/${id}`)).data,
  /** Backfill/correction only — normally created automatically at payment. */
  createCertificate: async (data) =>
    (await api.post('/admin/withholding/certificates', data)).data,
  /** @param {File|null} document optional scanned certificate */
  markIssued: async (id, document = null) => {
    if (document) {
      const fd = new FormData();
      fd.append('document', document);
      return (await api.post(`/admin/withholding/certificates/${id}/mark-issued`, fd, multipart)).data;
    }
    return (await api.post(`/admin/withholding/certificates/${id}/mark-issued`)).data;
  },
  markReceived: async (id) =>
    (await api.post(`/admin/withholding/certificates/${id}/mark-received`)).data,

  // ── Credits (paginated list) ───────────────────────────────────────────
  // params: { customer_id, status, outstanding_only, page, per_page }
  getCredits: async (params = {}) =>
    (await api.get('/admin/withholding/credits', { params })).data,
  getCredit: async (id) =>
    (await api.get(`/admin/withholding/credits/${id}`)).data,
  /** Backfill only — normally created alongside the certificate. */
  createCredit: async (data) =>
    (await api.post('/admin/withholding/credits', data)).data,
  /** data: { amount, cleared_on?, reference?, notes? } */
  applyClearance: async (id, data) =>
    (await api.post(`/admin/withholding/credits/${id}/apply-clearance`, data)).data,
  writeOff: async (id, reason = null) =>
    (await api.post(`/admin/withholding/credits/${id}/write-off`, { reason })).data,
  getClearances: async (creditId) =>
    (await api.get(`/admin/withholding/credits/${creditId}/clearances`)).data,
};

export default withholdingAPI;
export { withholdingAPI };
