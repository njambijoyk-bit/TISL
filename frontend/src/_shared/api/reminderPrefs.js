import api from './axios';

// The "stop these reminders" link in cart reminders and price alerts: open to anyone holding the token from the email.
const reminderPrefsAPI = {
  peek: (token) => api.get(`/reminder-prefs/${token}`).then((r) => r.data),
  /** kind: 'cart' | 'price' | 'all' → { cart, price } as they now stand */
  stop: (token, kind) => api.post(`/reminder-prefs/${token}/stop`, { kind }).then((r) => r.data),
};

export default reminderPrefsAPI;
