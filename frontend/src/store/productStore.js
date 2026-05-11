import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { productsAPI } from '../api';

// ─── helpers ────────────────────────────────────────────────────────────────
// The API layer already does `return response.data`, so the value we receive
// is the server payload. Normalise it into { items[], pagination }.
const unwrapList = (response) => {
  if (Array.isArray(response)) {
    return { items: response, pagination: null };
  }
  if (response?.data && Array.isArray(response.data)) {
    return { items: response.data, pagination: response.pagination ?? response.meta ?? null };
  }
  if (response?.data?.data && Array.isArray(response.data.data)) {
    return { items: response.data.data, pagination: response.data.pagination ?? response.data.meta ?? null };
  }
  return { items: [], pagination: null };
};

const useProductStore = create(
  persist(
    (set, get) => ({
      // ── data ──────────────────────────────────────────────────────────────
      products: [],
      currentProduct: null,
      featuredProducts: [],
      onSaleProducts: [],
      newArrivals: [],          // ← is_new=1, is_visible=1 only
      relatedProducts: [],
      categories: [],
      brands: [],

      // ── filters ───────────────────────────────────────────────────────────
      filters: {
        search: '',
        category_id: '',
        brand_id: '',
        min_price: '',
        max_price: '',
        sort: 'created_at_desc',
        featured: false,
        on_sale: false,
        in_stock: false,
      },

      // ── pagination ────────────────────────────────────────────────────────
      pagination: {
        current_page: 1,
        per_page: 20,
        total: 0,
        last_page: 1,
      },

      // ── SEPARATE loading flags — no more shared boolean ───────────────────
      loading: false,              // products list page
      loadingFeatured: false,      // featured products
      loadingOnSale: false,        // on-sale / deals
      loadingNewArrivals: false,   // new arrivals (is_new=1 only)
      error: null,

      // ── recently viewed ───────────────────────────────────────────────────
      recentlyViewed: [],

      // ══════════════════════════════════════════════════════════════════════
      // SETTERS (kept for backward-compat with Products.jsx)
      // ══════════════════════════════════════════════════════════════════════
      setProducts: (products, pagination = null) =>
        set({ products, pagination: pagination || get().pagination }),

      setCurrentProduct: (product) => {
        set({ currentProduct: product });
        const filtered = get().recentlyViewed.filter((p) => p.id !== product.id);
        set({ recentlyViewed: [product, ...filtered].slice(0, 10) });
      },

      setFeaturedProducts: (products) => set({ featuredProducts: products }),
      setRelatedProducts:  (products) => set({ relatedProducts: products }),

      setFilter: (key, value) =>
        set({ filters: { ...get().filters, [key]: value } }),

      setFilters: (filters) =>
        set({ filters: { ...get().filters, ...filters } }),

      resetFilters: () =>
        set({
          filters: {
            search: '', category_id: '', brand_id: '',
            min_price: '', max_price: '',
            sort: 'created_at_desc',
            featured: false, on_sale: false, in_stock: false,
          },
        }),

      setPage: (page) =>
        set({ pagination: { ...get().pagination, current_page: page } }),

      setLoading: (loading) => set({ loading }),
      setError:   (error)   => set({ error }),
      clearError: ()        => set({ error: null }),

      getActiveFiltersCount: () => {
        const f = get().filters;
        return [f.search, f.category_id, f.brand_id, f.min_price, f.max_price,
                f.featured, f.on_sale, f.in_stock].filter(Boolean).length;
      },

      clearRecentlyViewed: () => set({ recentlyViewed: [] }),
      removeFromRecentlyViewed: (productId) =>
        set({ recentlyViewed: get().recentlyViewed.filter((p) => p.id !== productId) }),

      // ══════════════════════════════════════════════════════════════════════
      // API METHODS
      // ══════════════════════════════════════════════════════════════════════

      /** Products list page */
      fetchProducts: async (params = {}) => {
        set({ loading: true, error: null });
        try {
          const response = await productsAPI.getProducts(params);
          const { items, pagination } = unwrapList(response);
          set({
            products: items,
            pagination: pagination || get().pagination,
            loading: false,
          });
          return response;
        } catch (error) {
          set({ error: error.response?.data?.message || 'Failed to fetch products', loading: false });
          throw error;
        }
      },

      /** Featured products — uses its OWN loadingFeatured flag */
      fetchFeaturedProducts: async () => {
        set({ loadingFeatured: true, error: null });
        try {
          const response = await productsAPI.getFeaturedProducts();
          const { items } = unwrapList(response);
          set({ featuredProducts: items, loadingFeatured: false });
          return response;
        } catch (error) {
          set({ error: error.response?.data?.message || 'Failed to fetch featured products', loadingFeatured: false });
          throw error;
        }
      },

      /**
       * On-sale products — dedicated endpoint, only checks on_sale + is_visible + active
       */
      fetchOnSaleProducts: async (limit = 12) => {
        set({ loadingOnSale: true });
        try {
          const response = await productsAPI.getOnSaleProducts();
          const { items } = unwrapList(response);
          set({ onSaleProducts: items.slice(0, limit), loadingOnSale: false });
          return items;
        } catch (error) {
          console.error('Failed to fetch on-sale products:', error);
          set({ loadingOnSale: false });
          return [];
        }
      },

      /**
       * New arrivals — dedicated endpoint, only checks is_new + is_visible (NO status check)
       */
      fetchNewArrivals: async (limit = 12) => {
        set({ loadingNewArrivals: true });
        try {
          const response = await productsAPI.getNewArrivals();
          const { items } = unwrapList(response);
          set({ newArrivals: items.slice(0, limit), loadingNewArrivals: false });
          return items;
        } catch (error) {
          console.error('Failed to fetch new arrivals:', error);
          set({ loadingNewArrivals: false });
          return [];
        }
      },

      /** Single product */
      fetchProduct: async (id) => {
        set({ loading: true, error: null });
        try {
          const response = await productsAPI.getProduct(id);
          set({ currentProduct: response, loading: false });
          const filtered = get().recentlyViewed.filter((p) => p.id !== response.id);
          set({ recentlyViewed: [response, ...filtered].slice(0, 10) });
          return response;
        } catch (error) {
          set({ error: error.response?.data?.message || 'Failed to fetch product', loading: false });
          throw error;
        }
      },

      /** Related products */
      fetchRelatedProducts: async (productId) => {
        try {
          const response = await productsAPI.getRelatedProducts(productId);
          const { items } = unwrapList(response);
          set({ relatedProducts: items });
          return response;
        } catch (error) {
          console.error('Failed to fetch related products:', error);
          throw error;
        }
      },

      fetchCategories: async () => {
        try {
          const response = await productsAPI.getCategories();
          const { items } = unwrapList(response);
          set({ categories: items.length ? items : (Array.isArray(response) ? response : []) });
          return response;
        } catch (error) {
          console.error('Failed to fetch categories:', error);
          throw error;
        }
      },

      fetchBrands: async () => {
        try {
          const response = await productsAPI.getBrands();
          const { items } = unwrapList(response);
          set({ brands: items.length ? items : (Array.isArray(response) ? response : []) });
          return response;
        } catch (error) {
          console.error('Failed to fetch brands:', error);
          throw error;
        }
      },
 
      // ══════════════════════════════════════════════════════════════════════
      // BULK FLAG ACTIONS
      // ══════════════════════════════════════════════════════════════════════
 
      /**
       * Bulk-set one or more boolean flags on multiple products.
       *
       * Applies an optimistic update to `products` in the store so the table
       * reflects the change immediately, then calls the API. On failure the
       * optimistic patch is rolled back and the error is re-thrown so the
       * caller can show feedback.
       *
       * @param {number[]} ids   - Selected product IDs.
       * @param {object}   flags - e.g. { is_featured: true } or { on_sale: false, is_new: false }
       *
       * Supported flag keys (mirrors the DB columns):
       *   is_visible | is_featured | is_new | on_sale
       */
      bulkUpdateFlags: async (ids = [], flags = {}) => {
        if (!ids.length || !Object.keys(flags).length) return;
 
        // ── optimistic update ─────────────────────────────────────────────
        const previousProducts = get().products;
        set({
          products: previousProducts.map((p) =>
            ids.includes(p.id) ? { ...p, ...flags } : p
          ),
        });
 
        try {
          const response = await productsAPI.bulkUpdateFlags(ids, flags);
          return response;
        } catch (error) {
          // ── rollback on failure ─────────────────────────────────────────
          set({ products: previousProducts });
          set({ error: error.response?.data?.message || 'Bulk update failed' });
          throw error;
        }
      },
  
    }),
    {
      name: 'product-storage',
      partialize: (state) => ({ recentlyViewed: state.recentlyViewed }),
    }
  )
);

export default useProductStore;