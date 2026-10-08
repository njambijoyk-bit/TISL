import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import { money } from '../../../components/admin/books/booksFmt';
import stockTransfersAPI from '../../../../_shared/api/stockTransfers';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import VariantPicker from '../../../components/admin/pickers/VariantPicker';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

/**
 * Stock transfers: move stock from one branch to another. It is "in transit" — out of the sending branch, not yet in
 * the other — until the receiving branch confirms what arrived. Batches (number, expiry, cost) travel with the stock.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const TONE = { in_transit: '#c2410c', received: '#15803d', cancelled: '#6b7280' };
const LABEL = { in_transit: 'In transit', received: 'Received', cancelled: 'Cancelled' };
const label = (l) => `${l.product}${l.variant && l.variant !== 'Standard' ? ` — ${l.variant}` : ''}`;

function SendModal({ branches, onClose, onDone }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const add = (r) => setItems((xs) => (xs.some((x) => x.variant_id === r.variant_id) ? xs : [...xs, { variant_id: r.variant_id, name: `${r.product}${r.variant && r.variant !== 'Standard' ? ` — ${r.variant}` : ''}`, quantity: 1 }]));
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await stockTransfersAPI.send({ from_location_id: Number(from), to_location_id: Number(to), note: note || undefined, items: items.map((i) => ({ variant_id: i.variant_id, quantity: Number(i.quantity) })) });
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not send the transfer')); } finally { setBusy(false); }
  };
  return (
    <Modal title="New transfer" onClose={onClose} width={640}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="From"><SelectInput required value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
            <Field label="To"><SelectInput required value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose…</option>{branches.filter((b) => String(b.id) !== String(from)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
          </div>
          <VariantPicker onPick={add} />
          {items.map((i) => (
            <div key={i.variant_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: '0.82rem' }}>{i.name}</span>
              <div style={{ width: 110 }}><NumberInput min="0.0001" step="any" required value={i.quantity} aria-label={`Quantity of ${i.name}`} onChange={(e) => setItems((xs) => xs.map((x) => (x.variant_id === i.variant_id ? { ...x, quantity: e.target.value } : x)))} /></div>
              <button type="button" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((x) => x.variant_id !== i.variant_id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={15} /></button>
            </div>
          ))}
          <Field label="Note (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>The stock leaves the sending branch now, first-expiring batches first, and waits in transit until the other branch receives it. Expired or held stock cannot be sent.</p>
          <ModalActions onCancel={onClose} submitLabel="Send" busy={busy} disabled={!items.length} />
        </FormStack>
      </form>
    </Modal>
  );
}

function ReceiveModal({ id, onClose, onDone }) {
  const [t, setT] = useState(null);
  const [got, setGot] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { stockTransfersAPI.show(id).then((d) => { setT(d); setGot(Object.fromEntries(d.lines.map((l) => [l.id, l.quantity]))); }).catch((e) => setErr(errMsg(e, 'Could not load'))); }, [id]);
  const short = t ? t.lines.some((l) => Number(got[l.id]) < l.quantity) : false;
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await stockTransfersAPI.receive(id, Object.fromEntries(Object.entries(got).map(([k, v]) => [k, Number(v)]))); toast.success(res.message); onDone(); }
    catch (x) { setErr(errMsg(x, 'Could not receive')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Receive transfer" subtitle={t ? `${t.number}: ${t.from} → ${t.to}` : ''} onClose={onClose} width={640}>
      {!t ? <p>Loading…</p> : (
        <form onSubmit={go}>
          <FormStack>
            <FormError message={err} />
            {t.lines.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: '0.82rem' }}>{label(l)}<div style={{ fontSize: '0.7rem', color: colors.textFaint }}>batch {l.batch_no ?? '—'}{l.expiry_date ? ` · expires ${String(l.expiry_date).slice(0, 10)}` : ''} · sent {l.quantity}</div></span>
                <div style={{ width: 110 }}><NumberInput min="0" max={l.quantity} step="any" required value={got[l.id] ?? ''} aria-label={`Received ${label(l)}`} onChange={(e) => setGot((g) => ({ ...g, [l.id]: e.target.value }))} /></div>
              </div>
            ))}
            {short && <p style={{ margin: 0, fontSize: '0.78rem', color: '#b91c1c' }}>Anything short is written off as a stock loss.</p>}
            <ModalActions onCancel={onClose} submitLabel="Receive" busy={busy} />
          </FormStack>
        </form>
      )}
    </Modal>
  );
}

export default function StockTransfers() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    stockTransfersAPI.list({ status: status || undefined }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load transfers'))).finally(() => setLoading(false));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const cancel = async (t) => {
    if (!window.confirm(`Cancel ${t.number}? The stock goes back to ${t.from}.`)) return;
    try { const res = await stockTransfersAPI.cancel(t.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not cancel')); }
  };
  const done = () => { setModal(null); load(); };
  // the note opens in its own tab (with a Print button); the PDF is saved to this computer
  const note = async (t, format) => {
    const tab = format === 'html' ? window.open('about:blank', '_blank') : null;   // opened first so the browser does not block it
    try {
      const { blob, name } = await stockTransfersAPI.note(t.id, format);
      const href = URL.createObjectURL(blob);
      if (tab) { tab.location.href = href; } else { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(() => URL.revokeObjectURL(href), 60000);
    } catch (x) { tab?.close(); toast.error(errMsg(x, 'Could not make the transfer note')); }
  };

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="stock transfers" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Stock transfers" description="Move stock between branches. It stays in transit until the other branch receives it." />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '0 0 14px' }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.8rem', fontFamily: 'inherit' }}>
            <option value="">All</option><option value="in_transit">In transit</option><option value="received">Received</option><option value="cancelled">Cancelled</option>
          </select>
          <span style={{ flex: 1 }} />
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ kind: 'send' })}><Plus size={14} /> New transfer</button>}
        </div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {loading ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !(data?.rows?.length) ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No transfers yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Transfer</th><th style={th}>From → To</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Units</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th}>Sent</th><th style={th} /></tr></thead>
              <tbody>{data.rows.map((t) => (
                <tr key={t.id}>
                  <td style={td}><strong>{t.number}</strong>{t.note && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{t.note}</div>}</td>
                  <td style={td}>{t.from} → {t.to}</td>
                  <td style={td}><span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: TONE[t.status] }}>{LABEL[t.status]}</span></td>
                  <td style={{ ...td, textAlign: 'right' }}>{t.quantity}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(t.value)}</td>
                  <td style={td}>{String(t.sent_at).slice(0, 10)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button type="button" style={small} onClick={() => note(t, 'html')}>Note</button>
                    <button type="button" style={small} onClick={() => note(t, 'pdf')}>PDF</button>
                    {canWrite && t.status === 'in_transit' && <button type="button" style={small} onClick={() => setModal({ kind: 'receive', id: t.id })}>Receive</button>}
                    {canWrite && t.status === 'in_transit' && <button type="button" style={small} onClick={() => cancel(t)}>Cancel</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal?.kind === 'send' && <SendModal branches={data?.branches ?? []} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'receive' && <ReceiveModal id={modal.id} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
