import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
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

/** Books — vouchers, ledgers, reports and the numbering / period settings. Tab lives in ?tab=; the strip to switch is the section tabs above the page (adminNav). */
export default function BooksHub() {
  const user = useAuthStore((s) => s.user);
  const canRead = canReadFinance(user);
  const canWrite = canWriteFinance(user);
  const [params] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'gateway';

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {!canRead ? <NoAccess what="the books" /> : (
          <>
            <HubHeader title="Books" description="Every sale, purchase, receipt and journal — numbered, balanced and posted to its ledgers." />
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
