import { createContext, useContext } from 'react';

/**
 * Set by AdminShell. Pages still wrap themselves in AdminLayout /
 * SettingsLayout / GeneralLayout; inside the shell those layouts only add
 * their padding, so the sidebar is drawn once.
 */
export const AdminShellContext = createContext(null);

/** { openSearch } inside the admin shell, null outside it. */
export const useAdminShell = () => useContext(AdminShellContext);
