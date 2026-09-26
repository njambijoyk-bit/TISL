import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import currencyAPI from '../api/currency';
import { errMsg, upsertById, removeById } from './helpers/apiState';

/**
 * Currencies — storefront display toggle + admin currency management.
 *
 * displayCurrency is persisted under 'currency-storage'; api/axios.js reads it
 * and sends X-Currency on every request, so display_price in every product /
 * service response comes back already converted. After changing it, refetch
 * whatever list is on screen.
 */
const useCurrencyStore = create(
  persist(
    (set, get) => ({
      // ── Storefront ──────────────────────────────────────────────────────
      currencies: [],          // active only: { id, code, name, symbol, is_base }
      displayCurrency: null,   // ISO code, null = base
      loading: false,

      // ── Admin ───────────────────────────────────────────────────────────
      adminCurrencies: [],     // all, incl. inactive + rates
      baseCurrency: null,
      adminLoading: false,
      actionLoading: false,
      error: null,

      // ── Selectors ───────────────────────────────────────────────────────
      /** The currency prices are currently shown in (falls back to base). */
      getActive: () => {
        const { currencies, displayCurrency } = get();
        return currencies.find((c) => c.code === displayCurrency)
          || currencies.find((c) => c.is_base)
          || null;
      },
      symbolFor: (code) => get().currencies.find((c) => c.code === code)?.symbol
        || get().adminCurrencies.find((c) => c.code === code)?.symbol
        || code,

      // ── Storefront actions ──────────────────────────────────────────────
      fetchCurrencies: async () => {
        set({ loading: true });
        try {
          const currencies = await currencyAPI.getPublicCurrencies();
          const { displayCurrency } = get();
          // Drop a persisted code that's no longer active
          const stillValid = currencies.some((c) => c.code === displayCurrency);
          set({ currencies, displayCurrency: stillValid ? displayCurrency : null, loading: false });
          return currencies;
        } catch (error) {
          set({ loading: false, error: errMsg(error, 'Failed to load currencies') });
          return [];
        }
      },

      /** Pass a code ('USD') or null for base. Caller should refetch prices. */
      setDisplayCurrency: (code) => set({ displayCurrency: code || null }),

      // ── Admin actions ───────────────────────────────────────────────────
      fetchAdminCurrencies: async () => {
        set({ adminLoading: true, error: null });
        try {
          const [list, base] = await Promise.all([
            currencyAPI.getCurrencies(),
            currencyAPI.getBaseCurrency().catch(() => null),
          ]);
          set({ adminCurrencies: list, baseCurrency: base, adminLoading: false });
          return list;
        } catch (error) {
          set({ adminLoading: false, error: errMsg(error, 'Failed to load currencies') });
          throw error;
        }
      },

      createCurrency: async (data) => {
        set({ actionLoading: true, error: null });
        try {
          const res = await currencyAPI.createCurrency(data);
          set({ adminCurrencies: upsertById(get().adminCurrencies, res.data), actionLoading: false });
          return res.data;
        } catch (error) {
          set({ actionLoading: false, error: errMsg(error, 'Failed to create currency') });
          throw error;
        }
      },

      updateCurrency: async (id, data) => {
        set({ actionLoading: true, error: null });
        try {
          const res = await currencyAPI.updateCurrency(id, data);
          // anchor_rate changes recalc every conversion_rate — reload the lot
          if ('anchor_rate' in data) await get().fetchAdminCurrencies();
          else set({ adminCurrencies: upsertById(get().adminCurrencies, res.data) });
          set({ actionLoading: false });
          return res.data;
        } catch (error) {
          set({ actionLoading: false, error: errMsg(error, 'Failed to update currency') });
          throw error;
        }
      },

      updateAnchorRate: async (id, anchorRate) => {
        set({ actionLoading: true, error: null });
        try {
          const res = await currencyAPI.updateAnchorRate(id, anchorRate);
          await get().fetchAdminCurrencies();
          set({ actionLoading: false });
          return res.data;
        } catch (error) {
          set({ actionLoading: false, error: errMsg(error, 'Failed to update rate') });
          throw error;
        }
      },

      setBaseCurrency: async (id) => {
        set({ actionLoading: true, error: null });
        try {
          const res = await currencyAPI.setBaseCurrency(id);
          await get().fetchAdminCurrencies();
          await get().fetchCurrencies();
          set({ actionLoading: false });
          return res.data;
        } catch (error) {
          set({ actionLoading: false, error: errMsg(error, 'Failed to set base currency') });
          throw error;
        }
      },

      toggleStatus: async (id, isActive) => {
        set({ actionLoading: true, error: null });
        try {
          const res = await currencyAPI.toggleStatus(id, isActive);
          set({ adminCurrencies: upsertById(get().adminCurrencies, res.data), actionLoading: false });
          get().fetchCurrencies();
          return res.data;
        } catch (error) {
          set({ actionLoading: false, error: errMsg(error, 'Failed to update status') });
          throw error;
        }
      },

      deleteCurrency: async (id) => {
        set({ actionLoading: true, error: null });
        try {
          await currencyAPI.deleteCurrency(id);
          set({ adminCurrencies: removeById(get().adminCurrencies, id), actionLoading: false });
          get().fetchCurrencies();
        } catch (error) {
          set({ actionLoading: false, error: errMsg(error, 'Failed to delete currency') });
          throw error;
        }
      },

      convert: (fromId, toId, amount) => currencyAPI.convert(fromId, toId, amount),

      clearError: () => set({ error: null }),
    }),
    {
      name: 'currency-storage',
      partialize: (state) => ({ displayCurrency: state.displayCurrency }),
    }
  )
);

export default useCurrencyStore;
