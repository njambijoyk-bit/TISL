import { useState } from 'react';
import toast from 'react-hot-toast';
import eventTicketsAPI from '../../../_shared/api/eventTickets';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { whenText } from '../../lib/eventFormat';

const btn = { padding: '8px 16px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' };

/**
 * Handing a ticket back, on the ticket page. A paid ticket: ask staff for a refund (they decide, and the buyer is told); a free one: cancel it at once. It says plainly when it is too late
 * and why, and what staff said if they declined.
 */
export default function RefundBox({ t, event, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const r = t.refund;
  if (t.state === 'cancelled' && r.state === 'approved') return <p style={{ margin: 0, fontSize: '0.82rem', color: '#047857', fontWeight: 700 }}>Refunded. The money is on its way back to you.</p>;
  if (t.state !== 'valid') return null;
  if (r.reason === 'requested') return <p role="status" style={{ margin: 0, fontSize: '0.82rem', color: '#b45309', fontWeight: 700 }}>You asked for a refund. We will tell you what we decide.</p>;

  const go = async () => {
    setBusy(true);
    try { const res = await eventTicketsAPI.refund(t.code, reason); toast.success(res.message); setOpen(false); onDone(); } catch (e) { toast.error(errMsg(e, 'Could not send that'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: 'center', width: '100%' }}>
      {r.state === 'declined' && r.note && <p role="status" style={{ margin: 0, fontSize: '0.8rem', color: '#991b1b' }}>Your last request was declined: {r.note}</p>}
      {(r.can_request || r.can_cancel) && !open && <button type="button" style={btn} onClick={() => setOpen(true)}>{r.can_cancel ? 'Cancel this ticket' : 'Ask for a refund'}</button>}
      {open && (
        <div style={{ display: 'grid', gap: 8, width: '100%', textAlign: 'left' }}>
          {r.can_cancel
            ? <p style={{ margin: 0, fontSize: '0.84rem' }}>This ticket is free. Cancelling it gives your place to someone else, and it can not be undone.</p>
            : <><label htmlFor={`rf-${t.code}`} style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Why? (optional)</label>
              <textarea id={`rf-${t.code}`} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1.5px solid var(--line)', fontFamily: 'inherit', background: 'var(--surface-input, #fff)', color: 'inherit' }} />
              {event.refund_policy && <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-tertiary)', whiteSpace: 'pre-wrap' }}>{event.refund_policy}</p>}</>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy} onClick={go} style={{ ...btn, background: '#b91c1c', border: '1.5px solid #b91c1c', color: '#fff' }}>{busy ? 'One moment…' : r.can_cancel ? 'Yes, cancel it' : 'Send the request'}</button>
            <button type="button" style={btn} onClick={() => setOpen(false)}>Keep my ticket</button>
          </div>
        </div>
      )}
      {!r.can_request && !r.can_cancel && r.reason === 'closed' && <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>The time to ask for a refund{event.refund_until ? ` ended on ${whenText(event.refund_until)}` : ' is over'}.</p>}
      {!r.can_request && !r.can_cancel && r.reason === 'used' && <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>This ticket has been used, so it can not be refunded.</p>}
    </div>
  );
}
