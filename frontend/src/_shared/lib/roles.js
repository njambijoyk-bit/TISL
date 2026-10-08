import useAuthStore from '../store/authStore';

/**
 * What a person may do comes from the authorization engine (clearance, roles, permissions), delivered with login and /me as `access`.
 * The role lists below are the fallback for a session that has no `access` yet (and for the screens not yet moved to permissions).
 */
export const LEGACY_STAFF_ROLES = ['admin', 'super_admin', 'manager', 'logistics', 'finance', 'sales_rep'];

const accessOf = () => useAuthStore.getState().access;

/** Every role key the person satisfies: the roles they hold plus the older names those roles still stand for. */
export const effectiveRoles = (user) => {
  const a = accessOf();
  return a?.role_keys?.length ? a.role_keys : (user?.role ? [user.role] : []);
};
export const hasAnyRole = (user, roles) => effectiveRoles(user).some((r) => roles.includes(r));

/** Does the engine give them this permission (for example 'books.post')? Without `access`, `fallbackRoles` decides, as before. */
export const hasPermission = (user, permission, fallbackRoles = []) => {
  const a = accessOf();
  return a?.permissions ? a.permissions.includes(permission) : fallbackRoles.includes(user?.role);
};

/** Staff who may open the admin area (the six original staff roles, and any role that holds admin.access). */
export const isStaff = (user, access = accessOf()) =>
  access?.permissions ? access.permissions.includes('admin.access') : LEGACY_STAFF_ROLES.includes(user?.role);

/** The clearance number 0 to 6 (0 when unknown). */
export const clearanceOf = () => accessOf()?.clearance ?? 0;

/**
 * Role groups — mirror the backend route groups in routes/api.php so the UI
 * hides what the API would refuse anyway.
 */
export const FINANCE_READ  = ['finance', 'manager', 'admin', 'super_admin'];
export const FINANCE_WRITE = ['finance', 'admin', 'super_admin'];

// Payroll is seen and run by the super admin and finance only (not admin, not manager)
export const PAYROLL_ROLES = ['finance', 'super_admin'];
export const canUsePayroll = (user) => hasPermission(user, 'payroll.run', PAYROLL_ROLES);

// Campaigns: these build them (admin, super admin and manager also publish; sales rep and finance make drafts for approval)
export const CAMPAIGN_ROLES = ['admin', 'super_admin', 'manager', 'sales_rep', 'finance'];

// Price lists, the Archive, brochures and catalogues (a sales rep's list waits for someone else to activate it)
export const PRICE_ROLES = ['admin', 'super_admin', 'manager', 'finance', 'sales_rep'];

export const canReadFinance  = (user) => hasPermission(user, 'books.view', FINANCE_READ);
export const canWriteFinance = (user) => hasPermission(user, 'books.post', FINANCE_WRITE);

// Deleting catalogue items (products, services, categories, brands, variants, images)
export const CATALOGUE_DELETE = ['manager', 'admin', 'super_admin'];
export const canDeleteCatalogue = (user) => hasPermission(user, 'catalogue.delete', CATALOGUE_DELETE);

// Acting on a customer's credit (payments, adjustments, schedules, invoices,
// add credit / loyalty points). Every staff role can still view credit.
export const CREDIT_ACT = ['finance', 'manager', 'admin', 'super_admin'];
export const canActOnCredit = (user) => hasPermission(user, 'credit.act', CREDIT_ACT);
