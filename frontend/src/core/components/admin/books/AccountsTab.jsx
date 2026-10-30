import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ChevronRight, ChevronDown, Lock, FileText, Download, Table2, LayoutList, LayoutGrid, Network } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { hasPermission } from '../../../../_shared/lib/roles';
import useStatementLines from './useStatementLines';
import StatementLineField from './StatementLineField';
import { errMsg, fieldErrors } from '../../../../_shared/store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, NumberInput, SelectInput, TextArea, FormGrid, FormStack, ModalActions, FormError, CheckboxRow } from '../ui/Form';
import SimpleTable from '../ui/SimpleTable';
import { SheetView, BlocksView, MapView } from './ChartViews';
import CurrencySelect from './CurrencySelect';
import StarterAccounts from './StarterAccounts';
import useNarrow from './useNarrow';
import { exportElement } from '../../../../_shared/lib/captureExport';
import { downloadCsv } from '../../../../_shared/lib/tableExport';
import taxAPI from '../../../../_shared/api/tax';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const LAYOUTS = [
  { key: 'table',  label: 'Table',  icon: <Table2 size={15} /> },
  { key: 'sheet',  label: 'Sheet',  icon: <LayoutList size={15} /> },
  { key: 'blocks', label: 'Blocks', icon: <LayoutGrid size={15} /> },
  { key: 'map',    label: 'Map',    icon: <Network size={15} /> },
];
const readLayout = () => { try { const v = window.localStorage.getItem('view.chart-of-accounts'); return LAYOUTS.some((l) => l.key === v) ? v : 'table'; } catch { return 'table'; } };

const NATURE = { asset: 'Asset', liability: 'Liability', income: 'Income', expense: 'Expense' };

function flat(groups, depth = 0, out = []) {
  groups.forEach((g) => { out.push({ ...g, depth }); flat(g.children ?? [], depth + 1, out); });
  return out;
}

function GroupNode({ g, depth, selected, onSelect, open, toggle, leaves, onLedger }) {
  const own = leaves?.[g.id] ?? [];   // while filtering by kind: the matching ledgers sit under their group
  const isOpen = leaves ? true : (open[g.id] ?? depth < 1);
  const has = (g.children ?? []).length > 0;
  return (
    <div>
      <div onClick={() => onSelect(g)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(g)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', paddingLeft: 8 + depth * 14, borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
          background: selected === g.id ? colors.tint(0.1) : 'transparent', color: g.is_primary ? colors.primary : colors.text, fontWeight: g.is_primary ? 700 : 500 }}>
        <span onClick={(e) => { e.stopPropagation(); toggle(g.id, isOpen); }} style={{ width: 16, display: 'inline-flex', color: colors.textFaint }}>
          {has ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        <span style={{ flex: 1 }}>{g.name}</span>
        {g.is_system && <Lock size={11} color={colors.textGhost} aria-label="System group" />}
        <span style={{ fontSize: '0.68rem', color: colors.textFaint }}>{leaves ? own.length || '' : g.ledger_count || ''}</span>
      </div>
      {own.map((l) => (
        <div key={`l${l.id}`} onClick={() => onLedger?.(l)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onLedger?.(l)}
          style={{ padding: '4px 8px', paddingLeft: 8 + (depth + 1) * 14 + 16, fontSize: '0.78rem', cursor: 'pointer', color: colors.text, fontStyle: 'italic' }}>{l.name}</div>
      ))}
      {has && isOpen && g.children.map((c) => <GroupNode key={c.id} g={c} depth={depth + 1} selected={selected} onSelect={onSelect} open={open} toggle={toggle} leaves={leaves} onLedger={onLedger} />)}
    </div>
  );
}

function LedgerForm({ ledger, groups, defaultGroupId, onClose, onSaved }) {
  const editing = Boolean(ledger);
  const [f, setF] = useState({
    name: ledger?.name ?? '', group_id: ledger?.group_id ?? defaultGroupId ?? '', code: ledger?.code ?? '',
    opening_balance: ledger?.opening_balance ?? 0, opening_side: ledger?.opening_side ?? 'D', notes: ledger?.notes ?? '', address: ledger?.address ?? '', is_active: ledger?.is_active ?? true,
    currency_id: ledger?.currency_id ?? '', rate_type: ledger?.rate_type ?? '', rate_value: ledger?.rate_value ?? '', valid_from: ledger?.valid_from ?? '', valid_until: ledger?.valid_until ?? '',
    tax_nature: ledger?.tax_nature ?? '', tax_rate_ledger_id: ledger?.tax_rate_ledger_id ?? '', affects_stock: ledger?.affects_stock ?? false,
    bank_name: ledger?.bank_name ?? '', account_number: ledger?.account_number ?? '', branch: ledger?.branch ?? '',
    account_name: ledger?.account_name ?? '', swift_code: ledger?.swift_code ?? '', branch_code: ledger?.branch_code ?? '', accepts: ledger?.accepts ?? '',
    mobile_kind: ledger?.mobile_kind ?? '', mobile_number: ledger?.mobile_number ?? '', cash_kind: ledger?.cash_kind ?? '',
    offer_at_checkout: ledger?.offer_at_checkout ?? false, checkout_mode: ledger?.checkout_mode ?? 'details', checkout_label: ledger?.checkout_label ?? '', checkout_instructions: ledger?.checkout_instructions ?? '', checkout_sort: ledger?.checkout_sort ?? 0,
    min_amount: ledger?.min_amount ?? '', max_amount: ledger?.max_amount ?? '', free_above: ledger?.free_above ?? '', transit_days: ledger?.transit_days ?? '', side: ledger?.side ?? 'income',
    charge_kind: ledger?.settings?.charge_kind ?? 'other', timing: ledger?.settings?.timing ?? 'on_win', refundable: ledger?.settings?.refundable ?? false,
    default_on: ledger?.settings?.default_on ?? false, free_days: ledger?.settings?.free_days ?? 0, tax_follows: ledger?.settings?.tax_follows ?? 'own',
    delivery_tax_rate_id: ledger?.settings?.tax_rate_id ?? '',
    statement_id: '',   // '' follows the group's line; set below for a ledger that has its own
  });
  // The group decides which fields exist (Tally: the group carries the behaviour).
  const behaviour = flat(groups).find((g) => String(g.id) === String(f.group_id))?.behaviour ?? 'standard';
  const chosenGroup = flat(groups).find((g) => String(g.id) === String(f.group_id));
  const stmt = useStatementLines();
  const canChangeLine = hasPermission(null, 'books.statements');
  // a ledger on a line of its own shows that line; one on its group's line shows "follows the group"
  useEffect(() => {
    if (!editing || !stmt.ready) return;
    const groupLine = flat(groups).find((g) => g.id === ledger.group_id)?.statement_id ?? null;
    setF((x) => ({ ...x, statement_id: ledger.statement_id && ledger.statement_id !== groupLine ? String(ledger.statement_id) : '' }));
  }, [stmt.ready]);   // eslint-disable-line react-hooks/exhaustive-deps
  const rated = behaviour === 'tax' || behaviour === 'delivery';
  const expense = behaviour === 'delivery' && f.side === 'expense';
  const trading = behaviour === 'sales' || behaviour === 'purchase';
  const charging = behaviour === 'charge';
  const inGroup = (name) => { const all = flat(groups); let g = all.find((x) => String(x.id) === String(f.group_id)); while (g) { if (g.name === name) return true; g = all.find((x) => x.id === g.parent_id); } return false; };
  const optionalTax = !trading && !charging && !rated && inGroup('Indirect Expenses');   // an expense account may carry a tax (VAT on rent, say) but need not
  const taxed = trading || charging || optionalTax;
  const bankGroup = inGroup('Bank Accounts');
  const cashGroup = inGroup('Cash-in-hand');
  const money = bankGroup || cashGroup;   // a ledger money is paid into: bank, till, mobile money, cash on delivery
  const bankish = behaviour === 'bank' || bankGroup;
  const isParty = (() => { const all = flat(groups); let g = all.find((x) => String(x.id) === String(f.group_id)); while (g) { if (['Sundry Debtors', 'Sundry Creditors'].includes(g.name)) return true; g = all.find((x) => x.id === g.parent_id); } return false; })();
  const [rateChoices, setRateChoices] = useState([]);
  useEffect(() => {
    if (!taxed && !(behaviour === 'delivery' && !expense)) return;
    taxAPI.getRates({ active: true }).then((r) => setRateChoices((r.tax_rates ?? []).filter((x) => x.rate_type === 'percentage' && x.tax_type?.application_mode !== 'withheld'))).catch(() => {});
  }, [taxed, behaviour, expense]);
  const taxChoice = (f.tax_nature === 'taxable' || f.tax_nature === 'zero_rated') && f.tax_rate_ledger_id ? `rate:${f.tax_rate_ledger_id}` : (f.tax_nature || '');
  const rateGroups = rateChoices.reduce((m, r) => { const k = r.tax_type?.name || r.tax_type?.code || 'Tax rates'; (m[k] = m[k] || []).push(r); return m; }, {});
  // the other taxes this account carries, after the first one chosen above (a sales or purchase account can carry several)
  const [extras, setExtras] = useState(() => (ledger?.taxes ?? []).slice(1).map((t) => ({ tax_type_id: t.tax_type_id, tax_rate_id: t.tax_rate_id ?? '', treatment: t.treatment })));
  const taxTypes = Object.values(rateChoices.reduce((m, r) => { const t = r.tax_type; if (t) m[t.id] = { id: t.id, name: t.name || t.code }; return m; }, {}));
  const setExtra = (i, patch) => setExtras((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  // an own line that does not fit the nature of a newly chosen group is dropped (the ledger then follows that group)
  useEffect(() => { if (f.statement_id && stmt.byId[Number(f.statement_id)]?.nature !== chosenGroup?.nature) setF((x) => ({ ...x, statement_id: '' })); }, [f.group_id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setErr(null);
    try {
      const blank = (v) => (v === '' ? null : v);
      const body = { ...f, currency_id: blank(f.currency_id) };
      // the statement line is only sent by someone who may choose it; for everyone else the server keeps what is there (or follows the group)
      if (stmt.ready && canChangeLine) body.statement_id = f.statement_id === '' ? null : Number(f.statement_id); else delete body.statement_id;
      if ((rated && !expense) || charging) {
        ['rate_type', 'rate_value', 'valid_from', 'valid_until', 'min_amount', 'max_amount', 'free_above', 'transit_days'].forEach((k) => { body[k] = blank(f[k]); });
      } else {
        ['rate_type', 'rate_value', 'valid_from', 'valid_until', 'min_amount', 'max_amount', 'free_above', 'transit_days'].forEach((k) => { body[k] = null; });
      }
      if (behaviour !== 'delivery') body.side = null;
      // a delivery charge's tax is kept with its settings (the same place the Shipping settings page puts it); what else is there stays
      if (behaviour === 'delivery') body.settings = { ...(ledger?.settings ?? {}), tax_rate_id: !expense && f.delivery_tax_rate_id ? Number(f.delivery_tax_rate_id) : null };
      if (charging) body.settings = { charge_kind: f.charge_kind, timing: f.timing, refundable: Boolean(f.refundable), default_on: Boolean(f.default_on), free_days: Number(f.free_days) || 0, tax_follows: f.tax_follows };
      if (!taxed) { body.tax_nature = null; body.tax_rate_ledger_id = null; body.affects_stock = false; } else {
        body.tax_nature = f.tax_nature || null;
        body.tax_rate_ledger_id = (f.tax_nature === 'taxable' || f.tax_nature === 'zero_rated') ? blank(f.tax_rate_ledger_id) : null;
        // the taxes in order: the first is the one chosen above, then the others; the server keeps the old tax fields in step with the first
        if (!f.tax_nature && optionalTax) body.taxes = [];   // an expense account with no tax: clear any it had
        if (f.tax_nature) {
          const first = rateChoices.find((r) => String(r.id) === String(f.tax_rate_ledger_id));
          const primary = f.tax_rate_ledger_id && (f.tax_nature === 'taxable' || f.tax_nature === 'zero_rated')
            ? { tax_type_id: first?.tax_type?.id ?? null, tax_rate_id: Number(f.tax_rate_ledger_id), treatment: f.tax_nature === 'zero_rated' ? 'zero_rated' : 'applies' }
            : { tax_type_id: null, tax_rate_id: null, treatment: f.tax_nature };
          body.taxes = [primary, ...extras.map((x) => ({ tax_type_id: x.tax_type_id || null, tax_rate_id: x.treatment === 'applies' || x.treatment === 'zero_rated' ? (x.tax_rate_id || null) : null, treatment: x.treatment }))];
        }
      }
      if (!bankish) { body.bank_name = null; body.account_number = null; body.branch = null; body.account_name = null; body.swift_code = null; body.branch_code = null; }
      if (!money) { ['accepts', 'mobile_kind', 'mobile_number', 'cash_kind', 'checkout_label', 'checkout_instructions'].forEach((k) => { body[k] = null; }); body.offer_at_checkout = false; body.checkout_sort = 0; }
      else { ['accepts', 'mobile_kind', 'mobile_number', 'cash_kind', 'checkout_label', 'checkout_instructions'].forEach((k) => { body[k] = blank(f[k]); }); body.checkout_sort = Number(f.checkout_sort) || 0; body.checkout_mode = f.offer_at_checkout ? f.checkout_mode : undefined; }
      const r = editing ? await booksAPI.updateLedger(ledger.id, body) : await booksAPI.createLedger(body);
      const type = r?.data?.asset_type;
      toast.success(editing ? 'Ledger saved' : type ? `Ledger created, and “${type.name}” added to Assets as an asset` : 'Ledger created');
      onSaved(); onClose();
    } catch (x) { setErrs(fieldErrors(x)); if (!x.response?.data?.errors) setErr(errMsg(x, 'Could not save the ledger')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={editing ? `Edit ${ledger.name}` : 'New ledger'} subtitle="An account that vouchers post to." onClose={onClose}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={err} />
          <Field label="Name" error={errs.name} hint={ledger?.is_system ? 'System ledgers keep their name: the books find them by it.' : undefined}><TextInput required disabled={ledger?.is_system} value={f.name} onChange={(e) => set('name')(e.target.value)} /></Field>
          <Field label="Group" error={errs.group_id} hint={ledger?.is_system ? 'System ledgers stay in their group.' : 'Where it appears in the chart and the reports.'}>
            <SelectInput required disabled={ledger?.is_system} value={f.group_id} onChange={(e) => set('group_id')(e.target.value)}>
              <option value="">Choose…</option>
              {flat(groups).map((g) => <option key={g.id} value={g.id}>{'  '.repeat(g.depth)}{g.name}</option>)}
            </SelectInput>
          </Field>
          {stmt.ready && (
            <StatementLineField lines={stmt.lines} nature={chosenGroup?.nature} inheritedId={chosenGroup?.statement_id ?? null} inheritedFrom="its group"
              value={f.statement_id} onChange={set('statement_id')} canChange={canChangeLine} error={errs.statement_id} />
          )}
          {taxed && (
            <>
              <Field label={optionalTax ? 'Tax on this account (optional)' : 'Tax on this account *'} error={errs.tax_nature || errs.tax_rate_ledger_id} hint={optionalTax ? 'Leave empty for no tax. Choose a rate and a line posted here is taxed, as Buyer premium holds VAT 16%.' : behaviour === 'sales'
                ? 'Required. Every sale line posted here is taxed this way — keep VAT-able goods and exempt goods on separate accounts.'
                : behaviour === 'charge' ? 'Required. Fees are often VAT-able; a refundable deposit is not — it is out of scope.'
                : 'Required. Every purchase line posted here is treated this way.'}>
                <SelectInput required={!optionalTax} value={taxChoice}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith('rate:')) {
                      const r = rateChoices.find((x) => String(x.id) === v.slice(5));
                      setF((p) => ({ ...p, tax_rate_ledger_id: Number(v.slice(5)), tax_nature: r && Number(r.rate_value) === 0 ? 'zero_rated' : 'taxable' }));
                    } else setF((p) => ({ ...p, tax_rate_ledger_id: '', tax_nature: v }));
                  }}>
                  <option value="">{optionalTax ? 'No tax' : 'Choose the tax…'}</option>
                  {Object.entries(rateGroups).map(([tt, rs]) => (
                    <optgroup key={tt} label={tt}>
                      {rs.map((r) => <option key={r.id} value={`rate:${r.id}`}>{r.name} ({Number(r.rate_value)}%)</option>)}
                    </optgroup>
                  ))}
                  <optgroup label="No tax charged">
                    <option value="exempt">Exempt</option>
                    <option value="out_of_scope">Out of scope</option>
                  </optgroup>
                </SelectInput>
                {rateChoices.length === 0 && <span style={{ fontSize: 12, color: '#b45309' }}>No tax rates in the system yet — add them under Duties &amp; Taxes; until then only Exempt / Out of scope are available.</span>}
              </Field>
              {f.tax_nature && (
                <div style={{ padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.025)' }}>
                  <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 700 }}>Other taxes on this account</p>
                  <p style={{ margin: '0 0 8px', fontSize: '0.72rem', color: '#6b7280', lineHeight: 1.5 }}>The tax above is the one charged today. Taxes added here, such as excise duty on top of VAT, are recorded now and start to be charged with the tax posting update.</p>
                  {extras.map((x, i) => {
                    const withRate = x.treatment === 'applies' || x.treatment === 'zero_rated';
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.2fr) auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                        <SelectInput aria-label={`Other tax ${i + 1}`} value={x.tax_type_id ?? ''} onChange={(e) => setExtra(i, { tax_type_id: e.target.value ? Number(e.target.value) : '', tax_rate_id: '' })}>
                          <option value="">Choose the tax…</option>
                          {taxTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </SelectInput>
                        <SelectInput aria-label={`Treatment of other tax ${i + 1}`} value={x.treatment} onChange={(e) => setExtra(i, { treatment: e.target.value })}>
                          <option value="applies">Charged</option><option value="zero_rated">Zero-rated</option><option value="exempt">Exempt</option><option value="out_of_scope">Out of scope</option>
                        </SelectInput>
                        {withRate
                          ? (
                            <SelectInput aria-label={`Rate of other tax ${i + 1}`} value={x.tax_rate_id ?? ''} onChange={(e) => setExtra(i, { tax_rate_id: e.target.value ? Number(e.target.value) : '' })}>
                              <option value="">Choose the rate…</option>
                              {rateChoices.filter((r) => r.tax_type?.id === Number(x.tax_type_id)).map((r) => <option key={r.id} value={r.id}>{r.name} ({Number(r.rate_value)}%)</option>)}
                            </SelectInput>
                          ) : <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No rate</span>}
                        <button type="button" aria-label={`Remove other tax ${i + 1}`} onClick={() => setExtras((xs) => xs.filter((_, k) => k !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={15} /></button>
                      </div>
                    );
                  })}
                  {errs.taxes && <span style={{ display: 'block', fontSize: 12, color: '#dc2626', marginBottom: 6 }}>{errs.taxes}</span>}
                  <button type="button" onClick={() => setExtras((xs) => [...xs, { tax_type_id: '', tax_rate_id: '', treatment: 'applies' }])} style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.75rem' }}><Plus size={12} /> Add another tax</button>
                </div>
              )}
            </>
          )}
          {charging && (
            <>
              <FormGrid>
                <Field label="What it is" error={errs['settings.charge_kind']}>
                  <SelectInput value={f.charge_kind} onChange={(e) => { const k = e.target.value; setF((p) => ({ ...p, charge_kind: k, timing: k === 'entry_fee' ? 'entry' : k === 'deposit' ? 'deposit' : k === 'storage' ? 'after_win' : 'on_win', refundable: k === 'deposit' ? true : p.refundable })); }}>
                    <option value="buyer_premium">Buyer's premium / fee</option><option value="entry_fee">Entry / registration fee</option><option value="deposit">Deposit (refundable)</option>
                    <option value="delivery">Shipping / delivery</option><option value="handling">Handling / processing fee</option><option value="storage">Storage fee</option>
                    <option value="removal">Removal / collection fee</option><option value="payment">Payment / transaction fee</option><option value="customs">Import / customs charges</option><option value="other">Other</option>
                  </SelectInput>
                </Field>
                <Field label="When it is charged" error={errs['settings.timing']} hint="Entry and deposit are taken before bidding; “on winning” is added to the winner's order; “after winning” builds up later.">
                  <SelectInput value={f.timing} onChange={(e) => set('timing')(e.target.value)}>
                    <option value="on_win">On winning (added to the order)</option><option value="entry">To take part (entry)</option><option value="deposit">Held as a deposit</option><option value="after_win">After winning (e.g. storage)</option>
                  </SelectInput>
                </Field>
              </FormGrid>
              <FormGrid>
                <Field label="Worked out as" error={errs.rate_type}>
                  <SelectInput required value={f.rate_type} onChange={(e) => set('rate_type')(e.target.value)}>
                    <option value="">Choose…</option><option value="percent">% of the winning bid</option><option value="fixed">Fixed amount</option><option value="per_day">Amount per day</option>
                  </SelectInput>
                </Field>
                <Field label={f.rate_type === 'percent' ? 'Rate (%)' : 'Amount'} error={errs.rate_value}><NumberInput required min="0" step="0.0001" value={f.rate_value} onChange={(e) => set('rate_value')(e.target.value)} /></Field>
              </FormGrid>
              {f.rate_type && f.rate_type !== 'percent' && (
                <Field label="Currency" error={errs.currency_id} hint="Converted to the auction's currency when the charge is added to an auction."><CurrencySelect value={f.currency_id} onChange={set('currency_id')} /></Field>
              )}
              <FormGrid>
                <Field label="Minimum" error={errs.min_amount} hint="A percentage never comes to less than this."><NumberInput min="0" step="0.01" value={f.min_amount} onChange={(e) => set('min_amount')(e.target.value)} /></Field>
                <Field label="Maximum" error={errs.max_amount} hint="…and never more than this."><NumberInput min="0" step="0.01" value={f.max_amount} onChange={(e) => set('max_amount')(e.target.value)} /></Field>
              </FormGrid>
              {f.rate_type === 'per_day' && (
                <Field label="Free days" error={errs['settings.free_days']} hint="Days before the daily charge starts."><NumberInput min="0" step="1" value={f.free_days} onChange={(e) => set('free_days')(e.target.value)} /></Field>
              )}
              <Field label="Tax on this charge follows" error={errs['settings.tax_follows']} hint="Usually a fee has its own tax (chosen above). Choose the auction's sales account if this charge should be taxed exactly like the item — exempt on an exempt auction, VAT-able on a VAT-able one.">
                <SelectInput value={f.tax_follows} onChange={(e) => set('tax_follows')(e.target.value)}>
                  <option value="own">This charge's own tax</option><option value="auction">The auction's sales account</option>
                </SelectInput>
              </Field>
              <CheckboxRow checked={f.refundable} onChange={set('refundable')} label="Refundable" description="Given back to the bidder (or applied to what they owe) instead of kept as income." />
              <CheckboxRow checked={f.default_on} onChange={set('default_on')} label="On for every new auction" description="New auctions start with this charge; you can still switch it off per auction." />
            </>
          )}
          {bankish && (
            <FormGrid>
              <Field label="Bank"><TextInput value={f.bank_name} onChange={(e) => set('bank_name')(e.target.value)} /></Field>
              <Field label="Account name"><TextInput value={f.account_name} onChange={(e) => set('account_name')(e.target.value)} /></Field>
              <Field label="Account number"><TextInput value={f.account_number} onChange={(e) => set('account_number')(e.target.value)} /></Field>
              <Field label="SWIFT code"><TextInput value={f.swift_code} onChange={(e) => set('swift_code')(e.target.value)} /></Field>
              <Field label="Branch"><TextInput value={f.branch} onChange={(e) => set('branch')(e.target.value)} /></Field>
              <Field label="Branch code"><TextInput value={f.branch_code} onChange={(e) => set('branch_code')(e.target.value)} /></Field>
            </FormGrid>
          )}
          {money && (
            <>
              {bankGroup && (
                <Field label="This account takes" hint="What you ask for when you record a receipt or payment on it.">
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.82rem' }}>
                    {[['eft', 'Electronic fund transfer'], ['transfer', 'Other transfers'], ['cheque', 'Cheques'], ['card', 'Card'], ['mobile', 'Mobile money']].map(([k, label]) => {
                      const on = f.accepts.split(',').includes(k);
                      return <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={on} onChange={() => set('accepts')((on ? f.accepts.split(',').filter((x) => x && x !== k) : [...f.accepts.split(',').filter(Boolean), k]).join(','))} /> {label}</label>;
                    })}
                  </div>
                </Field>
              )}
              {cashGroup && (
                <FormGrid>
                  <Field label="Kind of cash"><SelectInput value={f.cash_kind} onChange={(e) => set('cash_kind')(e.target.value)}>
                    <option value="">Not set</option><option value="till">Till</option><option value="petty">Petty cash</option><option value="driver">Driver cash — cash on delivery</option><option value="undeposited">Undeposited</option>
                  </SelectInput></Field>
                  <Field label="Mobile money"><SelectInput value={f.mobile_kind} onChange={(e) => set('mobile_kind')(e.target.value)}>
                    <option value="">Not mobile money</option><option value="till">Till number</option><option value="paybill">Paybill</option><option value="send">Send money (phone)</option>
                  </SelectInput></Field>
                  {f.mobile_kind && <Field label="Number"><TextInput value={f.mobile_number} onChange={(e) => set('mobile_number')(e.target.value)} /></Field>}
                </FormGrid>
              )}
              <div style={{ border: `1px solid ${colors.tint(0.12)}`, borderRadius: 10, padding: 12 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={f.offer_at_checkout} onChange={(e) => set('offer_at_checkout')(e.target.checked)} /> Offer this at checkout
                </label>
                <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: colors.textMuted }}>Customers can choose it as how they will pay. It is only a note on their order — the money is recorded when you convert the order.</p>
                {f.offer_at_checkout && (
                  <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                    <Field label="How do customers pay with it?">
                      <SelectInput value={f.checkout_mode} onChange={(e) => set('checkout_mode')(e.target.value)}>
                        <option value="details">Show my details — they pay us, we record it (bank transfer, till number, cash on delivery)</option>
                        <option value="mpesa_stk">Automatic M-Pesa prompt — they get a prompt on their phone and pay on the spot</option>
                      </SelectInput>
                    </Field>
                    {f.checkout_mode === 'mpesa_stk' && <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textMuted }}>The automatic prompt also needs the M-Pesa keys on the server (the Daraja settings in the .env file).</p>}
                    <FormGrid>
                      <Field label="Shown to the customer as" error={errs.checkout_label}><TextInput value={f.checkout_label} onChange={(e) => set('checkout_label')(e.target.value)} placeholder={f.cash_kind === 'driver' ? 'Cash on delivery' : f.name} /></Field>
                      <Field label="Order in the list"><NumberInput min="0" value={f.checkout_sort} onChange={(e) => set('checkout_sort')(e.target.value)} /></Field>
                    </FormGrid>
                    {f.checkout_mode !== 'mpesa_stk' && <Field label="What the customer is told" error={errs.offer_at_checkout} hint="Blank = worked out from the details above (bank account, till number, cash on delivery)."><TextArea rows={2} value={f.checkout_instructions} onChange={(e) => set('checkout_instructions')(e.target.value)} /></Field>}
                  </div>
                )}
              </div>
            </>
          )}
          {behaviour === 'delivery' && (
            <Field label="This ledger is" error={errs.side} hint="Charges we bill customers are income; what the courier costs us is an expense.">
              <SelectInput value={f.side} onChange={(e) => set('side')(e.target.value)}><option value="income">A delivery charge (income)</option><option value="expense">A delivery cost (expense)</option></SelectInput>
            </Field>
          )}
          {behaviour === 'delivery' && !expense && (
            <Field label="Tax on delivery" error={errs['settings.tax_rate_id']} hint="Adds this tax to the shipping charge. Leave on No tax if delivery is not taxed.">
              <SelectInput value={f.delivery_tax_rate_id} onChange={(e) => set('delivery_tax_rate_id')(e.target.value)}>
                <option value="">No tax</option>
                {rateChoices.map((r) => <option key={r.id} value={r.id}>{r.tax_type?.code} {Number(r.rate_value)}%</option>)}
              </SelectInput>
            </Field>
          )}
          {rated && !expense && (
            <>
              <FormGrid>
                <Field label="Rate type" error={errs.rate_type}>
                  <SelectInput value={f.rate_type} onChange={(e) => set('rate_type')(e.target.value)}>
                    <option value="">Choose…</option><option value="percent">Percentage</option><option value="fixed">Fixed amount</option><option value="per_unit">Per unit (kg, km…)</option>
                  </SelectInput>
                </Field>
                <Field label={f.rate_type === 'percent' ? 'Rate (%)' : 'Amount'} error={errs.rate_value}><NumberInput min="0" step="0.0001" value={f.rate_value} onChange={(e) => set('rate_value')(e.target.value)} /></Field>
              </FormGrid>
              {f.rate_type && f.rate_type !== 'percent' && (
                <Field label="Currency" error={errs.currency_id} hint="Converted to the invoice currency on the day of the voucher."><CurrencySelect value={f.currency_id} onChange={set('currency_id')} /></Field>
              )}
              <FormGrid>
                <Field label="Valid from" error={errs.valid_from}><TextInput type="date" value={f.valid_from ?? ''} onChange={(e) => set('valid_from')(e.target.value)} /></Field>
                <Field label="Valid until" error={errs.valid_until}><TextInput type="date" value={f.valid_until ?? ''} onChange={(e) => set('valid_until')(e.target.value)} /></Field>
              </FormGrid>
              {behaviour === 'delivery' && (
                <>
                  <FormGrid>
                    <Field label="Minimum charge" error={errs.min_amount}><NumberInput min="0" step="0.01" value={f.min_amount} onChange={(e) => set('min_amount')(e.target.value)} /></Field>
                    <Field label="Maximum charge" error={errs.max_amount}><NumberInput min="0" step="0.01" value={f.max_amount} onChange={(e) => set('max_amount')(e.target.value)} /></Field>
                  </FormGrid>
                  <FormGrid>
                    <Field label="Free above (order value)" error={errs.free_above}><NumberInput min="0" step="0.01" value={f.free_above} onChange={(e) => set('free_above')(e.target.value)} /></Field>
                    <Field label="Transit days" error={errs.transit_days}><NumberInput min="0" step="1" value={f.transit_days} onChange={(e) => set('transit_days')(e.target.value)} /></Field>
                  </FormGrid>
                </>
              )}
            </>
          )}
          <FormGrid>
            <Field label="Opening balance" error={errs.opening_balance}><NumberInput min="0" step="0.01" value={f.opening_balance} onChange={(e) => set('opening_balance')(e.target.value)} /></Field>
            <Field label="Debit / credit" error={errs.opening_side}>
              <SelectInput value={f.opening_side} onChange={(e) => set('opening_side')(e.target.value)}><option value="D">Debit (Dr)</option><option value="C">Credit (Cr)</option></SelectInput>
            </Field>
          </FormGrid>
          {isParty && <Field label="Address" error={errs.address}><TextInput value={f.address} onChange={(e) => set('address')(e.target.value)} placeholder="Street, town" /></Field>}
          <Field label="Code (optional)" error={errs.code}><TextInput value={f.code} onChange={(e) => set('code')(e.target.value)} /></Field>
          {editing && <CheckboxRow checked={f.is_active} onChange={set('is_active')} label="Active" description="Switch off to stop new postings without losing history." />}
          <ModalActions onCancel={onClose} submitLabel={editing ? 'Save' : 'Create ledger'} busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function GroupForm({ groups, parentId, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState(parentId ?? '');
  const [behaviour, setBehaviour] = useState('');
  const [line, setLine] = useState('');
  const stmt = useStatementLines();
  const canChangeLine = hasPermission(null, 'books.statements');
  const parentGroup = flat(groups).find((g) => String(g.id) === String(parent));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await booksAPI.createGroup({ name, parent_id: parent, behaviour: behaviour || undefined, ...(stmt.ready && canChangeLine ? { statement_id: line === '' ? null : Number(line) } : {}) }); toast.success('Group added'); onSaved(); onClose(); }
    catch (x) { setErr(errMsg(x, 'Could not add the group')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="New group" subtitle="Groups can nest as deep as you like. The top-level groups are fixed." onClose={onClose}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={err} />
          <Field label="Name"><TextInput required value={name} onChange={(e) => setName(e.target.value)} placeholder="Rent & Rates" /></Field>
          <Field label="Under">
            <SelectInput required value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">Choose…</option>
              {flat(groups).map((g) => <option key={g.id} value={g.id}>{'  '.repeat(g.depth)}{g.name}</option>)}
            </SelectInput>
          </Field>
          {stmt.ready && (
            <StatementLineField lines={stmt.lines} nature={parentGroup?.nature} inheritedId={parentGroup?.statement_id ?? null} inheritedFrom="the group above"
              value={line} onChange={setLine} canChange={canChangeLine} />
          )}
          <Field label="Behaves as" hint="Leave as inherited unless this group holds tax or delivery ledgers.">
            <SelectInput value={behaviour} onChange={(e) => setBehaviour(e.target.value)}>
              <option value="">Same as its parent</option><option value="standard">Ordinary accounts</option><option value="tax">Duties &amp; taxes (rates)</option><option value="delivery">Shipping &amp; delivery (charges)</option><option value="sales">Sales accounts (tax nature)</option><option value="purchase">Purchase accounts (tax nature)</option><option value="bank">Bank / cash</option><option value="charge">Auction charges (fees, deposits)</option>
            </SelectInput>
          </Field>
          <ModalActions onCancel={onClose} submitLabel="Add group" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

/** The statement line a group's ledgers report under: shown to everyone, changed by people with books.statements. */
function GroupLine({ group, stmt, canChange, onSaved }) {
  const own = group.statement_id ? String(group.statement_id) : '';
  const [value, setValue] = useState(own);
  const [move, setMove] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValue(own); }, [group.id, own]);
  const current = stmt.byId[group.statement_id]?.name;
  if (!canChange) return <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>Reports under: {current ?? 'not set'}</p>;
  const save = async () => {
    setBusy(true);
    try {
      const r = await booksAPI.updateGroup(group.id, { statement_id: value === '' ? null : Number(value), apply_to_members: move });
      const n = (r.statement?.moved_ledgers ?? 0) + (r.statement?.moved_groups ?? 0);
      toast.success(n ? `Saved. ${r.statement.moved_ledgers} ledger${r.statement.moved_ledgers === 1 ? '' : 's'} and ${r.statement.moved_groups} subgroup${r.statement.moved_groups === 1 ? '' : 's'} moved with it.` : 'Saved');
      onSaved(r.statement?.statement_id ?? null);
    } catch (e) { toast.error(errMsg(e, 'Could not save the statement line')); } finally { setBusy(false); }
  };
  const offered = stmt.lines.filter((l) => l.nature === group.nature);
  return (
    <div style={{ margin: '8px 0 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.75rem' }}>
      <label htmlFor="group-statement-line" style={{ color: colors.textFaint }}>Reports under</label>
      <SelectInput id="group-statement-line" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 'auto', minWidth: 220, padding: '5px 8px' }}>
        {group.parent_id && <option value="">Follow the group above</option>}
        {offered.map((l) => <option key={l.id} value={l.id}>{l.path ? `${l.path} › ` : ''}{l.name}</option>)}
      </SelectInput>
      <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: colors.textMuted }}>
        <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} style={{ accentColor: colors.primary }} /> Move its ledgers that are on the old line
      </label>
      <button type="button" style={{ ...btnGhost, padding: '4px 10px' }} disabled={busy || value === own} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  );
}

export default function AccountsTab({ canWrite }) {
  const nav = useNavigate();
  const stmt = useStatementLines();
  const canChangeLine = hasPermission(null, 'books.statements');
  const [groups, setGroups] = useState([]);
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState({});
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ledgerForm, setLedgerForm] = useState(null);
  const [groupForm, setGroupForm] = useState(false);
  const [starters, setStarters] = useState(false);
  const [starterPending, setStarterPending] = useState(0);   // what the starter packs would still add: 0 hides the button
  const loadStarterPending = useCallback(() => { booksAPI.chartStarters().then((r) => setStarterPending(r.pending ?? 1)).catch(() => setStarterPending(1)); }, []);
  useEffect(() => { loadStarterPending(); }, [loadStarterPending]);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');   // only ledgers of this kind (bank, customer, tax, fixed asset...)
  const [kinds, setKinds] = useState([]);
  useEffect(() => { booksAPI.ledgerKinds().then((r) => setKinds(r.kinds ?? [])).catch(() => setKinds([])); }, []);
  const [kindLedgers, setKindLedgers] = useState([]);   // every ledger of the chosen kind, for the group tree
  useEffect(() => {
    if (!kind) { setKindLedgers([]); return undefined; }
    let live = true;
    booksAPI.ledgers({ all: 1, kind }).then((r) => { if (live) setKindLedgers(Array.isArray(r) ? r : r.data ?? []); }).catch(() => { if (live) setKindLedgers([]); });
    return () => { live = false; };
  }, [kind]);
  const narrow = useNarrow(900);
  const [showGroups, setShowGroups] = useState(false);   // on a small screen the group picker stays out of the way until asked for
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const chartRef = useRef(null);
  const [layout, setLayoutState] = useState(readLayout);
  const chart = layout !== 'table';
  const setLayout = (v) => { setLayoutState(v); try { window.localStorage.setItem('view.chart-of-accounts', v); } catch { /* not remembered: fine */ } };

  const loadGroups = useCallback(() => booksAPI.groups().then(setGroups).catch((e) => toast.error(errMsg(e, 'Could not load the chart of accounts'))), []);
  const loadLedgers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await booksAPI.ledgers({ all: 1, group_id: sel?.id || undefined, search: search || undefined, kind: kind || undefined });
      setLedgers(Array.isArray(res) ? res : res.data ?? []);
    } catch (e) { toast.error(errMsg(e, 'Could not load ledgers')); }
    finally { setLoading(false); }
  }, [sel, search, kind]);

  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => { const t = setTimeout(loadLedgers, search ? 250 : 0); return () => clearTimeout(t); }, [loadLedgers]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeGroup = async () => {
    if (!sel || !confirm(`Delete the group “${sel.name}”?`)) return;
    try { await booksAPI.deleteGroup(sel.id); toast.success('Group deleted'); setSel(null); loadGroups(); }
    catch (e) { toast.error(errMsg(e, 'Could not delete the group')); }
  };
  const removeLedger = async (l) => {
    if (!confirm(`Delete the ledger “${l.name}”?`)) return;
    try { await booksAPI.deleteLedger(l.id); toast.success('Ledger deleted'); loadLedgers(); loadGroups(); }
    catch (e) { toast.error(errMsg(e, 'Could not delete the ledger')); }
  };

  // the chart views narrow to the picked group (and what is under it) the same way the table does
  const findGroup = (list, id) => { for (const g of list) { if (g.id === id) return g; const f = findGroup(g.children ?? [], id); if (f) return f; } return null; };
  const chartGroups = sel ? [findGroup(groups, sel.id) ?? sel] : groups;

  const exportLedgers = () => {
    const tax = (l) => ({ taxable: 'VAT-able', zero_rated: 'Zero-rated', exempt: 'Exempt', out_of_scope: 'Out of scope' }[l.tax_nature] ?? '');
    downloadCsv(`chart-of-accounts${sel ? `-${sel.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`, [
      { label: 'Ledger', value: (l) => l.name }, { label: 'Code', value: (l) => l.code }, { label: 'Group', value: (l) => l.group?.name }, { label: 'Nature', value: (l) => NATURE[l.group?.nature] },
      { label: 'Tax', value: tax }, { label: 'Rate', value: (l) => (l.tax_rate_ledger?.rate_value != null && (l.tax_nature === 'taxable' || l.tax_nature === 'zero_rated') ? `${Number(l.tax_rate_ledger.rate_value)}%` : l.rate_value != null && l.rate_type ? Number(l.rate_value) : '') },
      { label: 'Opening balance', value: (l) => Number(l.opening_balance) || 0 }, { label: 'Opening side', value: (l) => (Number(l.opening_balance) ? (l.opening_side === 'C' ? 'Cr' : 'Dr') : '') }, { label: 'Active', value: (l) => (l.is_active === false ? 'no' : 'yes') },
    ], ledgers);
  };

  const exportChart = async (format) => {
    setExportOpen(false);
    if (!chartRef.current) return;
    setExporting(true);
    try {
      await exportElement(chartRef.current, {
        name: `chart-of-accounts-${layout}${sel ? `-${sel.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`,
        title: 'Chart of accounts',
        subtitle: `${sel ? sel.name : 'All groups'} · ${LAYOUTS.find((l) => l.key === layout)?.label} view · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        format,
      });
    } catch (e) { console.error('Chart export failed', e); toast.error('Could not make the file. Try the table view and export CSV.'); }
    finally { setExporting(false); }
  };
  const pickGroup = (g) => { setSel(g); if (narrow) setShowGroups(false); };

  const columns = [
    { key: 'name', label: 'Ledger', render: (l) => <strong style={{ color: colors.primary, fontWeight: 600 }}>{l.name}{!l.is_active && <span style={{ color: colors.textFaint, fontWeight: 400 }}> · off</span>}</strong> },
    { key: 'group', label: 'Group', render: (l) => l.group?.name },
    { key: 'kind', label: 'Kind', render: (l) => l.kind_label ?? '' },
    { key: 'nature', label: 'Nature', render: (l) => NATURE[l.group?.nature] },
    ...(stmt.ready ? [{ key: 'line', label: 'Statement line', render: (l) => stmt.byId[l.statement_id]?.name ?? <span style={{ color: colors.textFaint }}>—</span> }] : []),
    { key: 'tax', label: 'Tax', render: (l) => `${{ taxable: 'VAT-able', zero_rated: 'Zero-rated', exempt: 'Exempt', out_of_scope: 'Out of scope' }[l.tax_nature] ?? (['sales', 'purchase', 'charge'].includes(l.group?.behaviour) ? 'Not set' : '')}${(l.taxes?.length ?? 0) > 1 ? ` +${l.taxes.length - 1} more` : ''}` },
    { key: 'rate', label: 'Rate', align: 'right', render: (l) => (l.tax_rate_ledger?.rate_value != null && (l.tax_nature === 'taxable' || l.tax_nature === 'zero_rated') ? `${Number(l.tax_rate_ledger.rate_value)}%` : l.rate_type && l.rate_value != null ? (l.rate_type === 'percent' ? `${Number(l.rate_value)}%` : `${Number(l.rate_value).toLocaleString()}${l.rate_type === 'per_day' ? '/day' : ''}`) : '—') },
    { key: 'opening', label: 'Opening', align: 'right', render: (l) => Number(l.opening_balance) ? `${Number(l.opening_balance).toLocaleString()} ${l.opening_side === 'C' ? 'Cr' : 'Dr'}` : '—' },
    { key: 'actions', label: '', align: 'right', render: (l) => (
      <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
        <button type="button" style={{ ...btnGhost, padding: '4px 10px' }} onClick={() => nav(`/admin/books?tab=reports&report=ledger&ledger=${l.id}`)}><FileText size={12} /> Statement</button>
        {canWrite && !l.is_system && !l.customer_id && <button type="button" style={{ ...btnGhost, padding: '4px 10px', color: colors.danger }} onClick={() => removeLedger(l)}>Delete</button>}
      </span>
    ) },
  ];

    // with a kind chosen the tree keeps only the groups that hold ledgers of it, with those ledgers listed under them
    const leaves = kind ? kindLedgers.reduce((m, l) => { (m[l.group_id] = m[l.group_id] || []).push(l); return m; }, {}) : null;
    const prune = (g) => { const children = (g.children ?? []).map(prune).filter(Boolean); return (leaves[g.id]?.length || children.length) ? { ...g, children } : null; };
    const treeGroups = leaves ? groups.map(prune).filter(Boolean) : groups;
    const openLedger = (l) => (canWrite ? setLedgerForm(l) : nav(`/admin/books?tab=reports&report=ledger&ledger=${l.id}`));
    const tree = (
      <div style={{ ...card, padding: 10, marginBottom: narrow ? 12 : 0 }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px 8px' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textFaint }}>GROUPS</span>
          <button type="button" onClick={() => pickGroup(null)} style={{ background: 'none', border: 'none', fontSize: '0.72rem', color: colors.primary, cursor: 'pointer' }}>Show all</button>
        </div>
        {treeGroups.map((g) => (
          <GroupNode key={g.id} g={g} depth={0} selected={sel?.id} onSelect={pickGroup} open={open} toggle={(id, cur) => setOpen((o) => ({ ...o, [id]: !cur }))} leaves={leaves} onLedger={openLedger} />
        ))}
        {leaves && !treeGroups.length && <p style={{ color: colors.textFaint, fontSize: '0.78rem', padding: '4px 8px' }}>No ledgers of this kind.</p>}
        {canWrite && (
          <div style={{ display: 'flex', gap: 6, padding: '10px 6px 2px', flexWrap: 'wrap' }}>
            <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setGroupForm(true)}><Plus size={12} /> Group</button>
            {sel && !sel.is_system && <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem', color: colors.danger }} onClick={removeGroup}>Delete “{sel.name}”</button>}
          </div>
        )}
      </div>
    );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0, 1fr)' : 'minmax(220px, 300px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
      {!narrow && tree}
      <div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: colors.primary }}>{sel ? sel.name : 'All ledgers'}</p>
            {sel && <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>{NATURE[sel.nature]} · includes subgroups</p>}
            {sel && stmt.ready && <GroupLine group={sel} stmt={stmt} canChange={canChangeLine} onSaved={(line) => { setSel((x) => (x ? { ...x, statement_id: line } : x)); loadGroups(); loadLedgers(); }} />}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div role="group" aria-label="Layout" style={{ display: 'inline-flex', overflow: 'hidden', borderRadius: 8, border: `1.5px solid ${colors.tint(0.2)}` }}>
              {LAYOUTS.map(({ key, label, icon }, i) => {
                const next = LAYOUTS[(LAYOUTS.findIndex((l) => l.key === layout) + 1) % LAYOUTS.length].key === key;   // F3 steps to the next layout
                return (
                  <button key={key} type="button" aria-pressed={layout === key} aria-label={label} title={layout === key ? label : `${label}${next ? ' (F3)' : ''}`} data-hotkey={next ? 'F3' : undefined} onClick={() => setLayout(key)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 10px', border: 'none', borderLeft: i ? `1px solid ${colors.tint(0.12)}` : 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 600,
                      background: layout === key ? colors.tint(0.16) : 'transparent', color: layout === key ? colors.primary : colors.textFaint }}>
                    {icon}{layout === key && label}
                  </button>
                );
              })}
            </div>
            {narrow && <button type="button" aria-expanded={showGroups} style={btnGhost} onClick={() => setShowGroups((v) => !v)}>Groups <ChevronDown size={13} style={{ transform: showGroups ? 'rotate(180deg)' : 'none' }} /></button>}
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <button type="button" style={btnGhost} disabled={!ledgers.length || exporting} aria-haspopup={chart ? 'menu' : undefined} aria-expanded={chart ? exportOpen : undefined}
                onClick={() => (chart ? setExportOpen((v) => !v) : exportLedgers())}><Download size={14} /> {exporting ? 'Making file…' : 'Export'}{chart && <ChevronDown size={12} />}</button>
              {exportOpen && (
                <>
                  <button type="button" aria-label="Close menu" onClick={() => setExportOpen(false)} style={{ position: 'fixed', inset: 0, background: 'transparent', border: 'none', cursor: 'default', zIndex: 20 }} />
                  <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 21, minWidth: 190, padding: 6, borderRadius: 10, background: 'var(--surface-card)', border: '1px solid var(--line)', boxShadow: '0 12px 28px rgba(0,0,0,0.3)' }}>
                    {[['pdf', 'PDF document'], ['jpeg', 'JPEG picture']].map(([f, label]) => (
                      <button key={f} role="menuitem" type="button" onClick={() => exportChart(f)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', color: 'var(--text-primary)' }}>{label}</button>
                    ))}
                  </div>
                </>
              )}
            </span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ledgers…" aria-label="Search ledgers" style={{ flex: '1 1 150px', minWidth: 0, padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.8rem' }} />
            {kinds.length > 0 && <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Show ledgers of kind" style={{ padding: '7px 8px', borderRadius: 8, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.8rem' }}><option value="">All kinds</option>{kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>}
            {canWrite && starterPending > 0 && <button type="button" style={btnGhost} onClick={() => setStarters(true)}>Add starter accounts</button>}
            {canWrite && <button type="button" style={btnPrimary} onClick={() => setLedgerForm('new')}><Plus size={14} /> New ledger</button>}
          </div>
        </div>
        {narrow && showGroups && tree}
        <div ref={chartRef}>
        {layout === 'table'
          ? <div style={{ overflowX: 'auto' }}><SimpleTable columns={columns} rows={ledgers} loading={loading} onRowClick={canWrite ? setLedgerForm : undefined} empty="No ledgers in this group yet." /></div>
          : loading && !ledgers.length ? <p style={{ color: colors.textFaint, fontSize: '0.85rem' }}>Loading…</p>
          : (() => {
              const open = (l) => (canWrite ? setLedgerForm(l) : nav(`/admin/books?tab=reports&report=ledger&ledger=${l.id}`));
              const View = { sheet: SheetView, blocks: BlocksView, map: MapView }[layout];
              return <View groups={chartGroups} ledgers={ledgers} searching={Boolean(search) || Boolean(kind)} onOpen={open} />;
            })()}
        </div>
      </div>
      {ledgerForm && <LedgerForm ledger={ledgerForm === 'new' ? null : ledgerForm} groups={groups} defaultGroupId={sel?.id} onClose={() => setLedgerForm(null)} onSaved={() => { loadLedgers(); loadGroups(); }} />}
      {groupForm && <GroupForm groups={groups} parentId={sel?.id} onClose={() => setGroupForm(false)} onSaved={loadGroups} />}
      {starters && <StarterAccounts onClose={() => setStarters(false)} onDone={() => { loadGroups(); loadLedgers(); loadStarterPending(); }} />}
    </div>
  );
}
