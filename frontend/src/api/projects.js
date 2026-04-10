import api from './axios';

// ============================================================
// ADMIN — Projects
// ============================================================

const adminGetProjects = (params = {}) =>
  api.get('/admin/projects', { params });

const adminGetProjectStatistics = () =>
  api.get('/admin/projects/statistics');

const adminCreateProject = (data) =>
  api.post('/admin/projects', data);

const adminGetProject = (id) =>
  api.get(`/admin/projects/${id}`);

const adminUpdateProject = (id, data) =>
  api.put(`/admin/projects/${id}`, data);

const adminDeleteProject = (id) =>
  api.delete(`/admin/projects/${id}`);

const adminForceDeleteProject = (id) =>
  api.delete(`/admin/projects/${id}/force`);

const adminGetTrashedProjects = (params = {}) =>
  api.get('/admin/projects/trash', { params });

const adminRestoreProject = (id) =>
  api.post(`/admin/projects/${id}/restore`);

const adminTransferOwnership = (id, data) =>
  api.post(`/admin/projects/${id}/transfer-ownership`, data);

// ============================================================
// ADMIN — Activity Feed
// ============================================================

const adminGetProjectActivity = (projectId, params = {}) =>
  api.get(`/admin/projects/${projectId}/activity`, { params });

// ============================================================
// ADMIN — Participants
// ============================================================

const adminGetParticipants = (projectId) =>
  api.get(`/admin/projects/${projectId}/participants`);

const adminAddAdminParticipant = (projectId, data) =>
  api.post(`/admin/projects/${projectId}/participants/add-admin`, data);

const adminAddCustomerParticipant = (projectId, data) =>
  api.post(`/admin/projects/${projectId}/participants/add-customer`, data);

const adminUpdateParticipant = (projectId, participantId, data) =>
  api.put(`/admin/projects/${projectId}/participants/${participantId}`, data);

const adminRemoveParticipant = (projectId, participantId) =>
  api.delete(`/admin/projects/${projectId}/participants/${participantId}`);

const adminForceDeleteParticipant = (projectId, participantId) =>
  api.delete(`/admin/projects/${projectId}/participants/${participantId}/force`);

// ============================================================
// ADMIN — Links
// ============================================================

const adminGetLinks = (projectId) =>
  api.get(`/admin/projects/${projectId}/links`);

const adminAddLink = (projectId, data) =>
  api.post(`/admin/projects/${projectId}/links`, data);

const adminDeleteLink = (projectId, linkId) =>
  api.delete(`/admin/projects/${projectId}/links/${linkId}`);

// ============================================================
// ADMIN — Items
// ============================================================

const adminGetItems = (projectId, params = {}) =>
  api.get(`/admin/projects/${projectId}/items`, { params });

const adminCreateItem = (projectId, data) =>
  api.post(`/admin/projects/${projectId}/items`, data);

const adminUpdateItem = (projectId, itemId, data) =>
  api.put(`/admin/projects/${projectId}/items/${itemId}`, data);

const adminDeleteItem = (projectId, itemId) =>
  api.delete(`/admin/projects/${projectId}/items/${itemId}`);

// ============================================================
// ADMIN — Tasks
// ============================================================

const adminGetTasks = (projectId, params = {}) =>
  api.get(`/admin/projects/${projectId}/tasks`, { params });

const adminCreateTask = (projectId, data) =>
  api.post(`/admin/projects/${projectId}/tasks`, data);

const adminUpdateTask = (projectId, taskId, data) =>
  api.put(`/admin/projects/${projectId}/tasks/${taskId}`, data);

const adminDeleteTask = (projectId, taskId) =>
  api.delete(`/admin/projects/${projectId}/tasks/${taskId}`);

// ============================================================
// ADMIN — Milestones
// ============================================================

const adminGetMilestones = (projectId, params = {}) =>
  api.get(`/admin/projects/${projectId}/milestones`, { params });

const adminCreateMilestone = (projectId, data) =>
  api.post(`/admin/projects/${projectId}/milestones`, data);

const adminUpdateMilestone = (projectId, milestoneId, data) =>
  api.put(`/admin/projects/${projectId}/milestones/${milestoneId}`, data);

const adminApproveMilestone = (projectId, milestoneId, data = {}) =>
  api.post(`/admin/projects/${projectId}/milestones/${milestoneId}/approve`, data);

const adminRejectMilestone = (projectId, milestoneId, data) =>
  api.post(`/admin/projects/${projectId}/milestones/${milestoneId}/reject`, data);

const adminForceDeleteMilestones = (projectId, ids) =>
  api.delete(`/admin/projects/${projectId}/milestones/force-delete`, {
    data: { ids }
  });

// ============================================================
// ADMIN — Messages
// ============================================================

const adminGetMessages = (projectId, params = {}) =>
  api.get(`/admin/projects/${projectId}/messages`, { params });

const adminPostMessage = (projectId, data) =>
  api.post(`/admin/projects/${projectId}/messages`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

const adminUpdateMessage = (projectId, messageId, data) =>
  api.put(`/admin/projects/${projectId}/messages/${messageId}`, data);

const adminDeleteMessage = (projectId, messageId) =>
  api.delete(`/admin/projects/${projectId}/messages/${messageId}`);

const adminDeleteMessages = (projectId, ids) =>
  api.delete(`/admin/projects/${projectId}/messages`, { data: { ids } });

const adminClearChat = (projectId) =>
  api.delete(`/admin/projects/${projectId}/messages/clear`);

// ============================================================
// CUSTOMER — Projects
// ============================================================

const customerGetProjects = (params = {}) =>
  api.get('/customer/projects', { params });

const customerCreateProject = (data) =>
  api.post('/customer/projects', data);

const customerGetProject = (id) =>
  api.get(`/customer/projects/${id}`);

// ============================================================
// CUSTOMER — Participants
// ============================================================

const customerGetParticipants = (projectId) =>
  api.get(`/customer/projects/${projectId}/participants`);

const customerInviteParticipant = (projectId, data) =>
  api.post(`/customer/projects/${projectId}/participants/customer-invite`, data);

// ============================================================
// CUSTOMER — Messages
// ============================================================

const customerGetMessages = (projectId) =>
  api.get(`/customer/projects/${projectId}/messages`);

const customerPostMessage = (projectId, data) =>
  api.post(`/customer/projects/${projectId}/messages`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

// Customer
const customerUpdateMessage = (projectId, messageId, data) =>
  api.put(`/customer/projects/${projectId}/messages/${messageId}`, data);

const customerDeleteMessage = (projectId, messageId) =>
  api.delete(`/customer/projects/${projectId}/messages/${messageId}`);

const customerDeleteMessages = (projectId, ids) =>
  api.delete(`/customer/projects/${projectId}/messages`, { data: { ids } });

// ============================================================
// CUSTOMER — Read-only content
// ============================================================

const customerGetLinks = (projectId) =>
  api.get(`/customer/projects/${projectId}/links`);

const customerGetItems = (projectId) =>
  api.get(`/customer/projects/${projectId}/items`);

const customerGetTasks = (projectId) =>
  api.get(`/customer/projects/${projectId}/tasks`);

const customerGetMilestones = (projectId) =>
  api.get(`/customer/projects/${projectId}/milestones`);

const customerApproveMilestone = (projectId, milestoneId, data = {}) =>
  api.post(`/customer/projects/${projectId}/milestones/${milestoneId}/approve`, data);

const customerForceDeleteMilestones = (projectId, ids) =>
  api.delete(`/customer/projects/${projectId}/milestones/force-delete`, {
    data: { ids }
  });
// ============================================================
// DEFAULT EXPORT — matches existing API pattern
// ============================================================

const projectsAPI = {
  // Admin - Projects
  adminGetProjects,
  adminGetProjectStatistics,
  adminCreateProject,
  adminGetProject,
  adminUpdateProject,
  adminDeleteProject,
  adminForceDeleteProject,
  adminGetTrashedProjects,
  adminRestoreProject,
  adminTransferOwnership,
  // Admin - Activity
  adminGetProjectActivity,
  // Admin - Participants
  adminGetParticipants,
  adminAddAdminParticipant,
  adminAddCustomerParticipant,
  adminUpdateParticipant,
  adminRemoveParticipant,
  adminForceDeleteParticipant,
  // Admin - Links
  adminGetLinks,
  adminAddLink,
  adminDeleteLink,
  // Admin - Items
  adminGetItems,
  adminCreateItem,
  adminUpdateItem,
  adminDeleteItem,
  // Admin - Tasks
  adminGetTasks,
  adminCreateTask,
  adminUpdateTask,
  adminDeleteTask,
  // Admin - Milestones
  adminGetMilestones,
  adminCreateMilestone,
  adminUpdateMilestone,
  adminApproveMilestone,
  adminRejectMilestone,
  adminForceDeleteMilestones,
  // Admin - Messages
  adminGetMessages,
  adminPostMessage,
  adminUpdateMessage,
  adminDeleteMessage,
  adminDeleteMessages,
  adminClearChat,
  // Customer - Projects
  customerGetProjects,
  customerCreateProject,
  customerGetProject,
  // Customer - Participants
  customerGetParticipants,
  customerInviteParticipant,
  // Customer - Messages
  customerGetMessages,
  customerPostMessage,
  customerUpdateMessage,
  customerDeleteMessage,
  customerDeleteMessages,
  // Customer - Read-only content
  customerGetLinks,
  customerGetItems,
  customerGetTasks,
  customerGetMilestones,
  customerApproveMilestone,
  customerForceDeleteMilestones,
};

export default projectsAPI;