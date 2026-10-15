import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import posAPI from '../../../../_shared/api/pos';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { printReport } from './printReceipt';

const money = (n) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const field = { padding: '9px 11px', borderRadius: 8, border: '1.5px solid var(--line)', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' };
/** Counted minus expected: more than expected is over, less is short. */
const overShort = (d) => (Math.abs(d) < 0.005 ? 'balanced' : `${d > 0 ? 'over' : 'short'} ${money(Math.abs(d))}`);

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
      <div style={{ ...card, padding: 20, width: 'min(360px, 100%)', display: 'grid', gap: 10, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}>
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
/**
 * The X report of an open shift (with the count to close it) or the Z report of a closed one. Closing someone else's shift, or one's own without the shift permission, and reopening a
 * closed shift need a supervisor's PIN: ask(purpose, why, then) puts the PIN box up and calls then(approval).
 */
export function ShiftDialog({ shiftId, paper, stationId, meId, canShift, ask, onClose, onClosed }) {
  const [rep, setRep] = useState(null);
  const [counts, setCounts] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState('');
  useEffect(() => { posAPI.shiftReport(shiftId).then(setRep).catch((e) => { toast.error(errMsg(e, 'Could not load the shift')); onClose(); }); }, [shiftId, onClose]);
  if (!rep) return null;

  const open = rep.kind === 'X';
  const cashRow = rep.methods.find((m) => m.kind === 'cash' && m.counted != null);
  const needsPin = rep.shift.user_id !== meId || !canShift;   // the cashier closes their own shift; otherwise a supervisor's PIN
  const doClose = async (token) => {
    setBusy(true);
    try {
      const z = await posAPI.closeShift(shiftId, { counted: Object.entries(counts).filter(([, v]) => v !== '').map(([id, v]) => ({ payment_method_id: Number(id), amount: Number(v) || 0 })), note, approval_token: token, station_id: stationId });
      setRep(z); onClosed?.(); toast.success('Shift closed.');
    } catch (e) { toast.error(errMsg(e, 'Could not close the shift'), { duration: 9000 }); } finally { setBusy(false); }
  };
  const close = () => (needsPin ? ask('close_shift', 'Closing this shift needs a supervisor. Enter their PIN.', (a) => doClose(a.token)) : doClose());
  const doReopen = async (token) => {
    setBusy(true);
    try {
      const x = await posAPI.reopenShift(shiftId, { reason: why, approval_token: token, station_id: stationId });
      setRep(x); setWhy(''); setCounts({}); setNote(''); onClosed?.(); toast.success('Shift reopened.');
    } catch (e) { toast.error(errMsg(e, 'Could not reopen the shift'), { duration: 9000 }); } finally { setBusy(false); }
  };
  const line = (l, v, b) => <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: b ? 800 : 400 }}><span>{l}</span><span>{v}</span></div>;

  return (
    <div role="dialog" aria-label="Shift report" style={overlay}>
      <div style={{ ...card, padding: 20, width: 'min(460px, 100%)', display: 'grid', gap: 6, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', fontSize: '0.88rem' }}>
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
              : <span>{m.counted != null ? `${money(m.counted)} · ${overShort(m.difference)}` : '-'}</span>}
          </div>
        ))}
        {line('Expected cash in the drawer', money(rep.expected_cash), true)}
        {!open && cashRow && line('Cash drawer', overShort(cashRow.difference), true)}
        {!open && rep.methods.some((m) => m.kind !== 'cash' && m.counted != null) && line('All counted methods together', overShort(rep.variance), true)}
        {open && <input style={field} value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} placeholder="Note (needed if the count is not exact)" aria-label="Note" />}
        {!open && rep.shift.note && <div style={{ color: colors.textMuted }}>Note: {rep.shift.note}</div>}
        {!open && <input style={field} value={why} maxLength={255} onChange={(e) => setWhy(e.target.value)} placeholder="Why is it being reopened? (required to reopen)" aria-label="Reason for reopening" />}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6, flexWrap: 'wrap' }}>
          <button type="button" style={btnGhost} onClick={() => printReport(rep, paper)}>Print</button>
          <button type="button" style={btnGhost} onClick={onClose}>{open ? 'Back' : 'Done'}</button>
          {!open && <button type="button" style={{ ...btnGhost, opacity: busy || why.trim().length < 3 ? 0.45 : 1, cursor: busy || why.trim().length < 3 ? 'not-allowed' : 'pointer' }} disabled={busy || why.trim().length < 3} onClick={() => ask('reopen_shift', 'Reopening a shift needs a supervisor. Enter their PIN.', (a) => doReopen(a.token))}>Reopen shift (supervisor PIN)</button>}
          {open && <button type="button" style={btnPrimary} disabled={busy} onClick={close}>{needsPin ? 'Close with supervisor PIN' : 'Close shift'}</button>}
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
      <div style={{ ...card, padding: 18, width: 'min(480px, 100%)', display: 'grid', gap: 8, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}>
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
