import api from './axios';

const mimiAPI = {

    // ── Sessions ──────────────────────────────────────────────────────────────

    getSessions: (params = {}) =>
        api.get('/admin/mimi/sessions', { params }).then(r => r.data),

    getSessionDetail: (id) =>
        api.get(`/admin/mimi/sessions/${id}`).then(r => r.data),

    // ── Query Logs ────────────────────────────────────────────────────────────

    getQueries: (params = {}) =>
        api.get('/admin/mimi/queries', { params }).then(r => r.data),

    flagQuery: (id, reason) =>
        api.patch(`/admin/mimi/queries/${id}/flag`, { reason }).then(r => r.data),

    unflagQuery: (id) =>
        api.patch(`/admin/mimi/queries/${id}/flag`, { unflag: true, reason: 'unflag' }).then(r => r.data),

    // ── Blocks ────────────────────────────────────────────────────────────────
    searchActors: (type, q) =>
    api.get('/admin/mimi/search-actors', { params: { type, q } }).then(r => r.data),

    getBlocks: (params = {}) =>
        api.get('/admin/mimi/blocks', { params }).then(r => r.data),

    blockActor: (data) =>
        api.post('/admin/mimi/block', data).then(r => r.data),

    unblock: (id) =>
        api.delete(`/admin/mimi/block/${id}`).then(r => r.data),

    // ── Reports ───────────────────────────────────────────────────────────────

    getReports: (params = {}) =>
        api.get('/admin/mimi/reports', { params }).then(r => r.data),
};

export default mimiAPI;