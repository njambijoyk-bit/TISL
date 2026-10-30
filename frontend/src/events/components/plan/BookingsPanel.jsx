import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { eventsBookingAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextArea } from '../../../core/components/admin/ui/Form';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' };
const BOOKING_STATUS = { enquiry: 'Waiting for a quote', quoted: 'Quote received', accepted: 'Accepted: pay the deposit to TISL', confirmed: 'Confirmed', delivered: 'Delivered', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled' };
const money = (n) => (n == null ? '—' : Number(n).toLocaleString());

/** The vendors and venues booked (or asked) for this event: their quotes, what is paid, and the steps that are the planner's to take. */
export default function BookingsPanel({ eventId, canEdit }) {
  const [rows, setRows] = useState(null);
  const [rate, setRate] = useState(null);
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');
  const load = useCallback(() => eventsBookingAPI.forEvent(eventId).then(setRows).catch((e) => toast.error(errMsg(e, 'Could not load the bookings'))), [eventId]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } };
  if (!rows) return <p style={{ color: colors.textMuted, fontSize: '0.84rem' }}>Loading…</p>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: '0.84rem', color: colors.textMuted }}>Find caterers, decorators, photographers and venues in the <Link to="/event-directory/vendors" style={{ color: colors.primary, fontWeight: 700 }}>vendor</Link> and <Link to="/event-directory/venues" style={{ color: colors.primary, fontWeight: 700 }}>venue</Link> directories and ask them for a quote for this event. Deposits and balances are paid to TISL, which holds them until the job is done.</p>
      {rows.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.84rem' }}>No bookings yet.</p>}
      {rows.map((b) => (
        <div key={b.id} style={{ ...card, padding: 14, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong>{b.provider}{b.offer ? ` · ${b.offer}` : ''}</strong>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: colors.primary }}>{BOOKING_STATUS[b.status] ?? b.status}</span>
          </div>
          <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{b.reference} · {b.provider_type} · {b.starts_on}{b.ends_on && b.ends_on !== b.starts_on ? ` to ${b.ends_on}` : ''}{b.guests ? ` · ${b.guests} guests` : ''}</span>
          {b.quoted_amount != null && <span style={{ fontSize: '0.86rem' }}>Quote {money(b.quoted_amount)} · deposit {money(b.deposit_amount)} · paid {money(b.paid)} · still due {money(b.balance_due)}</span>}
          {b.provider_note && <span style={{ fontSize: '0.82rem' }}>“{b.provider_note}”</span>}
          {b.review && <span style={{ fontSize: '0.82rem' }}>You rated this {'★'.repeat(b.review.rating)}</span>}
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {b.status === 'quoted' && <button type="button" style={small} onClick={() => run(() => eventsBookingAPI.accept(b.id), 'Accepted')}>Accept the quote</button>}
              {['delivered', 'confirmed'].includes(b.status) && <button type="button" style={small} onClick={() => run(() => eventsBookingAPI.complete(b.id), 'Confirmed')}>Job is done</button>}
              {b.status === 'completed' && !b.review && <button type="button" style={small} onClick={() => { setRate(b); setStars(5); setText(''); }}>Rate it</button>}
              {['enquiry', 'quoted', 'accepted', 'confirmed'].includes(b.status) && <button type="button" style={{ ...small, color: colors.danger }} onClick={() => run(() => eventsBookingAPI.cancel(b.id), 'Cancelled')}>Cancel</button>}
            </div>
          )}
        </div>
      ))}
      {rate && (
        <Modal title={`Rate ${rate.provider}`} width={420} onClose={() => setRate(null)} footer={<ModalActions onCancel={() => setRate(null)} onSubmit={() => run(async () => { await eventsBookingAPI.review(rate.id, stars, text); setRate(null); }, 'Thank you')} submitLabel="Send" />}>
          <FormStack>
            <Field label="Stars" htmlFor="rv-s"><SelectInput id="rv-s" value={stars} onChange={(e) => setStars(Number(e.target.value))}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</SelectInput></Field>
            <Field label="What was it like?" htmlFor="rv-t"><TextArea id="rv-t" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          </FormStack>
        </Modal>
      )}
    </div>
  );
}
