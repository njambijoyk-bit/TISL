import { create } from 'zustand';
import referralsAPI from '../api/referrals';

const useReferralsStore = create((set, get) => ({
  // State
  codes:       [],
  currentCode: null,
  statistics:  null,
  analytics:   null,
  pagination:  { total: 0, per_page: 20, current_page: 1, last_page: 1 },
  filters: {
    search:      '',
    type:        '',
    status:      '',
    reward_type: '',
    public:      false,
    expiring:    false,
    sort_by:     'created_at',
    sort_order:  'desc',
    per_page:    20,
    page:        1,
  },
  loading:       false,
  actionLoading: false,
  error:         null,

  // Filter setters
  setFilter: (key, value) =>
    set(s => ({ filters: { ...s.filters, [key]: value, page: 1 } })),

  setFilter: (key, value) =>
    set(s => ({
      filters: {
        ...s.filters,
        [key]: value,
        // ✅ Only reset page to 1 if we're NOT changing the page itself
        ...(key !== 'page' && { page: 1 }),
      },
    })),

  resetFilters: () =>
    set(s => ({
      filters: {
        ...s.filters,
        search: '', type: '', status: '', reward_type: '',
        public: false, expiring: false, page: 1,
      },
    })),

  // ── Fetch ────────────────────────────────────────────
  fetchCodes: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const params = referralsAPI.buildParams(get().filters);
      const data   = await referralsAPI.getAll(params);
      set({
        codes: data.data,
        pagination: {
          total:        data.total,
          per_page:     data.per_page,
          current_page: data.current_page,
          last_page:    data.last_page,
        },
      });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load referral codes.' });
    } finally {
      set({ loading: false });
    }
  },

  fetchStatistics: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const data = await referralsAPI.getStatistics();
      set({ statistics: data });
    } catch {}
  },

  fetchAnalytics: async (days = 30) => {
    try {
      const data = await referralsAPI.getAnalytics(days);
      set({ analytics: data });
    } catch {}
  },

  fetchCodeById: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await referralsAPI.getById(id);
      set({ currentCode: data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load code.' });
    } finally {
      set({ loading: false });
    }
  },

  // ── Actions ──────────────────────────────────────────
  createCode: async (formData) => {
    set({ actionLoading: true });
    try {
      const data = await referralsAPI.create(formData);
      await get().fetchCodes();
      await get().fetchStatistics();
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  updateCode: async (id, formData) => {
    set({ actionLoading: true });
    try {
      const data = await referralsAPI.update(id, formData);
      set(s => ({
        codes:       s.codes.map(c => c.id === id ? data.data : c),
        currentCode: s.currentCode?.code?.id === id ? { ...s.currentCode, code: data.data } : s.currentCode,
      }));
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  activateCode: async (id) => {
    set({ actionLoading: true });
    try {
      const data = await referralsAPI.activate(id);
      set(s => ({
        codes: s.codes.map(c => c.id === id ? { ...c, status: 'active' } : c),
      }));
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  pauseCode: async (id) => {
    set({ actionLoading: true });
    try {
      const data = await referralsAPI.pause(id);
      set(s => ({
        codes: s.codes.map(c => c.id === id ? { ...c, status: 'paused' } : c),
      }));
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  archiveCode: async (id) => {
    set({ actionLoading: true });
    try {
      const data = await referralsAPI.archive(id);
      set(s => ({
        codes: s.codes.map(c => c.id === id ? { ...c, status: 'archived' } : c),
      }));
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  deleteCode: async (id) => {
    set({ actionLoading: true });
    try {
      await referralsAPI.delete(id);
      set(s => ({ codes: s.codes.filter(c => c.id !== id) }));
      await get().fetchStatistics();
    } finally {
      set({ actionLoading: false });
    }
  },

  clearCurrentCode: () => set({ currentCode: null }),
  clearError:       () => set({ error: null }),
}));

export default useReferralsStore;