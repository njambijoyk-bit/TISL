import api from './axios';

/** Options, packages (variants) and requirements for services. */
const serviceCatalogAPI = {
  // Admin — one call returns everything the editor needs; every write returns the fresh catalog
  getCatalog: async (id) => (await api.get(`/admin/services/${id}/catalog`)).data,

  createOption: async (id, name) => (await api.post(`/admin/services/${id}/options`, { name })).data,
  updateOption: async (id, optionId, name) => (await api.put(`/admin/services/${id}/options/${optionId}`, { name })).data,
  deleteOption: async (id, optionId) => (await api.delete(`/admin/services/${id}/options/${optionId}`)).data,
  createValue: async (id, optionId, value) => (await api.post(`/admin/services/${id}/options/${optionId}/values`, { value })).data,
  deleteValue: async (id, optionId, valueId) => (await api.delete(`/admin/services/${id}/options/${optionId}/values/${valueId}`)).data,

  generateVariants: async (id) => (await api.post(`/admin/services/${id}/variants/generate`)).data,
  createVariant: async (id, data) => (await api.post(`/admin/services/${id}/variants`, data)).data,
  updateVariant: async (id, variantId, data) => (await api.put(`/admin/services/${id}/variants/${variantId}`, data)).data,
  deleteVariant: async (id, variantId) => (await api.delete(`/admin/services/${id}/variants/${variantId}`)).data,

  createRequirement: async (id, data) => (await api.post(`/admin/services/${id}/requirements`, data)).data,
  updateRequirement: async (id, reqId, data) => (await api.put(`/admin/services/${id}/requirements/${reqId}`, data)).data,
  deleteRequirement: async (id, reqId) => (await api.delete(`/admin/services/${id}/requirements/${reqId}`)).data,

  // Storefront — what a shopper can choose, with display-currency prices and tax
  getPackages: async (id) => (await api.get(`/services/${id}/packages`)).data,
};

export default serviceCatalogAPI;
