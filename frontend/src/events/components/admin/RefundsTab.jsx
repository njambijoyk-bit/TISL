import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, X } from 'lucide-react';
import eventsAPI from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Modal from '../../../core/components/admin/ui/Modal';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import { Field, FormStack, ModalActions, SelectInput, TextArea } from '../../../core/components/admin/ui/Form';
import { Toolbar } from '../../../core/components/admin/ui/HubHeader';
import { formatMoney } from '../../../_shared/lib/money';
import { btnGhost, btnPrimary, colors } from '../../../_shared/theme/tokens';
import { whenText } from '../../lib/eventFormat';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' };

/** Events → Refunds: what buyers have asked for, waiting for a decision. Approving cancels the ticket and puts the money back in the books; declining needs a reason the buyer will read. */
export default function RefundsTab({ onCount }) {
  const [status, setStatus] = useState('pending');
  const [eventId, setEventId] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ask, setAsk] = useState(null);   // {kind: 'approve'|'decline'|'all', row?}
  const [ledger, setLedger] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return eventsAPI.refunds({ status, event_id: eventId || undefined }).then((r) => { setRows(r); if (status === 'pending' && !eventId) onCount?.(r.length); })
      .catch((e) => toast.error(errMsg(e, 'Could not load the refund requests'))).finally(() => setLoading(false));
  }, [status, eventId, onCount]);
  useEffect(() => { load(); }, [load]);

  const events = useMemo(() => [...new Map(rows.filter((r) => r.event).map((r) => [r.event.id, r.event])).values()], [rows]);
  const chosenEvent = events.find((e) => String(e.id) === String(eventId));
  const ledgers = useMemo(() => {
    const src = ask?.row ? [ask.row] : rows.filter((r) => r.status === 'pending');
    return [...new Map(src.flatMap((r) => r.refund?.ledgers ?? []).map((l) => [l.id, l])).values()];
  }, [ask, rows]);

  const open = (kind, row = null) => { setAsk({ kind, row }); setNote(''); setLedger(row?.refund?.default_id ?? rows.find((r) => r.refund)?.refund?.default_id ?? ''); };
  const run = async () => {
    setBusy(true);
    try {
      if (ask.kind === 'approve') toast.success((await eventsAPI.approveRefund(ask.row.id, { refund_ledger_id: ledger ? Number(ledger) : undefined, note: note || undefined })).message);
      else if (ask.kind === 'decline') toast.success((await eventsAPI.declineRefund(ask.row.id, note)).message);
      else { const r = await eventsAPI.approveAllRefunds(Number(eventId), ledger ? Number(ledger) : undefined); toast.success(r.message); if (r.failed.length) toast.error(`${r.failed[0].ticket}: ${r.failed[0].message}`, { duration: 10000 }); }
      setAsk(null); load();
    } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 9000 }); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'event', label: 'Event', render: (r) => <span><strong>{r.event?.title}</strong>{r.event?.status === 'cancelled' && <span style={{ color: colors.danger, fontSize: '0.74rem' }}> · cancelled</span>}</span> },
    { key: 'ticket', label: 'Ticket', render: (r) => <span>{r.ticket?.holder_name || r.ticket?.buyer_name}<br /><span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{r.ticket?.type} · <code>{r.ticket?.reference}</code></span></span> },
    { key: 'buyer', label: 'Buyer', render: (r) => <span style={{ fontSize: '0.78rem' }}>{r.ticket?.buyer_email}<br />{r.ticket?.buyer_phone}</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => formatMoney(r.amount, '', { decimals: 'auto' }) },
    { key: 'reason', label: 'Why', render: (r) => <span style={{ fontSize: '0.78rem' }}>{r.reason ?? '—'}<br /><span style={{ color: colors.textFaint }}>{whenText(r.at)}</span>{r.decision_note ? <><br /><em>{r.decision_note}</em></> : null}</span> },
    { key: 'act', label: '', align: 'right', render: (r) => (r.status === 'pending'
      ? (r.blocked ? <span style={{ fontSize: '0.74rem', color: colors.danger }}>{r.blocked}</span>
        : <span style={{ display: 'inline-flex', gap: 6 }}><button type="button" style={small} onClick={() => open('approve', r)}><Check size={12} /> Approve</button><button type="button" style={{ ...small, color: colors.danger }} onClick={() => open('decline', r)}><X size={12} /> Decline</button></span>)
      : <span style={{ fontSize: '0.76rem', fontWeight: 700, color: r.status === 'approved' ? colors.successText : colors.dangerText }}>{r.status === 'approved' ? 'Refunded' : 'Declined'}</span>) },
  ];

  return (
    <>
      <Toolbar right={status === 'pending' && chosenEvent?.status === 'cancelled' && rows.length > 0 && <button type="button" style={btnPrimary} onClick={() => open('all')}>Refund all {rows.length} for this event</button>}>
        <SelectInput aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}><option value="pending">Waiting for a decision</option><option value="approved">Refunded</option><option value="declined">Declined</option><option value="all">All</option></SelectInput>
        <SelectInput aria-label="Event" value={eventId} onChange={(e) => setEventId(e.target.value)} style={{ width: 'auto' }}><option value="">Every event</option>{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</SelectInput>
      </Toolbar>
      <SimpleTable columns={columns} rows={rows} loading={loading} empty={status === 'pending' ? 'No refund requests are waiting.' : 'Nothing here.'} />
      {ask && (
        <Modal width={480} onClose={() => setAsk(null)}
          title={ask.kind === 'approve' ? 'Approve this refund' : ask.kind === 'decline' ? 'Decline this refund' : `Refund everything waiting for ${chosenEvent?.title}`}
          subtitle={ask.row ? `${ask.row.ticket?.holder_name || ask.row.ticket?.buyer_name} · ${ask.row.ticket?.reference}` : `${rows.length} tickets`}
          footer={<ModalActions onCancel={() => setAsk(null)} onSubmit={run} busy={busy} danger={ask.kind === 'decline'} disabled={ask.kind === 'decline' && !note.trim()} submitLabel={ask.kind === 'decline' ? 'Decline' : 'Refund'} busyLabel="Working…" />}>
          <FormStack>
            {ask.kind !== 'decline' && (
              <>
                <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textBody }}>{ask.kind === 'approve' ? 'The ticket is cancelled, its QR stops working, and the books get a credit note for its price and tax.' : 'Every ticket is cancelled and credited in the books, one by one.'} For a card, send the money back from the provider's dashboard too.</p>
                {ledgers.length > 0 && <Field label="Money goes back from" htmlFor="rf-ledger" hint="Usually the account the payment came in to."><SelectInput id="rf-ledger" value={ledger} onChange={(e) => setLedger(e.target.value)}>{ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>}
              </>
            )}
            {ask.kind !== 'all' && <Field label={ask.kind === 'decline' ? 'Why (the buyer will read this)' : 'A note for the buyer (optional)'} htmlFor="rf-note"><TextArea id="rf-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>}
          </FormStack>
        </Modal>
      )}
    </>
  );
}
