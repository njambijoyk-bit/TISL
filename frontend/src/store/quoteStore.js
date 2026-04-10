import { create } from 'zustand';
import { quotesAPI } from '../api';

/**
 * Quote Store
 * Simple state management for quotes
 */
const useQuoteStore = create((set, get) => ({
  // ========================================
  // STATE
  // ========================================
  quotes: [],
  currentQuote: null,
  loading: false,
  error: null,

  // ========================================
  // ACTIONS
  // ========================================

  /**
   * Fetch all quotes (admin)
   */
  fetchQuotes: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await quotesAPI.getAllQuotes(params);
      set({
        quotes: response.data || response,
        loading: false,
      });
      return response;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch quotes',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Fetch single quote by ID
   */
  fetchQuoteById: async (id) => {
    // Guard against undefined, null, or invalid IDs
    if (!id || id === 'undefined' || id === 'null') {
      console.warn('Invalid quote ID provided:', id);
      set({ currentQuote: null, loading: false, error: null });
      return null;
    }

    set({ loading: true, error: null });
    try {
      const quote = await quotesAPI.getQuoteById(id);
      set({
        currentQuote: quote,
        loading: false,
      });
      return quote;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch quote',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Create quote from quote request
   */
  createFromRequest: async (requestId) => {
    // Validate requestId
    if (!requestId || requestId === 'undefined' || requestId === 'null') {
      const error = new Error('Invalid request ID');
      set({
        error: 'Invalid request ID provided',
        loading: false,
      });
      throw error;
    }

    set({ loading: true, error: null });
    try {
      const response = await quotesAPI.createFromRequest(requestId);
      set({
        currentQuote: response.quote,
        loading: false,
      });
      return response.quote;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to create quote',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Update quote
   */
  updateQuote: async (id, data) => {
    set({ loading: true, error: null });
    try {
      const response = await quotesAPI.updateQuote(id, data);
      set({
        currentQuote: response.quote,
        loading: false,
      });
      return response.quote;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to update quote',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Delete quote
   */
  deleteQuote: async (id) => {
    set({ loading: true, error: null });
    try {
      await quotesAPI.deleteQuote(id);
      set({
        quotes: get().quotes.filter(q => q.id !== id),
        currentQuote: null,
        loading: false,
      });
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to delete quote',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Send quote to customer
   */
  sendToCustomer: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await quotesAPI.sendToCustomer(id);
      set({
        currentQuote: response.quote,
        loading: false,
      });
      return response.quote;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to send quote',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Add item to quote
   */
  addItem: async (quoteId, itemData) => {
    set({ loading: true, error: null });
    try {
      const response = await quotesAPI.addItem(quoteId, itemData);
      set({
        currentQuote: response.quote,
        loading: false,
      });
      return response.item;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to add item',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Update quote item
   */
  updateItem: async (quoteId, itemId, data) => {
    set({ loading: true, error: null });
    try {
      const response = await quotesAPI.updateItem(quoteId, itemId, data);
      set({
        currentQuote: response.quote,
        loading: false,
      });
      return response.item;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to update item',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Delete quote item
   */
  deleteItem: async (quoteId, itemId) => {
    set({ loading: true, error: null });
    try {
      const response = await quotesAPI.deleteItem(quoteId, itemId);
      set({
        currentQuote: response.quote,
        loading: false,
      });
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to delete item',
        loading: false,
      });
      throw error;
    }
  },

  /**
   * Clear current quote
   */
  clearCurrentQuote: () => {
    set({ currentQuote: null });
  },

  /**
   * Clear error
   */
  clearError: () => {
    set({ error: null });
  },
}));

export default useQuoteStore;