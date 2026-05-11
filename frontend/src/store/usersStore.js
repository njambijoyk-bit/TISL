import { create } from 'zustand';
import usersAPI from '../api/users';

const useUsersStore = create((set, get) => ({

  users:       [],
  currentUser: null,
  statistics:  null,
  departments: [],
  pagination:  { total: 0, per_page: 20, current_page: 1, last_page: 1 },

  filters: {
    tab:        'staff',
    search:     '',
    role:       '',
    status:     '',
    department: '',
    locked:     false,
    unverified: false,
    trashed:    false,
    sort_by:    'created_at',
    sort_order: 'desc',
    per_page:   20,
    page:       1,
  },

  loading:       false,
  actionLoading: false,
  error:         null,

  setFilter: (key, value) =>
    set(s => ({
      filters: {
        ...s.filters,
        [key]: value,
        // ✅ Only reset page to 1 if we're NOT changing the page itself
        ...(key !== 'page' && { page: 1 }),
      },
    })),
  setTab: (tab) =>
    set(s => ({
      filters: { ...s.filters, tab, role: '', department: '', page: 1 },
    })),

  resetFilters: () =>
    set(s => ({
      filters: {
        ...s.filters,
        search: '', role: '', status: '', department: '',
        locked: false, unverified: false, trashed: false, page: 1,
      },
    })),

  fetchUsers: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const params = usersAPI.buildParams(get().filters);
      const data   = await usersAPI.getUsers(params);
      set({
        users: data.data,
        pagination: {
          total:        data.total,
          per_page:     data.per_page,
          current_page: data.current_page,
          last_page:    data.last_page,
        },
      });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load users.' });
    } finally {
      set({ loading: false });
    }
  },

  fetchStatistics: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const data = await usersAPI.getStatistics();
      set({ statistics: data });
    } catch {}
  },

  fetchDepartments: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const data = await usersAPI.getDepartments();
      set({ departments: data.data || [] });
    } catch {}
  },

  fetchUserById: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await usersAPI.getById(id);
      set({ currentUser: data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load user.' });
    } finally {
      set({ loading: false });
    }
  },

  createUser: async (formData) => {
    set({ actionLoading: true });
    try {
      const data = await usersAPI.create(formData);
      await get().fetchUsers();
      await get().fetchStatistics();
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  updateUser: async (id, formData) => {
    set({ actionLoading: true });
    try {
      const data = await usersAPI.update(id, formData);
      set(s => ({
        users:       s.users.map(u => u.id === id ? data.data : u),
        currentUser: s.currentUser?.id === id ? data.data : s.currentUser,
      }));
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  deleteUser: async (id) => {
    set({ actionLoading: true });
    try {
      await usersAPI.delete(id);
      set(s => ({ users: s.users.filter(u => u.id !== id) }));
      await get().fetchStatistics();
    } finally {
      set({ actionLoading: false });
    }
  },

  restoreUser: async (id) => {
    set({ actionLoading: true });
    try {
      const data = await usersAPI.restore(id);
      await get().fetchUsers();
      await get().fetchStatistics();
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  forceDeleteUser: async (id) => {
    set({ actionLoading: true });
    try {
      const data = await usersAPI.forceDelete(id);
      set(s => ({ users: s.users.filter(u => u.id !== id) }));
      await get().fetchStatistics();
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  forcePasswordReset: async (id) => {
    set({ actionLoading: true });
    try {
      return await usersAPI.forcePasswordReset(id);
    } finally {
      set({ actionLoading: false });
    }
  },

  updateStatus: async (id, status) => {
    set({ actionLoading: true });
    try {
      const data = await usersAPI.updateStatus(id, status);
      set(s => ({
        users:       s.users.map(u => u.id === id ? { ...u, status } : u),
        currentUser: s.currentUser?.id === id ? { ...s.currentUser, status } : s.currentUser,
      }));
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  unlockUser: async (id) => {
    set({ actionLoading: true });
    try {
      const data = await usersAPI.unlock(id);
      set(s => ({
        users: s.users.map(u =>
          u.id === id ? { ...u, locked_until: null, failed_login_attempts: 0 } : u
        ),
        currentUser: s.currentUser?.id === id
          ? { ...s.currentUser, locked_until: null, failed_login_attempts: 0 }
          : s.currentUser,
      }));
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  resetPassword: async (id, password) => {
    set({ actionLoading: true });
    try {
      return await usersAPI.resetPassword(id, password);
    } finally {
      set({ actionLoading: false });
    }
  },

  verifyEmail: async (id) => {
    set({ actionLoading: true });
    try {
        const data = await usersAPI.verifyEmail(id);
        set(s => ({
        users: s.users.map(u => u.id === id ? { ...u, email_verified_at: new Date().toISOString() } : u),
        currentUser: s.currentUser?.id === id ? { ...s.currentUser, email_verified_at: new Date().toISOString() } : s.currentUser,
        }));
        return data;
    } finally { set({ actionLoading: false }); }
    },

    unverifyEmail: async (id) => {
    set({ actionLoading: true });
    try {
        const data = await usersAPI.unverifyEmail(id);
        set(s => ({
        users: s.users.map(u => u.id === id ? { ...u, email_verified_at: null } : u),
        currentUser: s.currentUser?.id === id ? { ...s.currentUser, email_verified_at: null } : s.currentUser,
        }));
        return data;
    } finally { set({ actionLoading: false }); }
    },

    verifyPhone: async (id) => {
    set({ actionLoading: true });
    try {
        const data = await usersAPI.verifyPhone(id);
        set(s => ({
        users: s.users.map(u => u.id === id ? { ...u, phone_verified_at: new Date().toISOString() } : u),
        currentUser: s.currentUser?.id === id ? { ...s.currentUser, phone_verified_at: new Date().toISOString() } : s.currentUser,
        }));
        return data;
    } finally { set({ actionLoading: false }); }
    },

    unverifyPhone: async (id) => {
    set({ actionLoading: true });
    try {
        const data = await usersAPI.unverifyPhone(id);
        set(s => ({
        users: s.users.map(u => u.id === id ? { ...u, phone_verified_at: null } : u),
        currentUser: s.currentUser?.id === id ? { ...s.currentUser, phone_verified_at: null } : s.currentUser,
        }));
        return data;
    } finally { set({ actionLoading: false }); }
    },

    lockAccount: async (id, duration_minutes) => {
    set({ actionLoading: true });
    try {
        const data = await usersAPI.lockAccount(id, duration_minutes);
        set(s => ({
        users: s.users.map(u => u.id === id ? { ...u, locked_until: data.locked_until } : u),
        currentUser: s.currentUser?.id === id ? { ...s.currentUser, locked_until: data.locked_until } : s.currentUser,
        }));
        return data;
    } finally { set({ actionLoading: false }); }
    },

  bulkDelete: async (ids) => {
    set({ actionLoading: true });
    try {
      const data = await usersAPI.bulkDelete(ids);
      await get().fetchUsers();
      await get().fetchStatistics();
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  bulkRestore: async (ids) => {
    set({ actionLoading: true });
    try {
      const data = await usersAPI.bulkRestore(ids);
      await get().fetchUsers();
      await get().fetchStatistics();
      return data;
    } finally {
      set({ actionLoading: false });
    }
  },

  clearCurrentUser: () => set({ currentUser: null }),
  clearError:       () => set({ error: null }),
}));

export default useUsersStore;