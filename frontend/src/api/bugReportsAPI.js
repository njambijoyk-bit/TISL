/**
 * bugReportsAPI.js
 * ─────────────────────────────────────────────────────────────────
 * All Bug Report module endpoints:
 *   - Public      (no auth)
 *   - Dev gated   (X-Dev-Token header, no Laravel auth)
 *   - Customer    (auth:sanctum)
 *   - Admin       (auth:sanctum + role)
 *
 * Depends on the shared `api` axios instance (same as auctionsAPI.js).
 * Dev session token is read from sessionStorage key: 'dev_token'.
 * ─────────────────────────────────────────────────────────────────
 */

import api from './axios';

// ─── helpers ────────────────────────────────────────────────────

/**
 * Returns headers for dev-gated requests.
 * Reads the cached session token from sessionStorage.
 * Throws if no token is present — caller should redirect to /dev/auth.
 */
function devHeaders() {
  const token = sessionStorage.getItem('dev_token');
  if (!token) {
    throw new Error('DEV_SESSION_MISSING');
  }
  return { 'X-Dev-Token': token };
}

/**
 * Saves the dev session token to sessionStorage after successful auth.
 */
export function saveDevToken(token) {
  sessionStorage.setItem('dev_token', token);
}

/**
 * Clears the dev session token (logout from dev portal).
 */
export function clearDevToken() {
  sessionStorage.removeItem('dev_token');
}

/**
 * Returns true if a dev session token is currently stored.
 */
export function hasDevToken() {
  return Boolean(sessionStorage.getItem('dev_token'));
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC — no auth required
// ═══════════════════════════════════════════════════════════════

/**
 * Submit a new bug report.
 * Works for guests, customers, and admins.
 *
 * @param {Object} data
 * @param {string}  data.title           required
 * @param {string}  data.description     required
 * @param {string}  [data.page_url]
 * @param {string}  [data.screenshot_url]
 * @param {string}  [data.guest_name]    required if not authenticated
 * @param {string}  [data.guest_email]   required if not authenticated
 *
 * @returns {{ message, report_number, tracking_token, status }}
 */
export async function submitReport(data) {
  const res = await api.post('/bug-reports', data);
  return res.data;
}

/**
 * Track a bug report by its tracking token (public — for guests).
 *
 * @param {string} token  UUID tracking token returned on submit
 * @returns {{ report_number, title, status, priority, created_at, history[] }}
 */
export async function trackReport(token) {
  const res = await api.get(`/bug-reports/track/${token}`);
  return res.data;
}

// ═══════════════════════════════════════════════════════════════
// DEV GATED — X-Dev-Token header, no Laravel auth
// ═══════════════════════════════════════════════════════════════

/**
 * Authenticate with the one-time dev access key.
 * On success: save the returned dev_token via saveDevToken().
 * On failure: check key_reset flag — if true, admin has a new key waiting.
 *
 * @param {string} key  Raw one-time key from admin board
 * @returns {{ message, dev_token?, expires_in?, key_reset? }}
 */
export async function devAuth(key) {
  const res = await api.post('/dev/auth', { key });
  return res.data;
}

/**
 * List dev notes (dev portal view).
 *
 * @param {Object} [params]
 * @param {string} [params.status]        pending|in_progress|done|cosmetic|no_error|wont_fix
 * @param {string} [params.type]          pr_opened|pr_closed|branch_created|...|general|observation
 * @param {boolean}[params.linked]        true = linked to a bug report, false = standalone
 * @param {number} [params.bug_report_id]
 * @param {number} [params.per_page]      default 20
 * @param {number} [params.page]
 *
 * @returns paginated DevNote list
 */
export async function devGetNotes(params = {}) {
  const res = await api.get('/dev/notes', {
    params,
    headers: devHeaders(),
  });
  return res.data;
}

/**
 * Create a dev note (entered by the dev via gated UX).
 *
 * @param {Object} data
 * @param {string}  data.title           required
 * @param {string}  [data.description]
 * @param {string}  [data.type]          default 'general'
 * @param {string}  [data.status]        default 'pending'
 * @param {number}  [data.bug_report_id]
 * @param {string}  [data.pr_number]
 * @param {string}  [data.pr_url]
 * @param {string}  [data.branch_name]
 * @param {string}  [data.git_url]
 * @param {string}  [data.commit_hash]
 *
 * @returns {{ message, note }}
 */
export async function devCreateNote(data) {
  const res = await api.post('/dev/notes', data, {
    headers: devHeaders(),
  });
  return res.data;
}

/**
 * Update a dev note (entered by the dev via gated UX).
 *
 * @param {number} id
 * @param {Object} data  same shape as devCreateNote (all fields optional)
 * @returns {{ message, note }}
 */
export async function devUpdateNote(id, data) {
  const res = await api.put(`/dev/notes/${id}`, data, {
    headers: devHeaders(),
  });
  return res.data;
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER — auth:sanctum
// ═══════════════════════════════════════════════════════════════

/**
 * List the authenticated customer's own bug reports.
 *
 * @param {Object} [params]
 * @param {number} [params.per_page]  default 15
 * @param {number} [params.page]
 *
 * @returns paginated BugReport list (with statusHistory)
 */
export async function customerGetReports(params = {}) {
  const res = await api.get('/customer/bug-reports', { params });
  return res.data;
}

/**
 * Get a single bug report belonging to the authenticated customer.
 *
 * @param {number} id
 * @returns BugReport (with statusHistory)
 */
export async function customerGetReport(id) {
  const res = await api.get(`/customer/bug-reports/${id}`);
  return res.data;
}

// ═══════════════════════════════════════════════════════════════
// ADMIN — auth:sanctum + role (admin, super_admin, manager, finance)
// ═══════════════════════════════════════════════════════════════

// ── Bug Reports ─────────────────────────────────────────────────

/**
 * List all bug reports (admin).
 *
 * @param {Object} [params]
 * @param {string} [params.status]     open|in_progress|resolved|wont_fix
 * @param {string} [params.priority]   low|medium|high|critical
 * @param {string} [params.search]     searches title, report_number, guest_email
 * @param {string} [params.sort]       default 'created_at'
 * @param {string} [params.dir]        'asc'|'desc', default 'desc'
 * @param {number} [params.per_page]   default 20
 * @param {number} [params.page]
 *
 * @returns paginated BugReport list (with customer, user, devNote, statusHistory count)
 */
export async function adminGetReports(params = {}) {
  const res = await api.get('/admin/bug-reports', { params });
  return res.data;
}

/**
 * Get a single bug report with full relations (admin).
 *
 * @param {number} id
 * @returns BugReport with customer, user, statusHistory (+ changedBy), devNote (+ enteredBy)
 */
export async function adminGetReport(id) {
  const res = await api.get(`/admin/bug-reports/${id}`);
  return res.data;
}

/**
 * Update a bug report's status.
 *
 * @param {number} id
 * @param {Object} data
 * @param {string}  data.status   open|in_progress|resolved|wont_fix
 * @param {string}  [data.note]   optional note shown in status history
 *
 * @returns {{ message, report }}
 */
export async function adminUpdateStatus(id, data) {
  const res = await api.patch(`/admin/bug-reports/${id}/status`, data);
  return res.data;
}

/**
 * Update a bug report's priority.
 *
 * @param {number} id
 * @param {string} priority  low|medium|high|critical
 *
 * @returns {{ message, report }}
 */
export async function adminUpdatePriority(id, priority) {
  const res = await api.patch(`/admin/bug-reports/${id}/priority`, { priority });
  return res.data;
}

/**
 * Soft-delete a bug report (admin).
 *
 * @param {number} id
 * @returns {{ message }}
 */
export async function adminDeleteReport(id) {
  const res = await api.delete(`/admin/bug-reports/${id}`);
  return res.data;
}

// ── Dev Notes (admin entering on behalf of dev) ─────────────────

/**
 * List dev notes (admin view).
 *
 * @param {Object} [params]
 * @param {string}  [params.status]
 * @param {string}  [params.type]
 * @param {boolean} [params.linked]        true/false
 * @param {number}  [params.bug_report_id]
 * @param {number}  [params.per_page]      default 20
 * @param {number}  [params.page]
 *
 * @returns paginated DevNote list (with bugReport, enteredBy)
 */
export async function adminGetDevNotes(params = {}) {
  const res = await api.get('/admin/dev-notes', { params });
  return res.data;
}

/**
 * Create a dev note (admin entering on behalf of dev).
 *
 * @param {Object} data  same shape as devCreateNote
 * @returns {{ message, note }}
 */
export async function adminCreateDevNote(data) {
  const res = await api.post('/admin/dev-notes', data);
  return res.data;
}

/**
 * Update a dev note (admin).
 *
 * @param {number} id
 * @param {Object} data
 * @returns {{ message, note }}
 */
export async function adminUpdateDevNote(id, data) {
  const res = await api.put(`/admin/dev-notes/${id}`, data);
  return res.data;
}

/**
 * Update only the status of a dev note (admin).
 *
 * @param {number} id
 * @param {string} status  pending|in_progress|done|cosmetic|no_error|wont_fix
 *
 * @returns {{ message, note }}
 */
export async function adminUpdateDevNoteStatus(id, status) {
  const res = await api.patch(`/admin/dev-notes/${id}/status`, { status });
  return res.data;
}

/**
 * Soft-delete a dev note (admin).
 *
 * @param {number} id
 * @returns {{ message }}
 */
export async function adminDeleteDevNote(id) {
  const res = await api.delete(`/admin/dev-notes/${id}`);
  return res.data;
}

// ── Dev Access Keys ──────────────────────────────────────────────

/**
 * Get the currently active dev access key for display on the admin board.
 * If no key exists, the backend auto-generates one.
 *
 * @returns {{ raw_key, key_preview, failed_attempts, remaining, generated_at }}
 */
export async function adminGetActiveKey() {
  const res = await api.get('/admin/dev-keys/active');
  return res.data;
}

/**
 * Manually regenerate the dev access key (admin).
 * Deactivates the current key and issues a new one.
 *
 * @returns {{ message, raw_key, key_preview, generated_at }}
 */
export async function adminRegenerateKey() {
  const res = await api.post('/admin/dev-keys/regenerate');
  return res.data;
}

/**
 * Get paginated dev access key attempt logs.
 *
 * @param {Object} [params]
 * @param {number} [params.per_page]  default 30
 * @param {number} [params.page]
 *
 * @returns paginated DevAccessKeyLog list
 */
export async function adminGetKeyLogs(params = {}) {
  const res = await api.get('/admin/dev-keys/logs', { params });
  return res.data;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS — useful for dropdowns/badges across the module
// ═══════════════════════════════════════════════════════════════

export const BUG_STATUSES = [
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'wont_fix',    label: "Won't Fix" },
];

export const BUG_PRIORITIES = [
  { value: 'low',      label: 'Low' },
  { value: 'medium',   label: 'Medium' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export const DEV_NOTE_TYPES = [
  { value: 'pr_opened',       label: 'PR Opened',       gitFields: ['pr_number', 'pr_url'] },
  { value: 'pr_closed',       label: 'PR Closed',       gitFields: ['pr_number', 'pr_url'] },
  { value: 'branch_created',  label: 'Branch Created',  gitFields: ['branch_name'] },
  { value: 'branch_deleted',  label: 'Branch Deleted',  gitFields: ['branch_name'] },
  { value: 'branch_changed',  label: 'Branch Changed',  gitFields: ['branch_name'] },
  { value: 'git_url',         label: 'Git URL',         gitFields: ['git_url', 'commit_hash'] },
  { value: 'fix',             label: 'Fix',             gitFields: ['commit_hash', 'branch_name'] },
  { value: 'cosmetic',        label: 'Cosmetic',        gitFields: [] },
  { value: 'general',         label: 'General',         gitFields: [] },
  { value: 'observation',     label: 'Observation',     gitFields: [] },
];

export const DEV_NOTE_STATUSES = [
  { value: 'pending',     label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done',        label: 'Done' },
  { value: 'cosmetic',    label: 'Cosmetic' },
  { value: 'no_error',    label: 'No Error' },
  { value: 'wont_fix',    label: "Won't Fix" },
];

/**
 * Given a dev note type value, returns which git-related fields
 * should be shown in the DevNoteForm.
 *
 * @param {string} type
 * @returns {string[]}  array of field names
 */
export function gitFieldsForType(type) {
  return DEV_NOTE_TYPES.find(t => t.value === type)?.gitFields ?? [];
}