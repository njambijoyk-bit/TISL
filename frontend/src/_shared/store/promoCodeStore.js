import { create } from 'zustand';
import promoCodesAPI from '../api/promoCodes';

const usePromoCodeStore = create((set, get) => ({

  // ── State ──────────────────────────────────────────────────────────────────
  codes:       [],
  statistics:  null,
  pagination:  { current_page: 1, last_page: 1, per_page: 20, total: 0 },
  filters:     {
    search:      '',
    type:        '',
    event_type:  '',
    status:      '',
    reward_type: '',
    public:      false,
    auto:        false,
    expiring:    false,
    page:        1,
  },
  loading:        false,
  actionLoading:  false,
  error:          null,

  // Applied promo at checkout — shared between Checkout and CreateOrderModal
  appliedPromo: null,   // { code, name, discount, reward_type, reward_value, stackable }
  promoError:   null,
  promoLoading: false,

  // Customer rewards
  myCodes: {
    active_codes:  [],
    used_codes:    [],
    expired_codes: [],
    total_savings: 0,
  },

  // ── ADMIN ACTIONS ──────────────────────────────────────────────────────────

  fetchCodes: async () => {
    set({ loading: true, error: null });
    try {
      const { filters } = get();
      const params = {};
      if (filters.search)      params.search      = filters.search;
      if (filters.type)        params.type        = filters.type;
      if (filters.event_type)  params.event_type  = filters.event_type;
      if (filters.status)      params.status      = filters.status;
      if (filters.reward_type) params.reward_type = filters.reward_type;
      if (filters.public)      params.public      = true;
      if (filters.auto)        params.auto        = true;
      if (filters.expiring)    params.expiring    = true;
      params.page     = filters.page;
      params.per_page = 20;

      const response = await promoCodesAPI.getAll(params);
      set({
        codes:      response.data || [],
        pagination: {
          current_page: response.current_page,
          last_page:    response.last_page,
          per_page:     response.per_page,
          total:        response.total,
        },
        loading: false,
      });
    } catch (error) {
      set({
        error:   error.response?.data?.message || 'Failed to fetch promo codes',
        loading: false,
      });
    }
  },

  fetchStatistics: async () => {
    try {
      const data = await promoCodesAPI.getStatistics();
      set({ statistics: data });
    } catch (error) {
      console.error('Failed to fetch promo statistics', error);
    }
  },

  createCode: async (payload) => {
    set({ actionLoading: true, error: null });
    try {
      const response = await promoCodesAPI.create(payload);
      set({ actionLoading: false });
      return response;
    } catch (error) {
      set({
        error:        error.response?.data?.message || 'Failed to create promo code',
        actionLoading: false,
      });
      throw error;
    }
  },

  updateCode: async (id, payload) => {
    set({ actionLoading: true, error: null });
    try {
      const response = await promoCodesAPI.update(id, payload);
      const codes = get().codes.map(c => c.id === id ? response.code : c);
      set({ codes, actionLoading: false });
      return response;
    } catch (error) {
      set({
        error:        error.response?.data?.message || 'Failed to update promo code',
        actionLoading: false,
      });
      throw error;
    }
  },

  deleteCode: async (id) => {
    set({ actionLoading: true });
    try {
      const response = await promoCodesAPI.delete(id);
      set({
        codes:        get().codes.filter(c => c.id !== id),
        actionLoading: false,
      });
      return response;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  activateCode: async (id) => {
    set({ actionLoading: true });
    try {
      const response = await promoCodesAPI.activate(id);
      const codes = get().codes.map(c => c.id === id ? { ...c, status: 'active' } : c);
      set({ codes, actionLoading: false });
      return response;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  pauseCode: async (id) => {
    set({ actionLoading: true });
    try {
      const response = await promoCodesAPI.pause(id);
      const codes = get().codes.map(c => c.id === id ? { ...c, status: 'paused' } : c);
      set({ codes, actionLoading: false });
      return response;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  archiveCode: async (id) => {
    set({ actionLoading: true });
    try {
      const response = await promoCodesAPI.archive(id);
      const codes = get().codes.map(c => c.id === id ? { ...c, status: 'archived' } : c);
      set({ codes, actionLoading: false });
      return response;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  triggerBirthday: async () => {
    set({ actionLoading: true });
    try {
      const response = await promoCodesAPI.triggerBirthday();
      set({ actionLoading: false });
      return response;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  triggerWinBack: async () => {
    set({ actionLoading: true });
    try {
      const response = await promoCodesAPI.triggerWinBack();
      set({ actionLoading: false });
      return response;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  triggerExpire: async () => {
    set({ actionLoading: true });
    try {
      const response = await promoCodesAPI.triggerExpire();
      set({ actionLoading: false });
      return response;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  // ── CUSTOMER CHECKOUT ACTIONS ──────────────────────────────────────────────

  /**
   * Validate and apply a promo code at checkout.
   * Pass orderValue and optional referralDiscount for stacking check.
   */
  applyPromoCode: async (code, orderValue, referralDiscount = 0, exchangeRateToKes = 1) => {
    if (!code?.trim()) return;
    set({ promoLoading: true, promoError: null });
    try {
      const response = await promoCodesAPI.validate({
        code:               code.trim().toUpperCase(),
        order_value:        orderValue,
        referral_discount:  referralDiscount,
        exchange_rate_to_kes: exchangeRateToKes,
      });
      set({
        appliedPromo: {
          code:         response.code,
          name:         response.name,
          description:  response.description,
          discount:     response.discount,
          reward_type:  response.reward_type,
          reward_value: response.reward_value,
          stackable:    response.stackable,
          message:      response.message,
        },
        promoError:   null,
        promoLoading: false,
      });
      return response;
    } catch (error) {
      set({
        appliedPromo: null,
        promoError:   error.response?.data?.message || 'Invalid promo code.',
        promoLoading: false,
      });
      throw error;
    }
  },

  /**
   * Admin version — validate on behalf of a customer.
   */
  adminApplyPromoCode: async (code, orderValue, customerId, referralDiscount = 0, exchangeRateToKes = 1) => {
    if (!code?.trim()) return;
    set({ promoLoading: true, promoError: null });
    try {
      const response = await promoCodesAPI.adminValidate({
        code:               code.trim().toUpperCase(),
        order_value:        orderValue,
        customer_id:        customerId,
        referral_discount:  referralDiscount,
        exchange_rate_to_kes: exchangeRateToKes,
      });
      set({
        appliedPromo: {
          code:         response.code,
          name:         response.name,
          description:  response.description,
          discount:     response.discount,
          reward_type:  response.reward_type,
          reward_value: response.reward_value,
          stackable:    response.stackable,
          message:      response.message,
        },
        promoError:   null,
        promoLoading: false,
      });
      return response;
    } catch (error) {
      set({
        appliedPromo: null,
        promoError:   error.response?.data?.message || 'Invalid promo code.',
        promoLoading: false,
      });
      throw error;
    }
  },

  clearPromo: () => set({ appliedPromo: null, promoError: null }),

  // ── CUSTOMER MY CODES ──────────────────────────────────────────────────────

  fetchMyCodes: async () => {
    set({ loading: true });
    try {
      const data = await promoCodesAPI.myCodes();
      set({
        myCodes: {
          active_codes:  data.active_codes  || [],
          used_codes:    data.used_codes    || [],
          expired_codes: data.expired_codes || [],
          total_savings: data.total_savings || 0,
        },
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
    }
  },

  // ── FILTERS ────────────────────────────────────────────────────────────────

  setFilter: (key, value) => {
    set(state => ({
      filters: {
        ...state.filters,
        [key]: value,
        // Reset to page 1 on any filter change except page itself
        ...(key !== 'page' ? { page: 1 } : {}),
      },
    }));
  },

  resetFilters: () => set({
    filters: {
      search:      '',
      type:        '',
      event_type:  '',
      status:      '',
      reward_type: '',
      public:      false,
      auto:        false,
      expiring:    false,
      page:        1,
    },
  }),

  // ── UTILS ──────────────────────────────────────────────────────────────────

  clearError: () => set({ error: null }),

  reset: () => set({
    codes:        [],
    statistics:   null,
    loading:      false,
    actionLoading: false,
    error:        null,
    appliedPromo: null,
    promoError:   null,
    promoLoading: false,
  }),
}));

export default usePromoCodeStore;