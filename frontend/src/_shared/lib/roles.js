/**
 * Role groups — mirror the backend route groups in routes/api.php so the UI
 * hides what the API would refuse anyway.
 */
export const FINANCE_READ  = ['finance', 'manager', 'admin', 'super_admin'];
export const FINANCE_WRITE = ['finance', 'admin', 'super_admin'];

// Payroll is seen and run by the super admin and finance only (not admin, not manager)
export const PAYROLL_ROLES = ['finance', 'super_admin'];
export const canUsePayroll = (user) => PAYROLL_ROLES.includes(user?.role);

// Campaigns: these build them (admin, super admin and manager also publish; sales rep and finance make drafts for approval)
export const CAMPAIGN_ROLES = ['admin', 'super_admin', 'manager', 'sales_rep', 'finance'];

// Price lists, the Archive, brochures and catalogues (a sales rep's list waits for someone else to activate it)
export const PRICE_ROLES = ['admin', 'super_admin', 'manager', 'finance', 'sales_rep'];

export const canReadFinance  = (user) => FINANCE_READ.includes(user?.role);
export const canWriteFinance = (user) => FINANCE_WRITE.includes(user?.role);

// Deleting catalogue items (products, services, categories, brands, variants, images)
export const CATALOGUE_DELETE = ['manager', 'admin', 'super_admin'];
export const canDeleteCatalogue = (user) => CATALOGUE_DELETE.includes(user?.role);

// Acting on a customer's credit (payments, adjustments, schedules, invoices,
// add credit / loyalty points). Every staff role can still view credit.
export const CREDIT_ACT = ['finance', 'manager', 'admin', 'super_admin'];
export const canActOnCredit = (user) => CREDIT_ACT.includes(user?.role);
