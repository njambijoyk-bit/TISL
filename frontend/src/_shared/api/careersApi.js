import api from './axios';
import axios from 'axios';
import { attachSession } from './sessionKit';

// ── Applicant sign-in helpers ─────────────────────────────────────────────────
// The sign-in is a protected cookie of its own. What the browser keeps is a marker that an applicant is signed in ('cookie'), and the CSRF code their changes carry.
// Only with cookie sessions switched off on the server is it the sign-in code itself, sent as a header as before.
const TOKEN_KEY = 'applicant_token';
const CSRF_KEY = 'applicant_csrf';
export const getApplicantToken   = () => localStorage.getItem(TOKEN_KEY);
export const rememberApplicantSession = (res) => {
    localStorage.setItem(TOKEN_KEY, res?.token || 'cookie');
    localStorage.setItem('applicant_mode', res?.token ? 'bearer' : 'cookie');
    if (res?.csrf) localStorage.setItem(CSRF_KEY, res.csrf); else localStorage.removeItem(CSRF_KEY);
};
export const clearApplicantToken = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CSRF_KEY); };

// ── Applicant axios instance ──────────────────────────────────────────────────
const applicant = axios.create({
    baseURL: api.defaults.baseURL,
    headers: {
        Accept:             'application/json',
        'Content-Type':     'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    },
});
attachSession(applicant, { csrfKey: CSRF_KEY, meUrl: '/careers/auth/me', bearerKey: TOKEN_KEY });
applicant.interceptors.response.use(
    (res) => res.data,
    (err) => Promise.reject(err.response?.data ?? err)
);

// ── Admin helper ──────────────────────────────────────────────────────────────
const adm = (method, url, data = null, config = {}) =>
    api({ method, url, data, ...config }).then((r) => r.data);

// ── Public ────────────────────────────────────────────────────────────────────
export const publicApi = {
    getJobs: (params = {}) => applicant.get('/careers/jobs', { params }),
    getJob:  (slug)         => applicant.get(`/careers/jobs/${slug}`),
};

// ── Applicant Auth ────────────────────────────────────────────────────────────
export const applicantAuth = {
    register:       (data) => applicant.post('/careers/auth/register', data),
    login:          (data) => applicant.post('/careers/auth/login', data),
    logout:         ()     => applicant.post('/careers/auth/logout'),
    me:             ()     => applicant.get('/careers/auth/me'),
    
    forgotPassword: (email) => applicant.post('/careers/forgot-password', { email }),
    resetPassword:  (data)  => applicant.post('/careers/reset-password', data),
    changePassword: (data)  => applicant.post('/careers/portal/change-password', data),
};

// ── Applicant Portal ──────────────────────────────────────────────────────────
export const portalApi = {
    apply:          (jobId, data) => applicant.post(`/careers/jobs/${jobId}/apply`, data),
    myApplications: ()            => applicant.get('/careers/applications'),
    getApplication: (id)          => applicant.get(`/careers/applications/${id}`),
    withdraw:       (id)          => applicant.post(`/careers/applications/${id}/withdraw`),
    uploadDocument: (appId, form) => applicant.post(
        `/careers/applications/${appId}/documents`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
    ),
    updateProfile:  (data)        => applicant.patch('/careers/portal/profile', data),
    changePasswordSelf: (data)    => applicant.post('/careers/portal/password', data),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminCareersApi = {
    //jobs
    getJobs:         (params = {}) => adm('GET',    '/admin/careers/jobs',    null, { params }),
    getJob:          (id)          => adm('GET',    `/admin/careers/jobs/${id}`),
    createJob:       (data)        => adm('POST',   '/admin/careers/jobs',    data),
    updateJob:       (id, data)    => adm('PUT',    `/admin/careers/jobs/${id}`, data),
    deleteJob:       (id)          => adm('DELETE', `/admin/careers/jobs/${id}`),
    publishJob:      (id)          => adm('POST',   `/admin/careers/jobs/${id}/publish`),
    closeJob:        (id)          => adm('POST',   `/admin/careers/jobs/${id}/close`),
    restoreJob:      (id)          => adm('POST',   `/admin/careers/jobs/${id}/restore`),
    // Applications
    getApplications: (params = {}) => adm('GET',    '/admin/careers/applications',       null, { params }),
    getStats:        ()            => adm('GET',    '/admin/careers/applications/stats'),
    getApplication:  (id)          => adm('GET',    `/admin/careers/applications/${id}`),
    updateStatus:    (id, data)    => adm('PUT',    `/admin/careers/applications/${id}/status`, data),
    addNote:         (id, data)    => adm('POST',   `/admin/careers/applications/${id}/note`,   data),
    getJobApps:      (jId, p = {}) => adm('GET',    `/admin/careers/jobs/${jId}/applications`,  null, { params: p }),
    screenOne:       (id)          => adm('POST',   `/admin/careers/applications/${id}/screen`),
    rescreen:        (id)          => adm('POST',   `/admin/careers/applications/${id}/rescreen`),
    screenBatch:     (jobId)       => adm('POST',   `/admin/careers/jobs/${jobId}/screen-all`),
    // Applicants
    getApplicants:          (params = {}) => adm('GET',  '/admin/careers/applicants',                    null, { params }),
    getApplicant:           (id)          => adm('GET',  `/admin/careers/applicants/${id}`),
    updateApplicantStatus:  (id, status)  => adm('PATCH',`/admin/careers/applicants/${id}/status`,       { status }),
    resetApplicantPassword: (id, temporary_password) =>
                                             adm('POST', `/admin/careers/applicants/${id}/reset-password`, { temporary_password }),
};

export const pollScreeningResult = async (appId, { onResult, onTimeout, intervalMs = 3000, maxWaitMs = 90000 } = {}) => {
    const start = Date.now();

    const check = async () => {
        const app = await adminCareersApi.getApplication(appId);
        if (app?.data?.ai_screened_at) {
            onResult?.(app.data);
            return;
        }
        if (Date.now() - start >= maxWaitMs) {
            onTimeout?.();
            return;
        }
        setTimeout(check, intervalMs);
    };

    await check();
};

// Named alias used by admin career pages
export const adminApi = adminCareersApi;
 
export default adminCareersApi;