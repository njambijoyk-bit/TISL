import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import posAPI from '../../../../_shared/api/pos';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { printReport } from './printReceipt';

const money = (n) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const field = { padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' };
const overlay = { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.4)', display: 'grid', placeItems: 'center', padding: 16 };

export function OpenShiftDialog({ stationId, stationName, onDone, onCancel }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await posAPI.openShift({ opening_float: Number(amount) || 0, station_id: stationId }); toast.success('Shift open.'); onDone(); } catch (e) { toast.error(errMsg(e, 'Could not open the shift'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-label="Open shift" style={overlay}>
      <div style={{ ...card, padding: 20, width: 'min(360px, 100%)', display: 'grid', gap: 10 }}>
        <strong>Open shift at {stationName}</strong>
        <label style={{ fontSize: '0.8rem', color: colors.textMuted, display: 'grid', gap: 4 }}>Cash in the drawer to start (the float)
          <input style={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btnGhost} onClick={onCancel}>Cancel</button>
          <button type="button" style={btnPrimary} disabled={busy} onClick={go}>Open shift</button>
        </div>
      </div>
    </div>
  );
}

/** The shift so far (X report). Count the drawer to close it; the closed shift shows its Z report. */
export function ShiftDialog({ shiftId, paper, onClose, onClosed }) {
  const [rep, setRep] = useState(null);
  const [counts, setCounts] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { posAPI.shiftReport(shiftId).then(setRep).catch((e) => { toast.error(errMsg(e, 'Could not load the shift')); onClose(); }); }, [shiftId, onClose]);
  if (!rep) return null;

  const open = rep.kind === 'X';
  const close = async () => {
    setBusy(true);
    try {
      const z = await posAPI.closeShift(shiftId, { counted: Object.entries(counts).filter(([, v]) => v !== '').map(([id, v]) => ({ payment_method_id: Number(id), amount: Number(v) || 0 })), note });
      setRep(z); onClosed?.(); toast.success('Shift closed.');
    } catch (e) { toast.error(errMsg(e, 'Could not close the shift'), { duration: 9000 }); } finally { setBusy(false); }
  };
  const line = (l, v, b) => <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: b ? 800 : 400 }}><span>{l}</span><span>{v}</span></div>;

  return (
    <div role="dialog" aria-label="Shift report" style={overlay}>
      <div style={{ ...card, padding: 20, width: 'min(460px, 100%)', display: 'grid', gap: 6, maxHeight: '90vh', overflowY: 'auto', fontSize: '0.88rem' }}>
        <strong>{open ? 'Shift so far (X report)' : 'Shift closed (Z report)'}</strong>
        <div style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{rep.shift.station} · {rep.shift.user} · since {rep.shift.opened_at}</div>
        {line('Opening float', money(rep.shift.opening_float))}
        {line(`Cash sales (${rep.cash_sales.count})`, money(rep.cash_sales.total))}
        {line(`Invoices (${rep.invoices.count})`, money(rep.invoices.total))}
        {line(`Sales orders (${rep.orders.count})`, money(rep.orders.total))}
        {line(`Returns (${rep.returns.count})`, money(rep.returns.total))}
        {line('Refunded', money(rep.refunded))}
        {line('Discounts', money(rep.discounts))}
        {line('Voids', rep.voids)}
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
        {rep.methods.map((m) => (
          <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
            <span>{m.name}<span style={{ color: colors.textMuted, fontSize: '0.75rem' }}> · expected {money(m.expected)}</span></span>
            {open
              ? <input style={{ ...field, width: 120, textAlign: 'right' }} inputMode="decimal" placeholder={m.kind === 'cash' ? 'Count' : 'Optional'} value={counts[m.id] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [m.id]: e.target.value }))} aria-label={`Counted ${m.name}`} />
              : <span>{m.counted != null ? `${money(m.counted)} (${m.difference > 0 ? '+' : ''}${money(m.difference)})` : '-'}</span>}
          </div>
        ))}
        {line('Expected cash in the drawer', money(rep.expected_cash), true)}
        {!open && line(rep.variance === 0 ? 'Balanced' : rep.variance > 0 ? 'Over' : 'Short', money(Math.abs(rep.variance)), true)}
        {open && <input style={field} value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} placeholder="Note (needed if the count is not exact)" aria-label="Note" />}
        {!open && rep.shift.note && <div style={{ color: colors.textMuted }}>Note: {rep.shift.note}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
          <button type="button" style={btnGhost} onClick={() => printReport(rep, paper)}>Print</button>
          <button type="button" style={btnGhost} onClick={onClose}>{open ? 'Back' : 'Done'}</button>
          {open && <button type="button" style={btnPrimary} disabled={busy} onClick={close}>Close shift</button>}
        </div>
      </div>
    </div>
  );
}

/** Shifts the person may handle: their own, and for a supervisor every one at their branches. */
export function ShiftList({ onPick, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { posAPI.shifts().then((r) => setRows(r.shifts)).catch((e) => { toast.error(errMsg(e, 'Could not load shifts')); onClose(); }); }, [onClose]);
  if (!rows) return null;

  return (
    <div role="dialog" aria-label="Shifts" style={overlay}>
      <div style={{ ...card, padding: 18, width: 'min(480px, 100%)', display: 'grid', gap: 8, maxHeight: '80vh', overflowY: 'auto' }}>
        <strong>Shifts</strong>
        {rows.length === 0 && <p style={{ color: colors.textMuted, margin: 0 }}>No shifts yet.</p>}
        {rows.map((s) => (
          <button key={s.id} type="button" style={{ ...btnGhost, textAlign: 'left', display: 'flex', justifyContent: 'space-between' }} onClick={() => onPick(s.id)}>
            <span>{s.station} · {s.user} · {s.opened_at}</span>
            <span>{s.status === 'open' ? 'OPEN' : s.variance === 0 ? 'balanced' : `${s.variance > 0 ? 'over' : 'short'} ${money(Math.abs(s.variance))}`}</span>
          </button>
        ))}
        <button type="button" style={btnPrimary} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
