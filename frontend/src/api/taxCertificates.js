import api from './axios';

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

/** Build FormData, skipping null/undefined; File values pass through. */
const toFormData = (data) => {
  const fd = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    fd.append(key, value);
  });
  return fd;
};

/**
 * Tax legitimacy certificates — exemption & withholding-agent certificates.
 * Reads: finance, manager, admin, super_admin. Writes: finance, admin, super_admin.
 */
const taxCertificatesAPI = {
  // params: { holder_type: 'customer', holder_id, certificate_type, status, page, per_page }
  getAll: async (params = {}) =>
    (await api.get('/admin/tax-legitimacy-certificates', { params })).data,
  get: async (id) =>
    (await api.get(`/admin/tax-legitimacy-certificates/${id}`)).data,

  /**
   * data: { holder_type, holder_id, certificate_type: 'exemption' | 'withholding_agent',
   *         certificate_number, issuing_authority?, classification?, issued_at,
   *         valid_until?, document?: File }
   * Always created as pending_verification.
   */
  create: async (data) =>
    (await api.post('/admin/tax-legitimacy-certificates', toFormData(data), multipart)).data,

  /** data: { issuing_authority?, classification?, valid_until?, document?: File } */
  update: async (id, data) => {
    const fd = toFormData(data);
    fd.append('_method', 'PUT'); // multipart can't be sent as a real PUT to PHP
    return (await api.post(`/admin/tax-legitimacy-certificates/${id}`, fd, multipart)).data;
  },

  remove: async (id) =>
    (await api.delete(`/admin/tax-legitimacy-certificates/${id}`)).data,
  verify: async (id) =>
    (await api.post(`/admin/tax-legitimacy-certificates/${id}/verify`)).data,
  revoke: async (id, reason = null) =>
    (await api.post(`/admin/tax-legitimacy-certificates/${id}/revoke`, { reason })).data,
};

export default taxCertificatesAPI;
export { taxCertificatesAPI };
