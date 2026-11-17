import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { useAuthStore } from '../../_shared/store/index';
import { hasPermission } from '../../_shared/lib/roles';
import { message } from '../lib/format';
import { clock, TIMER_START, timerChanged } from '../lib/timer';
import { Btn } from './ui';

/**
 * The running timer (build 5.6), on every Projects page while it runs: what it is on, how long, Stop and Discard. Alt+T stops it, or on an open
 * piece of work starts one there. Stopping makes a time entry, rounded up to the company's step; what the server warns about is shown.
 */
export default function TimerBar() {
  const user = useAuthStore((s) => s.user);
  const may = hasPermission(user, 'projects.time.log');
  const [t, setT] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { if (may) projectsAPI.timer().then((r) => setT(r?.timer ?? null)).catch(() => setT(null)); }, [may]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!t) return undefined; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [t]);

  const start = useCallback(async (detail) => {
    setBusy(true);
    try {
      const r = await projectsAPI.startTimer(detail);
      if (r.stopped) toast.success(`The last timer logged ${Math.round(r.stopped.minutes)} minutes`);
      setT(r.timer); toast.success('Timer started'); timerChanged();
    } catch (e) { toast.error(message(e, 'The timer could not start.')); } finally { setBusy(false); }
  }, []);
  const stop = useCallback(async () => {
    setBusy(true);
    try {
      const r = await projectsAPI.stopTimer();
      setT(null); timerChanged();
      toast.success(`Logged ${r.stopped.minutes} minutes${r.stopped.capped ? ' (stopped at the daily cap)' : ''}`);
      (r.stopped.warnings ?? []).forEach((w) => toast(w, { icon: '⚠️' }));
    } catch (e) { toast.error(message(e, 'The timer could not stop.')); load(); } finally { setBusy(false); }
  }, [load]);

  useEffect(() => {
    const onStart = (e) => start(e.detail);
    const onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyT' || !may) return;
      e.preventDefault();
      if (t) { stop(); return; }
      const m = window.location.pathname.match(/^\/admin\/projects\/(\d+)/);
      if (m) start({ project_id: Number(m[1]) }); else toast('Open a piece of work to start a timer on it.');
    };
    window.addEventListener(TIMER_START, onStart);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener(TIMER_START, onStart); window.removeEventListener('keydown', onKey, true); };
  }, [t, may, start, stop]);

  if (!t) return null;
  const seconds = t.seconds + Math.max(0, Math.floor((now - Date.parse(t.started_at)) / 1000) - t.seconds);
  return (
    <div role="status" aria-label="Timer running" data-timer style={{ position: 'fixed', right: 'calc(16px + env(safe-area-inset-right, 0px))', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 40,
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, background: 'var(--surface-card)', border: '1px solid var(--line-strong)', boxShadow: '0 10px 30px -12px var(--surface-overlay)', maxWidth: 'calc(100vw - 32px)' }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--status-error)' }} />
      <span style={{ display: 'grid', minWidth: 0 }}>
        <strong style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.task ?? t.project}</strong>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{clock(seconds)}{seconds > t.cap_hours * 3600 ? ' · past the daily cap' : ''}</span>
      </span>
      <Btn small variant="primary" busy={busy} onClick={stop} aria-label="Stop the timer (Alt+T)">Stop</Btn>
      <Btn small variant="quiet" busy={busy} onClick={async () => { await projectsAPI.discardTimer(); setT(null); timerChanged(); toast('Timer thrown away, nothing logged'); }}>Discard</Btn>
    </div>
  );
}
