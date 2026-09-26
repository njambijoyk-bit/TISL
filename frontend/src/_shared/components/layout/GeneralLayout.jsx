import AdminLayout from './AdminLayout';
import { useAdminShell } from './adminShellContext';

/**
 * The old "General" panel (bulk editors, delivery, AI, flowcharts, dev tools)
 * is gone: those pages are in the main sidebar now, and bulk editors are a
 * "Bulk edit" tab on Products, Customers and Team. This keeps the padding
 * the pages were designed with.
 */
export default function GeneralLayout({ children }) {
  const inShell = useAdminShell();
  const body = <div style={{ padding: '24px 28px' }}>{children}</div>;
  if (inShell) return body;
  return <AdminLayout>{children}</AdminLayout>;
}
