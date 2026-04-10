import api from './axios';

/**
 * Work API
 * Centralised work context for all admin users.
 *
 * myDashboard()       → own employee record + assignments + deadlines + activity
 * myAssignments()     → assignments only (profile tab refresh)
 * myDeadlines()       → personal deadlines only
 * teamOverview()      → full team load (admin / super_admin only)
 *
 * Assignments include: customers, orders, quotes, quoteRequests, projects, tasks, milestones, tickets
 */

const workAPI = {
  /**
   * Full personal dashboard — replaces the scattered Promise.allSettled calls
   * in AdminProfile.jsx.
   * Returns: { employee, assignments, deadlines, activity }
   * 
   * assignments: { customers, orders, quotes, quoteRequests, projects, tasks, milestones, tickets, counts }
   * deadlines: { projects, quotes, milestones, tasks, tickets }
   */
  myDashboard: async () => {
    const response = await api.get('/admin/work/dashboard');
    return response.data;
  },

  /**
   * Assignments only — lighter call for tab refresh.
   * Returns: { customers, orders, quotes, quoteRequests, projects, tasks, milestones, tickets, counts }
   */
  myAssignments: async () => {
    const response = await api.get('/admin/work/assignments');
    return response.data;
  },

  /**
   * Personal upcoming deadlines.
   * Returns: { projects: [], quotes: [], milestones: [], tasks: [], tickets: [] }
   */
  myDeadlines: async () => {
    const response = await api.get('/admin/work/deadlines');
    return response.data;
  },

  /**
   * Team overview — admin / super_admin only.
   * Returns: { team_load, unassigned, deadlines, activity }
   * 
   * unassigned: { orders, quotes, quoteRequests, tasks, tickets, counts }
   */
  teamOverview: async () => {
    const response = await api.get('/admin/work/overview');
    return response.data;
  },
};

export default workAPI;