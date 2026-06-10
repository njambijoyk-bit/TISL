import api from './axios';

const logExportAPI = {
    getMeta() {
        return api.get('/admin/logs/export/meta');
    },
    export(format, logs) {
        return api.post('/admin/logs/export', { format, logs }, {
            responseType: format === 'csv' ? 'blob' : 'blob',
        });
    },
};

export default logExportAPI;