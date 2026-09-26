/**
 * Role groups — mirror the backend route groups in routes/api.php so the UI
 * hides what the API would refuse anyway.
 */
export const FINANCE_READ  = ['finance', 'manager', 'admin', 'super_admin'];
export const FINANCE_WRITE = ['finance', 'admin', 'super_admin'];

export const canReadFinance  = (user) => FINANCE_READ.includes(user?.role);
export const canWriteFinance = (user) => FINANCE_WRITE.includes(user?.role);
