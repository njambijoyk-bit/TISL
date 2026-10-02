import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import { money } from '../../../components/admin/books/booksFmt';
import VariantPicker from '../../../components/admin/pickers/VariantPicker';
import booksAPI from '../../../../_shared/api/books';
import { stockJobsAPI } from '../../../../_shared/api/stockOps';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

/**
 * Jobs with work in progress. Materials issued to an open job leave stock and are held as Work in Progress instead of
 * being expensed. Completing the job books what it holds as a cost of the service; cancelling puts it all back.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const TONE = { open: '#c2410c', completed: '#15803d', cancelled: '#6b7280' };
const nm = (r) => `${r.product}${r.variant && r.variant !== 'Standard' ? ` — ${r.variant}` : ''}`;

function OpenModal({ branches, onClose, onDone }) {
  const [title, setTitle] = useState('');
  const [loc, setLoc] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (q.length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => booksAPI.lookup('customer', q).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await stockJobsAPI.open({ title, location_id: Number(loc), customer_id: customer?.customer_id || undefined, note: note || undefined }); toast.success(res.message); onDone(res.id); }
    catch (x) { setErr(errMsg(x, 'Could not open the job')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Open a job" onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Job"><TextInput required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fabricate glass door for Mr Otieno" /></Field>
          <Field label="Materials come from"><SelectInput required value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
          <Field label="Customer (optional)">
            {customer ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong>{customer.name}</strong><button type="button" style={small} onClick={() => setCustomer(null)}>Change</button></div> : (
              <div>
                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a customer…" />
                {found.map((c) => <button key={c.customer_id} type="button" onClick={() => { setCustomer(c); setQ(''); setFound([]); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}>{c.name} <span style={{ color: colors.textFaint }}>{c.email}</span></button>)}
              </div>
            )}
          </Field>
          <Field label="Note (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel="Open job" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function InvoiceJobModal({ job, onClose, onDone }) {
  const nav = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [due, setDue] = useState('');
  const [extra, setExtra] = useState([{ description: 'Labour', amount: '', ledger_id: '' }]);
  const [ledgers, setLedgers] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { booksAPI.ledgers({ all: 1, active_only: 1 }).then((r) => setLedgers((Array.isArray(r) ? r : r.data ?? []).filter((l) => !['Sundry Debtors', 'Sundry Creditors', 'Cash-in-hand', 'Bank Accounts'].includes(l.group?.name)))).catch(() => {}); }, []);
  useEffect(() => {
    if (q.length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => booksAPI.lookup('customer', q).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const needCustomer = job.needs_customer && !customer;
  const body = (preview_) => ({
    customer_id: customer?.customer_id || undefined, date, due_date: due || undefined, preview: preview_ || undefined,
    extra: extra.filter((x) => Number(x.amount) > 0).map((x) => ({ description: x.description, amount: Number(x.amount) || 0, ledger_id: x.ledger_id ? Number(x.ledger_id) : undefined })),
  });
  useEffect(() => {
    if (needCustomer) { setPreview(null); return undefined; }
    let live = true;
    const t = setTimeout(() => stockJobsAPI.invoice(job.id, body(true)).then((r) => { if (live) { setPreview(r); setErr(null); } }).catch((x) => { if (live) { setPreview(null); setErr(errMsg(x, 'Could not work out the invoice')); } }), 300);
    return () => { live = false; clearTimeout(t); };
  }, [customer, date, due, extra, needCustomer]); // eslint-disable-line react-hooks/exhaustive-deps
  const setX = (i, k, v) => setExtra((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const create = async () => {
    setBusy(true); setErr(null);
    try { const res = await stockJobsAPI.invoice(job.id, body(false)); toast.success(res.message); onDone(); nav(`/admin/books/vouchers/${res.voucher_id}`); }
    catch (x) { setErr(errMsg(x, 'Could not raise the invoice')); } finally { setBusy(false); }
  };
  const bad = extra.some((x) => Number(x.amount) > 0 && !x.ledger_id);
  return (
    <Modal title={`Invoice ${job.number}`} subtitle={job.title} onClose={onClose} width={760}>
      <div style={{ display: 'grid', gap: 12 }}>
        <FormError message={err} />
        {job.needs_customer && (
          <Field label="Customer to invoice">
            {customer ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong>{customer.name}</strong><button type="button" style={small} onClick={() => setCustomer(null)}>Change</button></div> : (
              <div>
                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a customer…" />
                {found.map((c) => <button key={c.customer_id} type="button" onClick={() => { setCustomer(c); setQ(''); setFound([]); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}>{c.name}</button>)}
              </div>
            )}
          </Field>
        )}
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: 4 }}>Materials used on the job <span style={{ fontWeight: 500, color: colors.textFaint }}>— fixed: quantities and prices come from the job, and no stock is taken again</span></div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Item</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Price</th></tr></thead>
            <tbody>
              {job.invoice_lines.length === 0 && <tr><td colSpan={3} style={{ ...td, color: colors.textMuted }}>The job holds no materials.</td></tr>}
              {job.invoice_lines.map((m, i) => (
                <tr key={i}><td style={td}>{m.name}</td><td style={{ ...td, textAlign: 'right' }}>{m.quantity}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{m.price != null ? (m.system_price != null && Math.abs(m.price - m.system_price) > 0.0001 ? `${money(m.price)} (set on the job; system ${money(m.system_price)})` : money(m.price)) : m.system_price != null ? `${money(m.system_price)} (current price)` : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '0.85rem', marginBottom: 4 }}>Work and other charges <span style={{ fontWeight: 500, color: colors.textFaint }}>— optional, you can set these</span></div>
          {extra.map((x, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <div style={{ flex: 2 }}><TextInput value={x.description} onChange={(e) => setX(i, 'description', e.target.value)} placeholder="e.g. Labour, transport" aria-label="Description" /></div>
              <div style={{ width: 120 }}><NumberInput min="0" step="any" value={x.amount} onChange={(e) => setX(i, 'amount', e.target.value)} placeholder="Amount" aria-label="Amount" /></div>
              <div style={{ flex: 2 }}><SelectInput value={x.ledger_id} onChange={(e) => setX(i, 'ledger_id', e.target.value)} aria-label="Income account"><option value="">Income account…</option>{ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></div>
              <button type="button" aria-label="Remove" onClick={() => setExtra((xs) => xs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" style={small} onClick={() => setExtra((xs) => [...xs, { description: '', amount: '', ledger_id: '' }])}><Plus size={12} /> Add a line</button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Field label="Invoice date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Due date (optional)"><TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
        {preview && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: colors.tint(0.05), fontSize: '0.85rem' }}>
            Subtotal <strong>{money(preview.subtotal)}</strong> · Tax <strong>{money(preview.tax_total)}</strong> · Total <strong>{preview.currency} {money(preview.total)}</strong>
          </div>
        )}
        {bad && <p style={{ margin: 0, color: '#b91c1c', fontSize: '0.8rem' }}>Choose an income account for each charge that has an amount.</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={btnGhost} onClick={onClose}>Close</button>
          <button type="button" style={btnPrimary} disabled={busy || needCustomer || bad || !preview} onClick={create}>{busy ? 'Raising the invoice…' : 'Create invoice'}</button>
        </div>
      </div>
    </Modal>
  );
}

function JobSheet({ id, canWrite, onClose, onChanged }) {
  const nav = useNavigate();
  const [j, setJ] = useState(null);
  const [items, setItems] = useState([]);
  const [invoicing, setInvoicing] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => stockJobsAPI.show(id).then(setJ).catch((e) => toast.error(errMsg(e, 'Could not load the job'))), [id]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn, close = false) => {
    setBusy(true);
    try { const res = await fn(); toast.success(res.message); onChanged(); if (close) onClose(); else load(); return true; } catch (x) { toast.error(errMsg(x, 'Could not do that')); return false; } finally { setBusy(false); }
  };
  const add = (r) => setItems((xs) => (xs.some((x) => x.variant_id === r.variant_id) ? xs : [...xs, { variant_id: r.variant_id, name: nm(r), quantity: 1, price: r.base_price != null ? String(r.base_price) : '', systemPrice: r.base_price ?? null }]));
  const open = j?.status === 'open' && canWrite;
  return (
    <Modal title={j ? `${j.number} — ${j.title}` : 'Job'} subtitle={j ? `${j.location}${j.customer ? ` · ${j.customer}` : ''} · ${j.status}` : ''} onClose={onClose} width={760}>
      {!j ? <p>Loading…</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {j.lines.length === 0 ? <p style={{ margin: 0, color: colors.textMuted }}>No materials issued yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Material</th><th style={th}>Batch</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Cost</th><th style={{ ...th, textAlign: 'right' }}>Charged at</th><th style={th} /></tr></thead>
              <tbody>{j.lines.map((l) => (
                <tr key={l.id}>
                  <td style={td}>{nm(l)}</td><td style={td}>{l.batch_no ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{l.quantity}</td><td style={{ ...td, textAlign: 'right' }}>{money(l.cost)}</td>
                  <td style={{ ...td, textAlign: 'right', color: l.sale_price != null ? undefined : colors.textFaint }}>{l.sale_price != null ? money(l.sale_price) : l.system_price != null ? `${money(l.system_price)} (current price)` : 'no price'}</td>
                  <td style={td}>{open && <button type="button" style={small} disabled={busy} onClick={() => run(() => stockJobsAPI.returnLine(id, l.id))}>Return to stock</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Held as work in progress: <strong>{money(j.cost)}</strong></p>
          {open && (
            <div style={{ display: 'grid', gap: 8 }}>
              <Field label="Issue more materials" hint="Each material shows its price in the system. Change it if this job is charged differently; the invoice uses the price you leave here."><VariantPicker onPick={add} placeholder="Search a material to issue…" /></Field>
              {items.map((i) => (
                <div key={i.variant_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: '0.82rem' }}>{i.name}</span>
                  <div style={{ width: 110 }}><NumberInput min="0.0001" step="any" value={i.quantity} aria-label={`Quantity of ${i.name}`} onChange={(e) => setItems((xs) => xs.map((x) => (x.variant_id === i.variant_id ? { ...x, quantity: e.target.value } : x)))} /></div>
                  <div style={{ width: 150 }}><NumberInput min="0" step="any" value={i.price} placeholder={i.systemPrice == null ? 'No price — enter one' : 'Price'} title={i.systemPrice != null ? `Price in the system: ${money(i.systemPrice)}. Change it if this job is charged differently.` : 'This item has no price in the system: enter what to charge per unit.'} aria-label={`Selling price of ${i.name}`} onChange={(e) => setItems((xs) => xs.map((x) => (x.variant_id === i.variant_id ? { ...x, price: e.target.value } : x)))} /></div>
                  <button type="button" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((x) => x.variant_id !== i.variant_id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={15} /></button>
                </div>
              ))}
              {items.length > 0 && <div><button type="button" style={btnPrimary} disabled={busy} onClick={() => run(() => stockJobsAPI.issue(id, items.map((i) => ({ variant_id: i.variant_id, quantity: Number(i.quantity), price: i.price === '' ? undefined : Number(i.price) })))).then((ok) => ok && setItems([]))}>Issue to job</button></div>}
            </div>
          )}
          {j.invoice_voucher_id && <button type="button" style={{ ...btnGhost, justifySelf: 'start' }} onClick={() => nav(`/admin/books/vouchers/${j.invoice_voucher_id}`)}>View the invoice</button>}
          {j.status === 'completed' && !j.invoice_voucher_id && canWrite && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: colors.tint(0.05), flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', flex: 1 }}>The job is complete. Invoice the customer for its materials (and any work).</span>
              <button type="button" style={btnPrimary} onClick={() => setInvoicing(true)}>Invoice this job</button>
            </div>
          )}
          {invoicing && <InvoiceJobModal job={j} onClose={() => setInvoicing(false)} onDone={() => { setInvoicing(false); onChanged(); load(); }} />}
          {open && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" style={btnGhost} disabled={busy} onClick={() => { if (window.confirm('Cancel this job? All materials go back to stock.')) run(() => stockJobsAPI.cancel(id), true); }}>Cancel job</button>
              <button type="button" style={btnPrimary} disabled={busy} onClick={() => { if (window.confirm('Complete this job? Its materials are booked as a cost of the service.')) run(() => stockJobsAPI.complete(id, null)); }}>Complete job</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function StockJobs() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('open');
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    stockJobsAPI.list({ status: status || undefined }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load jobs'))).finally(() => setLoading(false));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="jobs" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title="Jobs in progress" description="Long jobs that use materials over time. What they hold is work in progress until the job is completed." />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '0 0 14px' }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.8rem', fontFamily: 'inherit' }}>
            <option value="open">Open</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="">All</option>
          </select>
          {data && <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>Work in progress across open jobs: <strong>{money(data.wip_total)}</strong></span>}
          <span style={{ flex: 1 }} />
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ kind: 'open' })}><Plus size={14} /> Open a job</button>}
        </div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {loading ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !(data?.rows?.length) ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No jobs here.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Job</th><th style={th}>Customer</th><th style={th}>Branch</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Materials at cost</th><th style={th} /></tr></thead>
              <tbody>{data.rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}><strong>{r.number}</strong> {r.title}{r.note && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{r.note}</div>}</td>
                  <td style={td}>{r.customer || '—'}</td><td style={td}>{r.location}</td>
                  <td style={td}><span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: TONE[r.status] }}>{r.status}</span></td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(r.cost)}</td>
                  <td style={td}><button type="button" style={small} onClick={() => setModal({ kind: 'sheet', id: r.id })}>Open</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal?.kind === 'open' && <OpenModal branches={data?.branches ?? []} onClose={() => setModal(null)} onDone={(id) => { setModal({ kind: 'sheet', id }); load(); }} />}
      {modal?.kind === 'sheet' && <JobSheet id={modal.id} canWrite={canWrite} onClose={() => setModal(null)} onChanged={load} />}
    </AdminLayout>
  );
}
