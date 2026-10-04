import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Star } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import locationsAPI from '../../../../_shared/api/locations';
import api from '../../../../_shared/api/axios';
import { resetCompany } from '../../../../_shared/lib/useCompany';
import { storageUrl } from '../../../../_shared/lib/storageUrl';
import { errMsg, fieldErrors } from '../../../../_shared/store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, NumberInput, SelectInput, FormGrid, FormStack, ModalActions, FormError, CheckboxRow } from '../ui/Form';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const SUBS = [
  { id: 'numbering', label: 'Voucher numbering' },
  { id: 'methods', label: 'Payment methods' },
  { id: 'period', label: 'Period control' },
  { id: 'defaults', label: 'Default ledgers' },
  { id: 'company', label: 'Company' },
];

const Section = ({ title, hint, action, children }) => (
  <div style={{ ...card, padding: 18, marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
      <div><p style={{ margin: 0, fontWeight: 700, color: colors.text }}>{title}</p>{hint && <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: colors.textMuted, maxWidth: 560, lineHeight: 1.5 }}>{hint}</p>}</div>
      {action}
    </div>
    {children}
  </div>
);

// ── numbering ───────────────────────────────────────────────────────────

function SeriesForm({ type, series, branches, onClose, onSaved }) {
  const editing = Boolean(series);
  const [f, setF] = useState({
    name: series?.name ?? 'Main', prefix: series?.prefix ?? '', suffix: series?.suffix ?? '', number_width: series?.number_width ?? 5,
    start_number: series?.start_number ?? 1, next_number: series?.next_number ?? 1, reset_period: series?.reset_period ?? 'never',
    location_id: series?.location_id ?? '', allow_manual: series?.allow_manual ?? true, is_default: series?.is_default ?? false, is_active: series?.is_active ?? true,
  });
  const [examples, setExamples] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    const t = setTimeout(() => {
      booksAPI.previewSeries({ prefix: f.prefix, suffix: f.suffix, number_width: Number(f.number_width) || 0, start_number: Number(editing ? f.next_number : f.start_number) || 0, location_id: f.location_id || null })
        .then((r) => setExamples(r.examples)).catch(() => setExamples([]));
    }, 200);
    return () => clearTimeout(t);
  }, [f.prefix, f.suffix, f.number_width, f.start_number, f.next_number, f.location_id, editing]);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setErr(null);
    const body = { ...f, location_id: f.location_id || null, number_width: Number(f.number_width), start_number: Number(f.start_number) };
    if (editing) body.next_number = Number(f.next_number); else delete body.next_number;
    try {
      if (editing) await booksAPI.updateSeries(series.id, body); else await booksAPI.createSeries(type.id, body);
      toast.success('Numbering saved'); onSaved(); onClose();
    } catch (x) { setErrs(fieldErrors(x)); if (!x.response?.data?.errors) setErr(errMsg(x, 'Could not save the series')); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`${type.name} numbering`} subtitle="Prefix, suffix, start number and reset — like Tally. Tokens: {YYYY} {YY} {MM} {BR}." onClose={onClose} width={560}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={err} />
          <Field label="Series name" error={errs.name}><TextInput required value={f.name} onChange={(e) => set('name')(e.target.value)} /></Field>
          <FormGrid>
            <Field label="Prefix" error={errs.prefix}><TextInput value={f.prefix} onChange={(e) => set('prefix')(e.target.value)} placeholder="WNKJ-INV-{YY}-" /></Field>
            <Field label="Suffix" error={errs.suffix}><TextInput value={f.suffix} onChange={(e) => set('suffix')(e.target.value)} placeholder="/{BR}" /></Field>
          </FormGrid>
          <FormGrid min={140}>
            <Field label="Digits" error={errs.number_width} hint="Zero-padded width; 0 = none"><NumberInput min="0" max="12" value={f.number_width} onChange={(e) => set('number_width')(e.target.value)} /></Field>
            <Field label={editing ? 'Next number' : 'Start at'} error={errs.start_number || errs.next_number}>
              {editing
                ? <NumberInput min="0" value={f.next_number} onChange={(e) => set('next_number')(e.target.value)} />
                : <NumberInput min="0" value={f.start_number} onChange={(e) => set('start_number')(e.target.value)} />}
            </Field>
            <Field label="Restart" error={errs.reset_period}>
              <SelectInput value={f.reset_period} onChange={(e) => set('reset_period')(e.target.value)}>
                <option value="never">Never</option><option value="yearly">Every year</option><option value="monthly">Every month</option><option value="financial_year">Every financial year</option>
              </SelectInput>
            </Field>
          </FormGrid>
          <Field label="Branch series" error={errs.location_id} hint="Give a branch its own numbering, or leave for all branches.">
            <SelectInput value={f.location_id} onChange={(e) => set('location_id')(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </SelectInput>
          </Field>
          <p style={{ margin: 0, padding: '10px 12px', borderRadius: 8, background: colors.tint(0.06), fontSize: '0.8rem', color: colors.text }}>
            Next numbers: <strong style={{ fontFamily: 'monospace' }}>{examples.join('  ,  ') || '—'}</strong>
          </p>
          <CheckboxRow checked={f.allow_manual} onChange={set('allow_manual')} label="Allow typing the number by hand" description="Manual override on the voucher form." />
          <CheckboxRow checked={f.is_default} onChange={set('is_default')} label="Default series for this type" />
          {editing && <CheckboxRow checked={f.is_active} onChange={set('is_active')} label="Active" />}
          <ModalActions onCancel={onClose} submitLabel="Save numbering" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function NumberingSection({ branches }) {
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState(null);
  const load = useCallback(() => booksAPI.types().then(setTypes).catch((e) => toast.error(errMsg(e, 'Could not load voucher types'))), []);
  useEffect(() => { load(); }, [load]);

  const toggleType = async (t) => {
    try { await booksAPI.updateType(t.id, { is_active: !t.is_active }); load(); } catch (e) { toast.error(errMsg(e, 'Could not update the voucher type')); }
  };
  const delSeries = async (s) => {
    if (!confirm(`Delete the series “${s.name}”?`)) return;
    try { await booksAPI.deleteSeries(s.id); toast.success('Series deleted'); load(); } catch (e) { toast.error(errMsg(e, 'Could not delete the series')); }
  };

  return (
    <>
      {types.map((t) => (
        <Section key={t.id} title={t.name} hint={`${t.base_type.replace('_', ' ')} · ${t.posts_accounts ? 'posts to the books' : 'no accounting entries'}${t.stock_effect !== 'none' ? ` · stock ${t.stock_effect}` : ''}`}
          action={<div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => toggleType(t)}>{t.is_active ? 'Switch off' : 'Switch on'}</button>
            <button type="button" style={{ ...btnGhost, padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setForm({ type: t })}><Plus size={12} /> Series</button>
          </div>}>
          {(t.series ?? []).map((s) => (
            <div key={s.id} onClick={() => setForm({ type: t, series: s })} role="button" tabIndex={0}
              style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', borderTop: `1px solid ${colors.tint(0.06)}`, opacity: s.is_active ? 1 : 0.5 }}>
              <span style={{ flex: 1, fontSize: '0.82rem' }}>
                {s.is_default && <Star size={12} color={colors.warning} style={{ marginRight: 4 }} />}
                <strong>{s.name}</strong>
                <span style={{ color: colors.textMuted }}> · {s.prefix || ''}{String(s.next_number).padStart(s.number_width, '0')}{s.suffix || ''}</span>
                {s.location_id && <span style={{ color: colors.textFaint }}> · {branches.find((b) => b.id === s.location_id)?.name ?? 'branch'}</span>}
              </span>
              <span style={{ fontSize: '0.7rem', color: colors.textFaint }}>restart: {s.reset_period.replace('_', ' ')}</span>
              <button type="button" aria-label={`Delete ${s.name}`} onClick={(e) => { e.stopPropagation(); delSeries(s); }} style={{ background: 'none', border: 'none', color: colors.textFaint, cursor: 'pointer' }}><Trash2 size={14} /></button>
            </div>
          ))}
        </Section>
      ))}
      {form && <SeriesForm type={form.type} series={form.series} branches={branches} onClose={() => setForm(null)} onSaved={load} />}
    </>
  );
}

// ── payment methods ─────────────────────────────────────────────────────

const KINDS = ['cash', 'bank', 'mobile', 'mobile_money', 'card', 'cheque', 'online', 'gift_voucher', 'other'];

function MethodForm({ method, ledgers, onClose, onSaved }) {
  const editing = Boolean(method);
  const [f, setF] = useState({ name: method?.name ?? '', kind: method?.kind ?? 'cash', ledger_id: method?.ledger_id ?? '', requires_reference: method?.requires_reference ?? false, is_online: method?.is_online ?? false, gateway: method?.gateway ?? '', instructions: method?.instructions ?? '', is_active: method?.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({}); setErr(null);
    try { const body = { ...f, gateway: f.gateway || null }; if (editing) await booksAPI.updateMethod(method.id, body); else await booksAPI.createMethod(body); toast.success('Payment method saved'); onSaved(); onClose(); }
    catch (x) { setErrs(fieldErrors(x)); if (!x.response?.data?.errors) setErr(errMsg(x, 'Could not save the payment method')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={editing ? `Edit ${method.name}` : 'New payment method'} subtitle="Every payment made this way posts to the ledger you choose." onClose={onClose}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={err} />
          <FormGrid>
            <Field label="Name" error={errs.name}><TextInput required value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder="M-Pesa Till 1234" /></Field>
            <Field label="Kind" error={errs.kind}><SelectInput value={f.kind} onChange={(e) => set('kind')(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</SelectInput></Field>
          </FormGrid>
          <Field label="Posts to ledger" error={errs.ledger_id} hint="Any asset ledger — cash, a bank account, a wallet. Create one under Chart of accounts if it isn't listed.">
            <SelectInput required value={f.ledger_id} onChange={(e) => set('ledger_id')(e.target.value)}>
              <option value="">Choose a ledger…</option>
              {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.group?.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Instructions for customers (optional)"><TextInput value={f.instructions} onChange={(e) => set('instructions')(e.target.value)} placeholder="Paybill 123456, account = order number" /></Field>
          <CheckboxRow checked={f.requires_reference} onChange={set('requires_reference')} label="Ask for a reference" description="e.g. the M-Pesa or cheque number." />
          <CheckboxRow checked={f.is_online} onChange={set('is_online')} label="Offer at checkout" />
          {f.is_online && (
            <Field label="How it is collected" hint="M-Pesa STK sends a prompt to the customer's phone and confirms itself. Leave blank to confirm by hand.">
              <SelectInput value={f.gateway} onChange={(e) => set('gateway')(e.target.value)}><option value="">Confirm manually</option><option value="mpesa_stk">M-Pesa STK push</option></SelectInput>
            </Field>
          )}
          {editing && <CheckboxRow checked={f.is_active} onChange={set('is_active')} label="Active" />}
          <ModalActions onCancel={onClose} submitLabel="Save" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function MethodsSection() {
  const [methods, setMethods] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [form, setForm] = useState(null);
  const load = useCallback(() => booksAPI.paymentMethods().then(setMethods).catch((e) => toast.error(errMsg(e, 'Could not load payment methods'))), []);
  useEffect(() => {
    load();
    booksAPI.ledgers({ all: 1, active_only: 1 }).then((r) => setLedgers((Array.isArray(r) ? r : r.data ?? []).filter((l) => l.group?.nature === 'asset'))).catch(() => {});
  }, [load]);
  const del = async (m) => {
    if (!confirm(`Delete “${m.name}”?`)) return;
    try { await booksAPI.deleteMethod(m.id); toast.success('Deleted'); load(); } catch (e) { toast.error(errMsg(e, 'Could not delete')); }
  };
  return (
    <Section title="Payment methods" hint="Advanced. These are made for you from your cash and bank ledgers. To change how customers pay at checkout, open the ledger in Accounts and use “Offer this at checkout”."
      action={<button type="button" style={btnPrimary} onClick={() => setForm('new')}><Plus size={14} /> New method</button>}>
      {methods.map((m) => (
        <div key={m.id} onClick={() => setForm(m)} role="button" tabIndex={0}
          style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 10px', borderTop: `1px solid ${colors.tint(0.06)}`, cursor: 'pointer', opacity: m.is_active ? 1 : 0.5 }}>
          <span style={{ flex: 1, fontSize: '0.85rem' }}><strong>{m.name}</strong> <span style={{ color: colors.textFaint }}>· {m.kind}</span></span>
          <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>→ {m.ledger?.name ?? '—'}</span>
          <button type="button" aria-label={`Delete ${m.name}`} onClick={(e) => { e.stopPropagation(); del(m); }} style={{ background: 'none', border: 'none', color: colors.textFaint, cursor: 'pointer' }}><Trash2 size={14} /></button>
        </div>
      ))}
      {form && <MethodForm method={form === 'new' ? null : form} ledgers={ledgers} onClose={() => setForm(null)} onSaved={load} />}
    </Section>
  );
}

// ── period control ──────────────────────────────────────────────────────

function PeriodSection({ isSuper }) {
  const [data, setData] = useState(null);
  const [types, setTypes] = useState([]);
  const [win, setWin] = useState({ edit_window_days: '', locked_before: '' });
  const [limits, setLimits] = useState([]);
  const [year, setYear] = useState({ name: '', start_date: '', end_date: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await booksAPI.settings();
      setData(d);
      setWin({ edit_window_days: d.settings.edit_window_days ?? '', locked_before: d.settings.locked_before?.slice?.(0, 10) ?? '' });
      setLimits(d.edit_limits.map((l) => ({ ...l })));
    } catch (e) { toast.error(errMsg(e, 'Could not load period control')); }
  }, []);
  useEffect(() => { load(); booksAPI.types().then(setTypes).catch(() => {}); }, [load]);

  if (!data) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  const setLimit = (i, k, v) => setLimits((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const saveWindow = async () => {
    setBusy(true);
    try { await booksAPI.saveSettings({ edit_window_days: win.edit_window_days === '' ? null : Number(win.edit_window_days), locked_before: win.locked_before || null }); toast.success('Saved'); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not save')); } finally { setBusy(false); }
  };
  const saveLimits = async () => {
    setBusy(true);
    try { await booksAPI.saveEditLimits(limits.map((l) => ({ role: l.role, voucher_type_id: l.voucher_type_id || null, max_days_back: l.max_days_back === '' || l.max_days_back == null ? null : Number(l.max_days_back), can_edit: !!l.can_edit, can_cancel: !!l.can_cancel }))); toast.success('Edit limits saved'); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not save the limits')); } finally { setBusy(false); }
  };
  const addYear = async (e) => {
    e.preventDefault();
    try { await booksAPI.createYear(year); setYear({ name: '', start_date: '', end_date: '' }); toast.success('Financial year added'); load(); }
    catch (x) { toast.error(errMsg(x, 'Could not add the year')); }
  };
  const closeYear = async (y) => {
    try { await booksAPI.closeYear(y.id, !y.is_closed); load(); } catch (e) { toast.error(errMsg(e, 'Could not change the year')); }
  };
  const ro = !isSuper;
  const small = { padding: '6px 8px', borderRadius: 6, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.8rem', width: 110 };

  return (
    <>
      {ro && <p style={{ fontSize: '0.8rem', color: colors.warningText, background: colors.warningBg, padding: '8px 12px', borderRadius: 8 }}>Only a super admin can change period control. You can see the current rules.</p>}
      <Section title="How far back can vouchers change?" hint="Company-wide fallback: vouchers older than this many days can't be edited or cancelled, and nothing before the lock date can change at all. Roles below can override the window.">
        <FormGrid min={180}>
          <Field label="Edit window (days)" hint="Blank = no limit"><NumberInput disabled={ro} min="0" value={win.edit_window_days} onChange={(e) => setWin((w) => ({ ...w, edit_window_days: e.target.value }))} /></Field>
          <Field label="Books locked before" hint="Hard lock for everyone"><TextInput disabled={ro} type="date" value={win.locked_before} onChange={(e) => setWin((w) => ({ ...w, locked_before: e.target.value }))} /></Field>
        </FormGrid>
        {!ro && <div style={{ marginTop: 12 }}><button type="button" style={btnPrimary} disabled={busy} onClick={saveWindow}>Save</button></div>}
      </Section>

      <Section title="Limits by role" hint="Set how many days back each role may edit, and whether it may cancel. Leave days blank for unlimited. A row can be narrowed to one voucher type."
        action={!ro && <button type="button" style={{ ...btnGhost, padding: '5px 10px' }} onClick={() => setLimits((l) => [...l, { role: 'admin', voucher_type_id: '', max_days_back: 30, can_edit: true, can_cancel: true }])}><Plus size={12} /> Add row</button>}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead><tr style={{ color: colors.textFaint, fontSize: '0.65rem', textAlign: 'left' }}><th style={{ padding: 6 }}>Role</th><th>Voucher type</th><th>Days back</th><th>Can edit</th><th>Can cancel</th><th /></tr></thead>
            <tbody>
              {limits.map((l, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${colors.tint(0.06)}` }}>
                  <td style={{ padding: 6 }}>
                    <select disabled={ro} value={l.role} onChange={(e) => setLimit(i, 'role', e.target.value)} style={small}>{data.roles.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                  </td>
                  <td><select disabled={ro} value={l.voucher_type_id ?? ''} onChange={(e) => setLimit(i, 'voucher_type_id', e.target.value)} style={{ ...small, width: 150 }}><option value="">All types</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
                  <td><input disabled={ro} type="number" min="0" placeholder="unlimited" value={l.max_days_back ?? ''} onChange={(e) => setLimit(i, 'max_days_back', e.target.value)} style={small} /></td>
                  <td><input disabled={ro} type="checkbox" checked={!!l.can_edit} onChange={(e) => setLimit(i, 'can_edit', e.target.checked)} /></td>
                  <td><input disabled={ro} type="checkbox" checked={!!l.can_cancel} onChange={(e) => setLimit(i, 'can_cancel', e.target.checked)} /></td>
                  <td>{!ro && <button type="button" aria-label="Remove row" onClick={() => setLimits((ls) => ls.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!ro && <div style={{ marginTop: 12 }}><button type="button" style={btnPrimary} disabled={busy} onClick={saveLimits}>Save limits</button></div>}
      </Section>

      <Section title="Financial years" hint="A closed year is frozen — no voucher dated inside it can be added, edited or cancelled.">
        {data.years.map((y) => (
          <div key={y.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${colors.tint(0.06)}`, fontSize: '0.85rem' }}>
            <strong style={{ flex: 1 }}>{y.name} <span style={{ fontWeight: 400, color: colors.textMuted }}>· {y.start_date} → {y.end_date}</span></strong>
            <span style={{ color: y.is_closed ? colors.dangerText : colors.successText, fontSize: '0.75rem', fontWeight: 700 }}>{y.is_closed ? 'Closed' : 'Open'}</span>
            {isSuper && <button type="button" style={{ ...btnGhost, padding: '4px 10px' }} onClick={() => closeYear(y)}>{y.is_closed ? 'Reopen' : 'Close year'}</button>}
          </div>
        ))}
        {!ro && (
          <form onSubmit={addYear} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <input required placeholder="FY 2027" value={year.name} onChange={(e) => setYear((y) => ({ ...y, name: e.target.value }))} style={{ ...small, width: 120 }} />
            <input required type="date" value={year.start_date} onChange={(e) => setYear((y) => ({ ...y, start_date: e.target.value }))} style={small} aria-label="Start" />
            <input required type="date" value={year.end_date} onChange={(e) => setYear((y) => ({ ...y, end_date: e.target.value }))} style={small} aria-label="End" />
            <button type="submit" style={btnPrimary}><Plus size={14} /> Add year</button>
          </form>
        )}
      </Section>
    </>
  );
}

// ── default ledgers ─────────────────────────────────────────────────────

const DEFAULTS = [
  ['walkin_ledger_id', 'Walk-in customer', 'Guests without an account are booked here.'],
  ['default_sales_ledger_id', 'Default sales account', 'Used when a line has no tax-specific sales account.'],
  ['default_purchase_ledger_id', 'Default purchases account', null],
  ['sales_returns_ledger_id', 'Sales returns', 'Credit notes post here.'],
  ['default_service_ledger_id', 'Default service income account', 'Used when a service has no service income account of its own.'],
  ['service_returns_ledger_id', 'Service returns', 'Credit notes for services post here.'],
  ['booking_deposit_ledger_id', 'Booking deposits', 'Money held for a booked service until it is done (a liability).'],
  ['tips_payable_ledger_id', 'Tips payable', 'Tips collected for staff, until they are paid out (a liability).'],
  ['purchase_returns_ledger_id', 'Purchase returns', 'Debit notes post here.'],
  ['shipping_income_ledger_id', 'Shipping & delivery income', 'Delivery charges on sales.'],
  ['discount_ledger_id', 'Discounts allowed', null],
  ['rounding_ledger_id', 'Rounding', null],
  ['bad_debt_ledger_id', 'Bad debts written off', 'Write-offs of unpaid invoices post here.'],
  ['discount_allowed_ledger_id', 'Discount allowed (small balances)', 'Small differences forgiven on settlement.'],
  ['bank_charges_ledger_id', 'Bank charges', 'Fees the bank takes, including for a bounced cheque.'],
  ['bounce_fee_ledger_id', 'Bounced cheque charges', 'What we bill a customer for a bounced cheque.'],
  ['cash_over_short_ledger_id', 'Cash over / short', 'Difference found when cash is counted.'],
  ['fx_gain_ledger_id', 'Exchange gain', 'Realised gain when a foreign payment settles at a better rate.'],
  ['fx_loss_ledger_id', 'Exchange loss', 'Realised loss when it settles at a worse rate.'],
  ['gift_voucher_ledger_id', 'Gift vouchers liability', 'Money held for unspent gift vouchers.'],
  ['loyalty_liability_ledger_id', 'Loyalty points liability', 'Value of points customers have earned.'],
  ['breakage_income_ledger_id', 'Gift voucher breakage income', 'Expired, unspent gift vouchers.'],
  ['rewards_expense_ledger_id', 'Rewards & referral expense', 'Cost of points and referral rewards.'],
  ['interest_income_ledger_id', 'Interest income', 'Late-payment interest charged to customers.'],
  ['stock_ledger_id', 'Stock', 'Value of goods you hold. Purchases add to it, sales and write-offs take from it.'],
  ['cogs_ledger_id', 'Cost of goods sold', 'What the goods you sold cost you.'],
  ['cost_of_services_ledger_id', 'Cost of services', 'Materials used up in a service but not charged to the customer.'],
  ['job_materials_ledger_id', 'Job materials cost', 'Parts bought elsewhere for a job (a side mirror bought for one repair).'],
  ['stock_loss_ledger_id', 'Stock loss', 'Expired, damaged or missing stock written off.'],
  ['wip_ledger_id', 'Work in progress', 'Cost of materials issued to jobs that are not finished yet.'],
  ['opening_balance_ledger_id', 'Opening stock balance', 'What opening stock is balanced against when you enter the stock you already hold.'],
];

function DefaultsSection({ isSuper }) {
  const [s, setS] = useState(null);
  const [ledgers, setLedgers] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    booksAPI.settings().then((d) => setS(d.settings)).catch((e) => toast.error(errMsg(e, 'Could not load settings')));
    booksAPI.ledgers({ all: 1, active_only: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {});
  }, []);
  if (!s) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  const save = async () => {
    setBusy(true);
    try {
      const body = Object.fromEntries(DEFAULTS.map(([k]) => [k, s[k] || null]));
      ['sales_rounding', 'cash_sale_rounding'].forEach((k) => { if (k in s) body[k] = s[k] || 'none'; });   // present once script 35 has been run
      await booksAPI.saveSettings(body); toast.success('Saved');
    }
    catch (e) { toast.error(errMsg(e, 'Could not save')); } finally { setBusy(false); }
  };
  return (
    <Section title="Default ledgers" hint="Where the engine posts when a line, charge or customer doesn't name a ledger itself.">
      <FormGrid min={260}>
        {DEFAULTS.map(([k, label, hint]) => (
          <Field key={k} label={label} hint={hint}>
            <SelectInput disabled={!isSuper} value={s[k] ?? ''} onChange={(e) => setS((x) => ({ ...x, [k]: e.target.value }))}>
              <option value="">— none —</option>
              {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </SelectInput>
          </Field>
        ))}
      </FormGrid>
      {'sales_rounding' in s && (
        <>
          <h4 style={{ margin: '18px 0 6px', fontSize: '0.85rem' }}>Rounding the total a customer pays</h4>
          <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: colors.textMuted }}>What a new voucher starts with. You can change it on each voucher. The difference goes to the Rounding ledger above and never changes the VAT.</p>
          <FormGrid min={260}>
            {[['sales_rounding', 'Sales invoices'], ['cash_sale_rounding', 'Cash sales']].map(([k, label]) => (
              <Field key={k} label={label}>
                <SelectInput disabled={!isSuper} value={s[k] ?? 'none'} onChange={(e) => setS((x) => ({ ...x, [k]: e.target.value }))}>
                  <option value="none">Do not round</option><option value="whole">Nearest whole number</option><option value="half">Nearest 0.50</option>
                </SelectInput>
              </Field>
            ))}
          </FormGrid>
        </>
      )}
      {isSuper ? <div style={{ marginTop: 12 }}><button type="button" style={btnPrimary} disabled={busy} onClick={save}>Save</button></div>
        : <p style={{ fontSize: '0.75rem', color: colors.textFaint }}>Only a super admin can change these.</p>}
    </Section>
  );
}

/** A list of phone numbers or email addresses with a label each; the starred one is the default (mail goes out from it / WhatsApp quotes it). */
function ContactList({ title, hint, rows, onChange, placeholder, type, disabled, errors }) {
  const list = rows ?? [];
  const set = (i, patch) => onChange(list.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const makeDefault = (i) => onChange(list.map((r, k) => ({ ...r, is_default: k === i })));
  const remove = (i) => { const next = list.filter((_, k) => k !== i); if (next.length && !next.some((r) => r.is_default)) next[0] = { ...next[0], is_default: true }; onChange(next); };
  const add = () => onChange([...list, { value: '', label: '', is_default: list.length === 0 }]);
  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <p style={{ margin: '0 0 2px', fontSize: '0.78rem', fontWeight: 700, color: colors.text }}>{title}</p>
      <p style={{ margin: '0 0 8px', fontSize: '0.72rem', color: colors.textMuted }}>{hint}</p>
      <div style={{ display: 'grid', gap: 6 }}>
        {list.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) auto auto', gap: 8, alignItems: 'center' }}>
            <TextInput disabled={disabled} type={type} value={r.value ?? ''} placeholder={placeholder} onChange={(e) => set(i, { value: e.target.value })} aria-label={`${title} ${i + 1}`} />
            <TextInput disabled={disabled} value={r.label ?? ''} placeholder="Label (Sales, Support…)" onChange={(e) => set(i, { label: e.target.value })} aria-label={`${title} ${i + 1} label`} />
            <button type="button" disabled={disabled} onClick={() => makeDefault(i)} title={r.is_default ? 'Default' : 'Make this the default'} aria-pressed={Boolean(r.is_default)}
              style={{ ...btnGhost, padding: '6px 10px', fontSize: '0.72rem', background: r.is_default ? colors.tint(0.12) : 'transparent', fontWeight: r.is_default ? 700 : 500 }}>
              <Star size={12} style={{ marginRight: 4, fill: r.is_default ? 'currentColor' : 'none' }} />{r.is_default ? 'Default' : 'Set default'}
            </button>
            <button type="button" disabled={disabled} onClick={() => remove(i)} aria-label={`Remove ${title} ${i + 1}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger }}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      {errors && <p role="alert" style={{ margin: '4px 0 0', fontSize: '0.72rem', color: colors.dangerText }}>{errors}</p>}
      {!disabled && <button type="button" onClick={add} style={{ ...btnGhost, marginTop: 8, padding: '5px 12px', fontSize: '0.75rem' }}><Plus size={12} /> Add {type === 'email' ? 'an email address' : 'a phone number'}</button>}
    </div>
  );
}

function CompanySection({ isSuper }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  useEffect(() => { api.get('/company').then((r) => setF(r.data)).catch((e) => toast.error(errMsg(e, 'Could not load company details'))); }, []);
  if (!f) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setErrs({});
    try { await api.put('/admin/books/company', f); resetCompany(); toast.success('Company details saved'); }
    catch (x) { setErrs(fieldErrors(x)); toast.error(errMsg(x, 'Could not save')); }
    finally { setBusy(false); }
  };
  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const body = new FormData();
    body.append('logo', file);
    setBusy(true);
    try {
      const r = await api.post('/admin/books/company/logo', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      setF((x) => ({ ...x, logo_url: r.data.logo_url })); resetCompany(); toast.success('Logo saved');
    } catch (x) { toast.error(errMsg(x, 'Could not upload the logo')); } finally { setBusy(false); }
  };
  const removeLogo = async () => {
    setBusy(true);
    try { await api.delete('/admin/books/company/logo'); setF((x) => ({ ...x, logo_url: null })); resetCompany(); toast.success('Logo removed'); }
    catch (x) { toast.error(errMsg(x, 'Could not remove the logo')); } finally { setBusy(false); }
  };
  const rows = [['name', 'Trading name'], ['short_code', 'Short code'], ['legal_name', 'Legal name'], ['tax_pin', 'Tax PIN'], ['address', 'Address'], ['city', 'City'], ['country', 'Country'], ['website', 'Website'], ['tagline', 'Tagline']];
  return (
    <Section title="Company" hint="Emails, documents and the chat assistant use these — nothing is written into the code.">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ width: 160, height: 80, borderRadius: 10, border: '1.5px dashed var(--line)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {f.logo_url ? <img src={storageUrl(f.logo_url)} alt="Company logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>No logo yet</span>}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Company logo</div>
          <p style={{ margin: '2px 0 8px', fontSize: '0.74rem', color: colors.textMuted }}>Printed top left on statements, letters and documents. PNG, JPG, WebP or GIF, up to 2 MB. A wide logo on a white or transparent background works best.</p>
          {isSuper && (
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ ...btnPrimary, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                {f.logo_url ? 'Replace logo' : 'Upload logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadLogo} disabled={busy} style={{ display: 'none' }} />
              </label>
              {f.logo_url && <button type="button" style={btnGhost} disabled={busy} onClick={removeLogo}>Remove</button>}
            </div>
          )}
        </div>
      </div>
      <FormGrid min={240}>
        {rows.map(([k, l]) => <Field key={k} label={l} error={errs[k]}><TextInput disabled={!isSuper} value={f[k] ?? ''} onChange={set(k)} /></Field>)}
      </FormGrid>
      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <ContactList title="Phone numbers" type="tel" placeholder="+254 7…" disabled={!isSuper} rows={f.phones} onChange={(phones) => setF((x) => ({ ...x, phones }))}
          hint="Printed on invoices (default first) and quoted in the WhatsApp message to customers. The default is the main number." errors={errs.phones} />
        <ContactList title="Email addresses" type="email" placeholder="sales@yourcompany.com" disabled={!isSuper} rows={f.emails} onChange={(emails) => setF((x) => ({ ...x, emails }))}
          hint="The default is the address the system sends mail from; customers' replies come back to it. The others are printed on invoices." errors={errs['emails.0.value'] || errs.emails} />
      </div>
      {isSuper ? <div style={{ marginTop: 12 }}><button type="button" style={btnPrimary} disabled={busy} onClick={save}>Save</button></div>
        : <p style={{ fontSize: '0.75rem', color: colors.textFaint }}>Only a super admin can change these.</p>}
    </Section>
  );
}

export default function SettingsTab({ isSuper }) {
  const [params] = useSearchParams();
  const [sub, setSub] = useState(SUBS.some((x) => x.id === params.get('sub')) ? params.get('sub') : 'numbering');
  const [branches, setBranches] = useState([]);
  useEffect(() => { locationsAPI.getAdmin().then((r) => setBranches(r.locations ?? [])).catch(() => {}); }, []);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {SUBS.map((s) => (
          <button key={s.id} type="button" onClick={() => setSub(s.id)}
            style={{ ...btnGhost, padding: '6px 14px', fontWeight: s.id === sub ? 700 : 500, background: s.id === sub ? colors.tint(0.1) : 'transparent', color: s.id === sub ? colors.primaryDeep : colors.textMuted }}>
            {s.label}
          </button>
        ))}
      </div>
      {sub === 'numbering' && <NumberingSection branches={branches} />}
      {sub === 'methods' && <MethodsSection />}
      {sub === 'period' && <PeriodSection isSuper={isSuper} />}
      {sub === 'defaults' && <DefaultsSection isSuper={isSuper} />}
      {sub === 'company' && <CompanySection isSuper={isSuper} />}
    </div>
  );
}
