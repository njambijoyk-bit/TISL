import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { Field, FormStack, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import SalesAccountSelect from '../../../core/components/admin/tax/SalesAccountSelect';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import MenusNav from '../../components/MenusNav';
import ChannelsCard from '../../components/ChannelsCard';

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
      const r = await menusAPI.saveSettings({ sales_ledger_id: s.sales_ledger_id || null, allergen_note: s.allergen_note ?? '', receipt_footer: s.receipt_footer ?? '' });
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
              <p style={{ margin: 0, fontSize: '0.76rem', color: colors.textFaint }}>Tips and service charge are accounts like any other: you set them up in the books (Chart of accounts) and they are chosen when the till is built.</p>
              {canEdit && <div><button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy || !ready} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button></div>}
            </FormStack>
          </div>
        )}
        {s && <ChannelsCard canEdit={canEdit} />}
      </div>
    </AdminLayout>
  );
}
