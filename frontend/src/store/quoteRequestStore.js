import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getMyQuoteRequests,
  getQuoteRequestById,
  createQuoteRequest,
  createQuoteRequestWithFiles,
  updateQuoteRequest,
  respondToClarification,
  getAdminQuoteRequests,
  getAdminQuoteRequestById,
  assignQuoteRequest,
  requestClarification,
  rejectQuoteRequest,
  convertToQuote,
  updatePriority,
  addAdminNotes,
  getQuoteRequestStatistics,
  updateQuoteRequestWithFiles,
} from '../api/quoteRequests';

/**
 * Quote Request Store
 * Manages quote request state for customer request workflow
 */
const useQuoteRequestStore = create(
  persist(
    (set, get) => ({
  // ========================================
  // STATE
  // ========================================

  // Quote requests list
  quoteRequests: [],
  currentQuoteRequest: null,

  // Pagination
  pagination: {
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  },

  // Filters
  filters: {
    status: null,
    search: '',
    sort_by: 'created_at',
    sort_order: 'desc',
    per_page: 20,
    page: 1,
  },

  // Admin filters
  adminFilters: {
    priority: null,
    request_type: null,
    assigned: null,
    requires_clarification: false,
  },

  // Statistics
  statistics: null,

  // Loading states
  loading: false,
  loadingCurrent: false,
  loadingStatistics: false,
  submitting: false,

  // Error handling
  error: null,

  // ── View preference (persisted) ───────────────────────────────────────────
  quoteRequestsView: 'card',   // 'card' | 'table'
  setQuoteRequestsView: (view) => set({ quoteRequestsView: view }),

  // ========================================
  // ACTIONS - CUSTOMER
  // ========================================

  /**
   * Fetch customer's quote requests
   */
  fetchMyQuoteRequests: async () => {
    set({ loading: true, error: null });
    try {
      const params = {
        ...get().filters,
        page: get().filters.page,
        per_page: get().filters.per_page,
      };
      const response = await getMyQuoteRequests(params);

      set({
        quoteRequests: response.data || response,
        pagination: {
          current_page: response.current_page || 1,
          last_page: response.last_page || 1,
          per_page: response.per_page || 20,
          total: response.total || response.length || 0,
        },
        loading: false,
      });
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch quote requests',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Fetch single quote request
   */
  fetchQuoteRequestById: async (id) => {
    set({ loadingCurrent: true, error: null });
    try {
      const quoteRequest = await getQuoteRequestById(id);
      set({
        currentQuoteRequest: quoteRequest,
        loadingCurrent: false,
      });
      return quoteRequest;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch quote request',
        loadingCurrent: false,
      });
      throw error;
    }
  },

  /**
   * Create new quote request
   */
  createQuoteRequest: async (data) => {
    set({ submitting: true, error: null });
    try {
      const response = await createQuoteRequest(data);

      // Add to list
      set(state => ({
        quoteRequests: [response.quote_request, ...state.quoteRequests],
        submitting: false,
      }));

      return response.quote_request;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to create quote request',
        submitting: false,
      });
      throw error;
    }
  },

  /**
   * Create quote request with file attachments
   */
  createQuoteRequestWithFiles: async (data, files) => {
    set({ submitting: true, error: null });
    try {
      const response = await createQuoteRequestWithFiles(data, files);

      // Add to list
      set(state => ({
        quoteRequests: [response.quote_request, ...state.quoteRequests],
        submitting: false,
      }));

      return response.quote_request;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to create quote request',
        submitting: false,
      });
      throw error;
    }
  },
  updateQuoteRequestWithFiles: async (id, data, files, removedIds) => {
  set({ submitting: true, error: null });
  try {
    const response = await updateQuoteRequestWithFiles(id, data, files, removedIds);

    set(state => ({
      quoteRequests: state.quoteRequests.map(qr => (qr.id === id ? response.quote_request : qr)),
      currentQuoteRequest: state.currentQuoteRequest?.id === id ? response.quote_request : state.currentQuoteRequest,
      submitting: false,
    }));

    return response.quote_request;
  } catch (error) {
    set({
      error: error.response?.data?.message || 'Failed to update quote request',
      submitting: false,
    });
    throw error;
  }
},


  /**
   * Update quote request
   */
  updateQuoteRequestWithFiles: async (id, data, files = [], removedPaths = []) => {
  set({ submitting: true, error: null });
  try {
    const response = await updateQuoteRequestWithFiles(id, data, files, removedPaths);

    set(state => ({
      quoteRequests: state.quoteRequests.map(qr =>
        qr.id === id ? response.quote_request : qr
      ),
      currentQuoteRequest: state.currentQuoteRequest?.id === id
        ? response.quote_request
        : state.currentQuoteRequest,
      submitting: false,
    }));

    return response.quote_request;
  } catch (error) {
    set({
      error: error.response?.data?.message || 'Failed to update quote request',
      submitting: false,
    });
    throw error;
  }
},


  /**
   * Respond to clarification request
   */
  respondToClarification: async (id, clarificationResponse) => {
    set({ submitting: true, error: null });
    try {
      const response = await respondToClarification(id, clarificationResponse);

      // Update in list
      set(state => ({
        quoteRequests: state.quoteRequests.map(qr =>
          qr.id === id ? response.quote_request : qr
        ),
        currentQuoteRequest: state.currentQuoteRequest?.id === id
          ? response.quote_request
          : state.currentQuoteRequest,
        submitting: false,
      }));

      return response.quote_request;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to submit clarification',
        submitting: false,
      });
      throw error;
    }
  },

  // ========================================
  // ACTIONS - ADMIN
  // ========================================

  /**
   * Fetch all quote requests (admin)
   */
  fetchAdminQuoteRequests: async () => {
    set({ loading: true, error: null });
    try {
      const params = {
        ...get().filters,
        ...get().adminFilters,
        page: get().filters.page,
        per_page: get().filters.per_page,
      };


      const response = await getAdminQuoteRequests(params);
      set({
        quoteRequests: response.data || response,
        pagination: {
          current_page: response.current_page || response.meta?.current_page || 1,
          last_page:    response.last_page    || response.meta?.last_page    || 1,
          per_page:     response.per_page     || response.meta?.per_page     || 20,
          total:        response.total        || response.meta?.total        || response.length || 0,
        },
        loading: false,
      });
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch quote requests',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Fetch single quote request (admin)
   */
  fetchAdminQuoteRequestById: async (id) => {
    set({ loadingCurrent: true, error: null });
    try {
      const quoteRequest = await getAdminQuoteRequestById(id);
      set({
        currentQuoteRequest: quoteRequest,
        loadingCurrent: false,
      });
      return quoteRequest;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch quote request',
        loadingCurrent: false,
      });
      throw error;
    }
  },

  /**
   * Assign quote request to admin
   */
  assignQuoteRequest: async (id, adminId) => {
    set({ submitting: true, error: null });
    try {
      const response = await assignQuoteRequest(id, adminId);

      // Update in list
      set(state => ({
        quoteRequests: state.quoteRequests.map(qr =>
          qr.id === id ? response.quote_request : qr
        ),
        currentQuoteRequest: state.currentQuoteRequest?.id === id
          ? response.quote_request
          : state.currentQuoteRequest,
        submitting: false,
      }));

      return response.quote_request;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to assign quote request',
        submitting: false,
      });
      throw error;
    }
  },

  /**
   * Request clarification from customer
   */
  requestClarification: async (id, notes) => {
    set({ submitting: true, error: null });
    try {
      const response = await requestClarification(id, notes);

      // Update in list
      set(state => ({
        quoteRequests: state.quoteRequests.map(qr =>
          qr.id === id ? response.quote_request : qr
        ),
        currentQuoteRequest: state.currentQuoteRequest?.id === id
          ? response.quote_request
          : state.currentQuoteRequest,
        submitting: false,
      }));

      return response.quote_request;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to request clarification',
        submitting: false,
      });
      throw error;
    }
  },

  /**
   * Reject quote request
   */
  rejectQuoteRequest: async (id, reason) => {
    set({ submitting: true, error: null });
    try {
      const response = await rejectQuoteRequest(id, reason);

      // Update in list
      set(state => ({
        quoteRequests: state.quoteRequests.map(qr =>
          qr.id === id ? response.quote_request : qr
        ),
        currentQuoteRequest: state.currentQuoteRequest?.id === id
          ? response.quote_request
          : state.currentQuoteRequest,
        submitting: false,
      }));

      return response.quote_request;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to reject quote request',
        submitting: false,
      });
      throw error;
    }
  },

  /**
   * Convert quote request to quote
   */
  convertToQuote: async (id) => {
    set({ submitting: true, error: null });
    try {
      const response = await convertToQuote(id);
      set({ submitting: false });
      return response;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to convert to quote',
        submitting: false,
      });
      throw error;
    }
  },

  /**
   * Update priority
   */
  updatePriority: async (id, priority) => {
    set({ submitting: true, error: null });
    try {
      const response = await updatePriority(id, priority);

      // Update in list
      set(state => ({
        quoteRequests: state.quoteRequests.map(qr =>
          qr.id === id ? response.quote_request : qr
        ),
        currentQuoteRequest: state.currentQuoteRequest?.id === id
          ? response.quote_request
          : state.currentQuoteRequest,
        submitting: false,
      }));

      return response.quote_request;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to update priority',
        submitting: false,
      });
      throw error;
    }
  },

  /**
   * Add admin notes
   */
  addAdminNotes: async (id, notes) => {
    set({ submitting: true, error: null });
    try {
      const response = await addAdminNotes(id, notes);

      // Update in list
      set(state => ({
        quoteRequests: state.quoteRequests.map(qr =>
          qr.id === id ? response.quote_request : qr
        ),
        currentQuoteRequest: state.currentQuoteRequest?.id === id
          ? response.quote_request
          : state.currentQuoteRequest,
        submitting: false,
      }));

      return response.quote_request;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to add notes',
        submitting: false,
      });
      throw error;
    }
  },

  /**
   * Fetch statistics
   */
  fetchStatistics: async () => {
    set({ loadingStatistics: true, error: null });
    try {
      const stats = await getQuoteRequestStatistics();
      set({
        statistics: stats,
        loadingStatistics: false,
      });
      return stats;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch statistics',
        loadingStatistics: false,
      });
      throw error;
    }
  },

  // ========================================
  // FILTER ACTIONS
  // ========================================

  /**
   * Set filters
   */
  setFilters: (newFilters) => {
    set(state => ({
      filters: { ...state.filters, ...newFilters, page: 1 }
    }));
  },

  /**
   * Set admin filters
   */
  setAdminFilters: (newFilters) => {
    set(state => ({
      adminFilters: { ...state.adminFilters, ...newFilters }
    }));
  },

  /**
   * Reset filters
   */
  resetFilters: () => {
    set({
      filters: {
        status: null,
        search: '',
        sort_by: 'created_at',
        sort_order: 'desc',
        per_page: 20,
        page: 1,
      },
      adminFilters: {
        priority: null,
        request_type: null,
        assigned: null,
        requires_clarification: false,
      },
    });
  },

  /**
   * Set page
   */
  setPage: (page) => {
    set(state => ({
      filters: { ...state.filters, page }
    }));
  },

  /**
   * Set search
   */
  setSearch: (search) => {
    set(state => ({
      filters: { ...state.filters, search, page: 1 }
    }));
  },

  /**
   * Set status filter
   */
  setStatus: (status) => {
    set(state => ({
      filters: { ...state.filters, status, page: 1 }
    }));
  },

  // ========================================
  // UTILITY ACTIONS
  // ========================================

  /**
   * Clear current quote request
   */
  clearCurrentQuoteRequest: () => {
    set({ currentQuoteRequest: null });
  },

  /**
   * Clear error
   */
  clearError: () => {
    set({ error: null });
  },

  /**
   * Reset store
   */
  reset: () => {
    set({
      quoteRequests: [],
      currentQuoteRequest: null,
      pagination: {
        current_page: 1,
        last_page: 1,
        per_page: 20,
        total: 0,
      },
      filters: {
        status: null,
        search: '',
        sort_by: 'created_at',
        sort_order: 'desc',
        per_page: 20,
        page: 1,
      },
      adminFilters: {
        priority: null,
        request_type: null,
        assigned: null,
        requires_clarification: false,
      },
      statistics: null,
      loading: false,
      loadingCurrent: false,
      loadingStatistics: false,
      submitting: false,
      error: null,
    });
  },
    }),
    {
      name: 'quote-request-storage',
      partialize: (state) => ({ quoteRequestsView: state.quoteRequestsView }),
    }
  )
);

export default useQuoteRequestStore;