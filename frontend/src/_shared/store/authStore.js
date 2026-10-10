import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import authAPI from '../api/auth';
import { setCsrf, setSessionMode } from '../api/sessionKit';

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      customer: null,
      isAuthenticated: false,
      // What the engine says this person may do: clearance, roles held, permissions, branch scope (from login and /me). Null until loaded.
      access: null,

      // The sign-in itself is a cookie the page can not read. What the page keeps is who is signed in and the CSRF code its changes must carry.
      // `token` only arrives from a server with cookie sessions switched off: then the page keeps it and sends it as before.
      login: (user, customer, token, access = null, csrf = null) => {
        if (token) localStorage.setItem('token', token); // set FIRST so interceptor can read it
        else localStorage.removeItem('token');
        setSessionMode(token);
        setCsrf(csrf);
        set({ user, customer, access, isAuthenticated: true });

        if (access?.account === 'customer') {
          setTimeout(() => {
            import('./cartStore').then(m => m.default.getState().loadFromServer());
            import('./wishlistStore').then(m => m.default.getState().loadFromServer());
            import('./noteStore').then(m => m.default.getState().loadFromServer());
          }, 0);
        }
      },

      logout: () => {
        localStorage.removeItem('token');
        setCsrf(null);
        localStorage.removeItem('auth-storage');
        set({ user: null, customer: null, access: null, isAuthenticated: false });

        import('./cartStore').then(m => m.default.getState().resetLocal());
        import('./wishlistStore').then(m => m.default.getState().resetLocal());
      },

      updateUser: (user) => set({ user }),
      updateCustomer: (customer) => set({ customer }),
      fetchCustomer: async () => {
        try {
          const data = await authAPI.me();
          if (data.csrf) setCsrf(data.csrf);
          set({ user: data.user, customer: data.customer, access: data.access ?? null });
        } catch (err) {
          if (err.response?.status === 401) {
            // The session is over — force logout
            localStorage.removeItem('token');
            setCsrf(null);
            set({ user: null, customer: null, access: null, isAuthenticated: false });
          }
        }
      },
    }),
    { name: 'auth-storage', partialize: (s) => ({ user: s.user, customer: s.customer, isAuthenticated: s.isAuthenticated, access: s.access }) }
  )
);

export default useAuthStore;