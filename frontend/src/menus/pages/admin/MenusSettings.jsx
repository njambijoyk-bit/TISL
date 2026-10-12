import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { Field, FormStack, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import SalesAccountSelect from '../../../core/components/admin/tax/SalesAccountSelect';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import MenusNav from '../../components/MenusNav';
import LedgerSelect from '../../components/LedgerSelect';
import ChannelsCard from '../../components/ChannelsCard';
import StationsCard from '../../components/StationsCard';
import KiosksCard from '../../components/KiosksCard';
import ClockPlacesCard from '../../components/ClockPlacesCard';

/** Menus → Settings: the sales account dishes are booked under (it decides the tax), the allergen wording and the receipt footer. Tips and service charge are ledgers, managed in the books. */
export default function MenusSettings() {
  const user = useAuthStore((s) => s.user);
  const canEdit = canWriteFinance(user);
  const [s, setS] = useState(null);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { menusAPI.settings().then((r) => { setS(r.settings); setReady(r.ready); }).catch((e) => toast.error(errMsg(e, 'Could not load the settings'))); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.saveSettings({ sales_ledger_id: s.sales_ledger_id || null, allergen_note: s.allergen_note ?? '', receipt_footer: s.receipt_footer ?? '',
        tip_ledger_id: s.tip_ledger_id || null, service_charge_ledger_id: s.service_charge_ledger_id || null, service_charge_pct: Number(s.service_charge_pct) || 0,
        qr_ordering: Boolean(s.qr_ordering), qr_open_by_scan: Boolean(s.qr_open_by_scan),
        custom_orders: Boolean(s.custom_orders), custom_deposit_pct: Number(s.custom_deposit_pct) || 0, custom_quote_days: Number(s.custom_quote_days) || 7, custom_lead_hours: Number(s.custom_lead_hours) || 0, chef_lead_hours: Number(s.chef_lead_hours) || 0,
        rota_max_week_hours: Number(s.rota_max_week_hours) || 48, rota_min_rest_hours: Number(s.rota_min_rest_hours) || 0,
        rota_ahead_weeks: Number(s.rota_ahead_weeks) || 0, rota_overtime_source: s.rota_overtime_source ?? 'attendance', rota_overtime_grace: Number(s.rota_overtime_grace) || 0,
        rota_claims_need_approval: Boolean(s.rota_claims_need_approval), rota_clock_from_rota: Boolean(s.rota_clock_from_rota), rota_clock_early: Number(s.rota_clock_early) || 0, plans_enabled: Boolean(s.plans_enabled), plans_bill_ahead_days: Number(s.plans_bill_ahead_days) || 0, rota_premium_source: s.rota_premium_source ?? 'off', rota_shift_min_share: Number(s.rota_shift_min_share) || 50, rota_overtime_staff: Boolean(s.rota_overtime_staff), rota_clock_qr: s.rota_clock_qr ?? 'off', rota_clock_qr_minutes: Number(s.rota_clock_qr_minutes) || 2, rota_clock_wifi: Boolean(s.rota_clock_wifi), rota_overtime_needs_approval: Boolean(s.rota_overtime_needs_approval),
        rota_clock_location: s.rota_clock_location ?? 'off', rota_clock_radius: Number(s.rota_clock_radius) || 150, rota_clock_accuracy: Number(s.rota_clock_accuracy) || 200, rota_swaps_need_approval: Boolean(s.rota_swaps_need_approval), rota_no_show_alerts: Boolean(s.rota_no_show_alerts) });
      setS(r.settings); toast.success(r.message);
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the Menus settings" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 820, margin: '0 auto' }} data-testid="menus-settings">
        <MenusNav />
        <HubHeader title="Menus settings" description="Where dish sales are booked, and the words on the menu and the receipt." />
        {!s ? <p style={{ color: colors.textMuted, fontSize: '0.82rem' }}>Loading…</p> : (
          <div style={{ ...card, padding: 20 }}>
            {!ready && <p role="status" style={{ margin: '0 0 14px', fontSize: '0.8rem', color: colors.textMuted }}>Run database script 134_menus_dishes.sql first: until then these settings can be read but not saved.</p>}
            <FormStack gap={18}>
              <SalesAccountSelect kind="sales" scope="product" label="Sales account for dishes" value={s.sales_ledger_id} disabled={!canEdit || !ready}
                onChange={(v) => setS((x) => ({ ...x, sales_ledger_id: v }))} hint="Every new dish is booked here unless you choose another. The account decides the tax." />
              <Field label="Allergen note shown under the menu" htmlFor="ms-allergen" hint="Shown on the dishes page and, later, on the public menu.">
                <TextArea id="ms-allergen" rows={3} maxLength={600} value={s.allergen_note ?? ''} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, allergen_note: e.target.value }))} />
              </Field>
              <Field label="A line at the foot of every receipt" htmlFor="ms-footer" hint="For example: Thank you for dining with us. Prices include VAT.">
                <TextInput id="ms-footer" maxLength={200} value={s.receipt_footer ?? ''} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, receipt_footer: e.target.value }))} />
              </Field>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Ordering from a table&apos;s QR code</legend>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.qr_ordering)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, qr_ordering: e.target.checked }))} /> Guests may order and pay from the table&apos;s QR code</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.qr_open_by_scan)} disabled={!canEdit || !ready || !s.qr_ordering} onChange={(e) => setS((x) => ({ ...x, qr_open_by_scan: e.target.checked }))} /> A scan may open an empty table (otherwise staff seat the guests first)</label>
              </fieldset>
              <LedgerSelect id="ms-tip" label="Tips are booked to" value={s.tip_ledger_id} disabled={!canEdit || !ready} onChange={(v) => setS((x) => ({ ...x, tip_ledger_id: v }))} hint="Usually money held for staff. Empty: the till takes no tips. Set up the account in the books (Chart of accounts)." />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <LedgerSelect id="ms-svc" label="Service charge is booked to" value={s.service_charge_ledger_id} disabled={!canEdit || !ready} onChange={(v) => setS((x) => ({ ...x, service_charge_ledger_id: v }))} />
                <Field label="Service charge on dine-in (%)" htmlFor="ms-pct" hint="0 = none. The cashier may waive it for a bill."><NumberInput id="ms-pct" min="0" max="30" step="any" value={s.service_charge_pct ?? 0} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, service_charge_pct: e.target.value }))} /></Field>
              </div>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Cakes and catering</legend>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.custom_orders)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, custom_orders: e.target.checked }))} /> Take requests for cakes, catering and a private chef online (page /menu/custom)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  <Field label="Deposit to confirm (%)" htmlFor="ms-dep" hint="Paid when the customer accepts the quote."><NumberInput id="ms-dep" min="0" max="100" step="any" value={s.custom_deposit_pct ?? 50} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, custom_deposit_pct: e.target.value }))} /></Field>
                  <Field label="A quote stays open (days)" htmlFor="ms-qd"><NumberInput id="ms-qd" min="1" max="90" value={s.custom_quote_days ?? 7} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, custom_quote_days: e.target.value }))} /></Field>
                  <Field label="Least notice for catering (hours)" htmlFor="ms-lh" hint="Cakes use the notice set on each dish."><NumberInput id="ms-lh" min="0" max="720" value={s.custom_lead_hours ?? 72} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, custom_lead_hours: e.target.value }))} /></Field>
                  <Field label="Least notice for a private chef (hours)" htmlFor="ms-ch"><NumberInput id="ms-ch" min="0" max="720" value={s.chef_lead_hours ?? 48} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, chef_lead_hours: e.target.value }))} /></Field>
                </div>
              </fieldset>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Meal plans</legend>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.plans_enabled)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, plans_enabled: e.target.checked }))} /> Take meal plan subscriptions online (page /menu/plans)</label>
                <Field label="A week is billed this many days before it starts" htmlFor="ms-pba"><NumberInput id="ms-pba" min="0" max="14" value={s.plans_bill_ahead_days ?? 3} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, plans_bill_ahead_days: e.target.value }))} /></Field>
              </fieldset>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Chef rota</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  <Field label="Warn above (hours a week)" htmlFor="ms-rmw" hint="The rota shows a warning, it does not stop you."><NumberInput id="ms-rmw" min="1" max="120" value={s.rota_max_week_hours ?? 48} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_max_week_hours: e.target.value }))} /></Field>
                  <Field label="Warn below (hours of rest between days)" htmlFor="ms-rmr"><NumberInput id="ms-rmr" min="0" max="24" value={s.rota_min_rest_hours ?? 10} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_min_rest_hours: e.target.value }))} /></Field>
                  <Field label="Plan from weekly patterns this many weeks ahead" htmlFor="ms-raw" hint="0 = only when you press Plan. Planned shifts are drafts."><NumberInput id="ms-raw" min="0" max="8" value={s.rota_ahead_weeks ?? 2} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_ahead_weeks: e.target.value }))} /></Field>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.rota_swaps_need_approval)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_swaps_need_approval: e.target.checked }))} /> A shift swap the colleague agreed to still waits for a manager</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <Field label="Payroll takes a chef's overtime from" htmlFor="ms-ots" hint="Rota: the hours worked beyond the shifts rostered. Attendance: beyond the company's working day.">
                    <SelectInput id="ms-ots" value={s.rota_overtime_source ?? 'attendance'} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_overtime_source: e.target.value }))}><option value="attendance">Attendance (company working day)</option><option value="rota">The rota (hours beyond the shifts)</option></SelectInput>
                  </Field>
                  <Field label="Overtime counts after (minutes)" htmlFor="ms-otg" hint="Only for the rota source."><NumberInput id="ms-otg" min="0" max="120" value={s.rota_overtime_grace ?? 15} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_overtime_grace: e.target.value }))} /></Field>
                  <Field label="Clocking in opens (minutes before the shift)" htmlFor="ms-ce"><NumberInput id="ms-ce" min="0" max="240" value={s.rota_clock_early ?? 30} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_clock_early: e.target.value }))} /></Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <Field label="Shift premiums (night, weekend, holiday)" htmlFor="ms-prem" hint="Set the rules on the Rota page (payroll access). Payroll: they appear on the chef's payslip as an earning of their own.">
                    <SelectInput id="ms-prem" value={s.rota_premium_source ?? 'off'} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_premium_source: e.target.value }))}><option value="off">Only shown on the Rota page</option><option value="payroll">Added to payroll</option></SelectInput>
                  </Field>
                  <Field label="Clocking in by place" htmlFor="ms-cl" hint="Warn: kept in the log, the chef is let in. Require: a chef away from the branch is turned away. Set the places below.">
                    <SelectInput id="ms-cl" value={s.rota_clock_location ?? 'off'} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_clock_location: e.target.value }))}><option value="off">Do not check</option><option value="warn">Warn</option><option value="require">Require</option></SelectInput>
                  </Field>
                  <Field label="Counts as at the branch within (metres)" htmlFor="ms-clr" hint="A branch's own radius below overrides this."><NumberInput id="ms-clr" min="20" max="5000" value={s.rota_clock_radius ?? 150} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_clock_radius: e.target.value }))} /></Field>
                  <Field label="Ignore positions rougher than (metres)" htmlFor="ms-cla"><NumberInput id="ms-cla" min="10" max="2000" value={s.rota_clock_accuracy ?? 200} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_clock_accuracy: e.target.value }))} /></Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <Field label="Code at the door proves a chef is there" htmlFor="ms-qr" hint="Rotating: a screen at the door shows a code that changes every few minutes (open it from Clock-in places). Fixed: a printed code (a photo of it works, so it is weaker).">
                    <SelectInput id="ms-qr" value={s.rota_clock_qr ?? 'off'} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_clock_qr: e.target.value }))}><option value="off">Off</option><option value="rotating">Rotating (on a screen)</option><option value="fixed">Fixed (printed)</option></SelectInput>
                  </Field>
                  <Field label="A rotating code lasts (minutes)" htmlFor="ms-qrm"><NumberInput id="ms-qrm" min="1" max="30" value={s.rota_clock_qr_minutes ?? 2} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_clock_qr_minutes: e.target.value }))} /></Field>
                  <Field label="A per-shift chef's shift counts when this share was worked (%)" htmlFor="ms-share"><NumberInput id="ms-share" min="1" max="100" value={s.rota_shift_min_share ?? 50} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_shift_min_share: e.target.value }))} /></Field>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.rota_clock_wifi)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_clock_wifi: e.target.checked }))} /> Clocking in from the branch&apos;s own Wi-Fi proves a chef is there (set each branch&apos;s internet address below)</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.rota_overtime_staff)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_overtime_staff: e.target.checked }))} /> The overtime approval also covers other staff with attendance (decided by whoever may mark their attendance)</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.rota_overtime_needs_approval)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_overtime_needs_approval: e.target.checked }))} /> A manager must approve a chef&apos;s overtime before payroll pays it (payroll can not be approved while any waits)</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.rota_clock_from_rota)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_clock_from_rota: e.target.checked }))} /> Chefs may clock in and out from the rota page (the same sign-in as Attendance)</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.rota_claims_need_approval)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_claims_need_approval: e.target.checked }))} /> A claim on an open shift waits for a manager (off: the first chef who is free gets it)</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.rota_no_show_alerts)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, rota_no_show_alerts: e.target.checked }))} /> Tell the managers when a rostered chef has not signed in (uses the Attendance sign-ins)</label>
              </fieldset>
              {canEdit && <div><button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy || !ready} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button></div>}
            </FormStack>
          </div>
        )}
        {s && <ChannelsCard canEdit={canEdit} />}
        {s && <StationsCard canEdit={canEdit} />}
        {s && <KiosksCard canEdit={canEdit} />}
        {s && <ClockPlacesCard canEdit={canEdit} />}
      </div>
    </AdminLayout>
  );
}
