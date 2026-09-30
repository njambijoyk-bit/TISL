import { Link } from 'react-router-dom';
import { BookOpen, Banknote, Boxes, FileText, Receipt } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../components/admin/ui/HubHeader';
import useAuthStore from '../../../_shared/store/authStore';
import { canWriteFinance } from '../../../_shared/lib/roles';
import { card, colors } from '../../../_shared/theme/tokens';

const LINKS = [
  { to: '/admin/books?tab=vouchers', label: 'Vouchers', desc: 'Sales, purchases, receipts, journals', icon: BookOpen, color: '#6366f1' },
  { to: '/admin/books/cash', label: 'Cash & bank', desc: 'Count the till, cheques in hand', icon: Banknote, color: '#0d9488' },
  { to: '/admin/books?tab=reports', label: 'Reports', desc: 'Day book, trial balance, profit & loss', icon: FileText, color: '#22c55e' },
  { to: '/admin/inventory', label: 'Stock', desc: 'What you hold, where, and what is running low', icon: Boxes, color: '#f59e0b' },
];

/**
 * The dashboard. The old one was built on the retired order tables and has been removed; the new one will be graphs of
 * stock and vouchers (planned next). Until then this page only gets you to where the work is.
 */
export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <HubHeader title="Dashboard" description="Stock and voucher graphs are being built. For now, jump to where the work is." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginTop: 16 }}>
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} style={{ ...card, padding: 18, textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <l.icon size={20} color={l.color} />
              <div style={{ fontWeight: 800, margin: '8px 0 2px' }}>{l.label}</div>
              <div style={{ fontSize: '0.78rem', color: colors.textMuted }}>{l.desc}</div>
            </Link>
          ))}
          {canWrite && (
            <Link to="/admin/books/vouchers/new" style={{ ...card, padding: 18, textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <Receipt size={20} color="#ec4899" />
              <div style={{ fontWeight: 800, margin: '8px 0 2px' }}>New voucher</div>
              <div style={{ fontSize: '0.78rem', color: colors.textMuted }}>Start a sale, receipt or purchase</div>
            </Link>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
