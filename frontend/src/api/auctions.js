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
  placeBid: async (auctionId, maxBid) => {
    const response = await api.post(`/auctions/${auctionId}/bid`, { max_bid: maxBid });
    return response.data;
  },

  // Admin: Create auction
  createAuction: async (data) => {
    const response = await api.post('/admin/auctions', data);
    return response.data;
  },

  // Admin: Approve bids for an ended auction
  approveBids: async (auctionId, data) => {
    const response = await api.post(`/admin/auctions/${auctionId}/approve-bids`, data);
    return response.data;
  },

  // Admin: Auction activity log
  getAuctionActivity: async (auctionId, params = {}) => {
    const response = await api.get(`/admin/auctions/${auctionId}/activity`, { params });
    return response.data;
  },

  // Admin: Auction Orders
  listAuctionOrders: async (params = {}) => {
    const response = await api.get('/admin/auction-orders', { params });
    return response.data;
  },
  getAuctionOrder: async (id) => {
    const response = await api.get(`/admin/auction-orders/${id}`);
    return response.data;
  },
  updateAuctionOrderStatus: async (id, data) => {
    const response = await api.put(`/admin/auction-orders/${id}/status`, data);
    return response.data;
  },
  updateAuctionOrderPayment: async (id, data) => {
    const response = await api.put(`/admin/auction-orders/${id}/payment`, data);
    return response.data;
  },
  shipAuctionOrder: async (id, data) => {
    const response = await api.put(`/admin/auction-orders/${id}/ship`, data);
    return response.data;
  },
  cancelAuctionOrder: async (id, reason) => {
    const response = await api.post(`/admin/auction-orders/${id}/cancel`, { reason });
    return response.data;
  },
  restoreAuctionOrder: async (id, reason = null) => {
    const response = await api.post(`/admin/auction-orders/${id}/restore`, { reason });
    return response.data;
  },
  trashAuctionOrder: async (id) => {
    const response = await api.delete(`/admin/auction-orders/${id}`);
    return response.data;
  },
  listTrashedAuctionOrders: async (params = {}) => {
    const response = await api.get('/admin/auction-orders/trashed', { params });
    return response.data;
  },
  restoreAuctionOrderFromTrash: async (id) => {
    const response = await api.post(`/admin/auction-orders/${id}/restore-trash`);
    return response.data;
  },
  forceDeleteAuctionOrder: async (id) => {
    const response = await api.delete(`/admin/auction-orders/${id}/force`);
    return response.data;
  },
};

export default auctionsAPI;