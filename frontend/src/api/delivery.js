import api from './axios';

// ============================================================
// DELIVERY API
// Three audiences: admin, driver, customer
// ============================================================

const deliveryAPI = {

  // ========================================
  // ADMIN — MANIFESTS
  // ========================================

  getManifests: (params = {}) =>
    api.get('/admin/delivery/manifests', { params }).then(r => r.data),

  getManifest: (id) =>
    api.get(`/admin/delivery/manifests/${id}`).then(r => r.data),

  getManifestStatistics: () =>
    api.get('/admin/delivery/manifests/statistics').then(r => r.data),

  createManifest: (data) =>
    api.post('/admin/delivery/manifests', data).then(r => r.data),

  aiCreateManifest: (data) =>
    api.post('/admin/delivery/manifests/ai-create', data).then(r => r.data),

  aiAdvisory: (data) =>
    api.post('/admin/delivery/manifests/ai-generate', data).then(r => r.data),

  updateManifest: (id, data) =>
    api.patch(`/admin/delivery/manifests/${id}`, data).then(r => r.data),

  // Transfer items between manifests
  transferManifestItems: (data) =>
    api.post('/admin/delivery/manifests/transfer-items', data).then(r => r.data),

  deleteManifest: (id) =>
    api.delete(`/admin/delivery/manifests/${id}`).then(r => r.data),

  getActiveDrivers: () =>
    api.get('/admin/delivery/drivers').then(r => r.data),

  checkDriverSafety: (driverId, orderIds) =>
    api.post('/admin/delivery/drivers/check-safety', {
        driver_id: driverId,
        order_ids: orderIds,
    }).then(r => r.data),

  // Admin override item status for non-internal-driver manifests
  overrideExternalItemStatus: (manifestId, itemId, data) =>
      api.patch(`/admin/delivery/manifests/${manifestId}/items/${itemId}/override-external`, data).then(r => r.data),

  // Admin force-complete a manifest
  completeManifest: (id, data = {}) =>
      api.post(`/admin/delivery/manifests/${id}/complete`, data).then(r => r.data),

  deleteManifestIfEmpty: (manifestId) =>
    api.delete(`/admin/delivery/manifests/${manifestId}/force`).then(r => r.data),

  // ROUTE PLANNING
  getRoutePlan: (manifestId) =>
      api.get(`/admin/delivery/manifests/${manifestId}/route`).then(r => r.data),

  saveRoutePlan: (manifestId, data) =>
      api.post(`/admin/delivery/manifests/${manifestId}/route`, data).then(r => r.data),

  optimizeRoute: (manifestId, useAi = true) =>
      api.post(`/admin/delivery/manifests/${manifestId}/route/optimize`, { use_ai: useAi }).then(r => r.data),

  // Lifecycle
  dispatchManifest: (id) =>
    api.post(`/admin/delivery/manifests/${id}/dispatch`).then(r => r.data),

  cancelManifest: (id, reason) =>
    api.post(`/admin/delivery/manifests/${id}/cancel`, { reason }).then(r => r.data),

  reassignDriver: (id, data) =>
    api.post(`/admin/delivery/manifests/${id}/reassign-driver`, data).then(r => r.data),

  // Items
  addManifestItems: (id, order_ids) =>
    api.post(`/admin/delivery/manifests/${id}/items`, { order_ids }).then(r => r.data),

  removeManifestItem: (manifestId, itemId) =>
    api.delete(`/admin/delivery/manifests/${manifestId}/items/${itemId}`).then(r => r.data),

  // Print / export
  getManifestPrintData: (id) =>
    api.get(`/admin/delivery/manifests/${id}/print`).then(r => r.data),

  // AI manifest generation
  aiGenerateManifest: (data) =>
    api.post('/admin/delivery/manifests/ai-generate', data).then(r => r.data),

  // Pre-flight eligibility check — returns per-order eligible flag + reason + manifest_number
  checkOrderEligibility: (orderIds) =>
    api.post('/admin/delivery/orders/eligibility', { order_ids: orderIds }).then(r => r.data),

  // Returned items awaiting reassignment
  getReturnedItems: () =>
    api.get('/admin/delivery/manifests/returned-items').then(r => r.data),

  getFailedItems: () =>
    api.get('/admin/delivery/manifests/failed-items').then(r => r.data),
  
  // ========================================
  // ADMIN — SHIPMENTS
  // ========================================

  createShipment: (data) =>
    api.post('/admin/delivery/shipments', data).then(r => r.data),

  updateShipment: (id, data) =>
    api.patch(`/admin/delivery/shipments/${id}`, data).then(r => r.data),

  // ========================================
  // ADMIN — INCIDENTS
  // ========================================

  getIncidents: (params = {}) =>
    api.get('/admin/delivery/incidents', { params }).then(r => r.data),

  createIncident: (data) =>
    api.post('/admin/delivery/incidents', data).then(r => r.data),

  updateIncident: (id, data) =>
    api.patch(`/admin/delivery/incidents/${id}`, data).then(r => r.data),

  getManifestParticipants: (id) =>
    api.get(`/admin/delivery/manifests/${id}/participants`).then(r => r.data),

  createAdminIncident: (data) =>
      api.post('/admin/delivery/incidents/admin-report', data).then(r => r.data),
  
  // ========================================
  // ADMIN — RATINGS
  // ========================================

  getDriverRatings: (driverId, params = {}) =>
    api.get(`/admin/delivery/ratings/drivers/${driverId}`, { params }).then(r => r.data),

  adjustDriverRating: (driverId, data) =>
    api.post(`/admin/delivery/ratings/drivers/${driverId}/adjust`, data).then(r => r.data),

  toggleRatingVisibility: (ratingId) =>
    api.patch(`/admin/delivery/ratings/${ratingId}/visibility`).then(r => r.data),

  getFleetRatingKpis: () =>
    api.get('/admin/delivery/ratings/fleet-kpis').then(r => r.data),

  // ========================================
  // ADMIN — STATS
  // ========================================

  getDeliveryOverview: () =>
    api.get('/admin/delivery/stats/overview').then(r => r.data),

  getDriverPerformance: () =>
    api.get('/admin/delivery/stats/drivers').then(r => r.data),

  getDriverDetail: (driverId) =>
    api.get(`/admin/delivery/stats/drivers/${driverId}`).then(r => r.data),

  getDriverDetailWithAI: (driverId) =>
    api.get(`/admin/delivery/stats/drivers/${driverId}?include_ai=true`).then(r => r.data),

  getLocationTrail: (manifestId) =>
    api.get(`/admin/delivery/stats/manifests/${manifestId}/trail`).then(r => r.data),

  getDeliveryInsights: (entityType, entityId, params = {}) =>
      api.get(`/admin/delivery/insights/${entityType}${entityId ? `/${entityId}` : ''}`, { params }).then(r => r.data),

  getLatestDeliveryInsight: (entityType, entityId) =>
      api.get(`/admin/delivery/insights/${entityType}/${entityId}/latest`).then(r => r.data),
  // ========================================
  // DRIVER ENDPOINTS
  // ========================================

  // Manifests assigned to the authenticated driver
  getMyManifests: (params = {}) =>
    api.get('/driver/manifests', { params }).then(r => r.data),

  // Driver's own ratings
  getDriverOwnRatings: (params = {}) =>
    api.get('/driver/ratings', { params }).then(r => r.data),

  // Incidents the driver is allowed to see
  getDriverIncidents: () =>
    api.get('/driver/incidents').then(r => r.data),

  getMyManifest: (id) =>
    api.get(`/driver/manifests/${id}`).then(r => r.data),

  startTrip: (id, coords) =>
    api.post(`/driver/manifests/${id}/start`, {
      latitude: coords.lat,
      longitude: coords.lng,
    }).then(r => r.data),
  // GPS ping — called every 15s while trip is in_progress
  pingLocation: (data) =>
    api.post('/driver/ping', data).then(r => r.data),

  // Stop management
  updateStop: (itemId, data) => {
    // proof_of_delivery is a file — use FormData
    const form = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        form.append(key, value);
      }
    });
    return api.post(`/driver/stops/${itemId}/update`, form, {
        headers: {
            'Content-Type': undefined,  // Remove any default so browser sets it
        }
    }).then(r => r.data);
  },

  // Replace proof of delivery photo for a delivered stop
  updateStopProof: (itemId, file) => {
      const form = new FormData();
      form.append('proof_of_delivery', file);
      return api.post(`/driver/stops/${itemId}/update-proof`, form, {
          headers: { 'Content-Type': undefined },
      }).then(r => r.data);
  },

  retryStop: (itemId, data) => {
    const form = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        form.append(key, value);
      }
    });
    return api.post(`/driver/stops/${itemId}/retry`, form, {
      headers: { 'Content-Type': undefined },
    }).then(r => r.data);
  },

  fileDriverIncident: (data) =>
    api.post('/driver/incidents', data).then(r => r.data),

  // Driver's own ratings
  getMyRatings: (params = {}) =>
    api.get('/driver/ratings', { params }).then(r => r.data),

  // Driver
  getMyRatingSummary: () =>
      api.get('/driver/my-rating-summary').then(r => r.data),

  getMyPings: (manifestId) =>
    api.get(`/driver/manifests/${manifestId}/pings`).then(r => r.data),

  // DRIVER ROUTE
  getDriverRoute: (manifestId) =>
      api.get(`/driver/manifests/${manifestId}/route`).then(r => r.data),

  reorderStops: (manifestId, itemIds) =>
      api.post(`/driver/manifests/${manifestId}/route/reorder`, { item_ids: itemIds }).then(r => r.data),

  skipStop: (manifestId, itemId, reason) =>
      api.post(`/driver/manifests/${manifestId}/stops/${itemId}/skip`, { reason }).then(r => r.data),

  driverOptimizeRoute: (manifestId, coords = null) =>
    api.post(`/driver/manifests/${manifestId}/route/optimize`, {
      ...(coords && { current_lat: coords.lat, current_lng: coords.lng }),
    }).then(r => r.data),
  // ========================================
  // CUSTOMER ENDPOINTS
  // ========================================

  // Track shipment for their order
  getOrderShipment: (orderId) =>
    api.get(`/customer/delivery/orders/${orderId}/shipment`).then(r => r.data),

  // Rate a delivery
  rateDelivery: (data) =>
    api.post('/customer/delivery/ratings', data).then(r => r.data),

  // File an incident
  fileIncident: (data) =>
    api.post('/customer/delivery/incidents', data).then(r => r.data),

  getOrderTracking: (orderId) =>
    api.get(`/customer/delivery/orders/${orderId}/tracking`).then(r => r.data),
  
  getOrderPings: (orderId) => api.get(`/customer/delivery/orders/${orderId}/pings`),
  getManifestPings: (manifestId) => api.get(`/admin/delivery/manifests/${manifestId}/pings`),

    // View my ratings & incidents history
  getMyDriverRatings: (params = {}) =>
    api.get('/customer/delivery/my-ratings', { params }).then(r => r.data),

  // Customer
  getDriverRatingForOrder: (orderId) =>
      api.get(`/customer/delivery/orders/${orderId}/driver-rating`).then(r => r.data),

  getMyIncidents: (params = {}) =>
    api.get('/customer/delivery/my-incidents', { params }).then(r => r.data),
};

export default deliveryAPI;