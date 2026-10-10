import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { Download, ExternalLink, MapPin, Pencil, Video } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import eventTicketsAPI from '../../../_shared/api/eventTickets';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import RefundBox from '../../components/public/RefundBox';
import { whenText } from '../../lib/eventFormat';

const card = { background: 'var(--surface-card, #fff)', borderRadius: 16, border: '1px solid var(--line)', padding: 18, boxShadow: '0 1px 8px rgba(0,0,0,0.05)' };
const STATE = { valid: ['Valid', '#047857', 'rgba(4,120,87,0.1)'], cancelled: ['Cancelled', '#b91c1c', 'rgba(185,28,28,0.1)'], held: ['Waiting for payment', '#b45309', 'rgba(180,83,9,0.1)'], released: ['Not paid', '#6b7280', 'rgba(107,114,128,0.12)'] };

/** One ticket: the name on it, its QR to show at the door, the dates it admits to and, for an online event, the link to join. */
function Ticket({ t, event, onRenamed }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(t.holder_name ?? '');
  const [busy, setBusy] = useState(false);
  const [label, color, bg] = STATE[t.state] ?? STATE.released;
  const save = async () => {
    setBusy(true);
    try { await eventTicketsAPI.rename(t.code, name); toast.success('Saved'); setEditing(false); onRenamed(); } catch (e) { toast.error(errMsg(e, 'Could not save the name')); } finally { setBusy(false); }
  };

  return (
    <article style={{ ...card, display: 'grid', gap: 14, justifyItems: 'center', textAlign: 'center' }} aria-label={`Ticket ${t.reference}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: '1rem' }}>{t.type}</strong>
        <span style={{ padding: '3px 12px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 800, color, background: bg }}>{label}</span>
      </div>
      <div style={{ position: 'relative', width: 'min(100%, 260px)', opacity: t.state === 'valid' ? 1 : 0.25 }}>
        <img src={eventTicketsAPI.qrUrl(t.code)} alt={`QR code of ticket ${t.reference}`} style={{ width: '100%', height: 'auto', display: 'block', background: '#fff', borderRadius: 8 }} />
      </div>
      {t.state !== 'valid' && <p role="alert" style={{ margin: 0, fontWeight: 700, color }}>{t.state === 'cancelled' ? 'This ticket was cancelled and will not be accepted.' : 'This ticket is not valid.'}</p>}
      <code style={{ fontSize: '1.15rem', fontWeight: 900, letterSpacing: '0.2em' }}>{t.reference}</code>
      {editing ? (
        <div style={{ display: 'flex', gap: 8, width: '100%', flexWrap: 'wrap', justifyContent: 'center' }}>
          <input aria-label="Name on the ticket" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 180px', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--line)', fontFamily: 'inherit', background: 'var(--surface-input, #fff)', color: 'inherit' }} />
          <button type="button" disabled={busy || !name.trim()} onClick={save} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--color-primary-500)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Save</button>
          <button type="button" onClick={() => { setEditing(false); setName(t.holder_name ?? ''); }} style={{ padding: '9px 14px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 700 }}>{t.holder_name || 'No name yet'}</span>
          {t.can_rename && <button type="button" onClick={() => setEditing(true)} aria-label="Change the name on this ticket" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-500)', display: 'inline-flex' }}><Pencil size={14} /></button>}
        </div>
      )}
      {t.sessions.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'grid', gap: 2 }}>
          {t.sessions.map((s) => <li key={s.starts_at} style={{ textDecoration: s.is_cancelled ? 'line-through' : 'none' }}>{whenText(s.starts_at)}{s.ends_at ? ` – ${s.ends_at.slice(11, 16)}` : ''}{s.label ? ` · ${s.label}` : ''}{s.is_cancelled ? ' (cancelled)' : ''}</li>)}
        </ul>
      )}
      <RefundBox t={t} event={event} onDone={onRenamed} />
      {t.join_url && <a href={t.join_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '10px 18px', borderRadius: 10, background: 'var(--color-primary-500)', color: '#fff', fontWeight: 800, textDecoration: 'none' }}><Video size={15} /> Join online <ExternalLink size={12} /></a>}
    </article>
  );
}

/** What a ticket link opens: this ticket (and the buyer's others for the same event), each with its QR. Works without signing in. */
export default function TicketPage() {
  const { code } = useParams();
  const [page, setPage] = useState(null);
  const [state, setState] = useState('loading');
  const load = () => eventTicketsAPI.get(code).then((d) => { setPage(d); setState('ok'); }).catch((e) => setState(e?.response?.status === 404 ? 'missing' : 'error'));
  useEffect(() => { load(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const wrap = (children) => (
    <div className="min-h-screen">
      <Helmet><title>{page ? `${page.event.title} | Your tickets` : 'Your tickets'} | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '28px 16px 64px', display: 'grid', gap: 16 }}>{children}</main>
      <Footer />
    </div>
  );
  if (state === 'loading') return wrap(<p style={{ color: 'var(--text-secondary)' }}>Loading…</p>);
  if (state !== 'ok') return wrap(<p style={{ color: 'var(--text-secondary)' }}>{state === 'missing' ? 'We could not find that ticket. Check the link in your email.' : 'We could not load the ticket. Please try again.'} <Link to="/tickets" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Lost your tickets?</Link></p>);

  const { event, tickets } = page;

  return wrap(
    <>
      <header style={{ display: 'grid', gap: 6 }}>
        {event.image_url && <img src={event.image_url} alt="" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 14 }} />}
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{event.title}</h1>
        {event.kind !== 'online' && event.venue_name && (
          <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-secondary)' }}><MapPin size={14} /> {event.venue_name}{event.venue_address ? `, ${event.venue_address}` : ''}
            {event.map_url && <a href={event.map_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Map</a>}</p>
        )}
        {event.status === 'cancelled' && <p role="alert" style={{ ...card, margin: 0, background: 'rgba(185,28,28,0.08)', color: '#991b1b', fontWeight: 700 }}>This event has been cancelled.</p>}
        {event.status === 'postponed' && <p role="alert" style={{ ...card, margin: 0, background: 'rgba(180,83,9,0.1)', color: '#92400e', fontWeight: 700 }}>This event has been postponed. We will tell you the new date.</p>}
        {event.note && <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>{event.note}</p>}
      </header>
      {tickets.map((t) => <Ticket key={t.code} t={t} event={event} onRenamed={load} />)}
      <a href={eventTicketsAPI.pdfUrl(tickets[0].code)} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'center', padding: '12px 18px', borderRadius: 12, border: '1.5px solid var(--line)', color: 'inherit', fontWeight: 800, textDecoration: 'none' }}><Download size={16} /> Download as PDF ({tickets.length} ticket{tickets.length === 1 ? '' : 's'})</a>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>Show the QR code at the door, on your phone or printed. One ticket admits one person. Anyone with this link can see the tickets, so share it only with people you trust.</p>
    </>,
  );
}
