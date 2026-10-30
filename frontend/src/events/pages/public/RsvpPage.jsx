import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { eventsGuestAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { whenText } from '../../lib/eventFormat';

const input = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', background: 'transparent', color: 'inherit' };
const btn = (on) => ({ padding: '12px 22px', borderRadius: 999, border: `2px solid var(--color-primary-500)`, background: on ? 'var(--color-primary-500)' : 'transparent', color: on ? '#fff' : 'var(--color-primary-500)', fontWeight: 800, cursor: 'pointer', fontSize: '1rem' });

/** A guest's own invitation page (the link in their invitation): will you come, how many, what to eat. No sign-in. */
export default function RsvpPage() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [state, setState] = useState('loading');
  const [rsvp, setRsvp] = useState('');
  const [f, setF] = useState({ attending: 1, meal: '', needs: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    eventsGuestAPI.view(token).then((r) => { setD(r); setState('ok'); setRsvp(r.guest.rsvp === 'pending' ? '' : r.guest.rsvp); setF({ attending: r.guest.attending || 1, meal: r.guest.meal ?? '', needs: r.guest.needs ?? '' }); }).catch(() => setState('missing'));
  }, [token]);

  const send = async () => {
    setBusy(true);
    try { const r = await eventsGuestAPI.respond(token, { rsvp, attending: Number(f.attending) || 1, meal: f.meal || undefined, needs: f.needs || undefined }); setD(r); toast.success('Thank you, your reply is saved.'); }
    catch (e) { toast.error(errMsg(e, 'Could not save your reply')); } finally { setBusy(false); }
  };

  if (state === 'loading') return <main style={{ padding: 32 }}>Loading…</main>;
  if (state === 'missing') return <main style={{ padding: 32 }}>We could not find that invitation. Check the link in your message.</main>;
  const g = d.guest; const e = d.event;
  const max = 1 + g.plus_ones;

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 18 }}>
      <Helmet><title>{`Invitation: ${e.title}`}</title></Helmet>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Dear {g.name},</p>
      <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 900, color: 'var(--color-primary-500)' }}>{e.title}</h1>
      {e.status === 'cancelled' && <p role="alert" style={{ fontWeight: 700, color: '#991b1b' }}>This event has been cancelled.</p>}
      <p style={{ margin: 0 }}>{e.when ? whenText(e.when) : 'Date to be announced'}{e.venue ? ` · ${e.venue}` : ''}{e.address ? `, ${e.address}` : ''}</p>
      {e.map_url && <a href={e.map_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Open the map</a>}
      <h2 style={{ margin: '8px 0 0', fontSize: '1.1rem' }}>Will you come?</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[['yes', 'Yes, I will come'], ['maybe', 'Maybe'], ['no', 'Sorry, I cannot']].map(([k, l]) => <button key={k} type="button" onClick={() => setRsvp(k)} aria-pressed={rsvp === k} style={btn(rsvp === k)}>{l}</button>)}
      </div>
      {rsvp && rsvp !== 'no' && (
        <div style={{ display: 'grid', gap: 10 }}>
          {max > 1 && <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>How many of you (including you)?<select value={f.attending} onChange={(x) => setF({ ...f, attending: x.target.value })} style={input}>{Array.from({ length: max }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>}
          <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>Meal choice<input maxLength={80} value={f.meal} onChange={(x) => setF({ ...f, meal: x.target.value })} style={input} placeholder="e.g. vegetarian" /></label>
          <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>Anything we should know (access, allergies)<input maxLength={300} value={f.needs} onChange={(x) => setF({ ...f, needs: x.target.value })} style={input} /></label>
        </div>
      )}
      {rsvp && <div><button type="button" disabled={busy} onClick={send} style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : g.responded_at ? 'Update my reply' : 'Send my reply'}</button></div>}
      {g.responded_at && <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-tertiary)' }}>You replied on {String(g.responded_at).slice(0, 10)}. You can change your answer here at any time.</p>}
    </main>
  );
}
