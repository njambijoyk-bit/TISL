import api from './axios';

const unwrap = (res) => res.data;
const BASE = '/customer/loyalty';

const customerLoyaltyAPI = {
  myBalance:      ()       => api.get(BASE).then(unwrap),
  myTransactions: (params) => api.get(`${BASE}/transactions`, { params }).then(unwrap),
  selfRedeem:     (data)   => api.post(`${BASE}/redeem`, data).then(unwrap),
};

export default customerLoyaltyAPI;