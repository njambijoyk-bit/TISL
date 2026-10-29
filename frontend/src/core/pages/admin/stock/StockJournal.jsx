import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import ReportFrame from '../../../components/admin/reports/ReportFrame';
import StockJournalView from '../../../components/admin/reports/StockJournalView';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance } from '../../../../_shared/lib/roles';
import { stockKinds } from '../../../lib/stockKinds';

/** The stock journal (Purchases page): every movement of stock, in and out, with what caused it. It is the engine's report, framed like the others, so it filters, pages and exports the same way. */
export default function StockJournal() {
  const user = useAuthStore((s) => s.user);
  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the stock journal" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Stock journal" description={`Every movement of stock, newest first: sales, purchases, transfers, counts, ${stockKinds().ingredients ? 'what the kitchen uses and wastes, ' : ''}production, write-offs.`} />
        <ReportFrame reportKey="stock-journal">{(r) => <StockJournalView result={r} />}</ReportFrame>
      </div>
    </AdminLayout>
  );
}
