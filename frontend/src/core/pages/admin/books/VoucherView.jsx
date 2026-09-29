import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Ban, ArrowRightLeft, Banknote } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import booksAPI from '../../../../_shared/api/books';
import taxAPI from '../../../../_shared/api/tax';
import useAuthStore from '../../../../_shared/store/authStore';
import { canWriteFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { Chip, ExportMenu } from '../../../components/admin/books/booksUi';
import { money, today } from '../../../components/admin/books/booksFmt';

const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const r = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const TARGETS = { quotation: [['sales_order', 'Sales order'], ['sales', 'Sales invoice']], purchase_order: [['receipt_note', 'Receipt note (goods in)'], ['purchase', 'Purchase invoice']], receipt_note: [['purchase', 'Purchase invoice']], sales_order: [['delivery_note', 'Delivery note'], ['sales', 'Sales invoice'], ['cash_sale', 'Cash sale']], delivery_note: [['sales', 'Sales invoice'], ['cash_sale', 'Cash sale']] };

function ConvertModal({ v, methods, onClose, onDone }) {
  const options = TARGETS[v.type.base_type] ?? [];
  const [to, setTo] = useState(options[0]?.[0] ?? '');
  const [method, setMethod] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await booksAPI.convertVoucher(v.id, { to, date, payment_method_id: to === 'cash_sale' ? method || undefined : undefined }); toast.success(res.message); onDone(res.data); }
    catch (x) { setErr(errMsg(x, 'Could not convert')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Convert ${v.voucher_number}`} subtitle="Only what hasn't already been delivered or invoiced is carried over." onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Create a"><SelectInput value={to} onChange={(e) => setTo(e.target.value)}>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
          {to === 'cash_sale' && (
            <Field label="Payment method"><SelectInput required value={method} onChange={(e) => setMethod(e.target.value)}><option value="">Choose…</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</SelectInput></Field>
          )}
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel="Convert" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function ReceiveModal({ v, methods, onClose, onDone }) {
  const [amount, setAmount] = useState(v.outstanding);
  const [method, setMethod] = useState('');
  const [ref, setRef] = useState('');
  const [wh, setWh] = useState('');
  const [whRates, setWhRates] = useState([]);
  useEffect(() => { taxAPI.getRates({ active: true }).then((r) => setWhRates((r.tax_rates ?? []).filter((x) => x.tax_type?.application_mode === 'withheld'))).catch(() => {}); }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const chosen = methods.find((m) => String(m.id) === String(method));
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await booksAPI.receive(v.id, { payment_method_id: method, amount: Number(amount), reference_no: ref || undefined, date: today(), ...(wh ? { withholding: { tax_rate_id: Number(wh) } } : {}) }); toast.success(res.message); onDone(); }
    catch (x) { setErr(errMsg(x, 'Could not record the payment')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Receive payment for ${v.voucher_number}`} subtitle={`${money(v.outstanding)} outstanding`} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Amount"><NumberInput required min="0.01" step="0.01" max={v.outstanding} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Payment method"><SelectInput required value={method} onChange={(e) => setMethod(e.target.value)}><option value="">Choose…</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</SelectInput></Field>
          <Field label={chosen?.requires_reference ? 'Reference (required)' : 'Reference'}><TextInput required={chosen?.requires_reference} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="M-Pesa code, cheque no.…" /></Field>
          {whRates.length > 0 && (
            <Field label="Customer withheld tax?" hint="The amount above is the gross settling the invoice; the withheld part becomes a tax credit we hold.">
              <SelectInput value={wh} onChange={(e) => setWh(e.target.value)}><option value="">No</option>{whRates.map((r) => <option key={r.id} value={r.id}>{r.tax_type?.name} {Number(r.rate_value)}{r.rate_type === 'percentage' ? '%' : ''}{r.classification ? ` — ${r.classification}` : ''}</option>)}</SelectInput>
            </Field>
          )}
          <ModalActions onCancel={onClose} submitLabel="Record receipt" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function VoucherView() {
  const { id } = useParams();
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const [v, setV] = useState(null);
  const [error, setError] = useState(null);
  const [methods, setMethods] = useState([]);
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    setError(null);
    return booksAPI.voucher(id).then(setV).catch((e) => setError(errMsg(e, 'Could not load the voucher')));
  }, [id]);
  useEffect(() => { load(); booksAPI.paymentMethods().then((m) => setMethods(m.filter((x) => x.is_active))).catch(() => {}); }, [load]);

  const cancel = async () => {
    const reason = window.prompt(`Cancel ${v.voucher_number}? Give a reason (stock is put back and the entries are reversed):`);
    if (reason === null) return;
    try { const res = await booksAPI.cancelVoucher(v.id, reason); toast.success(res.message); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not cancel'), { duration: 7000 }); }
  };

  if (error) return <AdminLayout><div style={{ padding: 32 }}><p role="alert" style={{ color: colors.dangerText }}>{error}</p><Link to="/admin/books">Back to Books</Link></div></AdminLayout>;
  if (!v) return <AdminLayout><div style={{ padding: 32, color: colors.textMuted }}>Loading…</div></AdminLayout>;

  const base = v.type.base_type;
  const live = v.status === 'posted';
  const convertible = live && ['quotation', 'sales_order', 'delivery_note', 'purchase_order', 'receipt_note'].includes(base) && v.fulfilment_status !== 'closed' && !(base === 'quotation' && v.doc_status !== 'quoted');
  const receivable = live && ['sales', 'debit_note'].includes(base) && Number(v.outstanding) > 0.005;
  const children = (id2) => (v.items ?? []).filter((i) => i.parent_item_id === id2);
  const top = (v.items ?? []).filter((i) => !i.parent_item_id);

  return (
    <AdminLayout>
      <div style={{ padding: '28px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <Link to="/admin/books" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', color: colors.textMuted, textDecoration: 'none', marginBottom: 10 }}><ArrowLeft size={14} /> Books</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: colors.primary }}>{v.type.name} <span style={{ fontFamily: 'monospace' }}>{v.voucher_number}</span></h1>
            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: colors.textMuted }}>
              {v.date} · {v.location?.name ?? 'No branch'} · <Chip status={v.status} /> {v.fulfilment_status && <Chip status={v.fulfilment_status} />}
              {v.channel && v.channel !== 'admin' && <> · via {v.channel}</>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <ExportMenu onExport={(f) => booksAPI.exportVoucher(v.id, f)} />
            {canWrite && convertible && <button type="button" style={btnPrimary} onClick={() => setModal('convert')}><ArrowRightLeft size={14} /> Convert</button>}
            {canWrite && receivable && <button type="button" style={btnPrimary} onClick={() => setModal('receive')}><Banknote size={14} /> Receive payment</button>}
            {canWrite && live && <button type="button" style={btnGhost} onClick={() => nav(`/admin/books/vouchers/${v.id}/edit`)}><Pencil size={14} /> Edit</button>}
            {canWrite && live && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={cancel}><Ban size={14} /> Cancel</button>}
          </div>
        </div>

        {v.status === 'cancelled' && <p role="status" style={{ padding: '10px 14px', borderRadius: 8, background: colors.dangerBg, color: colors.dangerText, fontSize: '0.82rem' }}>Cancelled{v.cancel_reason ? ` — ${v.cancel_reason}` : ''}. Its entries and stock movements are reversed.</p>}

        <div style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16, fontSize: '0.82rem' }}>
          <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>PARTY</span>{v.party_ledger?.name ?? '—'}</div>
          {v.payment_method && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>PAYMENT</span>{v.payment_method.name}</div>}
          {v.reference_no && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>REFERENCE</span>{v.reference_no}</div>}
          {v.source && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>FROM</span><Link to={`/admin/books/vouchers/${v.source.id}`}>{v.source.voucher_number}</Link></div>}
          {(v.children ?? []).length > 0 && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>LED TO</span>{v.children.map((c) => <div key={c.id}><Link to={`/admin/books/vouchers/${c.id}`}>{c.voucher_number}</Link>{c.status === 'cancelled' && ' (cancelled)'}</div>)}</div>}
          {v.outstanding != null && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>OUTSTANDING</span><strong style={{ color: Number(v.outstanding) > 0.005 ? colors.warningText : colors.successText }}>{money(v.outstanding)}</strong></div>}
          {v.narration && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>NARRATION</span>{v.narration}</div>}
        </div>

        {top.length > 0 && (
          <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: colors.tint(0.02) }}><th style={th}>Item</th><th style={th}>Variant</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Rate</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={{ ...th, textAlign: 'right' }}>Tax</th>{['sales_order', 'delivery_note', 'purchase_order', 'receipt_note'].includes(base) && <th style={{ ...th, textAlign: 'right' }}>Done</th>}</tr></thead>
                <tbody>
                  {top.map((i) => (
                    <FragmentRows key={i.id} item={i} kids={children(i.id)} showDone={['sales_order', 'delivery_note', 'purchase_order', 'receipt_note'].includes(base)} />
                  ))}
                  <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}><td style={td} colSpan={4}>Subtotal / tax / total</td><td style={{ ...td, ...r }}>{money(v.subtotal)}</td><td style={{ ...td, ...r }}>{money(v.tax_total)}</td>{['sales_order', 'delivery_note', 'purchase_order', 'receipt_note'].includes(base) && <td style={td} />}</tr>
                  <tr style={{ fontWeight: 800 }}><td style={td} colSpan={4}>Total {v.currency?.code}</td><td style={{ ...td, ...r }} colSpan={2}>{money(v.total_amount)}</td>{['sales_order', 'delivery_note', 'purchase_order', 'receipt_note'].includes(base) && <td style={td} />}</tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {v.footer && (v.footer.charges.length > 0 || v.footer.taxes.length > 0 || v.footer.discount_total > 0) && (
          <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
            <p style={{ margin: 0, padding: '12px 14px', fontWeight: 700, fontSize: '0.85rem' }}>Charges &amp; taxes</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: colors.tint(0.02) }}><th style={th}>Description</th><th style={th}>Ledger</th><th style={{ ...th, textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {v.footer.charges.map((c, i) => (
                  <tr key={`c${i}`}><td style={td}>{c.description}{c.note && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{c.note}</div>}</td><td style={td}>{c.ledger}</td><td style={{ ...td, ...r }}>{money(c.amount)}</td></tr>
                ))}
                {v.footer.discount_total > 0 && <tr><td style={td}>Discounts allowed</td><td style={td} /><td style={{ ...td, ...r }}>-{money(v.footer.discount_total)}</td></tr>}
                {v.footer.taxes.map((t, i) => (
                  <tr key={`t${i}`}><td style={td}>{t.label} <span style={{ color: colors.textFaint }}>on {money(t.base)}</span></td><td style={td}>{t.ledger}</td><td style={{ ...td, ...r }}>{money(t.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
          <p style={{ margin: 0, padding: '12px 14px', fontWeight: 700, fontSize: '0.85rem' }}>Accounting</p>
          {(v.entries ?? []).length === 0 ? <p style={{ padding: '0 14px 14px', margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>This voucher doesn't post to the books{v.moves_stock ? ' (it moves stock)' : ''}.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: colors.tint(0.02) }}><th style={th}>Ledger</th><th style={{ ...th, textAlign: 'right' }}>Debit</th><th style={{ ...th, textAlign: 'right' }}>Credit</th></tr></thead>
              <tbody>{v.entries.map((e) => (
                <tr key={e.id}><td style={td}>{e.ledger?.name}</td><td style={{ ...td, ...r }}>{e.side === 'D' ? money(Number(e.amount) || e.base_amount) : ''}</td><td style={{ ...td, ...r }}>{e.side === 'C' ? money(Number(e.amount) || e.base_amount) : ''}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>

        {(v.audit ?? []).length > 0 && (
          <div style={{ ...card, padding: 14 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '0.85rem' }}>History</p>
            {v.audit.map((a) => <p key={a.id} style={{ margin: '3px 0', fontSize: '0.75rem', color: colors.textMuted }}>{new Date(a.created_at).toLocaleString()} · {a.action} · {a.user?.name ?? 'system'}</p>)}
          </div>
        )}
      </div>
      {modal === 'convert' && <ConvertModal v={v} methods={methods} onClose={() => setModal(null)} onDone={(c) => nav(`/admin/books/vouchers/${c.id}`)} />}
      {modal === 'receive' && <ReceiveModal v={v} methods={methods} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </AdminLayout>
  );
}

function FragmentRows({ item: i, kids, showDone }) {
  const done = showDone ? `${Number(i.delivered_quantity)} / ${Number(i.invoiced_quantity)}` : null;
  const row = (x, child) => (
    <tr key={x.id} style={{ background: x.is_header ? colors.tint(0.03) : 'transparent', color: child ? colors.textMuted : colors.text }}>
      <td style={{ ...td, paddingLeft: child ? 28 : 10, fontWeight: x.is_header ? 700 : 500 }}>{child && '└ '}{x.description}</td>
      <td style={td}>{x.variant_label && x.variant_label !== 'Standard' ? x.variant_label : ''}</td>
      <td style={{ ...td, ...r }}>{Number(x.quantity)} {x.unit_code}</td>
      <td style={{ ...td, ...r }}>{money(x.rate)}</td>
      <td style={{ ...td, ...r }}>{money(x.amount)}</td>
      <td style={{ ...td, ...r }}>{Number(x.tax_amount) ? `${money(x.tax_amount)}${x.tax_rate_percent ? ` (${Number(x.tax_rate_percent)}%)` : ''}` : ''}</td>
      {showDone && <td style={{ ...td, ...r, color: colors.textFaint }}>{child ? '' : done}</td>}
    </tr>
  );
  return (
    <>
      {row(i, false)}
      {kids.map((k) => row(k, true))}
    </>
  );
}
