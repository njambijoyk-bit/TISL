import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import VouchersTab from '../../../components/admin/books/VouchersTab';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../../_shared/lib/roles';

/** Stock coming in: purchases from suppliers, goods received notes, and the opening stock entered at go-live. */
export default function Purchases({ initial = 'purchase' }) {
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const tabs = [
    { id: 'purchase', label: 'Purchases' },
    { id: 'receipt_note', label: 'Goods received' },
    { id: 'opening_stock', label: 'Opening stock' },
  ];
  const tab = tabs.some((t) => t.id === params.get('tab')) ? params.get('tab') : initial;
  const newPath = tab === 'opening_stock' ? '/admin/stock/opening/new' : tab === 'receipt_note' ? '/admin/purchases/receipt/new' : '/admin/purchases/new';
  const newLabel = tab === 'opening_stock' ? 'New opening stock' : tab === 'receipt_note' ? 'New goods received' : 'New purchase';

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {!canReadFinance(user) ? <NoAccess what="purchases" /> : (
          <>
            <HubHeader title="Purchases" description="Stock you buy from suppliers. Items come from your products — or create a new product on the spot — and land in the branch you choose, at the cost you enter." />
            <Tabs tabs={tabs} active={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} />
            <VouchersTab key={tab} canWrite={canWriteFinance(user)} baseType={tab} newPath={newPath} newLabel={newLabel}
              viewPath={(v) => `/admin/books/vouchers/${v.id}`} />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
