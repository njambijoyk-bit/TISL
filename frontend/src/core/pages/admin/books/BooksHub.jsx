import { useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import GatewayTab from '../../../components/admin/books/GatewayTab';
import VouchersTab from '../../../components/admin/books/VouchersTab';
import AccountsTab from '../../../components/admin/books/AccountsTab';
import ReportsTab from '../../../components/admin/books/ReportsTab';
import SettingsTab from '../../../components/admin/books/SettingsTab';
import GiftVouchersTab from '../../../components/admin/books/GiftVouchersTab';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../../_shared/lib/roles';

const TABS = [
  { id: 'gateway', label: 'Gateway' },
  { id: 'vouchers', label: 'Vouchers' },
  { id: 'accounts', label: 'Chart of accounts' },
  { id: 'gifts', label: 'Gift vouchers' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
];

/** Books — vouchers, ledgers, reports and the numbering / period settings. Tab lives in ?tab=. */
export default function BooksHub() {
  const user = useAuthStore((s) => s.user);
  const canRead = canReadFinance(user);
  const canWrite = canWriteFinance(user);
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'gateway';
  const current = TABS.find((t) => t.id === tab);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {!canRead ? <NoAccess what="the books" /> : (
          <>
            <HubHeader title="Books" description="Every sale, purchase, receipt and journal — numbered, balanced and posted to its ledgers." />
            <Tabs tabs={TABS} active={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} />
            {tab !== 'gateway' && (
              <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <button type="button" onClick={() => setParams({ tab: 'gateway' })} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary-600)', fontWeight: 700, font: 'inherit' }}>Gateway of Books</button>
                <ChevronRight size={12} /> {current?.label}
              </p>
            )}
            {tab === 'gateway' && <GatewayTab canWrite={canWrite} />}
            {tab === 'vouchers' && <VouchersTab canWrite={canWrite} />}
            {tab === 'accounts' && <AccountsTab canWrite={canWrite} />}
            {tab === 'gifts' && <GiftVouchersTab canWrite={canWrite} />}
            {tab === 'reports' && <ReportsTab />}
            {tab === 'settings' && <SettingsTab isSuper={user?.role === 'super_admin'} />}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
