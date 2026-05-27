import { create } from 'zustand';
import { getServiceCategories } from '../api/serviceCategories';
import { 
  getServices, 
  getFeaturedServices, 
  getServiceById, 
  getRelatedServices,
  getServiceTypes,
  getAdminServices,
  createService,
  updateService,
  deleteService,
  restoreService,
  publishService,
  unpublishService,
  getServiceStatistics,
  buildServiceQueryParams
} from '../api/services';

/**
 * Service Store
 * Manages service catalog state for both customer and admin views
 */
const useServiceStore = create((set, get) => ({
  // ========================================
  // STATE
  // ========================================
  
  // Services list
  services: [],
  featuredServices: [],
  currentService: null,
  relatedServices: [],
  categories: [],
  mainCategories: [],
  types: [],
  
  // Pagination
  pagination: {
    current_page: 1,
    last_page: 1,
    per_page: 20,
    total: 0,
  },
  
  // Filters
  filters: {
    search: '',
    category_id: null,
    type: null, 
    pricing_model: null,
    min_price: null,
    max_price: null,
    remote_only: false,
    requires_site_visit: null,
    featured: false,
    sort_by: '',
    sort_order: '',
    per_page: 20,
    page: 1,
  },
  
  // Admin-specific
  adminFilters: {
    status: null,
    is_available: null,
    is_visible: null,
    is_featured: null,
  },
  
  // Statistics
  statistics: null,
  
  // Loading states
  loadingCategories: false,
  loading: false,
  loadingFeatured: false,
  loadingCurrent: false,
  loadingStatistics: false,
  
  // Error handling
  error: null,

  // ========================================
  // ACTIONS - PUBLIC/CUSTOMER
  // ========================================

  /**
   * Fetch services (public/customer view)
   */
  fetchServices: async () => {
    set({ loading: true, error: null });
    try {
      const params = buildServiceQueryParams(get().filters);
      const response = await getServices(params);
      
      set({
        services: response.data || response,
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
        error: error.response?.data?.message || 'Failed to fetch services',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Fetch featured services
   */
  fetchFeaturedServices: async () => {
    set({ loadingFeatured: true, error: null });
    try {
      const services = await getFeaturedServices();
      set({ 
        featuredServices: services,
        loadingFeatured: false 
      });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch featured services',
        loadingFeatured: false 
      });
      throw error;
    }
  },

  /**
   * Fetch single service by ID
   */
  fetchServiceById: async (id) => {
    set({ loadingCurrent: true, error: null });
    try {
      const response = await getServiceById(id);
      set({ 
        currentService: response.service,
        relatedServices: response.related_services || [],
        loadingCurrent: false 
      });
      return response;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch service',
        loadingCurrent: false 
      });
      throw error;
    }
  },

  /**
   * Fetch related services
   */
  fetchRelatedServices: async (id) => {
    try {
      const services = await getRelatedServices(id);
      set({ relatedServices: services });
      return services;
    } catch (error) {
      console.error('Failed to fetch related services:', error);
      return [];
    }
  },

  /**
   * Fetch MAIN service categories (for homepage cards)
   */
  fetchMainCategories: async () => {
    set({ loadingCategories: true, error: null });
    try {
      const response = await getServiceCategories({ main: true });
      const cats = response.data || response;
      set({ mainCategories: cats, loadingCategories: false });
      return cats;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch main categories',
        loadingCategories: false,
      });
      throw error;
    }
  },

  /**
   * Fetch service types from backend
   */
  fetchTypes: async () => {
    try {
      const types = await getServiceTypes();
      set({ types: types || [] });
      return types;
    } catch (error) {
      console.error('Failed to fetch service types:', error);
      return [];
    }
  },

  // ========================================
  // ACTIONS - ADMIN
  // ========================================

  /**
   * Fetch services (admin view - includes inactive)
   */
  fetchAdminServices: async () => {
    set({ loading: true, error: null });
    try {
      const params = {
        ...buildServiceQueryParams(get().filters),
        ...get().adminFilters,
      };
      const response = await getAdminServices(params);
      
      set({
        services: response.data || response,
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
        error: error.response?.data?.message || 'Failed to fetch services',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Create new service
   */
  createService: async (serviceData) => {
    set({ loading: true, error: null });
    try {
      const response = await createService(serviceData);
      
      // Refresh list
      await get().fetchAdminServices();
      
      set({ loading: false });
      return response.service;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to create service',
        loading: false 
      });
      throw error;
    }
  },

  /** Fetch service categories */
    fetchCategories: async (params = {}) => {
    set({ loadingCategories: true, error: null });
    try {
      const response = await getServiceCategories(params);
      const cats = response.data || response;
      set({ categories: cats, loadingCategories: false });
      return cats;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch categories',
        loadingCategories: false,
      });
      throw error;
    }
  },

  /**
   * Update service
   */
  updateService: async (id, serviceData) => {
    set({ loading: true, error: null });
    try {
      const response = await updateService(id, serviceData);
      
      // Update in current list
      set(state => ({
        services: state.services.map(s => 
          s.id === id ? response.service : s
        ),
        currentService: state.currentService?.id === id ? response.service : state.currentService,
        loading: false,
      }));
      
      return response.service;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to update service',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Delete service (soft delete)
   */
  deleteService: async (id) => {
    set({ loading: true, error: null });
    try {
      await deleteService(id);
      
      // Remove from list or refresh
      await get().fetchAdminServices();
      
      set({ loading: false });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to delete service',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Restore deleted service
   */
  restoreService: async (id) => {
    set({ loading: true, error: null });
    try {
      await restoreService(id);
      
      // Refresh list
      await get().fetchAdminServices();
      
      set({ loading: false });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to restore service',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Publish service
   */
  publishService: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await publishService(id);
      
      // Update in list
      set(state => ({
        services: state.services.map(s => 
          s.id === id ? response.service : s
        ),
        loading: false,
      }));
      
      return response.service;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to publish service',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Unpublish service
   */
  unpublishService: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await unpublishService(id);
      
      // Update in list
      set(state => ({
        services: state.services.map(s => 
          s.id === id ? response.service : s
        ),
        loading: false,
      }));
      
      return response.service;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to unpublish service',
        loading: false 
      });
      throw error;
    }
  },

  /**
   * Fetch service statistics
   */
  fetchStatistics: async () => {
    set({ loadingStatistics: true, error: null });
    try {
      const stats = await getServiceStatistics();
      set({ 
        statistics: stats,
        loadingStatistics: false 
      });
      return stats;
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch statistics',
        loadingStatistics: false 
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
      filters: { ...state.filters, ...newFilters, page: 1 } // Reset to page 1 on filter change
    }));
  },

  /**
   * Reset filters to default
   */
  resetFilters: () => {
    set({
      filters: {
        search: '',
        category_id: null,
        pricing_model: null,
        min_price: null,
        max_price: null,
        remote_only: false,
        requires_site_visit: null,
        featured: false,
        sort_by: '',
        sort_order: '',
        per_page: 20,
        page: 1,
      },
      adminFilters: {
        status: null,
        is_available: null,
        is_visible: null,
        is_featured: null,
      },
    });
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
   * Set current page
   */
  setPage: (page) => {
    set(state => ({
      filters: { ...state.filters, page }
    }));
  },

  /**
   * Set items per page
   */
  setPerPage: (perPage) => {
    set(state => ({
      filters: { ...state.filters, per_page: perPage, page: 1 }
    }));
  },

  /**
   * Set search query
   */
  setSearch: (search) => {
    set(state => ({
      filters: { ...state.filters, search, page: 1 }
    }));
  },

  /**
   * Set category filter
   */
  setCategory: (categoryId) => {
    set(state => ({
      filters: { ...state.filters, category_id: categoryId, page: 1 }
    }));
  },

  /**
   * Set sort
   */
  setSort: (sortBy, sortOrder = 'desc') => {
    set(state => ({
      filters: { ...state.filters, sort_by: sortBy, sort_order: sortOrder }
    }));
  },

  // ========================================
  // UTILITY ACTIONS
  // ========================================

  /**
   * Clear current service
   */
  clearCurrentService: () => {
    set({ currentService: null, relatedServices: [] });
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
      services: [],
      featuredServices: [],
      currentService: null,
      relatedServices: [],
      types: [],
      pagination: {
        current_page: 1,
        last_page: 1,
        per_page: 20,
        total: 0,
      },
      filters: {
        search: '',
        category_id: null,
        type: null,
        pricing_model: null,
        min_price: null,
        max_price: null,
        remote_only: false,
        requires_site_visit: null,
        featured: false,
        sort_by: '',
        sort_order: '',
        per_page: 20,
        page: 1,
      },
      adminFilters: {
        status: null,
        is_available: null,
        is_visible: null,
        is_featured: null,
      },
      statistics: null,
      loading: false,
      loadingFeatured: false,
      loadingCurrent: false,
      loadingStatistics: false,
      error: null,
    });
  },
}));

export default useServiceStore;