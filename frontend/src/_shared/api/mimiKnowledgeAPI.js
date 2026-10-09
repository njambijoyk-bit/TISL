import api from './axios';

// What Mimi answers from, the questions she could not answer, and the owner's switches (docs/MIMI_LOCAL_LAYER_GUIDE.html).
const mimiKnowledgeAPI = {
    meta:        ()            => api.get('/admin/mimi/kb/meta').then(r => r.data),
    list:        ()            => api.get('/admin/mimi/kb').then(r => r.data),
    create:      (data)        => api.post('/admin/mimi/kb', data).then(r => r.data),
    update:      (id, data)    => api.put(`/admin/mimi/kb/${id}`, data).then(r => r.data),
    review:      (id)          => api.post(`/admin/mimi/kb/${id}/review`).then(r => r.data),
    remove:      (id)          => api.delete(`/admin/mimi/kb/${id}`).then(r => r.data),
    importFile:  (force = false) => api.post('/admin/mimi/kb/import', { force }).then(r => r.data),
    tryIt:       (data)        => api.post('/admin/mimi/kb/try', data).then(r => r.data),
    gaps:        (days = 30)   => api.get('/admin/mimi/kb/gaps', { params: { days } }).then(r => r.data),
    routing:     ()            => api.get('/admin/mimi/routing').then(r => r.data),
    saveRouting: (rows)        => api.put('/admin/mimi/routing', { rows }).then(r => r.data),
};

export default mimiKnowledgeAPI;
