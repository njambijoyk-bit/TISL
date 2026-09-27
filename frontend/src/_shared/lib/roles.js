/**
 * Role groups — mirror the backend route groups in routes/api.php so the UI
 * hides what the API would refuse anyway.
 */
export const FINANCE_READ  = ['finance', 'manager', 'admin', 'super_admin'];
export const FINANCE_WRITE = ['finance', 'admin', 'super_admin'];

export const canReadFinance  = (user) => FINANCE_READ.includes(user?.role);
export const canWriteFinance = (user) => FINANCE_WRITE.includes(user?.role);

// Deleting catalogue items (products, services, categories, brands, variants, images)
export const CATALOGUE_DELETE = ['manager', 'admin', 'super_admin'];
export const canDeleteCatalogue = (user) => CATALOGUE_DELETE.includes(user?.role);

// Acting on a customer's credit (payments, adjustments, schedules, invoices,
// add credit / loyalty points). Every staff role can still view credit.
export const CREDIT_ACT = ['finance', 'manager', 'admin', 'super_admin'];
export const canActOnCredit = (user) => CREDIT_ACT.includes(user?.role);
