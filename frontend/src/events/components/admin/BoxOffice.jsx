import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, ExternalLink, Minus, Plus } from 'lucide-react';
import eventsAPI from '../../../_shared/api/events';
import eventTicketsAPI from '../../../_shared/api/eventTickets';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { Field, FormGrid, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const step = { ...btnGhost, width: 34, height: 34, padding: 0 };

/** Selling at the door: pick the tickets, say whether it is cash into an account or complimentary, and hand over the tickets (each opens its own page with the QR). */
export default function BoxOffice({ eventId, onSold }) {
  const [data, setData] = useState(null);
  const [qty, setQty] = useState({});
  const [mode, setMode] = useState('cash');
  const [ledger, setLedger] = useState('');
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => { eventsAPI.boxOffice(eventId).then((d) => { setData(d); setLedger(d.ledgers[0]?.id ?? ''); }).catch((e) => toast.error(errMsg(e, 'Could not open the box office'))); }, [eventId]);
  const items = useMemo(() => Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => ({ ticket_type_id: Number(id), quantity: n })), [qty]);
  const types = data?.ticket_types ?? [];
  const total = items.reduce((n, i) => n + i.quantity * (types.find((t) => t.id === i.ticket_type_id)?.price ?? 0), 0);
  const paid = mode === 'cash' && total > 0;
  if (!data) return <p style={{ color: colors.textMuted }}>Loading…</p>;

  const sell = async () => {
    setBusy(true);
    try {
      const r = await eventsAPI.sell(eventId, { items, mode, ledger_id: paid ? Number(ledger) : undefined, name: buyer.name || undefined, email: buyer.email || undefined, phone: buyer.phone || undefined });
      setDone(r); toast.success(r.message); onSold?.();
    } catch (e) { toast.error(errMsg(e, 'Could not sell'), { duration: 9000 }); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div role="status" style={{ ...card, padding: 18, display: 'grid', gap: 10, justifyItems: 'center', textAlign: 'center' }}>
        <CheckCircle2 size={34} color="#047857" />
        <strong style={{ fontSize: '1.1rem' }}>{done.message}</strong>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6, width: '100%' }}>
          {done.tickets.map((t) => (
            <li key={t.reference} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: colors.tint(0.08), fontSize: '0.84rem' }}>
              <span>{t.type} · {t.holder_name}</span>
              <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><code style={{ fontWeight: 800 }}>{t.reference}</code>{t.code && <a href={`/tickets/${t.code}`} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, fontWeight: 700, display: 'inline-flex', gap: 3, alignItems: 'center' }}>QR <ExternalLink size={12} /></a>}</span>
            </li>
          ))}
        </ul>
        {done.tickets[0]?.code && <a href={eventTicketsAPI.pdfUrl(done.tickets[0].code)} style={{ ...btnGhost, textDecoration: 'none' }}>Print as PDF</a>}
        <button type="button" style={btnPrimary} onClick={() => { setDone(null); setQty({}); setBuyer({ name: '', email: '', phone: '' }); }}>Sell more</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {types.length === 0 && <p style={{ color: colors.textMuted }}>This event has no tickets switched on.</p>}
      {types.map((t) => {
        const n = qty[t.id] || 0;
        const out = t.remaining === 0;

        return (
          <div key={t.id} style={{ ...card, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, opacity: out ? 0.6 : 1 }}>
            <div><strong>{t.name}</strong><div style={{ fontSize: '0.78rem', color: colors.textMuted }}>{t.price ? t.price.toLocaleString() : 'Free'}{out ? ' · sold out' : t.remaining !== null ? ` · ${t.remaining} left` : ''}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" style={{ ...step, opacity: n ? 1 : 0.4 }} disabled={!n} aria-label={`Fewer ${t.name}`} onClick={() => setQty({ ...qty, [t.id]: n - 1 })}><Minus size={14} /></button>
              <span aria-live="polite" style={{ minWidth: 20, textAlign: 'center', fontWeight: 800 }}>{n}</span>
              <button type="button" style={{ ...step, opacity: out || (t.remaining !== null && n >= t.remaining) ? 0.4 : 1 }} disabled={out || (t.remaining !== null && n >= t.remaining)} aria-label={`More ${t.name}`} onClick={() => setQty({ ...qty, [t.id]: n + 1 })}><Plus size={14} /></button>
            </div>
          </div>
        );
      })}

      {items.length > 0 && (
        <div style={{ ...card, padding: 14, display: 'grid', gap: 12 }}>
          <FormGrid min={180}>
            <Field label="Name (optional)" htmlFor="bo-name"><TextInput id="bo-name" value={buyer.name} maxLength={160} placeholder="Walk-in" onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} /></Field>
            <Field label="Email (to send the tickets)" htmlFor="bo-email"><TextInput id="bo-email" type="email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="bo-phone"><TextInput id="bo-phone" type="tel" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} /></Field>
          </FormGrid>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label="How it is sold">
            {[['cash', 'Sold for money'], ['comp', 'Complimentary']].map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} style={{ ...btnGhost, ...(mode === k ? { background: colors.tint(0.14), border: `1.5px solid ${colors.primary}`, color: colors.primaryDeep } : {}) }}>{l}</button>
            ))}
          </div>
          {paid && (
            <Field label="Money goes into" htmlFor="bo-ledger" hint="The cash or bank account. A normal Cash Sale is booked, with tax if the event's income account carries it.">
              <SelectInput id="bo-ledger" value={ledger} onChange={(e) => setLedger(e.target.value)}>{data.ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput>
            </Field>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <strong>{mode === 'comp' ? 'No charge' : total ? `${total.toLocaleString()} before tax` : 'Free'}</strong>
            <button type="button" style={{ ...btnPrimary, opacity: busy || (paid && !ledger) ? 0.6 : 1 }} disabled={busy || (paid && !ledger)} onClick={sell}>{busy ? 'One moment…' : mode === 'comp' ? 'Give the tickets' : 'Sell'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
