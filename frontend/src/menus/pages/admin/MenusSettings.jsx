import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { Field, FormStack, NumberInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
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
        custom_orders: Boolean(s.custom_orders), custom_deposit_pct: Number(s.custom_deposit_pct) || 0, custom_quote_days: Number(s.custom_quote_days) || 7, custom_lead_hours: Number(s.custom_lead_hours) || 0, chef_lead_hours: Number(s.chef_lead_hours) || 0 });
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
              {canEdit && <div><button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy || !ready} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button></div>}
            </FormStack>
          </div>
        )}
        {s && <ChannelsCard canEdit={canEdit} />}
        {s && <StationsCard canEdit={canEdit} />}
        {s && <KiosksCard canEdit={canEdit} />}
      </div>
    </AdminLayout>
  );
}
