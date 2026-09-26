import Sidebar from './Sidebar';
import { useAdminShell } from './adminShellContext';

/**
 * Page wrapper for admin pages. Inside AdminShell (every /admin route) the
 * shell already draws the sidebar, so this only adds the page padding.
 */
export default function AdminLayout({ children }) {
  const inShell = useAdminShell();
  const body = <div className="container mx-auto px-4 lg:px-8 py-8">{children}</div>;

  if (inShell) return body;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-secondary, #f9fafb)' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>{body}</main>
    </div>
  );
}
