import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import VouchersTab from '../../../components/admin/books/VouchersTab';
import PreorderOverview from '../../../components/admin/books/PreorderOverview';
import PreordersWaiting from '../../../components/admin/books/PreordersWaiting';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../../_shared/lib/roles';

const TABS = [
  { id: 'sales_order', label: 'Orders' },
  { id: 'preorder_overview', label: 'Preorder overview' },
  { id: 'preorders', label: 'Preorders waiting' },
  { id: 'delivery_note', label: 'Deliveries' },
  { id: 'sales', label: 'Invoices' },
  { id: 'cash_sale', label: 'Cash sales' },
  { id: 'receipt', label: 'Receipts' },
  { id: 'credit_note', label: 'Returns' },
];

/** The sales register: every order and what it became, straight from the books. */
export default function OrdersRegister({ initial = 'sales_order' }) {
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : initial);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {!canReadFinance(user) ? <NoAccess what="the sales register" /> : (
          <>
            <HubHeader title="Orders & payments" description="Orders placed at checkout or by staff, the deliveries and invoices made from them, and the payments received." />
            <Tabs tabs={TABS} active={tab} onChange={(id) => { setTab(id); setParams({ tab: id }, { replace: true }); }} />
            {tab === 'preorder_overview' ? <PreorderOverview /> : tab === 'preorders' ? <PreordersWaiting /> : <VouchersTab key={tab} canWrite={canWriteFinance(user)} baseType={tab} />}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
