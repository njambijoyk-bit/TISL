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
        localStorage.setItem('token', token);
        set({ user, customer, token, isAuthenticated: true });
      },

      logout: () => {
        localStorage.removeItem('token');
        set({ user: null, customer: null, token: null, isAuthenticated: false });
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