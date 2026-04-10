import api from './axios';

const authAPI = {
  // Register new user
  register: async (data) => {
    const response = await api.post('/auth/register', data);
    return response.data;
  },

  // Login
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  // Logout
  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  // Get current user
  me: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  // Change password
  changePassword: async (data) => {
    const response = await api.post('/auth/change-password', data);
    return response.data;
  },

  forceChangePassword: (data) =>
    api.post('/auth/force-change-password', data).then((r) => r.data),

  // Forgot password
  forgotPassword: async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  // Reset password
  resetPassword: async (data) => {
    const response = await api.post('/auth/reset-password', data);
    return response.data;
  },

  // OAuth redirect
  oauthRedirect: (provider) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    const baseUrl = apiUrl.replace('/api', '');
    window.location.href = `${baseUrl}/api/auth/${provider}`;
  },

  // Handle OAuth callback
  handleOAuthCallback: async (provider, params) => {
    const response = await api.get(`/auth/${provider}/callback`, { params });
    return response.data;
  },
};

export default authAPI;