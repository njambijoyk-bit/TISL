import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import paymentSettingsAPI from '../../../../_shared/api/paymentSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import MpesaTab from '../../../components/admin/payments/MpesaTab';
import CardTab from '../../../components/admin/payments/CardTab';
import PaymentHistoryTab from '../../../components/admin/payments/PaymentHistoryTab';
import { colors } from '../../../../_shared/theme/tokens';

const HISTORY = { id: 'history', label: 'History & rollback' };

/** Settings → Payment keys. The owner's screen for the M-Pesa keys and the card providers (Stripe with Link, Paystack, Flutterwave, Pesapal, DPO): set here instead of in .env, proved with Safaricom, password-protected, logged and emailed. See docs/PAYMENT_SETTINGS.md. */
export default function PaymentSettings() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'mpesa');
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
    const gateways = data.gateways ?? [];
    const TABS = [{ id: 'mpesa', label: 'M-Pesa' }, ...gateways.map((g) => ({ id: g.key, label: g.label })), HISTORY];
    const active = TABS.some((t) => t.id === tab) ? tab : 'mpesa';
    const gw = gateways.find((g) => g.key === active);
    return (
      <>
        {!data.cards_ready && <p style={{ color: colors.textMuted, fontSize: '0.82rem', margin: '0 0 12px' }}>Card payments are not set up on the database yet: run database script 117_payment_cards.sql (after 116), then reload this page.</p>}
        <Tabs tabs={TABS} active={active} onChange={(id) => { setTab(id); setParams({ tab: id }, { replace: true }); }} />
        {active === 'mpesa' && <MpesaTab key={`m${data.current_version.mpesa?.id ?? 0}`} data={data} onChanged={load} />}
        {gw && <CardTab key={`${gw.key}${data.current_version[gw.key]?.id ?? 0}`} data={data} gateway={gw} onChanged={load} />}
        {active === 'history' && <PaymentHistoryTab onChanged={load} skipPassword={data.confirm_with_password === false} parts={[{ key: 'mpesa', label: 'M-Pesa' }, ...gateways.map((g) => ({ key: g.key, label: g.label }))]} />}
      </>
    );
  };

  return (
    <SettingsLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title="Payment keys" description="The keys that let customers pay by M-Pesa or card: set here instead of on the server, proved with the provider before they go live, protected by your password, logged and emailed to the owners. Only the owner can see this page." />
        {body()}
      </div>
    </SettingsLayout>
  );
}
