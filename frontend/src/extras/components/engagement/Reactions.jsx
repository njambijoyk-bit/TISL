import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, Heart, ThumbsUp } from 'lucide-react';
import toast from 'react-hot-toast';
import engagementAPI from '../../../_shared/api/engagement';
import useEngagement from '../../../_shared/lib/engagementConfig';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const plain = { display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, padding: 0, textDecoration: 'none' };

/** A rule that needs a signed-in person sends a guest to the sign-in page instead of showing an error afterwards. */
function useGate(rule) {
  const user = useAuthStore((s) => s.user);

  return Boolean(rule && rule.who !== 'everyone' && !user);
}

/**
 * Like (a heart) or Helpful (a thumb) with its count. Press again to take it back. For a review or comment, pass `initial` ({count, mine}) so the list
 * needs no extra request; for anything else it asks once. Shows nothing when that action is off for this kind of thing.
 */
export function ReactionButton({ type, id, kind = 'like', initial, label }) {
  const eng = useEngagement();
  const rule = eng.rule(type, kind);
  const gate = useGate(rule);
  const [s, setS] = useState(initial ?? null);
  useEffect(() => {
    if (initial || !eng.on(type, kind)) return;
    engagementAPI.reactions(type, id).then((r) => setS(r[kind])).catch(() => setS({ count: 0, mine: false }));
  }, [type, id, kind, eng.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!eng.on(type, kind)) return null;
  const Icon = kind === 'helpful' ? ThumbsUp : Heart;
  const on = Boolean(s?.mine);
  const text = label ?? (kind === 'helpful' ? 'Helpful' : 'Like');
  const look = { color: on ? 'var(--color-primary-500)' : 'var(--text-secondary)' };
  const body = <><Icon size={14} style={{ fill: on ? 'var(--color-primary-500)' : 'transparent' }} /> {text}{s?.count > 0 ? ` · ${s.count}` : ''}</>;
  if (gate) return <Link to="/login" style={{ ...plain, ...look }}>{body}</Link>;
  const press = async () => {
    try { const r = await engagementAPI.react(type, id, kind); setS({ count: r.count, mine: r.on }); } catch (e) { toast.error(errMsg(e, 'That did not work')); }
  };

  return <button type="button" onClick={press} aria-pressed={on} style={{ ...plain, ...look }}>{body}</button>;
}

/** Report something: choose a reason, add a note if you like. Staff then keep it, pull it down or flag it; it is never removed just by being reported. */
export function ReportButton({ type, id, compact = false }) {
  const eng = useEngagement();
  const gate = useGate(eng.rule(type, 'report'));
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', off);

    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  if (!eng.on(type, 'report')) return null;
  const muted = { color: 'var(--text-tertiary)' };
  if (gate) return <Link to="/login" style={{ ...plain, ...muted }}><Flag size={13} />{!compact && ' Report'}</Link>;
  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await engagementAPI.report(type, id, reason, note); toast.success(r.message); setOpen(false); setReason(''); setNote(''); } catch (er) { toast.error(errMsg(er, 'Could not send the report')); } finally { setBusy(false); }
  };

  return (
    <span ref={box} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Report" style={{ ...plain, ...muted }}><Flag size={13} />{!compact && ' Report'}</button>
      {open && (
        <form onSubmit={send} style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 6px)', left: 0, width: 260, padding: 12, borderRadius: 12, display: 'grid', gap: 8, background: 'var(--surface-card)', border: '1px solid var(--line)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
          <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>Why are you reporting this?</strong>
          <select value={reason} onChange={(e) => setReason(e.target.value)} required aria-label="Reason" style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontFamily: 'inherit' }}>
            <option value="">Choose a reason…</option>
            {eng.reasons.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything we should know? (optional)" rows={2} maxLength={500} style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy || !reason} style={{ padding: '7px 14px', borderRadius: 999, border: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, color: '#fff', background: 'var(--color-primary-500)', opacity: reason ? 1 : 0.5 }}>{busy ? 'Sending…' : 'Send report'}</button>
            <button type="button" onClick={() => setOpen(false)} style={{ padding: '7px 14px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)' }}>Cancel</button>
          </div>
        </form>
      )}
    </span>
  );
}
