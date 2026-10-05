import api from './axios';

/** The merged activity timeline: every log on the site, each shown only to the roles allowed to see it. */
const activityFeedAPI = {
  list: async (params) => (await api.get('/admin/activity-feed', { params })).data,
};

export default activityFeedAPI;
