import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import paymentSettingsAPI from '../../../../_shared/api/paymentSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import MpesaTab from '../../../components/admin/payments/MpesaTab';
import PaymentHistoryTab from '../../../components/admin/payments/PaymentHistoryTab';
import { colors } from '../../../../_shared/theme/tokens';

const TABS = [{ id: 'mpesa', label: 'M-Pesa' }, { id: 'history', label: 'History & rollback' }];

/** Settings → Payment keys. The owner's screen for the M-Pesa keys (cards later): set here instead of in .env, proved with Safaricom, password-protected, logged and emailed. See docs/PAYMENT_SETTINGS.md. */
export default function PaymentSettings() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'mpesa');
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(() => paymentSettingsAPI.show().then(setData).catch((e) => {
    if (e?.response?.status === 403) setDenied(true); else toast.error(errMsg(e, 'Could not load the payment settings'));
  }), []);
  useEffect(() => { load(); }, [load]);

  const body = () => {
    if (denied) return <NoAccess what="the payment keys (the owner only)" />;
    if (!data) return <p style={{ color: colors.textMuted }}>Loading…</p>;
    if (!data.ready) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Payment keys are not set up on the screen yet. Run database script 116_payment_settings.sql, then reload this page. Until then the keys in the server settings (.env) keep working.</p>;
    return (
      <>
        <Tabs tabs={TABS} active={tab} onChange={(id) => { setTab(id); setParams({ tab: id }, { replace: true }); }} />
        {tab === 'mpesa' && <MpesaTab key={`m${data.current_version.mpesa?.id ?? 0}`} data={data} onChanged={load} />}
        {tab === 'history' && <PaymentHistoryTab onChanged={load} />}
      </>
    );
  };

  return (
    <SettingsLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title="Payment keys" description="The keys that let customers pay: set here instead of on the server, proved with Safaricom before they go live, protected by your password, logged and emailed to the owners. Only the owner can see this page." />
        {body()}
      </div>
    </SettingsLayout>
  );
}
