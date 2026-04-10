import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
    }),
    { name: 'auth-storage' }
  )
);

export default useAuthStore;