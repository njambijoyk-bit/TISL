import { create } from 'zustand';
import employeesAPI from '../api/employees';

const useEmployeesStore = create((set, get) => ({
  // State
  employees: [],
  currentEmployee: null,
  statistics: null,
  departments: [],
  jobTitles: [],
  potentialManagers: [],
  loading: false,
  actionLoading: false,
  error: null,
  pagination: {
    current_page: 1,
    last_page: 1,
    total: 0,
  },
  filters: {
    search: '',
    status: '',
    department: '',
    employment_type: '',
  },

  // Actions
  setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),

  clearFilters: () => set({
    filters: { search: '', status: '', department: '', employment_type: '' },
  }),

  // Fetch employees list
  fetchEmployees: async (page = 1, perPage = 20) => {
    set({ loading: true, error: null });
    try {
      const { filters } = get();
      // Strip empty string values so they don't reach the backend as blank filters
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '' && v !== null && v !== undefined)
      );
      const data = await employeesAPI.getEmployees({
        page,
        per_page: perPage,
        ...cleanFilters,
      });
      set({
        employees: data.data || [],
        pagination: {
          current_page: data.current_page || 1,
          last_page: data.last_page || 1,
          total: data.total || 0,
        },
        loading: false,
      });
      return data;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch employees',
        loading: false,
      });
      throw error;
    }
  },

  // Fetch single employee
  fetchEmployee: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await employeesAPI.getEmployee(id);
      set({ currentEmployee: data.employee, loading: false });
      return data;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch employee',
        loading: false,
      });
      throw error;
    }
  },

  // Create employee
  createEmployee: async (formData) => {
    set({ actionLoading: true, error: null });
    try {
      const data = await employeesAPI.createEmployee(formData);
      set({ actionLoading: false });
      return data;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to create employee',
        actionLoading: false,
      });
      throw error;
    }
  },

  // Update employee
  updateEmployee: async (id, formData) => {
    set({ actionLoading: true, error: null });
    try {
      const data = await employeesAPI.updateEmployee(id, formData);
      const { currentEmployee } = get();
      if (currentEmployee?.id === id) {
        set({ currentEmployee: data.employee });
      }
      set({ actionLoading: false });
      return data;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to update employee',
        actionLoading: false,
      });
      throw error;
    }
  },

  // Delete employee
  deleteEmployee: async (id) => {
    set({ actionLoading: true, error: null });
    try {
      await employeesAPI.deleteEmployee(id);
      set((state) => ({
        employees: state.employees.filter((e) => e.id !== id),
        actionLoading: false,
      }));
      return true;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to delete employee',
        actionLoading: false,
      });
      throw error;
    }
  },

  // Restore employee
  restoreEmployee: async (id) => {
    set({ actionLoading: true, error: null });
    try {
      const data = await employeesAPI.restoreEmployee(id);
      set({ actionLoading: false });
      return data;
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to restore employee',
        actionLoading: false,
      });
      throw error;
    }
  },

  // Fetch statistics
  fetchStatistics: async () => {
    try {
      const data = await employeesAPI.getStatistics();
      set({ statistics: data });
      return data;
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
      return null;
    }
  },

  // Fetch departments
  fetchDepartments: async () => {
    try {
      const data = await employeesAPI.getDepartments();
      set({ departments: data.data || [] });
      return data.data || [];
    } catch (error) {
      console.error('Failed to fetch departments:', error);
      return [];
    }
  },

  // Fetch job titles
  fetchJobTitles: async () => {
    try {
      const data = await employeesAPI.getJobTitles();
      set({ jobTitles: data.data || [] });
      return data.data || [];
    } catch (error) {
      console.error('Failed to fetch job titles:', error);
      return [];
    }
  },

  // Fetch potential managers
  fetchPotentialManagers: async () => {
    try {
      const data = await employeesAPI.getPotentialManagers();
      set({ potentialManagers: data.data || [] });
      return data.data || [];
    } catch (error) {
      console.error('Failed to fetch potential managers:', error);
      return [];
    }
  },

  // Add skill
  addSkill: async (id, skill) => {
    set({ actionLoading: true });
    try {
      const data = await employeesAPI.addSkill(id, skill);
      set({ actionLoading: false });
      return data;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  // Remove skill
  removeSkill: async (id, skill) => {
    set({ actionLoading: true });
    try {
      const data = await employeesAPI.removeSkill(id, skill);
      set({ actionLoading: false });
      return data;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  // Add leave days
  addLeaveDays: async (id, days, reason) => {
    set({ actionLoading: true });
    try {
      const data = await employeesAPI.addLeaveDays(id, days, reason);
      set({ actionLoading: false });
      return data;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  // Use leave days
  useLeaveDays: async (id, days, reason) => {
    set({ actionLoading: true });
    try {
      const data = await employeesAPI.useLeaveDays(id, days, reason);
      set({ actionLoading: false });
      return data;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  // Update status
  updateStatus: async (id, status) => {
    set({ actionLoading: true });
    try {
      const data = await employeesAPI.updateStatus(id, status);
      const { currentEmployee } = get();
      if (currentEmployee?.id === id) {
        set({ currentEmployee: { ...currentEmployee, status } });
      }
      set({ actionLoading: false });
      return data;
    } catch (error) {
      set({ actionLoading: false });
      throw error;
    }
  },

  // Clear current employee
  clearCurrentEmployee: () => set({ currentEmployee: null }),

  // Clear error
  clearError: () => set({ error: null }),
}));

export default useEmployeesStore;