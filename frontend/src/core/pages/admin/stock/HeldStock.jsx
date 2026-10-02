import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import { stockHoldsAPI } from '../../../../_shared/api/stockExpiry';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../../_shared/theme/tokens';

/**
 * Held stock: batches that are quarantined (checked, then released) or recalled (never sold again), and a trace of
 * everyone who bought a batch so they can be told.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const name = (b) => `${b.product}${b.variant && b.variant !== 'Standard' ? ` — ${b.variant}` : ''}, batch ${b.batch_no ?? `#${b.id}`}`;

function csv(rows) {
  const head = ['Voucher', 'Date', 'Customer', 'Email', 'Phone', 'Quantity', 'Branch'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [head.map(q).join(','), ...rows.map((r) => [r.voucher_number, r.date, r.customer, r.email, r.phone, r.quantity, r.location].map(q).join(','))].join('\n');
}

function ReasonModal({ title, batch, action, label, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await stockHoldsAPI.act(batch.id, action, { reason }); toast.success(res.message); onDone(); }
    catch (x) { setErr(errMsg(x, 'Could not do that')); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} subtitle={name(batch)} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label={label}><TextInput required value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel={title} busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function TraceModal({ id, canWrite, onClose, onChanged }) {
  const [t, setT] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { stockHoldsAPI.show(id).then(setT).catch((e) => toast.error(errMsg(e, 'Could not load the trace'))); }, [id]);
  const notify = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const res = await stockHoldsAPI.act(id, 'notify', { message: msg }); toast.success(res.message); setResult(res); onChanged(); }
    catch (x) { toast.error(errMsg(x, 'Could not notify')); } finally { setBusy(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv(t.sold)], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `batch-${t.batch.batch_no ?? id}-buyers.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Modal title="Who bought this batch" subtitle={t ? name(t.batch) : ''} onClose={onClose} width={760}>
      {!t ? <p>Loading…</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: '0.82rem' }}>
            Sold <strong>{t.summary.sold}</strong> to <strong>{t.summary.customers}</strong> customer(s) · returned {t.summary.returned} · on hand {t.summary.on_hand} · to supplier {t.summary.to_supplier} · written off {t.summary.written_off}
          </div>
          {t.sold.length === 0 ? <p style={{ margin: 0, color: colors.textMuted }}>Nothing from this batch has been sold.</p> : (
            <div style={{ overflowX: 'auto', maxHeight: 280 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Sale</th><th style={th}>Date</th><th style={th}>Customer</th><th style={th}>Contact</th><th style={{ ...th, textAlign: 'right' }}>Qty</th></tr></thead>
                <tbody>{t.sold.map((r) => (
                  <tr key={r.movement_id}><td style={td}>{r.voucher_number}</td><td style={td}>{String(r.date).slice(0, 10)}</td><td style={td}>{r.customer ?? 'Walk-in'}</td><td style={td}>{[r.email, r.phone].filter(Boolean).join(' · ') || '—'}</td><td style={{ ...td, textAlign: 'right' }}>{r.quantity}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div><button type="button" style={btnGhost} onClick={download} disabled={!t.sold.length}>Download list (CSV)</button></div>
          {canWrite && t.batch.status === 'recalled' && t.sold.length > 0 && (
            <form onSubmit={notify}>
              <FormStack>
                <Field label="Message to customers"><TextInput required value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Please stop using this product and return it for a refund." /></Field>
                <ModalActions onCancel={onClose} submitLabel="Notify customers" busy={busy} />
              </FormStack>
            </form>
          )}
          {result && result.unreachable.length > 0 && <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>{result.unreachable.length} buyer(s) have no account — contact them from the list above.</p>}
          {t.events.length > 0 && (
            <div style={{ fontSize: '0.75rem', color: colors.textMuted }}>
              {t.events.map((e, i) => <div key={i}>{String(e.at).slice(0, 16)} · {e.action.replace(/_/g, ' ')}{e.note ? ` — ${e.note}` : ''}{e.by ? ` (${e.by})` : ''}</div>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function HeldStock() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [modal, setModal] = useState(null);   // { kind, batch }

  const load = useCallback(() => {
    setLoading(true);
    stockHoldsAPI.list().then((d) => setRows(d.rows)).catch((e) => toast.error(errMsg(e, 'Could not load held stock'))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return undefined; }
    const h = setTimeout(() => stockHoldsAPI.search(q.trim()).then((d) => setFound(d.rows)).catch(() => setFound([])), 250);
    return () => clearTimeout(h);
  }, [q]);

  const act = async (b, action) => {
    try { const res = await stockHoldsAPI.act(b.id, action); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not do that')); }
  };
  const done = () => { setModal(null); load(); };

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="held stock" /></div></AdminLayout>;

  const badge = (s) => <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: s === 'recalled' ? '#b91c1c' : '#a16207' }}>{s}</span>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Held stock" description="Batches that are quarantined or recalled are blocked from every sale, online and at the till. Trace a batch to see who bought it." />

        <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 20 }}>
          {loading ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : rows.length === 0 ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Nothing is being held.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Product</th><th style={th}>Status</th><th style={th}>Reason</th><th style={{ ...th, textAlign: 'right' }}>On hand</th><th style={th} /></tr></thead>
              <tbody>{rows.map((b) => (
                <tr key={b.id}>
                  <td style={td}><strong>{name(b)}</strong></td>
                  <td style={td}>{badge(b.status)}</td>
                  <td style={td}>{b.held_reason ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{b.on_hand}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button type="button" style={small} onClick={() => setModal({ kind: 'trace', batch: b })}>Who bought it</button>
                    {canWrite && b.status === 'quarantined' && <button type="button" style={small} onClick={() => act(b, 'release')}>Release</button>}
                    {canWrite && b.status === 'quarantined' && <button type="button" style={small} onClick={() => setModal({ kind: 'recall', batch: b })}>Recall</button>}
                    {canWrite && b.status === 'recalled' && <button type="button" style={small} onClick={() => act(b, 'cancel-recall')}>Cancel recall</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        {canWrite && (
          <div style={{ ...card, padding: 16 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>Hold a batch</h2>
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by product, SKU or batch number" aria-label="Find a batch" />
            {found.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                <tbody>{found.map((b) => (
                  <tr key={b.id}>
                    <td style={td}>{name(b)}<div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{b.status} · {b.on_hand} on hand</div></td>
                    <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" style={small} onClick={() => setModal({ kind: 'trace', batch: b })}>Who bought it</button>
                      {['active', 'expired'].includes(b.status) && <button type="button" style={small} onClick={() => setModal({ kind: 'quarantine', batch: b })}>Quarantine</button>}
                      {b.status !== 'recalled' && <button type="button" style={small} onClick={() => setModal({ kind: 'recall', batch: b })}>Recall</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {modal?.kind === 'quarantine' && <ReasonModal title="Quarantine" action="quarantine" label="Why" batch={modal.batch} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'recall' && <ReasonModal title="Recall" action="recall" label="Why is it recalled" batch={modal.batch} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'trace' && <TraceModal id={modal.batch.id} canWrite={canWrite} onClose={() => setModal(null)} onChanged={load} />}
    </AdminLayout>
  );
}
