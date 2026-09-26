import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import authAPI from '../api/auth'; 

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      customer: null,
      token: null,
      isAuthenticated: false,

      login: (user, customer, token) => {
        localStorage.setItem('token', token); // set FIRST so interceptor can read it
        set({ user, customer, token, isAuthenticated: true });

        if (user.role === 'customer') {
          setTimeout(() => {
            import('./cartStore').then(m => m.default.getState().loadFromServer());
            import('./wishlistStore').then(m => m.default.getState().loadFromServer());
            import('./quoteListStore').then(m => m.default.getState().loadFromServer());
            import('./noteStore').then(m => m.default.getState().loadFromServer());
          }, 0);
        }
      },

      logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('auth-storage');
        set({ user: null, customer: null, token: null, isAuthenticated: false });

        import('./cartStore').then(m => m.default.getState().resetLocal());
        import('./wishlistStore').then(m => m.default.getState().resetLocal());
        import('./quoteListStore').then(m => m.default.getState().resetLocal());
      },

      updateUser: (user) => set({ user }),
      updateCustomer: (customer) => set({ customer }),
      fetchCustomer: async () => {
        try {
          const data = await authAPI.me();
          set({ user: data.user, customer: data.customer });
        } catch (err) {
          if (err.response?.status === 401) {
            // Token is dead — force logout
            localStorage.removeItem('token');
            set({ user: null, customer: null, token: null, isAuthenticated: false });
          }
        }
      },
    }),
    { name: 'auth-storage' }
  )
);

export default useAuthStore;