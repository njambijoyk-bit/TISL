import { create } from 'zustand';
import ticketsAPI from '../api/tickets';

const useTicketStore = create((set, get) => ({
  // ── State ──────────────────────────────────────
  tickets:       [],
  currentTicket: null,
  statistics:    null,
  pagination:    null,
  loading:       false,
  error:         null,

  // ── Customer Actions ───────────────────────────

  fetchMyTickets: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await ticketsAPI.getMyTickets(params);
      const items = response?.data && Array.isArray(response.data) ? response.data : [];
      const meta  = response?.meta || response;
      
      set({
        tickets: items,
        pagination: meta?.current_page ? {
          current_page: meta.current_page,
          last_page:    meta.last_page,
          per_page:     meta.per_page,
          total:        meta.total,
        } : null,
        loading: false,
      });
      return response;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to fetch tickets', loading: false });
      throw error;
    }
  },

  fetchMyTicket: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await ticketsAPI.getMyTicket(id);
      set({ currentTicket: response.ticket, loading: false });
      return response;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to fetch ticket', loading: false });
      throw error;
    }
  },

  createTicket: async (data) => {
    set({ loading: true, error: null });
    try {
      const response = await ticketsAPI.createTicket(data);
      set((state) => ({
        tickets: [response.ticket, ...state.tickets],
        loading: false,
      }));
      return response;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to create ticket', loading: false });
      throw error;
    }
  },

  customerReply: async (id, message) => {
    try {
      const response = await ticketsAPI.customerReply(id, message);
      set((state) => ({
        currentTicket: state.currentTicket
          ? {
              ...state.currentTicket,
              replies: [...(state.currentTicket.replies || []), response.reply],
            }
          : state.currentTicket,
      }));
      return response;
    } catch (error) {
      throw error;
    }
  },

  customerClose: async (id) => {
    try {
      const response = await ticketsAPI.customerClose(id);
      set((state) => ({
        currentTicket: state.currentTicket
          ? { ...state.currentTicket, status: 'closed' }
          : state.currentTicket,
      }));
      return response;
    } catch (error) {
      throw error;
    }
  },

  // ── Admin Actions ──────────────────────────────

  fetchAdminTickets: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await ticketsAPI.getAdminTickets(params);
      const items = response?.data && Array.isArray(response.data) ? response.data : [];
      const meta  = response?.meta || response;
      
      set({
        tickets: items,
        pagination: meta?.current_page ? {
          current_page: meta.current_page,
          last_page:    meta.last_page,
          per_page:     meta.per_page,
          total:        meta.total,
        } : null,
        loading: false,
      });
      return response;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to fetch tickets', loading: false });
      throw error;
    }
  },

  fetchStatistics: async () => {
    try {
      const response = await ticketsAPI.getStatistics();
      set({ statistics: response.statistics });
      return response;
    } catch (error) {
      throw error;
    }
  },

  fetchAdminTicket: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await ticketsAPI.getAdminTicket(id);
      set({ currentTicket: response.ticket, loading: false });
      return response;
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to fetch ticket', loading: false });
      throw error;
    }
  },

  updateTicket: async (id, data) => {
    try {
      const response = await ticketsAPI.updateTicket(id, data);
      set((state) => ({
        currentTicket: state.currentTicket?.id === id
          ? { ...state.currentTicket, ...response.ticket }
          : state.currentTicket,
        tickets: state.tickets.map((t) => t.id === id ? { ...t, ...response.ticket } : t),
      }));
      return response;
    } catch (error) {
      throw error;
    }
  },

  assignTicket: async (id, assigned_to) => {
    try {
      const response = await ticketsAPI.assignTicket(id, assigned_to);
      set((state) => ({
        currentTicket: state.currentTicket?.id === id
          ? { ...state.currentTicket, ...response.ticket }
          : state.currentTicket,
        tickets: state.tickets.map((t) => t.id === id ? { ...t, ...response.ticket } : t),
      }));
      return response;
    } catch (error) {
      throw error;
    }
  },

  unassignTicket: async (id) => {
    try {
      const response = await ticketsAPI.unassignTicket(id);
      set((state) => ({
        currentTicket: state.currentTicket?.id === id
          ? { ...state.currentTicket, assigned_to: null, assignedTo: null }
          : state.currentTicket,
        tickets: state.tickets.map((t) =>
          t.id === id ? { ...t, assigned_to: null, assignedTo: null } : t
        ),
      }));
      return response;
    } catch (error) {
      throw error;
    }
  },

  adminReply: async (id, data) => {
    try {
      const response = await ticketsAPI.adminReply(id, data);
      set((state) => ({
        currentTicket: state.currentTicket
          ? {
              ...state.currentTicket,
              replies: [...(state.currentTicket.replies || []), response.reply],
            }
          : state.currentTicket,
      }));
      return response;
    } catch (error) {
      throw error;
    }
  },

  softDelete: async (id) => {
    try {
      const response = await ticketsAPI.softDelete(id);
      set((state) => ({
        tickets: state.tickets.filter((t) => t.id !== id),
      }));
      return response;
    } catch (error) {
      throw error;
    }
  },

  restore: async (id) => {
    try {
      const response = await ticketsAPI.restore(id);
      set((state) => ({
        tickets: state.tickets.filter((t) => t.id !== id), // remove from trash view
      }));
      return response;
    } catch (error) {
      throw error;
    }
  },

  forceDelete: async (id) => {
    try {
      const response = await ticketsAPI.forceDelete(id);
      set((state) => ({
        tickets: state.tickets.filter((t) => t.id !== id),
      }));
      return response;
    } catch (error) {
      throw error;
    }
  },
}));

export default useTicketStore;
