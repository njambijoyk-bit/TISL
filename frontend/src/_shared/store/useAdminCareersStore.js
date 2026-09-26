import { create } from 'zustand';
import { adminCareersApi } from '../api/careersApi';

const useAdminCareersStore = create((set, get) => ({
    // ── Jobs ──────────────────────────────────────────────────────────────────
    jobs:        null,   // paginated
    jobsLoading: false,
    currentJob:  null,
    jobLoading:  false,

    fetchJobs: async (params = {}) => {
        set({ jobsLoading: true });
        try {
            const res = await adminCareersApi.getJobs(params);
            set({ jobs: res, jobsLoading: false });
        } catch (err) { set({ jobsLoading: false }); throw err; }
    },

    fetchJob: async (id) => {
        set({ jobLoading: true, currentJob: null });
        try {
            const res = await adminCareersApi.getJob(id);
            set({ currentJob: res.data, jobLoading: false });
        } catch (err) { set({ jobLoading: false }); throw err; }
    },

    createJob: async (data) => {
        const res = await adminCareersApi.createJob(data);
        set((s) => ({ jobs: s.jobs ? { ...s.jobs, data: [res.data, ...(s.jobs.data ?? [])] } : s.jobs }));
        return res;
    },

    updateJob: async (id, data) => {
        const res = await adminCareersApi.updateJob(id, data);
        set((s) => ({
            jobs: s.jobs ? { ...s.jobs, data: s.jobs.data.map((j) => j.id === id ? res.data : j) } : s.jobs,
            currentJob: s.currentJob?.id === id ? res.data : s.currentJob,
        }));
        return res;
    },

    publishJob: async (id) => {
        const res = await adminCareersApi.publishJob(id);
        set((s) => ({
            jobs: s.jobs ? { ...s.jobs, data: s.jobs.data.map((j) => j.id === id ? res.data : j) } : s.jobs,
            currentJob: s.currentJob?.id === id ? res.data : s.currentJob,
        }));
    },

    closeJob: async (id) => {
        const res = await adminCareersApi.closeJob(id);
        set((s) => ({
            jobs: s.jobs ? { ...s.jobs, data: s.jobs.data.map((j) => j.id === id ? res.data : j) } : s.jobs,
        }));
    },

    deleteJob: async (id) => {
        await adminCareersApi.deleteJob(id);
        set((s) => ({
            jobs: s.jobs ? { ...s.jobs, data: s.jobs.data.filter((j) => j.id !== id) } : s.jobs,
        }));
    },

    // ── Applications ──────────────────────────────────────────────────────────
    applications:        null,
    appsLoading:         false,
    currentApp:          null,
    appLoading:          false,
    stats:               null,
    statsLoading:        false,

    fetchApplications: async (params = {}) => {
        set({ appsLoading: true });
        try {
            const res = await adminCareersApi.getApplications(params);
            set({ applications: res, appsLoading: false });
        } catch (err) { set({ appsLoading: false }); throw err; }
    },

    fetchApplication: async (id) => {
        set({ appLoading: true, currentApp: null });
        try {
            const res = await adminCareersApi.getApplication(id);
            set({ currentApp: res.data, appLoading: false });
        } catch (err) { set({ appLoading: false }); throw err; }
    },

    fetchStats: async () => {
        set({ statsLoading: true });
        try {
            const res = await adminCareersApi.getStats();
            set({ stats: res, statsLoading: false });
        } catch (err) { set({ statsLoading: false }); throw err; }
    },

    updateStatus: async (id, data) => {
        const res = await adminCareersApi.updateStatus(id, data);
        set((s) => ({
            applications: s.applications
                ? { ...s.applications, data: s.applications.data.map((a) => a.id === id ? { ...a, status: data.status } : a) }
                : s.applications,
            currentApp: s.currentApp?.id === id ? res.data : s.currentApp,
        }));
        return res;
    },

    addNote: async (id, note) => {
        await adminCareersApi.addNote(id, { note });
        set((s) => ({
            currentApp: s.currentApp?.id === id ? { ...s.currentApp, admin_notes: note } : s.currentApp,
        }));
    },

    screenOne: async (id) => {
        const res = await adminCareersApi.screenOne(id);
        if (res?.data) set({ currentApp: res.data });
        return res;
    },

    rescreen: async (id) => {
        const res = await adminCareersApi.rescreen(id);
        if (res?.data) set({ currentApp: res.data });
        return res;
    },

    screenBatch: async (jobId) => {
        return adminCareersApi.screenBatch(jobId);
    },

    // Poll for AI result after screening is dispatched
    pollForResult: async (id, attempts = 10, interval = 3000) => {
        for (let i = 0; i < attempts; i++) {
            await new Promise((r) => setTimeout(r, interval));
            const res = await adminCareersApi.getApplication(id);
            if (res.data.ai_screened_at) {
                set({ currentApp: res.data });
                return res.data;
            }
        }
        return null; // timed out
    },
}));

export default useAdminCareersStore;