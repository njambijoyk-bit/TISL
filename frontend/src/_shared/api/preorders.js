import api from './axios';

const preordersAPI = {
  // --- the shop window (public)
  /** { location_id, data: { [variantId]: { state: buy|preorder|coming_soon|out, buyable, offer } } } */
  states: (variantIds, locationId) => api.get('/preorders/states', { params: { variant_ids: variantIds, location_id: locationId || undefined } }).then((r) => r.data),
  /** { products: { [productId]: { state, variant_id, offer } } } for product cards */
  productStates: (productIds, locationId) => api.get('/preorders/states', { params: { product_ids: productIds, location_id: locationId || undefined } }).then((r) => r.data),

  /** { [hamperId]: { state: buy|preorder|coming_soon|out, offer, blocked } } judged from the hamper's components at the hamper's own branch */
  hamperStates: (hamperIds) => api.get('/preorders/states', { params: { hamper_ids: hamperIds } }).then((r) => r.data.hampers ?? {}),

  // --- a campaign's offers
  variants: (productId) => api.get('/admin/campaigns/preorder-variants', { params: { product_id: productId } }).then((r) => r.data),
  hamperReadiness: (campaignId) => api.get(`/admin/campaigns/${campaignId}/hamper-readiness`).then((r) => r.data),
  offers: (campaignId) => api.get(`/admin/campaigns/${campaignId}/preorder-offers`).then((r) => r.data),
  saveOffer: (campaignId, d) => api.post(`/admin/campaigns/${campaignId}/preorder-offers`, d).then((r) => r.data),
  updateOffer: (campaignId, id, d) => api.put(`/admin/campaigns/${campaignId}/preorder-offers/${id}`, d).then((r) => r.data),
  deleteOffer: (campaignId, id) => api.delete(`/admin/campaigns/${campaignId}/preorder-offers/${id}`).then((r) => r.data),

  // --- branches, waiting, counter
  branches: (variantId) => api.get('/admin/preorders/branches', { params: { variant_id: variantId } }).then((r) => r.data),
  setBranchFlag: (d) => api.put('/admin/preorders/branch-flag', d).then((r) => r.data),
  waiting: (locationId) => api.get('/admin/preorders/waiting', { params: { location_id: locationId || undefined } }).then((r) => r.data),
  deliver: (d = {}) => api.post('/admin/preorders/deliver', d).then((r) => r.data),
  send: (d) => api.post('/admin/preorders/send', d).then((r) => r.data),
  open: (locationId) => api.get('/admin/preorders/open', { params: { location_id: locationId } }).then((r) => r.data),
  // --- customers asking to cancel a paid preorder
  cancelRequests: () => api.get('/admin/preorders/cancel-requests').then((r) => r.data),
  approveCancel: (orderId, d = {}) => api.post(`/admin/preorders/cancel-requests/${orderId}/approve`, d).then((r) => r.data),
  declineCancel: (orderId, note) => api.post(`/admin/preorders/cancel-requests/${orderId}/decline`, { note }).then((r) => r.data),
  counter: (d) => api.post('/admin/preorders/counter', d).then((r) => r.data),
  customers: (search) => api.get('/admin/preorders/customers', { params: { search } }).then((r) => r.data),
};

export default preordersAPI;
