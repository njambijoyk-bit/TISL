import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import GeneralTab from '../../../components/admin/notifications/GeneralTab';
import EmailTab from '../../../components/admin/notifications/EmailTab';
import TypesTab from '../../../components/admin/notifications/TypesTab';
import WhatsAppQueueTab from '../../../components/admin/notifications/WhatsAppQueueTab';
import WhatsAppApiTab from '../../../components/admin/notifications/WhatsAppApiTab';
import DeliveryTab from '../../../components/admin/notifications/DeliveryTab';
import HistoryTab from '../../../components/admin/notifications/HistoryTab';
import { colors } from '../../../../_shared/theme/tokens';

const TABS = [
  { id: 'whatsapp', label: 'WhatsApp to send' },
  { id: 'email', label: 'Email' },
  { id: 'whatsappapi', label: 'WhatsApp API' },
  { id: 'general', label: 'General' },
  { id: 'types', label: 'Messages' },
  { id: 'log', label: 'Delivery log' },
  { id: 'history', label: 'History & rollback' },
];

/**
 * Settings → Notifications. How the system reaches people: the mail server (set here, not in .env), which messages go out, a log of every message,
 * and the history of these settings with a way back. See docs/NOTIFICATIONS_PLAN.md.
 */
export default function NotificationSettings() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'email');
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);

  const load = useCallback(() => notificationSettingsAPI.show().then(setData).catch((e) => {
    if (e?.response?.status === 403) setDenied(true); else toast.error(errMsg(e, 'Could not load the notification settings'));
  }), []);
  useEffect(() => { load(); }, [load]);

  const body = () => {
    if (denied) return <NoAccess what="the notification settings" />;
    if (!data) return <p style={{ color: colors.textMuted }}>Loading…</p>;
    if (!data.ready) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>The notification system is not set up yet. Run database script 108_notifications.sql, then reload this page.</p>;
    const { can } = data;
    return (
      <>
        <Tabs tabs={TABS.map((t) => (t.id === 'whatsapp' ? { ...t, count: data.whatsapp_waiting || undefined } : t))} active={tab} onChange={(id) => { setTab(id); setParams({ tab: id }, { replace: true }); }} />
        {tab === 'whatsapp' && <WhatsAppQueueTab canSend={can.send} onChanged={load} />}
        {tab === 'email' && <EmailTab key={`e${data.current_version.email?.id ?? 0}`} data={data} canEdit={can.settings} canSend={can.send || can.settings} onChanged={load} />}
        {tab === 'whatsappapi' && <WhatsAppApiTab key={`w${data.current_version.whatsapp?.id ?? 0}`} data={data} canEdit={can.settings} canSend={can.send || can.settings} onChanged={load} />}
        {tab === 'general' && <GeneralTab key={`g${data.current_version.general?.id ?? 0}`} data={data} canEdit={can.settings} onChanged={load} />}
        {tab === 'types' && <TypesTab key={`t${data.current_version.types?.id ?? 0}`} data={data} canEdit={can.settings} onChanged={load} />}
        {tab === 'log' && <DeliveryTab canSend={can.send} />}
        {tab === 'history' && <HistoryTab canEdit={can.settings} canPurge={can.purge} onChanged={load} />}
      </>
    );
  };

  return (
    <SettingsLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title="Notifications" description="How we reach customers and staff: email (set up here instead of on the server), WhatsApp messages for staff to send, which messages go out, and a record of everything that was sent or changed." />
        {body()}
      </div>
    </SettingsLayout>
  );
}
