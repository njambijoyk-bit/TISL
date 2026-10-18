import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { Field, FormStack, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import SalesAccountSelect from '../../../core/components/admin/tax/SalesAccountSelect';
import menusAPI from '../../../_shared/api/menus';
import currencyAPI from '../../../_shared/api/currency';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canConfigureMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import LedgerSelect from '../../components/LedgerSelect';
import ChannelsCard from '../../components/ChannelsCard';
import StationsCard from '../../components/StationsCard';
import KiosksCard from '../../components/KiosksCard';
import ClockPlacesCard from '../../components/ClockPlacesCard';
import ListsCard from '../../components/ListsCard';

/** Menus → Configuration: the sales account dishes are booked under (it decides the tax), the allergen wording and the receipt footer. Tips and service charge are ledgers, managed in the books. */
export default function MenusSettings() {
  const user = useAuthStore((s) => s.user);
  const canEdit = canConfigureMenus(user);
  const [s, setS] = useState(null);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [currencies, setCurrencies] = useState([]);
  const [kinds, setKinds] = useState([]);
  const [readiness, setReadiness] = useState(null);

  useEffect(() => { currencyAPI.getCurrencies().then((r) => setCurrencies((Array.isArray(r) ? r : r?.data ?? r?.currencies ?? []).filter((c) => c.is_active !== false))).catch(() => {}); }, []);
  useEffect(() => { menusAPI.sidesReadiness().then(setReadiness).catch(() => {}); }, []);
  useEffect(() => { menusAPI.ingredientKinds().then((r) => setKinds(r.kinds ?? [])).catch(() => {}); }, []);
  useEffect(() => { menusAPI.settings().then((r) => { setS(r.settings); setReady(r.ready); }).catch((e) => toast.error(errMsg(e, 'Could not load the settings'))); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.saveSettings({ currency_id: s.currency_id || null, sales_ledger_id: s.sales_ledger_id || null, purchase_ledger_id: s.purchase_ledger_id || null, allergen_note: s.allergen_note ?? '', receipt_footer: s.receipt_footer ?? '',
        prepared_food_ledger_id: s.prepared_food_ledger_id || null, tips_window: s.tips_window ?? 'anytime', tips_from: s.tips_from ?? '00:00', tips_to: s.tips_to ?? '23:59', tips_days: s.tips_days ?? [1, 2, 3, 4, 5, 6, 7], packaging_kind_id: s.packaging_kind_id || null, packaging_sales_ledger_id: s.packaging_sales_ledger_id || null,
        ingredient_stock_ledger_id: s.ingredient_stock_ledger_id || null, food_cost_ledger_id: s.food_cost_ledger_id || null, food_waste_ledger_id: s.food_waste_ledger_id || null,
        modifier_fee_ledger_id: s.modifier_fee_ledger_id || null, tip_ledger_id: s.tip_ledger_id || null, service_charge_ledger_id: s.service_charge_ledger_id || null, service_charge_pct: Number(s.service_charge_pct) || 0,
        modifier_fees_vatable: s.modifier_fees_vatable !== false, sell_through_sides: Boolean(s.sell_through_sides), qr_ordering: Boolean(s.qr_ordering), qr_open_by_scan: Boolean(s.qr_open_by_scan),
        custom_orders: Boolean(s.custom_orders), custom_deposit_pct: Number(s.custom_deposit_pct) || 0, custom_quote_days: Number(s.custom_quote_days) || 7, custom_lead_hours: Number(s.custom_lead_hours) || 0, chef_lead_hours: Number(s.chef_lead_hours) || 0,
        rota_max_week_hours: Number(s.rota_max_week_hours) || 48, rota_min_rest_hours: Number(s.rota_min_rest_hours) || 0,
        rota_ahead_weeks: Number(s.rota_ahead_weeks) || 0, rota_overtime_source: s.rota_overtime_source ?? 'attendance', rota_overtime_grace: Number(s.rota_overtime_grace) || 0,
        rota_claims_need_approval: Boolean(s.rota_claims_need_approval), rota_clock_from_rota: Boolean(s.rota_clock_from_rota), rota_clock_early: Number(s.rota_clock_early) || 0, plans_enabled: Boolean(s.plans_enabled), plans_bill_ahead_days: Number(s.plans_bill_ahead_days) || 0, rota_premium_source: s.rota_premium_source ?? 'off', rota_shift_min_share: Number(s.rota_shift_min_share) || 50, rota_overtime_staff: Boolean(s.rota_overtime_staff), rota_clock_qr: s.rota_clock_qr ?? 'off', rota_clock_qr_minutes: Number(s.rota_clock_qr_minutes) || 2, rota_clock_wifi: Boolean(s.rota_clock_wifi), rota_overtime_needs_approval: Boolean(s.rota_overtime_needs_approval),
        rota_clock_location: s.rota_clock_location ?? 'off', rota_clock_radius: Number(s.rota_clock_radius) || 150, rota_clock_accuracy: Number(s.rota_clock_accuracy) || 200, rota_swaps_need_approval: Boolean(s.rota_swaps_need_approval), rota_no_show_alerts: Boolean(s.rota_no_show_alerts) });
      setS(r.settings); toast.success(r.message);
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the Menus configuration" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 820, margin: '0 auto' }} data-testid="menus-settings">
        <HubHeader title="Menus configuration" description="Where dish sales are booked, and the words on the menu and the receipt." />
        {!s ? <p style={{ color: colors.textMuted, fontSize: '0.82rem' }}>Loading…</p> : (
          <div style={{ ...card, padding: 20 }}>
            {!ready && <p role="status" style={{ margin: '0 0 14px', fontSize: '0.8rem', color: colors.textMuted }}>Run database script 134_menus_dishes.sql first: until then these settings can be read but not saved.</p>}
            <FormStack gap={18}>
              <Field label="Currency" htmlFor="ms-currency" hint="The currency the kitchen's own vouchers are written in: ingredient purchases, opening stock, and what the kitchen uses, wastes and counts. Empty: the system's base currency. Amounts are converted at the rate of the day, so nothing mixes.">
                <SelectInput id="ms-currency" value={s.currency_id ?? ''} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, currency_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">{`System base currency${currencies.find((c) => c.is_base) ? ` (${currencies.find((c) => c.is_base).code})` : ''}`}</option>
                  {currencies.filter((c) => !c.is_base).map((c) => <option key={c.id} value={c.id}>{c.code} {c.name ? `· ${c.name}` : ''}</option>)}
                </SelectInput>
              </Field>
              <SalesAccountSelect kind="sales" scope="product" label="Sales account for dishes" value={s.sales_ledger_id} disabled={!canEdit || !ready}
                onChange={(v) => setS((x) => ({ ...x, sales_ledger_id: v }))} hint="Every new dish is booked here unless you choose another. The account decides the tax." />
              <SalesAccountSelect kind="purchase" label="Purchase account for ingredients" value={s.purchase_ledger_id} disabled={!canEdit || !ready}
                onChange={(v) => setS((x) => ({ ...x, purchase_ledger_id: v }))} hint="Used for an ingredient that has none of its own. The account decides the VAT on what you buy; the stock is still carried on Food Ingredients Inventory. Empty: the books' default purchase account." />
              <Field label="Allergen note shown under the menu" htmlFor="ms-allergen" hint="Shown on the dishes page and, later, on the public menu.">
                <TextArea id="ms-allergen" rows={3} maxLength={600} value={s.allergen_note ?? ''} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, allergen_note: e.target.value }))} />
              </Field>
              <Field label="A line at the foot of every receipt" htmlFor="ms-footer" hint="For example: Thank you for dining with us. Prices include VAT.">
                <TextInput id="ms-footer" maxLength={200} value={s.receipt_footer ?? ''} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, receipt_footer: e.target.value }))} />
              </Field>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }} data-testid="modifier-vat">
                <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Fees for leaving out or adding extra</legend>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={s.modifier_fees_vatable !== false} disabled={!canEdit} onChange={(e) => setS((x) => ({ ...x, modifier_fees_vatable: e.target.checked }))} />
                  A fee carries the dish's VAT
                </label>
                <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>On: the fee is part of the dish's price and is taxed as the dish is. Off: it is kept apart and carries no VAT. What each item costs is chosen on the dish (Menus, Dishes, Modifiers), from the policies in the lists further down this page.</p>
                {s.modifier_fees_vatable === false && (
                  <LedgerSelect id="ms-modfee" label="Fees kept apart are booked to" value={s.modifier_fee_ledger_id} disabled={!canEdit || !ready} onChange={(v) => setS((x) => ({ ...x, modifier_fee_ledger_id: v }))} hint="An income account with no tax on it. Empty: the account the dishes are sold to, which carries tax, so choose one of its own." />
                )}
              </fieldset>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }} data-testid="sell-through-sides">
                <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Selling through sides</legend>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}>
                  <input type="checkbox" checked={Boolean(s.sell_through_sides)} disabled={!canEdit || !ready || (readiness && !readiness.ready)} onChange={(e) => setS((x) => ({ ...x, sell_through_sides: e.target.checked }))} />
                  A sold dish takes its stock through its side
                </label>
                <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
                  Off: a dish uses its own recipe, as always. On: a dish that has a side (Menus, Sides) uses the recipe its side is made from, for as much as one serving holds; a dish made ahead sells prepared food (Menus, Prepared food) instead of its old shelf.
                  A dish with no side keeps selling as before. Switch it off again at any time.
                </p>
                {readiness && !readiness.ready && <p role="status" style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Run database scripts 200_menus_sides.sql and 201_menus_sides_from_dishes.sql first.</p>}
                {readiness?.ready && (
                  <div data-testid="readiness" style={{ fontSize: '0.78rem', color: colors.textMuted, display: 'grid', gap: 4 }}>
                    <div>{readiness.with_side} of {readiness.dish_recipes} dishes with a recipe have a side.</div>
                    {readiness.without_side.length > 0 && <div style={{ color: colors.warning }}>No side yet (they keep selling as before): {readiness.without_side.join(', ')}. Make them under Menus, Sides.</div>}
                    {readiness.differs.map((d) => <div key={d.dish} style={{ color: colors.warning }}>{d.dish}: the side&apos;s recipe differs from the dish&apos;s own ({d.what.join('; ')}). Selling will follow the side&apos;s recipe.</div>)}
                    {readiness.old_shelf.map((o) => <div key={o.dish} style={{ color: colors.danger }}>{o.dish}: {o.portions} portions are on the old dish shelf. They will not be sold once this is on: sell or write them off first, or make a batch on the Prepared food page.</div>)}
                    {readiness.without_side.length === 0 && readiness.differs.length === 0 && readiness.old_shelf.length === 0 && <div style={{ color: colors.success }}>Nothing stands in the way.</div>}
                  </div>
                )}
              </fieldset>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Ordering from a table&apos;s QR code</legend>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.qr_ordering)} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, qr_ordering: e.target.checked }))} /> Guests may order and pay from the table&apos;s QR code</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem' }}><input type="checkbox" checked={Boolean(s.qr_open_by_scan)} disabled={!canEdit || !ready || !s.qr_ordering} onChange={(e) => setS((x) => ({ ...x, qr_open_by_scan: e.target.checked }))} /> A scan may open an empty table (otherwise staff seat the guests first)</label>
              </fieldset>
              <LedgerSelect id="ms-tip" label="Tips are booked to" value={s.tip_ledger_id} disabled={!canEdit || !ready} onChange={(v) => setS((x) => ({ ...x, tip_ledger_id: v }))} hint="Money held for staff until it is handed out. Empty: the books' own Tips Payable account. Set up accounts in the books (Chart of accounts)." />
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }} data-testid="tips-window">
                <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>When tips may be handed out</legend>
                <Field label="Handing out is allowed" htmlFor="ms-tw" hint="Tips never expire: they wait in the tips box until they are handed out. This only limits when a person with the right may do it.">
                  <SelectInput id="ms-tw" value={s.tips_window ?? 'anytime'} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, tips_window: e.target.value }))}>
                    <option value="anytime">At any time</option>
                    <option value="daily">Every day, between two times</option>
                    <option value="days">On chosen days, between two times</option>
                    <option value="never">Never (tips are only collected)</option>
                  </SelectInput>
                </Field>
                {['daily', 'days'].includes(s.tips_window) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                    <Field label="From" htmlFor="ms-tf"><TextInput id="ms-tf" type="time" value={s.tips_from ?? '00:00'} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, tips_from: e.target.value }))} /></Field>
                    <Field label="To" htmlFor="ms-tt" hint="A time before “From” runs past midnight."><TextInput id="ms-tt" type="time" value={s.tips_to ?? '23:59'} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, tips_to: e.target.value }))} /></Field>
                  </div>
                )}
                {s.tips_window === 'days' && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.86rem' }}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                      <label key={d} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <input type="checkbox" checked={(s.tips_days ?? []).includes(i + 1)} disabled={!canEdit || !ready}
                          onChange={(e) => setS((x) => ({ ...x, tips_days: e.target.checked ? [...new Set([...(x.tips_days ?? []), i + 1])].sort() : (x.tips_days ?? []).filter((n) => n !== i + 1) }))} /> {d}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <LedgerSelect id="ms-svc" label="Service charge is booked to" value={s.service_charge_ledger_id} disabled={!canEdit || !ready} onChange={(v) => setS((x) => ({ ...x, service_charge_ledger_id: v }))} />
                <Field label="Service charge on dine-in (%)" htmlFor="ms-pct" hint="0 = none. The cashier may waive it for a bill."><NumberInput id="ms-pct" min="0" max="30" step="any" value={s.service_charge_pct ?? 0} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, service_charge_pct: e.target.value }))} /></Field>
              </div>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }} data-testid="packaging-config">
                <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Packaging</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <Field label="Packaging kind" htmlFor="ms-pk" hint="The kind of ingredient that is packaging (boxes, bags). Packaging on a takeaway order is chosen from items of this kind. Only one kind at a time.">
                    <SelectInput id="ms-pk" value={s.packaging_kind_id ?? ''} disabled={!canEdit || !ready} onChange={(e) => setS((x) => ({ ...x, packaging_kind_id: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">None chosen</option>
                      {kinds.filter((k) => k.packaging || k.id === s.packaging_kind_id).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </SelectInput>
                  </Field>
                  <SalesAccountSelect kind="sales" scope="product" label="Packaging sales account" value={s.packaging_sales_ledger_id} disabled={!canEdit || !ready}
                    onChange={(v) => setS((x) => ({ ...x, packaging_sales_ledger_id: v }))} hint="Where packaging charged to a customer is booked. Empty: the dishes' sales account, else the books' default sales account." />
                </div>
              </fieldset>
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
                <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Ingredient accounts</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <LedgerSelect id="ms-inv" label="Ingredient stock" hint="Where ingredients on the shelf are carried. Empty: Food Ingredients Inventory." value={s.ingredient_stock_ledger_id} disabled={!canEdit || !ready} onChange={(v) => setS((x) => ({ ...x, ingredient_stock_ledger_id: v }))} />
                  <LedgerSelect id="ms-prep" label="Prepared food" hint="Where food that is cooked ahead is carried until it is sold. Empty: Prepared Food Inventory." value={s.prepared_food_ledger_id} disabled={!canEdit || !ready} onChange={(v) => setS((x) => ({ ...x, prepared_food_ledger_id: v }))} />
                  <LedgerSelect id="ms-cos" label="Cost of food" hint="The cost of what dishes use. Empty: Food Cost of Sales." value={s.food_cost_ledger_id} disabled={!canEdit || !ready} onChange={(v) => setS((x) => ({ ...x, food_cost_ledger_id: v }))} />
                  <LedgerSelect id="ms-waste" label="Food waste" hint="Ingredients thrown away. Empty: Food Waste Expense." value={s.food_waste_ledger_id} disabled={!canEdit || !ready} onChange={(v) => setS((x) => ({ ...x, food_waste_ledger_id: v }))} />
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
        {s && <ListsCard canEdit={canEdit} />}
        {s && <ChannelsCard canEdit={canEdit} />}
        {s && <StationsCard canEdit={canEdit} />}
        {s && <KiosksCard canEdit={canEdit} />}
        {s && <ClockPlacesCard canEdit={canEdit} />}
      </div>
    </AdminLayout>
  );
}
