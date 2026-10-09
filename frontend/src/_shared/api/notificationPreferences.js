import api from './axios';

// A customer's own say in how they are reached (Profile → Notification settings).
const notificationPreferencesAPI = {
  show: () => api.get('/customer/notification-preferences').then((r) => r.data),
  /** mode: 'default' | 'email' | 'whatsapp' | 'both'; essential_only: true | false | null (follow the company); whatsapp: a number, or '' to remove it */
  save: (body) => api.put('/customer/notification-preferences', body).then((r) => r.data),
};

export default notificationPreferencesAPI;
