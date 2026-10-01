import api from './axios';

const auctionsAPI = {
 // Admin: List auctions with filters & pagination
 listAdmin: async (params = {}) => {
   const response = await api.get('/admin/auctions', { params });
   return response.data;
 },

  // Admin: Get single auction details
  getAdminAuction: async (id) => {
    const response = await api.get(`/admin/auctions/${id}`);
    return response.data;
  },

  // Admin: Update auction
  updateAuction: async (id, data) => {
    const response = await api.put(`/admin/auctions/${id}`, data);
    return response.data;
  },

  // Admin: Delete auction (soft delete)
  deleteAuction: async (id) => {
    const response = await api.delete(`/admin/auctions/${id}`);
    return response.data;
  },

  // Admin: List trashed (soft-deleted) auctions
  listTrashed: async (params = {}) => {
    const response = await api.get('/admin/auctions/trashed', { params });
    return response.data;
  },

  // Admin: Restore a soft-deleted auction
  restoreAuction: async (id) => {
    const response = await api.post(`/admin/auctions/${id}/restore`);
    return response.data;
  },

  // Admin: Permanently delete an auction
  forceDeleteAuction: async (id) => {
    const response = await api.delete(`/admin/auctions/${id}/force`);
    return response.data;
  },

  // Public: Get active auctions
  getAllAuctions: async (params = {}) => {
    const response = await api.get('/auctions', { params });
    return response.data;
  },

  // Public: Get single auction details
  getAuction: async (id) => {
    const response = await api.get(`/auctions/${id}`);
    return response.data;
  },

  // Protected: Place a bid
  // acceptances: the policy agreements ticked with this action, e.g. [{ key: 'auction_terms', response: 'accepted' }]
  placeBid: async (auctionId, maxBid, acceptances = []) => {
    const response = await api.post(`/auctions/${auctionId}/bid`, { max_bid: maxBid, policy_acceptances: acceptances });
    return response.data;
  },

  // Public: what the winner would owe at a winning bid — bid, VAT, each charge, amount payable
  getQuote: async (auctionId, bid) => {
    const response = await api.get(`/auctions/${auctionId}/quote`, { params: { bid } });
    return response.data;
  },

  // Protected: registration for an auction that takes an entry fee / deposit
  getRegistration: async (auctionId) => {
    const response = await api.get(`/auctions/${auctionId}/registration`);
    return response.data;
  },
  register: async (auctionId, acceptances = []) => {
    const response = await api.post(`/auctions/${auctionId}/register`, { policy_acceptances: acceptances });
    return response.data;
  },

  // Admin: registrations and deposits
  listRegistrations: async (auctionId) => {
    const response = await api.get(`/admin/auctions/${auctionId}/registrations`);
    return response.data;
  },
  releaseDeposits: async (auctionId) => {
    const response = await api.post(`/admin/auctions/${auctionId}/release-deposits`);
    return response.data;
  },

  // Admin: the charge accounts an auction can pick from (amounts in the given currency)
  chargeOptions: async (currencyId) => {
    const response = await api.get('/admin/auctions/charge-options', { params: currencyId ? { currency_id: currencyId } : {} });
    return response.data;
  },

  // Admin: what a winner would owe at a given winning bid
  chargeQuote: async (auctionId, bid, days = 0) => {
    const response = await api.get(`/admin/auctions/${auctionId}/quote`, { params: { bid, days } });
    return response.data;
  },

  // Admin: Create auction
  createAuction: async (data) => {
    const response = await api.post('/admin/auctions', data);
    return response.data;
  },

  // Admin: make a Sales Order for the winner (books)
  createOrder: async (auctionId) => {
    const response = await api.post(`/admin/auctions/${auctionId}/create-order`);
    return response.data;
  },

  // Admin: end an active auction now (the highest bid wins if it meets the reserve)
  closeAuction: async (auctionId) => {
    const response = await api.post(`/admin/auctions/${auctionId}/close`);
    return response.data;
  },

  // Admin: Auction activity log
  getAuctionActivity: async (auctionId, params = {}) => {
    const response = await api.get(`/admin/auctions/${auctionId}/activity`, { params });
    return response.data;
  },
};

export default auctionsAPI;