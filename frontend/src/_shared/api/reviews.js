import api from './axios';

const reviewsAPI = {
  // ADMIN: Get all reviews
  getAllReviews: async (params = {}) => {
    const response = await api.get('/admin/reviews', { params });
    return response.data;
  },

  // ADMIN: Get review statistics
  getReviewStatistics: async () => {
    const response = await api.get('/admin/reviews/statistics');
    return response.data;
  },

  // ADMIN: Approve review
  approveReview: async (id) => {
    const response = await api.post(`/admin/reviews/${id}/approve`);
    return response.data;
  },

  // ADMIN: Reject review
  rejectReview: async (id) => {
    const response = await api.post(`/admin/reviews/${id}/reject`);
    return response.data;
  },

  // ADMIN: Delete review
  deleteReview: async (id) => {
    const response = await api.delete(`/admin/reviews/${id}`);
    return response.data;
  },
};

export default reviewsAPI;