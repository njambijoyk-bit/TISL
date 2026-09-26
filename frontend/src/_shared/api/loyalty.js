import api from './axios';

const unwrap = (res) => res.data;

const ADMIN = '/admin/loyalty';

const loyaltyAPI = {
  // List
  index:        (params)              => api.get(ADMIN, { params }).then(unwrap),

  // Customer detail + transactions
  show:         (customerId)          => api.get(`${ADMIN}/${customerId}`).then(unwrap),
  transactions: (customerId, params)  => api.get(`${ADMIN}/${customerId}/transactions`, { params }).then(unwrap),

  // Point actions
  grantPoints:  (customerId, data)    => api.post(`${ADMIN}/${customerId}/grant-points`,  data).then(unwrap),
  deductPoints: (customerId, data)    => api.post(`${ADMIN}/${customerId}/deduct-points`, data).then(unwrap),

  // Credit actions
  grantCredit:  (customerId, data)    => api.post(`${ADMIN}/${customerId}/grant-credit`,  data).then(unwrap),
  deductCredit: (customerId, data)    => api.post(`${ADMIN}/${customerId}/deduct-credit`, data).then(unwrap),

  // Redemption
  redeem:       (customerId, data)    => api.post(`${ADMIN}/${customerId}/redeem`, data).then(unwrap),

  // Settings
  getSettings:  ()                    => api.get(`${ADMIN}/settings`).then(unwrap),
  updateSettings: (data)              => api.put(`${ADMIN}/settings`, data).then(unwrap),
  upsertRule:   (data)                => api.post(`${ADMIN}/settings/rules`, data).then(unwrap),
  deleteRule:   (ruleId)              => api.delete(`${ADMIN}/settings/rules/${ruleId}`).then(unwrap),
};

export default loyaltyAPI;
