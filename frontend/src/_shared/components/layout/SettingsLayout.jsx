import AdminLayout from './AdminLayout';
import { useAdminShell } from './adminShellContext';

/**
 * Settings pages used to draw their own left panel. The Settings links now
 * live in the main sidebar (System → Settings) and the tabs above the page,
 * so this is just the page frame. Pages bring their own padding.
 */
export default function SettingsLayout({ children }) {
  const inShell = useAdminShell();
  if (inShell) return <div>{children}</div>;
  return <AdminLayout>{children}</AdminLayout>;
}
