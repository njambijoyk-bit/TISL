import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Bike, Maximize2, Printer, ShoppingBag, Undo2, Volume2, VolumeX } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { colors } from '../../../_shared/theme/tokens';
import MenusNav from '../../components/MenusNav';
import { printTicket } from '../../lib/ticketPrint';

const POLL_MS = 6000;
const clock = (iso) => new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false });
const btn = (bg, fg = '#fff') => ({ padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.95rem', background: bg, color: fg });
const STATE = { new: ['#334155', 'NEW'], started: ['#b45309', 'COOKING'], ready: ['#047857', 'READY'] };

function Ticket({ t, stationName, canAct, onAct, minutes }) {
  const Icon = t.order_type === 'delivery' ? Bike : ShoppingBag;
  const [bg, label] = STATE[t.status];

  return (
    <article data-ticket={t.number} style={{ background: '#0f172a', color: '#f8fafc', borderRadius: 14, overflow: 'hidden', border: `3px solid ${t.late ? '#ef4444' : bg}`, display: 'grid' }}>
      <header style={{ background: t.late ? '#7f1d1d' : bg, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: '1.1rem' }}>{t.short_no ? `#${t.short_no}` : t.number}{t.round > 1 ? ` · round ${t.round}` : ''}</strong>
        <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{label} · {minutes}m{t.late ? ' LATE' : ''}</span>
      </header>
      <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Icon size={14} aria-hidden="true" /> {t.service ? `${t.service === 'dine_in' ? 'Dine in' : 'Take out'} · ${t.label ?? t.name}` : t.name} · {t.asap ? 'ASAP' : `for ${clock(t.due_at)}`}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: '0 12px 8px', display: 'grid', gap: 8 }}>
        {t.lines.map((l, i) => (
          <li key={i}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{l.quantity} × {l.name}</div>
            {l.options.length > 0 && <div style={{ color: '#fde68a', fontWeight: 700 }}>{l.options.join(' · ')}</div>}
            {l.note && <div style={{ color: '#93c5fd' }}>“{l.note}”</div>}
            {l.allergens.length > 0 && <div style={{ color: '#fca5a5', fontWeight: 800, fontSize: '0.82rem' }}>CONTAINS {l.allergens.join(', ').toUpperCase()}</div>}
          </li>
        ))}
      </ul>
      {t.notes && <div style={{ margin: '0 12px 8px', padding: '6px 10px', borderRadius: 8, background: '#7c2d12', fontWeight: 800 }}>NOTE: {t.notes}</div>}
      <footer style={{ padding: '8px 12px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canAct && t.status === 'new' && <button type="button" style={btn('#d97706')} onClick={() => onAct(t, 'start')}>Start</button>}
        {canAct && t.status !== 'ready' && <button type="button" style={btn('#059669')} onClick={() => onAct(t, 'ready')}>Ready</button>}
        {canAct && t.status !== 'new' && <button type="button" aria-label={`Take ${t.number} back`} style={btn('#334155')} onClick={() => onAct(t, 'recall')}><Undo2 size={16} aria-hidden="true" /></button>}
        <button type="button" aria-label={`Print ${t.number}`} style={btn('#1e293b')} onClick={() => printTicket(t, stationName)}><Printer size={16} aria-hidden="true" /></button>
      </footer>
    </article>
  );
}

function Expo({ data }) {
  return (
    <div data-testid="expo" style={{ display: 'grid', gap: 10 }}>
      {data.orders.length === 0 && <p style={{ color: '#94a3b8' }}>Nothing is being made.</p>}
      {data.orders.map((o) => (
        <div key={o.id} data-expo={o.number} style={{ background: '#0f172a', color: '#f8fafc', borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ minWidth: 90 }}>{o.number}</strong>
          <span style={{ minWidth: 110 }}>{o.name.split(' ')[0]} · {o.order_type === 'delivery' ? 'delivery' : 'pickup'}</span>
          <span style={{ minWidth: 80, color: '#cbd5e1' }}>{o.asap ? 'ASAP' : clock(o.due_at)} · {o.minutes}m</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {o.stations.map((s) => <span key={s.station} style={{ padding: '2px 10px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 800, background: STATE[s.status][0] }}>{s.station}: {STATE[s.status][1].toLowerCase()}</span>)}
            {o.unrouted > 0 && <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 800, background: '#7c2d12' }}>{o.unrouted} item{o.unrouted === 1 ? '' : 's'} on no screen</span>}
          </span>
          {o.status === 'ready' && <strong style={{ color: '#34d399' }}>ALL READY</strong>}
        </div>
      ))}
    </div>
  );
}

/** Menus → Kitchen: one screen per station (what to make, oldest first, with choices, notes and allergens in bold, a timer that turns red), the pass (expo) and a paper ticket as the fallback. It refreshes by itself. */
export default function MenusKitchen() {
  const user = useAuthStore((s) => s.user);
  const canAct = canWriteFinance(user);
  const [stations, setStations] = useState(null);
  const [ready, setReady] = useState(true);
  const [pick, setPick] = useState(null);   // a station id, or 'expo'
  const [data, setData] = useState(null);
  const [loud, setLoud] = useState(false);
  const seen = useRef(null);
  const frame = useRef(null);

  useEffect(() => { menusAPI.stations().then((r) => { setReady(r.ready); setStations(r.stations.filter((s) => s.is_active)); setPick((p) => p ?? r.stations.find((s) => s.is_active)?.id ?? null); }).catch((e) => toast.error(errMsg(e, 'Could not load the kitchen'))); }, []);

  const beep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); o.frequency.value = 880; o.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.25);
    } catch { /* no sound on this device */ }
  }, []);
  const load = useCallback(() => {
    if (pick === null) return Promise.resolve();

    return (pick === 'expo' ? menusAPI.expo() : menusAPI.screen(pick)).then((r) => {
      if (pick !== 'expo') {
        const ids = new Set(r.tickets.map((t) => t.id));
        if (loud && seen.current && [...ids].some((i) => !seen.current.has(i))) beep();
        seen.current = ids;
      }
      setData({ ...r, for: pick });
    }).catch(() => {});
  }, [pick, loud, beep]);
  useEffect(() => { seen.current = null; setData(null); load(); const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load, pick]);  

  const act = async (t, action) => {
    try { await menusAPI.ticket(t.id, action); await load(); } catch (e) { toast.error(errMsg(e, 'Could not change the ticket'), { duration: 8000 }); }
  };
  const elapsed = (t) => t.waited;

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the kitchen screens" /></div></AdminLayout>;
  const station = stations?.find((s) => s.id === pick);

  return (
    <AdminLayout>
      <div ref={frame} style={{ padding: '32px 24px', maxWidth: 1400, margin: '0 auto' }} data-testid="menus-kitchen">
        <MenusNav />
        <HubHeader title="Kitchen" description="One screen for each station, and the pass. This page refreshes by itself: put it on a tablet or a monitor in the kitchen." />
        {stations && !ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 137_menus_kitchen.sql to switch the kitchen screens on.</p>}
        {stations && ready && stations.length === 0 && <p role="status" style={{ color: colors.textMuted }}>No station yet. Add one under Menus → Settings → Kitchen stations (for example Grill, Cold, Bar).</p>}
        {stations && stations.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <div role="tablist" aria-label="Stations" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[...stations, { id: 'expo', name: 'Pass (all stations)' }].map((s) => (
                  <button key={s.id} type="button" role="tab" aria-selected={pick === s.id} onClick={() => setPick(s.id)} style={{ ...btn(pick === s.id ? '#0f172a' : 'transparent', pick === s.id ? '#fff' : 'inherit'), border: '1.5px solid var(--line, #cbd5e1)' }}>{s.name}</button>
                ))}
              </div>
              <button type="button" aria-pressed={loud} aria-label="Sound for new tickets" onClick={() => { setLoud((x) => !x); if (!loud) beep(); }} style={{ ...btn('transparent', 'inherit'), border: '1.5px solid var(--line, #cbd5e1)' }}>{loud ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
              <button type="button" aria-label="Full screen" onClick={() => frame.current?.requestFullscreen?.()} style={{ ...btn('transparent', 'inherit'), border: '1.5px solid var(--line, #cbd5e1)' }}><Maximize2 size={16} /></button>
            </div>
            {(!data || data.for !== pick) && <p style={{ color: colors.textMuted }}>Loading…</p>}
            {data?.for === pick && pick === 'expo' && <Expo data={data} />}
            {data?.for === pick && pick !== 'expo' && (
              <>
                <div data-testid="tickets" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14, alignItems: 'start' }}>
                  {data.tickets.length === 0 && <p style={{ color: colors.textMuted, gridColumn: '1 / -1' }}>Nothing to make at {station?.name} right now.</p>}
                  {data.tickets.map((t) => <Ticket key={t.id} t={t} stationName={station?.name} canAct={canAct} onAct={act} minutes={elapsed(t)} />)}
                </div>
                {data.later.length > 0 && (
                  <details style={{ marginTop: 22 }} data-testid="later">
                    <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Later today · {data.later.length}</summary>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14, marginTop: 12, opacity: 0.8 }}>
                      {data.later.map((t) => <Ticket key={t.id} t={t} stationName={station?.name} canAct={canAct} onAct={act} minutes={elapsed(t)} />)}
                    </div>
                  </details>
                )}
                {data.done.length > 0 && (
                  <details style={{ marginTop: 22 }} data-testid="done">
                    <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Just finished · {data.done.length}</summary>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14, marginTop: 12, opacity: 0.75 }}>
                      {data.done.map((t) => <Ticket key={t.id} t={t} stationName={station?.name} canAct={canAct} onAct={act} minutes={elapsed(t)} />)}
                    </div>
                  </details>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
