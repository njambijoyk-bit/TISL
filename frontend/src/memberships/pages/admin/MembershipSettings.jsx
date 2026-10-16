import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { Field, FormStack, TextInput } from '../../../core/components/admin/ui/Form';
import membershipsAPI from '../../../_shared/api/memberships';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, card } from '../../../_shared/theme/tokens';
import MembershipsNav from '../../components/MembershipsNav';

export default function MembershipSettings() {
  const user = useAuthStore((s) => s.user);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { membershipsAPI.meta().then((m) => setS(m.settings)).catch((e) => toast.error(errMsg(e, 'Could not load'))); }, []);
  if (!hasPermission(user, 'memberships.manage')) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="Memberships configuration" /></div></AdminLayout>;
  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const r = await membershipsAPI.saveSettings({ pending_hours: Number(s.pending_hours), renewal_lead_days: Number(s.renewal_lead_days), remind_before_days: Number(s.remind_before_days), remind_after_days: Number(s.remind_after_days), pause_days_per_year: Number(s.pause_days_per_year), allow_member_cancel: s.allow_member_cancel });
      setS(r.settings); toast.success('Saved.');
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 760, margin: '0 auto' }} data-testid="membership-settings">
        <MembershipsNav />
        <HubHeader title="Memberships configuration" description="When renewals are invoiced and reminded, and what members may do themselves." />
        {s && (
          <section style={{ ...card, padding: 16 }}>
            <FormStack>
              <Field label="Let an unpaid new membership go after (hours)" htmlFor="ms-pend" hint="0: never."><TextInput id="ms-pend" inputMode="numeric" value={s.pending_hours} onChange={set('pending_hours')} /></Field>
              <Field label="Invoice the next period this many days before the current one ends" htmlFor="ms-lead"><TextInput id="ms-lead" inputMode="numeric" value={s.renewal_lead_days} onChange={set('renewal_lead_days')} /></Field>
              <Field label="Remind this many days before a payment is due" htmlFor="ms-rb"><TextInput id="ms-rb" inputMode="numeric" value={s.remind_before_days} onChange={set('remind_before_days')} /></Field>
              <Field label="Remind again this many days after it was due" htmlFor="ms-ra"><TextInput id="ms-ra" inputMode="numeric" value={s.remind_after_days} onChange={set('remind_after_days')} /></Field>
              <Field label="Days a member may pause in a year" htmlFor="ms-pause" hint="0: members may not pause."><TextInput id="ms-pause" inputMode="numeric" value={s.pause_days_per_year} onChange={set('pause_days_per_year')} /></Field>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={Boolean(s.allow_member_cancel)} onChange={set('allow_member_cancel')} /> A member may cancel from their own page (at the end of the paid period)</label>
              <div><button type="button" style={btnPrimary} onClick={save} disabled={busy}>Save</button></div>
            </FormStack>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
