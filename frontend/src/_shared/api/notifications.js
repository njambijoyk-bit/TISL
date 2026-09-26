// api/notifications.js
import axios from './axios'; // whatever your axios instance is

const notificationsAPI = {
  list:       (params = {}) => axios.get('/notifications', { params }),
  unreadCount:()            => axios.get('/notifications/unread-count'),
  markAsRead: (id)          => axios.post(`/notifications/${id}/read`),
  markAllRead:()            => axios.post('/notifications/mark-all-read'),
  destroy:    (id)          => axios.delete(`/notifications/${id}`),
};

export default notificationsAPI;