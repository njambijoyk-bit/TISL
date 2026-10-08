import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import { money } from '../../../components/admin/books/booksFmt';
import { stockCountsAPI } from '../../../../_shared/api/stockOps';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance, limitBranches } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors, input } from '../../../../_shared/theme/tokens';

/**
 * Stock counts: pick a branch, count what is on its shelves batch by batch, then post. Posting corrects the batches to
 * what was counted and books the net difference (a loss or a gain). Leave a line empty to leave it as it is.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'middle' };
const TONE = { open: '#c2410c', posted: '#15803d', cancelled: '#6b7280' };

function StartModal({ branches, onClose, onDone }) {
  const [loc, setLoc] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await stockCountsAPI.start({ location_id: Number(loc), note: note || undefined }); toast.success(res.message); onDone(res.id); }
    catch (x) { setErr(errMsg(x, 'Could not start the count')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Start a count" onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Branch"><SelectInput required value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Choose…</option>{limitBranches(branches, 'stock').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
          <Field label="Note (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel="Start" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function CountSheet({ id, canWrite, onClose, onChanged }) {
  const nav = useNavigate();
  const [c, setC] = useState(null);
  const [got, setGot] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    stockCountsAPI.show(id).then((d) => { setC(d); setGot(Object.fromEntries(d.lines.map((l) => [l.id, l.counted_qty ?? '']))); }).catch((e) => toast.error(errMsg(e, 'Could not load the count')));
  }, [id]);
  const open = c?.status === 'open' && canWrite;
  const diff = (l) => (got[l.id] === '' || got[l.id] === undefined ? null : Number(got[l.id]) - l.expected_qty);
  const net = c ? c.lines.reduce((t, l) => t + (diff(l) ?? 0) * l.unit_cost, 0) : 0;
  const run = async (fn, okMsg) => {
    setBusy(true);
    try { const res = await fn(); toast.success(res?.message ?? okMsg); onChanged(); return res; } catch (x) {
      const slow = !x?.response || x.response.status >= 500;   // a server error or a timeout: usually the stock rows are locked by another process
      toast.error(slow ? 'This took too long or the server could not finish — the stock may be locked by another process (an unfinished database script?). Nothing was changed. Try again in a minute.' : errMsg(x, 'Could not do that'), { duration: 9000 });
      return null;
    } finally { setBusy(false); }
  };
  return (
    <Modal title={c ? `Count ${c.number}` : 'Count'} subtitle={c ? `${c.location}${c.note ? ` · ${c.note}` : ''}` : ''} onClose={onClose} width={860}>
      {!c ? <p>Loading…</p> : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ overflow: 'auto', maxHeight: '55vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Item</th><th style={th}>Batch</th><th style={{ ...th, textAlign: 'right' }}>Books say</th><th style={{ ...th, width: 110 }}>Counted</th><th style={{ ...th, textAlign: 'right' }}>Difference</th></tr></thead>
              <tbody>{c.lines.map((l) => {
                const d = diff(l);
                return (
                  <tr key={l.id}>
                    <td style={td}>{l.product}{l.variant && l.variant !== 'Standard' ? ` — ${l.variant}` : ''}<div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{l.sku}</div></td>
                    <td style={td}>{l.batch_no ?? '—'}{l.expiry_date ? <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>exp {String(l.expiry_date).slice(0, 10)}</div> : null}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{l.expected_qty}</td>
                    <td style={td}>{open ? <input type="number" min="0" step="any" value={got[l.id] ?? ''} aria-label={`Counted ${l.product} ${l.batch_no ?? ''}`} onChange={(e) => setGot((g) => ({ ...g, [l.id]: e.target.value }))} style={{ ...input, padding: '5px 7px' }} /> : (l.counted_qty ?? '—')}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: d ? (d < 0 ? '#b91c1c' : '#15803d') : colors.textFaint }}>{d === null ? '' : (d > 0 ? '+' : '') + Math.round(d * 10000) / 10000}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          {open && <p style={{ margin: 0, fontSize: '0.8rem' }}>Net difference at cost: <strong style={{ color: net < 0 ? '#b91c1c' : '#15803d' }}>{net < 0 ? '−' : ''}{money(Math.abs(net))}</strong> {net < 0 ? '(a loss)' : net > 0 ? '(a gain)' : ''}</p>}
          {c.status === 'posted' && c.voucher_id && <button type="button" style={{ ...btnGhost, justifySelf: 'start' }} onClick={() => nav(`/admin/books/vouchers/${c.voucher_id}`)}>View the journal</button>}
          {open && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={btnGhost} disabled={busy} onClick={() => run(() => stockCountsAPI.cancel(id)).then(() => onClose())}>{busy ? 'Working…' : 'Cancel count'}</button>
              <button type="button" style={btnGhost} disabled={busy} onClick={() => run(() => stockCountsAPI.save(id, got), 'Saved.')}>{busy ? 'Working…' : 'Save'}</button>
              <button type="button" style={btnPrimary} disabled={busy} onClick={() => { if (window.confirm('Post this count? The batches will be corrected to what you counted.')) run(() => stockCountsAPI.post(id, got)).then((r) => r && onClose()); }}>{busy ? 'Posting…' : 'Post count'}</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function StockCounts() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    stockCountsAPI.list().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load counts'))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="stock counts" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title="Stock counts" description="Count a branch's shelves and correct the books to what is really there." />
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 14px' }}>
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ kind: 'start' })}><Plus size={14} /> Start a count</button>}
        </div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {loading ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !(data?.rows?.length) ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No counts yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Count</th><th style={th}>Branch</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Batches</th><th style={th}>Started</th><th style={th} /></tr></thead>
              <tbody>{data.rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}><strong>{r.number}</strong>{r.note && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{r.note}</div>}</td>
                  <td style={td}>{r.location}</td>
                  <td style={td}><span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: TONE[r.status] }}>{r.status}</span></td>
                  <td style={{ ...td, textAlign: 'right' }}>{r.lines}</td>
                  <td style={td}>{String(r.created_at).slice(0, 10)}</td>
                  <td style={td}><button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }} onClick={() => setModal({ kind: 'sheet', id: r.id })}>{r.status === 'open' && canWrite ? 'Count' : 'View'}</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal?.kind === 'start' && <StartModal branches={data?.branches ?? []} onClose={() => setModal(null)} onDone={(id) => { setModal({ kind: 'sheet', id }); load(); }} />}
      {modal?.kind === 'sheet' && <CountSheet id={modal.id} canWrite={canWrite} onClose={() => setModal(null)} onChanged={load} />}
    </AdminLayout>
  );
}
