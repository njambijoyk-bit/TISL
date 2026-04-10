import { create } from 'zustand';
import projectsAPI from '../api/projects';

const useProjectStore = create((set, get) => ({

  // ─────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────

  // Project list
  projects: [],
  pagination: null,
  trashedProjects: [],
  trashedPagination: null,
  filters: {
    status: '',
    priority: '',
    customer_id: '',
    owner_admin_id: '',
    search: '',
    page: 1,
    per_page: 20,
  },

  // Statistics (admin dashboard)
  statistics: null,
  recentProjects: [],

  // Active project (detail view)
  activeProject: null,
  participants: [],
  links: [],
  items: [],
  tasks: [],
  milestones: [],
  messages: [],
  activity: [],
  activityPagination: null,

  // Permissions for the current user on activeProject
  // Populated from _permissions block in customerFetchProject
  permissions: null,

  // Loading states — granular so each section loads independently
  loading: {
    projects: false,
    statistics: false,
    project: false,
    participants: false,
    links: false,
    items: false,
    tasks: false,
    milestones: false,
    messages: false,
    activity: false,
    trash: false,
    submitting: false,
  },

  error: null,

  // ─────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────

  setLoading: (key, value) =>
    set((state) => ({ loading: { ...state.loading, [key]: value } })),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),

  resetFilters: () =>
    set({
      filters: {
        status: '',
        priority: '',
        customer_id: '',
        owner_admin_id: '',
        search: '',
        page: 1,
        per_page: 20,
      },
    }),

  setActiveProject: (project) => set({ activeProject: project }),

  clearActiveProject: () =>
    set({
      activeProject: null,
      participants: [],
      links: [],
      items: [],
      tasks: [],
      milestones: [],
      messages: [],
      activity: [],
      activityPagination: null,
      permissions: null,
    }),

  // ─────────────────────────────────────────────────────
  // ADMIN — Projects
  // ─────────────────────────────────────────────────────

  fetchProjects: async (params = {}) => {
    get().setLoading('projects', true);
    set({ error: null });
    try {
      const mergedParams = { ...get().filters, ...params };
      const res = await projectsAPI.adminGetProjects(mergedParams);
      set({
        projects: res.data.data,
        pagination: {
          current_page: res.data.current_page,
          last_page: res.data.last_page,
          per_page: res.data.per_page,
          total: res.data.total,
        },
      });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load projects.' });
    } finally {
      get().setLoading('projects', false);
    }
  },

  fetchStatistics: async () => {
    get().setLoading('statistics', true);
    try {
      const res = await projectsAPI.adminGetProjectStatistics();
      set({ statistics: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load statistics.' });
    } finally {
      get().setLoading('statistics', false);
    }
  },

  // Fetch a small slice of projects for the dashboard without touching the
  // shared `projects` / `pagination` / `filters` state used by the list page.
  fetchRecentProjects: async (params = {}) => {
    get().setLoading('statistics', true); // reuse statistics spinner — no separate key needed
    try {
      const res = await projectsAPI.adminGetProjects({ per_page: 5, ...params });
      set({ recentProjects: res.data.data || [] });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load recent projects.' });
    } finally {
      get().setLoading('statistics', false);
    }
  },
  
  fetchProject: async (id) => {
    get().setLoading('project', true);
    set({ error: null });
    try {
      const res = await projectsAPI.adminGetProject(id);
      const project = res.data.data;
      set({
        activeProject: project,
        participants: project.participants || [],
        links: project.links || [],
        items: project.items || [],
        tasks: project.tasks || [],
        milestones: project.milestones || [],
        messages: project.messages || [],
        activity: project.activity || [],
      });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load project.' });
    } finally {
      get().setLoading('project', false);
    }
  },

  createProject: async (data) => {
    get().setLoading('submitting', true);
    set({ error: null });
    try {
      const res = await projectsAPI.adminCreateProject(data);
      const newProject = res.data.data;
      set((state) => ({ projects: [newProject, ...state.projects] }));
      return { success: true, data: newProject };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to create project.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  updateProject: async (id, data) => {
    get().setLoading('submitting', true);
    set({ error: null });
    try {
      const res = await projectsAPI.adminUpdateProject(id, data);
      const updated = res.data.data;
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        activeProject: state.activeProject?.id === id ? updated : state.activeProject,
      }));
      return { success: true, data: updated };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to update project.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  deleteProject: async (id) => {
      get().setLoading('submitting', true);
      try {
        await projectsAPI.adminDeleteProject(id);
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
        }));
        return { success: true };
      } catch (err) {
        const error = err.response?.data?.message || 'Failed to delete project.';
        set({ error });
        return { success: false, error };
      } finally {
        get().setLoading('submitting', false);
      }
    },
  
    forceDeleteProject: async (id) => {
      get().setLoading('submitting', true);
      try {
        await projectsAPI.adminForceDeleteProject(id);
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          // Also remove from trash list if it was there
          trashedProjects: state.trashedProjects.filter((p) => p.id !== id),
        }));
        return { success: true };
      } catch (err) {
        const error = err.response?.data?.message || 'Failed to permanently delete project.';
        set({ error });
        return { success: false, error };
      } finally {
        get().setLoading('submitting', false);
      }
    },
  
    // ─────────────────────────────────────────────────────
    // ADMIN — Trash (soft-deleted projects)
    // Visible to admin + super_admin. Restore by any of them.
    // Permanent delete by super_admin only (forceDeleteProject).
    // ─────────────────────────────────────────────────────
  
    fetchTrashedProjects: async (params = {}) => {
      get().setLoading('trash', true);
      set({ error: null });
      try {
        const res = await projectsAPI.adminGetTrashedProjects(params);
        set({
          trashedProjects: res.data.data,
          trashedPagination: {
            current_page: res.data.current_page,
            last_page: res.data.last_page,
            per_page: res.data.per_page,
            total: res.data.total,
          },
        });
      } catch (err) {
        set({ error: err.response?.data?.message || 'Failed to load trash.' });
      } finally {
        get().setLoading('trash', false);
      }
    },
  
    restoreProject: async (id) => {
      get().setLoading('submitting', true);
      try {
        const res = await projectsAPI.adminRestoreProject(id);
        // Remove from trash list immediately
        set((state) => ({
          trashedProjects: state.trashedProjects.filter((p) => p.id !== id),
        }));
        return { success: true };
      } catch (err) {
        const error = err.response?.data?.message || 'Failed to restore project.';
        set({ error });
        return { success: false, error };
      } finally {
        get().setLoading('submitting', false);
      }
    },

  transferOwnership: async (id, data) => {
    get().setLoading('submitting', true);
    try {
      await projectsAPI.adminTransferOwnership(id, data);
      if (get().activeProject?.id === id) {
        await get().fetchProject(id);
      }
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to transfer ownership.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  // ─────────────────────────────────────────────────────
  // ADMIN — Activity
  // ─────────────────────────────────────────────────────

  fetchActivity: async (projectId, params = {}) => {
    get().setLoading('activity', true);
    try {
      const res = await projectsAPI.adminGetProjectActivity(projectId, params);
      set({
        activity: res.data.data,
        activityPagination: {
          current_page: res.data.current_page,
          last_page: res.data.last_page,
          total: res.data.total,
        },
      });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load activity.' });
    } finally {
      get().setLoading('activity', false);
    }
  },

  // ─────────────────────────────────────────────────────
  // ADMIN — Participants
  // ─────────────────────────────────────────────────────

  fetchParticipants: async (projectId) => {
    get().setLoading('participants', true);
    try {
      const res = await projectsAPI.adminGetParticipants(projectId);
      set({ participants: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load participants.' });
    } finally {
      get().setLoading('participants', false);
    }
  },

  addAdminParticipant: async (projectId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminAddAdminParticipant(projectId, data);
      set((state) => ({ participants: [...state.participants, res.data.data] }));
      return { success: true, data: res.data.data };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to add participant.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  addCustomerParticipant: async (projectId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminAddCustomerParticipant(projectId, data);
      set((state) => ({ participants: [...state.participants, res.data.data] }));
      return { success: true, data: res.data.data };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to add participant.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  updateParticipant: async (projectId, participantId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminUpdateParticipant(projectId, participantId, data);
      set((state) => ({
        participants: state.participants.map((p) =>
          p.id === participantId ? res.data.data : p
        ),
      }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to update participant.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  removeParticipant: async (projectId, participantId) => {
    get().setLoading('submitting', true);
    try {
      await projectsAPI.adminRemoveParticipant(projectId, participantId);
      set((state) => ({
        participants: state.participants.filter((p) => p.id !== participantId),
      }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to remove participant.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  forceDeleteParticipant: async (projectId, participantId) => {
    get().setLoading('submitting', true);

    try {
      await projectsAPI.adminForceDeleteParticipant(projectId, participantId);

      set((state) => ({
        participants: state.participants.filter(p => p.id !== participantId)
      }));

      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Delete failed';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  // ─────────────────────────────────────────────────────
  // ADMIN — Links
  // ─────────────────────────────────────────────────────

  fetchLinks: async (projectId) => {
    get().setLoading('links', true);
    try {
      const res = await projectsAPI.adminGetLinks(projectId);
      set({ links: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load links.' });
    } finally {
      get().setLoading('links', false);
    }
  },

  addLink: async (projectId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminAddLink(projectId, data);
      set((state) => ({ links: [...state.links, res.data.data] }));
      return { success: true, data: res.data.data };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to add link.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  deleteLink: async (projectId, linkId) => {
    get().setLoading('submitting', true);
    try {
      await projectsAPI.adminDeleteLink(projectId, linkId);
      set((state) => ({ links: state.links.filter((l) => l.id !== linkId) }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to remove link.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  // ─────────────────────────────────────────────────────
  // ADMIN — Items
  // ─────────────────────────────────────────────────────

  fetchItems: async (projectId, params = {}) => {
    get().setLoading('items', true);
    try {
      const res = await projectsAPI.adminGetItems(projectId, params);
      set({ items: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load items.' });
    } finally {
      get().setLoading('items', false);
    }
  },

  createItem: async (projectId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminCreateItem(projectId, data);
      set((state) => ({ items: [...state.items, res.data.data] }));
      return { success: true, data: res.data.data };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to create item.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  updateItem: async (projectId, itemId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminUpdateItem(projectId, itemId, data);
      set((state) => ({
        items: state.items.map((i) => (i.id === itemId ? res.data.data : i)),
      }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to update item.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  deleteItem: async (projectId, itemId) => {
    get().setLoading('submitting', true);
    try {
      await projectsAPI.adminDeleteItem(projectId, itemId);
      set((state) => ({ items: state.items.filter((i) => i.id !== itemId) }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to delete item.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  // ─────────────────────────────────────────────────────
  // ADMIN — Tasks
  // ─────────────────────────────────────────────────────

  fetchTasks: async (projectId, params = {}) => {
    get().setLoading('tasks', true);
    try {
      const res = await projectsAPI.adminGetTasks(projectId, params);
      set({ tasks: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load tasks.' });
    } finally {
      get().setLoading('tasks', false);
    }
  },

  createTask: async (projectId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminCreateTask(projectId, data);
      set((state) => ({ tasks: [res.data.data, ...state.tasks] }));
      return { success: true, data: res.data.data };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to create task.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  updateTask: async (projectId, taskId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminUpdateTask(projectId, taskId, data);
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? res.data.data : t)),
      }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to update task.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  deleteTask: async (projectId, taskId) => {
    get().setLoading('submitting', true);
    try {
      await projectsAPI.adminDeleteTask(projectId, taskId);
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to delete task.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  // ─────────────────────────────────────────────────────
  // ADMIN — Milestones
  // ─────────────────────────────────────────────────────

  fetchMilestones: async (projectId, params = {}) => {
    get().setLoading('milestones', true);
    try {
      const res = await projectsAPI.adminGetMilestones(projectId, params);
      set({ milestones: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load milestones.' });
    } finally {
      get().setLoading('milestones', false);
    }
  },

  createMilestone: async (projectId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminCreateMilestone(projectId, data);
      set((state) => ({ milestones: [...state.milestones, res.data.data] }));
      return { success: true, data: res.data.data };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to create milestone.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  updateMilestone: async (projectId, milestoneId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminUpdateMilestone(projectId, milestoneId, data);
      set((state) => ({
        milestones: state.milestones.map((m) =>
          m.id === milestoneId ? res.data.data : m
        ),
      }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to update milestone.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  approveMilestone: async (projectId, milestoneId, data = {}) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminApproveMilestone(projectId, milestoneId, data);
      set((state) => ({
        milestones: state.milestones.map((m) =>
          m.id === milestoneId ? res.data.data : m
        ),
      }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to approve milestone.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  rejectMilestone: async (projectId, milestoneId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminRejectMilestone(projectId, milestoneId, data);
      set((state) => ({
        milestones: state.milestones.map((m) =>
          m.id === milestoneId ? res.data.data : m
        ),
      }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to reject milestone.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  forceDeleteMilestones: async (projectId, ids) => {
    get().setLoading('submitting', true);

    try {
      await projectsAPI.adminForceDeleteMilestones(projectId, ids);

      set((state) => ({
        milestones: state.milestones.filter((m) => !ids.includes(m.id))
      }));

      return { success: true };

    } catch (err) {
      const error = err.response?.data?.message || 'Failed to delete milestones.';
      set({ error });
      return { success: false, error };

    } finally {
      get().setLoading('submitting', false);
    }
  },

  // ─────────────────────────────────────────────────────
  // ADMIN — Messages
  // ─────────────────────────────────────────────────────
  fetchMessages: async (projectId, params = {}) => {
    get().setLoading('messages', true);
    try {
      const res = await projectsAPI.adminGetMessages(projectId, params);
      set({ messages: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load messages.' });
    } finally {
      get().setLoading('messages', false);
    }
  },

  postMessage: async (projectId, data) => {
    get().setLoading('submitting', true);

    try {
      const formData = new FormData();

      formData.append('message', data.message ?? '');
      formData.append('visibility', data.visibility ?? 'customer');

      data.files?.forEach((file) => {
        formData.append('files[]', file);
      });

      if (data.url) {
        formData.append('url', data.url);
      }

      const res = await projectsAPI.adminPostMessage(projectId, formData);

      set((state) => ({
        messages: [...state.messages, res.data.data]
      }));

      return { success: true, data: res.data.data };

    } catch (err) {
      const error = err.response?.data?.message || 'Failed to send message.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  editMessage: async (projectId, messageId, text) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.adminUpdateMessage(projectId, messageId, { message: text });
      set((state) => ({
        messages: state.messages.map((m) => m.id === messageId ? res.data.data : m),
      }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to edit message.';
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  deleteMessage: async (projectId, messageId) => {
    get().setLoading('submitting', true);
    try {
      await projectsAPI.adminDeleteMessage(projectId, messageId);
      set((state) => ({ messages: state.messages.filter((m) => m.id !== messageId) }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to delete message.';
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  deleteMessages: async (projectId, ids) => {
    try {
      await projectsAPI.adminDeleteMessages(projectId, ids);
      set((state) => ({ messages: state.messages.filter((m) => !ids.includes(m.id)) }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to delete messages.';
      return { success: false, error };
    }
  },

  clearChat: async (projectId) => {
    get().setLoading('submitting', true);
    try {
      await projectsAPI.adminClearChat(projectId);
      set({ messages: [] });
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to clear chat.';
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  // ─────────────────────────────────────────────────────
  // CUSTOMER — Projects
  // ─────────────────────────────────────────────────────

  customerFetchProjects: async (params = {}) => {
    get().setLoading('projects', true);
    set({ error: null });
    try {
      const res = await projectsAPI.customerGetProjects(params);
      set({
        projects: res.data.data,
        pagination: {
          current_page: res.data.current_page,
          last_page: res.data.last_page,
          per_page: res.data.per_page,
          total: res.data.total,
        },
      });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load projects.' });
    } finally {
      get().setLoading('projects', false);
    }
  },

  customerCreateProject: async (data) => {
    get().setLoading('submitting', true);
    set({ error: null });
    try {
      const res = await projectsAPI.customerCreateProject(data);
      const newProject = res.data.data;
      set((state) => ({ projects: [newProject, ...state.projects] }));
      return { success: true, data: newProject };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to create project.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  customerFetchProject: async (id) => {
    get().setLoading('project', true);
    set({ error: null });
    try {
      const res = await projectsAPI.customerGetProject(id);
      const project = res.data.data;
      set({
        activeProject: project,
        permissions: project._permissions || null,
        participants: project.participants || [],
        links: project.links || [],
        items: project.items || [],
        tasks: project.tasks || [],
        milestones: project.milestones || [],
      });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load project.' });
    } finally {
      get().setLoading('project', false);
    }
  },

  // ─────────────────────────────────────────────────────
  // CUSTOMER — Participants
  // ─────────────────────────────────────────────────────

  customerFetchParticipants: async (projectId) => {
    get().setLoading('participants', true);
    try {
      const res = await projectsAPI.customerGetParticipants(projectId);
      set({ participants: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load participants.' });
    } finally {
      get().setLoading('participants', false);
    }
  },

  customerInviteParticipant: async (projectId, data) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.customerInviteParticipant(projectId, data);
      set((state) => ({ participants: [...state.participants, res.data.data] }));
      return { success: true, data: res.data.data };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to send invitation.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  // ─────────────────────────────────────────────────────
  // CUSTOMER — Messages
  // ─────────────────────────────────────────────────────

  customerFetchMessages: async (projectId) => {
    get().setLoading('messages', true);
    try {
      const res = await projectsAPI.customerGetMessages(projectId);
      set({ messages: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load messages.' });
    } finally {
      get().setLoading('messages', false);
    }
  },

  customerPostMessage: async (projectId, data) => {
    get().setLoading('submitting', true);

    try {
      const formData = new FormData();

      formData.append('message', data.message ?? '');

      data.files?.forEach((file) => {
        formData.append('files[]', file);
      });

      if (data.url) {
        formData.append('url', data.url);
      }

      const res = await projectsAPI.customerPostMessage(projectId, formData);

      set((state) => ({
        messages: [...state.messages, res.data.data]
      }));

      return { success: true, data: res.data.data };

    } catch (err) {
      const error = err.response?.data?.message || 'Failed to send message.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  customerEditMessage: async (projectId, messageId, text) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.customerUpdateMessage(projectId, messageId, { message: text });
      set((state) => ({
        messages: state.messages.map((m) => m.id === messageId ? res.data.data : m),
      }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to edit message.';
      toast.error(error);
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  customerDeleteMessage: async (projectId, messageId) => {
    get().setLoading('submitting', true);
    try {
      await projectsAPI.customerDeleteMessage(projectId, messageId);
      set((state) => ({ messages: state.messages.filter((m) => m.id !== messageId) }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to delete message.';
      toast.error(error);
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  customerDeleteMessages: async (projectId, ids) => {
    try {
      await projectsAPI.customerDeleteMessages(projectId, ids);
      set((state) => ({ messages: state.messages.filter((m) => !ids.includes(m.id)) }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to delete messages.';
      toast.error(error);
      return { success: false, error };
    }
  },

  // ─────────────────────────────────────────────────────
  // CUSTOMER — Read-only content
  // ─────────────────────────────────────────────────────

  customerFetchItems: async (projectId) => {
    get().setLoading('items', true);
    try {
      const res = await projectsAPI.customerGetItems(projectId);
      set({ items: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load items.' });
    } finally {
      get().setLoading('items', false);
    }
  },

  customerFetchTasks: async (projectId) => {
    get().setLoading('tasks', true);
    try {
      const res = await projectsAPI.customerGetTasks(projectId);
      set({ tasks: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load tasks.' });
    } finally {
      get().setLoading('tasks', false);
    }
  },

  customerFetchMilestones: async (projectId) => {
    get().setLoading('milestones', true);
    try {
      const res = await projectsAPI.customerGetMilestones(projectId);
      set({ milestones: res.data.data });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Failed to load milestones.' });
    } finally {
      get().setLoading('milestones', false);
    }
  },

  customerApproveMilestone: async (projectId, milestoneId, data = {}) => {
    get().setLoading('submitting', true);
    try {
      const res = await projectsAPI.customerApproveMilestone(projectId, milestoneId, data);
      set((state) => ({
        milestones: state.milestones.map((m) =>
          m.id === milestoneId ? res.data.data : m
        ),
      }));
      return { success: true };
    } catch (err) {
      const error = err.response?.data?.message || 'Failed to approve milestone.';
      set({ error });
      return { success: false, error };
    } finally {
      get().setLoading('submitting', false);
    }
  },

  CustomerForceDeleteMilestones: async (projectId, ids) => {
    get().setLoading('submitting', true);

    try {
      await projectsAPI.customerForceDeleteMilestones(projectId, ids);

      set((state) => ({
        milestones: state.milestones.filter((m) => !ids.includes(m.id))
      }));

      return { success: true };

    } catch (err) {
      const error = err.response?.data?.message || 'Failed to delete milestones.';
      set({ error });
      return { success: false, error };

    } finally {
      get().setLoading('submitting', false);
    }
  },

}));

export default useProjectStore;