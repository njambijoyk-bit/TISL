import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    applicantAuth,
    portalApi,
    publicApi,
    setApplicantToken,
    clearApplicantToken,
    getApplicantToken,
} from '../api/careersApi';

const useCareersStore = create(
    persist(
        (set, get) => ({
            // ── Applicant Auth ────────────────────────────────────────────────
            applicant:   null,
            authLoading: false,
            authError:   null,

            register: async (data) => {
                set({ authLoading: true, authError: null });
                try {
                    const res = await applicantAuth.register(data);
                    setApplicantToken(res.token);
                    set({ applicant: res.applicant, authLoading: false });
                    return res;
                } catch (err) {
                    set({ authError: err, authLoading: false });
                    throw err;
                }
            },

            login: async (data) => {
                set({ authLoading: true, authError: null });
                try {
                    const res = await applicantAuth.login(data);
                    setApplicantToken(res.token);
                    set({ applicant: res.applicant, authLoading: false });
                    return res;
                } catch (err) {
                    set({ authError: err, authLoading: false });
                    throw err;
                }
            },

            logout: async () => {
                try { await applicantAuth.logout(); } catch (_) {}
                clearApplicantToken();
                set({ applicant: null, applications: [], currentApplication: null });
            },

            fetchMe: async () => {
                if (!getApplicantToken()) return;
                try {
                    const res = await applicantAuth.me();
                    set({ applicant: res.applicant });
                } catch (err) {
                    clearApplicantToken();
                    set({ applicant: null });
                    throw err;                     // ← callers can now .catch()
                }
            },

            isApplicantAuthed: () => !!get().applicant && !!getApplicantToken(),

            updateProfile: async (data) => {
                const res = await portalApi.updateProfile(data);
                set({ applicant: res.applicant });
                return res;
            },

            changePasswordSelf: async (data) => {
                return await portalApi.changePasswordSelf(data);
            },
 
            forgotPassword: async (email) => {
                return await applicantAuth.forgotPassword(email);
            },
 
            resetPassword: async (data) => {
                return await applicantAuth.resetPassword(data);
            },
 
            // Called after login when must_change_password is true
            changePassword: async (data) => {
                const res = await applicantAuth.changePassword(data);
                // Clear the flag in local store state
                set((s) => ({
                    applicant: s.applicant ? { ...s.applicant, must_change_password: false } : null,
                }));
                return res;
            },

            // ── Public Job Board ──────────────────────────────────────────────
            jobs:         null,   // paginated response
            jobFilters:   {},
            jobsLoading:  false,
            currentJob:   null,
            jobLoading:   false,

            fetchJobs: async (params = {}) => {
                set({ jobsLoading: true });
                try {
                    const res = await publicApi.getJobs(params);
                    set({ jobs: res.data, jobFilters: res.filters ?? {}, jobsLoading: false });
                } catch (err) {
                    set({ jobsLoading: false });
                    throw err;
                }
            },

            fetchJob: async (slug) => {
                set({ jobLoading: true, currentJob: null });
                try {
                    const res = await publicApi.getJob(slug);
                    set({ currentJob: res.data, jobLoading: false });
                } catch (err) {
                    set({ jobLoading: false });
                    throw err;
                }
            },

            // ── Applicant Portal ──────────────────────────────────────────────
            applications:        [],
            appsLoading:         false,
            currentApplication:  null,
            appLoading:          false,
            applyLoading:        false,
            uploadLoading:       false,

            fetchMyApplications: async () => {
                set({ appsLoading: true });
                try {
                    const res = await portalApi.myApplications();
                    set({ applications: res.data, appsLoading: false });
                } catch (err) {
                    set({ appsLoading: false });
                    throw err;
                }
            },

            fetchApplication: async (id) => {
                set({ appLoading: true });
                try {
                    const res = await portalApi.getApplication(id);
                    set({ currentApplication: res.data, appLoading: false });
                } catch (err) {
                    set({ appLoading: false });
                    throw err;
                }
            },

            apply: async (jobId, data) => {
                set({ applyLoading: true });
                try {
                    const res = await portalApi.apply(jobId, data);
                    // Prepend to local list
                    set((s) => ({
                        applications: [res.data, ...s.applications],
                        applyLoading: false,
                    }));
                    return res;
                } catch (err) {
                    set({ applyLoading: false });
                    throw err;
                }
            },

            withdraw: async (applicationId) => {
                await portalApi.withdraw(applicationId);
                set((s) => ({
                    applications: s.applications.map((a) =>
                        a.id === applicationId ? { ...a, status: 'withdrawn' } : a
                    ),
                    currentApplication:
                        s.currentApplication?.id === applicationId
                            ? { ...s.currentApplication, status: 'withdrawn' }
                            : s.currentApplication,
                }));
            },

            uploadDocument: async (applicationId, formData) => {
                set({ uploadLoading: true });
                try {
                    const res = await portalApi.uploadDocument(applicationId, formData);
                    // Append doc to currentApplication
                    set((s) => ({
                        uploadLoading: false,
                        currentApplication: s.currentApplication?.id === applicationId
                            ? {
                                ...s.currentApplication,
                                documents: [...(s.currentApplication.documents ?? []), res.data],
                              }
                            : s.currentApplication,
                    }));
                    return res;
                } catch (err) {
                    set({ uploadLoading: false });
                    throw err;
                }
            },
        }),
        {
            name: 'tisl-careers',
            // Only persist the applicant identity — not loading states or lists
            partialize: (s) => ({ applicant: s.applicant }),
        }
    )
);

export default useCareersStore;