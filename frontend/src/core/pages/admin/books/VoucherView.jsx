import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Eraser, History, Pencil, Ban, ArrowRightLeft, Banknote, Gift, Undo2, Send, MessageCircle, Download, Printer } from 'lucide-react';
import { whatsappDocument, printCustomerCopy } from '../../../components/admin/books/shareDocument';
import MemorandumDetail from '../../../components/admin/books/MemorandumDetail';
import memorandaAPI from '../../../../_shared/api/memoranda';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import booksAPI from '../../../../_shared/api/books';
import taxAPI from '../../../../_shared/api/tax';
import useAuthStore from '../../../../_shared/store/authStore';
import { canWriteFinance, hasAnyRole } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import useCalculatorContext from '../../../../_shared/hooks/useCalculatorContext';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import WriteOffModal from '../../../components/admin/books/WriteOffModal';
import AddToManifest from '../../../components/admin/books/AddToManifest';
import CreditPanel from '../../../components/admin/books/CreditPanel';
import { Chip, DeliveryChip, ExportMenu } from '../../../components/admin/books/booksUi';
import { money, today } from '../../../components/admin/books/booksFmt';

const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const r = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

const TARGETS = { quotation: [['sales_order', 'Sales order'], ['sales', 'Sales invoice']], purchase_order: [['receipt_note', 'Receipt note (goods in)'], ['purchase', 'Purchase invoice']], receipt_note: [['purchase', 'Purchase invoice']], sales_order: [['delivery_note', 'Delivery note'], ['sales', 'Sales invoice'], ['cash_sale', 'Cash sale']], delivery_note: [['sales', 'Sales invoice'], ['cash_sale', 'Cash sale']] };

const SENDABLE = ['sales', 'cash_sale', 'receipt', 'quotation', 'credit_note', 'sales_order', 'delivery_note', 'debit_note', 'purchase_order'];
/** Types that have the customer copy (the layout customers see), as against the internal export. */
const CUSTOMER_COPY = ['sales', 'cash_sale', 'receipt', 'quotation', 'credit_note', 'sales_order', 'delivery_note'];

/** Send a document to the customer: e-mail from the company's default address, or a WhatsApp message quoting the default phone. */
function SendModal({ v, onClose }) {
  const [info, setInfo] = useState(null);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { booksAPI.shareInfo(v.id).then((d) => { setInfo(d); setTo(d.to_email ?? ''); }).catch((e) => setErr(errMsg(e, 'Could not load'))); }, [v.id]);
  const send = async () => {
    setBusy(true); setErr(null);
    try { const r = await booksAPI.emailDocument(v.id, { to: to || undefined, note: note || undefined }); toast.success(r.message); onClose(); }
    catch (e) { setErr(errMsg(e, 'Could not send')); }
    finally { setBusy(false); }
  };
  const whatsapp = async () => {
    setBusy(true); setErr(null);
    try {
      const how = await whatsappDocument({ id: v.id, digits: info.whatsapp_digits, text: info.message, to: info.to_phone });
      if (how === 'downloaded') toast.success('The PDF was saved to this computer — attach it in the WhatsApp chat that opened.');
      if (how !== 'cancelled') onClose();
    } catch (e) { setErr(errMsg(e, 'Could not prepare the document')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Send ${v.type.name} ${v.voucher_number}`} onClose={onClose}>
      {!info ? <p style={{ color: colors.textMuted }}>{err ?? 'Loading…'}</p> : (
        <FormStack>
          <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>
            {info.from_email ? <>E-mail goes out from <strong>{info.from_email}</strong> and replies come back to it.</> : <span style={{ color: colors.dangerText }}>No company e-mail yet — add one in Books → Configuration → Company.</span>}
            {info.company_phone && <> The WhatsApp message quotes <strong>{info.company_phone}</strong>.</>}
          </p>
          <Field label="Send the e-mail to"><TextInput type="email" value={to} placeholder="customer@email.com" onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="A note above the document (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          {err && <FormError>{err}</FormError>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btnPrimary} disabled={busy || !info.from_email} onClick={send}><Send size={14} /> {busy ? 'Sending…' : 'Send e-mail'}</button>
            {CUSTOMER_COPY.includes(v.type?.base_type)
              ? <button type="button" style={btnGhost} disabled={busy} onClick={whatsapp}><MessageCircle size={14} /> WhatsApp{info.to_phone ? ` ${info.to_phone}` : ''}</button>
              : <a href={info.whatsapp_url} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: 'none' }}><MessageCircle size={14} /> WhatsApp{info.to_phone ? ` ${info.to_phone}` : ''}</a>}
          </div>
          {!info.whatsapp_to_number && <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>This customer has no phone number on file — WhatsApp will open so you can choose the contact.</p>}
        </FormStack>
      )}
    </Modal>
  );
}

function ConvertModal({ v, methods, onClose, onDone }) {
  const options = TARGETS[v.type.base_type] ?? [];
  const [to, setTo] = useState(options[0]?.[0] ?? '');
  const [method, setMethod] = useState(v.payment_method_id ? String(v.payment_method_id) : '');   // the way the customer said they would pay
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

/** Refund a credit note as a gift voucher instead of cash: Dr the customer's account, Cr Gift Vouchers Liability. */
/** On a credit note: give the money back as cash, M-Pesa or bank, from what the customer is owed on this note. Hidden once nothing is left. */
function RefundMoney({ v }) {
  const nav = useNavigate();
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!v.party_ledger_id) return;
    booksAPI.openBills(v.party_ledger_id).then((d) => setLeft((d.credits ?? []).filter((c) => c.voucher_id === v.id).reduce((t, c) => t + Number(c.amount), 0))).catch(() => {});
  }, [v.party_ledger_id, v.id, v.status]);
  if (left <= 0.004) return null;
  const go = async () => {
    try {
      const types = await booksAPI.types();
      const pay = types.find((t) => t.base_type === 'payment' && t.is_active);
      if (!pay) { toast.error('There is no active Payment voucher type.'); return; }
      nav(`/admin/books/vouchers/new?type=${pay.id}&refund=${v.id}`);
    } catch (e) { toast.error(errMsg(e, 'Could not open the refund')); }
  };

  return <button type="button" style={btnGhost} onClick={go}><Banknote size={14} /> Refund {money(left)}</button>;
}

function RefundVoucherModal({ v, onClose, onDone }) {
  const left = Math.max(0, Number(v.total_amount) - Number(v.meta?.gift_refunded ?? 0));
  const [amount, setAmount] = useState(left.toFixed(2));
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await booksAPI.refundToGiftVoucher(v.id, { amount: Number(amount), expires_at: expires || undefined }); toast.success(res.message); onDone(res.data); }
    catch (x) { setErr(errMsg(x, 'Could not issue the gift voucher')); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Refund as a gift voucher" subtitle={`${money(left)} of ${v.voucher_number} can still be refunded. The customer's account must hold that much in credit.`} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Amount"><NumberInput required min="0.01" max={left} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Expires (optional)"><TextInput type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel="Issue gift voucher" busy={busy} />
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
  const [whAmount, setWhAmount] = useState('');   // typed by hand; blank = worked out from the rate
  useEffect(() => { taxAPI.getRates({ active: true }).then((r) => setWhRates((r.tax_rates ?? []).filter((x) => x.tax_type?.application_mode === 'withheld'))).catch(() => {}); }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const chosen = methods.find((m) => String(m.id) === String(method));
  // withholding is taken off the part of the payment that is before tax
  const rate = whRates.find((r) => String(r.id) === String(wh));
  const share = Number(v.total_amount) > 0 && Number(v.subtotal) > 0 ? Math.min(1, Number(v.subtotal) / Number(v.total_amount)) : 1;
  const beforeTax = Math.round(Number(amount || 0) * share * 100) / 100;
  const worked = rate ? (rate.rate_type === 'percentage' ? Math.round(beforeTax * Number(rate.rate_value)) / 100 : Number(rate.rate_value)) : 0;
  const withheld = whAmount !== '' ? Number(whAmount) : worked;
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await booksAPI.receive(v.id, { payment_method_id: method, amount: Number(amount), reference_no: ref || undefined, date: today(), ...(wh ? { withholding: { tax_rate_id: Number(wh), amount: withheld } } : {}) }); toast.success(res.message); onDone(); }
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
            <>
              <Field label="Customer withheld tax?" hint="Tax is withheld on the part before VAT. The invoice keeps the withheld part as a balance until the customer gives you their certificate; record it under Withholding → Certificates and it becomes a tax credit we hold.">
                <SelectInput value={wh} onChange={(e) => { setWh(e.target.value); setWhAmount(''); }}><option value="">No</option>{whRates.map((r) => <option key={r.id} value={r.id}>{r.tax_type?.name} {Number(r.rate_value)}{r.rate_type === 'percentage' ? '%' : ''}{r.classification ? ` — ${r.classification}` : ''}</option>)}</SelectInput>
              </Field>
              {rate && (
                <>
                  <div style={{ fontSize: '0.78rem', color: colors.textMuted, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span>Rate: <strong>{Number(rate.rate_value)}{rate.rate_type === 'percentage' ? '%' : ' fixed'}</strong></span>
                    <span>Before tax: <strong>{money(beforeTax)}</strong></span>
                    <span>Worked out: <strong>{money(worked)}</strong></span>
                  </div>
                  <Field label="Amount withheld" hint="Worked out from the rate; type the figure on the customer's certificate if it differs.">
                    <NumberInput min="0" step="0.01" max={Number(amount) || undefined} value={whAmount !== '' ? whAmount : worked.toFixed(2)} onChange={(e) => setWhAmount(e.target.value)} />
                  </Field>
                  <div style={{ fontSize: '0.8rem' }}>Cash actually received: <strong>{money(Math.max(0, Number(amount || 0) - withheld))}</strong></div>
                </>
              )}
            </>
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
  useCalculatorContext(v ? { type: 'voucher', id: v.id } : null);   // Alt+C explains this document
  const [error, setError] = useState(null);
  const [methods, setMethods] = useState([]);
  const [modal, setModal] = useState(null);
  const [memos, setMemos] = useState([]);   // memoranda written about this voucher

  const load = useCallback(() => {
    setError(null);
    return booksAPI.voucher(id).then(setV).catch((e) => setError(errMsg(e, 'Could not load the voucher')));
  }, [id]);
  useEffect(() => {
    if (!canWrite || !v || v.type?.base_type === 'memorandum') return;
    memorandaAPI.list({ about_voucher_id: v.id, per_page: 20 }).then((r) => setMemos((r.data ?? []).filter((m) => m.state !== 'dismissed'))).catch(() => {});
  }, [v?.id, canWrite]); // eslint-disable-line react-hooks/exhaustive-deps
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
  if (base === 'memorandum') return <AdminLayout><MemorandumDetail voucherId={v.id} onChanged={load} /></AdminLayout>;   // a note that posts nothing has its own page
  if (base === 'quotation') return <Navigate to={`/admin/quotes/${v.id}`} replace />;   // quotations have their own page: price it, send it
  const live = v.status === 'posted';
  const convertible = live && ['quotation', 'sales_order', 'delivery_note', 'purchase_order', 'receipt_note'].includes(base) && v.fulfilment_status !== 'closed' && !(base === 'quotation' && v.doc_status !== 'quoted');
  const refundable = live && base === 'credit_note' && Number(v.total_amount) - Number(v.meta?.gift_refunded ?? 0) > 0.005;
  const canWriteOff = live && base === 'sales' && Number(v.outstanding) > 0.005 && hasAnyRole(user, ['finance', 'super_admin']);
  const receivable = live && ['sales', 'debit_note'].includes(base) && Number(v.outstanding) > 0.005;
  const lockedBy = base === 'sales_order' ? (v.children ?? []).find((c) => c.status !== 'cancelled') : null;
  const children = (id2) => (v.items ?? []).filter((i) => i.parent_item_id === id2);
  const top = (v.items ?? []).filter((i) => !i.parent_item_id);

  return (
    <AdminLayout>
      <div style={{ padding: '28px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <Link to="/admin/books?tab=vouchers" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', color: colors.textMuted, textDecoration: 'none', marginBottom: 10 }}><ArrowLeft size={14} /> Vouchers</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: colors.primary }}>{v.type.name} <span style={{ fontFamily: 'monospace' }}>{v.voucher_number}</span></h1>
            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: colors.textMuted }}>
              {v.date} · {v.location?.name ?? 'No branch'} · <Chip status={v.status} /> {v.fulfilment_status && <Chip status={v.fulfilment_status} />} <DeliveryChip delivery={v.delivery} />
              {v.channel && v.channel !== 'admin' && <> · via {v.channel}</>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Link to={`/admin/books/edit-log?voucher=${v.id}`} style={{ ...btnGhost, textDecoration: 'none' }}><History size={14} /> Edit log</Link>
            <ExportMenu onExport={(f) => booksAPI.exportVoucher(v.id, f)} />
            {live && CUSTOMER_COPY.includes(base) && (
              <>
                <button type="button" style={btnGhost} title="The copy the customer receives" onClick={() => booksAPI.customerCopy(v.id).catch((e) => toast.error(errMsg(e, 'Could not make the customer copy')))}><Download size={14} /> Customer copy</button>
                <button type="button" style={btnGhost} title="Open the customer copy to print" onClick={() => printCustomerCopy(v.id).catch((e) => toast.error(errMsg(e, 'Could not make the customer copy')))}><Printer size={14} /> Print</button>
              </>
            )}
            {canWrite && convertible && !lockedBy && <button type="button" style={btnPrimary} onClick={() => setModal('convert')}><ArrowRightLeft size={14} /> Convert</button>}
            <AddToManifest voucher={v} onDone={load} />
            {canWrite && refundable && <button type="button" style={btnGhost} onClick={() => setModal('refund')}><Gift size={14} /> Refund as gift voucher</button>}
            {canWrite && receivable && <button type="button" style={btnPrimary} onClick={() => setModal('receive')}><Banknote size={14} /> Receive payment</button>}
            {canWrite && live && SENDABLE.includes(base) && <button type="button" style={btnGhost} onClick={() => setModal('send')}><Send size={14} /> Send</button>}
            {canWrite && live && ['sales', 'cash_sale', 'purchase'].includes(base) && (v.party_ledger_id || ['cash_sale', 'purchase'].includes(base)) && <Link to={`/admin/books/vouchers/${v.id}/return`} style={{ ...btnGhost, textDecoration: 'none' }}><Undo2 size={14} /> {base === 'purchase' ? 'Debit note' : 'Credit note'}</Link>}
            {canWrite && live && base === 'credit_note' && <RefundMoney v={v} />}
            {canWriteOff && <button type="button" style={btnGhost} onClick={() => setModal('writeoff')}><Eraser size={14} /> Write off</button>}
            {canWrite && live && !lockedBy && !v.meta?.writeoff && !v.meta?.returned_from && <button type="button" style={btnGhost} disabled={!!v.period_lock} title={v.period_lock ? 'This voucher is in a closed period and cannot be edited' : undefined} onClick={() => nav(['purchase', 'receipt_note', 'opening_stock'].includes(base) ? `/admin/purchases/${v.id}/edit` : `/admin/books/vouchers/${v.id}/edit`)}><Pencil size={14} /> Edit</button>}
            {canWrite && live && <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={!!v.period_lock} title={v.period_lock ? 'This voucher is in a closed period and cannot be cancelled' : undefined} onClick={cancel}><Ban size={14} /> Cancel</button>}
          </div>
        </div>

        {memos.length > 0 && (
          <div role="status" style={{ padding: '10px 14px', borderRadius: 8, margin: '0 0 12px', background: colors.tint(0.05), border: `1px solid ${colors.tint(0.1)}`, fontSize: '0.8rem' }}>
            <strong>Memoranda about this voucher</strong>
            {memos.map((m) => <div key={m.id} style={{ marginTop: 4 }}><Link to={`/admin/books/vouchers/${m.id}`} style={{ fontFamily: 'monospace' }}>{m.number}</Link> · {m.purpose_label} · {m.state}{m.narration ? ` — ${m.narration.slice(0, 90)}${m.narration.length > 90 ? '…' : ''}` : ''}</div>)}
          </div>
        )}

        {v.period_lock && (
          <div role="status" style={{ padding: '12px 14px', borderRadius: 8, margin: '0 0 12px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.45)', fontSize: '0.82rem', lineHeight: 1.55 }}>
            <strong>{v.period_lock.kind === 'year' ? `This voucher belongs to ${v.period_lock.year}, which is closed.` : `The books are locked up to ${v.period_lock.until}.`}</strong>{' '}
            It cannot be edited or cancelled by any role, not even a super admin. {v.period_lock.kind === 'year'
              ? <>To change it, a super admin must first reopen the year in <Link to="/admin/books?tab=settings&sub=period">Books → Configuration → Period control</Link>, make the change, then close the year again.</>
              : <>To change it, a super admin must first move the lock date back in <Link to="/admin/books?tab=settings&sub=period">Books → Configuration → Period control</Link>, make the change, then set the lock date again.</>}
          </div>
        )}

        {v.status === 'cancelled' && <p role="status" style={{ padding: '10px 14px', borderRadius: 8, background: colors.dangerBg, color: colors.dangerText, fontSize: '0.82rem' }}>Cancelled{v.cancel_reason ? ` — ${v.cancel_reason}` : ''}. Its entries and stock movements are reversed.</p>}

        {lockedBy && <p role="status" style={{ padding: '10px 14px', borderRadius: 8, background: colors.tint(0.05), fontSize: '0.82rem' }}>This order is locked. It was made into <Link to={`/admin/books/vouchers/${lockedBy.id}`}>{lockedBy.voucher_number}</Link> — edit that instead.</p>}

        {(v.meta?.review_requests ?? []).map((q, i) => <p key={i} role="status" style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.12)', fontSize: '0.82rem' }}><strong>Customer asked for a review</strong> ({q.at}{q.ticket ? ` · ${q.ticket}` : ''}): {q.note}</p>)}

        <div style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16, fontSize: '0.82rem' }}>
          <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>PARTY</span>{v.party_ledger?.name ?? '—'}</div>
          {v.payment_method && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>PAYMENT</span>{v.payment_method.name}</div>}
          {v.reference_no && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>REFERENCE</span>{v.reference_no}</div>}
          {v.instrument && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>{v.instrument.label.toUpperCase()}</span>{v.instrument.number ?? '—'}{v.instrument.date && v.instrument.date !== v.date ? ` · dated ${v.instrument.date}` : ''}{v.instrument.bank_name ? ` · ${v.instrument.bank_name}` : ''}{v.instrument.deposited_by ? ` · by ${v.instrument.deposited_by}` : ''} <Chip status={v.instrument.status} /></div>}
          {v.source && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>FROM</span><Link to={`/admin/books/vouchers/${v.source.id}`}>{v.source.voucher_number}</Link></div>}
          {(v.children ?? []).length > 0 && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>LED TO</span>{v.children.map((c) => <div key={c.id}><Link to={`/admin/books/vouchers/${c.id}`}>{c.voucher_number}</Link>{c.status === 'cancelled' && ' (cancelled)'}</div>)}</div>}
          {v.outstanding != null && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>OUTSTANDING</span><strong style={{ color: Number(v.outstanding) > 0.005 ? colors.warningText : colors.successText }}>{money(v.outstanding)}</strong></div>}
          {v.narration && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>NARRATION</span>{v.narration}</div>}
        </div>

        {v.meta?.payment_intent && v.meta.payment_intent.kind !== 'later' && (
          <p role="status" style={{ padding: '10px 14px', borderRadius: 8, background: colors.tint(0.05), fontSize: '0.82rem' }}>
            <strong>Customer will pay:</strong> {v.meta.payment_intent.label}{v.meta.payment_intent.kind === 'cod' ? ' (collected by the driver)' : v.meta.payment_intent.kind === 'credit' ? ' (on their account)' : ''}.{' '}
            {v.meta.payment_intent.instructions && <span style={{ color: colors.textMuted }}>{v.meta.payment_intent.instructions}</span>}
            {base === 'sales_order' && v.payment_method && ' Converting to a Cash Sale will start with that money ledger.'}
          </p>
        )}
        {v.meta?.writeoff && (
          <p role="status" style={{ padding: '10px 14px', borderRadius: 8, background: colors.dangerBg, color: colors.dangerText, fontSize: '0.82rem' }}>
            <strong>{v.meta.writeoff.kind === 'small_balance' ? 'Small balance written off' : 'Bad debt written off'}</strong> — {(v.meta.writeoff.bills ?? []).join(', ')} for {money(v.meta.writeoff.amount)}. Reason: {v.meta.writeoff.reason}.{v.meta.writeoff.vat_not_adjusted ? ' Tax was not adjusted.' : ''} Cancel this journal to open the invoice again.
          </p>
        )}
        {(v.written_off ?? []).map((w) => (
          <p key={w.voucher_id} role="status" style={{ padding: '10px 14px', borderRadius: 8, background: colors.dangerBg, color: colors.dangerText, fontSize: '0.82rem' }}>
            {money(w.amount)} written off on <Link to={`/admin/books/vouchers/${w.voucher_id}`}>{w.voucher_number}</Link>{w.reason ? ` — ${w.reason}` : ''}.
          </p>
        ))}

        <CreditPanel v={v} canWrite={canWrite} onDone={load} />

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
      {modal === 'send' && <SendModal v={v} onClose={() => setModal(null)} />}
      {modal === 'convert' && <ConvertModal v={v} methods={methods} onClose={() => setModal(null)} onDone={(c) => nav(`/admin/books/vouchers/${c.id}`)} />}
      {modal === 'refund' && <RefundVoucherModal v={v} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === 'writeoff' && <WriteOffModal bill={v} onClose={() => setModal(null)} onDone={(r) => { setModal(null); if (r?.id) nav(`/admin/books/vouchers/${r.id}`); else load(); }} />}
      {modal === 'receive' && <ReceiveModal v={v} methods={methods} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </AdminLayout>
  );
}

function FragmentRows({ item: i, kids, showDone }) {
  const done = showDone ? `${Number(i.delivered_quantity)} / ${Number(i.invoiced_quantity)}` : null;
  const row = (x, child) => (
    <tr key={x.id} style={{ background: x.is_header ? colors.tint(0.03) : 'transparent', color: child ? colors.textMuted : colors.text }}>
      <td style={{ ...td, paddingLeft: child ? 28 : 10, fontWeight: x.is_header ? 700 : 500 }}>{child && '└ '}{x.description}
        {x.material_mode && <div style={{ fontSize: '0.68rem', color: colors.textFaint, fontWeight: 500 }}>{{ charged: 'Charged', included: 'Included in the price', bought_outside: `Bought for this job${Number(x.cost_amount) ? ` — cost ${money(x.cost_amount)}` : ''}`, customer_supplied: 'Customer’s own' }[x.material_mode]}</div>}
      </td>
      <td style={td}>
        {x.variant_label && x.variant_label !== 'Standard' ? x.variant_label : ''}
        {(x.batch_no || x.expiry_date) && (
          <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>
            {x.batch_no ? `Batch ${x.batch_no}` : ''}{x.batch_no && x.expiry_date ? ' · ' : ''}{x.expiry_date ? `exp ${new Date(x.expiry_date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
          </div>
        )}
      </td>
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
