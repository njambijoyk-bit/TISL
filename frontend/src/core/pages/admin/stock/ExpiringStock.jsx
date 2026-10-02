import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import { money } from '../../../components/admin/books/booksFmt';
import stockExpiryAPI, { stockHoldsAPI } from '../../../../_shared/api/stockExpiry';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../../_shared/theme/tokens';

/**
 * Expiring stock: what has expired and what is about to (within 30 / 60 / 90 days), per branch, with what it is worth
 * at cost — and what to do with it: write it off as a loss, or send it back to the supplier on a Debit Note.
 */

const BUCKETS = [
  { id: 'expired', title: 'Expired', tone: '#b91c1c' },
  { id: 'd30', title: 'Within 30 days', tone: '#c2410c' },
  { id: 'd60', title: '31 – 60 days', tone: '#a16207' },
  { id: 'd90', title: '61 – 90 days', tone: '#4d7c0f' },
];

const when = (r) => (r.days_left < 0 ? `expired ${-r.days_left} day${r.days_left === -1 ? '' : 's'} ago` : r.days_left === 0 ? 'expires today' : `in ${r.days_left} day${r.days_left === 1 ? '' : 's'}`);
const date = (d) => new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };

const REASONS = ['Expired', 'Damaged', 'Recalled', 'Other'];

function WriteOffModal({ row, onClose, onDone }) {
  const [qty, setQty] = useState(row.quantity);
  const [reasonKind, setReasonKind] = useState('Expired');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await stockExpiryAPI.writeOff({ batch_id: row.batch_id, location_id: row.location_id, quantity: Number(qty), reason: `${reasonKind}${note ? ` — ${note}` : ''}` });
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not write it off')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Write off stock" subtitle={`${row.product}${row.variant && row.variant !== 'Standard' ? ` — ${row.variant}` : ''}, batch ${row.batch_no ?? `#${row.batch_id}`} at ${row.location} · ${row.quantity} on hand`} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="How many"><NumberInput required min="0.0001" max={row.quantity} step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Reason"><SelectInput value={reasonKind} onChange={(e) => setReasonKind(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</SelectInput></Field>
          <Field label="Note (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
            The stock leaves the batch and {money(Number(qty || 0) * row.unit_cost)} is booked as a stock loss (Dr Stock Loss, Cr Stock). Cancelling that journal puts it back.
          </p>
          <ModalActions onCancel={onClose} submitLabel="Write off" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function ReturnModal({ row, suppliers, onClose, onDone }) {
  const [qty, setQty] = useState(row.quantity);
  const [supplier, setSupplier] = useState(row.supplier_id ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await stockExpiryAPI.returnToSupplier({ batch_id: row.batch_id, location_id: row.location_id, quantity: Number(qty), supplier_ledger_id: supplier ? Number(supplier) : undefined, reason: note || undefined });
      toast.success(res.message); onDone(res.voucher_id);
    } catch (x) { setErr(errMsg(x, 'Could not raise the debit note')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Return to supplier" subtitle={`${row.product}${row.variant && row.variant !== 'Standard' ? ` — ${row.variant}` : ''}, batch ${row.batch_no ?? `#${row.batch_id}`} at ${row.location} · ${row.quantity} on hand`} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="How many"><NumberInput required min="0.0001" max={row.quantity} step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <Field label="Supplier">
            <SelectInput required value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">Choose…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Note (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
            A Debit Note takes the stock out of the batch and reduces what you owe the supplier by {money(Number(qty || 0) * row.unit_cost)}{row.received_on ? `, against ${row.received_on}` : ''}.
          </p>
          <ModalActions onCancel={onClose} submitLabel="Raise debit note" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function ClearanceModal({ row, onClose, onDone }) {
  const [pct, setPct] = useState(row.clearance_percent ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await stockHoldsAPI.act(row.batch_id, 'clearance', { percent: pct === '' ? 0 : Number(pct) }); toast.success(res.message); onDone(); }
    catch (x) { setErr(errMsg(x, 'Could not save the clearance price')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Clearance price" subtitle={`${row.product}, batch ${row.batch_no ?? `#${row.batch_id}`}`} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Discount off the price (%) — leave empty to remove"><NumberInput min="0" max="100" step="any" value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Sales that take this batch are discounted automatically, and the storefront shows a clearance badge.</p>
          <ModalActions onCancel={onClose} submitLabel="Save" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function ExpiringStock() {
  const user = useAuthStore((s) => s.user);
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [branch, setBranch] = useState('');
  const [bucket, setBucket] = useState('');
  const [modal, setModal] = useState(null);   // { kind: 'write-off' | 'return', row }
  const canWrite = canWriteFinance(user);

  const load = useCallback(() => {
    setLoading(true);
    stockExpiryAPI.list({ location_id: branch || undefined }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the expiry list'))).finally(() => setLoading(false));
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !bucket || r.bucket === bucket), [data, bucket]);

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the expiry list" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Expiring stock" description="Stock that has expired or will within 90 days, what it is worth at cost, and what to do with it. Expired stock never counts as available to customers." />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '0 0 14px' }}>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch" style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.8rem', fontFamily: 'inherit' }}>
            <option value="">All branches</option>
            {(data?.branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {bucket && <button type="button" style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.75rem' }} onClick={() => setBucket('')}>Show all</button>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 18 }}>
          {BUCKETS.map((b) => {
            const s = data?.summary?.[b.id] ?? { batches: 0, quantity: 0, value: 0 };
            return (
              <button key={b.id} type="button" onClick={() => setBucket(bucket === b.id ? '' : b.id)}
                style={{ ...card, padding: 14, textAlign: 'left', cursor: 'pointer', borderColor: bucket === b.id ? b.tone : undefined, borderWidth: bucket === b.id ? 2 : 1, borderStyle: 'solid' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: b.tone }}>{b.title}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4 }}>{s.batches} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.textMuted }}>batch{s.batches === 1 ? '' : 'es'}</span></div>
                <div style={{ fontSize: '0.78rem', color: colors.textMuted }}>{s.quantity} units · {money(s.value)} at cost</div>
              </button>
            );
          })}
        </div>

        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {loading ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : rows.length === 0 ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Nothing here{bucket ? ' in this group' : ''}. Only products that track expiry appear.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Product</th><th style={th}>Batch</th><th style={th}>Expiry</th><th style={th}>Branch</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th}>Supplier</th>{canWrite && <th style={th} />}</tr></thead>
              <tbody>
                {rows.map((r) => {
                  const b = BUCKETS.find((x) => x.id === r.bucket);
                  return (
                    <tr key={`${r.batch_id}-${r.location_id}`}>
                      <td style={td}><strong>{r.product}</strong>{r.variant && r.variant !== 'Standard' ? ` — ${r.variant}` : ''}<div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{r.sku}</div></td>
                      <td style={td}>{r.batch_no ?? `#${r.batch_id}`}{r.received_on && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{r.received_on}</div>}</td>
                      <td style={td}>{date(r.expiry_date)}<div style={{ fontSize: '0.7rem', fontWeight: 700, color: b.tone }}>{when(r)}</div></td>
                      <td style={td}>{r.location}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{r.quantity}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{money(r.value)}</td>
                      <td style={td}>{r.supplier ?? '—'}</td>
                      {canWrite && (
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {r.bucket !== 'expired' && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 }} onClick={() => setModal({ kind: 'clearance', row: r })}>{r.clearance_percent ? `Clearance ${r.clearance_percent}%` : 'Clearance price'}</button>}
                          <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 }} onClick={() => setModal({ kind: 'return', row: r })}>Return to supplier</button>
                          {r.bucket === 'expired' && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => setModal({ kind: 'write-off', row: r })}>Write off</button>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal?.kind === 'clearance' && <ClearanceModal row={modal.row} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.kind === 'write-off' && <WriteOffModal row={modal.row} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.kind === 'return' && <ReturnModal row={modal.row} suppliers={data?.suppliers ?? []} onClose={() => setModal(null)} onDone={(id) => { setModal(null); load(); if (id) nav(`/admin/books/vouchers/${id}`); }} />}
    </AdminLayout>
  );
}
