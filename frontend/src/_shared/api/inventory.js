import api from './axios';

const unwrap = (res) => res.data;
const BASE = '/admin/inventory';

const inventoryAPI = {

  // =========================================================================
  // CATEGORIES
  // =========================================================================
  categories: {
    index:   (params) => api.get(`${BASE}/categories`, { params }).then(unwrap),
    store:   (data)   => api.post(`${BASE}/categories`, data).then(unwrap),
    update:  (id, data) => api.put(`${BASE}/categories/${id}`, data).then(unwrap),
    destroy: (id)     => api.delete(`${BASE}/categories/${id}`).then(unwrap),
  },

  // =========================================================================
  // LOCATIONS
  // =========================================================================
  locations: {
    index:   (params) => api.get(`${BASE}/locations`, { params }).then(unwrap),
    store:   (data)   => api.post(`${BASE}/locations`, data).then(unwrap),
    update:  (id, data) => api.put(`${BASE}/locations/${id}`, data).then(unwrap),
    destroy: (id)     => api.delete(`${BASE}/locations/${id}`).then(unwrap),
  },

  // =========================================================================
  // ITEMS  (catalogue entries)
  // =========================================================================
  items: {
    index:   (params) => api.get(`${BASE}/items`, { params }).then(unwrap),
    show:    (id)     => api.get(`${BASE}/items/${id}`).then(unwrap),
    store:   (data)   => api.post(`${BASE}/items`, data).then(unwrap),
    update:  (id, data) => api.put(`${BASE}/items/${id}`, data).then(unwrap),
    destroy: (id)     => api.delete(`${BASE}/items/${id}`).then(unwrap),
    syncProducts: (params) => api.post(`${BASE}/items/sync-products`, params).then(unwrap),
  },

  // =========================================================================
  // INSTANCES  (physical serialized units)
  // =========================================================================
  instances: {
    index:           (params)   => api.get(`${BASE}/instances`, { params }).then(unwrap),
    show:            (id)       => api.get(`${BASE}/instances/${id}`).then(unwrap),
    store:           (data)     => api.post(`${BASE}/instances`, data).then(unwrap),
    update:          (id, data) => api.put(`${BASE}/instances/${id}`, data).then(unwrap),
    destroy:         (id)       => api.delete(`${BASE}/instances/${id}`).then(unwrap),

    // Sub-resources
    ledger:          (id)       => api.get(`${BASE}/instances/${id}/ledger`).then(unwrap),
    locationHistory: (id)       => api.get(`${BASE}/instances/${id}/location-history`).then(unwrap),

    // Actions
    move:            (id, data) => api.post(`${BASE}/instances/${id}/move`, data).then(unwrap),
    declareObsolete: (id, data) => api.post(`${BASE}/instances/${id}/declare-obsolete`, data).then(unwrap),
    writeOff:        (id, data) => api.post(`${BASE}/instances/${id}/write-off`, data).then(unwrap),
    dispose:         (id, data) => api.post(`${BASE}/instances/${id}/dispose`, data).then(unwrap),
  },

  // =========================================================================
  // ASSIGNMENTS
  // =========================================================================
  assignments: {
    index:       (params) => api.get(`${BASE}/assignments`, { params }).then(unwrap),
    show:        (id)     => api.get(`${BASE}/assignments/${id}`).then(unwrap),

    // Issue / loan / allocate
    issue:       (data)   => api.post(`${BASE}/assignments/issue`, data).then(unwrap),
    loan:        (data)   => api.post(`${BASE}/assignments/loan`, data).then(unwrap),
    department:  (data)   => api.post(`${BASE}/assignments/department`, data).then(unwrap),
    group:       (data)   => api.post(`${BASE}/assignments/group`, data).then(unwrap),

    // Return
    return:      (id, data) => api.post(`${BASE}/assignments/${id}/return`, data).then(unwrap),

    // Scheduled / manual overdue sweep
    markOverdue: ()       => api.post(`${BASE}/assignments/mark-overdue`).then(unwrap),
  },

  // =========================================================================
  // GROUPS
  // =========================================================================
  groups: {
    index:        (params)         => api.get(`${BASE}/groups`, { params }).then(unwrap),
    store:        (data)           => api.post(`${BASE}/groups`, data).then(unwrap),
    update:       (id, data)       => api.put(`${BASE}/groups/${id}`, data).then(unwrap),
    destroy:      (id)             => api.delete(`${BASE}/groups/${id}`).then(unwrap),
    addMember:    (id, data)       => api.post(`${BASE}/groups/${id}/members`, data).then(unwrap),
    removeMember: (id, memberId)   => api.delete(`${BASE}/groups/${id}/members/${memberId}`).then(unwrap),
  },

  // =========================================================================
  // REPAIRS
  // =========================================================================
  repairs: {
    index:        (params)   => api.get(`${BASE}/repairs`, { params }).then(unwrap),
    show:         (id)       => api.get(`${BASE}/repairs/${id}`).then(unwrap),
    report:       (data)     => api.post(`${BASE}/repairs`, data).then(unwrap),
    send:         (id, data) => api.post(`${BASE}/repairs/${id}/send`, data).then(unwrap),
    complete:     (id, data) => api.post(`${BASE}/repairs/${id}/complete`, data).then(unwrap),
    unrepairable: (id, data) => api.post(`${BASE}/repairs/${id}/unrepairable`, data).then(unwrap),
  },

  // =========================================================================
  // DISPUTES
  // =========================================================================
  disputes: {
    index:  (params)   => api.get(`${BASE}/disputes`, { params }).then(unwrap),
    show:   (id)       => api.get(`${BASE}/disputes/${id}`).then(unwrap),
    open:   (data)     => api.post(`${BASE}/disputes`, data).then(unwrap),
    rule:   (id, data) => api.post(`${BASE}/disputes/${id}/rule`, data).then(unwrap),
  },

  // =========================================================================
  // RETURN AUDITS
  // =========================================================================
  audits: {
    index:      (params)              => api.get(`${BASE}/audits`, { params }).then(unwrap),
    show:       (id)                  => api.get(`${BASE}/audits/${id}`).then(unwrap),
    create:     (data)                => api.post(`${BASE}/audits`, data).then(unwrap),
    recordItem: (auditId, itemId, data) => api.put(`${BASE}/audits/${auditId}/items/${itemId}`, data).then(unwrap),
    finalise:   (id, data)            => api.post(`${BASE}/audits/${id}/finalise`, data).then(unwrap),
  },

  // =========================================================================
  // LIFECYCLE LEDGER  (read-only, item-level)
  // =========================================================================
  ledger: {
    index: (params) => api.get(`${BASE}/ledger`, { params }).then(unwrap),
  },

  // =========================================================================
  // EXPORT
  // =========================================================================
  export: {
    run:            (data)   => api.post(`${BASE}/export/run`, data).then(unwrap),
    logs:           (params) => api.get(`${BASE}/export/logs`, { params }).then(unwrap),
    presets:        (params) => api.get(`${BASE}/export/presets`, { params }).then(unwrap),
    savePreset:     (data)   => api.post(`${BASE}/export/presets`, data).then(unwrap),
    deletePreset:   (id)     => api.delete(`${BASE}/export/presets/${id}`).then(unwrap),
  },

};

export default inventoryAPI;