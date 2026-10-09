import useAuthStore from '../store/authStore';

/**
 * What a person may do comes from the authorization engine (clearance, roles, permissions), delivered with login and /me as `access`.
 * Screens ask for a permission (`hasPermission(user, 'books.post')`) or for the kind of account (`accountType`, `isDriver`, `isCustomer`).
 * They never compare role names: roles are made in the role builder and differ from one company to the next. The server enforces every rule
 * either way; these checks only decide what to show.
 */

const accessOf = () => useAuthStore.getState().access;

/** Does the engine give them this permission (for example 'books.post')? Nothing is allowed until the access summary has loaded. */
export const hasPermission = (_user, permission) => !!accessOf()?.permissions?.includes(permission);

/** Any one of these permissions. */
export const hasAnyPermission = (user, permissions) => permissions.some((p) => hasPermission(user, p));

/** Staff: may open the admin area. */
export const isStaff = (_user, access = accessOf()) => !!access?.permissions?.includes('admin.access');

/**
 * The kind of account: 'staff', 'driver' (uses the driver app, not the admin area), or a portal account ('customer', 'vendor', 'applicant').
 * Null until the access summary has loaded.
 */
export const accountType = (_user, access = accessOf()) => access?.account ?? null;

export const isDriver = (user, access) => accountType(user, access) === 'driver';
export const isCustomer = (user, access) => accountType(user, access) === 'customer';
export const isVendor = (user, access) => accountType(user, access) === 'vendor';

/** A customer, vendor or applicant: they only ever see their own things. */
export const isPortal = (user, access) => ['customer', 'vendor', 'applicant'].includes(accountType(user, access));

/** The name of their main role as the roles table has it (for showing, never for deciding), with the clearance level it sits at. */
export const roleName = (user, access = accessOf()) => {
  const r = access?.roles?.find((x) => x.primary) ?? access?.roles?.[0];
  return r?.name ?? (user?.role ? String(user.role).replace(/_/g, ' ') : '');
};

/**
 * The branch ids a person is limited to in an area ('books', 'stock'), or null when nothing limits them (global role, no branch set, or the
 * limit is off / in test mode for that area). Screens use it to narrow their branch lists; the server enforces it either way.
 */
export const branchLimit = (area) => {
  const a = accessOf();
  if (!a?.scope || a.scope.global || a.scope.open || a.branch_limits?.[area] !== 'on') return null;
  // given cost centres only (no branch): they pick any branch and the server decides by the cost centre
  if (!Object.keys(a.scope.locations ?? {}).length && Object.keys(a.scope.cost_centres ?? {}).length) return null;
  return Object.keys(a.scope.locations ?? {}).map(Number);
};

/** A list of branches ({ id }) cut down to the ones the person may use in this area. `keep` ids stay (the branch a record already has). */
export const limitBranches = (list, area, keep = []) => {
  const ids = branchLimit(area);
  if (!ids) return list;
  const keepSet = new Set((Array.isArray(keep) ? keep : [keep]).filter(Boolean).map(Number));
  return list.filter((b) => ids.includes(Number(b.id)) || keepSet.has(Number(b.id)));
};

/** The clearance number 0 to 6 (0 when unknown). */
export const clearanceOf = () => accessOf()?.clearance ?? 0;

// Named shortcuts for the checks many screens share. Each is one permission from the catalogue.
export const canReadFinance = (user) => hasPermission(user, 'books.view');
export const canWriteFinance = (user) => hasPermission(user, 'books.post');
export const canUsePayroll = (user) => hasPermission(user, 'payroll.run');
export const canDeleteCatalogue = (user) => hasPermission(user, 'catalogue.delete');
export const canEditCatalogue = (user) => hasPermission(user, 'catalogue.edit');
/** Acting on a customer's credit: payments, adjustments, schedules, invoices, add credit / loyalty points. */
export const canActOnCredit = (user) => hasPermission(user, 'credit.act');
